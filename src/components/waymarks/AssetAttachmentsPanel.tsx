import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileText,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useAddAssetAttachment,
  useAssetAttachments,
  useDeleteAssetAttachment,
  type AssetAttachment,
} from '@/hooks/useAssetAttachments';
import {
  signedAttachmentUrl,
  validateAttachmentFile,
} from '@/lib/queries/asset-attachments';

/**
 * Attachments panel inside the AssetDrawer (M18b).
 *
 * PDFs / Office docs / images attached to an asset for vendor cut sheets,
 * install instructions, warranty paperwork, etc. List sorted by most-
 * recent first; click "View" to open in a new tab via signed URL (15-min
 * TTL). Edit users get the upload + delete affordances.
 */
export type AssetAttachmentsPanelProps = {
  assetId: string;
  canEdit: boolean;
};

export function AssetAttachmentsPanel({ assetId, canEdit }: AssetAttachmentsPanelProps) {
  const list = useAssetAttachments(assetId);
  const add = useAddAssetAttachment(assetId);
  const remove = useDeleteAssetAttachment(assetId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const arr = Array.from(files);
    for (const f of arr) {
      const v = validateAttachmentFile(f);
      if (v) {
        setError(v);
        return;
      }
    }
    try {
      // Upload sequentially so created_at order is meaningful.
      for (const f of arr) {
        await add.mutateAsync(f);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  const items = list.data ?? [];
  const empty = !list.isLoading && items.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <Paperclip size={11} aria-hidden /> Attachments
        </p>
        {canEdit && (
          <>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.txt,.csv,.mp4,.mov,.webm"
              className="hidden"
              onChange={(e) => {
                void onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={add.isPending}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2.5 text-[11px] font-medium text-text hover:bg-black/5 disabled:opacity-60 dark:border-white/15 dark:hover:bg-white/5"
            >
              <Upload size={11} aria-hidden />
              {add.isPending ? 'Uploading…' : 'Attach'}
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
          <AlertCircle size={11} aria-hidden className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {empty && (
        <p className="rounded-md border border-dashed border-black/10 bg-bg p-3 text-xs text-text-muted dark:border-white/10">
          {canEdit
            ? 'No files attached. Drop in cut sheets, install instructions, or warranty docs.'
            : 'No files attached.'}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((att) => (
            <AttachmentRow
              key={att.id}
              att={att}
              canEdit={canEdit}
              onDelete={() => void remove.mutateAsync(att)}
              busy={remove.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================

function AttachmentRow({
  att,
  canEdit,
  onDelete,
  busy,
}: {
  att: AssetAttachment;
  canEdit: boolean;
  onDelete: () => void;
  busy: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSignedUrl(null);
    setUrlError(false);
    void signedAttachmentUrl(att.path)
      .then((u) => {
        if (!cancelled) setSignedUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrlError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [att.path]);

  return (
    <li className="flex items-center gap-2 rounded-md border border-black/10 bg-bg p-2 text-xs dark:border-white/10">
      <FileText size={14} aria-hidden className="shrink-0 text-text-faint" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{att.filename}</p>
        <p className="text-[11px] text-text-faint">
          {formatBytes(att.size_bytes)} · {formatRelative(att.created_at)}
        </p>
      </div>
      {urlError ? (
        <span className="text-[11px] text-danger">link expired</span>
      ) : signedUrl ? (
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-black/15 bg-surface px-2 text-[11px] font-medium text-text hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          <Download size={11} aria-hidden />
          View
        </a>
      ) : (
        <span className="text-[11px] text-text-faint">…</span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${att.filename}`}
          className="rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-30"
        >
          <Trash2 size={11} aria-hidden />
        </button>
      )}
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-CA', { dateStyle: 'medium' });
}
