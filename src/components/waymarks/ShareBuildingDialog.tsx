import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Link2, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { useActiveShares, useCreateShare, useRevokeShare } from '@/hooks/useBuildingShares';
import type { CreatedShare, ShareExpiryDays } from '@/lib/queries/building-shares';

const EXPIRY_OPTIONS: ShareExpiryDays[] = [7, 30, 90];
const MAX_ACTIVE_SHARES = 10;

export type ShareBuildingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  buildingName?: string | null;
};

/**
 * Generates a tokenized, view-only share link for a building (guest viewer).
 * The plaintext token is shown ONCE on creation; the DB stores only its hash.
 * Lists active shares with a Revoke action (revoke cuts derived guest grants
 * immediately). Capped at ~10 active shares per building.
 */
export function ShareBuildingDialog({
  open,
  onOpenChange,
  buildingId,
  buildingName,
}: ShareBuildingDialogProps) {
  const shares = useActiveShares(open ? buildingId : undefined);
  const create = useCreateShare(buildingId);
  const revoke = useRevokeShare(buildingId);

  const [expiryDays, setExpiryDays] = useState<ShareExpiryDays>(30);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setExpiryDays(30);
    setCreated(null);
    setCopied(false);
    setError(null);
  }, [open]);

  const activeCount = shares.data?.length ?? 0;
  const atCap = activeCount >= MAX_ACTIVE_SHARES;

  async function generate() {
    setError(null);
    try {
      const result = await create.mutateAsync({ expiryDays });
      setCreated(result);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the share link.');
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this share link', url);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="share-building-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(96vw,520px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-black/10 bg-surface text-text shadow-sheet outline-none dark:border-white/10"
        >
          <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
            <Dialog.Title asChild>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Share building
                </p>
                <p className="truncate font-semibold text-xl">{buildingName ?? 'Guest view-only link'}</p>
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="rounded-md p-1 text-text-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <p id="share-building-description" className="text-sm text-text-muted">
              Generate a link that lets a client view this building — floor plans, pins, photos,
              and the PDF catalogue — with no editing. They open the link, confirm their email, and
              get time-boxed read-only access.
            </p>

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            {created ? (
              <div className="space-y-2 rounded-md border border-success/30 bg-success-bg p-3">
                <div className="flex items-start gap-2 text-sm text-success">
                  <Check size={14} aria-hidden className="mt-0.5 shrink-0" />
                  <p>Share link created. Copy it now and send it to your client.</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-md border border-black/10 bg-surface p-2 dark:border-white/10">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{created.url}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                    onClick={() => void copyLink(created.url)}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-text-faint">
                  Expires {format(new Date(created.share.expires_at), 'PP')}. Anyone with the link
                  can view this building until then — send it directly to the intended recipient.
                </p>
                <Button size="sm" variant="secondary" onClick={() => setCreated(null)}>
                  Create another
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                  Link expires in
                </span>
                <div role="group" aria-label="Expiry" className="inline-flex rounded-md border border-black/15 dark:border-white/15">
                  {EXPIRY_OPTIONS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setExpiryDays(d)}
                      aria-pressed={expiryDays === d}
                      className={
                        'h-9 px-4 text-sm font-medium transition-colors ' +
                        (i === 0 ? 'rounded-l-md ' : '') +
                        (i === EXPIRY_OPTIONS.length - 1 ? 'rounded-r-md ' : 'border-r border-black/10 dark:border-white/10 ') +
                        (expiryDays === d
                          ? 'bg-waymarks-ink text-white'
                          : 'text-text-muted hover:bg-black/5 dark:hover:bg-white/5')
                      }
                    >
                      {d} days
                    </button>
                  ))}
                </div>
                {atCap ? (
                  <p className="text-xs text-warning">
                    This building has reached the limit of {MAX_ACTIVE_SHARES} active links. Revoke
                    one below before creating another.
                  </p>
                ) : (
                  <div>
                    <Button
                      variant="gold"
                      loading={create.isPending}
                      iconLeft={<Link2 size={14} aria-hidden />}
                      onClick={() => void generate()}
                    >
                      Generate share link
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-black/10 pt-3 dark:border-white/10">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
                Active links ({activeCount}/{MAX_ACTIVE_SHARES})
              </p>
              {shares.isLoading ? (
                <p className="text-xs text-text-faint">Loading…</p>
              ) : activeCount === 0 ? (
                <p className="text-xs text-text-faint">No active share links.</p>
              ) : (
                <ul className="space-y-1.5">
                  {shares.data!.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-text">
                          Expires {format(new Date(s.expires_at), 'PP')}
                        </span>
                        <span className="block text-[11px] text-text-faint">
                          Created {format(new Date(s.created_at), 'PP')}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={revoke.isPending && revoke.variables === s.id}
                        iconLeft={<Trash2 size={12} aria-hidden />}
                        onClick={() => void revoke.mutateAsync(s.id).catch(() => {})}
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <footer className="flex justify-end gap-2 border-t border-black/10 p-3 dark:border-white/10">
            <Dialog.Close asChild>
              <Button size="sm" variant="secondary">
                Done
              </Button>
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
