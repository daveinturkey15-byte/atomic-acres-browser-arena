#!/usr/bin/env node
// HF-536 night-defects-3a — the SEE-THROUGH RENDER SWEEP for nuketown2.
//
// Owner, 2026-09-06 18:05: "there is still Z fighting around the map in many
// spots and textures missing you can see through floors and assets etc".
//
// The previous lane measured a static proxy for that (thin FrontSide plates)
// and inferred 38 defects. This lane rendered the truth first
// (scripts/qa/audit-nuketown2-plate-closure.ts): all 38 are CLOSED
// BoxGeometry with 12 triangles and all six outward faces, so FrontSide can
// never be see-through for them. That leaves the owner's report unexplained,
// and the only instrument that can explain it is pixels.
//
// THE INVARIANT THIS SWEEP TESTS
//   From any eye position in the world, a pixel BELOW the horizon line that
//   shows SKY is a hole. Below the horizon you must see ground, road, or a
//   body; the sky can only appear there by looking through something that
//   should be solid - a floor, a tread, a wall, a roof, the world's edge.
//   The horizon row is analytic (it depends only on pitch and vertical FOV),
//   so the test needs no baseline image and no reference render.
//
// It is deliberately blind to legitimate through-a-window sky: that sky is
// ABOVE the horizon, and the detector never looks there.
//
// The sky signature is CALIBRATED at runtime, per render profile, from a
// straight-up render at the same time of day, and every run carries two
// controls that must both pass or the run is invalidated:
//   POSITIVE - a pose looking up at open sky must classify as sky.
//   NEGATIVE - a pose 1 m from a house wall, pitched down, must classify none.
//
// Usage:
//   node scripts/qa/sweep-nuketown2-seethrough.mjs \
//     --grid <grid.json> --serve-dist dist-night-defects --port 4310 \
//     --profiles quality,performance --out artifacts/qa/seethrough \
//     [--plates <single-sided-plates.txt>] [--max-positions N] [--yaws 8]
import { chromium } from '@playwright/test';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const GRID_PATH = arg('--grid', null);
const SERVE_DIST = arg('--serve-dist', null);
const PORT = Number(arg('--port', '4310'));
const PROFILES = arg('--profiles', 'quality,performance').split(',').map((s) => s.trim()).filter(Boolean);
const OUT_DIR = resolve(process.cwd(), arg('--out', 'artifacts/qa/seethrough'));
const PLATES_PATH = arg('--plates', null);
const MAX_POSITIONS = Number(arg('--max-positions', '0')) || Infinity;
// CHUNKING. The sweep is longer than one supervisory window, so it is
// resumable: --skip-positions starts partway through the matrix and
// --budget-ms stops cleanly and records where to resume. Nothing is inferred
// about the skipped part; each chunk's report names exactly what it covered.
const SKIP_POSITIONS = Number(arg('--skip-positions', '0')) || 0;
const BUDGET_MS = Number(arg('--budget-ms', '0')) || Infinity;
const YAW_COUNT = Number(arg('--yaws', '8'));
const PITCHES_DEG = arg('--pitches', '0,-35').split(',').map(Number);
const WIDTH = Number(arg('--width', '640'));
const HEIGHT = Number(arg('--height', '360'));
const FOV = Number(arg('--fov', '75'));
const OUTDOOR_STEP = Number(arg('--outdoor-step', '4'));
const QUERY = arg('--query', 'tod=authored');
const SETTLE_MS = Number(arg('--settle-ms', '6000'));
// REPAINT THE BACKGROUND. Colour-matching the authored sky reports blue
// OBJECTS as holes - measured on this map: the yard pool at (-6, 3.48, 4)
// produced a 1628 px "hole" that is a swimming pool. Repainting
// `scene.background` to a colour no material in the world uses turns the
// detector from a colour guess into a measurement of "nothing was drawn here".
// Fog is left alone, so distant geometry still fades to its authored grey and
// cannot be mistaken for background.
const REPAINT_SKY = !flag('--no-repaint-sky');

if (!GRID_PATH) { console.error('[seethrough] --grid is required'); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(join(OUT_DIR, 'hits'), { recursive: true });
mkdirSync(join(OUT_DIR, 'controls'), { recursive: true });
mkdirSync(join(OUT_DIR, 'plates'), { recursive: true });

const grid = JSON.parse(readFileSync(GRID_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Position matrix. Interiors, garages and the street get the full 2 m grid -
// that is where the owner's complaint lives. Open lawn and verge are decimated
// to OUTDOOR_STEP, and the decimation is REPORTED, never silent.
// ---------------------------------------------------------------------------
const DENSE_REGIONS = /^(house-|garage-|street)/;
const positions = grid.positions.filter((p) => {
  if (DENSE_REGIONS.test(p.region)) return true;
  return Math.abs(p.x) % OUTDOOR_STEP === 0 && Math.abs(p.z) % OUTDOOR_STEP === 0;
}).slice(SKIP_POSITIONS, MAX_POSITIONS === Infinity ? undefined : SKIP_POSITIONS + MAX_POSITIONS);

const YAWS = Array.from({ length: YAW_COUNT }, (_, i) => (i * 2 * Math.PI) / YAW_COUNT);
const PITCHES = PITCHES_DEG.map((deg) => (deg * Math.PI) / 180);

console.error(`[seethrough] ${positions.length} positions x ${YAWS.length} yaws x ${PITCHES.length} pitches`
  + ` = ${positions.length * YAWS.length * PITCHES.length} shots per profile`);

// ---------------------------------------------------------------------------
// Horizon row. Camera pitch p, vertical FOV f: the zero-elevation direction
// lands at NDC y = -tan(p)/tan(f/2). Rows strictly greater than that row are
// BELOW the horizon.
// ---------------------------------------------------------------------------
function horizonRow(pitch, fovDeg, height) {
  const ndcY = -Math.tan(pitch) / Math.tan((fovDeg * Math.PI) / 360);
  const clamped = Math.max(-1, Math.min(1, ndcY));
  return Math.round(((1 - clamped) / 2) * height);
}

// ---------------------------------------------------------------------------
// Sky classifier. The palette is measured, not guessed: a straight-up render
// gives the sky's own colour band for this profile and time of day. A pixel is
// sky when it is within SKY_TOLERANCE of some palette entry AND carries the
// same blue dominance the palette does, which is what separates a pale sky
// from pale cream siding.
// ---------------------------------------------------------------------------
const SKY_TOLERANCE = 16;
/**
 * BLUE-DOMINANT SKY ONLY. The authored sky carries white cumulus, and a
 * near-white palette entry would also match cream siding, concrete and garage
 * doors - a detector that reports a house wall as a hole is worse than no
 * detector. So only the blue band is admitted, and the cost is declared: a
 * hole that shows nothing but cloud is a FALSE NEGATIVE this sweep can miss.
 */
const SKY_MIN_BLUE_DOMINANCE = 25;

async function decode(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function buildSkyPalette(png, repainted) {
  const seen = new Map();
  let qualified = 0;
  let sampled = 0;
  for (let y = 0; y < png.height; y += 2) {
    for (let x = 0; x < png.width; x += 2) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      sampled += 1;
      if (!repainted && b - r < SKY_MIN_BLUE_DOMINANCE) continue;
      if (repainted && !(r - g > 40 && b - g > 40)) continue;
      qualified += 1;
      const key = `${r >> 3}:${g >> 3}:${b >> 3}`;
      const entry = seen.get(key);
      if (entry) entry.n += 1;
      else seen.set(key, { r, g, b, n: 1 });
    }
  }
  const palette = [...seen.values()]
    .filter((e) => e.n / Math.max(1, qualified) > 0.002)
    .sort((a, b) => b.n - a.n)
    .slice(0, 64);
  return { palette, qualifiedFraction: qualified / sampled };
}

function classify(png, sky, firstRow) {
  const { palette, repainted } = sky;
  const width = png.width;
  const height = png.height;
  const mask = new Uint8Array(width * height);
  let count = 0;
  for (let y = Math.max(0, firstRow); y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (width * y + x) << 2;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (repainted ? !(r - g > 40 && b - g > 40) : b - r < SKY_MIN_BLUE_DOMINANCE) continue;
      for (const entry of palette) {
        if (Math.abs(r - entry.r) <= SKY_TOLERANCE
          && Math.abs(g - entry.g) <= SKY_TOLERANCE
          && Math.abs(b - entry.b) <= SKY_TOLERANCE) {
          mask[width * y + x] = 1;
          count += 1;
          break;
        }
      }
    }
  }
  return { mask, count, width, height };
}

/** Largest 4-connected blob, so antialiasing fringes cannot become a finding. */
function largestBlob(masked) {
  const { mask, width, height } = masked;
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best = 0;
  let bestBox = null;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let size = 0;
    let minX = width; let maxX = 0; let minY = height; let maxY = 0;
    while (top > 0) {
      const index = stack[--top];
      size += 1;
      const x = index % width;
      const y = (index - x) / width;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[index - 1] === 1 && !seen[index - 1]) { seen[index - 1] = 1; stack[top++] = index - 1; }
      if (x + 1 < width && mask[index + 1] === 1 && !seen[index + 1]) { seen[index + 1] = 1; stack[top++] = index + 1; }
      if (y > 0 && mask[index - width] === 1 && !seen[index - width]) { seen[index - width] = 1; stack[top++] = index - width; }
      if (y + 1 < height && mask[index + width] === 1 && !seen[index + width]) { seen[index + width] = 1; stack[top++] = index + width; }
    }
    if (size > best) { best = size; bestBox = [minX, minY, maxX, maxY]; }
  }
  return { size: best, box: bestBox };
}

/** A hole must be a real blob, not a seam of antialiased pixels. */
const MIN_BLOB_PX = 40;

// ---------------------------------------------------------------------------
// Server: one short-lived vite preview on OUR lane port, byte-verified against
// the dist on disk (HF-535's port-squatter lesson).
// ---------------------------------------------------------------------------
let SERVE_CHILD = null;
function killServe() {
  if (SERVE_CHILD?.pid != null) {
    spawnSync('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
    SERVE_CHILD = null;
  }
}
function killOurStalePreview(port, dist) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue`
      + ' | ForEach-Object { (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $_.OwningProcess)).CommandLine + "|" + $_.OwningProcess }'],
      { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [command, pid] = line.split('|');
      // ONLY a vite preview of OUR dist on OUR lane port is ours to reap.
      if (command.includes('vite') && command.includes('preview') && command.includes(dist)) {
        console.error(`[seethrough] reaping our own stale preview pid ${pid.trim()} on :${port}`);
        spawnSync('taskkill', ['/pid', pid.trim(), '/T', '/F'], { stdio: 'ignore' });
      } else {
        console.error(`[seethrough] :${port} held by a process that is NOT our preview; refusing to touch it: ${command.slice(0, 160)}`);
      }
    }
  } catch { /* nothing listening */ }
}

let BASE = `http://127.0.0.1:${PORT}`;
if (SERVE_DIST) {
  killOurStalePreview(PORT, SERVE_DIST);
  await new Promise((r) => setTimeout(r, 1200));
  SERVE_CHILD = spawn('npx', ['vite', 'preview', '--outDir', SERVE_DIST,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`${BASE}/`)).ok; } catch { /* not up */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  const diskIndex = readFileSync(resolve(SERVE_DIST, 'index.html'), 'utf8');
  const servedIndex = up ? await (await fetch(`${BASE}/index.html`)).text() : '';
  if (!up || servedIndex !== diskIndex) {
    killServe();
    console.error(`[seethrough] REFUSED :${PORT}: ${up ? 'served index.html differs from dist on disk' : 'preview never came up'}`);
    process.exit(2);
  }
  console.error(`[seethrough] serving ${SERVE_DIST} on :${PORT} (byte-verified)`);
}

// ---------------------------------------------------------------------------
// Plate probes: 1.2 m off the broad face of the largest findings, both sides.
// ---------------------------------------------------------------------------
function parsePlates(path, take) {
  if (!path || !existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^FINDING (.+?) thickness=([\d.]+)m axis=(\d) area=([\d.]+)m2 at=\(([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(line);
    if (!match) continue;
    rows.push({
      name: match[1], thickness: Number(match[2]), axis: Number(match[3]), area: Number(match[4]),
      centre: [Number(match[5]), Number(match[6]), Number(match[7])],
    });
  }
  rows.sort((a, b) => b.area - a.area);
  return rows.slice(0, take);
}
const PLATE_PROBES = parsePlates(PLATES_PATH, 6);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const runReport = { generated: new Date().toISOString(), profiles: {} };
let exitCode = 0;
try {
  for (const profile of PROFILES) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const bootErrors = [];
    page.on('pageerror', (error) => bootErrors.push({ kind: 'pageerror', text: String(error).slice(0, 400) }));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        bootErrors.push({ kind: message.type(), text: message.text().slice(0, 400) });
      }
    });

    const url = `${BASE}/?release=latest&renderer=webgpu&render=${profile}&seed=seethrough&previewTime=0&${QUERY}`;
    console.error(`[seethrough] profile=${profile} ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    if (backend !== 'webgpu') {
      runReport.profiles[profile] = { environmentInvalid: `asked for webgpu, got backend=${backend}` };
      exitCode = 2;
      await page.close();
      continue;
    }
    await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 180_000 });
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      if (scene) {
        scene.traverse((object) => {
          if (object.name.startsWith('bot-operator')) { object.position.set(0, -100, 0); object.visible = false; }
        });
      }
    });
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true); });
    let repaint = { applied: false, reason: 'not requested' };
    if (REPAINT_SKY) {
      repaint = await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        if (!scene) return { applied: false, reason: 'no scene handle' };
        let ColorCtor = null;
        scene.traverse((node) => {
          if (ColorCtor) return;
          const material = Array.isArray(node.material) ? node.material[0] : node.material;
          if (material && material.color && material.color.isColor) ColorCtor = material.color.constructor;
        });
        if (!ColorCtor) return { applied: false, reason: 'no Color constructor reachable from any material' };
        const previous = scene.background && scene.background.constructor
          ? scene.background.constructor.name : String(scene.background);
        scene.background = new ColorCtor(1, 0, 1);
        // The authored sky dome is already hidden on this arena; anything still
        // visible and named like sky would otherwise cover the repaint.
        const hidden = [];
        scene.traverse((node) => {
          if (!node.isMesh || !node.visible) return;
          const name = String(node.name || '').toLowerCase();
          if (/^pass6\d.*(sky|cloud-veil)|atmosphere sky/.test(name)) { node.visible = false; hidden.push(node.name); }
        });
        return { applied: true, previous, hidden };
      });
      console.error(`[seethrough] ${profile} background repaint: ${JSON.stringify(repaint)}`);
    }
    // Boot errors are OWNED per profile: everything up to here is boot.
    const bootErrorSnapshot = bootErrors.slice();
    bootErrors.length = 0;

    // ---- pose + shot -----------------------------------------------------
    let staleReceipts = 0;
    const shoot = async (x, y, z, yaw, pitch) => {
      // fixedVisualTimeMs is REQUIRED, not optional: without it
      // setCaptureCameraPose leaves activeArenaReviewHud null and the HUD
      // stays drawn over the frame. The first smoke run measured the Field
      // Support panel instead of the world - a constant ~3400 px blob at
      // every pose, which is what a detector reading UI looks like. It also
      // pins visual time, so the sweep is deterministic.
      const revision = await page.evaluate(
        ([px, py, pz, pyaw, ppitch, pfov]) =>
          window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(px, py, pz, pyaw, ppitch, pfov, 0, 6501),
        [x, y, z, yaw, pitch, FOV],
      );
      const presented = await page.evaluate(() => new Promise((done) => {
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (frames >= 2) {
            const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
            done(review.presentedCamera ? review.presentedCamera.captureRevision : null);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }));
      if (presented !== revision) staleReceipts += 1;
      const buffer = await page.screenshot({ type: 'png' });
      return { buffer, png: await decode(buffer), revision, presented };
    };

    // ---- sky calibration + controls -------------------------------------
    // Calibrate from the street cell nearest the arena centre, looking almost
    // straight up: the arena-edge cell the first cut picked stood under trees
    // and poisoned the palette with foliage.
    const openStreet = grid.positions
      .filter((p) => p.region === 'street')
      .sort((a, b) => (Math.abs(a.x) + Math.abs(a.z)) - (Math.abs(b.x) + Math.abs(b.z)))[0]
      ?? { x: 0, z: 0, eyeY: 1.6 };
    const up = await shoot(openStreet.x, openStreet.eyeY, openStreet.z, 0, 1.45);
    writeFileSync(join(OUT_DIR, 'controls', `${profile}-sky-calibration.png`), up.buffer);
    const sky = buildSkyPalette(up.png, REPAINT_SKY);
    sky.repainted = REPAINT_SKY;

    // POSITIVE control: looking up at 45 degrees, most of the frame must be sky.
    const positive = await shoot(openStreet.x, openStreet.eyeY, openStreet.z, 0, 0.9);
    writeFileSync(join(OUT_DIR, 'controls', `${profile}-positive.png`), positive.buffer);
    const positiveHit = classify(positive.png, sky, 0);
    const positiveFraction = positiveHit.count / (WIDTH * HEIGHT);

    // NEGATIVE control: 1 m from a house wall, pitched down - no sky is possible.
    const interior = grid.positions.find((p) => p.region === 'house-north-ground')
      ?? grid.positions.find((p) => p.region.startsWith('house-'));
    const negative = await shoot(interior.x, interior.eyeY, interior.z, 0, -0.61);
    writeFileSync(join(OUT_DIR, 'controls', `${profile}-negative.png`), negative.buffer);
    const negativeMask = classify(negative.png, sky, horizonRow(-0.61, FOV, HEIGHT));
    const negativeBlob = largestBlob(negativeMask);

    const controls = {
      positiveSkyFraction: Number(positiveFraction.toFixed(4)),
      positivePass: positiveFraction > 0.2,
      repaint,
      // A repainted background is a FLAT colour: a wide palette means the
      // repaint did not take and the run must not be trusted.
      repaintPass: !REPAINT_SKY || (repaint.applied === true && sky.palette.length <= 6),
      negativeBlobPx: negativeBlob.size,
      negativePass: negativeBlob.size < MIN_BLOB_PX,
      skyPaletteEntries: sky.palette.length,
      skyCalibrationBlueFraction: Number(sky.qualifiedFraction.toFixed(4)),
      skyMinBlueDominance: SKY_MIN_BLUE_DOMINANCE,
      calibrationPose: { x: openStreet.x, y: openStreet.eyeY, z: openStreet.z, pitch: 1.45 },
      negativePose: { x: interior.x, y: interior.eyeY, z: interior.z, region: interior.region },
    };
    console.error(`[seethrough] ${profile} controls ${JSON.stringify(controls)}`);

    // ---- plate probes ----------------------------------------------------
    const plateResults = [];
    for (const plate of PLATE_PROBES) {
      for (const sign of [1, -1]) {
        const offset = [0, 0, 0];
        offset[plate.axis] = sign * 1.2;
        const eye = [plate.centre[0] + offset[0], plate.centre[1] + offset[1], plate.centre[2] + offset[2]];
        // Look straight back at the plate along the probe axis.
        let yaw = 0;
        let pitch = 0;
        if (plate.axis === 0) yaw = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        else if (plate.axis === 2) yaw = sign > 0 ? Math.PI : 0;
        else { pitch = sign > 0 ? -1.5 : 1.5; }
        const shot = await shoot(eye[0], eye[1], eye[2], yaw, pitch);
        const masked = classify(shot.png, sky, horizonRow(pitch, FOV, HEIGHT));
        const blob = largestBlob(masked);
        const label = `${profile}-${plate.name.replace(/[^a-z0-9]+/gi, '-')}-${sign > 0 ? 'pos' : 'neg'}.png`;
        writeFileSync(join(OUT_DIR, 'plates', label), shot.buffer);
        plateResults.push({
          plate: plate.name, area: plate.area, axis: plate.axis, side: sign > 0 ? '+' : '-',
          eye, yaw, pitch, skyBelowHorizonPx: masked.count, largestBlobPx: blob.size,
          hole: blob.size >= MIN_BLOB_PX, screenshot: join('plates', label),
        });
      }
    }
    const plateHoles = plateResults.filter((r) => r.hole).length;
    console.error(`[seethrough] ${profile} plate probes: ${plateResults.length} shots, ${plateHoles} showing a hole`);

    // ---- the sweep -------------------------------------------------------
    const hits = [];
    let shots = 0;
    let covered = 0;
    let budgetStopped = false;
    const startedAt = Date.now();
    for (const position of positions) {
      if (Date.now() - startedAt > BUDGET_MS) { budgetStopped = true; break; }
      covered += 1;
      for (const pitch of PITCHES) {
        const firstRow = horizonRow(pitch, FOV, HEIGHT) + 2;
        for (const yaw of YAWS) {
          const shot = await shoot(position.x, position.eyeY, position.z, yaw, pitch);
          shots += 1;
          const masked = classify(shot.png, sky, firstRow);
          if (masked.count < MIN_BLOB_PX) continue;
          const blob = largestBlob(masked);
          if (blob.size < MIN_BLOB_PX) continue;
          const label = `${profile}-x${position.x}-z${position.z}-y${position.eyeY}`
            + `-yaw${Math.round((yaw * 180) / Math.PI)}-pitch${Math.round((pitch * 180) / Math.PI)}.png`;
          writeFileSync(join(OUT_DIR, 'hits', label), shot.buffer);
          hits.push({
            region: position.region,
            x: position.x, y: position.eyeY, z: position.z, floorY: position.floorY,
            yawDeg: Math.round((yaw * 180) / Math.PI),
            pitchDeg: Math.round((pitch * 180) / Math.PI),
            horizonRow: firstRow,
            skyBelowHorizonPx: masked.count,
            largestBlobPx: blob.size,
            blobBox: blob.box,
            screenshot: join('hits', label),
          });
          console.error(`[seethrough] HIT ${position.region} (${position.x},${position.eyeY},${position.z})`
            + ` yaw=${Math.round((yaw * 180) / Math.PI)} pitch=${Math.round((pitch * 180) / Math.PI)}`
            + ` blob=${blob.size}px`);
        }
      }
      if (shots % 400 < YAWS.length * PITCHES.length) {
        const rate = shots / ((Date.now() - startedAt) / 1000);
        console.error(`[seethrough] ${profile} ${shots}/${positions.length * YAWS.length * PITCHES.length}`
          + ` shots, ${hits.length} hits, ${rate.toFixed(1)}/s`);
      }
    }

    const runtimeErrors = bootErrors.slice(0, 80);
    runReport.profiles[profile] = {
      backend,
      controls,
      shots,
      positions: positions.length,
      positionsCovered: covered,
      skipPositions: SKIP_POSITIONS,
      budgetStopped,
      resumeAt: SKIP_POSITIONS + covered,
      hits,
      hitCount: hits.length,
      plateProbes: plateResults,
      plateHoles,
      bootErrors: bootErrorSnapshot.slice(0, 120),
      bootErrorCount: bootErrorSnapshot.length,
      sweepErrors: runtimeErrors,
      staleReceipts,
      elapsedMs: Date.now() - startedAt,
    };
    if (!controls.positivePass || !controls.negativePass || !controls.repaintPass) exitCode = Math.max(exitCode, 3);
    if (hits.length > 0 || plateHoles > 0) exitCode = Math.max(exitCode, 1);
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
  killServe();
}

const reportName = arg('--report-name', 'report.json');
writeFileSync(join(OUT_DIR, reportName), JSON.stringify(runReport, null, 2));
console.error(`[seethrough] written ${join(OUT_DIR, reportName)}`);
for (const [profile, data] of Object.entries(runReport.profiles)) {
  console.error(`[seethrough] ${profile}: covered=${data.positionsCovered ?? 'n/a'}/${data.positions ?? 'n/a'}`
    + ` resumeAt=${data.resumeAt ?? 'n/a'} budgetStopped=${data.budgetStopped ?? 'n/a'}`
    + ` hits=${data.hitCount ?? 'n/a'} plateHoles=${data.plateHoles ?? 'n/a'}`
    + ` bootErrors=${data.bootErrorCount ?? 'n/a'} staleReceipts=${data.staleReceipts ?? 'n/a'}`
    + ` controls=${JSON.stringify(data.controls ?? data.environmentInvalid)}`);
}
process.exit(exitCode);
