import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Circle, RotateCcw, Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAddAuditVideo } from '@/hooks/useAuditVideos';
import {
  AUDIT_VIDEO_BITRATE,
  AUDIT_VIDEO_MAX_DURATION_SECONDS,
} from '@/lib/queries/audit-videos';

/**
 * In-app field recording for audit videos (M27). Uses MediaRecorder against
 * the device camera + mic. Caps at 3 min / 1.5 Mbps per the briefing —
 * those numbers are owner-set, not adjustable here.
 *
 * Flow: idle → recording → preview → uploading → done. Cancel from any
 * stage tears down the MediaStream and discards the blob.
 *
 * Stays a separate component so the dialog can be reused by the asset
 * drawer (assetId set) and the building/floor view (assetId null) without
 * duplicating recorder state.
 */

type Stage = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading';

export type AuditVideoRecorderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  /** Pin currently selected. Null = building-level clip. */
  assetId: string | null;
  /** Short label shown in the header, e.g. "Lobby directory" or "Building". */
  scopeLabel: string;
};

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  // Safari iOS produces mp4; Chrome / Firefox produce webm. Prefer the
  // codec the device actually supports rather than guessing by UA.
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'video/webm';
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function AuditVideoRecorderDialog({
  open,
  onOpenChange,
  buildingId,
  assetId,
  scopeLabel,
}: AuditVideoRecorderDialogProps) {
  const addVideo = useAddAuditVideo();
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const finalDuration = useMemo(() => {
    // If the recorder fired stop because the cap hit, elapsed already
    // reflects that. Otherwise use the snapshot at stop.
    return Math.min(elapsed, AUDIT_VIDEO_MAX_DURATION_SECONDS);
  }, [elapsed]);

  const teardownStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    }
    recorderRef.current = null;
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) t.stop();
    }
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  }, []);

  const resetAll = useCallback(() => {
    teardownStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    chunksRef.current = [];
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
    setNotes('');
    setError(null);
    setStage('idle');
  }, [previewUrl, teardownStream]);

  // Tear down on close. Also kicks in if the user navigates away.
  useEffect(() => {
    if (!open) {
      resetAll();
    }
    return () => {
      if (!open) return;
      // Component unmount while open — release the camera.
      teardownStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const beginRecording = useCallback(async () => {
    setError(null);
    setStage('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      streamRef.current = stream;
      const video = liveVideoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        await video.play().catch(() => {});
      }

      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: AUDIT_VIDEO_BITRATE,
      });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        setBlob(finalBlob);
        const url = URL.createObjectURL(finalBlob);
        setPreviewUrl(url);
        setStage('preview');
        // Free the camera as soon as we have the file.
        const s = streamRef.current;
        if (s) {
          for (const t of s.getTracks()) t.stop();
          streamRef.current = null;
        }
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      rec.start(1000);
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStage('recording');
      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(secs);
        if (secs >= AUDIT_VIDEO_MAX_DURATION_SECONDS && rec.state !== 'inactive') {
          try {
            rec.stop();
          } catch {
            // ignore
          }
        }
      }, 250);
    } catch (err) {
      teardownStream();
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera and microphone permission was denied. Allow access in your browser settings and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start recording.';
      setError(message);
      setStage('idle');
    }
  }, [teardownStream]);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }, []);

  const discardAndRetry = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
    setError(null);
    setStage('idle');
  }, [previewUrl]);

  const upload = useCallback(async () => {
    if (!blob) return;
    setError(null);
    setStage('uploading');
    try {
      await addVideo.mutateAsync({
        buildingId,
        assetId,
        blob,
        durationSeconds: finalDuration,
        notes: notes.trim() ? notes.trim() : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setStage('preview');
    }
  }, [addVideo, assetId, blob, buildingId, finalDuration, notes, onOpenChange]);

  const recorderUnsupported =
    typeof window !== 'undefined' &&
    (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-xl font-semibold">
                <Video size={18} aria-hidden className="text-waymarks-gold" />
                Record audit video
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                Attaches to <span className="font-medium text-text">{scopeLabel}</span>.
                Max 3 minutes.
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

          {recorderUnsupported && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning"
            >
              <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>This browser doesn't support in-app recording. Try Chrome or Safari on your phone.</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger"
            >
              <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-black/10 bg-black dark:border-white/10">
            {stage === 'preview' && previewUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- field-shot audit clips don't have captions; this is owner-recorded raw footage
              <video
                ref={previewVideoRef}
                src={previewUrl}
                controls
                playsInline
                className="aspect-video w-full bg-black"
              />
            ) : (
              <video
                ref={liveVideoRef}
                playsInline
                muted
                className="aspect-video w-full bg-black"
              />
            )}
          </div>

          {(stage === 'recording' || stage === 'requesting') && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Circle size={10} className="animate-pulse fill-danger text-danger" aria-hidden />
              <span className="font-mono tabular-nums">
                {formatElapsed(elapsed)} / {formatElapsed(AUDIT_VIDEO_MAX_DURATION_SECONDS)}
              </span>
              <span className="text-text-muted">
                {stage === 'requesting' ? 'Starting camera…' : 'Recording'}
              </span>
            </div>
          )}

          {stage === 'preview' && (
            <div className="mt-4 space-y-2">
              <label htmlFor="audit-video-notes" className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Notes (optional)
              </label>
              <textarea
                id="audit-video-notes"
                rows={2}
                value={notes}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What does this clip show?"
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />
              <p className="text-xs text-text-faint">
                Clip length: {formatElapsed(finalDuration)}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {stage === 'idle' && (
              <>
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  onClick={() => void beginRecording()}
                  disabled={recorderUnsupported}
                  iconLeft={<Video size={14} aria-hidden />}
                >
                  Start recording
                </Button>
              </>
            )}

            {stage === 'requesting' && (
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}

            {stage === 'recording' && (
              <Button
                variant="danger"
                onClick={stopRecording}
                iconLeft={<Circle size={12} aria-hidden className="fill-current" />}
              >
                Stop
              </Button>
            )}

            {stage === 'preview' && (
              <>
                <Button
                  variant="secondary"
                  onClick={discardAndRetry}
                  iconLeft={<RotateCcw size={14} aria-hidden />}
                >
                  Re-record
                </Button>
                <Button
                  variant="gold"
                  onClick={() => void upload()}
                  iconLeft={<Upload size={14} aria-hidden />}
                >
                  Upload
                </Button>
              </>
            )}

            {stage === 'uploading' && (
              <Button variant="gold" loading>
                Uploading…
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
