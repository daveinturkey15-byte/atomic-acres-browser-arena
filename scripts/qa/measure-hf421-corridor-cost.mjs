/**
 * measure-hf421-corridor-cost.mjs - HF-421 pass/fail bar 2, taken properly.
 *
 * WHY THIS EXISTS AND WHAT WAS WRONG BEFORE.
 *
 * The first HF-421 evidence run reported "+10 draws / +2k triangles" from ONE
 * `capture-map3-views.mjs` sample per view, taken on the standalone showcase
 * page. Two things were wrong with that and this script fixes both:
 *
 *   1. ONE SAMPLE IS NOT A MEASUREMENT. `capture-map3-views.mjs` reads the HUD
 *      div, which the page only rewrites once every 0.5 s, so a read taken too
 *      early returns the PREVIOUS view's string - an independent re-run of the
 *      original numbers came back 4-6 draws apart, half of the +12 budget, and
 *      one control view returned the stale boot string. Here the counters are
 *      read from `renderer.info.render` directly, once per animation frame,
 *      `--samples` times per view, and the median, min and max are all
 *      recorded. A point delta with no spread behind it is not reproducible.
 *
 *   2. THE SHOWCASE PAGE IS NOT THE ONLY PLACE THIS SHIPS. `src/map3-arena.ts`
 *      builds the same corridor into the PLAYABLE arena, which has graphics
 *      profiles, a filmic chain, a shadowed sun and bots that the standalone
 *      page does not. `--route arena` boots the real arena, teleports to the
 *      god-ray lane and reads `samplePresentationCounters()`, which is the
 *      arena renderer's own `info.render.calls` / `.triangles`.
 *
 * SHOWCASE A/B IS ONE BUILD. `?bay=0` takes the kit out (the showcase entry is
 * the only page that reads that flag), so before and after are the same build,
 * the same browser session and the same poses.
 *
 * ARENA A/B IS TWO BUILDS, DELIBERATELY. The arena never reads the URL - that
 * was the debug backdoor this repair closed - so an arena before/after is run
 * as two invocations of this script against two builds, and the report says so
 * rather than pretending it was one session.
 *
 * SHARED MACHINE. Headless always; `waitForSharedMachine` holds the run until
 * the owner's ComfyUI queue is empty and at least 3000 MiB of VRAM is free.
 *
 * Usage:
 *   node scripts/qa/measure-hf421-corridor-cost.mjs --route showcase \
 *     --dist dist --port 4223 --samples 15 --out artifacts/hf421/cost
 *   node scripts/qa/measure-hf421-corridor-cost.mjs --route arena \
 *     --dist dist --port 4223 --samples 15 --label after --out artifacts/hf421/cost
 */
import { chromium } from '@playwright/test';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { waitForSharedMachine } from './lib/shared-machine-guard.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const ROUTE = opt('--route', 'showcase');
const DIST = resolve(opt('--dist', 'dist'));
const PORT = Number(opt('--port', process.env.QA_PREVIEW_PORT ?? '4223'));
const OUT = resolve(opt('--out', 'artifacts/hf421/cost'));
const SAMPLES = Number(opt('--samples', '15'));
const LABEL = opt('--label', ROUTE);
/**
 * The query string that makes the "before" half. Default `?bay=0` takes the
 * kit out. Pass `--before-query ""` to run a NULL A/B - the same page loaded
 * twice - which is the only way to size the load-to-load noise floor, and the
 * only way a per-view delta can be read as the change rather than as reload
 * jitter. Corridor 1 is the control and it moved by a reproducible -3 draws
 * under the real A/B; the null run is what says whether that is this kit.
 */
const BEFORE_QUERY = opt('--before-query', '?bay=0');
/**
 * Keys pressed on the showcase page after load, before any pose is set - the
 * page's own debug keys, used here to ISOLATE a channel rather than to guess
 * at one. `--keys o` turns the sun's shadow pass off; `--keys 1` solos
 * corridor 1. `renderer.info.render.calls` counts EVERY pass in the frame,
 * including the scene-wide shadow pass, so a per-view draw count is not a
 * per-corridor draw count until one of these is used to prove which.
 */
const KEYS = opt('--keys', '').split(',').map((k) => k.trim()).filter(Boolean);
const HOST = '127.0.0.1';

if (!['showcase', 'arena'].includes(ROUTE)) throw new Error(`--route must be showcase|arena, got ${ROUTE}`);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error(`Invalid port: ${PORT}`);
if (!Number.isInteger(SAMPLES) || SAMPLES < 3) throw new Error(`--samples must be an integer >= 3, got ${SAMPLES}`);
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No index.html under ${DIST}; run npm run build first`);

/* ------------------------------------------------------------------ */
/* Poses                                                               */
/* ------------------------------------------------------------------ */

/**
 * The showcase poses, copied EXACTLY from `capture-map3-views.mjs` so the two
 * harnesses can be compared line for line. Corridor 6 is spoke 5; the control
 * is corridor 1, which this change must not touch.
 */
const A = (i) => (i * Math.PI) / 4;
function pose(angle, dist, y, pitch, yawOffset = 0, side = 0) {
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const x = -dist * sinA + side * cosA;
  const z = -dist * cosA - side * sinA;
  return { x, y, z, yaw: angle + yawOffset, pitch };
}
const SHOWCASE_VIEWS = [
  { name: 'corridor-6-volume-godrays-mouth', ...pose(A(5), 16, 1.7, -0.05) },
  { name: 'corridor-6-volume-godrays-inside', ...pose(A(5), 28, 1.7, 0.10) },
  { name: 'corridor-6-volume-godrays-shafts', ...pose(A(5), 34, 1.7, 0.02, 0.55, -2.5) },
  { name: 'corridor-1-nature', ...pose(A(0), 20, 1.7, -0.05) },
];

/** Mirrored from `MAP3_LANES` / `laneToWorld` in src/map3-arena.ts. */
const MAP3_LANE_START = 34;
const ARENA_LANES = [
  { id: 'godrays', edge: 3, lateral: -13, depths: [2, 10, 16], pitch: 0.04 },
  { id: 'vegetation', edge: 2, lateral: 0, depths: [14], pitch: -0.04 },
];
function laneToWorld(lane, x, z) {
  const px = x + lane.lateral;
  const pz = z - MAP3_LANE_START;
  switch (lane.edge) {
    case 0: return { x: px, z: pz };
    case 1: return { x: -pz, z: px };
    case 2: return { x: -px, z: -pz };
    default: return { x: pz, z: -px };
  }
}
function laneYaw(lane) {
  const a = laneToWorld(lane, 0, 0);
  const b = laneToWorld(lane, 0, -1);
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
};

/** Plain static server, no SPA fallback: a missing chunk must be a 404. */
function startStaticServer(root) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (target !== root && !target.startsWith(root + sep)) { response.writeHead(403).end('forbidden'); return; }
    let file = target;
    try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { response.writeHead(404).end('not found'); return; }
    if (!existsSync(file)) { response.writeHead(404).end('not found'); return; }
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((done) => server.listen(PORT, HOST, () => done(server)));
}

/** Median without mutating the input and without Array.prototype string sort. */
function median(values) {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function stat(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { n: 0, median: null, min: null, max: null };
  return { n: finite.length, median: median(finite), min: Math.min(...finite), max: Math.max(...finite) };
}

const launchArgs = [
  '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
];

/* ------------------------------------------------------------------ */
/* Showcase route                                                      */
/* ------------------------------------------------------------------ */

async function runShowcase(page, config, url) {
  console.log(`[cost] showcase ${config}: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', undefined, { timeout: 120000 });
  // Same settle as capture-map3-views.mjs, so the comparison is like for like.
  await page.waitForTimeout(4000);
  for (const key of KEYS) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
  if (KEYS.length > 0) console.log(`[cost]   pressed ${KEYS.join(', ')}`);
  const views = {};
  for (const v of SHOWCASE_VIEWS) {
    await page.evaluate(({ x, y, z, ry, rx }) => { window.__MAP3.setPose(x, y, z, ry, rx); },
      { x: v.x, y: v.y, z: v.z, ry: v.yaw, rx: v.pitch });
    await page.waitForTimeout(2500);
    const rows = await page.evaluate(async (n) => {
      const renderer = window.__MAP3?.renderer;
      const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
      const out = [];
      for (let i = 0; i < n; i += 1) {
        await frame();
        const info = renderer?.info?.render ?? {};
        out.push({ calls: info.drawCalls ?? info.calls ?? null, triangles: info.triangles ?? null });
      }
      return out;
    }, SAMPLES);
    views[v.name] = {
      pose: { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch },
      draws: stat(rows.map((r) => r.calls)),
      triangles: stat(rows.map((r) => r.triangles)),
      samples: rows,
    };
    const d = views[v.name].draws;
    const t = views[v.name].triangles;
    console.log(`[cost]   ${v.name}: draws ${d.median} [${d.min}..${d.max}], tris ${t.median} [${t.min}..${t.max}]`);
  }
  return views;
}

/* ------------------------------------------------------------------ */
/* Arena route                                                         */
/* ------------------------------------------------------------------ */

async function runArena(page, receipt) {
  await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120000 });

  // Select, then VERIFY it took: selectArena resolves and does nothing until
  // the menu preview marks selection ready. See capture-map3-explore-evidence.
  let selected = false;
  for (let attempt = 0; attempt < 60 && !selected; attempt += 1) {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('map3')).catch(() => {});
    selected = await page.evaluate(
      () => (document.querySelector('#arena-title')?.textContent ?? '').trim().toUpperCase() === 'MAP 3',
    );
    if (!selected) await page.waitForTimeout(1000);
  }
  if (!selected) throw new Error('Map 3 never became the selected arena');

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  const boot = await (await page.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot?.();
    if (state?.matchPhase === 'active' && state?.gameStarted === true) return 'active';
    const status = document.querySelector('#status')?.textContent ?? '';
    if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
    return null;
  }, undefined, { timeout: 180000 })).jsonValue();
  if (boot !== 'active') throw new Error(`Map 3 did not boot: ${boot}`);
  receipt.boot = boot;
  // Bots move and change the draw count under the camera, so freeze them: this
  // measures the CORRIDOR, not the population standing in it.
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true)).catch(() => {});
  await page.waitForTimeout(6000);

  const views = {};
  for (const lane of ARENA_LANES) {
    const yaw = laneYaw(lane);
    for (const depth of lane.depths) {
      const world = laneToWorld(lane, 0, -depth);
      await page.evaluate(({ x, z, y, p }) => {
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, y, p);
      }, { x: world.x, z: world.z, y: yaw, p: lane.pitch });
      await page.waitForTimeout(4000);
      const rows = await page.evaluate(async (n) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
        const out = [];
        for (let i = 0; i < n; i += 1) {
          await frame();
          const c = api.samplePresentationCounters();
          out.push({ calls: c?.calls ?? null, triangles: c?.triangles ?? null });
        }
        return out;
      }, SAMPLES);
      const name = `arena-${lane.id}-depth${depth}`;
      views[name] = {
        world: { x: Number(world.x.toFixed(3)), y: 1.7, z: Number(world.z.toFixed(3)) },
        yaw: Number(yaw.toFixed(4)), pitch: lane.pitch,
        draws: stat(rows.map((r) => r.calls)),
        triangles: stat(rows.map((r) => r.triangles)),
        samples: rows,
      };
      const d = views[name].draws;
      const t = views[name].triangles;
      console.log(`[cost]   ${name}: draws ${d.median} [${d.min}..${d.max}], tris ${t.median} [${t.min}..${t.max}]`);
      await page.screenshot({ path: join(OUT, `${LABEL}-${name}.png`) });
    }
  }
  return views;
}

/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const machine = await waitForSharedMachine({ label: 'hf421-cost' });
  console.log(`[cost] ${machine.freeVramMib} MiB free, ComfyUI idle; serving ${DIST} on ${PORT}`);
  const server = await startStaticServer(DIST);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launchArgs });

  const receipt = {
    capturedAt: new Date().toISOString(), route: ROUTE, label: LABEL, dist: DIST,
    samplesPerView: SAMPLES, keys: KEYS, machine, pageErrors: [], results: {},
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    page.on('pageerror', (error) => { receipt.pageErrors.push(String(error)); console.error('[browser error]', error); });

    if (ROUTE === 'showcase') {
      // AFTER first, then BEFORE, in the SAME session: a reload is cheaper than
      // a second browser and removes the "two runs, two GPU states" objection.
      receipt.beforeQuery = BEFORE_QUERY;
      receipt.nullAb = BEFORE_QUERY === '';
      receipt.results.after = await runShowcase(page, 'after (kit on)', `http://${HOST}:${PORT}/map3.html`);
      receipt.results.before = await runShowcase(page, `before (${BEFORE_QUERY || 'NULL A/B - same page'})`, `http://${HOST}:${PORT}/map3.html${BEFORE_QUERY}`);
      receipt.deltas = {};
      for (const v of SHOWCASE_VIEWS) {
        const a = receipt.results.after[v.name];
        const b = receipt.results.before[v.name];
        receipt.deltas[v.name] = {
          draws: a.draws.median - b.draws.median,
          drawsWorstCase: a.draws.max - b.draws.min,
          triangles: a.triangles.median - b.triangles.median,
          trianglesWorstCase: a.triangles.max - b.triangles.min,
        };
      }
      console.log('[cost] deltas (median, and worst case = after.max - before.min):');
      for (const [name, d] of Object.entries(receipt.deltas)) {
        console.log(`[cost]   ${name}: ${d.draws} draws (worst ${d.drawsWorstCase}), ${d.triangles} tris (worst ${d.trianglesWorstCase})`);
      }
    } else {
      receipt.results.arena = await runArena(page, receipt);
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }

  const file = join(OUT, `hf421-cost-${LABEL}.json`);
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[cost] wrote ${file}`);
}

main().catch((error) => { console.error('[cost] Error:', error); process.exitCode = 1; });
