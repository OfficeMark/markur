// ============================================================================
// Rebuild-environment seed — floor-plan placeholders. IDEMPOTENT, reproducible.
//
// Generates a SYNTHETIC placeholder floor plan (no real/tenant plans), uploads
// it to the `floor-plans` Supabase Storage bucket as `<floorId>.png` (the exact
// convention src/lib/upload.ts uses), and sets floors.plan_url = `<floorId>.png`
// for every floor of the seeded buildings (Rebuild Tower, Demo Plaza).
//
// Auth: signs in as the demo super_admin (anon key + password), so the upload
// satisfies the floor_plans_insert RLS policy and the floors UPDATE policy.
// Re-running is safe: upload upserts, plan_url set is the same value.
//
//   node supabase/seed_rebuild_plans.mjs
// ============================================================================
import zlib from 'node:zlib';

const URL = process.env.SEED_SUPABASE_URL || 'https://hlfkfkyglfzrbeuzyojm.supabase.co';
const ANON = process.env.SEED_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZmtma3lnbGZ6cmJldXp5b2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk0NzUsImV4cCI6MjA5NzQ1NTQ3NX0.eCpWWYHNfS2gFtS2hOcWptG78rtXkbZH0oQFx_9tKv0';
const EMAIL = process.env.SEED_DEMO_EMAIL || 'demo@rancherdesign.ca';
const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'MarkurRebuild2026!';
const BUILDINGS = ['Rebuild Tower', 'Demo Plaza'];

// --- minimal RGB -> PNG encoder (no deps) ----------------------------------
function makePlanPng(W = 1600, H = 1000) {
  const buf = Buffer.alloc(W * H * 3, 0xff); // white
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c);
  };
  const INK = [0x1f, 0x2a, 0x37], WALL = 14, GRAY = [0xee, 0xf1, 0xf4], GRID = [0xd6, 0xdc, 0xe2];
  // light grid so it reads as a plan
  for (let x = 0; x < W; x += 80) rect(x, 0, x + 1, H, GRID);
  for (let y = 0; y < H; y += 80) rect(0, y, W, y + 1, GRID);
  // outer walls
  rect(40, 40, W - 40, 40 + WALL, INK); rect(40, H - 40 - WALL, W - 40, H - 40, INK);
  rect(40, 40, 40 + WALL, H - 40, INK); rect(W - 40 - WALL, 40, W - 40, H - 40, INK);
  // central corridor (two horizontal walls with a gap between)
  const cTop = 470, cBot = 530;
  rect(40, cTop, W - 40, cTop + 8, INK); rect(40, cBot, W - 40, cBot + 8, INK);
  // room dividers top + bottom rows, plus faint room fills
  for (const x of [440, 840, 1240]) { rect(x, 54, x + 8, cTop, INK); rect(x, cBot + 8, x + 8, H - 54, INK); }
  for (const [x0, x1, y0, y1] of [[54, 440, 54, cTop], [848, 1240, 54, cTop], [1248, W - 54, cBot + 8, H - 54]])
    rect(x0 + 6, y0 + 6, x1 - 6, y1 - 6, GRAY);
  // a "title block" box in a corner so it clearly reads as a synthetic plan
  rect(W - 360, H - 150, W - 54, H - 54, [0xff, 0xff, 0xff]);
  rect(W - 360, H - 150, W - 54, H - 150 + 6, INK); rect(W - 360, H - 60, W - 54, H - 54, INK);
  rect(W - 360, H - 150, W - 354, H - 54, INK); rect(W - 60, H - 150, W - 54, H - 54, INK);
  rect(W - 340, H - 120, W - 120, H - 112, INK); rect(W - 340, H - 95, W - 200, H - 89, INK);

  // PNG assembly
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); };
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

async function main() {
  const png = makePlanPng();
  console.log(`generated synthetic plan PNG: ${png.length} bytes`);

  const auth = await j(await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }));
  const token = auth.access_token;
  if (!token) throw new Error('sign-in failed: ' + JSON.stringify(auth));
  const H = { apikey: ANON, Authorization: `Bearer ${token}` };

  // resolve floors of the seeded buildings
  const blds = await j(await fetch(`${URL}/rest/v1/buildings?select=id,name&name=in.(${BUILDINGS.map(encodeURIComponent).join(',')})`, { headers: H }));
  const ids = blds.map((b) => b.id);
  const floors = await j(await fetch(`${URL}/rest/v1/floors?select=id,label,building_id&building_id=in.(${ids.join(',')})&deleted_at=is.null`, { headers: H }));
  console.log(`targeting ${floors.length} floors`);

  for (const f of floors) {
    const path = `${f.id}.png`;
    const up = await fetch(`${URL}/storage/v1/object/floor-plans/${path}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'image/png', 'x-upsert': 'true', 'cache-control': '0' },
      body: png,
    });
    if (!up.ok) throw new Error(`upload ${path} failed: ${up.status} ${await up.text()}`);
    const patch = await fetch(`${URL}/rest/v1/floors?id=eq.${f.id}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ plan_url: path, plan_metadata: null }),
    });
    if (!patch.ok) throw new Error(`patch ${f.id} failed: ${patch.status} ${await patch.text()}`);
    console.log(`  ✓ ${f.label.padEnd(10)} ${path}`);
  }
  console.log('done.');
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
