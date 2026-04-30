# 04 — Permissions and roles

The four-role security model. This is the most security-critical part of the system. Every change to UI, data, or routing must be considered through the lens of "what can each role see, and what can each role do?"

## The four roles

| Role | Scope | Description |
|---|---|---|
| `super_admin` | Global | Markur operator team. All buildings, all floors, full edit. Used for setup and resolving issues. |
| `building_admin` | One building | Property manager / facilities lead. Owns the building end-to-end. |
| `auditor` | Assigned floors | Internal or third-party. Audits and flags but cannot edit metadata or place pins. |
| `tenant_rep` | Their floor only (and their tenant's assets) | Tenant's contact. Sees their own floor. Can flag missing or wrong signs. |

## Capability matrix

The canonical list. UI hides/shows based on this; RLS enforces it server-side.

| Capability | Super | Bldg admin | Auditor | Tenant rep |
|---|---|---|---|---|
| View building list | ● all | ● their bldg | ● assigned bldgs | ● their bldg only (no list, direct nav) |
| View floor plan | ● | ● | ● assigned only | ● their floor only |
| View asset details | ● | ● | ● | ● (their floor) |
| View audit history | ● | ● | ● their sessions | — |
| View access grants | ● | ● their bldg | — | — |
| Place new pin | ● | ● | — | — |
| Edit asset details | ● | ● | — | — |
| Move/reposition pin | ● | ● | — | — |
| Delete asset | ● | ● (with confirm) | — | — |
| Mark audited | ● | ● | ● | — |
| Flag issue | ● | ● | ● | ● |
| Resolve flag | ● | ● | ● (their flag) | — |
| Upload floor plan | ● | ● | — | — |
| Replace floor plan | ● | ● (with confirm) | — | — |
| Manage user access | ● | ● their bldg | — | — |
| Invite user | ● | ● their bldg | — | — |
| Remove user | ● | ● their bldg | — | — |
| Configure building | ● | ● their bldg | — | — |
| Export data | ● | ● their bldg | — | ● their floor (CSV of their assets) |
| View audit log | ● | ● their bldg | — | — |

Legend: ● allowed, — not allowed.

## Implementation pattern

### Server side (RLS in Postgres)

Every table has policies that call `user_can(capability, scope_type, scope_id)`. See `specs/03-data-model.md` for the function definition. Policies are the source of truth — even if the UI lets a user click something they shouldn't, the server rejects the write.

### Client side (UI gating)

Use the `<Can>` component to show/hide UI:

```tsx
import { Can } from '@/lib/permissions';

<Can action="edit" resource={{ type: 'asset', id: asset.id }}>
  <Button>Edit</Button>
</Can>

<Can action="reposition" resource={{ type: 'asset', id: asset.id }}>
  <Button variant="primary">Reposition pin</Button>
</Can>
```

And the `useCan` hook for conditional rendering:

```tsx
const canEdit = useCan('edit', { type: 'asset', id: asset.id });
return canEdit ? <EditForm /> : <ReadOnlyView />;
```

Both are implemented in `src/lib/permissions.ts` and consult the local `access_grants` cache. They never hit the network — they just inform what UI to show. The server enforces.

### Capability strings

Defined as a type-safe enum:

```ts
export type Capability =
  | 'view'
  | 'edit'
  | 'create'
  | 'delete'
  | 'reposition'
  | 'audit'
  | 'flag'
  | 'resolve_flag'
  | 'upload_plan'
  | 'manage_access'
  | 'configure'
  | 'export'
  | 'view_audit_log';

export type ResourceType =
  | 'asset'
  | 'floor'
  | 'building'
  | 'tenant'
  | 'organization'
  | 'global';
```

## Scoping rules

The most important rule: **scope is always inherited downward, never upward.**

- A `building_admin` for Bay St. cannot see anything about Simcoe Pl.
- An `auditor` assigned to Floor 2 cannot see Floor 3.
- A `tenant_rep` for Suite 1306 cannot see other suites on the same floor (assets with a different `tenant_scope_id`).

For tenant reps specifically:

- They see only assets where `assets.tenant_scope_id` matches their tenant, OR assets with no tenant scope (shared common-area signs).
- The floor selector hides other floors completely (does not show them as locked or greyed out — they shouldn't know other floors exist unless deliberately exposed).
- The building list is bypassed entirely — they land directly on their floor on login.

## Special cases

### Deletion

`building_admin` can delete assets, but:
- A confirmation dialog is required ("Type DELETE to confirm").
- The asset is soft-deleted (`deleted_at` set) for 30 days, then hard-deleted by a scheduled job.
- During the soft-delete window, super admins can restore it.

`super_admin` can hard-delete. They get the same confirmation but with a different copy ("This cannot be undone").

### Reposition

This is admin-only (super or building) because moving a pin changes the wayfinding accuracy of the system. The intent flow:

1. User clicks "Reposition pin" on an asset.
2. Canvas enters a "Reposition mode" banner ("Drag pin to new location · Tap outside to cancel").
3. User drags the pin.
4. On release, a confirmation toast appears: "Move from (x1, y1) to (x2, y2)? [Confirm] [Cancel]".
5. On confirm, write goes through; old position is recorded in `audit_log`.

### Cross-org access

When a `super_admin` logs in, they see a building selector that lists every building across every organization. This is a different shape of UI from the building admin's view (which shows only their building) — implement both via `<BuildingNav>` with conditional rendering.

### Time-bounded grants

`access_grants.expires_at` lets you grant access that auto-revokes. Common cases:

- An auditor gets `expires_at = now() + 30 days` for the audit cycle.
- A consultant or contractor gets a 1-week grant.

Expired grants are filtered out by `user_can()` automatically. The "Manage access" UI shows grants with their expiry; expired grants are visible but greyed out.

### Step-up confirmation

Some actions need extra friction even for users with the capability:

- Delete asset
- Replace floor plan
- Remove a user
- Bulk delete

UX: a `<Dialog>` that requires the user to type the entity name or "DELETE" before the action button activates. Implementation in `src/components/ui/StepUpDialog.tsx`.

### Public link sharing (off by default)

A future feature: a building admin can generate a public read-only URL for a specific floor (for sharing with vendors or contractors who shouldn't have an account). Off by default at the building level (`buildings.settings.public_link_enabled = false`). Generates a token-based URL that returns a sandboxed read-only view.

For M0–M5, public link is **not** implemented. The building admin's "Public link: off" indicator in the access management UI is a placeholder showing the planned state.

## Auditing access

Every change to `access_grants` is logged in `audit_log`. The "Recent activity" view in the building settings shows:

- Who granted/revoked access
- To whom
- For what scope
- When it expires
- Who granted it

This is part of the security story — clients want to know that access changes are recorded.

## Test cases (for Playwright)

These must pass before any role-related code merges:

1. `tenant_rep` cannot see another tenant's assets on the same floor (URL param tampering test — replace `tenant_id` in URL).
2. `tenant_rep` cannot see other floors (direct URL navigation test).
3. `auditor` cannot edit asset details (UI not present) AND cannot PATCH via direct API call (RLS rejects).
4. `building_admin` for building A cannot read building B (RLS rejects).
5. Expired `access_grant` is treated as no access.
6. Soft-deleted asset is invisible to all roles except `super_admin`.
7. Public link URL returns 401 when `public_link_enabled = false`.

These live in `tests/e2e/permissions.spec.ts` and are required to pass in CI.

## What to do when adding a new capability

1. Add the capability string to the `Capability` type union.
2. Update the matrix in this document.
3. Add the rule to the `user_can()` function in `supabase/migrations/`.
4. Add a Playwright test to `tests/e2e/permissions.spec.ts`.
5. Update any `<Can>` components in the UI that should respect the new capability.
