/**
 * verify-map3-channel-page.mjs - is /map3.html actually LIVE in a staged channel?
 *
 * THE DEFECT. `map3.html` is a second Vite build input, so it is emitted at the
 * dist ROOT beside index.html, linking its chunks as `./assets/...`. But the
 * publish does not serve the dist root: `stage-release-topology.mjs` MOVES
 * index.html and assets/ into `channels/<pass>/` and replaces the root with the
 * release-shell chooser. map3.html was left behind at the root, where its
 * `./assets/...` links no longer resolve. The page answered 200 and then 404ed
 * every one of its chunks, sitting on "Starting Map 3..." forever - which reads
 * exactly like the showcase having been destroyed.
 *
 * WHY THIS RUNS THE REAL STAGING STEP. The bug is not in the page and not in
 * the build; it is in the topology the publish creates. Serving `dist/` proves
 * nothing, because `dist/` is not the shape anybody is served. So this builds,
 * runs the ACTUAL `stage-release-topology.mjs` against a temporary root exactly
 * as the publish does, serves that root, and loads the page at its real
 * published path.
 *
 * WHY A PLAIN STATIC SERVER AND NOT `vite preview`. `vite preview` answers an
 * unknown path with index.html and a 200. Under it, every missing chunk would
 * look like a success and "zero failed requests" would be worthless. Here a
 * missing file is a 404 and the run fails.
 *
 * Usage:
 *   node scripts/qa/verify-map3-channel-page.mjs [--port 4196] [--out docs/evidence/pass87/map3-explore]
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { build } from 'vite';
import { waitForSharedMachine } from './lib/shared-machine-guard.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const PORT = Number(opt('--port', process.env.QA_PREVIEW_PORT ?? '4196'));
const OUT = resolve(opt('--out', 'docs/evidence/pass87/map3-explore'));
const HOST = '127.0.0.1';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) throw new Error(`Invalid port: ${PORT}`);

const channelPath = JSON.parse(readFileSync('release-channels.json', 'utf8')).experimental.path;

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

const temporaryRoot = mkdtempSync(join(tmpdir(), 'aa-map3-channel-'));
const temporaryDist = join(temporaryRoot, 'dist');
const receipt = {
  verifiedAt: new Date().toISOString(), channelPath, temporaryRoot,
  url: null, staged: {}, requests: { total: 0, failed: [] }, page: {},
};

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log(`[channel] building into ${temporaryDist}`);
  await build({ build: { outDir: temporaryDist, emptyOutDir: true } });

  // map3.html must exist at the dist root BEFORE staging, or this run would
  // "pass" by never having had the page the staging step is supposed to move.
  if (!existsSync(join(temporaryDist, 'map3.html'))) {
    throw new Error('The build did not emit map3.html at the dist root; vite.config.ts input is wrong');
  }

  console.log('[channel] running the real stage-release-topology.mjs');
  execFileSync(process.execPath, ['scripts/release/stage-release-topology.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RELEASE_DIST_ROOT: temporaryDist,
      RELEASE_TOPOLOGY_RECEIPT_PATH: join(temporaryRoot, 'release-topology.json'),
    },
    stdio: 'inherit',
  });

  const channelRoot = join(temporaryDist, ...channelPath.split('/'));
  receipt.staged = {
    channelIndexHtml: existsSync(join(channelRoot, 'index.html')),
    channelMap3Html: existsSync(join(channelRoot, 'map3.html')),
    channelAssets: existsSync(join(channelRoot, 'assets')),
    // The root must now be the chooser, and must NOT still hold the showcase.
    rootMap3HtmlLeftBehind: existsSync(join(temporaryDist, 'map3.html')),
  };
  console.log('[channel] staged:', JSON.stringify(receipt.staged));

  // ---- THE FILE-LEVEL PROOF, WHICH NEEDS NO GPU --------------------------
  //
  // Every local asset map3.html names must resolve RELATIVE TO ITS OWN
  // LOCATION in the channel. This is the whole bug expressed as a file test,
  // and it stands on its own on a machine whose GPU is busy - the browser run
  // below confirms it at runtime, it does not establish it.
  //
  // The counterfactual is the point: the same references are also resolved
  // against the dist ROOT, which is where the page used to be left. If the
  // "missing from the root" count is not the full set, the page did not
  // actually depend on being moved and this fix would be theatre.
  const pageHtml = readFileSync(join(channelRoot, 'map3.html'), 'utf8');
  const references = [...pageHtml.matchAll(/(?:src|href)="([^"]+)"/gu)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:https?:|data:|#)/u.test(reference));
  const missingInChannel = references.filter((reference) => !existsSync(resolve(channelRoot, reference)));
  const missingFromDistRoot = references.filter((reference) => !existsSync(resolve(temporaryDist, reference)));
  receipt.assets = {
    localReferences: references.length,
    missingInChannel,
    missingIfLeftAtDistRoot: missingFromDistRoot.length,
  };
  console.log(`[channel] assets: ${references.length} local refs, ${missingInChannel.length} missing in channel, `
    + `${missingFromDistRoot.length} would be missing at the dist root`);
  writeFileSync(join(OUT, 'map3-channel-page.json'), `${JSON.stringify(receipt, null, 2)}
`);

  const machine = await waitForSharedMachine({ label: 'channel' });
  receipt.machine = machine;
  const server = await startStaticServer(temporaryDist);
  const url = `http://${HOST}:${PORT}/${channelPath}/map3.html`;
  receipt.url = url;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await (await page.context().newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('request', () => { receipt.requests.total += 1; });
    page.on('requestfailed', (request) => receipt.requests.failed.push({
      url: request.url(), failure: request.failure()?.errorText ?? null,
    }));
    page.on('response', (response) => {
      if (response.status() >= 400) receipt.requests.failed.push({ url: response.url(), status: response.status() });
    });

    console.log(`[channel] opening ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // The real proof the page LEFT its loading banner: the showcase publishes
    // window.__MAP3 only once its scene is up. A 200 with dead chunks never
    // gets here, which is exactly the bug being closed.
    await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 120_000 });
    await page.waitForTimeout(6000);

    receipt.page = await page.evaluate(() => {
      const banner = document.getElementById('boot') ?? document.getElementById('status');
      const canvas = document.querySelector('canvas');
      return {
        title: document.title,
        hasMap3Global: typeof window.__MAP3 !== 'undefined',
        canvasPresent: Boolean(canvas),
        canvasSize: canvas ? { width: canvas.width, height: canvas.height } : null,
        bannerText: banner ? (banner.textContent ?? '').trim().slice(0, 200) : null,
        hud: (document.getElementById('hud')?.textContent ?? '').trim().slice(0, 200),
      };
    });
    receipt.pageErrors = pageErrors;
    await page.screenshot({ path: join(OUT, 'map3-channel-page.png') });
    console.log('[channel] page:', JSON.stringify(receipt.page, null, 2));
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
  }

  writeFileSync(join(OUT, 'map3-channel-page.json'), `${JSON.stringify(receipt, null, 2)}\n`);

  const problems = [];
  if (!receipt.staged.channelMap3Html) problems.push('map3.html was not staged into the channel');
  if (!receipt.staged.channelIndexHtml) problems.push('index.html is not in the channel');
  if (!receipt.staged.channelAssets) problems.push('assets/ is not in the channel');
  if (receipt.staged.rootMap3HtmlLeftBehind) problems.push('map3.html is STILL at the dist root, where its ./assets links 404');
  if (receipt.assets.localReferences < 5) problems.push(`only ${receipt.assets.localReferences} local asset references parsed; the check is not looking at the real page`);
  if (receipt.assets.missingInChannel.length > 0) {
    problems.push(`assets missing in the channel: ${JSON.stringify(receipt.assets.missingInChannel)}`);
  }
  if (receipt.assets.missingIfLeftAtDistRoot !== receipt.assets.localReferences) {
    problems.push('the page would still resolve from the dist root, so this move is not what fixes it');
  }
  if (receipt.requests.failed.length > 0) {
    problems.push(`${receipt.requests.failed.length} failed requests: ${JSON.stringify(receipt.requests.failed.slice(0, 10))}`);
  }
  if (!receipt.page.hasMap3Global) problems.push('the showcase never published window.__MAP3');
  if (!receipt.page.canvasPresent) problems.push('no canvas on the page');
  if ((receipt.pageErrors ?? []).length > 0) problems.push(`page errors: ${JSON.stringify(receipt.pageErrors.slice(0, 5))}`);

  if (problems.length > 0) {
    console.error(`[channel] FAILED:\n  - ${problems.join('\n  - ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[channel] OK: ${url} live, ${receipt.requests.total} requests, 0 failed.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => rmSync(temporaryRoot, { recursive: true, force: true }));
