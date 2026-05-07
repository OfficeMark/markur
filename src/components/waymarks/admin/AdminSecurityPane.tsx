import { Link } from 'react-router-dom';
import {
  Check,
  Database,
  HardDrive,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Wifi,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/**
 * /admin/security (M15) — the customer-facing security posture page,
 * surfaced inside the app so the claims in the Security & Data Handling
 * one-pager are visible and verifiable to users in real time.
 *
 * Sections:
 *   1. Encryption status (in transit, at rest, at rest in storage)
 *   2. Access control (RLS, role-based grants, instant revocation)
 *   3. Authentication (Supabase Auth, password hashing, sessions, 2FA)
 *   4. Data handling (export + account deletion)
 *
 * Status indicators are static for now — every Markur deployment has
 * these by virtue of the architecture. A future hardening pass can
 * replace them with live health probes (last backup, last RLS audit,
 * etc.) but the indicators won't change for the demo.
 */
export function AdminSecurityPane() {
  const { user } = useAuth();
  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString('en-CA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="space-y-5">
      <header>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <ShieldCheck size={12} aria-hidden /> Security & Data Handling
        </p>
        <h2 className="mt-1 font-semibold text-2xl">How we protect your data</h2>
        <p className="mt-1.5 text-sm text-text-muted">
          What's true about your Markur tenant right now. The same posture is
          summarized in our Security one-pager — share that with your IT or
          security team if they want to review before signing off.
        </p>
      </header>

      <Section
        eyebrow="Encryption"
        title="All data encrypted in transit and at rest"
      >
        <StatusRow
          icon={<Wifi size={14} aria-hidden />}
          label="In transit (browser → server)"
          detail="HTTPS / TLS — same standard as online banking."
        />
        <StatusRow
          icon={<Database size={14} aria-hidden />}
          label="At rest (database)"
          detail="Postgres on managed infrastructure with disk-level encryption."
        />
        <StatusRow
          icon={<HardDrive size={14} aria-hidden />}
          label="At rest (floor plans, audit photos)"
          detail="Object storage with the same encryption guarantees."
        />
      </Section>

      <Section
        eyebrow="Access control"
        title="Your data is isolated from every other organization"
      >
        <StatusRow
          icon={<Lock size={14} aria-hidden />}
          label="Row-level security (RLS) enforced at the database"
          detail="Even a direct query refuses to return another org's records."
        />
        <StatusRow
          icon={<UserCheck size={14} aria-hidden />}
          label="Role-based grants (Manager, Auditor, Facilities)"
          detail="Scoped to a building, floor, or area. No blanket access."
        />
        <StatusRow
          icon={<UserMinus size={14} aria-hidden />}
          label="Instant revocation"
          detail="Removed members lose access immediately on next request."
        />
        <p className="mt-2 text-xs text-text-muted">
          Manage members on the{' '}
          <Link to="/admin/members" className="text-waymarks-gold hover:underline">
            Members
          </Link>{' '}
          page.
        </p>
      </Section>

      <Section eyebrow="Authentication" title="Enterprise-grade sign-in">
        <StatusRow
          icon={<KeyRound size={14} aria-hidden />}
          label="Supabase Auth"
          detail="The same authentication platform used by thousands of business apps."
        />
        <StatusRow
          icon={<Check size={14} aria-hidden />}
          label="Passwords hashed (never stored in plain text)"
          detail="Industry-standard hashing; passwords never touch our codebase."
        />
        <StatusRow
          icon={<Check size={14} aria-hidden />}
          label="Sessions encrypted"
          detail="Authenticated sessions are signed and time-bounded."
        />
        <StatusRow
          icon={<Check size={14} aria-hidden />}
          label="Two-factor authentication"
          detail="Supported by the auth platform; per-user enrollment UI on the near-term roadmap. Available on request in the meantime."
          status="planned"
        />
        {lastSignIn && (
          <p className="mt-2 text-xs text-text-faint">
            Your last sign-in: {lastSignIn}
          </p>
        )}
      </Section>

      <Section eyebrow="Your data" title="You own it. You can take it.">
        <p className="text-sm text-text">
          Your records belong to your organization. You can request a full
          export of your asset metadata and photos at any time. Your account
          and all associated data are removed on request — no friction, no
          retention games.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="mailto:support@officemark.ca?subject=Data%20export%20request%20-%20Markur"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-waymarks-gold bg-surface px-3 text-xs font-medium text-waymarks-gold hover:bg-waymarks-gold-soft"
          >
            Request data export
          </a>
          <a
            href="mailto:support@officemark.ca?subject=Account%20deletion%20request%20-%20Markur"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-danger/40 bg-surface px-3 text-xs font-medium text-danger hover:bg-danger/10"
          >
            Request account deletion
          </a>
        </div>
        <p className="mt-3 text-xs text-text-faint">
          Self-serve export and deletion are on the roadmap. For now,
          requests are processed within 30 days per our{' '}
          <Link to="/legal/privacy" className="hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </Section>

      <Section
        eyebrow="Compliance"
        title="Talk to your IT or security team"
      >
        <p className="text-sm text-text">
          We're happy to walk your IT or security team through the
          architecture, authentication model, and data-handling practices.
          For specific compliance questionnaires (SOC 2, ISO 27001, HIPAA),
          contact us and we'll discuss what's appropriate for your context.
        </p>
        <p className="mt-3 text-xs text-text-muted">
          Have a specific security requirement we haven't covered? Email{' '}
          <a
            href="mailto:support@officemark.ca?subject=Security%20question%20-%20Markur"
            className="text-waymarks-gold hover:underline"
          >
            support@officemark.ca
          </a>
          . We'd rather address it directly than leave the question open.
        </p>
      </Section>
    </div>
  );
}

// ===========================================================================

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          {eyebrow}
        </p>
        <h3 className="mt-1 font-semibold text-base">{title}</h3>
      </header>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function StatusRow({
  icon,
  label,
  detail,
  status = 'on',
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  status?: 'on' | 'planned';
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-black/5 bg-bg p-2.5">
      <div
        className={
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md ' +
          (status === 'on'
            ? 'bg-success-bg text-success'
            : 'bg-warning-bg text-warning')
        }
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text">{label}</p>
          {status === 'on' ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-bg px-1.5 text-[10px] font-semibold uppercase tracking-wide text-success">
              <Check size={10} aria-hidden />
              On
            </span>
          ) : (
            <span className="inline-flex h-5 items-center rounded-full bg-warning-bg px-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              Planned
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{detail}</p>
      </div>
    </div>
  );
}
