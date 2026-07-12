import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Crop, FileText, Image as ImageIcon, PenTool, Sparkles, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import {
  detectMismatch,
  readPdfMetadata,
  type MismatchWarning,
  type PdfMetadata,
} from '@/lib/pdf-metadata';
import {
  PLAN_MAX_BYTES,
  PLAN_MIME_TYPES,
  formatBytes,
  objectNameForFloor,
  uploadDisplayPlate,
  uploadFloorPlan,
  validatePlanFile,
  type PlanMime,
} from '@/lib/upload';
import {
  cropPlateBlob,
  enhanceScanBlob,
  produceDisplayPlate,
  stampPlanPrep,
  type CropRect,
  type DisplayPlate,
  type FloorPlanMetadata,
  type PlanSource,
} from '@/lib/plan-prep';
import { PlanCropPanel } from '@/components/waymarks/PlanCropPanel';
import { floorKeys } from '@/hooks/useFloors';
import { useAssets } from '@/hooks/useAssets';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

/**
 * Plate production budget. Beyond this we fall back to storing the untouched
 * original (processed:false) — the upload NEVER fails or blocks because
 * enhancement struggled on a huge/complex plan.
 */
const PLATE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('plate-timeout')), ms)
    ),
  ]);
}

/**
 * Plan Redraw lead (v1 = minimal): a prefilled email to OfficeMark. No billing,
 * no order system, no status tracking — it's a lead, not a store.
 */
function redrawMailto(ctx: { buildingName: string; floorLabel: string }): string {
  const subject = `Plan Redraw request — ${ctx.buildingName} · ${ctx.floorLabel}`;
  const body = [
    `I'd like OfficeMark to redraw a floor plan.`,
    ``,
    `Building: ${ctx.buildingName}`,
    `Floor: ${ctx.floorLabel}`,
    ``,
    `(Please attach or describe the source plan. We'll follow up with details.)`,
  ].join('\n');
  return `mailto:hello@officemark.ca?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

type FloorPlanUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  floorLabel: string;
  buildingName: string;
  /** Current plan_url, if any — drives "replace" copy + diff confirmation. */
  existingPlanUrl: string | null;
  /** When provided (e.g. handed off from the Add-Floor modal), the dialog
   * auto-runs the shared upload handler on this file as soon as it opens, so
   * every floor-plan entry point funnels through the same Plan Prep flow. */
  initialFile?: File | null;
};

type Stage =
  | { kind: 'pick' }
  | { kind: 'analyzing'; file: File }
  | {
      kind: 'review';
      file: File;
      source: PlanSource;
      metadata: PdfMetadata | null;
      warnings: MismatchWarning[];
    }
  // Crop-to-plan Enhance: drag a box over the full plate; keeps everything inside.
  | {
      kind: 'enhance-crop';
      file: File;
      source: PlanSource;
      full: DisplayPlate;
      fullUrl: string;
    }
  // Scan/image cleanup Enhance (before/after).
  | {
      kind: 'enhance-scan';
      file: File;
      source: PlanSource;
      beforeUrl: string;
      afterUrl: string;
      enhanced: DisplayPlate;
    }
  | { kind: 'processing'; message: string }
  | { kind: 'error'; message: string };

/** What the upload mutation should persist. */
type UploadJob =
  // Default: produce a capped display PNG here (with timeout + fallback).
  | { mode: 'default'; file: File; source: PlanSource }
  // Enhanced/pre-produced (crop or scan cleanup): the plate is already in hand.
  | {
      mode: 'plate';
      file: File;
      source: PlanSource;
      plate: DisplayPlate;
      enhanced: boolean;
    };

export function FloorPlanUploadDialog({
  open,
  onOpenChange,
  floorId,
  floorLabel,
  buildingName,
  existingPlanUrl,
  initialFile,
}: FloorPlanUploadDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoRanRef = useRef(false);
  const queryClient = useQueryClient();

  // A floor that already has pins must keep its plan's extent so normalized pin
  // coordinates don't drift — so the geometry-changing Enhances (crop, deskew)
  // are only offered on a pin-free floor. The default full-fidelity upload keeps
  // the file's own extent and stays pin-safe.
  const { data: assets } = useAssets(floorId);
  const hasPins = (assets?.length ?? 0) > 0;

  // Reset state when the dialog opens / closes.
  useEffect(() => {
    if (!open) setStage({ kind: 'pick' });
  }, [open]);

  const writeFloorPlan = useCallback(
    async (fields: {
      plan_url: string;
      plan_metadata: FloorPlanMetadata;
      width_px: number | null;
      height_px: number | null;
    }) => {
      const { error } = await supabase
        .from('floors')
        .update({
          plan_url: fields.plan_url,
          // FloorPlanMetadata is JSON-shaped but TS won't infer Json from the
          // interface; the cast is safe (only plain objects/arrays/primitives).
          plan_metadata: fields.plan_metadata as unknown as Json,
          width_px: fields.width_px,
          height_px: fields.height_px,
        })
        .eq('id', floorId);
      if (error) throw error;
    },
    [floorId]
  );

  const upload = useMutation({
    mutationFn: async (job: UploadJob) => {
      // The untouched original is ALWAYS retained as the source of truth.
      await uploadFloorPlan(floorId, job.file);

      // Resolve the display plate: pre-produced (enhanced) or produced here
      // (default), with a hard budget + graceful fallback.
      let plate: DisplayPlate | null;
      let enhanced = false;
      if (job.mode === 'plate') {
        plate = job.plate;
        enhanced = job.enhanced;
      } else {
        plate = await withTimeout(
          produceDisplayPlate(job.file, job.source),
          PLATE_TIMEOUT_MS
        ).catch(() => null);
      }

      if (!plate) {
        // Fallback: serve the untouched original, mark processed:false. Upload
        // never fails just because enhancement struggled.
        const origPath = objectNameForFloor(floorId, job.file.type as PlanMime);
        await writeFloorPlan({
          plan_url: origPath,
          width_px: null,
          height_px: null,
          plan_metadata: {
            planPrep: stampPlanPrep({ processed: false, source: job.source, enhanced: false }),
          },
        });
        return;
      }

      const { path } = await uploadDisplayPlate(floorId, plate.blob);
      await writeFloorPlan({
        plan_url: path,
        width_px: plate.width,
        height_px: plate.height,
        plan_metadata: {
          planPrep: stampPlanPrep({ processed: true, source: job.source, enhanced }),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: floorKeys.detail(floorId) });
      queryClient.invalidateQueries({ queryKey: floorKeys.all });
      onOpenChange(false);
    },
    onError: (err) =>
      setStage({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      }),
  });

  const startDefaultUpload = useCallback(
    (file: File, source: PlanSource) => {
      setStage({ kind: 'processing', message: 'Preparing your floor plan…' });
      upload.mutate({ mode: 'default', file, source });
    },
    [upload]
  );

  const pickFile = useCallback(
    async (file: File) => {
      // Entry marker: distinguishes "handler never ran" (stale bundle / wrong
      // entry point) from "ran but gated off". Dev-only so the prod console
      // stays clean; the entry-points regression test runs in dev mode.
      if (import.meta.env.DEV) {
        console.log('[plan-prep] entry', {
          type: file.type,
          name: file.name,
          size: file.size,
          hasPins,
        });
      }
      const v = validatePlanFile(file);
      if (v) {
        setStage({ kind: 'error', message: v.message });
        return;
      }
      setStage({ kind: 'analyzing', file });

      if (file.type !== 'application/pdf') {
        // Image/SVG: source 'image'. Default Upload produces a capped display
        // PNG; Crop and scan-cleanup Enhances are offered (pin-free floors).
        setStage({ kind: 'review', file, source: 'image', metadata: null, warnings: [] });
        return;
      }

      // PDFs: read metadata for the mismatch warning + label source 'vector'.
      // (We no longer decompose — the default rasterize keeps all content.)
      try {
        const metadata = await readPdfMetadata(file);
        const warnings = detectMismatch(metadata, { buildingName, floorLabel });
        setStage({ kind: 'review', file, source: 'vector', metadata, warnings });
      } catch (err) {
        setStage({
          kind: 'error',
          message:
            err instanceof Error ? `Couldn't read this PDF: ${err.message}` : "Couldn't read this PDF.",
        });
      }
    },
    [buildingName, floorLabel, hasPins]
  );

  // Open the scan cleanup Enhance. Runs on the baked display PNG, so it works
  // uniformly for any upload (image or PDF) with no detector: produce the
  // default plate (before), then clean it up (after) for the comparison.
  const openScanEnhance = useCallback(
    async (file: File, source: PlanSource) => {
      setStage({ kind: 'processing', message: 'Enhancing your plan…' });
      try {
        const before = await produceDisplayPlate(file, source);
        const enhanced = await enhanceScanBlob(before.blob);
        setStage({
          kind: 'enhance-scan',
          file,
          source,
          enhanced,
          beforeUrl: URL.createObjectURL(before.blob),
          afterUrl: URL.createObjectURL(enhanced.blob),
        });
      } catch (err) {
        setStage({
          kind: 'error',
          message: err instanceof Error ? `Couldn't enhance this plan: ${err.message}` : "Couldn't enhance this plan.",
        });
      }
    },
    []
  );

  // Open Crop-to-plan: produce the full display plate and hand it to the crop UI.
  const openCrop = useCallback(async (file: File, source: PlanSource) => {
    setStage({ kind: 'processing', message: 'Preparing your floor plan…' });
    try {
      const full = await produceDisplayPlate(file, source);
      setStage({ kind: 'enhance-crop', file, source, full, fullUrl: URL.createObjectURL(full.blob) });
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? `Couldn't prepare this plan: ${err.message}` : "Couldn't prepare this plan.",
      });
    }
  }, []);

  // Handoff path (e.g. from the Add-Floor modal): auto-run the shared handler on
  // the provided file once, when the dialog opens. Guarantees this entry point
  // goes through the same Plan Prep flow as the on-page Replace.
  useEffect(() => {
    if (!open) {
      autoRanRef.current = false;
      return;
    }
    if (initialFile && !autoRanRef.current) {
      autoRanRef.current = true;
      void pickFile(initialFile);
    }
  }, [open, initialFile, pickFile]);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void pickFile(f);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void pickFile(f);
  };

  const isReplace = !!existingPlanUrl;
  const title = isReplace ? `Replace floor plan for ${floorLabel}` : `Upload floor plan`;
  const description = isReplace
    ? "Replacing a plan keeps existing pins on the floor. Pin coordinates are normalized — they'll appear in the same relative position on the new plan."
    : `Pick a PDF, PNG, JPG, WebP, or SVG of ${floorLabel}'s plan. Up to ${formatBytes(PLAN_MAX_BYTES)}.`;

  const isWide = stage.kind === 'enhance-crop' || stage.kind === 'enhance-scan';
  // Geometry-changing enhances (crop, deskew) only on pin-free floors.
  const canEnhance = !hasPins;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10',
            isWide ? 'w-[min(96vw,860px)]' : 'w-[min(92vw,520px)]'
          )}
          aria-describedby="upload-dialog-desc"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">
                {stage.kind === 'enhance-crop'
                  ? `Crop ${floorLabel}'s plan`
                  : stage.kind === 'enhance-scan'
                    ? `Enhance ${floorLabel}'s plan`
                    : title}
              </Dialog.Title>
              <Dialog.Description id="upload-dialog-desc" className="mt-1 text-sm text-text-muted">
                {stage.kind === 'enhance-crop'
                  ? 'Frame the floor plan to drop the title block, legend, and border. Everything inside the box is kept.'
                  : stage.kind === 'enhance-scan'
                    ? 'Compare the cleaned-up plan with what we have now. Use the enhanced version, or keep the original.'
                    : description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5">
            {stage.kind === 'pick' && (
              <>
                <PickArea
                  dragOver={dragOver}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                />
                <FloorplanExportTips />
              </>
            )}
            {stage.kind === 'analyzing' && <AnalyzingPanel name={stage.file.name} />}
            {stage.kind === 'review' && (
              <ReviewPanel
                file={stage.file}
                source={stage.source}
                metadata={stage.metadata}
                warnings={stage.warnings}
                isReplace={isReplace}
                canEnhance={canEnhance}
                onCancel={() => setStage({ kind: 'pick' })}
                onUpload={() => startDefaultUpload(stage.file, stage.source)}
                onCrop={() => void openCrop(stage.file, stage.source)}
                onCleanScan={() => void openScanEnhance(stage.file, stage.source)}
                redrawHref={redrawMailto({ buildingName, floorLabel })}
              />
            )}
            {stage.kind === 'enhance-crop' && (
              <PlanCropPanel
                imageUrl={stage.fullUrl}
                busy={upload.isPending}
                redrawHref={redrawMailto({ buildingName, floorLabel })}
                onCancel={() => setStage({ kind: 'pick' })}
                onKeepFull={() =>
                  upload.mutate({
                    mode: 'plate',
                    file: stage.file,
                    source: stage.source,
                    plate: stage.full,
                    enhanced: false,
                  })
                }
                onCrop={async (rect: CropRect) => {
                  try {
                    setStage({ kind: 'processing', message: 'Cropping your floor plan…' });
                    const cropped = await cropPlateBlob(stage.full.blob, rect);
                    upload.mutate({
                      mode: 'plate',
                      file: stage.file,
                      source: stage.source,
                      plate: cropped,
                      enhanced: true,
                    });
                  } catch (err) {
                    setStage({
                      kind: 'error',
                      message:
                        err instanceof Error
                          ? `Couldn't crop this plan: ${err.message}`
                          : "Couldn't crop this plan.",
                    });
                  }
                }}
              />
            )}
            {stage.kind === 'enhance-scan' && (
              <ScanEnhancePanel
                beforeUrl={stage.beforeUrl}
                afterUrl={stage.afterUrl}
                busy={upload.isPending}
                redrawHref={redrawMailto({ buildingName, floorLabel })}
                onCancel={() => setStage({ kind: 'pick' })}
                onKeepOriginal={() => startDefaultUpload(stage.file, stage.source)}
                onAccept={() => {
                  setStage({ kind: 'processing', message: 'Saving the enhanced plan…' });
                  upload.mutate({
                    mode: 'plate',
                    file: stage.file,
                    source: stage.source,
                    plate: stage.enhanced,
                    enhanced: true,
                  });
                }}
              />
            )}
            {stage.kind === 'processing' && <ProcessingPanel message={stage.message} />}
            {stage.kind === 'error' && (
              <ErrorPanel message={stage.message} onRetry={() => setStage({ kind: 'pick' })} />
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={PLAN_MIME_TYPES.join(',')}
            className="sr-only"
            onChange={onFileInput}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ComparePane({
  label,
  badge,
  highlight,
  children,
}: {
  label: string;
  badge: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-white',
        highlight ? 'border-waymarks-gold' : 'border-black/10 dark:border-white/10'
      )}
    >
      <div className="flex items-center justify-between border-b border-black/10 bg-surface px-3 py-1.5 text-xs dark:border-white/10">
        <span className="font-medium text-text">{label}</span>
        <span className="text-text-faint">{badge}</span>
      </div>
      <div className="h-56 p-2">{children}</div>
    </div>
  );
}

function PickArea(props: {
  dragOver: boolean;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      className={cn(
        'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
        props.dragOver
          ? 'border-waymarks-gold bg-waymarks-gold-soft'
          : 'border-black/15 hover:border-black/25 dark:border-white/15 dark:hover:border-white/25'
      )}
    >
      <Upload size={28} aria-hidden className="text-waymarks-gold" />
      <span className="font-medium">Drop a plan here, or click to choose</span>
      <span className="text-xs text-text-faint">PDF · PNG · JPG · WEBP · SVG · up to {formatBytes(PLAN_MAX_BYTES)}</span>
    </button>
  );
}

function FloorplanExportTips() {
  return (
    <details className="mt-4 rounded-lg border border-black/10 bg-surface text-sm dark:border-white/10">
      <summary className="cursor-pointer select-none rounded-lg px-3 py-2 font-medium hover:bg-black/5 dark:hover:bg-white/5">
        Floorplan export tips
      </summary>
      <div className="space-y-4 border-t border-black/10 px-3 py-3 text-text-muted dark:border-white/10">
        <section className="space-y-1.5">
          <p className="font-medium text-text">PDF (recommended)</p>
          <ul className="space-y-1 text-xs">
            <li>
              <span className="font-medium text-text">Best for:</span>{' '}
              most floorplans, easiest to mark up later
            </li>
            <li>
              <span className="font-medium text-text">Export settings:</span>{' '}
              {`vector PDF (not rasterized/flattened), single page per floor, actual scale preserved (1:50 or 1:100 metric, or 1/8" = 1'0" imperial)`}
            </li>
            <li>
              <span className="font-medium text-text">Avoid:</span>{' '}
              {`scanned PDFs (lose vector data), multi-floor stacked into one page, PDFs exported "fit to page" (loses scale)`}
            </li>
          </ul>
        </section>
        <section className="space-y-1.5">
          <p className="font-medium text-text">JPG / PNG / WebP (when you only have a photo or scan)</p>
          <ul className="space-y-1 text-xs">
            <li>
              <span className="font-medium text-text">Best for:</span>{' '}
              photos or scans of printed plans
            </li>
            <li>
              <span className="font-medium text-text">Formats:</span>{' '}
              JPG, PNG, and WebP all work — use whichever your export tool produces
            </li>
            <li>
              <span className="font-medium text-text">Export settings:</span>{' '}
              minimum 300dpi, full-floor in one image, capture the scale bar if present
            </li>
            <li>
              <span className="font-medium text-text">Avoid:</span>{' '}
              phone photos taken at an angle, multiple images stitched in the camera roll, anything below 150dpi (illegible at zoom)
            </li>
          </ul>
        </section>
      </div>
    </details>
  );
}

function AnalyzingPanel({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 text-sm dark:border-white/10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-waymarks-gold border-t-waymarks-gold" />
      <span>
        Reading <span className="font-medium">{name}</span>…
      </span>
    </div>
  );
}

function ReviewPanel(props: {
  file: File;
  source: PlanSource;
  metadata: PdfMetadata | null;
  warnings: MismatchWarning[];
  isReplace: boolean;
  canEnhance: boolean;
  onCancel: () => void;
  onUpload: () => void;
  onCrop: () => void;
  onCleanScan: () => void;
  redrawHref: string;
}) {
  const Icon = props.file.type === 'application/pdf' ? FileText : ImageIcon;
  // Scan cleanup runs on the baked plate, so it's offered for any upload
  // (image or PDF) — user-triggered, no detector.
  const showClean = props.canEnhance;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-3 text-sm dark:border-white/10">
        <Icon size={18} aria-hidden className="text-text-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{props.file.name}</p>
          <p className="text-xs text-text-faint">
            {formatBytes(props.file.size)}
            {props.metadata && (
              <>
                {' · '}
                {props.metadata.pageCount} page{props.metadata.pageCount === 1 ? '' : 's'}
                {props.metadata.title ? ` · "${props.metadata.title}"` : ''}
              </>
            )}
          </p>
        </div>
      </div>
      {props.warnings.length > 0 && (
        <ul className="space-y-2 rounded-lg border border-warning/30 bg-warning-bg p-3 text-sm text-warning">
          {props.warnings.map((w) => (
            <li key={w.field} className="flex items-start gap-2">
              <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10">
        We'll prepare a crisp, size-capped image of this plan — with every wall, room,
        and label intact — so the floor opens instantly.
        {props.canEnhance
          ? ' Want to trim the title block and border? Use Crop to plan.'
          : ' This floor already has pins, so the plan keeps its current frame.'}
        {props.isReplace && ' Existing pins on this floor are preserved.'}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlanRedrawLink href={props.redrawHref} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={props.onCancel}>
            Pick a different file
          </Button>
          {showClean && (
            <Button variant="ghost" iconLeft={<Wand2 size={14} aria-hidden />} onClick={props.onCleanScan}>
              Clean up scan
            </Button>
          )}
          {props.canEnhance && (
            <Button variant="ghost" iconLeft={<Crop size={14} aria-hidden />} onClick={props.onCrop}>
              Crop to plan
            </Button>
          )}
          <Button variant="gold" onClick={props.onUpload}>
            {props.isReplace ? 'Replace plan' : 'Upload plan'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Scan/image cleanup Enhance — before/after with Accept / Keep original. */
function ScanEnhancePanel(props: {
  beforeUrl: string;
  afterUrl: string;
  busy: boolean;
  redrawHref: string;
  onCancel: () => void;
  onKeepOriginal: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <ComparePane label="Original" badge="as uploaded">
          <img src={props.beforeUrl} alt="Original plan" className="h-full w-full object-contain" />
        </ComparePane>
        <ComparePane label="Enhanced" badge="deskew · contrast · despeckle" highlight>
          <img src={props.afterUrl} alt="Enhanced plan" className="h-full w-full object-contain" />
        </ComparePane>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <PlanRedrawLink href={props.redrawHref} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel} disabled={props.busy}>
            Pick a different file
          </Button>
          <Button variant="secondary" onClick={props.onKeepOriginal} disabled={props.busy}>
            Keep original
          </Button>
          <Button
            variant="gold"
            loading={props.busy}
            iconLeft={<Sparkles size={14} aria-hidden />}
            onClick={props.onAccept}
          >
            Use enhanced plan
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Quiet Plan Redraw lead — opens a prefilled email. Not a store. */
function PlanRedrawLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-waymarks-gold-deep underline decoration-waymarks-gold/40 underline-offset-2 hover:decoration-waymarks-gold"
    >
      <PenTool size={12} aria-hidden />
      Not clean enough? Have OfficeMark redraw this floor.
    </a>
  );
}

function ProcessingPanel({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 text-sm dark:border-white/10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-waymarks-gold border-t-waymarks-gold" />
      <span>{message}</span>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger">
        <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
