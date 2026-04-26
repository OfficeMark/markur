import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button, type ButtonVariant } from '@/components/ui/Button';

/**
 * Step-up confirmation: the user has to type a specific word before the
 * destructive action is allowed (e.g. "DELETE"). Used by:
 *   - asset soft-delete (M5)
 *   - building / floor delete (later milestones)
 *
 * Per spec 06 — "destructive actions require typed confirmation" — this
 * pattern is meant to interrupt muscle memory, not to be a real auth gate.
 */

export type StepUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The exact word the user must type. Case-sensitive. */
  confirmWord: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  confirmIcon?: ReactNode;
  busy?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void | Promise<void>;
};

export function StepUpDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  confirmLabel,
  confirmVariant = 'danger',
  confirmIcon,
  busy,
  errorMessage,
  onConfirm,
}: StepUpDialogProps) {
  const [typed, setTyped] = useState('');

  // Reset the typed value any time the dialog opens or closes.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const matches = typed === confirmWord;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="stepup-description"
          className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-lg">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <p id="stepup-description" className="text-sm text-text-muted">
            {description}
          </p>

          <label className="mt-4 block space-y-1.5">
            <span className="block text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Type{' '}
              <code className="rounded bg-black/5 px-1 font-mono text-[11px] dark:bg-white/10">
                {confirmWord}
              </code>{' '}
              to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matches && !busy) void onConfirm();
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-10 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold/40 dark:border-white/10"
            />
          </label>

          {errorMessage && (
            <p className="mt-3 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
              {errorMessage}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant={confirmVariant}
              disabled={!matches}
              loading={busy}
              iconLeft={confirmIcon}
              onClick={() => void onConfirm()}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
