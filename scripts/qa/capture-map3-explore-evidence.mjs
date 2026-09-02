/**
 * capture-map3-explore-evidence.mjs - the PASS 87 Map 3 EXPLORE evidence run.
 *
 * WHAT THIS PROVES, AND WHY IT IS ONE SCRIPT.
 *
 * Two claims land together and are only true of the same running arena, so
 * they are measured in one browser session rather than two:
 *
 *   1. THE HUD IS HONEST IN EXPLORE. Map 3 is a `kind: 'explore'` arena. The
 *      matchbar used to read "TEAM DEATHMATCH / 04:37 / AQUA 0 - 0 CORAL" and
 *      end a walk on a DEFEAT card. This run reads the live DOM and records
 *      the label, whether the clock and scoreline are displayed at all, the
 *      connection pill and the pause hint - as MEASURED values, so the
 *      assertions below can fail rather than decorate.
 *
 *   2. THERE ARE EIGHT CORRIDORS IN THE ARENA. The Rapier playground landed as
 *      the eighth lane. The previous corridor stills were captured ad hoc, had
 *      no producing script, came in two different resolutions, and there were
 *      only SEVEN of them - the eighth was never photographed at all. This
 *      captures all eight, from the arena (not the standalone showcase page),
 *      at one resolution, from poses DERIVED from the lane table rather than
 *      eyeballed.
 *
 * WHY THE POSES ARE COMPUTED. `MAP3_LANES` gives each lane an edge and a
 * lateral offset, and `laneToWorld` maps corridor-local to world by a quarter
 * turn. Hand-tuned world coordinates rot silently the moment a lane moves, and
 * a still that quietly stops framing its corridor is exactly the failure this
 * pass is fixing. So the lane table is mirrored here and
 * `src/map3-explore-capture-contract.test.ts` asserts the mirror still matches
 * `MAP3_LANES` exactly - if a lane moves and this file does not, that test
 * fails before a stale still can be published.
 *
 * SHARED MACHINE. The owner runs ComfyUI and local inference on this box. The
 * GPU must have >= 3000 MiB free AND the ComfyUI queue must be empty before
 * Chrome launches, and only one browser runs at a time. Headless always: a
 * guard on this machine kills headed browsers.
 *
 * Usage:
 *   node scripts/qa/capture-map3-explore-evidence.mjs \
 *     --dist dist --port 4195 --out docs/evidence/pass87/map3-explore
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const DIST = resolve(opt('--dist', 'dist'));
const PORT = Number(opt('--port', process.env.QA_PREVIEW_PORT ?? '4195'));
const OUT = resolve(opt('--out', 'docs/evidence/pass87/map3-explore'));
const HOST = '127.0.0.1';

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) throw new Error(`Invalid port: ${PORT}`);
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No index.html under ${DIST}; run npm run build first`);

/**
 * THE LANE TABLE, MIRRORED FROM `MAP3_LANES` (src/map3-arena.ts).
 *
 * `depth` is how far down the corridor (corridor-local +z, metres from
 * MAP3_LANE_START) the camera stands, and is the only per-lane judgement here:
 * a wide corridor needs to be entered before it reads, a gallery reads from
 * its mouth. Everything else is derived.
 */
const MAP3_LANE_START = 34;
const LANES = [
  { id: 'shoreline', label: 'Shoreline', edge: 0, lateral: -26, depth: 26, pitch: -0.04 },
  { id: 'colosseum', label: 'Colosseum', edge: 0, lateral: 26, depth: 18, pitch: -0.02 },
  { id: 'raymarch', label: 'Raymarched SDF', edge: 1, lateral: -13, depth: 16, pitch: -0.02 },
  { id: 'grammar', label: 'Shape grammar', edge: 1, lateral: 13, depth: 16, pitch: 0.02 },
  { id: 'vegetation', label: 'Vegetation', edge: 2, lateral: 0, depth: 18, pitch: -0.04 },
  // THE EIGHTH. Never photographed before this pass.
  { id: 'physics', label: 'Rapier playground', edge: 2, lateral: 24, depth: 16, pitch: -0.10 },
  { id: 'godrays', label: 'God rays', edge: 3, lateral: -13, depth: 20, pitch: 0.04 },
  { id: 'seasons', label: 'Seasons', edge: 3, lateral: 14, depth: 20, pitch: -0.02 },
];

/** Corridor-local -> world. The exact quarter turns of `laneToWorld`. */
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

/**
 * The yaw that looks DOWN a lane, derived rather than tabulated.
 *
 * The game's forward vector is (-sin(yaw), 0, -cos(yaw)), so
 * yaw = atan2(-dx, -dz) for a world direction d. d is taken from two points a
 * metre apart along the lane, which makes this correct for any edge without a
 * per-edge constant to get wrong.
 */
function laneYaw(lane) {
  const a = laneToWorld(lane, 0, 0);
  const b = laneToWorld(lane, 0, 1);
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

function freeVramMib() {
  const out = execSync('nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits', { encoding: 'utf8' });
  return Math.min(...out.trim().split('\n').map((line) => Number.parseInt(line.trim(), 10)).filter(Number.isFinite));
}

async function comfyQueueDepth() {
  try {
    const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return 0;
    const queue = await response.json();
    return (queue.queue_running?.length ?? 0) + (queue.queue_pending?.length ?? 0);
  } catch {
    // ComfyUI not running at all is the empty case, not an error.
    return 0;
  }
}

/** Never take the GPU from the owner's own work. */
async function waitForSharedMachine() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const free = freeVramMib();
    const queued = await comfyQueueDepth();
    if (free >= 3000 && queued === 0) return { freeVramMib: free, comfyQueueDepth: queued, attempts: attempt + 1 };
    console.log(`[evidence] waiting: ${free} MiB free, ComfyUI queue ${queued} (attempt ${attempt + 1}/20)`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('GPU never had 3000 MiB free with an empty ComfyUI queue; not launching Chrome');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
};

/**
 * A PLAIN static server, deliberately WITHOUT an SPA fallback.
 *
 * `vite preview` answers an unknown path with index.html and a 200, which
 * would turn every missing chunk into a silent success and make a
 * "zero failed requests" claim meaningless. A missing file here is a 404.
 */
function startStaticServer(root) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    const decoded = decodeURIComponent(url.pathname);
    const target = resolve(root, `.${decoded}`);
    // Path containment: a decoded '..' must not escape the served root.
    if (target !== root && !target.startsWith(root + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    let file = target;
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
    } catch {
      response.writeHead(404).end('not found');
      return;
    }
    if (!existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolveServer) => server.listen(PORT, HOST, () => resolveServer(server)));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const machine = await waitForSharedMachine();
  console.log(`[evidence] ${machine.freeVramMib} MiB free, ComfyUI idle; serving ${DIST} on ${PORT}`);
  const server = await startStaticServer(DIST);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const receipt = { capturedAt: new Date().toISOString(), machine, dist: DIST, lanes: {}, hud: null, pageErrors: [], failedRequests: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    page.on('pageerror', (error) => { receipt.pageErrors.push(String(error)); console.error('[browser error]', error); });
    page.on('requestfailed', (request) => receipt.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? null }));
    page.on('response', (response) => {
      if (response.status() >= 400) receipt.failedRequests.push({ url: response.url(), status: response.status() });
    });

    await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), { timeout: 120_000 });

    // Selecting map3 RESOLVES AND PREPARES the lazy arena - which is the whole
    // point of prepare-then-build: after this, buildMap3 is callable and will
    // not throw for want of Rapier.
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('map3'));
    receipt.map3Prepared = true;

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(
      () => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase === 'active',
      { timeout: 180_000 },
    );
    await page.waitForTimeout(6000);

    // ---- 1. THE EXPLORE HUD, AS THE DOM ACTUALLY HAS IT --------------------
    receipt.hud = await page.evaluate(() => {
      // `shown` is COMPUTED, not inferred from the `hidden` attribute alone: a
      // stylesheet `display` beats the attribute, and "the clock is hidden" has
      // to mean the player cannot see it.
      const read = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return { present: false, shown: false, text: null };
        const style = getComputedStyle(element);
        const shown = !element.hidden
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && element.getClientRects().length > 0;
        return { present: true, shown, text: (element.textContent ?? '').trim() };
      };
      return {
        modeLabel: read('#match-mode-label'),
        timer: read('#timer'),
        scoreline: read('#scoreline'),
        objective: read('#objective'),
        connectionPill: read('#connection-pill'),
        pauseHint: read('#pause-hint'),
      };
    });
    await page.screenshot({ path: join(OUT, 'map3-explore-hud.png') });
    console.log('[evidence] HUD:', JSON.stringify(receipt.hud, null, 2));

    // ---- 2. THE EIGHT CORRIDORS -------------------------------------------
    for (const lane of LANES) {
      const world = laneToWorld(lane, 0, lane.depth);
      const yaw = laneYaw(lane);
      await page.evaluate(({ x, z, yaw: y, pitch }) => {
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, y, pitch);
      }, { x: world.x, z: world.z, yaw, pitch: lane.pitch });
      // Long enough for streamed pipelines and the corridor's own animation to
      // settle; a still taken mid-compile shows an untextured corridor.
      await page.waitForTimeout(3500);
      const file = `map3-corridor-${lane.id}.png`;
      await page.screenshot({ path: join(OUT, file) });
      receipt.lanes[lane.id] = {
        label: lane.label, edge: lane.edge, lateral: lane.lateral, depth: lane.depth,
        world: { x: Number(world.x.toFixed(3)), y: 1.7, z: Number(world.z.toFixed(3)) },
        yaw: Number(yaw.toFixed(4)), pitch: lane.pitch, file,
      };
      console.log(`[evidence] ${lane.id} -> ${file} at (${world.x.toFixed(1)}, ${world.z.toFixed(1)}) yaw ${yaw.toFixed(2)}`);
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }

  writeFileSync(join(OUT, 'map3-explore-evidence.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[evidence] wrote ${join(OUT, 'map3-explore-evidence.json')}`);

  // Falsifiers. These are the claims; if the run cannot support them it fails.
  const problems = [];
  if (Object.keys(receipt.lanes).length !== 8) problems.push(`expected 8 corridor stills, captured ${Object.keys(receipt.lanes).length}`);
  if (receipt.hud.modeLabel.text !== 'EXPLORE · MAP 3') problems.push(`mode label is ${JSON.stringify(receipt.hud.modeLabel.text)}`);
  if (receipt.hud.timer.shown) problems.push('an explore arena is showing a match clock');
  if (receipt.hud.scoreline.shown) problems.push('an explore arena is showing a scoreline');
  if (!/ESC/u.test(receipt.hud.objective.text ?? '')) problems.push('the objective line does not say how to leave');
  if (receipt.pageErrors.length > 0) problems.push(`${receipt.pageErrors.length} page errors`);
  if (problems.length > 0) {
    console.error(`[evidence] FAILED:\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('[evidence] OK: eight corridors, explore HUD with no clock and no scoreline.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
