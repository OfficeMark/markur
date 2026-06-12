import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Image as ImageIcon, Lock, Sparkles, Upload, X } from 'lucide-react';
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
  uploadFloorPlan,
  uploadPlanObject,
  validatePlanFile,
  type PlanMime,
} from '@/lib/upload';
import {
  analyzePlan,
  cropForKeys,
  emitSvg,
  keptPathCount,
  producePlate,
  type Bbox,
  type FloorPlanMetadata,
  type PlanPlate,
  type PlanPrepAnalysis,
  type PlanPrepRecipe,
} from '@/lib/plan-prep';
import { renderPdfFirstPage } from '@/lib/plan-prep/preview';
import { floorKeys, useFloor } from '@/hooks/useFloors';
import { useAssets } from '@/hooks/useAssets';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

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
  | { kind: 'review'; file: File; metadata: PdfMetadata | null; warnings: MismatchWarning[] }
  | { kind: 'prep'; file: File; analysis: PlanPrepAnalysis; beforeUrl: string }
  | { kind: 'uploading' }
  | { kind: 'error'; message: string };

/** What the upload mutation should persist. */
type UploadJob =
  | { mode: 'original'; file: File }
  | { mode: 'cleaned'; original: File; plate: PlanPlate; recipe: PlanPrepRecipe };

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

  const upload = useMutation({
    mutationFn: async (job: UploadJob) => {
      if (job.mode === 'original') {
        await uploadFloorPlan(floorId, job.file);
        const path = objectNameForFloor(floorId, job.file.type as PlanMime);
        const { error } = await supabase
          .from('floors')
          // Clear any stale Plan Prep metadata — this is a raw plan now.
          .update({ plan_url: path, plan_metadata: null })
          .eq('id', floorId);
        if (error) throw error;
        return;
      }
      // Cleaned: keep the original alongside the produced plate (non-destructive).
      await uploadFloorPlan(floorId, job.original);
      const cleaned = await uploadPlanObject(floorId, job.plate.blob, job.plate.ext, job.plate.mime);
      const metadata: FloorPlanMetadata = {
        planPrep: { version: 1, recipe: job.recipe, appliedAt: new Date().toISOString() },
      };
      const { error } = await supabase
        .from('floors')
        .update({
          plan_url: cleaned.path,
          // FloorPlanMetadata is JSON-shaped but TS won't infer Json from the
          // interface; the cast is safe (only plain objects/arrays/primitives).
          plan_metadata: metadata as unknown as Json,
          width_px: job.plate.width,
          height_px: job.plate.height,
        })
        .eq('id', floorId);
      if (error) throw error;
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
        // Images skip Plan Prep — single-step review, current behavior.
        setStage({ kind: 'review', file, metadata: null, warnings: [] });
        return;
      }

      try {
        const buf = await file.arrayBuffer();
        // getDocument consumes (detaches) the buffer, so clone per parse.
        const analysis = await analyzePlan(buf.slice(0), { lockedCrop, forceFullPage });
        if (analysis.kind === 'vector') {
          const before = await renderPdfFirstPage(buf.slice(0), 600);
          setStage({ kind: 'prep', file, analysis, beforeUrl: before.url });
        } else {
          // Raster/scanned PDF: nothing to clean — fall through to plain review.
          const metadata = await readPdfMetadata(file);
          const warnings = detectMismatch(metadata, { buildingName, floorLabel });
          setStage({ kind: 'review', file, metadata, warnings });
        }
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

  const isPrep = stage.kind === 'prep';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10',
            isPrep ? 'w-[min(96vw,860px)]' : 'w-[min(92vw,520px)]'
          )}
          aria-describedby="upload-dialog-desc"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">
                {isPrep ? `Clean up ${floorLabel}'s plan` : title}
              </Dialog.Title>
              <Dialog.Description id="upload-dialog-desc" className="mt-1 text-sm text-text-muted">
                {isPrep
                  ? 'We removed the legend, title block, and discipline clutter and cropped to the floor. Use the cleaned plan, or keep your original.'
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
                metadata={stage.metadata}
                warnings={stage.warnings}
                isReplace={isReplace}
                uploading={upload.isPending}
                onCancel={() => setStage({ kind: 'pick' })}
                onConfirm={() => {
                  setStage({ kind: 'uploading' });
                  upload.mutate({ mode: 'original', file: stage.file });
                }}
              />
            )}
            {stage.kind === 'prep' && (
              <PlanPrepPanel
                analysis={stage.analysis}
                beforeUrl={stage.beforeUrl}
                pageWidth={stage.analysis.decompose.pageWidth}
                pageHeight={stage.analysis.decompose.pageHeight}
                busy={upload.isPending}
                onCancel={() => setStage({ kind: 'pick' })}
                onKeepOriginal={() => {
                  setStage({ kind: 'uploading' });
                  upload.mutate({ mode: 'original', file: stage.file });
                }}
                onAccept={async (selection) => {
                  try {
                    setStage({ kind: 'uploading' });
                    const plate = await producePlate(stage.analysis.decompose, selection);
                    const recipe: PlanPrepRecipe = {
                      version: 1,
                      keepKeys: selection.keepKeys,
                      crop: selection.crop,
                      format: selection.format,
                      originalPath: objectNameForFloor(floorId, 'application/pdf'),
                      outputWidth: plate.width,
                      outputHeight: plate.height,
                    };
                    upload.mutate({ mode: 'cleaned', original: stage.file, plate, recipe });
                  } catch (err) {
                    setStage({
                      kind: 'error',
                      message:
                        err instanceof Error
                          ? `Couldn't produce the cleaned plan: ${err.message}`
                          : "Couldn't produce the cleaned plan.",
                    });
                  }
                }}
              />
            )}
            {stage.kind === 'uploading' && <UploadingPanel />}
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
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
          Use cleaned plan
        </Button>
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
        <a
          href="/help#floorplans"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-waymarks-gold hover:underline"
        >
          Full guide to preparing floor plans →
        </a>
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
  metadata: PdfMetadata | null;
  warnings: MismatchWarning[];
  isReplace: boolean;
  uploading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const Icon = props.file.type === 'application/pdf' ? FileText : ImageIcon;
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
      {props.isReplace && (
        <p className="rounded-md border border-info/30 bg-info-bg p-3 text-xs text-info">
          The current plan will be overwritten. Existing pins on this floor are preserved.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={props.onCancel} disabled={props.uploading}>
          Pick a different file
        </Button>
        <Button variant="gold" onClick={props.onConfirm} loading={props.uploading}>
          {props.isReplace ? 'Replace plan' : 'Upload plan'}
        </Button>
      </div>
    </div>
  );
}

function UploadingPanel() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-4 text-sm dark:border-white/10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-waymarks-gold border-t-waymarks-gold" />
      <span>Uploading…</span>
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
