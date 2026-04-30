# M10e verification

## What changed

1. **Error boundary at App root.** A single component crash no longer blanks
   the whole app — the user sees a Markur-branded fallback with a Reload
   button and a support email. In dev builds the error message + first 6
   stack lines are shown; in production only the friendly message is.

2. **/legal/privacy and /legal/terms.** Public routes (no auth required) at
   the URLs above, sharing a `LegalLayout` frame with header, body, and a
   small footer. Privacy covers PIPEDA + Quebec Law 25 disclosures; Terms
   covers SaaS basics and tenant data handling. **These are
   starting-point templates, not legal advice — please have a Canadian
   privacy/SaaS lawyer review before signing the first paying customer.**

3. **Cookie consent banner.** First-visit lower-right notice explaining we
   only use essential cookies, with a "Got it" dismiss that writes
   `markur:cookie-consent=accepted` to localStorage. Hidden on
   `/legal/*` so the policy reads cleanly. Required for Quebec Law 25
   posture; if we ever add analytics or marketing cookies the banner is
   where the dimmer switch goes.

4. **Step-up confirmation on revoke grant.** Revoke is destructive — the
   admin now has to type `REVOKE` to confirm, mirroring the asset
   soft-delete flow. The dialog names the user being revoked so muscle
   memory can't accidentally remove the wrong person.

5. **A11y sweep.**
   - Skip-to-main-content link (visible on focus) added to `AppShell`.
   - `<main>` is now `id="main-content" tabIndex={-1}` so the skip link
     can move focus to it.
   - Photo-thumbnail buttons in the asset drawer now have `aria-label`s
     for screen readers.
   - Footer with Privacy / Terms / support email added to AppShell so
     legal links are reachable from every signed-in screen.

## What to verify after deploy

1. Hit https://waymarks-rebuild.netlify.app — page should reload itself.
2. Open https://waymarks-rebuild.netlify.app/legal/privacy and
   https://waymarks-rebuild.netlify.app/legal/terms in a private window
   (no sign-in required). Both render with the Markur header and footer.
3. In a private window, hit `/` — the cookie banner appears bottom-right.
   Click "Got it"; the banner dismisses. Reload — banner stays gone.
4. Sign in as a building admin, open the Building view, scroll to "People
   with access", click Revoke on a non-critical grant. The step-up dialog
   should appear, naming the user. Type `REVOKE` and confirm.
5. Press Tab from the top of any signed-in page — the "Skip to main
   content" link should appear at top-left. Press Enter; focus moves to
   the main region.
6. **Force an error (dev only):** add `throw new Error('test')` to a
   route, reload, confirm the error boundary's friendly card renders with
   the Reload button (then revert).

## Lawyer-check before charging

- Privacy policy text (especially the data-retention clauses, processor
  list, and Quebec-residents block).
- Terms of Service text (limitation of liability + indemnity caps; the
  $100 CAD floor is a placeholder).
- Whether the cookie banner needs a per-category toggle in your
  jurisdiction. Right now we only have essential cookies, so a single
  acknowledgement is defensible — but if/when you add analytics, the
  banner needs to grow opt-in toggles.

## What's still in the M10 backlog (not in M10e)

- Code-splitting via `React.lazy` (perf — first-paint speed).
- Long-press reposition on touch (iPad/phone parity with desktop).
- `created_at` preservation in offline drain (audit history accuracy
  when events sync after the fact).

These are nice-to-haves for the first customer, not blockers.

## What's queued for M11

- Per-organization customizable asset types: replace the static CHECK
  constraint with `org_asset_types` table + admin UI.
