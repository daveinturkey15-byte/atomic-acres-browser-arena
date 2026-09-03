/**
 * capture-map3-views.mjs — headless Map 3 capture harness with HUD telemetry
 * and time sequences (Lane P, PASS 84).
 *
 * Differences from capture-corridor-views.mjs, which it supersedes:
 *   - every view logs the HUD line (fps · draws · tris · backend · shim · GPU)
 *     into <out>/hud.json, so an fps claim has a file behind it;
 *   - a view may be a SEQUENCE (`frames`, `intervalMs`): N screenshots over
 *     time from one pose, which is the only honest way to show the truck
 *     bending vegetation, a rolling sphere cutting a god ray, or a splash;
 *   - `--out <dir>` (default artifacts/map3) and `--only a,b` filter views;
 *   - the GPU must have 3000 MiB free before Chrome launches (shared machine).
 *
 * Usage: node scripts/qa/capture-map3-views.mjs [--out artifacts/x] [--only name,name] [--port 41931]
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const OUT = opt('--out', 'artifacts/map3');
const ONLY = opt('--only', '') ? new Set(opt('--only', '').split(',').map((s) => s.trim()).filter(Boolean)) : null;
const PORT = Number(opt('--port', '41931'));

function pose(angle, dist, y, pitch, yawOffset = 0, side = 0) {
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  // side > 0 steps to the corridor's right (local +x) before looking down it.
  const x = -dist * sinA + side * cosA;
  const z = -dist * cosA - side * sinA;
  return { x, y, z, yaw: angle + yawOffset, pitch };
}

// Corridor i sits at angle i * 2pi/8, its group origin 18 m from the hub, and
// runs along its local -z. World point for local (lx, lz): Three's Y rotation
// is x' = x cos + z sin, z' = -x sin + z cos. `yaw` is an offset from looking
// straight down the corridor: -pi/2 looks toward local +x.
function local(angle, lx, lz, y, yaw, pitch) {
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const wz0 = lz - 18;
  return { x: lx * cosA + wz0 * sinA, y, z: -lx * sinA + wz0 * cosA, yaw: angle + yaw, pitch };
}

const A = (i) => (i * Math.PI) / 4;

const VIEWS = [
  { name: 'hub-overview', ...pose(A(0), 4, 1.7, -0.05) },
  { name: 'corridor-1-nature', ...pose(A(0), 20, 1.7, -0.05) },
  { name: 'corridor-1-nature-vehicle', ...pose(A(0), 8, 1.6, -0.08) },
  // On the trail near the hub end, raised, looking down the corridor: the
  // truck patrols z = -4.5..-47.5 on a 26 s loop, so 14 frames over ~12 s
  // always hold it in frame and catch the saplings bending as it passes.
  // Off the trail on the +x verge, raised, angled back across the trail: the
  // truck drives past BELOW the camera instead of into the lens (the 0.4/-5.5
  // pose put it in the bottom corner as an unreadable green box), so the
  // saplings it pushes over and their rebound are both in frame.
  { name: 'corridor-1-truck-seq', ...local(A(0), 3.1, -2.2, 3.2, 0.24, -0.20), frames: 14, intervalMs: 1100 },
  { name: 'corridor-2-maths', ...pose(A(1), 20, 1.7, -0.05) },
  { name: 'corridor-3-grammar', ...pose(A(2), 20, 1.7, -0.05) },
  // HF-419 street cell, at the far end of the grammar corridor (local z -52..-74).
  // Both poses stand ON the cell, because that is the camera the technique is
  // for: a 1.7 m eye at the kerb, not a 20 m establishing shot. They are added
  // BEFORE the cell is built so the baseline is the same pose over bare ground.
  { name: 'corridor-3-street-cell', ...local(A(2), -5.2, -53.5, 1.87, 0, -0.045) },
  { name: 'corridor-3-street-kerbside', ...local(A(2), -2.4, -62.0, 1.42, -0.62, -0.10) },
  { name: 'corridor-4-water-mouth', ...pose(A(3), 16, 1.7, -0.05) },
  { name: 'corridor-4-water-shore', ...pose(A(3), 28, 1.7, -0.08) },
  { name: 'corridor-4-water-low', ...pose(A(3), 34, 1.1, -0.02) },
  { name: 'corridor-4-water-seq', ...pose(A(3), 30, 1.6, -0.10), frames: 6, intervalMs: 500 },
  { name: 'corridor-5-weather-spring', ...pose(A(4), 16, 1.7, -0.05) },
  { name: 'corridor-5-weather-storm-downpour', ...pose(A(4), 36, 1.7, -0.05) },
  { name: 'corridor-5-weather-storm-rings', ...pose(A(4), 42, 1.4, -0.42) },
  { name: 'corridor-5-weather-winter-blizzard', ...pose(A(4), 50, 1.7, -0.05) },
  { name: 'corridor-6-volume-godrays-mouth', ...pose(A(5), 16, 1.7, -0.05) },
  { name: 'corridor-6-volume-godrays-inside', ...pose(A(5), 28, 1.7, 0.10) },
  { name: 'corridor-6-volume-godrays-shafts', ...pose(A(5), 34, 1.7, 0.02, 0.55, -2.5) },
  { name: 'corridor-6-volume-body-seq', ...pose(A(5), 24, 1.7, 0.04), frames: 8, intervalMs: 900 },
  // Standing at the open colonnade side looking at the slit wall: sphere 0
  // patrols the aisle at 1.8 m/s and crosses the beams in front of the camera.
  { name: 'corridor-6-volume-body-close', ...local(A(5), -3.0, -21, 1.3, -Math.PI / 2 + 0.55, 0.02), frames: 14, intervalMs: 800 },
  { name: 'corridor-7-physics-jenga-balls', ...pose(A(6), 20, 1.7, -0.08) },
  { name: 'corridor-7-physics-machinery', ...pose(A(6), 42, 1.7, -0.08) },
  { name: 'corridor-8-colosseum-overlook', ...pose(A(7), 84.5, 1.7, -0.15) },
];

function gpuFreeMiB() {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader', { encoding: 'utf8' });
    const [used, total] = out.split(',').map((s) => Number.parseInt(s, 10));
    return total - used;
  } catch {
    return null;
  }
}

async function waitForGpu() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const free = gpuFreeMiB();
    if (free === null || free >= 3000) return free;
    console.log(`[capture] only ${free} MiB free on the GPU; waiting 60 s (attempt ${attempt + 1}/10)`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error('GPU never had 3000 MiB free; not launching Chrome on a shared machine');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const free = await waitForGpu();
  console.log(`[capture] GPU free: ${free} MiB; launching headless Chrome (WebGPU)`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio',
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const hudLog = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[browser ${msg.type()}]`, msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => { errors.push(String(err)); console.error('[browser error]', err); });

    const url = `http://localhost:${PORT}/map3.html`;
    console.log(`[capture] opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 60_000 });
    await page.waitForTimeout(4000);

    const readHud = () => page.evaluate(() => {
      const hud = document.getElementById('hud');
      const panel = document.getElementById('errors');
      return { hud: hud ? hud.textContent.split('|')[0].trim() : null, errors: panel ? panel.textContent.trim() : '' };
    });
    console.log('[capture] initial HUD:', (await readHud()).hud);

    for (const v of VIEWS) {
      if (ONLY && !ONLY.has(v.name)) continue;
      await page.evaluate(({ x, y, z, ry, rx }) => { window.__MAP3.setPose(x, y, z, ry, rx); }, { x: v.x, y: v.y, z: v.z, ry: v.yaw, rx: v.pitch });
      // 2.5 s: two HUD windows (0.5 s each) after pipelines settle for the new view.
      await page.waitForTimeout(2500);
      // Frame-time distribution over a fixed 3 s window AFTER the pose has
      // settled, so first-sight pipeline compiles are not counted as frame cost.
      // Optional: older builds have no frameStats and simply record null.
      await page.evaluate(() => { window.__MAP3.resetFrameStats?.(); });
      await page.waitForTimeout(3000);
      const frameStats = await page.evaluate(() => window.__MAP3.frameStats?.() ?? null);
      const frames = v.frames ?? 1;
      const samples = [];
      for (let f = 0; f < frames; f++) {
        const file = frames > 1 ? `${v.name}-${String(f).padStart(2, '0')}.png` : `${v.name}.png`;
        await page.screenshot({ path: resolve(OUT, file) });
        const h = await readHud();
        samples.push(h.hud);
        if (h.errors) console.log(`[capture] ERROR PANEL on ${v.name}:`, h.errors.slice(0, 400));
        if (f < frames - 1) await page.waitForTimeout(v.intervalMs ?? 500);
      }
      const fpsValues = samples.map((s) => Number.parseInt(s ?? '', 10)).filter((n) => Number.isFinite(n));
      hudLog[v.name] = { pose: { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch }, samples, fpsMin: Math.min(...fpsValues), fpsMax: Math.max(...fpsValues), frameStats };
      console.log(`[capture] ${v.name}: ${samples[samples.length - 1]}`);
    }
    hudLog.__pageErrors = errors;
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUT, 'hud.json'), JSON.stringify(hudLog, null, 2));
  console.log(`[capture] wrote ${resolve(OUT, 'hud.json')}`);
}

main().catch((err) => {
  console.error('[capture] Error:', err);
  process.exit(1);
});
