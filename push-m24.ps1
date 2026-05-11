# M24: building-create org assignment fixes
#
# Three related fixes for the bug observed 2026-05-11 with Crescent School,
# which silently auto-created a "Randy Hough" org with slug "andy-ough-ac98c5ae".
#
# 1. Auto-org creation removed.
#    supabase/migrations/0024_m24_no_auto_org_assignment.sql replaces the
#    BEFORE-INSERT trigger set_building_owner_org. The "if no inference,
#    insert a new organization named after the user" branch is gone. If
#    no owner_org_id is supplied AND no inference works, the trigger
#    raises a clear exception instead of silently fragmenting the org
#    structure. Migration applied to project drclmnqlurvwqpnnpgzb.
#
# 2. Slug generator fixed.
#    New public.org_slug(text) helper lowercases the input BEFORE the
#    [^a-z0-9]+ regex; the old order dropped capital first characters.
#    Includes an inline do-$$ assertion that org_slug('Randy Hough')
#    returns 'randy-hough'. The trigger no longer mints slugs, but the
#    helper is preserved for future explicit "create organization" flows
#    so the bug cannot recur if those land later.
#
# 3. Org picker on the build-create form.
#    NewBuildingDialog gets an Organization dropdown. Options come from
#    useOrgPickerOptions: super_admin sees all orgs; everyone else sees
#    the orgs they have a building-admin grant on (deduped from buildings
#    they already access). Default is the localStorage'd last-used org,
#    falling back to the first option. If the user has exactly one org,
#    the picker is hidden and that id is sent silently. If zero, the form
#    blocks with a "create or join an organization first" message.
#    createBuilding now sends owner_org_id to the insert.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add supabase/migrations/0024_m24_no_auto_org_assignment.sql
git add src/lib/queries/organizations.ts
git add src/lib/queries/buildings.ts
git add src/hooks/useOrgPickerOptions.ts
git add src/components/waymarks/NewBuildingDialog.tsx
git add push-m24.ps1

git commit -m "M24: building-create org assignment fixes (remove silent auto-org-create + fixed org_slug helper + explicit org picker dropdown sending owner_org_id)"

git push origin main
