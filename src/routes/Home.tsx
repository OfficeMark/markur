import { ThemeToggle } from '@/components/waymarks/ThemeToggle';

export function Home() {
  return (
    <div className="min-h-screen bg-waymarks-cream text-text">
      <header className="flex items-center justify-between border-b border-black/10 bg-waymarks-ink px-6 py-4 text-white">
        <span className="font-serif text-2xl tracking-tight">
          Way<span className="text-waymarks-gold">marks</span>
        </span>
        <span className="text-xs uppercase tracking-[0.2em] text-white/60">M0 — skeleton</span>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16 md:py-24">
        <section className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-faint">
            Building signage passport
          </p>
          <h1 className="font-serif text-4xl leading-tight md:text-5xl">
            Every sign on every floor,
            <br />
            <span className="text-waymarks-gold">accounted for and audit-ready.</span>
          </h1>
          <p className="max-w-prose text-text-muted">
            Waymarks is being rebuilt from the ground up. This page proves the toolchain — Tailwind
            theme tokens, the serif/sans pairing, and a working light / dark toggle. Real screens
            arrive in M1.
          </p>
        </section>

        <section className="flex flex-wrap items-center gap-4">
          <ThemeToggle />
          <span className="font-mono text-xs text-text-faint">v0.0.0 — milestone M0</span>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SwatchCard label="Ink" className="bg-waymarks-ink text-white" />
          <SwatchCard label="Gold" className="bg-waymarks-gold text-white" />
          <SwatchCard label="Cream" className="bg-waymarks-gold-soft text-text" />
        </section>
      </main>
    </div>
  );
}

function SwatchCard({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={`flex h-24 items-end rounded-lg border border-black/10 p-3 text-sm font-medium ${className}`}
    >
      {label}
    </div>
  );
}
