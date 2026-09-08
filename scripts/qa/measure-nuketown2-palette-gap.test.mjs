import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const SCRIPT = join(process.cwd(), 'scripts', 'qa', 'measure-nuketown2-palette-gap.mjs');
const W = 1280;
const H = 720;

function runInstrument(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r, g, b) {
  const rp = r / 255, gp = g / 255, bp = b / 255;
  const mx = Math.max(rp, gp, bp), mn = Math.min(rp, gp, bp);
  const d = mx - mn;
  let h = 0;
  if (d !== 0) {
    if (mx === rp) h = ((gp - bp) / d) % 6;
    else if (mx === gp) h = (bp - rp) / d + 2;
    else h = (rp - gp) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

// Four stripe hues parked 3 deg below 10-deg bin edges, so +/-10 deg per-pixel
// jitter splits pixels across bin boundaries (pixel diagnostic jumps) while each
// 20 px block's circular mean barely moves (gated block metric holds).
const STRIPE_HUES = [7, 127, 247, 67];

function basePixel(x, y) {
  // Flat plaster-dry region inside the lane's plaster crop [700,200,400,180].
  if (x >= 700 && x < 1100 && y >= 200 && y < 380) return hsvToRgb(40, 0.45, 0.5);
  const stripe = Math.min(3, Math.floor(x / 320));
  return hsvToRgb(STRIPE_HUES[stripe], 0.7, 0.75);
}

async function writeBase(dir, station) {
  const data = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      let [r, g, b] = basePixel(x, y);
      // Flat dark-neutral road band inside the lane's road crop [150,560,300,80].
      if (station === 'street-centre' && x >= 150 && x < 450 && y >= 560 && y < 640) {
        [r, g, b] = hsvToRgb(30, 0.3, 0.25);
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  const name = dir.endsWith('boards') ? `${station}.target.png` : `nuketown2-${station}.png`;
  await sharp(data, { raw: { width: W, height: H, channels: 3 } }).png().toFile(join(dir, name));
}

async function writeVariant(dir, station, boardPath, mode, rng) {
  const { data, info } = await sharp(boardPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 3) {
    let [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    if (mode === 'twist') s = Math.min(1, s * 1.35);
    if (mode === 'jitter') h = (h + (rng() * 20 - 10) + 360) % 360;
    const [r, g, b] = hsvToRgb(h, s, v);
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png().toFile(join(dir, `nuketown2-${station}.png`));
}

async function runCase(root, name, mode) {
  const ours = join(root, `${name}-ours`);
  const boards = join(root, `${name}-boards`);
  const out = join(root, `${name}.json`);
  await Promise.all([mkdir(ours, { recursive: true }), mkdir(boards, { recursive: true })]);
  const rng = mulberry32(1337);
  for (const station of ['south-interior', 'street-centre']) {
    await writeBase(boards, station);
    if (mode === 'base') await writeBase(ours, station);
    else await writeVariant(ours, station, join(boards, `${station}.target.png`), mode, rng);
  }
  const result = await runInstrument(['--ours', ours, '--boards', boards, '--out', out]);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(await readFile(out, 'utf8'));
}

test('global saturation twist moves saturation delta, not block hue entropy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aa-palette-gap-'));
  try {
    const base = await runCase(root, 'base', 'base');
    const twisted = await runCase(root, 'twisted', 'twist');
    const blockBase = base.summary.gated.meanBlockHueEntropyOurs;
    const blockTwisted = twisted.summary.gated.meanBlockHueEntropyOurs;
    assert.ok(
      Math.abs(blockTwisted - blockBase) < 0.10,
      `block entropy must survive a saturation twist: ${blockBase} -> ${blockTwisted}`,
    );
    const satBase = base.summary.gated.meanSatDeltaPct;
    const satTwisted = twisted.summary.gated.meanSatDeltaPct;
    assert.ok(
      Math.abs(satTwisted - satBase) > 15,
      `saturation delta must move under a twist: ${satBase} -> ${satTwisted}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('per-pixel hue jitter moves the pixel diagnostic and local noise, not block entropy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aa-palette-gap-'));
  try {
    const base = await runCase(root, 'base', 'base');
    const jittered = await runCase(root, 'jittered', 'jitter');
    const blockBase = base.summary.gated.meanBlockHueEntropyOurs;
    const blockJittered = jittered.summary.gated.meanBlockHueEntropyOurs;
    assert.ok(
      Math.abs(blockJittered - blockBase) < 0.10,
      `block entropy must survive +/-10 deg jitter: ${blockBase} -> ${blockJittered}`,
    );
    const pixelBase = base.summary.gated.meanPixelHueEntropyOurs;
    const pixelJittered = jittered.summary.gated.meanPixelHueEntropyOurs;
    assert.ok(
      Math.abs(pixelJittered - pixelBase) > 0.25,
      `pixel diagnostic must catch +/-10 deg jitter: ${pixelBase} -> ${pixelJittered}`,
    );
    const noiseBase = base.summary.noise.plaster.localOurs;
    const noiseJittered = jittered.summary.noise.plaster.localOurs;
    assert.ok(
      noiseJittered - noiseBase > 3,
      `plaster local noise must catch +/-10 deg jitter: ${noiseBase} -> ${noiseJittered}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
