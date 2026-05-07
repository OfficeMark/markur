# M14c verification

Floor-view tightening + persistent Encrypted badge + ViewMark stub bridge.

## TypeScript build

```
npx tsc -b
npx vite build
```

Both clean.

## Smoke test (manual)

### Encrypted badge in the top nav

1. Sign in. The top header now shows a gold "Encrypted" pill next to the green Synced indicator.
2. Hover the pill. Tooltip reads: "Your data is encrypted in transit (TLS) and at rest in the database."
3. The pill persists across every screen (Home, Building, Floor, Settings, Help) for as long as the user is signed in.

### Floor view layout

1. Open any floor. The breadcrumb is now a single tight row: `Home > [Building name] > Floor [label]`. No giant H1 or eyebrow.
2. The toolbar (Map/Grid, Filter, Audit floor, Add asset, Take offline, Replace plan, Visualize) sits directly under the breadcrumb.
3. Vertical space saved: roughly 100 px above the floor plan canvas. The canvas itself is now correspondingly taller without other changes.
4. On mobile, the breadcrumb wraps cleanly. The toolbar still wraps as before.

### Visualize button - floor toolbar

1. Click "Visualize" in the floor toolbar. A new tab opens to `https://viewmark-app.netlify.app/?building=<URL-encoded building name>`.
2. The button has the eye icon and is in the secondary style.
3. The button shows even on a floor with no plan uploaded yet (Visualize works at the building level too).

### Visualize panel - Asset drawer

1. Click any asset pin to open the drawer.
2. A gold panel "Visualize a sign here" sits at the top of the asset section, before the details/status/attributes.
3. Click the gold "Visualize" button on the panel. A new tab opens to `https://viewmark-app.netlify.app/?building=<name>&asset=<asset name>`.
4. The panel is visible to all roles (Manager, Auditor, Facilities), not just admins. It's a viewing/mock-up tool, not an edit action.

## Known limitations

The ViewMark integration is stub-grade for the demo. Today the link just opens ViewMark with the building (and asset) name in the query string. Once we land the deeper bridge:

- ViewMark will read those query params and pre-scope the session
- Auth handoff via Supabase session token (both apps share auth ecosystem)
- Save the visualization back to Markur as an attachment on the asset

Track this as a future milestone (M16 candidate) once partner usage validates the pattern.
