// Generate a synthetic furniture floor plan as a single-page PDF.
// 11x8.5 in @ 100 ppi → 1100 x 850 px, but pdf-lib uses points (72 ppi),
// so we use 11" = 792 pt × 8.5" = 612 pt.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const W = 792;
const H = 612;

const pdf = await PDFDocument.create();
pdf.setTitle('Waymarks Sample — Floor Plan (Office Suite)');
pdf.setAuthor('Waymarks Demo');
pdf.setSubject('Sample office floor plan, public domain. Generated for app testing.');
pdf.setKeywords(['waymarks', 'sample', 'floor plan', 'public domain']);
pdf.setCreator('waymarks/scripts/gen-sample-plan');
pdf.setProducer('pdf-lib');

const page = pdf.addPage([W, H]);

const helv = await pdf.embedFont(StandardFonts.Helvetica);
const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
const cream = rgb(0.96, 0.94, 0.88);
const ink   = rgb(0.12, 0.16, 0.22);
const gold  = rgb(0.76, 0.63, 0.41);
const wall  = rgb(0.18, 0.18, 0.18);
const fill  = rgb(0.93, 0.91, 0.85);
const subtle = rgb(0.65, 0.65, 0.62);

// Page background
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: cream });

// Outer wall
const M = 36;
const left = M, right = W - M, bottom = M, top = H - M;

function rect(x, y, w, h, opts = {}) {
  page.drawRectangle({ x, y, width: w, height: h, ...opts });
}

function wallRect(x, y, w, h, fillColor = fill) {
  rect(x, y, w, h, { color: fillColor, borderColor: wall, borderWidth: 1.6 });
}

function label(text, x, y, size = 9, font = helv, color = ink) {
  page.drawText(text, { x, y, size, font, color });
}

function desk(cx, cy, orient = 'h') {
  // 60 x 36 desk + 18 x 18 chair on the user side
  const dw = orient === 'h' ? 60 : 36;
  const dh = orient === 'h' ? 36 : 60;
  rect(cx - dw / 2, cy - dh / 2, dw, dh, { color: rgb(1, 1, 1), borderColor: wall, borderWidth: 0.8 });
  if (orient === 'h') {
    rect(cx - 9, cy - dh / 2 - 16, 18, 14, { color: rgb(1, 1, 1), borderColor: subtle, borderWidth: 0.6 });
  } else {
    rect(cx - dw / 2 - 16, cy - 9, 14, 18, { color: rgb(1, 1, 1), borderColor: subtle, borderWidth: 0.6 });
  }
}

function table(x, y, w, h, isRound = false) {
  rect(x, y, w, h, { color: rgb(1, 1, 1), borderColor: wall, borderWidth: 1 });
  if (isRound) {
    // Hint at round table — pdf-lib doesn't draw ellipses easily; mark center.
    label('o', x + w / 2 - 3, y + h / 2 - 5, 10, helv, subtle);
  }
}

// Outer suite walls
wallRect(left, bottom, right - left, top - bottom, cream);

// Header strip — title block
const headerH = 64;
rect(left, top - headerH, right - left, headerH, { color: ink });
label('WAYMARKS · SAMPLE FLOOR PLAN', left + 16, top - 26, 14, helvBold, rgb(1, 1, 1));
label('Office Suite — Demo Tenant', left + 16, top - 44, 9, helv, gold);
label('SCALE NTS · For app testing only · Public domain', right - 250, top - 44, 8, helv, rgb(0.85, 0.85, 0.85));

// Title block right side: floor + suite stamps
rect(right - 130, top - headerH + 6, 124, headerH - 12, { color: rgb(1, 1, 1), opacity: 0.08 });
label('FLOOR', right - 122, top - 28, 8, helvBold, rgb(0.85, 0.85, 0.85));
label('Ground', right - 122, top - 42, 11, helvBold, rgb(1, 1, 1));
label('SUITE', right - 60, top - 28, 8, helvBold, rgb(0.85, 0.85, 0.85));
label('100', right - 60, top - 42, 11, helvBold, rgb(1, 1, 1));

// Plan area
const planTop = top - headerH - 8;

// Lobby (top center of plan area)
const lobbyX = left + 280, lobbyY = planTop - 110, lobbyW = 200, lobbyH = 100;
wallRect(lobbyX, lobbyY, lobbyW, lobbyH);
label('LOBBY', lobbyX + 78, lobbyY + lobbyH / 2 - 4, 10, helvBold);
// Reception desk
rect(lobbyX + 70, lobbyY + 18, 60, 22, { color: rgb(1, 1, 1), borderColor: wall, borderWidth: 1 });

// Elevator + door at lobby top
rect(lobbyX + lobbyW / 2 - 20, lobbyY + lobbyH - 8, 40, 8, { color: subtle });
label('ELEV', lobbyX + lobbyW / 2 - 11, lobbyY + lobbyH - 18, 7, helv, rgb(1, 1, 1));

// Corridor below lobby spanning whole suite
const corrY = lobbyY - 30, corrH = 22;
rect(left + 6, corrY, right - left - 12, corrH, { color: rgb(0.99, 0.97, 0.92), borderColor: subtle, borderWidth: 0.5 });

// LEFT: open work area (8 desks in 2 rows)
const owX = left + 16, owY = bottom + 16, owW = 260, owH = corrY - owY - 10;
wallRect(owX, owY, owW, owH);
label('OPEN WORK AREA', owX + 70, owY + owH - 14, 9, helvBold);
const rows = 2, cols = 4;
const dxStep = owW / (cols + 1);
const dyStep = (owH - 30) / (rows + 1);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    desk(owX + dxStep * (c + 1), owY + dyStep * (r + 1) + 8, 'h');
  }
}

// MIDDLE LOWER: conference room
const cfX = owX + owW + 12, cfY = bottom + 16, cfW = 180, cfH = corrY - cfY - 10;
wallRect(cfX, cfY, cfW, cfH);
label('CONFERENCE', cfX + 50, cfY + cfH - 14, 9, helvBold);
table(cfX + 30, cfY + cfH / 2 - 22, cfW - 60, 44);
// Chairs
for (let i = 0; i < 6; i++) {
  const x = cfX + 30 + (cfW - 60) * (i / 5);
  rect(x - 7, cfY + cfH / 2 - 36, 14, 10, { color: rgb(1, 1, 1), borderColor: subtle, borderWidth: 0.5 });
  rect(x - 7, cfY + cfH / 2 + 26, 14, 10, { color: rgb(1, 1, 1), borderColor: subtle, borderWidth: 0.5 });
}

// RIGHT: private offices (3) + break room
const poX = cfX + cfW + 12;
const poW = right - poX - 16;
const poTotalH = corrY - bottom - 26;
const poH = (poTotalH - 16) / 2;
// Office A (top-left of right column)
wallRect(poX, corrY - poH - 4, poW / 2 - 4, poH);
label('OFFICE A', poX + 14, corrY - 18, 8, helvBold);
desk(poX + (poW / 2 - 4) / 2, corrY - poH / 2 - 4, 'h');

// Office B (top-right of right column)
wallRect(poX + poW / 2 + 4, corrY - poH - 4, poW / 2 - 4, poH);
label('OFFICE B', poX + poW / 2 + 18, corrY - 18, 8, helvBold);
desk(poX + poW / 2 + 4 + (poW / 2 - 4) / 2, corrY - poH / 2 - 4, 'h');

// Break room (bottom of right column, full width)
wallRect(poX, bottom + 16, poW, poTotalH - poH - 12);
label('BREAK / KITCHEN', poX + 14, bottom + 16 + (poTotalH - poH - 12) - 14, 8, helvBold);
table(poX + 30, bottom + 50, 110, 36, true);
// Counter
rect(poX + poW - 50, bottom + 24, 36, 36, { color: rgb(1, 1, 1), borderColor: wall, borderWidth: 0.8 });

// Doors — small gaps + arc indicators
function door(x, y, w) {
  rect(x, y - 1, w, 2, { color: cream });
  page.drawLine({ start: { x, y }, end: { x: x + w, y: y + w }, thickness: 0.6, color: subtle });
}
door(owX + owW - 30, owY + owH - 1, 14);  // open work into corridor
door(cfX + cfW / 2 - 7, cfY + cfH - 1, 14); // conf into corridor
door(poX + 16, corrY - poH - 3, 14);       // office A
door(poX + poW / 2 + 20, corrY - poH - 3, 14); // office B
door(poX + 30, bottom + 16 + (poTotalH - poH - 12) - 1, 14); // break room (top wall)
door(lobbyX + lobbyW / 2 - 7, lobbyY - 1, 14); // lobby into corridor

// North arrow + scale bar
const arrowX = right - 90, arrowY = bottom + 30;
page.drawLine({ start: { x: arrowX, y: arrowY }, end: { x: arrowX, y: arrowY + 24 }, thickness: 1, color: ink });
label('N', arrowX - 4, arrowY + 28, 8, helvBold);
label('^', arrowX - 4, arrowY + 18, 8, helvBold);

// Scale bar
const sbX = left + 16, sbY = bottom + 12;
rect(sbX, sbY, 80, 4, { color: ink });
rect(sbX + 20, sbY, 20, 4, { color: cream, borderColor: ink, borderWidth: 0.5 });
rect(sbX + 60, sbY, 20, 4, { color: cream, borderColor: ink, borderWidth: 0.5 });
label('0', sbX - 2, sbY - 9, 7, helv, subtle);
label('20 ft', sbX + 70, sbY - 9, 7, helv, subtle);

// Footer
label('Waymarks · waymarks.ca · sample floor plan · this PDF is public domain', left + 14, M + 2, 7, helv, subtle);

const bytes = await pdf.save();
writeFileSync('/tmp/plangen/sample-furniture-plan.pdf', bytes);
console.log('wrote', bytes.length, 'bytes');
