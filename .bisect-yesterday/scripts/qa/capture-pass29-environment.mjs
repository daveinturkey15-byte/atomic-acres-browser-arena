import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const profile = process.env.RENDER_PROFILE ?? 'blender';
const forceEffects = process.env.FORCE_EFFECTS === '1';
const forceSignal = process.env.FORCE_SIGNAL === '1';
const startMatch = process.env.START_MATCH !== '0';
const grassTime = Number(process.env.GRASS_TIME ?? '2.5');
const captureWidth = Number(process.env.CAPTURE_WIDTH ?? '1280');
const captureHeight = Number(process.env.CAPTURE_HEIGHT ?? '720');
const requestedViews = new Set((process.env.CAPTURE_VIEWS ?? '').split(',').map((value) => value.trim()).filter(Boolean));
if (!['performance', 'blender', 'compat'].includes(profile)) throw new Error(`Unsupported RENDER_PROFILE: ${profile}`);
if (!Number.isInteger(captureWidth) || !Number.isInteger(captureHeight) || captureWidth < 480 || captureHeight < 270) {
  throw new Error(`Unsupported capture viewport: ${captureWidth}x${captureHeight}`);
}
const output = process.env.OUTPUT_DIR ?? `artifacts/pass29/${profile}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: captureWidth, height: captureHeight }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.setDefaultTimeout(90_000);
  const url = new URL(baseUrl);
  url.searchParams.set('render', profile);
  if (forceSignal) url.searchParams.set('signal', 'on');
  if (forceEffects && profile !== 'compat') {
    url.searchParams.set('grass', 'on');
    url.searchParams.set('rays', 'on');
  }
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot();
    return snapshot?.weaponReady === true && snapshot?.originalArtLoaded === true;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(({ grassTimeValue, shouldStartMatch }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (shouldStartMatch) {
      debug.startSolo();
      debug.setBotsFrozen(true);
    } else {
      document.querySelector('#menu')?.classList.add('hidden');
    }
    debug.setGrassTime(Number.isFinite(grassTimeValue) ? grassTimeValue : 2.5);
  }, { grassTimeValue: grassTime, shouldStartMatch: startMatch });
  if (startMatch) {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 120_000 });
  }
  const views = [
    { name: 'central-transit-west', position: [0, 1.7, 0], yaw: -Math.PI / 2, pitch: 0 },
    { name: 'dawn-sun-facing', position: [0, 1.7, -16], yaw: 2.12, pitch: -0.18 },
    { name: 'aqua-ground-front', position: [-9, 1.7, -24], yaw: Math.PI, pitch: 0 },
    { name: 'aqua-ground-fixture', position: [-12, 1.7, -24], yaw: -Math.PI / 2, pitch: 0.46 },
    { name: 'aqua-upper-rear', position: [-5, 5.18, -31.5], yaw: 0, pitch: -0.03 },
    { name: 'coral-ground-rear', position: [9, 1.7, 24], yaw: 0, pitch: 0 },
    { name: 'west-living-grass', position: [-20, 1.7, 1], yaw: Math.PI, pitch: -0.16 },
  ].filter((view) => requestedViews.size === 0 || requestedViews.has(view.name));
  if (views.length === 0) throw new Error('CAPTURE_VIEWS did not match an authored Pass 29 camera');
  const evidence = [];
  for (const view of views) {
    await page.evaluate(({ position, yaw, pitch, shouldStartMatch }) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (shouldStartMatch) debug.teleportPlayer(position[0], position[1], position[2], yaw, pitch);
      else debug.setCaptureCameraPose(position[0], position[1], position[2], yaw, pitch);
    }, { ...view, shouldStartMatch: startMatch });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${output}/${view.name}.png`, timeout: 90_000 });
    evidence.push({ name: view.name, snapshot: await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render) });
  }
  await writeFile(`${output}/telemetry.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  if (errors.length > 0) throw new Error(`Pass 29 capture logged browser errors: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ output, profile, forceEffects, forceSignal, startMatch, grassTime, views: views.map((view) => view.name), errors }));
} finally {
  await browser.close();
}
