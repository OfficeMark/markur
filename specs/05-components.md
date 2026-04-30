# 05 — Component library

Inventory of every component, with prop signatures and required states. Anything not listed here is too small/local to need spec — implement inline in the feature module.

## UI primitives (`src/components/ui/`)

These are reusable across the entire app and have no domain knowledge.

### Button

```tsx
type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;
```

States: default, hover, focus-visible, active, disabled, loading.

Variants:

- `primary` — `bg-waymarks-ink text-white hover:bg-waymarks-ink/90`
- `secondary` — `border border-black/15 hover:bg-black/5`
- `ghost` — transparent, `hover:bg-black/5`
- `danger` — `border border-danger text-danger hover:bg-danger/5`
- `gold` — `bg-waymarks-gold text-white hover:bg-waymarks-gold/90` (the brand action)

Loading state: replace icon with spinner; disable.

### Card

```tsx
type CardProps = {
  variant?: 'default' | 'soft' | 'raised';
  as?: keyof JSX.IntrinsicElements;
  children: React.ReactNode;
};
```

- `default` — white bg, 1 px border, `rounded-lg`, `p-4`
- `soft` — `bg-waymarks-cream`, no border, `rounded-lg`, `p-4`
- `raised` — white bg, 1 px border, subtle shadow, `rounded-lg`, `p-4`

### Drawer

Slide-out panel. Adapts to viewport:

- ≥ `xl:` → side panel, fixed 360 px wide on the right
- `md:` to `xl:` → overlay drawer with backdrop, full height
- `< md:` → bottom sheet, drag handle on top, can be dismissed by drag-down

```tsx
type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: 'right' | 'bottom';   // auto-determined by viewport, but override-able
  title?: string;
  children: React.ReactNode;
};
```

Built on Radix Dialog. Always render `<Dialog.Title>` (visible or `sr-only` for a11y).

States to handle: opening/closing animation, backdrop click, Esc key, swipe-to-dismiss on mobile.

### Dialog

Modal for confirmations, conflicts, and step-up confirmations.

```tsx
type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};
```

### StepUpDialog

A specific dialog for destructive actions that requires the user to type a confirmation string.

```tsx
type StepUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  warning: string;                     // 'This cannot be undone.'
  confirmString: string;               // 'DELETE' or asset name
  onConfirm: () => Promise<void>;
};
```

The Confirm button is disabled until the user types `confirmString` exactly.

### Toast

Use the `sonner` library or a small custom one. Toast types: success, info, warning, error.

```tsx
toast.success('Audit saved');
toast.error('Sync failed', { action: { label: 'Retry', onClick: ... } });
```

Don't use toasts for things that are already represented by the SyncChip or status badges. Toasts are for transient confirmations.

### Chip

```tsx
type ChipProps = {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};
```

Used for type filters (Directory, Tenant ID, etc.) and status pills.

### MetricCard

```tsx
type MetricCardProps = {
  label: string;                       // "TOTAL ASSETS", uppercased visually
  value: string | number;              // 24 px / 500
  trend?: { delta: number; period: string }; // optional
  status?: 'success' | 'warning' | 'danger';
};
```

Used in the stats row above the canvas (Total / Good / Attention / Audit due).

### EmptyState

```tsx
type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
};
```

Examples:
- Building list with no buildings: "Create your first building" + CTA
- Floor with no plan uploaded: "Upload a floor plan to get started" + CTA
- Floor with no assets: "Place your first sign" + arrow pointing to the canvas

### ErrorState

```tsx
type ErrorStateProps = {
  title: string;
  detail?: string;                     // technical detail, can be revealed via "Show details"
  onRetry?: () => void;
  helpUrl?: string;
};
```

### Avatar

```tsx
type AvatarProps = {
  name: string;                        // for initials fallback
  src?: string;
  size?: 'sm' | 'md' | 'lg';
};
```

### RoleBadge

```tsx
type RoleBadgeProps = {
  role: 'super_admin' | 'building_admin' | 'auditor' | 'tenant_rep';
  scopeLabel?: string;                 // "161 Bay St." or "Floor 2"
};
```

Renders the role with appropriate color (gold for super, blue for building admin, teal for auditor, purple for tenant rep) and the scope qualifier.

### SyncChip

The persistent header indicator. See `specs/06-features.md` § offline for full state machine.

```tsx
type SyncChipProps = {
  state: 'synced' | 'syncing' | 'offline' | 'queued' | 'conflict';
  pendingCount?: number;
  conflictCount?: number;
  onClick?: () => void;
};
```

Each state has a distinct visual (color + icon + label). Click opens the pending changes panel.

### PermissionGate / Can

```tsx
type CanProps = {
  action: Capability;
  resource: { type: ResourceType; id?: string };
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

<Can action="edit" resource={{ type: 'asset', id: asset.id }} fallback={<ReadOnly />}>
  <EditForm />
</Can>
```

## Domain components (`src/components/Markur/`)

These know about the Markur data model.

### FloorPlanCanvas

The big interactive canvas. Renders the floor plan and the pin overlay.

```tsx
type FloorPlanCanvasProps = {
  floor: Floor;
  assets: Asset[];
  selectedAssetId?: string;
  onSelectAsset?: (id: string) => void;
  onCanvasClick?: (x: number, y: number) => void;   // for placing new pins
  mode?: 'view' | 'placing' | 'repositioning';
  zoom?: number;
  pan?: { x: number; y: number };
  onZoomChange?: (zoom: number) => void;
  onPanChange?: (pan: { x: number; y: number }) => void;
};
```

Internals:
- Renders PDF via PDF.js into a canvas element
- Pin overlay is absolutely-positioned divs over the canvas, computed from normalized 0–1 coords × canvas dimensions
- Supports pinch-to-zoom on touch, scroll-to-zoom on desktop
- Double-tap to fit-to-view
- Keyboard: arrow keys pan, +/- zoom, Esc cancels mode

States to handle:
- Loading the PDF (skeleton)
- PDF render error (ErrorState with retry)
- Empty (no plan uploaded yet — show upload CTA)
- Mode-specific cursor and outline (e.g., crosshair in placing mode, dashed outline in repositioning)

### PinMarker

A single asset pin.

```tsx
type PinMarkerProps = {
  asset: Asset;
  selected?: boolean;
  pendingSync?: boolean;
  onClick?: () => void;
  onMoveStart?: () => void;             // when in repositioning mode
};
```

Visual:
- Color from `asset.status` (good/warning/danger)
- 32 px on touch devices, 28 px on mouse
- White ring around the dot
- Selected: gold halo (4 px ring at 30 % opacity)
- Pending sync: dashed gold ring (animated)
- Conflict: red `!` overlay

Accessibility:
- Each pin is a `<button>` with `aria-label="Lobby directory, Floor 2, audited Apr 25"`
- Keyboard-focusable
- Status conveyed by both color and icon shape (see `02-design-system.md` § Accessibility)

### BuildingNav

The left sidebar with buildings + floors.

```tsx
type BuildingNavProps = {
  buildings: Building[];
  selectedBuildingId?: string;
  selectedFloorId?: string;
  onSelectBuilding: (id: string) => void;
  onSelectFloor: (id: string) => void;
  layout?: 'desktop' | 'tablet' | 'mobile';
};
```

Layout variants:
- `desktop` — fixed left sidebar, 240 px
- `tablet` — collapsed icon column, expands on click into a sheet
- `mobile` — bottom-sheet trigger; full-screen list when opened

For tenant_rep role: the building list is hidden, and only their floor is shown.

### AssetDrawer

The right-side drawer with asset detail.

```tsx
type AssetDrawerProps = {
  assetId: string | null;              // null = closed
  onClose: () => void;
};
```

Internal sections (in order):
- Header (close X, type badge color)
- Photo (with replace CTA — gated by `<Can action="edit">`)
- Title + type + location (in a serif font)
- Status row (3× MetricCard: Last audit / Status / Flags)
- Details (Manufacturer, Installed, Audit cycle)
- Actions row (Edit, Replace photo, Reposition pin (admin), Add flag)
- Activity timeline (last 10 audit_log entries for this asset)
- Permissions footer ("Visible to: ... · Reposition is admin-only")

### AuditModeShell

Full-screen audit walkaround layout.

```tsx
type AuditModeShellProps = {
  sessionId: string;
  floor: Floor;
  assets: Asset[];
  onExit: () => void;
};
```

Layout:
- Top bar: AUDIT badge, "<floor>", progress bar, End Audit button
- Floor plan (full viewport)
- Bottom action sheet (sticky):
  - Photo thumb + asset name + type
  - Status pill
  - Big "Confirm OK" / "Flag issue" buttons
  - "Skip" link

Behavior:
- Tap a pin → sheet updates with that asset
- Confirm → marks the asset as audited in the session, advances to next nearest unaudited
- Flag → opens flag dialog, then advances
- Skip → advances without recording
- End Audit → shows AuditCompleteSummary

### AuditCompleteSummary

The modal at end of audit.

```tsx
type AuditCompleteSummaryProps = {
  sessionId: string;
  floor: Floor;
  total: number;
  audited: number;
  missed: number;
  missedAssets: Asset[];
  onReviewFloor: () => void;
  onDone: () => void;
};
```

### FilterPanel

The slide-out filter panel for asset types.

```tsx
type FilterPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTypes: AssetType[];
  onChange: (types: AssetType[]) => void;
};
```

Two sections (Signage / Facilities), checkbox per type with color dot, All/None buttons at bottom.

### PendingChangesList

Lists local writes waiting to sync.

```tsx
type PendingChangesListProps = {
  changes: PendingWrite[];
  onSyncAll: () => void;
  onDismiss: (id: string) => void;     // user-initiated discard
};
```

Each row: status dot (color by operation type), description, timestamp.

### ConflictResolverDialog

Resolves a sync conflict.

```tsx
type ConflictResolverDialogProps = {
  conflict: Conflict;
  onResolve: (resolution: ConflictResolution) => Promise<void>;
};

type Conflict = {
  asset_id: string;
  local_changes: PendingWrite[];
  server_changes: { user: User; changes: object[]; at: Date };
  conflicting_fields: string[];        // ['photo_url']
};
```

Renders side-by-side cards (Your change · Offline / Server · {user}) and radio choices for each conflicting field. "Resolve" applies the chosen resolution; "Decide later" parks the conflict.

### AccessManagementCard

The "Who can see this building" card.

```tsx
type AccessManagementCardProps = {
  buildingId: string;
};
```

Shows:
- Roles + counts per role
- Public link state (off / on with token)
- "Manage access" button → opens the full access management drawer

### NewAssetDialog

Triggered by "Add Asset" or by clicking a blank floor plan area in placing mode.

```tsx
type NewAssetDialogProps = {
  floor: Floor;
  position: { x: number; y: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (asset: NewAsset) => Promise<void>;
};
```

Form (React Hook Form + Zod):
- Type (select: directory, tenant_id, etc.)
- Name (text)
- Location notes (textarea)
- Photo (upload OR camera capture on mobile/tablet)
- Tenant scope (optional select; only if there are tenants on this floor)

### FloorPlanUploadDialog

```tsx
type FloorPlanUploadDialogProps = {
  floor: Floor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (file: File) => Promise<UploadResult>;
};
```

The dialog handles:
- File picker (PDF, PNG, JPG)
- Validation: size limit (15 MB), type check, page count ≤ 1
- PDF metadata extraction (title, author, embedded text) — used for mismatch detection
- Mismatch warning if metadata suggests a different building/floor
- Confirm → upload → render preview

## Component states checklist

For every component that touches data, ensure these states are designed and tested:

- [ ] Loading (skeleton or spinner)
- [ ] Empty (CTA to populate)
- [ ] Error (retry option)
- [ ] Success (default rendered state)
- [ ] Permission denied (`<Can fallback={...}>`)
- [ ] Offline (using cached data, indicator visible)
- [ ] Pending sync (local write not yet pushed)
- [ ] Conflict (server has diverged)

## Storybook

Optional but recommended in M5 polish: install Storybook for the UI primitives so each component's variants are documented and visually regression-tested.
