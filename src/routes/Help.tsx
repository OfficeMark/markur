import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Image as ImageIcon,
  MapPin,
  Plus,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';

/**
 * /help — plain-language tutorial for first-time users (M10b). Linked from
 * the ? icon in the AppShell header. Self-contained: no data hooks, no
 * permission gates — anyone signed in can read it.
 *
 * The tone is friendly and concrete: each section names a real button or
 * screen, so the reader can follow along on their own building.
 */

type Section = {
  id: string;
  icon: typeof Building2;
  title: string;
  intro: string;
  steps: { label: string; detail: string }[];
};

const SECTIONS: Section[] = [
  {
    id: 'building',
    icon: Building2,
    title: 'Set up your building',
    intro:
      "A building is the top-level container in Markur. Add a hero photo and a few floors, then upload a floor plan for each floor that has signs you want to track.",
    steps: [
      {
        label: 'Open your building',
        detail:
          "From Home, click the building card. You'll see a hero photo at the top and a list of floors below.",
      },
      {
        label: 'Add a building photo',
        detail:
          "Click 'Add photo' on the hero banner (admins only). PNG, JPG, or WebP, up to 10 MB. The photo shows on Home and on the building's hero.",
      },
      {
        label: 'Upload a floor plan',
        detail:
          "Click any floor with 'No plan yet'. Use 'Upload floor plan' — PDF works best (we read its title and warn you if it doesn't match the floor name).",
      },
    ],
  },
  {
    id: 'pins',
    icon: MapPin,
    title: 'Place pins on a floor plan',
    intro:
      'Every sign is a pin. Click anywhere on the plan to drop a pin, then fill in name, type, and category. Add a photo right from your phone.',
    steps: [
      {
        label: 'Click "Add asset"',
        detail:
          "The orange 'Add asset' button in the floor toolbar puts the canvas in placing mode. Click anywhere on the plan to drop a new pin.",
      },
      {
        label: 'Fill in the details',
        detail:
          "Name (e.g. 'Lobby directory'), type (Directory / Egress / Stairwell / Tenant ID / etc.), location notes if helpful. Tap Save.",
      },
      {
        label: 'Add photos',
        detail:
          "Click any pin to open its drawer. Tap 'Add photo' to use your camera, or 'Choose files' to upload existing images.",
      },
      {
        label: 'Move a pin (deliberate)',
        detail:
          "From the pin's drawer, click 'Reposition pin'. The drawer closes, the canvas highlights the pin, you drag it to a new spot, and a confirmation banner asks you to confirm or cancel before it commits.",
      },
    ],
  },
  {
    id: 'audit',
    icon: ClipboardList,
    title: 'Walk an audit',
    intro:
      'Audits are how you keep the data fresh. Walk a floor with your phone, tap each pin as you find it, and mark it Confirmed, Flagged, or Skipped.',
    steps: [
      {
        label: 'Tap "Audit floor"',
        detail:
          "The whole screen flips to audit mode. Top bar shows progress (e.g. 3 of 12). Tap any pin to bring it up in the bottom action sheet.",
      },
      {
        label: 'Confirm, Flag, or Skip',
        detail:
          "Confirm OK = sign is in good shape. Flag issue = something is wrong (creates an open flag). Skip = you couldn't find it or it's not relevant.",
      },
      {
        label: 'End the audit',
        detail:
          "Tap End audit when done. A summary modal shows total / audited / missed counts, and lists any pins you missed (you can jump back into them).",
      },
      {
        label: 'Audit-due chip',
        detail:
          "The Audit due chip on the floor toolbar shows how many pins are past their cycle (default 90 days). Click to filter the canvas to only those pins.",
      },
    ],
  },
  {
    id: 'invitations',
    icon: UserPlus,
    title: 'Invite your team',
    intro:
      'Building admins can invite other admins, auditors (one floor at a time), and Facilities reps (one tenant scope). For now, send the invitation link manually — automated emails arrive in a future update.',
    steps: [
      {
        label: 'Open the People with access card',
        detail:
          "Scroll to the bottom of the Building view. You'll see a list of current grants. Click 'Invite user'.",
      },
      {
        label: 'Pick a role and scope',
        detail:
          "Email + role (Building admin / Auditor / Facilities) + scope (auto-derived). Auditors get a 30-day expiry by default.",
      },
      {
        label: 'Copy the link',
        detail:
          "Click 'Create invitation'. The dialog shows a /accept/<token> URL. Copy it and send it however you'd like (email, Slack, text). The recipient signs in and clicks Accept.",
      },
    ],
  },
  {
    id: 'offline',
    icon: Download,
    title: 'Use Markur offline',
    intro:
      "Markur works offline once you've cached a floor. Walk an audit in a basement or stairwell — the events queue locally and sync the moment you reconnect.",
    steps: [
      {
        label: 'Tap "Take offline"',
        detail:
          "On the floor toolbar, click 'Take offline'. Markur caches the plan, all pins, and the floor's audit history. The button shows a checkmark when ready.",
      },
      {
        label: 'Watch the sync chip',
        detail:
          "Top right of the header. Synced (green) means everything's up. Queued (warning amber + count) means you're offline with pending audit events. Syncing (info) means we're catching up.",
      },
      {
        label: 'Install as an app',
        detail:
          "On iPhone Safari → Share → Add to Home Screen. On Android Chrome → menu → Install app. Markur opens fullscreen with no browser chrome.",
      },
    ],
  },
  {
    id: 'roles',
    icon: ShieldCheck,
    title: 'Roles, in plain language',
    intro:
      'Markur has four roles. Each sees only what they need.',
    steps: [
      {
        label: 'Super admin (Markur operator)',
        detail:
          "Sees and edits everything across all buildings. Used for setup and resolving issues. There's also a Trash view here for restoring deleted pins.",
      },
      {
        label: 'Building admin (property manager / facility lead)',
        detail:
          "Owns one or more buildings. Places pins, edits, deletes, invites users, runs audits. Cannot see other buildings.",
      },
      {
        label: 'Auditor',
        detail:
          "Walks specific floors. Can audit and flag issues but cannot edit pin metadata or place new pins.",
      },
      {
        label: 'Facilities (tenant rep)',
        detail:
          "Sees one floor and one tenant's assets. Lands directly on their floor on sign-in. Can flag issues; cannot edit.",
      },
    ],
  },
];

export function Help() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <ArrowLeft size={12} aria-hidden /> Back
        </Link>

        <header className="mb-10 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-waymarks-gold">
            Tutorial
          </p>
          <h1 className="font-semibold text-4xl leading-tight text-text sm:text-5xl">
            How to use Markur
          </h1>
          <p className="max-w-2xl text-sm text-text-muted">
            A short walkthrough. Skim the section that matches what you're trying to do — each one references real buttons in the app, so you can follow along on your own building.
          </p>
        </header>

        {/* Table of contents */}
        <nav aria-label="Sections" className="mb-10 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="group flex items-center gap-3 rounded-lg border border-black/10 bg-surface p-3 transition-colors hover:border-waymarks-gold hover:bg-waymarks-gold-soft dark:border-white/10"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-waymarks-gold-soft text-waymarks-gold">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="flex-1 text-sm font-medium text-text">{s.title}</span>
              </a>
            );
          })}
        </nav>

        {/* Sections */}
        <div className="space-y-12">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-20 rounded-xl border border-black/10 bg-surface p-6 shadow-sm dark:border-white/10 sm:p-8"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-waymarks-gold-soft text-waymarks-gold">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h2 className="font-semibold text-2xl text-text sm:text-3xl">{section.title}</h2>
                </div>
                <p className="text-sm text-text-muted">{section.intro}</p>
                <ol className="mt-5 space-y-4">
                  {section.steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-waymarks-ink font-mono text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium text-text">{step.label}</p>
                        <p className="mt-0.5 text-sm text-text-muted">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-waymarks-gold bg-waymarks-gold-soft p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-waymarks-gold text-white">
              <ClipboardCheck size={18} aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-lg text-text">Stuck on something?</p>
              <p className="text-sm text-text-muted">
                Email <a className="font-medium text-waymarks-gold hover:underline" href="mailto:randy@officemark.ca">randy@officemark.ca</a> and we'll sort it out.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-2 text-xs text-text-faint">
          <Link to="/" className="inline-flex items-center gap-1 hover:text-text">
            <Plus size={12} aria-hidden /> Set up another building
          </Link>
          <span aria-hidden>·</span>
          <Link to="/" className="inline-flex items-center gap-1 hover:text-text">
            <ImageIcon size={12} aria-hidden /> Back to dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
