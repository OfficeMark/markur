# Markur

A signage and wayfinding asset tracker for multi-tenant commercial buildings. Property managers pin signs onto floor plans, photograph them, audit them on a schedule, and let tenants flag issues.

**Markur, by Officemark.** The product was originally named Waymarks and renamed to Markur in April 2026 — the new name has cleaner namespace, brand poetry with the parent brand (the "mark" is shared), and a defensible trademark position (CIPO Canada returned zero on MARKUR).

## Status

Live build: https://waymarks-rebuild.netlify.app (Netlify project rename to `markur` is owner-pending).
Production domain target: https://markur.ca (already owned; DNS pointing is M10 work).

Milestones M0–M9 shipped. M10 — production readiness — is in flight: code-splitting, legal pages, cookie banner, step-up on revoke, long-press reposition, onboarding card, error boundary, a11y sweep.

## Quick start (for the developer)

```bash
git clone <repo-url>
cd markur
cp .env.example .env.local        # fill in Supabase keys
npm install
npm run dev
```

Open http://localhost:5173.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — project memory: stack, conventions, anti-patterns
- [`HANDOFF.md`](./HANDOFF.md) — owner's guide for working with Claude
- [`specs/`](./specs/) — full product spec, organized by topic
- [`docs/m*-verification.md`](./docs/) — what shipped each milestone, with manual smoke-test paths

## License

Private — all rights reserved. Floor plans uploaded to Markur are tenant-confidential and may not be reproduced.
