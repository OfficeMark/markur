# M10d verification

## What changed

1. **Dark mode disabled.** `ThemeProvider` now forces light/cream regardless of
   OS preference. The `.dark` class is stripped on mount and the saved
   `waymarks:theme` localStorage key is cleared, so users coming back from a
   previous build that toggled dark mode will be reset to light.
   - Reason: a half-working dark mode (token mappings inverted, Login tab
     strip unreadable, canvas surround dark) is worse than none. Will revisit
     once there's actual demand.

2. **Five new asset types** — added by migration `0015_m10d_new_asset_types.sql`
   and wired through `lib/pin-types.ts` (palette + label) and the two
   dropdowns in `NewAssetDialog` and `AssetDrawer`:
   - `donor_plaque` — bronze (`#B45309`)
   - `donor_wall` — dark bronze (`#92400E`)
   - `nameplate` — navy (`#1E40AF`)
   - `wall_mural` — magenta (`#BE185D`)
   - `decorative_feature` — rose (`#9F1239`)

   `FilterByTypePopover` and `AssetGridView` iterate from `TYPE_LIST`, so
   they pick up the new types automatically without code changes.

3. **First proof that the M10c SW auto-reload works.** This deploy should
   land without requiring a hard refresh — the `controllerchange` listener
   installed in M10c will reload the page once the new SW takes over.

## What to verify after deploy

1. Open https://waymarks-rebuild.netlify.app — the page should reload itself
   shortly after the new build is live (no manual hard-refresh needed).
2. The Login screen and the page background should be cream/light even if
   your OS is set to dark mode.
3. Click "Add asset" and confirm the type dropdown now lists Donor plaque,
   Donor wall, Nameplate, Wall mural, Decorative feature under Signage.
4. Drop one of each new type on a floor and verify each pin shows in the
   correct color (bronze, dark bronze, navy, magenta, rose).
5. Open Filter by type — the new types should appear with their dot colors
   in the Signage column, and toggling them should hide/show pins.
6. Open Grid view — the new types should render in the type column.

## What's still owed (M11 backlog, not in M10d)

- Per-organization customizable asset types: `org_asset_types` table,
  replace the static CHECK constraint with an FK, admin UI to add/remove
  types relevant to that organization's business model.
