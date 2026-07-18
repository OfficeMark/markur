import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAssetAuditVideos,
  useBuildingAuditVideos,
  useDeleteAuditVideo,
  type AuditVideo,
} from '@/hooks/useAuditVideos';
import { signedAuditVideoUrl } from '@/lib/queries/audit-videos';
import { useCan } from '@/lib/permissions-context';
import { cn } from '@/lib/utils';

/**
 * Lists audit videos for either a single asset (assetId set) or the
 * building as a whole (assetId null). Each row renders an HTML5 video with
 * a 60-min signed URL. Delete is gated on edit permission via useCan.
 */

export type AuditVideosPanelProps = {
  buildingId: string;
  /** When set, scopes the list to this asset's videos only. */
  assetId?: string | null;
  /** Triggered by the parent's "Record video" button. */
  onRecordClick?: () => void;
  /**
   * Feature #3c: render as a secondary action inside another band (e.g. Media)
   * rather than its own "Audit videos" group — drops the big h3 header but
   * keeps record / playback / delete intact.
   */
  compact?: boolean;
};

export function AuditVideosPanel({
  buildingId,
  assetId,
  onRecordClick,
  compact,
}: AuditVideosPanelProps) {
  const assetQuery = useAssetAuditVideos(assetId ?? undefined);
  const buildingQuery = useBuildingAuditVideos(assetId ? undefined : buildingId);
  const query = assetId ? assetQuery : buildingQuery;

  const videos = query.data ?? [];
  const isLoading = query.isPending && (assetId ? !!assetId : true);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        {compact ? (
          <span className="flex items-center gap-1.5 text-[11px] text-text-faint">
            <Video size={12} aria-hidden className="text-waymarks-gold" />
            Video {videos.length > 0 && <span className="text-text-muted">({videos.length})</span>}
          </span>
        ) : (
          <h3 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Video size={12} aria-hidden className="text-waymarks-gold" />
            Audit videos {videos.length > 0 && <span className="ml-1 text-text-muted">({videos.length})</span>}
          </h3>
        )}
        {onRecordClick && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onRecordClick}
            iconLeft={<Video size={12} aria-hidden />}
          >
            Record
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-text-faint">Loading…</p>
      )}

      {!isLoading && videos.length === 0 && (
        <p className="text-xs text-text-faint">
          No videos yet. {onRecordClick && 'Tap Record to capture a short clip.'}
        </p>
      )}

      {videos.length > 0 && (
        <ul className="space-y-3">
          {videos.map((v) => (
            <VideoRow key={v.id} video={v} buildingId={buildingId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function VideoRow({ video, buildingId }: { video: AuditVideo; buildingId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const canEdit = useCan('edit', { type: 'building', id: buildingId });
  const del = useDeleteAuditVideo(buildingId);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setUrlError(null);
    void signedAuditVideoUrl(video.storage_path)
      .then((u) => !cancelled && setUrl(u))
      .catch((e) => {
        if (cancelled) return;
        setUrlError(e instanceof Error ? e.message : 'Could not load video');
      });
    return () => {
      cancelled = true;
    };
  }, [video.storage_path]);

  const recorded = new Date(video.recorded_at);

  return (
    <li className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <div className="bg-black">
        {url ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- field-shot audit clips don't have captions
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-xs text-white/70">
            {urlError ? urlError : 'Loading video…'}
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3 p-3 text-xs">
        <div className="space-y-1">
          <p className="text-text-muted">
            <time dateTime={video.recorded_at} title={format(recorded, 'PPpp')}>
              {format(recorded, 'PP')}
            </time>
            {video.duration_seconds != null && (
              <span className="ml-2 text-text-faint">
                {formatDuration(video.duration_seconds)}
              </span>
            )}
            {!video.asset_id && (
              <span className="ml-2 rounded-full bg-waymarks-gold-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-waymarks-gold">
                Building
              </span>
            )}
          </p>
          {video.notes && <p className="whitespace-pre-wrap text-text">{video.notes}</p>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              if (confirmDelete) {
                del.mutate(video);
              } else {
                setConfirmDelete(true);
                window.setTimeout(() => setConfirmDelete(false), 4000);
              }
            }}
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px]',
              confirmDelete
                ? 'bg-danger text-white'
                : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5'
            )}
            aria-label={confirmDelete ? 'Confirm delete' : 'Delete video'}
          >
            <Trash2 size={11} aria-hidden />
            {confirmDelete ? 'Confirm' : 'Delete'}
          </button>
        )}
      </div>
    </li>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}
