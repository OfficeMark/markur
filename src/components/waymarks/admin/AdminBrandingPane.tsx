import { Image } from 'lucide-react';

/**
 * /admin/branding — placeholder for org-level branding (logo upload,
 * accent color, custom invitation email header). Not implemented yet;
 * this pane reserves the slot in the admin nav so the IA is complete
 * for the demo and future work has an obvious home.
 */
export function AdminBrandingPane() {
  return (
    <section className="rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-2">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
          <Image size={12} aria-hidden /> Branding
        </p>
        <h2 className="mt-1 font-semibold text-lg">Org branding</h2>
        <p className="mt-1 text-xs text-text-muted">
          Upload your organization's logo to brand the app for your team and
          on outgoing invitation emails.
        </p>
      </header>
      <p className="rounded-md border border-black/5 bg-bg p-4 text-sm text-text-muted">
        Coming soon. This will let you upload an organization logo, set an
        accent color, and customize the invitation email header. For now,
        new members see Markur's default branding.
      </p>
    </section>
  );
}
