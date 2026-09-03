/**
 * measure-silhouette-findability.mjs — is a player silhouette at least as easy
 * to find against this frame as against the one before it?
 *
 * WHY THIS EXISTS
 * ---------------
 * Every environment-art pass in this repo has to answer the same question, and
 * every one of them has so far answered it with a sentence. "Readability is
 * preserved" is not a measurement; it is a hope with a full stop after it.
 * Fidelity never outranks gameplay legibility in a competitive arena, so the
 * claim needs a number that can come out worse.
 *
 * WHAT IT MEASURES
 * ----------------
 * An operator reads as a roughly constant mid-dark value against whatever is
 * behind him. A pixel of background is CAMOUFLAGE for him when the contrast
 * between that background luminance and his own is below the threshold at which
 * a moving silhouette stops popping. So:
 *
 *     camouflageFraction = share of frame pixels whose Weber contrast against
 *                          the operator proxy value is below THRESHOLD
 *
 * Weber contrast, |Lb - Lp| / max(Lp, Lb, eps), is the right form here because
 * the target is a fixed known value and the background varies - it asks "how
 * far from the player's value is this pixel", which is exactly the question.
 *
 * A pass PASSES this test when the after frame's camouflage fraction is no
 * higher than the before frame's. It is deliberately possible to fail: adding a
 * lot of mid-dark frontage in the operator's value band is precisely the kind of
 * art change that makes players harder to see, and it is invisible to every
 * other gate in the repo.
 *
 * WHAT IT DOES NOT MEASURE. It is a value-contrast test on a static frame, not
 * a perceptual model: it says nothing about motion, edges, colour opponency or
 * the HUD. A frame that passes can still be busy. It is a floor, not a proof.
 *
 * USAGE
 *   node scripts/qa/measure-silhouette-findability.mjs \
 *     --before docs/evidence/pass86/hf419/before \
 *     --after  docs/evidence/pass86/hf419/after \
 *     --views  corridor-3-street-cell,corridor-3-street-kerbside \
 *     --out    docs/evidence/pass86/hf419/silhouette-findability.json
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

const BEFORE = arg('--before', 'docs/evidence/pass86/hf419/before');
const AFTER = arg('--after', 'docs/evidence/pass86/hf419/after');
const VIEWS = arg('--views', '').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('--out', 'docs/evidence/pass86/hf419/silhouette-findability.json');

/**
 * The operator proxy, in linear luminance.
 *
 * Atomic Acres operators are mid-dark fatigues over a mid skin/kit value. 0.085
 * is the middle of that band once the filmic curve has been applied - the value
 * a player-sized patch actually lands on in a capture, not the albedo. It is a
 * FIXED constant on purpose: both frames are scored against the same target, so
 * the comparison is of the backgrounds and nothing else.
 */
const PLAYER_L = 0.085;
/**
 * Weber contrast below which a silhouette stops popping out of its background
 * at gameplay distance. 0.35 is deliberately generous; a tighter threshold
 * would make almost every frame look camouflaged and the test would stop
 * discriminating.
 */
const THRESHOLD = 0.35;
/** The HUD strip along the bottom of every capture is not scenery. */
const HUD_STRIP_PX = 46;

/** sRGB -> linear, per channel, the standard transfer function. */
function toLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
const LINEAR_LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) LINEAR_LUT[i] = toLinear(i);

async function camouflageFraction(file) {
  const img = sharp(file);
  const { width, height } = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const usableRows = Math.max(1, height - HUD_STRIP_PX);
  let camouflaged = 0;
  let total = 0;
  let sum = 0;
  for (let y = 0; y < usableRows; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * ch;
      // Rec.709 luminance in linear light.
      const L = 0.2126 * LINEAR_LUT[data[o]]
        + 0.7152 * LINEAR_LUT[data[o + 1]]
        + 0.0722 * LINEAR_LUT[data[o + 2]];
      const weber = Math.abs(L - PLAYER_L) / Math.max(L, PLAYER_L, 1e-4);
      if (weber < THRESHOLD) camouflaged++;
      sum += L;
      total++;
    }
  }
  return {
    file,
    width,
    height,
    pixelsScored: total,
    meanLuminance: Number((sum / total).toFixed(5)),
    camouflageFraction: Number((camouflaged / total).toFixed(5)),
  };
}

const report = {
  contract: 'silhouette-findability-v1',
  measuredAt: new Date().toISOString(),
  playerProxyLuminance: PLAYER_L,
  weberThreshold: THRESHOLD,
  hudStripExcludedPx: HUD_STRIP_PX,
  rule: 'PASS requires after.camouflageFraction <= before.camouflageFraction for every view',
  views: {},
};

let failed = 0;
for (const view of VIEWS) {
  const before = await camouflageFraction(resolve(BEFORE, `${view}.png`));
  const after = await camouflageFraction(resolve(AFTER, `${view}.png`));
  const delta = Number((after.camouflageFraction - before.camouflageFraction).toFixed(5));
  const pass = delta <= 0;
  if (!pass) failed++;
  report.views[view] = { before, after, delta, verdict: pass ? 'PASS' : 'FAIL' };
  console.log(`${view.padEnd(30)} before ${before.camouflageFraction.toFixed(4)}`
    + `  after ${after.camouflageFraction.toFixed(4)}  delta ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`
    + `  ${pass ? 'PASS' : 'FAIL'}`);
}
report.verdict = failed === 0 ? 'PASS' : 'FAIL';
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${report.verdict}: wrote ${resolve(OUT)}`);
if (failed > 0) process.exitCode = 1;
