/**
 * capture-map3-sky-sun.mjs — FIX lane MAP3-SKY evidence run (in-game Map 3 only).
 *
 * Modes:
 *   --mode baseline    floor luma baseline + sky-absence frame + colosseum overlook + errors + fps
 *   --mode candidate   everything above + fixed-camera full-orbit sun sequence with blob tracking
 *
 * The sun orbits on a 40 s period, so a 9-frame x 5 s sequence covers a full
 * revolution from any entry phase. No gameplay code is touched: posing uses
 * __ATOMIC_ACRES_DEBUG__.teleportPlayer, graph reads use sampleSceneGraph.
 *
 * Usage:
 *   node scripts/qa/capture-map3-sky-sun.mjs --dist dist-map3sky-baseline --port 4231 --out artifacts/map3sky-baseline --mode baseline
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
const DIST = resolve(opt('--dist', 'dist'));
const PORT = Number(opt('--port', '4231'));
const OUT = resolve(opt('--out', 'artifacts/map3sky'));
const MODE = opt('--mode', 'baseline');
const HOST = '127.0.0.1';

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No index.html under ${DIST}; build first`);
if (PORT < 4230 || PORT > 4260) throw new Error(`Port ${PORT} outside lane range 4230-4260 (4200 is the owner's build)`);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
};

function startStaticServer(root) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
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
  return new Promise((done) => server.listen(PORT, HOST, () => done(server)));
}

/** Luma stats + bright-blob census over downscaled pixels, computed in-page. */
const ANALYZE = `({ dataUrl, floor, sky }) => {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const W = 320, H = 180;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data;
      const luma = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const stats = (x0, y0, x1, y1) => {
        const vals = [];
        let crushed = 0, clipped = 0, n = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const v = luma((y * W + x) * 4);
          vals.push(v); n += 1;
          if (v <= 6) crushed += 1;
          if (v >= 250) clipped += 1;
        }
        vals.sort((a, b) => a - b);
        const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
        const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        return { n, mean: +mean.toFixed(2), p10: +q(0.1).toFixed(2), p50: +q(0.5).toFixed(2), p90: +q(0.9).toFixed(2), crushedPc: +(100 * crushed / Math.max(1, n)).toFixed(2), clippedPc: +(100 * clipped / Math.max(1, n)).toFixed(2) };
      };
      // Bright warm blob census in the sky band: the sun disc is the only
      // white-hot extended body up there (equirect backdrops have no hot disc).
      let blobN = 0, sx = 0, sy = 0, peak = 0, px = -1, py = -1;
      for (let y = sky[1]; y < sky[3]; y += 1) for (let x = sky[0]; x < sky[2]; x += 1) {
        const i = (y * W + x) * 4;
        const v = luma(i);
        if (v > 215 && d[i] > 180 && d[i + 1] > 140) { blobN += 1; sx += x; sy += y; }
        if (v > peak) { peak = v; px = x; py = y; }
      }
      res({
        full: stats(0, 0, W, H),
        floorBand: stats(floor[0], floor[1], floor[2], floor[3]),
        blob: blobN > 0 ? { n: blobN, cx: +(sx / blobN).toFixed(1), cy: +(sy / blobN).toFixed(1) } : null,
        peak: { v: +peak.toFixed(1), x: px, y: py },
      });
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const machine = await waitForSharedMachine({ label: 'map3sky' });
  console.log(`[map3sky] ${machine.freeVramMib} MiB free, ComfyUI idle; serving ${DIST} on ${PORT}`);
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
  const receipt = {
    mode: MODE, dist: DIST, port: PORT, capturedAt: new Date().toISOString(),
    machine, arenaTitle: null, boot: null, fps: null, pageErrors: [], consoleErrors: [],
    failedRequests: [], skyGraph: null, floor: null, skyAbsence: null, overlook: null, sunSequence: [],
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    page.on('pageerror', (e) => { receipt.pageErrors.push(String(e)); });
    page.on('console', (m) => { if (m.type() === 'error') receipt.consoleErrors.push(m.text().slice(0, 300)); });
    page.on('requestfailed', (r) => receipt.failedRequests.push({ url: r.url(), failure: r.failure()?.errorText ?? null }));
    page.on('response', (r) => { if (r.status() >= 400) receipt.failedRequests.push({ url: r.url(), status: r.status() }); });

    await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });

    let selected = false;
    for (let a = 0; a < 60 && !selected; a += 1) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('map3')).catch(() => {});
      selected = await page.evaluate(
        () => (document.querySelector('#arena-title')?.textContent ?? '').trim().toUpperCase() === 'MAP 3',
      );
      if (!selected) await page.waitForTimeout(1000);
    }
    receipt.arenaTitle = await page.evaluate(() => (document.querySelector('#arena-title')?.textContent ?? '').trim());
    if (!selected) throw new Error(`selectArena did not take: ${JSON.stringify(receipt.arenaTitle)}`);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    const bootHandle = await page.waitForFunction(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const s = api?.snapshot?.();
      if (s?.matchPhase === 'active' && s?.gameStarted === true) return 'active';
      const status = document.querySelector('#status')?.textContent ?? '';
      if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
      return null;
    }, undefined, { timeout: 180_000 });
    receipt.boot = await bootHandle.jsonValue();
    if (receipt.boot !== 'active') throw new Error(`Map 3 did not boot: ${receipt.boot}`);
    await page.waitForTimeout(6000);

    // Graph proof: is the sky group in the LIVE admitted scene?
    receipt.skyGraph = await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      const found = [];
      scene.traverse((o) => { if (/sky/i.test(o.name)) found.push({ name: o.name, type: o.type, children: o.children.length, visible: o.visible }); });
      return { skyNodes: found.slice(0, 12), background: scene.background ? (scene.background.isColor ? `#${scene.background.getHexString()}` : scene.background.type) : null };
    });
    console.log('[map3sky] graph:', JSON.stringify(receipt.skyGraph));

    // rAF fps over 3 s from the hub pose.
    await page.evaluate(({ x, z, yaw, pitch }) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 2.6, z, yaw, pitch);
    }, { x: 0, z: 6, yaw: 0, pitch: -0.03 });
    await page.waitForTimeout(3000);
    receipt.fps = await page.evaluate(() => new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => { n += 1; if (performance.now() - t0 < 3000) requestAnimationFrame(tick); else res(+(n / 3).toFixed(1)); };
      requestAnimationFrame(tick);
    }));
    const shot = async (name) => {
      const path = join(OUT, name);
      await page.screenshot({ path });
      const buf = await page.screenshot();
      const stats = await page.evaluate(
        new Function('payload', `return (${ANALYZE})(payload)`),
        {
          dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
          floor: [0, 115, 320, 180], sky: [0, 0, 320, 120],
        },
      );
      return { file: name, stats };
    };
    // 1. Floor baseline pose (hub vista review camera).
    receipt.floor = await shot('map3sky-floor.png');
    console.log('[map3sky] floor:', JSON.stringify(receipt.floor.stats));

    // 2. Skyward pose: baseline absence / candidate presence.
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 2.6, 6, 0, 0.5); });
    await page.waitForTimeout(2500);
    receipt.skyAbsence = await shot('map3sky-skyward.png');
    console.log('[map3sky] skyward:', JSON.stringify(receipt.skyAbsence.stats));

    // 3. Colosseum overlook (A4): edge 0, lateral 26, 6 m into the lane.
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(26, 1.7, -40, 0, 0.02); });
    await page.waitForTimeout(3500);
    receipt.overlook = await shot('map3sky-overlook.png');
    console.log('[map3sky] overlook:', JSON.stringify(receipt.overlook.stats));

    // 4. Candidate only: fixed-camera full-orbit sequence from the skyward pose.
    if (MODE === 'candidate') {
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 2.6, 6, 0, 0.5); });
      await page.waitForTimeout(2500);
      for (let f = 0; f < 9; f += 1) {
        const name = `map3sky-sun-${String(f).padStart(2, '0')}.png`;
        const s = await shot(name);
        const sunWorld = await page.evaluate(() => {
          const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
          const g = scene.getObjectByName('map3-arena-sky');
          if (!g) return null;
          const out = [];
          g.updateWorldMatrix(true, true);
          g.traverse((o) => { if (o.isMesh) { const p = new (o.position.constructor)(); o.getWorldPosition(p); out.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }); } });
          return out.slice(0, 6);
        });
        receipt.sunSequence.push({ t: f * 5, ...s, sunWorld });
        console.log(`[map3sky] sun frame ${f}:`, JSON.stringify(s.stats.blob), JSON.stringify(sunWorld?.[0] ?? null));
        if (f < 8) await page.waitForTimeout(5000);
      }
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
  writeFileSync(join(OUT, `map3sky-${MODE}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[map3sky] wrote ${join(OUT, `map3sky-${MODE}.json`)}; pageErrors=${receipt.pageErrors.length} consoleErrors=${receipt.consoleErrors.length} failed=${receipt.failedRequests.length}`);
  if (receipt.pageErrors.length > 0) { console.error('[map3sky] PAGE ERRORS:', receipt.pageErrors.slice(0, 5)); process.exitCode = 1; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
