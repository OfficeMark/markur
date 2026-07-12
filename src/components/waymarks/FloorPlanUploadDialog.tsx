import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Image as ImageIcon, Lock, PenTool, Sparkles, Upload, Wand2, X } from 'lucide-react';
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
  analyzePlan,
  cropForKeys,
  emitSvg,
  enhanceScanFile,
  keptPathCount,
  producePlate,
  produceDisplayPlate,
  stampPlanPrep,
  type Bbox,
  type DisplayPlate,
  type FloorPlanMetadata,
  type PlanPlate,
  type PlanPrepAnalysis,
  type PlanPrepRecipe,
  type PlanSource,
} from '@/lib/plan-prep';
import { MAX_PLATE_EDGE, fitScale } from '@/lib/plan-prep/rasterize';
import { renderPdfFirstPage } from '@/lib/plan-prep/preview';
import { floorKeys, useFloor } from '@/hooks/useFloors';
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
 * Ensure a produced plate is a PNG within the output cap. The vector-declutter
 * emitter can rasterize large; the display plate must stay bounded so floor-open
 * serves a bounded image.
 */
async function capToDisplayPlate(plate: PlanPlate): Promise<DisplayPlate> {
  if (Math.max(plate.width, plate.height) <= MAX_PLATE_EDGE) {
    return { blob: plate.blob, width: plate.width, height: plate.height };
  }
  const url = URL.createObjectURL(plate.blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the produced plate.'));
      el.src = url;
    });
    const s = fitScale(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * s));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Could not encode the plate.');
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
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
      /** Present only for vector PDFs — enables the declutter Enhance. */
      analysis: PlanPrepAnalysis | null;
    }
  // Optional vector-declutter Enhance (before/after).
  | { kind: 'enhance-vector'; file: File; analysis: PlanPrepAnalysis; beforeUrl: string }
  // Optional scan/image cleanup Enhance (before/after).
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
  // Enhanced/pre-produced: the plate is already in hand.
  | {
      mode: 'plate';
      file: File;
      source: PlanSource;
      plate: DisplayPlate;
      enhanced: boolean;
      recipe?: PlanPrepRecipe;
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

  // Frame-lock inputs: a floor that already has pins must keep its plan's
  // coordinate frame so normalized pins don't drift. Both queries are already
  // warm (the Floor view populated them), so this adds no network round-trip.
  const { data: floor } = useFloor(floorId);
  const { data: assets } = useAssets(floorId);
  const hasPins = (assets?.length ?? 0) > 0;
  const priorRecipe =
    (floor?.plan_metadata as FloorPlanMetadata | null)?.planPrep?.recipe ?? null;
  const lockedCrop: Bbox | null = hasPins ? (priorRecipe?.crop ?? null) : null;
  const forceFullPage = hasPins && !priorRecipe?.crop;

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
      let recipe: PlanPrepRecipe | undefined;
      if (job.mode === 'plate') {
        plate = job.plate;
        enhanced = job.enhanced;
        recipe = job.recipe;
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
          planPrep: stampPlanPrep({ processed: true, source: job.source, enhanced, recipe }),
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
          forceFullPage,
        });
      }
      const v = validatePlanFile(file);
      if (v) {
        setStage({ kind: 'error', message: v.message });
        return;
      }
      setStage({ kind: 'analyzing', file });

      if (file.type !== 'application/pdf') {
        // Image/SVG: source 'image', no PDF analysis. The default Upload
        // produces a capped display PNG; scan-cleanup Enhance is offered.
        setStage({ kind: 'review', file, source: 'image', metadata: null, warnings: [], analysis: null });
        return;
      }

      try {
        const buf = await file.arrayBuffer();
        // getDocument consumes (detaches) the buffer, so clone per parse.
        const analysis = await analyzePlan(buf.slice(0), { lockedCrop, forceFullPage });
        const source: PlanSource = analysis.kind === 'vector' ? 'vector' : 'scan';
        const metadata = await readPdfMetadata(file);
        const warnings = detectMismatch(metadata, { buildingName, floorLabel });
        // Vector PDFs also get the optional declutter Enhance; raster PDFs get
        // the scan-cleanup Enhance. Either way, the DEFAULT is a capped PNG.
        setStage({
          kind: 'review',
          file,
          source,
          metadata,
          warnings,
          analysis: analysis.kind === 'vector' ? analysis : null,
        });
      } catch (err) {
        setStage({
          kind: 'error',
          message:
            err instanceof Error ? `Couldn't read this PDF: ${err.message}` : "Couldn't read this PDF.",
        });
      }
    },
    [buildingName, floorLabel, lockedCrop, forceFullPage, hasPins]
  );

  // Open the scan/image cleanup Enhance: produce both the default plate (before)
  // and the enhanced plate (after) for the comparison.
  const openScanEnhance = useCallback(
    async (file: File, source: PlanSource) => {
      setStage({ kind: 'processing', message: 'Enhancing your plan…' });
      try {
        const [before, enhanced] = await Promise.all([
          produceDisplayPlate(file, source),
          enhanceScanFile(file),
        ]);
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

  // Open the vector declutter Enhance (before/after).
  const openVectorEnhance = useCallback(async (file: File, analysis: PlanPrepAnalysis) => {
    setStage({ kind: 'processing', message: 'Preparing the comparison…' });
    try {
      const before = await renderPdfFirstPage(await file.arrayBuffer(), 600);
      setStage({ kind: 'enhance-vector', file, analysis, beforeUrl: before.url });
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? `Couldn't read this PDF: ${err.message}` : "Couldn't read this PDF.",
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

  const isWide = stage.kind === 'enhance-vector' || stage.kind === 'enhance-scan';

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
                {isWide ? `Enhance ${floorLabel}'s plan` : title}
              </Dialog.Title>
              <Dialog.Description id="upload-dialog-desc" className="mt-1 text-sm text-text-muted">
                {isWide
                  ? 'Compare the cleaned-up plan with what we have now. Use the enhanced version, or keep the original — your call.'
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
                canEnhance={stage.source !== 'vector' || !!stage.analysis}
                onCancel={() => setStage({ kind: 'pick' })}
                onUpload={() => startDefaultUpload(stage.file, stage.source)}
                onEnhance={() => {
                  if (stage.source === 'vector' && stage.analysis) {
                    void openVectorEnhance(stage.file, stage.analysis);
                  } else {
                    void openScanEnhance(stage.file, stage.source);
                  }
                }}
                redrawHref={redrawMailto({ buildingName, floorLabel })}
              />
            )}
            {stage.kind === 'enhance-vector' && (
              <PlanPrepPanel
                analysis={stage.analysis}
                beforeUrl={stage.beforeUrl}
                pageWidth={stage.analysis.decompose.pageWidth}
                pageHeight={stage.analysis.decompose.pageHeight}
                busy={upload.isPending}
                redrawHref={redrawMailto({ buildingName, floorLabel })}
                onCancel={() => setStage({ kind: 'pick' })}
                onKeepOriginal={() => startDefaultUpload(stage.file, 'vector')}
                onAccept={async (selection) => {
                  try {
                    setStage({ kind: 'processing', message: 'Producing the enhanced plan…' });
                    const plate = await capToDisplayPlate(
                      await producePlate(stage.analysis.decompose, { ...selection, format: 'png' })
                    );
                    const recipe: PlanPrepRecipe = {
                      version: 1,
                      keepKeys: selection.keepKeys,
                      crop: selection.crop,
                      format: 'png',
                      originalPath: objectNameForFloor(floorId, 'application/pdf'),
                      outputWidth: plate.width,
                      outputHeight: plate.height,
                    };
                    upload.mutate({ mode: 'plate', file: stage.file, source: 'vector', plate, enhanced: true, recipe });
                  } catch (err) {
                    setStage({
                      kind: 'error',
                      message:
                        err instanceof Error
                          ? `Couldn't produce the enhanced plan: ${err.message}`
                          : "Couldn't produce the enhanced plan.",
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

function PlanPrepPanel(props: {
  analysis: PlanPrepAnalysis;
  beforeUrl: string;
  pageWidth: number;
  pageHeight: number;
  busy: boolean;
  redrawHref: string;
  onCancel: () => void;
  onKeepOriginal: () => void;
  onAccept: (selection: { keepKeys: string[]; crop: Bbox; format: 'svg' | 'png' }) => void;
}) {
  const { analysis, beforeUrl, pageWidth, pageHeight, busy } = props;
  const groups = analysis.decompose.groups;

  const [keepKeys, setKeepKeys] = useState<string[]>(() =>
    analysis.autoArchKey ? [analysis.autoArchKey] : groups.map((g) => g.key)
  );
  const [showColors, setShowColors] = useState(false);

  // When unlocked, the crop follows the kept groups; when locked, it's frozen.
  const crop: Bbox = useMemo(() => {
    if (analysis.cropLocked) return analysis.autoCrop;
    return cropForKeys(groups, keepKeys, pageWidth, pageHeight);
  }, [analysis.cropLocked, analysis.autoCrop, groups, keepKeys, pageWidth, pageHeight]);

  const keptCount = useMemo(
    () => keptPathCount({ groups, keepKeys, crop }),
    [groups, keepKeys, crop]
  );
  const format: 'svg' | 'png' = keptCount > 20_000 ? 'png' : 'svg';

  // Build the AFTER preview from the current selection (always vector SVG —
  // cheap, regardless of the final output format).
  const afterUrl = useObjectUrl(
    useMemo(() => emitSvg({ groups, keepKeys, crop }), [groups, keepKeys, crop])
  );

  const toggleKey = (key: string) =>
    setKeepKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const canAccept = keptCount > 0 && !busy;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <ComparePane label="Original" badge={`${analysis.decompose.totalPaths.toLocaleString()} shapes`}>
          <img src={beforeUrl} alt="Original uploaded plan" className="h-full w-full object-contain" />
        </ComparePane>
        <ComparePane
          label="Cleaned"
          badge={`${keptCount.toLocaleString()} shapes · ${format.toUpperCase()}`}
          highlight
        >
          {afterUrl ? (
            <img src={afterUrl} alt="Cleaned floor plate preview" className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-faint">
              Nothing kept — choose at least one color group.
            </div>
          )}
        </ComparePane>
      </div>

      {analysis.cropLocked ? (
        <p className="flex items-start gap-2 rounded-md border border-info/30 bg-info-bg p-3 text-xs text-info">
          <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            This floor has pins, so the plan keeps its current frame. We can declutter and recolor,
            but the crop is locked to keep every pin in place.
          </span>
        </p>
      ) : analysis.autoArchKey === null ? (
        <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg p-3 text-xs text-warning">
          <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            We couldn't confidently spot the architectural layer. Pick which color groups to keep
            below.
          </span>
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowColors((s) => !s)}
        className="text-xs font-medium text-text-muted underline-offset-2 hover:text-text hover:underline dark:hover:text-white"
      >
        {showColors ? 'Hide color groups' : 'Adjust colors'}
      </button>
      {showColors && (
        <ColorGroupPicker groups={groups} keepKeys={keepKeys} onToggle={toggleKey} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <PlanRedrawLink href={props.redrawHref} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel} disabled={busy}>
            Pick a different file
          </Button>
          <Button variant="secondary" onClick={props.onKeepOriginal} disabled={busy}>
            Keep original
          </Button>
          <Button
            variant="gold"
            loading={busy}
            disabled={!canAccept}
            iconLeft={<Sparkles size={14} aria-hidden />}
            onClick={() => props.onAccept({ keepKeys, crop, format })}
          >
            Use enhanced plan
          </Button>
        </div>
      </div>
    </div>
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

function ColorGroupPicker({
  groups,
  keepKeys,
  onToggle,
}: {
  groups: PlanPrepAnalysis['decompose']['groups'];
  keepKeys: string[];
  onToggle: (key: string) => void;
}) {
  // Show the most significant groups; trivial buckets just add noise.
  const shown = groups.filter((g) => g.pathCount >= 3).slice(0, 16);
  return (
    <ul className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-md border border-black/10 p-2 dark:border-white/10">
      {shown.map((g) => {
        const kept = keepKeys.includes(g.key);
        return (
          <li key={g.key}>
            <button
              type="button"
              onClick={() => onToggle(g.key)}
              aria-pressed={kept}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                kept
                  ? 'border-waymarks-gold bg-waymarks-gold-soft'
                  : 'border-black/10 opacity-60 hover:opacity-100 dark:border-white/10'
              )}
            >
              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded border border-black/20"
                style={{ backgroundColor: `rgb(${g.color[0]}, ${g.color[1]}, ${g.color[2]})` }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-text">{kept ? 'Keep' : 'Drop'}</span>
                <span className="text-text-faint">{g.pathCount.toLocaleString()} shapes</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Create an object URL for a string/blob and revoke it on change/unmount. */
function useObjectUrl(svg: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [svg]);
  return url;
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
  onEnhance: () => void;
  redrawHref: string;
}) {
  const Icon = props.file.type === 'application/pdf' ? FileText : ImageIcon;
  const enhanceLabel = props.source === 'vector' ? 'Enhance — declutter' : 'Enhance — clean up';
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
        We'll prepare a crisp, size-capped image of this plan so the floor opens instantly —
        no rendering when you view it later.
        {props.source !== 'vector' && ' Scanned or photographed plan? Try Enhance to clean it up.'}
        {props.isReplace && ' Existing pins on this floor are preserved.'}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PlanRedrawLink href={props.redrawHref} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={props.onCancel}>
            Pick a different file
          </Button>
          {props.canEnhance && (
            <Button variant="ghost" iconLeft={<Wand2 size={14} aria-hidden />} onClick={props.onEnhance}>
              {enhanceLabel}
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
      className="inline-flex items-center gap-1.5 text-xs text-text-muted underline-offset-2 hover:text-waymarks-gold hover:underline"
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
