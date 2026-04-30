# 02 — Design system

The visual language for Markur. Everything in this file is implemented in `tailwind.config.ts`, `src/styles/globals.css`, and the components in `src/components/ui/`.

## Brand voice

Quiet, professional, archival. The product helps property managers feel organized — not excited. Type pairs a serif (for headings and the wordmark) with a clean sans (for everything else) and mono (for codes, IDs, timestamps).

## Color tokens

Defined as CSS variables in `:root` and exposed to Tailwind via the theme.

```css
:root {
  /* Brand */
  --waymarks-ink: 31 41 56;            /* #1F2938 — dark slate, header bg */
  --waymarks-gold: 193 161 105;        /* #C1A169 — primary accent */
  --waymarks-gold-soft: 247 245 238;   /* #F7F5EE — gold-tinted surface */
  --waymarks-cream: 245 241 232;       /* #F5F1E8 — page surface */

  /* Semantic */
  --color-success: 31 110 74;          /* #1F6E4A */
  --color-success-bg: 233 244 238;
  --color-warning: 138 106 46;         /* #8A6A2E */
  --color-warning-bg: 251 244 226;
  --color-danger: 184 70 63;           /* #B8463F */
  --color-danger-bg: 252 235 235;
  --color-info: 24 95 165;             /* #185FA5 */
  --color-info-bg: 230 241 251;

  /* Neutrals (warm) */
  --color-text: 44 44 42;              /* #2C2C2A */
  --color-text-muted: 95 94 90;        /* #5F5E5A */
  --color-text-faint: 136 135 128;     /* #888780 */
  --color-border: 0 0 0 / 0.08;
  --color-border-strong: 0 0 0 / 0.18;
  --color-surface: 255 255 255;
  --color-surface-soft: 247 245 238;
}

@media (prefers-color-scheme: dark) {
  :root {
    /* Reserved — design dark mode after M5. Defaults work in both. */
  }
}
```

Use as Tailwind classes:

```html
<div class="bg-waymarks-ink text-white">…</div>
<button class="bg-waymarks-gold text-white hover:bg-waymarks-gold/90">…</button>
<p class="text-text-muted">…</p>
```

### Status colors for asset pins

| Status | Color | Hex | Meaning |
|---|---|---|---|
| Good | Green | `#6CC28A` | Audited recently, no flags |
| Audit due | Gold | `#C1A169` | Outside the audit cycle |
| Flagged | Red | `#B8463F` | Issue raised, needs action |
| Selected | Gold + halo | — | Currently focused (drawer open) |
| Pending sync | Gold dashed border | — | Local change not yet synced |

These are also the colors of the chips and badges that show those states.

## Typography

| Role | Family | Size | Weight | Use |
|---|---|---|---|---|
| Display | `Cormorant Garamond` (serif) | 28–40 px | 500 | Hero headings, marketing, splash |
| Heading | `Cormorant Garamond` (serif) | 18–24 px | 500 | Section titles, asset names |
| Body | `Inter` (sans) | 14–16 px | 400 | Default body text |
| Body bold | `Inter` (sans) | 14–16 px | 500 | Emphasis (use sparingly) |
| Label | `Inter` (sans) | 11–12 px | 500 | Uppercase, letterspaced labels (e.g., `BUILDINGS`) |
| Caption | `Inter` (sans) | 11–12 px | 400 | Helper text, timestamps |
| Code/Mono | `JetBrains Mono` | 12–13 px | 400 | IDs, file names, sizes |

Loaded via `<link rel="preconnect">` to fonts.bunny.net (a privacy-friendly Google Fonts mirror) or self-hosted in `public/fonts/`. Fallbacks: `serif` and `system-ui`.

Tailwind families:

```ts
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
  mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
}
```

Conventions:

- Sentence case everywhere. Never Title Case, never ALL CAPS (except labels with letterspacing — that's a stylistic uppercase, not a content uppercase).
- Two weights only: 400 and 500. Never 600/700 (looks heavy).
- Body line-height: 1.6. Heading line-height: 1.2.
- Numbers in stat cards: 24 px / 500.

## Spacing

Tailwind defaults (4 px scale). Common values:

- Component padding: `p-3` (12 px) for compact, `p-4` (16 px) for default, `p-6` (24 px) for cards
- Vertical rhythm: `space-y-4` (16 px) for related items, `space-y-8` (32 px) for sections
- Page gutter: `px-4` on mobile, `px-6` on tablet, `px-8` on desktop

## Borders and corners

- Borders: `border` (1 px) for default, `border-2` only for "selected" or "featured" emphasis.
- Border color: `border-black/10` for subtle, `border-black/20` for hover, semantic colors for status.
- Corners: `rounded-md` (6 px) for small elements, `rounded-lg` (8 px) for cards, `rounded-xl` (12 px) for sheets/drawers, `rounded-full` for pills and circles.
- Avoid: rounded corners on single-side borders (they look broken).

## Shadows

Don't use shadows for visual decoration. Use them only for:

- Drawer/sheet over canvas: `shadow-xl shadow-black/15` to lift it off
- Focus rings: handled by Radix automatically; ensure visible with `focus-visible:ring-2 focus-visible:ring-waymarks-gold`

No drop shadows on cards. Use a 1 px border instead.

## Breakpoints

Standard Tailwind breakpoints, with named meanings:

| Name | Min width | Devices | Layout pattern |
|---|---|---|---|
| (default) | 0 | Phone portrait | Single column, no sidebar, bottom action sheet |
| `sm:` | 640 px | Phone landscape, small tablet | Same as default; minor tweaks |
| `md:` | 768 px | iPad portrait | Sidebar slides in as a sheet; drawer slides up from bottom |
| `lg:` | 1024 px | iPad landscape, small laptop | Sidebar visible (collapsible); drawer overlays canvas |
| `xl:` | 1280 px | Desktop | Three-pane layout: sidebar + canvas + drawer side by side |
| `2xl:` | 1536 px | Wide desktop | Same as `xl:` with more whitespace |

The "three primary devices" map:
- **Mobile (default → sm)**: hands-on audits, single task focus
- **iPad (md → lg)**: presenting, walking with tablet, touch-first
- **Desktop (xl+)**: planning, reporting, bulk operations

## Components inventory (high level — full specs in `05-components.md`)

UI primitives (`src/components/ui/`):
- `Button` (variants: primary, secondary, ghost, danger; sizes: sm, md, lg)
- `Card` (variants: default, soft, raised)
- `Drawer` (slide-in from right; side-panel on desktop, overlay on iPad, bottom-sheet on mobile)
- `Dialog` (modals)
- `Toast` (notifications)
- `Chip` (filter pills, status pills)
- `MetricCard` (label + big number + optional sparkline)
- `Spinner` (loading)
- `EmptyState`
- `ErrorState`
- `Avatar`
- `RoleBadge`
- `SyncChip` (the header sync state indicator)
- `PermissionGate` (the `<Can>` wrapper)

Domain components (`src/components/Markur/`):
- `FloorPlanCanvas` (renders PDF or image; provides zoom, pan, pin overlay)
- `PinMarker` (single asset pin; status color, selected state, draggable in admin mode)
- `BuildingNav` (sidebar/sheet listing buildings + floors)
- `AssetDrawer` (the right-side drawer with asset detail)
- `AuditModeShell` (full-screen audit walkaround)
- `AuditCompleteSummary` (the modal at end of audit)
- `FilterPanel` (signage + facilities type filter)
- `PendingChangesList`
- `ConflictResolverDialog`
- `AccessManagementCard`

## Iconography

`lucide-react` for all icons. Standard sizes:

- Inline / chip: 14 px
- Button: 16 px
- Toolbar: 18 px
- Hero / empty states: 24 px

Always set explicit `size` on `<lucide.Icon size={16} />` — never rely on inheritance.

Avoid emoji entirely. They render inconsistently across devices, especially older iPads.

## Motion

Use sparingly. Two motion principles:

1. **Fast for control feedback** (clicks, hovers, focus): 100–150 ms ease-out
2. **Slower for spatial transitions** (drawer open, sheet slide, page transition): 250–300 ms ease-in-out

Use Tailwind's `transition` utilities:

```html
<button class="transition-colors duration-150">…</button>
<div class="transition-transform duration-300 ease-out">…</div>
```

Avoid bouncy or springy animations. The product feels like an enterprise tool, not a game.

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; }
}
```

## Accessibility minimums

- WCAG 2.1 AA contrast for all text (the brand palette above is verified — keep it).
- All interactive elements reachable by keyboard.
- Focus visible by default. Don't override `outline: none` without replacing with a ring.
- Form inputs always have associated `<label>` (visible or `sr-only`).
- Status conveyed by both color and text/icon (never color alone — colorblind users need the redundancy).
- Pin status conveyed by color + icon shape (a small dot for good, triangle for warning, square for flagged) so colorblind auditors can read a floor.
- All Radix components include the right ARIA out of the box; don't undo that.

## Empty / loading / error states

Every screen that loads data must have:

1. **Loading state**: skeleton placeholders, not just a spinner
2. **Empty state**: a friendly description and a primary CTA
3. **Error state**: what happened, what the user can do, a retry button

Use the `<EmptyState>` and `<ErrorState>` components. Don't roll your own per-screen.

## Tailwind config skeleton

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        Markur: {
          ink: 'rgb(var(--waymarks-ink) / <alpha-value>)',
          gold: 'rgb(var(--waymarks-gold) / <alpha-value>)',
          'gold-soft': 'rgb(var(--waymarks-gold-soft) / <alpha-value>)',
          cream: 'rgb(var(--waymarks-cream) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'rgb(var(--color-text) / <alpha-value>)',
          muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
          faint: 'rgb(var(--color-text-faint) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          bg: 'rgb(var(--color-success-bg) / <alpha-value>)',
        },
        warning: { /* ... */ },
        danger: { /* ... */ },
        info: { /* ... */ },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
} satisfies Config;
```
