import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Persistent trust indicator in the top nav (M14c).
 *
 * Tells every signed-in user, on every screen, that their data is
 * encrypted in transit (TLS) and at rest (Postgres + Storage). Plays
 * the role the older Waymarks build had on the dashboard, brought
 * back as part of Markur's "security front-and-centre" stance.
 *
 * Hovering surfaces a longer explanation; clicking jumps to
 * /admin/security where the full posture lives.
 */
export type EncryptedChipProps = {
  className?: string;
  onClick?: () => void;
};

export function EncryptedChip({ className, onClick }: EncryptedChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Your data is encrypted in transit (TLS) and at rest. Click for the full security posture."
      aria-label="Data is encrypted. Open security details."
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors',
        'border-waymarks-gold/50 bg-waymarks-gold/15 text-waymarks-gold hover:bg-waymarks-gold/25',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold focus-visible:ring-offset-2 focus-visible:ring-offset-waymarks-ink',
        className
      )}
    >
      <Lock size={11} aria-hidden />
      <span>Encrypted</span>
    </button>
  );
}
