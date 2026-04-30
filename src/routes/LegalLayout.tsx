import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared frame for the /legal pages (M10e). Public route — no AppShell, no
 * AuthProvider needed, so prospects can land directly from a marketing
 * link. Header keeps the Markur wordmark + a single "Back" affordance.
 */

export function LegalLayout({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-bg text-text">
      <header className="border-b border-black/10 bg-waymarks-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight text-base">
            Markur
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-waymarks-gold"
          >
            <ArrowLeft size={14} aria-hidden />
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-semibold text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">Effective {effective}</p>
        <div className="prose prose-sm mt-6 max-w-none text-text [&_h2]:mt-8 [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:text-text [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-base [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_a]:text-waymarks-gold-deep [&_a]:underline">
          {children}
        </div>
        <footer className="mt-12 flex items-center gap-3 border-t border-black/10 pt-6 text-xs text-text-muted">
          <Link to="/legal/privacy" className="hover:underline">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <Link to="/legal/terms" className="hover:underline">
            Terms
          </Link>
          <span aria-hidden>·</span>
          <a href="mailto:support@officemark.ca" className="hover:underline">
            support@officemark.ca
          </a>
          <span className="ml-auto">© {new Date().getFullYear()} Officemark</span>
        </footer>
      </main>
    </div>
  );
}
