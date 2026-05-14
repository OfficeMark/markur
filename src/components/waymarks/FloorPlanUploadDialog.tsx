import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Image as ImageIcon, Upload, X } from 'lucide-react';
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
  uploadFloorPlan,
  validatePlanFile,
} from '@/lib/upload';
import { floorKeys } from '@/hooks/useFloors';
import { cn } from '@/lib/utils';

type FloorPlanUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  floorId: string;
  floorLabel: string;
  buildingName: string;
  /** Current plan_url, if any — drives "replace" copy + diff confirmation. */
  existingPlanUrl: string | null;
};

type Stage =
  | { kind: 'pick' }
  | { kind: 'analyzing'; file: File }
  | { kind: 'review'; file: File; metadata: PdfMetadata | null; warnings: MismatchWarning[] }
  | { kind: 'uploading' }
  | { kind: 'error'; message: string };

export function FloorPlanUploadDialog({
  open,
  onOpenChange,
  floorId,
  floorLabel,
  buildingName,
  existingPlanUrl,
}: FloorPlanUploadDialogProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  // Reset state when the dialog opens / closes.
  useEffect(() => {
    if (!open) setStage({ kind: 'pick' });
  }, [open]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      await uploadFloorPlan(floorId, file);
      const path = `${floorId}.${extFromMime(file.type)}`;
      const { error } = await supabase
        .from('floors')
        .update({ plan_url: path })
        .eq('id', floorId);
      if (error) throw error;
      return path;
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
      const v = validatePlanFile(file);
      if (v) {
        setStage({ kind: 'error', message: v.message });
        return;
      }
      setStage({ kind: 'analyzing', file });
      if (file.type === 'application/pdf') {
        try {
          const metadata = await readPdfMetadata(file);
          const warnings = detectMismatch(metadata, {
            buildingName,
            floorLabel,
          });
          setStage({ kind: 'review', file, metadata, warnings });
        } catch (err) {
          setStage({
            kind: 'error',
            message:
              err instanceof Error
                ? `Couldn't parse this PDF: ${err.message}`
                : "Couldn't parse this PDF.",
          });
        }
      } else {
        // Images skip metadata. Single-step review with no warnings.
        setStage({ kind: 'review', file, metadata: null, warnings: [] });
      }
    },
    [buildingName, floorLabel]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void pickFile(f);
    // Reset so picking the same file twice still triggers onChange.
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
    ? 'Replacing a plan keeps existing pins on the floor. Pin coordinates are normalized — they\'ll appear in the same relative position on the new plan.'
    : `Pick a PDF, PNG, JPG, or SVG of ${floorLabel}'s plan. Up to ${formatBytes(PLAN_MAX_BYTES)}.`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10"
          aria-describedby="upload-dialog-desc"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-semibold text-xl">{title}</Dialog.Title>
              <Dialog.Description id="upload-dialog-desc" className="mt-1 text-sm text-text-muted">
                {description}
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
                  upload.mutate(stage.file);
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
      <span className="text-xs text-text-faint">PDF · PNG · JPG · SVG · up to {formatBytes(PLAN_MAX_BYTES)}</span>
    </button>
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

function extFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/svg+xml') return 'svg';
  return 'jpg';
}
