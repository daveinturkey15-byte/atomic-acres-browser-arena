/**
 * PASS 87 Map 3 EXPLORE evidence capture: asserts the explore HUD shows no clock/scoreline, captures eight corridor stills, and verifies the menu showcase link, all in one headless browser session.
 * Usage: node scripts/qa/capture-map3-explore-evidence.mjs
 * --dist <dir>           static server root (default: dist)
 * --port <n>             server port (default: 4195, or $QA_PREVIEW_PORT)
 * --out <dir>            output directory (default: docs/evidence/pass87/map3-explore)
 * $QA_PREVIEW_PORT       env fallback for --port (default: 4195)
 * Writes: $OUT/ — map3-menu-showcase-link.png, map3-explore-hud.png, map3-corridor-{id}.png (×8), map3-explore-evidence.json
 * Exit codes: 0 = pass; 1 = falsifier failure, boot/selection failure, or uncaught error
 */
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
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { waitForSharedMachine } from './lib/shared-machine-guard.mjs';

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

/**
 * `depth` is METRES INTO THE CORRIDOR from its mouth, and the mouth is at lane
 * z = 0. Corridor content runs from there to NEGATIVE lane z - measured from
 * the built scene, per lane:
 *
 *   shoreline  z 1.7 .. -58.4     colosseum  z 2.0 .. -302 (bowl beyond bounds)
 *   raymarch   z 0   .. -48       grammar    z 0   .. -52
 *   vegetation z 4.7 .. -55.8     physics    z 1.0 .. -50
 *   godrays    z 0.6 .. -44.4     seasons    z 0.5 .. -56
 *
 * The first run of this harness had `depth` POSITIVE along lane z and derived
 * its yaw from increasing z, so every camera stood at the hub edge looking
 * back OUT of its corridor. The stills were of the plaza and the skybox, with
 * the corridor behind the camera - they looked plausible, and framed nothing.
 * Depths are chosen just inside the mouth, where the corridor reads as a
 * corridor rather than as a wall.
 */
const LANES = [
  { id: 'shoreline', label: 'Shoreline', edge: 0, lateral: -26, depth: 8, pitch: -0.04 },
  { id: 'colosseum', label: 'Colosseum', edge: 0, lateral: 26, depth: 6, pitch: 0.02 },
  { id: 'raymarch', label: 'Raymarched SDF', edge: 1, lateral: -13, depth: 8, pitch: -0.02 },
  { id: 'grammar', label: 'Shape grammar', edge: 1, lateral: 13, depth: 10, pitch: 0.04 },
  { id: 'vegetation', label: 'Vegetation', edge: 2, lateral: 0, depth: 14, pitch: -0.04 },
  // THE EIGHTH. Never photographed before this pass.
  { id: 'physics', label: 'Rapier playground', edge: 2, lateral: 24, depth: 12, pitch: -0.08 },
  { id: 'godrays', label: 'God rays', edge: 3, lateral: -13, depth: 12, pitch: 0.04 },
  { id: 'seasons', label: 'Seasons', edge: 3, lateral: 14, depth: 14, pitch: -0.02 },
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
  // DEEPER is decreasing lane z (see the LANES note), so the direction is taken
  // from the mouth toward z = -1, not z = +1. With +1 every camera faced the
  // hub and photographed the plaza.
  const a = laneToWorld(lane, 0, 0);
  const b = laneToWorld(lane, 0, -1);
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
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
  const machine = await waitForSharedMachine({ label: 'evidence' });
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
    // NOTE THE THIRD ARGUMENT. playwright's signature is
    // waitForFunction(fn, arg, options) - passing {timeout} as the SECOND
    // argument makes it the page function's ARG and silently leaves the
    // default 30 s timeout in force. That is what capped this run's 180 s boot
    // wait at 30 s on its first attempt.
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });

    // SELECT, THEN VERIFY IT TOOK.
    //
    // __ATOMIC_ACRES_DEBUG__.selectArena() routes to performArenaSelection,
    // which begins `if (... || !arenaSelectionReady || ...) return;` - and
    // `arenaSelectionReady` is only set true by bootstrapMenuPreview(). So
    // between the debug API appearing and the menu becoming ready there is a
    // window in which selectArena RESOLVES SUCCESSFULLY AND DOES NOTHING.
    // Waiting for the debug object is not waiting for a selectable menu.
    //
    // Measured here: the first run of this harness probed the menu and found
    // the showcase link still hidden with a null href, because the arena had
    // never actually changed - it would have captured eight stills of NUKE
    // TOWN and filed them as Map 3 corridors.
    //
    // The check is the ARENA TITLE, which syncArenaSelectionUi writes from the
    // registry row, because `snapshot()` exposes no top-level arena id. The
    // retry lives in node rather than in a waitForFunction predicate: an ASYNC
    // predicate returns a Promise, which playwright takes as truthy, so an
    // `async () => { ... }` poll passes instantly and proves nothing. That is
    // the second way this same check has been wrong.
    let arenaSelected = false;
    for (let attempt = 0; attempt < 60 && !arenaSelected; attempt += 1) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('map3')).catch(() => {});
      arenaSelected = await page.evaluate(
        () => (document.querySelector('#arena-title')?.textContent ?? '').trim().toUpperCase() === 'MAP 3',
      );
      if (!arenaSelected) await page.waitForTimeout(1000);
    }
    const arenaTitle = await page.evaluate(() => (document.querySelector('#arena-title')?.textContent ?? '').trim());
    if (!arenaSelected) throw new Error(`selectArena did not take: #arena-title is ${JSON.stringify(arenaTitle)}`);
    receipt.arenaTitle = arenaTitle;
    receipt.map3Prepared = true;

    // ---- 0. THE MENU'S LINK TO THE SHOWCASE PAGE ---------------------------
    // Read while the menu is still up and map3 is selected. `href` is the raw
    // attribute (what was authored) and `resolved` is what the browser makes of
    // it against THIS document - which is the whole claim: relative, so it
    // lands inside whatever channel the game was loaded from.
    receipt.showcaseLink = await page.evaluate(() => {
      const link = document.getElementById('arena-showcase-link');
      if (!link) return { present: false };
      return {
        present: true,
        hidden: link.hidden,
        href: link.getAttribute('href'),
        resolved: link.href,
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
        text: (link.textContent ?? '').trim(),
        documentUrl: document.URL,
      };
    });
    console.log('[evidence] showcase link:', JSON.stringify(receipt.showcaseLink));
    await page.screenshot({ path: join(OUT, 'map3-menu-showcase-link.png') });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    // Same shape as tests/e2e/pass74-arena-boot-smoke.spec.ts, and for the same
    // reason: waiting only on the phase turns the game's own named deployment
    // failure ("deployment preparation failed", "renderer blocked") into a bare
    // 180 s timeout that says nothing. On a machine where a browser window is
    // scarce, a run that fails must say WHY the first time.
    const bootHandle = await page.waitForFunction(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot?.();
      if (state?.matchPhase === 'active' && state?.gameStarted === true) return 'active';
      const status = document.querySelector('#status')?.textContent ?? '';
      if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
      return null;
    }, undefined, { timeout: 180_000 });
    const boot = await bootHandle.jsonValue();
    receipt.boot = boot;
    if (boot !== 'active') throw new Error(`Map 3 did not boot: ${boot}`);
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
      // Negative: `depth` is metres INTO the corridor, and the corridor runs
      // toward negative lane z.
      const world = laneToWorld(lane, 0, -lane.depth);
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
  const link = receipt.showcaseLink ?? {};
  if (!link.present) problems.push('the menu has no showcase link element at all');
  if (link.hidden) problems.push('the showcase link is hidden on an arena that declares a showcase page');
  if (link.href !== 'map3.html') problems.push(`the showcase href is ${JSON.stringify(link.href)}, not the relative 'map3.html'`);
  // A rooted href is the exact bug: it would 404 on every published channel.
  if (String(link.href ?? '').startsWith('/')) problems.push('the showcase href is rooted and will 404 on every channel');
  // Resolved against the game document, it must be a sibling of it.
  if (link.resolved !== new URL('map3.html', link.documentUrl).href) {
    problems.push(`the showcase link resolves to ${link.resolved}, not beside ${link.documentUrl}`);
  }
  if (problems.length > 0) {
    console.error(`[evidence] FAILED:\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('[evidence] OK: eight corridors, explore HUD with no clock and no scoreline.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
