/**
 * capture-hf420-water.mjs — HF-420 water evidence harness (Lane AM, PASS 87).
 *
 * Boots the real game in INSTALLED CHROME HEADLESS (a real hardware WebGPU
 * device; Playwright's bundled chromium fails requestDevice), commits an
 * arena, starts a solo match, teleports to a named list of cameras and writes
 * one PNG per camera plus a JSON telemetry sidecar.
 *
 * Each camera writes up to three frames: the frame itself, the same frame with
 * the pond group hidden, and the same frame with the horizon skirt hidden.
 * Differencing a pair says which pixels an object OWNS, which is the only way
 * to tell "authored and invisible" from "authored and subtle" - and the only
 * way to measure the skirt/near-plane seam on named pixel sets.
 *
 * Owner rule: HEADLESS ONLY. There is no headed mode and no flag that adds one.
 * Shared machine: refuses to launch unless the GPU has >= 3000 MiB free.
 *
 * Usage:
 *   node scripts/qa/capture-hf420-water.mjs --out <dir> --port <n> \
 *        [--set map3|rustworks|farcrysis] [--width 2560] [--height 1440]
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const OUT = opt('--out', 'artifacts/hf420-water');
const PORT = Number(opt('--port', '4213'));
const SET = opt('--set', 'map3');
const WIDTH = Number(opt('--width', '2560'));
const HEIGHT = Number(opt('--height', '1440'));
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const gpuFreeMiB = () => Number(
  execSync('nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits')
    .toString().trim().split(String.fromCharCode(10))[0],
);
// Shared workstation: the owner's ComfyUI and llama-server live on this GPU.
// Wait for headroom rather than taking it; never kill anything that is not ours.
let freeMiB = gpuFreeMiB();
for (let attempt = 1; attempt <= 10 && (!Number.isFinite(freeMiB) || freeMiB < 3000); attempt += 1) {
  console.log(`[hf420] GPU free = ${freeMiB} MiB (< 3000) - waiting 60 s (attempt ${attempt}/10)`);
  await new Promise((r) => setTimeout(r, 60000));
  freeMiB = gpuFreeMiB();
}
if (!Number.isFinite(freeMiB) || freeMiB < 3000) {
  console.error(`[hf420] GPU still has ${freeMiB} MiB free after 10 attempts - BLOCKED, not launching`);
  process.exit(3);
}
console.log(`[hf420] GPU free = ${freeMiB} MiB`);

// yaw convention (legacy-main): direction = (-sin(yaw), 0, -cos(yaw)).
const YAW_MINUS_X = Math.PI / 2;
const YAW_PLUS_Z = Math.PI;
const YAW_MINUS_Z = 0;

// Map 3 Water bay: two reflecting basins at world x -65..-25, north z 10.7..14.1,
// south z 4.9..8.3, walkway between them at z = 9.5, bay floor y = 0.
const SETS = {
  map3: {
    arena: 'map3',
    shots: [
      // wide: down the Water bay from above its mouth, both basins in frame
      { name: 'wide', x: -30, y: 5.5, z: 9.5, yaw: YAW_MINUS_X, pitch: -0.42 },
      // shoreline: over the walkway kerb into the north basin's near edge
      { name: 'shoreline', x: -45, y: 2.2, z: 9.5, yaw: YAW_PLUS_Z, pitch: -0.55 },
      // grazing: eye almost in the plane of the north basin, looking along it
      { name: 'grazing', x: -25.5, y: 0.30, z: 12.4, yaw: YAW_MINUS_X, pitch: -0.02 },
      // shallow-end: looking straight down into the north basin
      { name: 'shallow-down', x: -45, y: 3.0, z: 12.4, yaw: YAW_MINUS_X, pitch: -1.35 },
    ],
  },
  // The only body in the game whose Gerstner slope reaches the foam gate:
  // the turbulent control for the backscatter proof. The rig deck is at y ~ 0
  // and the sea at y = -19.5, so every pose here is OFF the rig and low, or the
  // ocean is not in the frame at all.
  rustworks: {
    arena: 'rustworks-1v1',
    shots: [
      { name: 'storm-wide', x: 0, y: 6, z: 130, yaw: YAW_MINUS_Z, pitch: -0.30 },
      { name: 'storm-grazing', x: 0, y: -18.0, z: 130, yaw: YAW_MINUS_Z, pitch: -0.02 },
      { name: 'storm-down', x: 0, y: -12, z: 130, yaw: YAW_MINUS_Z, pitch: -0.95 },
    ],
  },
  // Calm shared ocean: the colour-model control that carries no foam and no
  // backscatter, so a change here is absorption and nothing else.
  'high-seas': {
    arena: 'high-seas',
    shots: [
      { name: 'sea-wide', x: 0, y: 4, z: 120, yaw: YAW_MINUS_Z, pitch: -0.20 },
      { name: 'sea-grazing', x: 0, y: -0.9, z: 120, yaw: YAW_MINUS_Z, pitch: -0.02 },
      { name: 'sea-down', x: 0, y: 6, z: 120, yaw: YAW_MINUS_Z, pitch: -1.0 },
    ],
  },
};
const set = SETS[SET];
if (!set) { console.error(`[hf420] unknown --set ${SET}`); process.exit(4); }

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
page.on('pageerror', (error) => console.error('[hf420] pageerror:', String(error).slice(0, 240)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf420&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('[hf420] backend =', backend);
if (!backend || !backend.toLowerCase().includes('webgpu')) {
  console.error('[hf420] NOT on WebGPU — aborting rather than reporting a fake pass');
  await browser.close();
  process.exit(2);
}
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, set.arena);
await page.waitForFunction((id) => document.documentElement.dataset.arenaId === id, set.arena, { timeout: 240000 });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(
  () => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted),
  undefined,
  { timeout: 240000 },
);
console.log('[hf420] solo match started on', set.arena);
// Deterministic, quiet frame: no bots shooting the camera, no viewmodel in the
// way. Every pose below is a FIXED-TIME review camera, so a capture is a pure
// function of (pose, seed, build) and two builds are comparable pixel for pixel.
await page.evaluate(() => {
  window.__ATOMIC_ACRES_DEBUG__.clearBots();
  window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
});
// Warm-up: let pipelines settle and the frame loop reach steady state.
await new Promise((r) => setTimeout(r, 12000));

// Independent proof that the authored water actually exists in the live scene
// graph, so a capture that shows nothing can be told apart from a body that was
// never built.
const waterNodes = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const found = [];
  scene.traverse((node) => {
    if (typeof node.name === 'string' && node.name.includes('water')) {
      found.push({
        name: node.name,
        visible: node.visible,
        bodyId: node.userData?.waterBodyId ?? null,
        level: node.userData?.waterLevel ?? null,
        segments: node.userData?.surfaceSegments ?? null,
        amplitude: node.userData?.waveAmplitude ?? null,
        shape: node.userData?.waterShape ?? null,
      });
    }
  });
  return found;
});
console.log('[hf420] water nodes:', JSON.stringify(waterNodes));

const telemetry = [];
for (const shot of set.shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
      s.x, s.y, s.z, s.yaw, s.pitch ?? 0, 75, 4000, 6420,
    );
  }, shot);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  // Coverage probe: the same frame with the pool group hidden. Differencing the
  // pair says exactly which pixels the authored ponds own, so "the pond is in
  // this shot" is measured rather than asserted from a dark screenshot.
  const hidden = await page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    const pools = scene.getObjectByName('Pass 64 TSL water pools');
    if (!pools) return false;
    pools.visible = false;
    return true;
  });
  if (hidden) {
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${shot.name}-nopool.png` });
    await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      const pools = scene.getObjectByName('Pass 64 TSL water pools');
      if (pools) pools.visible = true;
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  // Skirt probe: the same frame with the horizon skirt hidden. The skirt is an
  // unlit ring that carries the sea past the displaced near plane, and the two
  // surfaces are supposed to agree about the colour of deep water where they
  // meet. Differencing this pair yields exactly the skirt's pixels, which makes
  // "the seam does/does not show a hue break" a measurement on named pixel sets
  // instead of an eyeball verdict on a screenshot.
  const skirtHidden = await page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    const skirts = [];
    scene.traverse((node) => {
      if (typeof node.name === 'string' && node.name.includes('ocean horizon')) skirts.push(node);
    });
    if (skirts.length === 0) return 0;
    for (const skirt of skirts) skirt.visible = false;
    return skirts.length;
  });
  if (skirtHidden > 0) {
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: `${OUT}/${shot.name}-noskirt.png` });
    await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      scene.traverse((node) => {
        if (typeof node.name === 'string' && node.name.includes('ocean horizon')) node.visible = true;
      });
    });
    await new Promise((r) => setTimeout(r, 1200));
  }
  telemetry.push({ ...shot, poolCoverageProbe: hidden, skirtProbeMeshes: skirtHidden });
  console.log('[hf420] captured', shot.name, hidden ? '(+ pool-hidden probe)' : '', skirtHidden ? '(+ skirt-hidden probe)' : '');
}
// Frame-time budget from the game's own instrument, after the captures, with
// the camera released back to the player.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null); });
await new Promise((r) => setTimeout(r, 8000));
let budget = null;
try {
  budget = await page.evaluate(async () => window.__ATOMIC_ACRES_DEBUG__.sampleArenaPerformanceBudget());
} catch (error) {
  console.error('[hf420] performance budget sample failed:', String(error).slice(0, 200));
}
writeFileSync(`${OUT}/telemetry.json`, `${JSON.stringify({
  set: SET, arena: set.arena, width: WIDTH, height: HEIGHT, freeMiB, backend,
  waterNodes, shots: telemetry, budget,
}, null, 2)}
`);
await browser.close();
console.log('[hf420] done ->', OUT);
