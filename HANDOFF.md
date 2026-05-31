# Handoff — how to work with Claude Code on Markur

Written for Randy (the owner), who isn't a developer. This is a plain-language guide to using Claude Code as your developer, what to expect, and what to ask for.

## What Claude Code is

Claude Code is a command-line tool that runs Claude with access to your project files. You give it instructions in plain language ("build the audit screen", "fix the floor 3 plan", "add a new role"), and it reads the spec files in this repo, writes code, runs tests, and commits the changes.

It's effectively a developer who has already read your entire spec before you talk to it. Your job is to be a clear product owner: tell it what you want, answer its questions, and review what it ships.

## First-time setup

You'll do this once, with a developer-friendly friend or by following Claude Code's docs.

1. Install Node.js (https://nodejs.org — pick the LTS version).
2. Install Claude Code (https://docs.claude.com/claude-code — there are install instructions for Mac, Windows, and Linux).
3. Create a free Supabase account (https://supabase.com), make a new project, and grab the URL and anon key.
4. Create a free Netlify account (https://netlify.com) — your existing one works.
5. Open a terminal in the folder where you want the project to live, and run:

   ```bash
   claude-code
   ```

6. Tell it: "Please initialize a new project from the spec in this folder." Point it at the folder containing this `HANDOFF.md` and the `specs/` folder. It will scaffold the project.

## How to ask Claude Code for work

Claude Code reads `CLAUDE.md` automatically every session. So you don't need to re-explain the project. You just say what you want.

Good prompts look like this:

> Read `specs/07-build-order.md` and start on Milestone M1. When you finish, show me the screens.

> A tenant rep should never see other floors. Audit the code and confirm that's enforced everywhere — check the database policies, the front-end routes, and the floor selector. Report what you find.

> The "Add Asset" button doesn't work in mobile audit mode. Reproduce it, fix it, add a test that catches the regression.

> I want to add a new asset type called "Braille plate". Update the data model, the type chip filter, and the validation rules. Reference `specs/03-data-model.md` and `specs/06-features.md`.

Bad prompts look like this:

> Make it look better.
> Add some features.
> Fix the bugs.

Be specific. If you're not sure what specific looks like, paste a screenshot and describe what you want changed.

## What to expect from each milestone

The build is sequenced in `specs/07-build-order.md` from M0 (project skeleton) through M9 (offline + production polish). Each milestone is small enough to ship in a few days of Claude Code work, with clear acceptance criteria you can verify yourself by clicking through the app.

After each milestone, Claude Code should:

1. Run `npm run check` (lint + typecheck + tests) and confirm all pass.
2. Deploy a preview to Netlify so you can click through it.
3. Update the milestone's status in `specs/07-build-order.md` to "shipped".
4. Tell you in plain language what changed and what to test.

If it ships something that doesn't match the spec, push back. The specs are the source of truth — Claude Code should ask before deviating.

## Reviewing what Claude Code ships

You don't need to read the code. You need to click through the preview deploy and verify the acceptance criteria for the milestone. They're written in plain language for that reason.

For every milestone, ask yourself:

- Does the screen look like the spec describes?
- Can I do the thing the milestone is supposed to enable?
- Does it work on my phone? On an iPad? On a desktop?
- Do tenants only see their floor? (test by inviting a test tenant account)
- Does the offline behavior work? (turn off Wi-Fi mid-audit)

If any answer is "no" or "I'm not sure", say so to Claude Code. It can fix it.

## Things to ask Claude Code about, not figure out yourself

- "How do I deploy a preview?"
- "How do I add a new tenant for testing?"
- "How do I see the database to check that something saved?"
- "How do I roll back if something breaks?"
- "How do I rotate the Supabase keys if they leak?"
- "How do I export all of one customer's data?"
- "How do I restore from backup?"

Claude Code knows how to do all of this and can walk you through it. Don't memorize commands.

## Domain and email setup

These are things you (or a friend with DNS access) need to do, not Claude Code:

- Point `markur.ca` away from the GoDaddy lander to either Netlify (production) or a marketing page.
- Set up a custom email domain (for invites, audit notifications) — you can use Resend, Postmark, or Supabase's built-in if good enough.
- If you want SSO for clients (Google, Microsoft), enable those providers in Supabase Auth.

Claude Code can give you exact step-by-step DNS records when you're ready.

## Security boundaries

You will be entrusted with floor plans of clients' buildings. Treat that as the most sensitive thing in the system. Two rules:

1. Never share floor plans, photos, or asset locations outside the app — not in marketing materials, not in screenshots posted publicly, not in support tickets without redaction.
2. Every client gets their own building scope. A tenant in one building can never see another building. This is enforced by Postgres row-level security policies (see `specs/04-permissions.md`) and verified by Playwright tests.

If a client asks "is my building plan public?", the answer is no, and you can prove it with the test reports.

## Cost expectations

Free tiers cover the dev phase. For production, rough monthly cost at the size of one or two buildings:

- Supabase Pro: $25/month (gives you backups, 100k auth users, 8GB storage)
- Netlify: free for small sites, $19/month for higher bandwidth
- Domain: ~$15/year
- Email service: free tier on Resend handles ~3000 emails/month

So roughly $50/month all-in for a small production deployment. Costs scale with storage (photos) and bandwidth, not with users.

## When something goes wrong

Tell Claude Code in plain language. Examples:

> The site is down. https://markur.ca shows a 500 error.
> A client can't sign in. Their email is `client@example.com`. Check what's happening.
> Someone uploaded a 200MB PDF and now the page is slow. Find a fix.

It can read logs, check the database, deploy fixes, and roll back. You don't need to know how — just describe the problem clearly.

---

## What's shipped (changelog)

Newest first. Each entry is something you can see/use in the live app at https://markur.ca.

### 2026-05-31 — "Record video" in Add Asset

- **Record video button in the Add Asset window**, sitting right beside "Take photo". You can
  record a clip live or pick one from your camera roll, and it attaches to the new pin the
  same way a photo does (including when you place the pin on several floors at once). It's the
  same recorder that was already in the pin-detail window — that window is unchanged.

### 2026-05-30 — Change brief (items 1–9)

**Look & feel (no database changes):**

- **Add Asset section headings** now show in Markur orange in the light theme (dark theme
  unchanged).
- **Floor-plan upload** help text now lists **WebP** alongside PDF/PNG/JPG/SVG (those formats
  were already accepted; this just makes the wording match).
- **Building list** shows only the **building name** at the top level; the floors appear when
  you click to expand a building, keeping the list clean.
- **"Order signs"** is now an action button: it emails the chosen vendor/contact (a prefilled
  draft) or opens the supplier's website, instead of just linking to the Officemark login.
- **ViewMark visualizer** recolored to Markur orange (`#ED7E2C`); the blue measurement dots
  were left as-is on purpose.

**Contacts & Vendors directory + the features that use it (database changes, already applied):**

- **New Admin section "Contacts & Vendors"** (under Admin). Two address-book-style lists you
  manage: **Contacts** (people or departments + email) and **Vendors** (suppliers + email
  and/or order link). Each entry is either **shared org-wide** or **scoped to one building** —
  a building's manager sees their own building's entries plus the shared ones, never another
  building's private entries.
- **Pins and flags can be tagged with a contact** — a dropdown on the pin-edit window and the
  flag window, filled from the directory.
- **A pin can list multiple vendors** (chosen from the directory; admins can add a new one on
  the spot). "Order signs" points at those vendors.
- **Add Asset can place a pin on multiple floors at once** (pick a range or individual floors).
  Each floor gets its **own independent copy** of the pin — editing one doesn't change the
  others. If a floor already has a pin in that exact spot, it's skipped and you're told which.

### Still on your plate (not code)

- **Two-factor authentication (2FA)** for Supabase and GitHub — turn it on in each account's
  security settings and store the recovery codes somewhere safe and separate from the laptop.
  Ask Claude Code for the exact click-path if you want it.
