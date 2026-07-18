import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, Link2, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DEFAULT_DEMO_PERIOD,
  DEMO_PERIODS,
  demoDaysLeft,
  demoUrlFor,
  type DemoPeriodDays,
} from '@/lib/queries/demo-links';
import {
  useCreateDemoLink,
  useDemoLinkClaims,
  useDemoLinks,
  useRevokeDemoLink,
} from '@/hooks/useDemoLinks';

/**
 * S9 — "Share <building>" (docs/demo-share-flow-mock.html).
 *
 * Demo-to-signup motion: generate an expiring full-access link to THIS
 * building ("it's their data"), copy it to the prospect, list active links
 * with time remaining, revoke when needed. Access ends on its own.
 */

export type ShareBuildingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  buildingName: string;
};

export function ShareBuildingDialog({
  open,
  onOpenChange,
  buildingId,
  buildingName,
}: ShareBuildingDialogProps) {
  const [days, setDays] = useState<DemoPeriodDays>(DEFAULT_DEMO_PERIOD);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const links = useDemoLinks(open ? buildingId : undefined);
  const claims = useDemoLinkClaims(buildingId, open);
  const create = useCreateDemoLink(buildingId);
  const revoke = useRevokeDemoLink(buildingId);

  const claimsByLink = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of claims.data ?? []) {
      const list = map.get(c.invitation_id) ?? [];
      list.push(c.email);
      map.set(c.invitation_id, list);
    }
    return map;
  }, [claims.data]);

  const issuedUrl = issuedToken ? demoUrlFor(issuedToken) : null;

  async function onGenerate() {
    setError(null);
    setCopied(false);
    try {
      const inv = await create.mutateAsync(days);
      setIssuedToken(inv.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the link.');
    }
  }

  async function onCopy() {
    if (!issuedUrl) return;
    await navigator.clipboard.writeText(issuedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setIssuedToken(null);
          setCopied(false);
          setError(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(92vw,540px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-black/10 bg-surface p-6 shadow-xl dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-semibold text-xl text-text">
                Share “{buildingName}”
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                Send your client a link to <span className="font-medium">their building</span>,
                fully loaded. They can view, edit, and audit it —{' '}
                <span className="font-medium">it’s their data</span>. Access ends automatically.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="rounded-md p-1 text-text-muted hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
            >
              <X size={16} aria-hidden />
            </Dialog.Close>
          </div>

          {/* Access period */}
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Access period
            </p>
            <div
              role="radiogroup"
              aria-label="Access period"
              className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-black/10 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.03]"
            >
              {DEMO_PERIODS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={days === d}
                  onClick={() => setDays(d)}
                  className={
                    days === d
                      ? 'rounded-md bg-waymarks-gold px-3 py-1.5 text-sm font-semibold text-waymarks-ink'
                      : 'rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text'
                  }
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>

          {/* Share link */}
          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Share link
            </p>
            {issuedUrl ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border border-black/10 bg-black/[0.03] px-3 py-2 text-xs text-text dark:border-white/10 dark:bg-white/[0.03]">
                  {issuedUrl}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCopy}
                  iconLeft={copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            ) : (
              <Button
                variant="gold"
                className="mt-2"
                loading={create.isPending}
                iconLeft={<Link2 size={14} aria-hidden />}
                onClick={onGenerate}
              >
                Generate link
              </Button>
            )}
            {error && (
              <p className="mt-2 rounded-md border border-danger/30 bg-danger-bg p-2 text-xs text-danger">
                {error}
              </p>
            )}
            <p className="mt-3 flex items-start gap-1.5 rounded-md border border-success/30 bg-success-bg p-3 text-xs text-success">
              <ShieldCheck size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">Full access to this building only</span>, for {days}{' '}
                days. Expires on its own — no cleanup needed.
              </span>
            </p>
          </div>

          {/* Active links */}
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-faint">
              Active links
            </p>
            {links.isLoading ? (
              <div className="mt-2 h-9 animate-pulse rounded-md bg-black/5 dark:bg-white/5" />
            ) : (links.data ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">No active links yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(links.data ?? []).map((l) => {
                  const left = demoDaysLeft(l.expires_at);
                  const emails = claimsByLink.get(l.id) ?? [];
                  return (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-black/10 px-3 py-2 dark:border-white/10"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text">
                          {emails.length > 0 ? emails.join(', ') : 'Not claimed yet'}
                        </p>
                        <p className="text-xs text-text-muted">{l.grant_days ?? '—'}-day link</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success">
                          {left} {left === 1 ? 'day' : 'days'} left
                        </span>
                        <button
                          type="button"
                          aria-label="Revoke link"
                          onClick={() => revoke.mutate(l.id)}
                          className="rounded-md p-1 text-text-muted hover:bg-danger-bg hover:text-danger"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-text-faint">
              Revoking a link also ends access for anyone who claimed it.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
