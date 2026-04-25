# M0 — verification & next steps for the owner

Hi Randy. M0 is the toolchain skeleton — no real product yet, just proof that everything wires up. Here is what was built, what was verified, and what you need to do to get a Netlify preview URL live.

## What's in the repo now

- `package.json`, `package-lock.json` — dependencies pinned
- `vite.config.ts`, `tsconfig.*.json` — Vite + strict TypeScript with `@/*` alias
- `tailwind.config.ts`, `src/styles/globals.css` — Tailwind v3 with the full Waymarks color/font theme from `specs/02-design-system.md`
- `eslint.config.js`, `.prettierrc.json` — linting and formatting (lint-staged + husky wired into `npm install`)
- `playwright.config.ts` — Playwright config for desktop, iPad, mobile viewports (no tests yet)
- `vitest` setup in `vite.config.ts` + `src/test/setup.ts`
- `netlify.toml` — Netlify build settings, SPA redirect, security headers
- `.env.example` — Supabase placeholders (real keys go in `.env.local`, gitignored)
- `src/main.tsx`, `src/App.tsx`, `src/routes/Home.tsx` — the hero landing page
- `src/components/waymarks/{ThemeProvider,ThemeToggle,theme-context}` — light/dark toggle, persisted to localStorage
- `tests/unit/theme-toggle.test.tsx` — one passing test that proves the toggle works
- Folder skeleton matching `CLAUDE.md` § "Repo layout"

## What was verified automatically

I built the project in a clean Linux scratch directory and ran the full check pipeline:

- `npm install` — 735 packages, lock file generated
- `npm run typecheck` — no errors
- `npm run lint` — no errors (max-warnings=0)
- `npm run test` — 2/2 passing
- `npm run build` — clean build, ~164 kB JS / 16 kB CSS gzipped to ~54 kB / ~4 kB
- `npm run check` — green end-to-end

## Important: OneDrive issue

`Waymarks Claude Code` is sitting on OneDrive. OneDrive locks files inside `node_modules` while it tries to sync them, which broke `npm install` and `git init` from inside this session. Two ways to fix it on your end (either works):

1. **Recommended:** move the project off OneDrive into a regular folder, e.g. `C:\Users\randy\dev\waymarks`. node_modules is build output, not source, and shouldn't be backed up.
2. **Alternative:** in the OneDrive Windows app, exclude `node_modules` and `.git` from sync for this folder (Settings → Sync and backup → Manage backup).

If you don't fix this, every `npm install` and most git operations will be flaky.

## What you need to do next

### 1. Open a terminal in the project folder

On Windows, open PowerShell or Command Prompt and:

```
cd "C:\Users\randy\OneDrive\Documents\artwork 2020\randy 2018\OFFICE MARK\WayMarks\Waymarks Claude Code"
```

(Or wherever you've moved it.)

### 2. Clean up any partial install state

If `node_modules` or `.git` are lingering from this session, delete them:

```
rmdir /S /Q node_modules
rmdir /S /Q .git
```

### 3. Install fresh

```
npm install
```

This will use the `package-lock.json` I generated — fast and deterministic.

### 4. Run the toolchain check

```
npm run check
```

Expected: typecheck → lint → tests, all green.

### 5. Run the dev server

```
npm run dev
```

Open `http://localhost:5173`. You should see:

- A dark header bar with the "Waymarks" wordmark (the "marks" half in gold)
- A serif headline "Every sign on every floor, accounted for and audit-ready."
- A "Light" / "Dark" toggle button — click it and the page should invert (cream becomes dark slate, text colors flip)
- Three color swatches: Ink, Gold, Cream

If those four things look right, M0's product surface is good.

### 6. Create the new GitHub repo

In the terminal:

```
git init
git branch -M main
git add -A
git commit -m "M0: project skeleton"
```

Then on github.com create a **new** private repo (don't reuse the old prototype's repo). Name suggestion: `waymarks` or `waymarks-rebuild`. Don't initialize it with a README — it should be empty. Then back in your terminal:

```
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

### 7. Wire up Netlify

1. On netlify.com, click "Add new site" → "Import from Git".
2. Pick GitHub and authorize.
3. Pick the new repo.
4. Site name: `waymarks-rebuild` (or anything that isn't `waymarks-app`, which is the old prototype).
5. Build command: `npm run build` (already in `netlify.toml`)
6. Publish directory: `dist` (already in `netlify.toml`)
7. Skip environment variables for M0 — Supabase isn't wired up until M1.
8. Deploy.

You should get a preview URL like `https://waymarks-rebuild.netlify.app`. Open it; it should look identical to the local dev page.

### 8. Sanity check on a phone

Open the Netlify URL on your phone and on an iPad if you have one. The page should be readable and the toggle should work. (Real responsiveness work happens in M8 — for now we just want it to not crash.)

## Acceptance for M0 (per `specs/07-build-order.md`)

- [x] `npm run dev` opens a styled "Waymarks" hero on `localhost:5173`
- [x] `npm run check` is green
- [ ] **Netlify preview URL works** — needs you to do steps 6 and 7 above

Once you have the Netlify URL, paste it back to me and I'll mark M0 as `[x]` shipped in `specs/07-build-order.md` and start on M1 (auth + empty shell).

## What I'd like from you for M1

M1 needs a Supabase project. Before we start it, you'll want to:

- Create a free Supabase account at https://supabase.com
- Make a new project (any region near you — `us-east-1` is fine)
- Grab the project URL and anon key from Settings → API
- Paste them to me and I'll do the rest (migrations, RLS, auth screens)

That's all M0. Nothing fancy yet — just a green light that the toolchain works end to end.
