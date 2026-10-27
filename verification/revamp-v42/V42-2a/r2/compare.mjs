// Pixel compare of R2 screenshots against committed V42-2a desktop baselines (read-only; diff images written under r2/diffs).
// Threshold mirrors the capture config intent: a pixel counts as different when any channel differs by more than ~0.02*255 (≈5 levels).
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "/Users/j-work/ProfitLens/node_modules/sharp/dist/index.mjs";

const R2 = "/private/tmp/claude-502/-Users-j-work-ProfitLens/dbb9107e-e7d5-4aed-a614-47ec6e660af0/scratchpad/v42/v42-2a/r2";
const BASE = "/Users/j-work/ProfitLens/verification/revamp-v42/V42-2a/snapshots/desktop";
const names = process.argv.slice(2).length ? process.argv.slice(2) : ["01-overview-top", "02-overview-full", "05-diagnosis", "08-meeting", "09-data"];
mkdirSync(`${R2}/diffs`, { recursive: true });
const report = [];
for (const name of names) {
  const a = sharp(`${BASE}/${name}.png`).ensureAlpha();
  const b = sharp(`${R2}/shots/visual-desktop/${name}.png`).ensureAlpha();
  const [ma, mb] = await Promise.all([a.metadata(), b.metadata()]);
  const row = { name, baseline: `${ma.width}x${ma.height}`, actual: `${mb.width}x${mb.height}` };
  if (ma.width !== mb.width || ma.height !== mb.height) { row.sizeMismatch = true; }
  const w = Math.min(ma.width, mb.width), h = Math.min(ma.height, mb.height);
  const [ra, rb] = await Promise.all([a.extract({ left: 0, top: 0, width: w, height: h }).raw().toBuffer(), b.extract({ left: 0, top: 0, width: w, height: h }).raw().toBuffer()]);
  const diff = Buffer.alloc(w * h * 4);
  let count = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  const rows = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.max(Math.abs(ra[i] - rb[i]), Math.abs(ra[i + 1] - rb[i + 1]), Math.abs(ra[i + 2] - rb[i + 2]));
    if (d > 5) {
      count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      diff[i] = 255; diff[i + 1] = 0; diff[i + 2] = 0; diff[i + 3] = 255;
      const band = Math.floor(y / 50) * 50; rows.set(band, (rows.get(band) ?? 0) + 1);
    } else { const g = Math.round((ra[i] + ra[i + 1] + ra[i + 2]) / 3 * 0.35 + 150); diff[i] = g; diff[i + 1] = g; diff[i + 2] = g; diff[i + 3] = 255; }
  }
  row.diffPixels = count;
  row.diffBox = count ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null;
  row.diffRowBands = [...rows.entries()].sort((p, q) => p[0] - q[0]).map(([band, n]) => `y${band}-${band + 49}:${n}`);
  if (count) await sharp(diff, { raw: { width: w, height: h, channels: 4 } }).png().toFile(`${R2}/diffs/${name}-diff.png`);
  report.push(row);
}
writeFileSync(`${R2}/diffs/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
