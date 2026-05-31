import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, Circle, FileVideo, RotateCcw, Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAddAuditVideo } from '@/hooks/useAuditVideos';
import {
  AUDIT_VIDEO_BITRATE,
  AUDIT_VIDEO_MAX_BYTES,
  AUDIT_VIDEO_MAX_DURATION_SECONDS,
  AUDIT_VIDEO_MIMES,
} from '@/lib/queries/audit-videos';

/**
 * In-app audit-video capture (M27) + camera-roll upload (M31). One dialog,
 * two entry paths:
 *   * Record — getUserMedia + MediaRecorder, 1.5 Mbps, 3-min cap, then preview.
 *   * Upload — pick an existing video file (mp4 / mov / webm), validate size +
 *     duration, then preview.
 * Both paths converge on the same preview → optional notes → upload tail and
 * the same addAuditVideo storage/DB path.
 *
 * The recorder path needs a secure context (https or localhost). The upload
 * path works over plain HTTP/LAN — handy for mobile testing without a cert.
 *
 * Stages: idle (chooser) → requesting/recording (record path) → preview →
 * uploading. Cancel from any stage tears down the MediaStream and discards
 * the blob.
 */

type Stage = 'idle' | 'requesting' | 'recording' | 'preview' | 'uploading';

/** A captured-but-not-yet-uploaded clip, handed back via `onCapture`. */
export type CapturedVideo = { blob: Blob; durationSeconds: number; notes: string | null };

export type AuditVideoRecorderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  /** Pin currently selected. Null = building-level clip. */
  assetId: string | null;
  /** Short label shown in the header, e.g. "Lobby directory" or "Building". */
  scopeLabel: string;
  /**
   * Deferred-capture mode. When provided, the recorder hands the finished clip
   * back instead of uploading it immediately — used by the Add Asset window,
   * which has no saved asset_id yet. This mirrors the photo picker: collect
   * now, attach after the asset is created. Omit it (pin-detail) to upload
   * straight to `assetId` as before.
   */
  onCapture?: (captured: CapturedVideo) => void;
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
  onCapture,
}: AuditVideoRecorderDialogProps) {
  const addVideo = useAddAuditVideo();
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // M31: which path produced the current preview, so the UI can say
  // "Re-record" vs "Pick another file" instead of one generic label.
  const [source, setSource] = useState<'record' | 'upload'>('record');

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
    setSource('record');
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
    setSource('record');
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

  const probeDurationSeconds = useCallback(
    (objectUrl: string): Promise<number> =>
      new Promise((resolve) => {
        // A throwaway <video> reads metadata without rendering. Some
        // containers report duration === Infinity until seek; cap at the
        // briefing's 3-min limit so the bad-metadata case can't write a
        // bogus duration to the DB.
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.src = objectUrl;
        const settle = (secs: number) => resolve(Math.max(0, Math.min(secs, AUDIT_VIDEO_MAX_DURATION_SECONDS)));
        probe.addEventListener(
          'loadedmetadata',
          () => {
            const d = probe.duration;
            settle(Number.isFinite(d) ? Math.floor(d) : 0);
          },
          { once: true }
        );
        probe.addEventListener('error', () => settle(0), { once: true });
        // Hard safety net — never block the UI for more than a couple seconds.
        window.setTimeout(() => settle(0), 2000);
      }),
    []
  );

  const handleUploadFile = useCallback(
    async (file: File) => {
      setError(null);
      // Size cap mirrors the bucket. Most camera-roll clips at 1080p are
      // well under 100 MB for a 3-min duration; longer clips will trip
      // this, which is also our soft duration enforcement.
      if (file.size > AUDIT_VIDEO_MAX_BYTES) {
        setError(`That file is too large. Limit is ${Math.round(AUDIT_VIDEO_MAX_BYTES / 1048576)} MB.`);
        return;
      }
      const mimeOk =
        (AUDIT_VIDEO_MIMES as readonly string[]).includes(file.type) ||
        // Some Android browsers omit the MIME on camera-roll files — fall
        // back to the file extension so the picker isn't unusable.
        /\.(mp4|mov|m4v|webm)$/i.test(file.name);
      if (!mimeOk) {
        setError('Unsupported video format. Use MP4, MOV, or WebM.');
        return;
      }

      setSource('upload');
      setBlob(file);
      const url = URL.createObjectURL(file);
      // Replace any prior preview URL so we don't leak.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      const seconds = await probeDurationSeconds(url);
      setElapsed(seconds);
      setStage('preview');
    },
    [previewUrl, probeDurationSeconds]
  );

  const openFilePicker = useCallback(() => {
    setError(null);
    uploadInputRef.current?.click();
  }, []);

  const discardAndRetry = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setElapsed(0);
    setError(null);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    setStage('idle');
  }, [previewUrl]);

  const upload = useCallback(async () => {
    if (!blob) return;
    // Deferred-capture mode (Add Asset): hand the clip back; the caller
    // attaches it once the asset exists. No asset_id needed here.
    if (onCapture) {
      onCapture({ blob, durationSeconds: finalDuration, notes: notes.trim() ? notes.trim() : null });
      onOpenChange(false);
      return;
    }
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
  }, [addVideo, assetId, blob, buildingId, finalDuration, notes, onOpenChange, onCapture]);

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
                Add audit video
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                Attaches to <span className="font-medium text-text">{scopeLabel}</span>.
                Record live or upload from your camera roll. Max 3 minutes.
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
              <span>This browser doesn't support in-app recording. You can still upload a video file.</span>
            </div>
          )}

          {/* Hidden file input shared by the Upload buttons. accept="video/*"
              (no `capture` attribute) so iOS / Android surface the camera
              roll instead of the live camera. */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUploadFile(f);
              e.target.value = '';
            }}
          />

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
                  variant="secondary"
                  onClick={openFilePicker}
                  iconLeft={<FileVideo size={14} aria-hidden />}
                >
                  Upload video
                </Button>
                <Button
                  variant="gold"
                  onClick={() => void beginRecording()}
                  disabled={recorderUnsupported}
                  iconLeft={<Video size={14} aria-hidden />}
                >
                  Record
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
                  {source === 'upload' ? 'Pick another' : 'Re-record'}
                </Button>
                <Button
                  variant="gold"
                  onClick={() => void upload()}
                  iconLeft={<Upload size={14} aria-hidden />}
                >
                  {onCapture ? 'Use clip' : source === 'upload' ? 'Use this' : 'Upload'}
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
