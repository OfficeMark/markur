# M18b: attachment upload UI + searchable type dropdown.
#
# - src/lib/queries/asset-attachments.ts: query layer for the
#   asset-attachments storage bucket + asset_attachments table that
#   M18 created. listAssetAttachments / addAssetAttachment /
#   deleteAssetAttachment / signedAttachmentUrl helpers. Validation
#   for file size (25 MB) and MIME type (PDF, Word, Excel, image,
#   text/csv).
# - src/hooks/useAssetAttachments.ts: React Query wrappers.
# - src/components/waymarks/AssetAttachmentsPanel.tsx: new component.
#   Lists attachments newest-first, signed URL "View" button per row,
#   "Attach" button for edit users, soft delete for edit users. Empty
#   state copy: "No files attached. Drop in cut sheets, install
#   instructions, or warranty docs."
# - src/components/waymarks/AssetDrawer.tsx: mounts the panel after
#   StatusRow.
# - src/components/waymarks/NewAssetDialog.tsx: search input above the
#   type dropdown. Typing "emerg" filters Signage to Emergency,
#   Evacuation, Egress. Empty optgroups are hidden so the list stays
#   clean. Custom-type option still pinned to bottom.
#
# No migration. The asset_attachments table + bucket were created in
# M18 (migration 0021).
#
# Pre-push gauntlet:
#   npx tsc -b
#   npx vite build
#
# Recommended: hand to Claude Code for verify-and-push instead of
# running manually. He can catch unused-declaration slips before they
# leave the machine.

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/lib/queries/asset-attachments.ts
git add src/hooks/useAssetAttachments.ts
git add src/components/waymarks/AssetAttachmentsPanel.tsx
git add src/components/waymarks/AssetDrawer.tsx
git add src/components/waymarks/NewAssetDialog.tsx
git add docs/m18b-verification.md
git add push-m18b.ps1

git commit -m "M18b: asset attachments upload UI + searchable type dropdown - PDFs/Office/images attach to pins, search filters types like 'emerg' or 'donor'"

git push origin main
