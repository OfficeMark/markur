# M17b verification

Demo-feedback UX fixes layered on top of M17 + M18.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke tests (manual)

### Admin "Back to Markur" link

1. Sign in. Open `/admin` (or click Admin from the user menu).
2. The left sidebar now has a small "← Back to Markur" link at the top, above the "ADMIN" eyebrow.
3. Click it → goes to `/` (home / building list). No more dead-end feeling in admin.

### Type optional with "other" fallback

1. Open a floor with a plan. Click an empty spot to place a new asset.
2. NewAssetDialog opens. Leave Type as "Choose a type… (optional)". Fill nothing else. Click Place pin.
3. Asset is created. Click the pin in the floor view → the drawer shows category "signage" and type "Other" (from the seeded global).
4. The hint under the Type field reads "Optional. Pick from the list, add a custom one, or skip."

### "+ Add custom type" inline

1. Click an empty spot. NewAssetDialog opens.
2. Open the Type dropdown. Scroll to bottom — last option is "+ Add custom type…".
3. Pick it. A gold-bordered inline panel appears under the dropdown with a label input + Save / Cancel buttons.
4. Type "Memorial bench". Click Save. The panel closes; the dropdown now shows "Memorial bench" as selected.
5. Click Place pin. Asset is created with the custom type.
6. Click another spot to place another asset. Open the dropdown — "Memorial bench" is now in the Signage optgroup, reusable.
7. Open `/admin/asset-types` — the new type appears under "Your organization's types" and can be edited / deleted there.

### Vendor info moved to drawer

1. Place a new asset. NewAssetDialog has no vendor fields visible (only Type, Name, Location notes, Room number, Notes, Photos).
2. Click the new asset. Drawer opens. Below the notes block there's a dashed "+ Add vendor info" button.
3. Click it. Inline form appears: Vendor name, Company, Email, Phone, plus Save / Cancel.
4. Fill some fields. Click Save. The button is replaced by a tidy vendor card showing the info, with click-to-email and click-to-call.
5. Click the pencil icon. Form re-opens with current values. Edit, save again. Card updates.
6. Clear all fields and save. Card reverts to the "+ Add vendor info" button.

### Existing assets unchanged

1. Pre-M17b assets (no vendor info) show the "+ Add vendor info" button as expected.
2. Pre-M17b assets that DO have vendor_contact populated (from M18 testing) show the card immediately.

## What's NOT in M17b

- Filter-by-category quick-select in the placement window — still in M18b.
- Attachment upload UI — still in M18b.
- Pin clustering — pending Deborah's suggestion.
