#!/usr/bin/env node
// Nuke Town 2 MICRO-SHIFT FLICKER PROBE — HF-536 night-defects-3b (job 2c).
//
// WHY THIS EXISTS. The two static coplanar audits
// (src/nuketown2-coplanar-audit.ts, src/nuketown2-oriented-coplanar-audit.ts)
// walk `buildNuketown2()` only. The Quality ART layer (`loadArenaArt`) is
// OUTSIDE both of them, so nothing has ever measured z-fighting on the arena
// AS DRAWN. This probe measures the rendered frame instead of the source, so
// it covers every mesh the renderer actually submits, art layer included.
//
// THE INSTRUMENT. z-fighting is a depth-precision RACE: two surfaces land in
// the same depth bucket, and which one wins is decided by numbers that move
// under a sub-millimetre camera change. A surface that is genuinely in front
// does not care about 2 mm. So: park on an authored review station, shoot it,
// translate the camera 2 mm along its own view-RIGHT vector, shoot it again,
// and count the pixels whose max channel jumped. A racing pair flips whole
// coherent patches; honest geometry moves by less than one pixel of parallax.
//
// THE CONTROL (this is the part that makes the number defensible). A frame is
// not perfectly repeatable even at a fixed pose: static-shadow refresh, TSL
// temporal state and any animation not bound to the frozen visual clock all
// wobble. So every station shoots THREE frames: A (pose), A2 (the SAME pose
// again), B (pose + 2 mm). Pixels that differ between A and A2 are runtime
// noise and are MASKED OUT of the flicker count. What survives is a pixel that
// is stable when nothing moves and unstable when the camera moves 2 mm — which
// is the definition of a depth race. The control fraction is reported next to
// the flicker fraction; a control that is not far below the flicker number
// means the run is not evidence and is marked NOISY.
//
// POSE PATH. Both A and B go through the SAME debug entry point
// (`setCaptureCameraPose`), never one through `setArenaReviewCamera` and the
// other through the pose hook, so the only difference between the two frames
// is the 2 mm. The station's authored pose is read back from the presentation
// receipt after `setArenaReviewCamera` — the camera's own quaternion, not a
// re-derivation from arena source — and decomposed to the yaw/pitch that the
// frame loop applies (`camera.rotation.set(pitch, yaw, 0, 'YXZ')`, see
// src/legacy-main.ts). Roll is zero for every lookAt-built station, so the
// decomposition is exact. The station's `fixedTimeMs` and `seed` are passed
// through, which freezes the visual clock and takes foliage sway, water and
// grade animation out of the measurement entirely.
//
// Usage:
//   node scripts/qa/probe-nuketown2-microshift-flicker.mjs \
//     --serve-dist dist-defects-b --out artifacts/qa/microshift-flicker \
//     [--stations a,b,c] [--hold-ms 6000] [--shift-m 0.002] [--threshold 40]
//     [--grid 40] [--target-pct 0.05] [--render quality|performance]
//     [--shifts 0,0.0005,0.002,0.008,0.032]
//
// ALWAYS pair the output with scripts/qa/classify-microshift-flicker.mjs. The
// raw flicker count is an UPPER BOUND, not a finding: a 2 mm lateral move
// shifts a surface 5 m away by 0.37 px, and that sub-pixel move legitimately
// changes an antialiased SILHOUETTE pixel by more than 40 levels. The
// classifier splits edge pixels (explained, not evidence) from interior
// pixels in a locally flat neighbourhood (the honest depth-race candidates).
//
// Exit 0 when every station is under --target-pct and no station is NOISY;
// 1 when a station is over; 2 when the environment is not a real WebGPU route.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const ARENA = arg('--arena', 'nuketown2');
// The owner's own eye lines: the street he walks down, the porch he enters by,
// his spawn yard, the garage, an interior and the vehicle cluster he stood
// next to. Not the overview stations — nobody plays from 46 m up.
const DEFAULT_STATIONS = [
  'nuketown2-street-centre',
  'nuketown2-front-porch',
  'nuketown2-north-yard',
  'nuketown2-garage',
  'nuketown2-north-interior',
  'nuketown2-vehicle-near',
];
const STATIONS = (arg('--stations', DEFAULT_STATIONS.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean));
const HOLD_MS = Number(arg('--hold-ms', '6000'));
const SETTLE_MS = Number(arg('--settle-ms', '5000'));
const SHIFT_M = Number(arg('--shift-m', '0.002'));
// --shifts turns the probe into a SHIFT SWEEP: one B frame per magnitude, all
// against the same A. That is the causal test for what the flicker is. A
// sub-pixel resampling artefact scales with the shift and vanishes as it goes
// to zero, because the projected offset is (shift / distance) * focalPixels; a
// depth race does not care how far the camera moved, only that it moved, so it
// stays roughly flat and does not collapse at 0.05 mm.
const SHIFTS = (arg('--shifts', String(SHIFT_M)).split(',').map(Number).filter((v) => Number.isFinite(v)));
// The render profile the frame is captured in. The owner's defect report is
// not qualified by profile, and the contract requires both to hold.
const RENDER_PROFILE = arg('--render', 'quality');
const THRESHOLD = Number(arg('--threshold', '40'));
const GRID = Number(arg('--grid', '40'));
const TARGET_PCT = Number(arg('--target-pct', '0.05'));
const PORT = Number(arg('--port', '41931'));
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();
const OUT_DIR = resolve(process.cwd(), arg('--out', 'artifacts/qa/microshift-flicker'));
const KEEP_FRAMES = !argv.includes('--no-frames');
mkdirSync(OUT_DIR, { recursive: true });

let BASE = arg('--url', `http://127.0.0.1:${PORT}`);
let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
    spawnSync('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
  } else SERVE_CHILD.kill('SIGTERM');
};

const serveDist = arg('--serve-dist', null);
if (serveDist) {
  console.error(`[microshift] serving ${serveDist} on :${PORT}`);
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[microshift] served dist never came up'); process.exit(2); }
  // Same squatter refusal as capture-arena-viewpoints.mjs (HF-535): a stale
  // preview for another worktree on this port would be measured silently.
  const diskIndex = readFileSync(resolve(serveDist, 'index.html'), 'utf8');
  const servedIndex = await (await fetch(`http://127.0.0.1:${PORT}/index.html`)).text();
  if (servedIndex !== diskIndex || server.exitCode !== null) {
    killServeChild();
    console.error(`[microshift] REFUSED :${PORT}: ${server.exitCode !== null ? `preview exited ${server.exitCode}` : 'served index.html differs from dist on disk'}`);
    process.exit(2);
  }
  BASE = `http://127.0.0.1:${PORT}`;
  SERVE_CHILD = server;
}

const gitSha = arg('--sha', null)
  ?? await execFileAsync('git', ['rev-parse', 'HEAD']).then((r) => r.stdout.trim()).catch(() => null);

// ---------------------------------------------------------------- pose maths
// Inverse of the frame loop's `camera.rotation.set(pitch, yaw, 0, 'YXZ')`.
// forward = (-cos p sin y, sin p, -cos p cos y); right = (cos y, 0, -sin y).
const rotateByQuaternion = (q, v) => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
};
const poseFromQuaternion = (q) => {
  const fwd = rotateByQuaternion(q, [0, 0, -1]);
  const right = rotateByQuaternion(q, [1, 0, 0]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, fwd[1])));
  const yaw = Math.atan2(-fwd[0], -fwd[2]);
  return { yaw, pitch, right, forward: fwd };
};

// ------------------------------------------------------------------ analysis
const toMaxChannel = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * info.channels;
    const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
    out[i] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  return { max: out, width: info.width, height: info.height };
};

const analyse = (a, a2, b, width, height) => {
  const n = width * height;
  const flicker = new Uint8Array(n);
  let flickerCount = 0;
  let controlCount = 0;
  let rawChangedCount = 0;
  for (let i = 0; i < n; i += 1) {
    const noisy = Math.abs(a2[i] - a[i]) > THRESHOLD;
    const moved = Math.abs(b[i] - a[i]) > THRESHOLD;
    if (noisy) controlCount += 1;
    if (moved) rawChangedCount += 1;
    if (moved && !noisy) { flicker[i] = 1; flickerCount += 1; }
  }
  const cells = [];
  const cellW = width / GRID;
  const cellH = height / GRID;
  for (let gy = 0; gy < GRID; gy += 1) {
    for (let gx = 0; gx < GRID; gx += 1) {
      const x0 = Math.floor(gx * cellW); const x1 = Math.floor((gx + 1) * cellW);
      const y0 = Math.floor(gy * cellH); const y1 = Math.floor((gy + 1) * cellH);
      let hits = 0;
      let sx = 0; let sy = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          if (flicker[y * width + x]) { hits += 1; sx += x; sy += y; }
        }
      }
      const area = Math.max(1, (x1 - x0) * (y1 - y0));
      cells.push({
        gx, gy, hits, area,
        fraction: hits / area,
        centre: hits > 0 ? [Math.round(sx / hits), Math.round(sy / hits)] : [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)],
        box: [x0, y0, x1, y1],
      });
    }
  }
  return {
    flicker,
    flickerCount,
    flickerPct: (flickerCount / n) * 100,
    controlCount,
    controlPct: (controlCount / n) * 100,
    rawChangedPct: (rawChangedCount / n) * 100,
    cells,
  };
};

// Grid heatmap: one pixel per cell, upscaled nearest so a reader can point at
// a region. Red channel is the cell's flicker density on a sqrt ramp so a 1 %
// cell is still visible next to a 40 % one.
const writeHeatmap = async (cells, path) => {
  const raw = Buffer.alloc(GRID * GRID * 3);
  const peak = Math.max(1e-6, ...cells.map((c) => c.fraction));
  for (const cell of cells) {
    const t = Math.sqrt(cell.fraction / peak);
    const o = (cell.gy * GRID + cell.gx) * 3;
    raw[o] = Math.round(255 * t);
    raw[o + 1] = Math.round(40 * t);
    raw[o + 2] = Math.round(60 * (1 - t));
  }
  await sharp(raw, { raw: { width: GRID, height: GRID, channels: 3 } })
    .resize(GRID * 16, GRID * 16, { kernel: 'nearest' }).png().toFile(path);
};

const writeMask = async (flicker, width, height, path) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    if (flicker[i]) { raw[i * 3] = 255; raw[i * 3 + 1] = 30; raw[i * 3 + 2] = 30; }
  }
  await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(path);
};

// ------------------------------------------------------------------- browser
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
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = `${BASE}/?release=latest&renderer=webgpu&render=${RENDER_PROFILE}&seed=viewpoint&previewTime=0&tod=authored`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  const bundleAtStart = await page.evaluate(() => {
    const entry = performance.getEntriesByType('resource').map((r) => r.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/')) : null;
  });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  const adapterInfo = await page.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { gpu: true, adapter: false };
      const device = await adapter.requestDevice();
      return { gpu: true, adapter: true, device: Boolean(device), vendor: adapter.info?.vendor ?? null };
    } catch (error) { return { gpu: true, adapter: 'error', error: String(error).slice(0, 120) }; }
  });
  const environmentInvalid =
    backend !== 'webgpu' ? `asked for webgpu, got backend=${backend}`
    : adapterInfo.device !== true ? 'no real WebGPU device'
    : (adapterInfo.vendor ?? '').toLowerCase() === 'microsoft' ? 'software rasteriser adapter'
    : null;
  console.error(`[microshift] backend=${backend} adapter=${JSON.stringify(adapterInfo)} bundle=${bundleAtStart}`);
  if (environmentInvalid) {
    writeFileSync(resolve(OUT_DIR, 'microshift-report.json'),
      `${JSON.stringify({ contract: 'nuketown2-microshift-flicker-v1', verdict: 'INVALID', environmentInvalid }, null, 2)}\n`);
    console.log(JSON.stringify({ verdict: 'INVALID', environmentInvalid }));
    exitCode = 2;
  } else {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.matchPhase === 'active' && s.gameStarted === true;
    }, undefined, { timeout: 180_000 });
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      if (scene) scene.traverse((obj) => {
        if (obj.name === 'bot-operator' || obj.name.startsWith('bot-operator')) {
          obj.position.set(0, -100, 0); obj.visible = false;
        }
      });
    });
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true); });

    // Commit a pose set through setCaptureCameraPose and hold for the frame to
    // converge, then screenshot. The revision the hook returns is the receipt
    // to wait on; a screenshot taken before it commits could show the last pose.
    const shoot = async (pose, tag) => {
      const revision = await page.evaluate((p) => window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
        p.x, p.y, p.z, p.yaw, p.pitch, p.fov, p.fixedTimeMs ?? undefined, p.seed ?? undefined,
      ), pose);
      if (typeof revision !== 'number') throw new Error(`setCaptureCameraPose refused pose for ${tag}`);
      const committed = await page.waitForFunction((rev) => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.captureCameraRevision === rev
          && review.presentedCamera?.captureRevision === rev ? review.presentedCamera : null;
      }, revision, { timeout: 30_000 }).then((h) => h.jsonValue()).catch(() => null);
      if (!committed) throw new Error(`pose ${tag} never committed by the presentation loop`);
      await page.waitForTimeout(HOLD_MS);
      const stillCommitted = await page.evaluate((rev) => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.presentedCamera?.captureRevision === rev;
      }, revision);
      if (!stillCommitted) throw new Error(`pose ${tag} lost its presentation receipt during the hold`);
      return page.screenshot();
    };

    const stations = [];
    for (const stationId of STATIONS) {
      const record = { stationId, ok: false };
      try {
        const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), stationId);
        if (applied === false) throw new Error('setArenaReviewCamera returned false — authored station missing');
        const review = await page.waitForFunction((id) => {
          const r = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
          return r.cameraId === id && r.presentedCamera?.captureRevision === r.captureCameraRevision ? r : null;
        }, stationId, { timeout: 30_000 }).then((h) => h.jsonValue()).catch(() => null);
        if (!review) throw new Error('review station never committed a presented frame');
        const cam = review.captureCamera;
        const { yaw, pitch, right } = poseFromQuaternion(cam.quaternion);
        const base = {
          x: cam.position[0], y: cam.position[1], z: cam.position[2],
          yaw, pitch, fov: cam.fov, fixedTimeMs: review.fixedTimeMs, seed: review.seed,
        };
        record.pose = { position: cam.position, quaternion: cam.quaternion, yaw, pitch, fov: cam.fov, right, shiftM: SHIFT_M, shifts: SHIFTS, fixedTimeMs: review.fixedTimeMs, seed: review.seed };

        const stationDir = resolve(OUT_DIR, stationId);
        mkdirSync(stationDir, { recursive: true });
        const frameA = await shoot(base, `${stationId}#A`);
        const frameA2 = await shoot(base, `${stationId}#A2`);
        const ma = await toMaxChannel(frameA);
        const ma2 = await toMaxChannel(frameA2);
        if (KEEP_FRAMES) {
          writeFileSync(resolve(stationDir, 'a.png'), frameA);
          writeFileSync(resolve(stationDir, 'a2-control.png'), frameA2);
        }

        // One B frame per requested magnitude; the headline numbers below stay
        // the primary shift so a sweep run is a superset of a normal run.
        const sweep = [];
        let frameB = null;
        let mb = null;
        for (const shiftM of SHIFTS) {
          const shifted = {
            ...base,
            x: base.x + right[0] * shiftM,
            y: base.y + right[1] * shiftM,
            z: base.z + right[2] * shiftM,
          };
          const frame = await shoot(shifted, `${stationId}#B@${shiftM}`);
          const m = await toMaxChannel(frame);
          if (ma.width !== m.width || ma.height !== m.height) throw new Error('frame size drifted mid-station');
          const r = analyse(ma.max, ma2.max, m.max, ma.width, ma.height);
          sweep.push({
            shiftM,
            projectedPxAt5m: Number(((shiftM / 5) * (ma.width / 2) / Math.tan((cam.fov * Math.PI / 180) / 2)).toFixed(4)),
            flickerPct: Number(r.flickerPct.toFixed(4)),
            flickerPixels: r.flickerCount,
          });
          if (KEEP_FRAMES) writeFileSync(resolve(stationDir, SHIFTS.length > 1 ? `b-shift-${shiftM}.png` : 'b-shifted.png'), frame);
          if (shiftM === SHIFT_M || frameB === null) { frameB = frame; mb = m; }
        }
        if (!KEEP_FRAMES || SHIFTS.length > 1) writeFileSync(resolve(stationDir, 'b-shifted.png'), frameB);
        const result = analyse(ma.max, ma2.max, mb.max, ma.width, ma.height);
        record.shiftSweep = sweep;
        await writeMask(result.flicker, ma.width, ma.height, resolve(stationDir, 'flicker-mask.png'));
        await writeHeatmap(result.cells, resolve(stationDir, 'flicker-heatmap.png'));

        const worst = [...result.cells].filter((c) => c.hits > 0)
          .sort((a, b2) => b2.hits - a.hits).slice(0, 12)
          .map((c) => ({ gx: c.gx, gy: c.gy, hits: c.hits, pctOfCell: Number((c.fraction * 100).toFixed(2)), centre: c.centre, box: c.box }));

        // A control that is not clearly quieter than the shifted frame means
        // the run measured runtime wobble, not depth. Say so rather than
        // publishing the number.
        const noisy = result.controlPct > Math.max(0.02, result.flickerPct * 0.5);
        record.ok = true;
        record.flickerPct = Number(result.flickerPct.toFixed(4));
        record.flickerPixels = result.flickerCount;
        record.controlPct = Number(result.controlPct.toFixed(4));
        record.rawChangedPct = Number(result.rawChangedPct.toFixed(4));
        record.noisy = noisy;
        record.verdict = noisy ? 'NOISY' : result.flickerPct <= TARGET_PCT ? 'PASS' : 'OVER';
        record.worstCells = worst;
        record.artifacts = {
          mask: resolve(stationDir, 'flicker-mask.png'),
          heatmap: resolve(stationDir, 'flicker-heatmap.png'),
          ...(KEEP_FRAMES ? { a: resolve(stationDir, 'a.png'), control: resolve(stationDir, 'a2-control.png'), shifted: resolve(stationDir, 'b-shifted.png') } : {}),
        };
        console.error(`[microshift] ${stationId.padEnd(30)} flicker ${record.flickerPct.toFixed(4)}%  control ${record.controlPct.toFixed(4)}%  ${record.verdict}`);
      } catch (error) {
        record.error = String(error).slice(0, 220);
        record.verdict = 'ERROR';
        console.error(`[microshift] ${stationId.padEnd(30)} ERROR ${record.error}`);
      }
      stations.push(record);
    }

    const over = stations.filter((s) => s.verdict === 'OVER').map((s) => s.stationId);
    const errored = stations.filter((s) => s.verdict === 'ERROR').map((s) => s.stationId);
    const noisyStations = stations.filter((s) => s.verdict === 'NOISY').map((s) => s.stationId);
    const verdict = errored.length > 0 ? 'INVALID' : over.length > 0 ? 'OVER'
      : noisyStations.length > 0 ? 'NOISY' : 'PASS';
    const report = {
      contract: 'nuketown2-microshift-flicker-v1',
      verdict,
      arena: ARENA,
      sha: gitSha,
      url: BASE,
      bundleAtStart,
      backend,
      adapter: adapterInfo,
      viewport: VIEWPORT,
      shiftM: SHIFT_M,
      shifts: SHIFTS,
      renderProfile: RENDER_PROFILE,
      maxChannelThreshold: THRESHOLD,
      holdMs: HOLD_MS,
      settleMs: SETTLE_MS,
      grid: GRID,
      targetPct: TARGET_PCT,
      capturedAt: new Date().toISOString(),
      over, noisyStations, errored,
      stations,
    };
    writeFileSync(resolve(OUT_DIR, 'microshift-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ verdict, over, noisyStations, errored, out: OUT_DIR }, null, 2));
    exitCode = verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1;
  }
} finally {
  await browser.close();
  killServeChild();
}
process.exit(exitCode);
