import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Lightbulb, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useSubmitFeatureSuggestion } from '@/hooks/useFeatureSuggestions';

const MAX_LEN = 2000;
const MIN_LEN = 5;

export type SuggestFeatureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional triage context stored with the suggestion. */
  orgId?: string | null;
  buildingId?: string | null;
};

/**
 * A low-key in-app feedback box for signed-in users (reached from the account
 * menu — guests never see it). Writes to the feature_suggestions table; v1 has
 * no admin pane, so it just confirms receipt and Randy reads submissions out of
 * band. Not a nag: opened on demand, dismissable, one short field.
 */
export function SuggestFeatureDialog({
  open,
  onOpenChange,
  orgId = null,
  buildingId = null,
}: SuggestFeatureDialogProps) {
  const submit = useSubmitFeatureSuggestion();
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBody('');
      setSent(false);
      setError(null);
      submit.reset();
    }
  }, [open, submit]);

  const trimmed = body.trim();
  const canSend = trimmed.length >= MIN_LEN && !submit.isPending;

  async function send() {
    if (!canSend) return;
    setError(null);
    try {
      await submit.mutateAsync({ body: trimmed, orgId, buildingId });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your suggestion. Try again.');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/10 bg-surface p-5 text-text shadow-sheet outline-none dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="flex items-center gap-2 font-semibold text-xl">
              <Lightbulb size={18} aria-hidden className="text-waymarks-gold" />
              Suggest a feature
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {sent ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-success/30 bg-success-bg px-3 py-3 text-sm text-success">
                <Check size={16} aria-hidden className="mt-0.5 shrink-0" />
                <p>Thanks — your suggestion was sent. We read every one.</p>
              </div>
              <div className="flex justify-end">
                <Button variant="gold" onClick={() => onOpenChange(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <Dialog.Description className="text-sm text-text-muted">
                Tell us what would make Markur better for you — a missing feature, a rough edge,
                anything. It goes straight to the team.
              </Dialog.Description>

              {error && (
                <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}

              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                maxLength={MAX_LEN}
                placeholder="e.g. Let me export the audit report as a spreadsheet."
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the field when this on-demand dialog opens
                autoFocus
                className="w-full rounded-md border border-black/10 bg-surface p-3 text-base text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10"
              />

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-text-faint">
                  {body.length}/{MAX_LEN}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
                    Cancel
                  </Button>
                  <Button variant="gold" onClick={() => void send()} loading={submit.isPending} disabled={!canSend}>
                    Send
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
