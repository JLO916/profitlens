import sharp from "/Users/j-work/ProfitLens/node_modules/sharp/dist/index.mjs";
const R2 = "/private/tmp/claude-502/-Users-j-work-ProfitLens/dbb9107e-e7d5-4aed-a614-47ec6e660af0/scratchpad/v42/v42-2a/r2";
const BASE = "/Users/j-work/ProfitLens/verification/revamp-v42/V42-2a/snapshots/desktop";
const region = { left: 240, top: 3480, width: 900, height: 80 };
await sharp(`${BASE}/05-diagnosis.png`).extract(region).png().toFile(`${R2}/diffs/05-baseline-crop.png`);
await sharp(`${R2}/shots/visual-desktop/05-diagnosis.png`).extract(region).png().toFile(`${R2}/diffs/05-actual-crop.png`);
console.log("ok");
