# Waymarks

A signage and wayfinding asset tracker for multi-tenant commercial buildings. Property managers pin signs onto floor plans, photograph them, audit them on a schedule, and let tenants flag issues.

## Status

In active rebuild. The previous prototype is at https://waymarks-app.netlify.app. The production domain (https://waymarks.ca) currently points to a parked GoDaddy lander and will be repointed to the demo or production site once the rebuild ships milestone M1.

## Quick start (for the developer)

```bash
git clone <repo-url>
cd waymarks
cp .env.example .env.local        # fill in Supabase keys
npm install
npm run db:setup                  # applies migrations to your Supabase project
npm run dev
```

Open http://localhost:5173.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — project memory: stack, conventions, anti-patterns
- [`HANDOFF.md`](./HANDOFF.md) — owner's guide for working with Claude Code
- [`specs/`](./specs/) — full product spec, organized by topic

## License

Private — all rights reserved. Floor plans uploaded to Waymarks are tenant-confidential and may not be reproduced.
