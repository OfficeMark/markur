# Spec 08 — M14: admin customization (asset types + members)

Author: drafted 2026-05-03 with Randy. For Claude Code to execute.

## What this milestone does

Closes the gap left by M11. Today an org admin can *add* org-specific asset types but cannot tweak the 17 seeded globals (directory, egress, tenant_id, etc.) — they're locked. M14 lets an org admin override globals for their org (hide, rename, recolor, reorder) without affecting other orgs. It also adds the missing admin views for *who has access* and *who has been invited but hasn't accepted*.

Three sub-milestones, ship independently in this order:

- **M14** — asset type overrides (hide / rename / recolor / reorder globals; full edit on org-specific)
- **M14a** — members management (see who has access, change role, revoke)
- **M14b** — pending invitations admin (list, resend, revoke)

Each ships green on its own. M14a and M14b can ship in either order after M14.

## Out of scope (deliberately deferred)

- A third level of grouping above category (e.g. "Wayfinding" group containing directory + tenant_id + tenant_products). That's a bigger schema and UI change; spec separately if Randy wants it.
- Custom asset fields per org (manufacturer SKU, install date, etc.) — separate milestone.
- CSV export / bulk import — separate milestone.
- Org branding (logo upload, custom invitation email header) — separate milestone, useful but unrelated.
- Audit log of admin actions — separate milestone.

---

## M14 — asset type overrides

### The shape of the change

Today: `org_asset_types` has globals (`org_id IS NULL`) and org-specific rows (`org_id` set). Globals are read-only to org admins.

After M14: globals stay read-only at the row level (we never mutate them — other orgs depend on them). Each org gets a sibling **overrides** table where they record *what should change* about a global *for their org only*. The frontend merges global + overrides + org-specific into the effective catalog.

For org-specific rows, the existing edit/delete remains, but we add edit-in-place (label, color, category, sort_order). Today only delete is supported.

### Data model

New migration `0019_m14_org_asset_type_overrides.sql`:

```sql
create table public.org_asset_type_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  global_key text not null,
  hidden boolean not null default false,
  label_override text,
  color_override text,
  sort_order_override integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, global_key),
  constraint override_color_format check (
    color_override is null or color_override ~ '^#[0-9A-Fa-f]{6}$'
  ),
  constraint override_key_format check (global_key ~ '^[a-z][a-z0-9_]*$')
);

create index org_asset_type_overrides_org_idx
  on public.org_asset_type_overrides(org_id);

create trigger set_updated_at_org_asset_type_overrides
  before update on public.org_asset_type_overrides
  for each row execute function public.set_updated_at();

alter table public.org_asset_type_overrides enable row level security;

create policy "overrides_select_authenticated"
  on public.org_asset_type_overrides for select
  using (auth.uid() is not null);

create policy "overrides_admin_write"
  on public.org_asset_type_overrides for all
  using (
    public.user_can('configure', 'global', null)
    or exists (
      select 1
      from public.access_grants ag
      where ag.user_id = auth.uid()
        and ag.role = 'building_admin'
        and ag.scope_type = 'building'
        and ag.scope_id in (
          select b.id from public.buildings b
          where b.owner_org_id = org_asset_type_overrides.org_id
            and b.deleted_at is null
        )
    )
  )
  with check (
    public.user_can('configure', 'global', null)
    or exists (
      select 1
      from public.access_grants ag
      where ag.user_id = auth.uid()
        and ag.role = 'building_admin'
        and ag.scope_type = 'building'
        and ag.scope_id in (
          select b.id from public.buildings b
          where b.owner_org_id = org_asset_type_overrides.org_id
            and b.deleted_at is null
        )
    )
  );
```

If `set_updated_at()` doesn't already exist as a generic trigger function, the migration must add it (single-line: `new.updated_at = now(); return new;`). Check `0001_init.sql` first.

Also in the same migration: relax the org-specific row constraint so `category` can be edited (it's a CHECK currently). Verify the existing CHECK is `check (category in ('signage', 'facility'))` and that it accepts UPDATE — if RLS allows the update at the row level, the CHECK does not need changing. Confirm with `\d+ org_asset_types` before assuming.

### Backend query layer

Touch `src/lib/queries/asset-types.ts`:

```typescript
export type OrgAssetTypeOverride = {
  id: string;
  org_id: string;
  global_key: string;
  hidden: boolean;
  label_override: string | null;
  color_override: string | null;
  sort_order_override: number | null;
};

export type EffectiveAssetType = {
  // Stable identity for React keys.
  id: string;
  // What's used as assets.type. Same as the global's key for overridden
  // globals; same as the org-specific row's key for org-specifics.
  key: string;
  // What gets shown.
  label: string;
  color: string;
  category: AssetTypeCategory;
  sort_order: number;
  // Where this came from. The card uses these for the lock indicator.
  source: 'global' | 'global-overridden' | 'org-specific';
  hidden: boolean;
  // The underlying row(s) for edit/delete operations.
  org_specific_id?: string;       // present iff source === 'org-specific'
  override_id?: string;            // present iff source === 'global-overridden'
};

export async function listEffectiveAssetTypes(orgId: string | null):
  Promise<EffectiveAssetType[]> {
  // 1. Fetch globals + org-specific rows (existing query).
  // 2. Fetch overrides for orgId (skip if orgId is null).
  // 3. Merge: for each global, apply its override (if any). For each
  //    org-specific row, surface as-is. Sort by category, sort_order, label.
}

export async function setOverride(input: {
  org_id: string;
  global_key: string;
  hidden?: boolean;
  label_override?: string | null;
  color_override?: string | null;
  sort_order_override?: number | null;
}): Promise<OrgAssetTypeOverride> {
  // upsert by (org_id, global_key)
}

export async function clearOverride(orgId: string, globalKey: string): Promise<void>;

export async function updateAssetType(id: string, patch: Partial<NewAssetTypeInput>):
  Promise<OrgAssetType>;
```

Frontend hook `src/hooks/useAssetTypes.ts` shifts from `useAssetTypes()` returning a flat list to returning effective types. Existing callers (`AssetDrawer`, `NewAssetDialog`, the floor-plan filter) consume `.list` — that contract holds; the merged shape is identical for ordering and color/label purposes. Add `.signage`, `.facility` filters that respect `hidden=true` (hidden types are excluded from selectable lists).

`pin-types.ts` `setRuntimeAssetTypes()` still receives the merged map. Hidden types should still be in the map — existing assets of a hidden type must continue to display correctly with their effective color/label. The "hidden" only applies to selection in dropdowns and filters.

### UI changes — `AssetTypesCard.tsx`

- Render globals and org-specific in two collapsible sections (collapsed by default for globals, expanded for org-specific).
- For each global row:
  - Inline label edit (click → text input, blur → save). If equal to original label, clear the override.
  - Color swatch click opens the same picker used for new types.
  - Drag handle for reorder (use dnd-kit, lightweight).
  - "Hide" toggle (eye-off icon). Hiding triggers a confirmation if N>0 assets currently use this type for any building owned by the org. Show the count.
  - "Reset" button (visible only when an override exists) clears the override.
- For each org-specific row:
  - Label, color, sort_order all editable inline.
  - Delete unchanged. If deletion would orphan N assets, show the same count warning.
- Add a "Reorder" / "Done reordering" mode toggle so casual users don't accidentally drag.

### Acceptance criteria (M14)

1. As a building admin, I can hide "Donor plaque" for my org. New asset dropdowns no longer offer it. Existing donor-plaque assets still render in their original color.
2. I can rename "Tenant ID" to "Tenant suite" for my org. The new name shows everywhere immediately. Other orgs are unaffected.
3. I can change the color of a global for my org without affecting other orgs.
4. I can reorder all types (globals + org-specific) by dragging. Order persists. The dropdown reflects the new order.
5. I can reset any override with one click.
6. I can edit (not just delete) my org-specific types.
7. Hidden type's assets still display correctly on floor plans, in audit walkaround, and in the drawer (read-only data is unaffected).
8. Existing migrations and `tsc -b && vite build` pass clean.

---

## M14a — members management

### Where it goes

New card on `/settings`: `MembersCard.tsx`. Shows the people who have access to buildings owned by the user's org, plus a way to change role or revoke.

### Data model

No schema change. Reads from `access_grants`, `auth.users` (via a simple view or a join through `profiles` if it exists), and `buildings`.

Add migration `0020_m14a_members_view.sql` with a SECURITY DEFINER view (or inline RLS-respecting query) that returns:

```
member_id, email, display_name, role, scope_type, scope_id, scope_label, granted_at
```

Reuse whatever `pending_invitations` already references for resolving user identity. Don't expose `auth.users` directly; use the profile table if one exists.

### Backend query layer

`src/lib/queries/members.ts`:

```typescript
export type Member = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: 'super_admin' | 'building_admin' | 'tenant_rep';
  scope_type: 'global' | 'building' | 'tenant';
  scope_id: string | null;
  scope_label: string;     // human-readable: building name, tenant name, etc.
  granted_at: string;
};

export async function listMembers(orgId: string): Promise<Member[]>;
export async function updateMemberRole(grantId: string, role: Member['role']): Promise<void>;
export async function revokeMember(grantId: string): Promise<void>;
```

### UI — `MembersCard.tsx`

- List grouped by building (or "Org-wide" for global grants).
- Each row: avatar/initials, email, display name, role pill (selectable dropdown for admins), revoke button.
- "You can't revoke yourself" — disable the row for the current user, with hover tooltip.
- "Add member" button opens the existing `NewInvitationDialog` (no rebuilding needed).
- Confirmation dialog on revoke: "Revoke access for {name}? They will lose access immediately." Show what they currently have access to.
- Confirmation on role change: "Change {name} from {old} to {new}? This affects what they can see and do." Brief explanation of the role's powers.

### Acceptance criteria (M14a)

1. As an org admin, I see every person who has access to any of my buildings.
2. I can change someone from tenant_rep to building_admin and back. The change takes effect on their next page load.
3. I can revoke a member. They lose access immediately. Their pending in-progress audit (if any) drains via the offline-queue mechanism on next load.
4. I cannot revoke myself.
5. The "Add member" button opens the existing invitation flow (M13 is unchanged).

---

## M14b — pending invitations admin

### Where it goes

Card on `/settings`: `PendingInvitationsCard.tsx`. Lists invitations from `pending_invitations` that have not yet been accepted.

### Data model

No schema change required if `pending_invitations` already has `created_at`, `expires_at`, `accepted_at`, `revoked_at`, `email`, `role`, `target_building_id`. If `revoked_at` doesn't exist, add it in `0021_m14b_invitation_revoke.sql`.

### Backend query layer

Extend `src/lib/queries/invitations.ts`:

```typescript
export type PendingInvitation = {
  id: string;
  email: string;
  role: Member['role'];
  target_label: string;       // building name or "Org-wide"
  created_at: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

export async function listInvitations(orgId: string): Promise<PendingInvitation[]>;
export async function resendInvitation(id: string): Promise<void>;
export async function revokeInvitation(id: string): Promise<void>;
```

`resendInvitation` re-invokes the M13 Edge Function with the same `invitation_id`. The function should already be idempotent for resend; verify by reading `supabase/functions/send-invitation-email/index.ts` and confirming it handles the case where `accepted_at IS NULL` and just re-sends without recreating the row.

### UI — `PendingInvitationsCard.tsx`

- Each row: email, role, target (building or org), sent date, expires-in (e.g. "in 5 days").
- Status pill: Pending (amber), Expired (gray strikethrough), Revoked (gray).
- Actions: "Copy link", "Resend email", "Revoke".
- If the M13 Edge Function isn't configured (no `RESEND_API_KEY`), Resend button is disabled with a tooltip pointing to setup instructions; Copy link still works.

### Acceptance criteria (M14b)

1. As an org admin, I see every pending invitation, sorted by most recent first.
2. I can resend an invitation; the recipient gets a new email with the same link.
3. I can revoke an invitation; the link no longer works (`/accept/<token>` shows an error).
4. Expired invitations show a clear expired status and the recipient gets a "this invite has expired, ask for a new one" page.
5. Once accepted, the invitation disappears from this list and the new member appears in M14a's MembersCard.

---

## Migration list

- `0019_m14_org_asset_type_overrides.sql` — overrides table + RLS
- `0020_m14a_members_view.sql` — read-only view for member listing (only if needed; may not be required if we just join in TS)
- `0021_m14b_invitation_revoke.sql` — adds `revoked_at` to `pending_invitations` (only if missing)

Number them sequentially regardless of which sub-milestone ships first; gaps are confusing.

## Files touched

```
supabase/migrations/0019_m14_org_asset_type_overrides.sql            (new)
supabase/migrations/0020_m14a_members_view.sql                       (new, conditional)
supabase/migrations/0021_m14b_invitation_revoke.sql                  (new, conditional)
src/lib/queries/asset-types.ts                                       (extend)
src/lib/queries/members.ts                                           (new)
src/lib/queries/invitations.ts                                       (extend)
src/hooks/useAssetTypes.ts                                           (refactor)
src/hooks/useMembers.ts                                              (new)
src/hooks/useInvitations.ts                                          (new or extend)
src/components/waymarks/AssetTypesCard.tsx                           (rewrite UI section)
src/components/waymarks/MembersCard.tsx                              (new)
src/components/waymarks/PendingInvitationsCard.tsx                   (new)
src/routes/Settings.tsx                                              (mount new cards)
src/types/database.ts                                                (regenerate or hand-extend)
push-m14.ps1, push-m14a.ps1, push-m14b.ps1                           (one per ship)
docs/m14-verification.md, docs/m14a-verification.md, ...             (one per ship)
```

## Risks and edge cases

- **RLS performance.** The `overrides_admin_write` policy joins `access_grants` → `buildings`. On large orgs (many buildings) the planner may not use the right index. Verify `EXPLAIN` on the policy after deploying.
- **Optimistic updates.** For inline edits (label, color), use React Query's `onMutate` with rollback so the UI feels instant. The card today doesn't do this; users will notice.
- **Hidden global with N existing assets.** Need a clear modal showing the count *and* offering "show me the affected assets" link to a filtered floor view. If we don't, admins will hide things and then panic when assets vanish from new dropdowns but stay visible on the floor.
- **Concurrent edits.** Two admins editing the same override at the same time: last write wins. Acceptable. No need for locking.
- **Self-revoke for super_admin.** Block. The "you can't revoke yourself" rule needs a unit test.
- **Invitation revoke after accept.** If accepted_at is set when revoke happens (race), revoke is a no-op and we should respond with a clear "already accepted" message. The Edge Function's accept endpoint must check `revoked_at IS NULL` first to be truly safe — verify M13's accept logic does this; if not, patch it as part of M14b.

## Verification each ship

Before push, run from `_active/markur/code/`:

```
npx tsc -b
npx vite build
npx eslint .
```

Plus a manual smoke test against a test org:

- M14: hide a global, rename a global, recolor a global, reorder, reset, verify dropdowns reflect changes.
- M14a: invite someone (via M13), accept on a second browser, see them in MembersCard, change their role, revoke, verify they lose access on next page load.
- M14b: send an invite, revoke before accept, attempt to use the link → "this invitation has been revoked." Resend an invitation, accept the new email's link, verify it works.

Update `HANDOFF.md` at the repo root before committing. Update the top-level `_active/markur/HANDOFF.md` when M14 series fully ships.
