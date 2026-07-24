import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4182/';
const output = 'artifacts/pass60-visual-acceptance';
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function capture(name, pose, stance = 'stand') {
  await page.evaluate(({ pose: [x, y, z, yaw, pitch], stance }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setStance(stance);
    api.teleportPlayer(x, y, z, yaw, pitch);
  }, { pose, stance });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
}

async function captureCamera(name, pose) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.clearBots();
    api.setCaptureViewmodelHidden(true);
    api.setCaptureCameraPose(x, y, z, yaw, pitch);
  }, pose);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
}

async function switchArena(id) {
  await page.evaluate(async (arenaId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.returnToMainMenu();
    await api.selectArena(arenaId);
    api.startSolo();
  }, id);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 });
  // Let the deployment banner clear before judging world readability.
  await page.waitForTimeout(2_300);
}

try {
  const url = new URL(baseUrl);
  url.searchParams.set('render', 'blender');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('visualQa', Date.now().toString());
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true && state.originalArtLoaded === true
      && document.querySelector('#solo')?.disabled === false;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 30_000 });

  await capture('01-aqua-ground-interior', [-9, 1.7, -24, 0, 0]);
  await capture('02-aqua-upper-opening', [-7, 5.18, -24.2, 0, 0]);
  await capture('03-pipe-stack-end', [16.5, 1.7, -17, -Math.PI / 2, 0]);
  await capture('04-pipe-stack-side', [21, 1.7, -12.5, 0, 0]);
  await capture('05-prone-near-wall', [12, 0.61, -32.55, 0, 0], 'prone');
  await capture('06-coral-upper-opening', [11, 5.18, 24.2, Math.PI, 0]);

  if (process.env.QA_ONLY_ATOMIC !== '1') {
    await switchArena('rustworks-1v1');
    await captureCamera('07-rustworks-centre', [24.5, 4.2, 0, Math.PI / 2, -0.24]);
    await captureCamera('08-rustworks-open-yard', [24, 1.7, 24, Math.PI / 4, 0]);
    await captureCamera('08b-rustworks-welsh-flag', [10, 18, 6, 1.03, 0.05]);

    await switchArena('gun-range');
    await captureCamera('09-gun-range-wallbang', [0, 1.7, 15, 0, 0]);

    await switchArena('skyline-terminal');
    await captureCamera('10-terminal-concourse', [28, 2.1, -31, Math.PI / 2, -0.03]);
    await captureCamera('11-terminal-apron', [28, 3.2, 29, 0.78, -0.1]);
    await captureCamera('12-terminal-upper-kiosks', [0, 5.04, -23, 0, -0.02]);
    await captureCamera('13-terminal-open-aircraft-walkway', [0, 4.25, -4, Math.PI, 0]);
  }

  const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  console.log(JSON.stringify({
    errors,
    asset: state.render.blenderEnvironment.asset,
    status: state.render.blenderEnvironment.status,
    viewmodelDepthSeparated: state.weaponPresentation.depthSeparatedFromWorld,
  }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
