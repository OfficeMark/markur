# M22c: mobile pinch-zoom drives the same zoom state as desktop, so pins keep
# their constant viewport size on mobile too.
#
# Bug: on mobile, two-finger pinch on the floor plan made pins balloon up
# like a page-level zoom and overlap each other. Cause: the browser was
# handling pinch natively (visual viewport zoom), so the app's zoom state
# never updated and PinMarker's --zoom CSS var inverse-scale (M22b) never
# fired.
#
# Fix in FloorPlanCanvas.tsx:
#   1. touch-action: none on the canvas container so the browser stops
#      eating pinch / double-tap / pan as native gestures.
#   2. Track active pointers in a Map; when two are down, compute the
#      pinch distance ratio and feed the same setZoom() the wheel handler
#      uses. PinMarker's existing inverse-scale logic now runs on mobile.
#   3. Single-finger pan still works (only enters pinch mode at 2+
#      pointers, cancels any in-flight drag on the second pointer down).

if (Test-Path .git\index.lock) { Remove-Item .git\index.lock -Force }

git add src/components/waymarks/FloorPlanCanvas.tsx
git add push-m22c.ps1

git commit -m "M22c: mobile pinch-zoom drives app zoom state so pins keep constant size on phones (touch-action none + two-pointer pinch handler reusing the wheel-handler setZoom path)"

git push origin main
