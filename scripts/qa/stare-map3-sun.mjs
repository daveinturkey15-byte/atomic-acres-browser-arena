/**
 * stare-map3-sun.mjs — point the in-game camera AT the live sun/planet and prove the disc.
 * Reads body world positions from the admitted scene graph, aims, screenshots.
 * Usage: node scripts/qa/stare-map3-sun.mjs --dist dist-fix-map3sky --port 4233 --out artifacts/map3sky-stare
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
const PORT = Number(opt('--port', '4233'));
const OUT = resolve(opt('--out', 'artifacts/map3sky-stare'));
const HOST = '127.0.0.1';
if (PORT < 4230 || PORT > 4260) throw new Error(`Port ${PORT} outside lane range`);

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

async function main() {
  mkdirSync(OUT, { recursive: true });
  const machine = await waitForSharedMachine({ label: 'map3sky-stare' });
  const server = await startStaticServer(DIST);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
  });
  const receipt = { shots: [], pageErrors: [], consoleErrors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    page.on('pageerror', (e) => receipt.pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') receipt.consoleErrors.push(m.text().slice(0, 200)); });
    await page.goto(`http://${HOST}:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
    let selected = false;
    for (let a = 0; a < 60 && !selected; a += 1) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('map3')).catch(() => {});
      selected = await page.evaluate(
        () => (document.querySelector('#arena-title')?.textContent ?? '').trim().toUpperCase() === 'MAP 3');
      if (!selected) await page.waitForTimeout(1000);
    }
    if (!selected) throw new Error('selectArena did not take');
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    const boot = await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
      return (s?.matchPhase === 'active' && s?.gameStarted === true) ? 'active' : null;
    }, undefined, { timeout: 180_000 });
    if ((await boot.jsonValue()) !== 'active') throw new Error('no boot');
    await page.waitForTimeout(5000);

    // Camera proof: the live main camera far plane (450 expected on map3).
    receipt.camera = await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      let cam = null;
      scene.traverse((o) => { if (o.isPerspectiveCamera && !cam) cam = { far: o.far, near: o.near, fov: o.fov }; });
      const sky = scene.getObjectByName('map3-arena-sky');
      return { cam, skyPresent: Boolean(sky), skyChildren: sky ? sky.children.length : 0 };
    });
    console.log('[stare] camera:', JSON.stringify(receipt.camera));

    const EYE = { x: 0, y: 2.6, z: 6 };
    for (let f = 0; f < 6; f += 1) {
      const bodies = await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        const g = scene.getObjectByName('map3-arena-sky');
        if (!g) return null;
        const pts = [];
        g.traverse((o) => { if (o.isMesh) { const p = new (o.position.constructor)(); o.getWorldPosition(p); pts.push([+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]); } });
        return { sun: pts[1], planet: pts[2] };
      });
      // THREE is not global in the page; recompute aim in node instead.
      const aim = (b) => {
        const dx = b[0] - EYE.x, dy = b[1] - EYE.y, dz = b[2] - EYE.z;
        const n = Math.hypot(dx, dy, dz);
        return { yaw: Math.atan2(-dx / n, -dz / n), pitch: Math.asin(dy / n) };
      };
      const target = f % 2 === 0 ? bodies.sun : bodies.planet;
      const { yaw, pitch } = aim(target);
      await page.evaluate(({ yaw: y, pitch: p }) => {
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 2.6, 6, y, p);
      }, { yaw, pitch });
      await page.waitForTimeout(2000);
      const name = `stare-${f % 2 === 0 ? 'sun' : 'planet'}-${f}.png`;
      await page.screenshot({ path: join(OUT, name) });
      receipt.shots.push({ file: name, body: f % 2 === 0 ? 'sun' : 'planet', pos: target, yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3) });
      console.log('[stare]', name, JSON.stringify(target));
      await page.waitForTimeout(4000);
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }
  writeFileSync(join(OUT, 'stare.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`[stare] errors: page=${receipt.pageErrors.length} console=${receipt.consoleErrors.length}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
