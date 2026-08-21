import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

const port = Number(process.env.PASS73_LIVE_GRAPHICS_PORT ?? 44273);
const artifactRoot = 'artifacts/pass73/live-graphics';
const executablePath = [
  process.env.PASS73_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 73 live graphics gate requires installed Google Chrome');
await rm(artifactRoot, { recursive: true, force: true });
await mkdir(artifactRoot, { recursive: true });

const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
let browser;
const browserErrors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
  await page.goto(`http://127.0.0.1:${port}/?renderer=webgpu&requireWebGPU=1&map=atomic-acres&seed=7301`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgpu';
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active' && state?.frameCount > 5
      && state?.menuVisible === false
      && document.querySelector('#banner')?.hidden === true
      && document.querySelector('#countdown')?.hidden === true;
  }, undefined, { timeout: 90_000 });
  const pose = await page.evaluate(() => {
    const player = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { position: player.position, yaw: player.yaw, pitch: player.pitch };
  });
  await page.evaluate((fixedPose) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(
      fixedPose.position[0], fixedPose.position[1], fixedPose.position[2], fixedPose.yaw, fixedPose.pitch,
    );
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, pose);
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const beforeCanvas = await page.locator('#game').screenshot({ animations: 'disabled' });
  await page.screenshot({ path: `${artifactRoot}/quality-before.png`, animations: 'disabled' });

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
  await page.locator('#menu-tab-options').click();
  await page.locator('#graphics-profile').selectOption('performance');
  await page.locator('#graphics-save').click();
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const effectiveLabel = document.querySelector('#graphics-effective')?.textContent ?? '';
    return state?.render?.liveProfile === 'performance'
      && state?.settings?.displayedGraphicsPreset === 'performance'
      && state?.render?.drawingBuffer?.[0] <= 1920
      && state?.render?.drawingBuffer?.[1] <= 1080
      && effectiveLabel.includes('APPLIED LIVE: PERFORMANCE')
      && effectiveLabel.includes('FULL PRESET NEXT ARENA:');
  }, undefined, { timeout: 15_000 });
  // Options intentionally hides the Deploy-panel resume control. The real
  // Escape transaction flushes the same pending settings and resumes the
  // active match without exposing a test-only close hook.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true && state?.matchPhase === 'active'
      && state?.menuVisible === false && document.querySelector('#menu')?.classList.contains('hidden');
  }, undefined, { timeout: 15_000 });
  await page.evaluate((fixedPose) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(
      fixedPose.position[0], fixedPose.position[1], fixedPose.position[2], fixedPose.yaw, fixedPose.pitch,
    );
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, pose);
  const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  const afterCanvas = await page.locator('#game').screenshot({ animations: 'disabled' });
  await page.screenshot({ path: `${artifactRoot}/performance-after.png`, animations: 'disabled' });

  const beforePixels = await sharp(beforeCanvas).removeAlpha().raw().toBuffer();
  const afterPixels = await sharp(afterCanvas).removeAlpha().raw().toBuffer();
  assert.equal(afterPixels.length, beforePixels.length, 'paired gameplay canvas dimensions changed');
  let changedPixels = 0;
  let absoluteDifference = 0;
  for (let offset = 0; offset < beforePixels.length; offset += 3) {
    const difference = Math.abs(beforePixels[offset] - afterPixels[offset])
      + Math.abs(beforePixels[offset + 1] - afterPixels[offset + 1])
      + Math.abs(beforePixels[offset + 2] - afterPixels[offset + 2]);
    absoluteDifference += difference;
    if (difference >= 12) changedPixels += 1;
  }
  const totalPixels = beforePixels.length / 3;
  const pixelDifference = {
    changedPixels,
    changedRatio: changedPixels / totalPixels,
    meanAbsoluteChannelDifference: absoluteDifference / beforePixels.length,
  };

  assert.equal(before.render.runtime.actualBackend, 'webgpu');
  assert.equal(after.render.runtime.actualBackend, 'webgpu');
  assert.equal(after.render.liveProfile, 'performance');
  assert.equal(after.settings.liveApplication.profile, 'performance');
  assert.equal(after.settings.requested.graphics.preset, 'performance');
  assert.equal(after.gameStarted, true);
  assert.equal(after.matchPhase, 'active');
  assert.equal(after.player.id, before.player.id);
  assert.deepEqual(after.player.position.map((value) => Number(value.toFixed(4))), before.player.position.map((value) => Number(value.toFixed(4))));
  assert.equal(Number(after.player.yaw.toFixed(6)), Number(before.player.yaw.toFixed(6)));
  assert.equal(Number(after.player.pitch.toFixed(6)), Number(before.player.pitch.toFixed(6)));
  assert.equal(after.killstreak.matchEpoch, before.killstreak.matchEpoch);
  assert.ok(after.frameCount >= before.frameCount, 'graphics apply must not reset the active match frame');
  assert.ok(after.render.pixelRatio <= 0.75, `expected <=0.75 DPR, got ${after.render.pixelRatio}`);
  assert.ok(after.render.drawingBuffer[0] <= Math.floor(before.render.drawingBuffer[0] * 0.76));
  assert.ok(after.render.drawingBuffer[1] <= Math.floor(before.render.drawingBuffer[1] * 0.76));
  assert.equal(after.render.authoredShadows, false);
  assert.equal(after.render.shadows, false);
  assert.ok(after.render.graphicsRefinement.budget.environmentIntensity < before.render.graphicsRefinement.budget.environmentIntensity);
  assert.ok(after.render.atomicSignal.advancedGraphics.volumetricScale < before.render.atomicSignal.advancedGraphics.volumetricScale);
  assert.ok(after.render.atomicSignal.advancedGraphics.bloomStrength < before.render.atomicSignal.advancedGraphics.bloomStrength);
  assert.ok(after.render.atomicSignal.advancedGraphics.filmGrainScale < before.render.atomicSignal.advancedGraphics.filmGrainScale);
  assert.ok(after.render.graphicsApplication.appliedAt > 0);
  assert.equal(after.render.graphicsApplication.requestedProfile, 'performance');
  assert.equal(after.render.graphicsApplication.constructionProfile, 'blender');
  assert.equal(after.render.graphicsApplication.state, 'live-safe-applied-topology-pending');
  assert.equal(after.render.graphicsApplication.fullPresetEffective, false);
  assert.deepEqual(
    [...after.render.graphicsApplication.stagedReconstruction].sort(),
    ['antiAliasing', 'geometryDetail'].sort(),
  );
  assert.equal(after.render.graphicsApplication.pendingRendererReload, true);
  assert.equal(before.menuVisible, false);
  assert.equal(after.menuVisible, false);
  assert.ok(pixelDifference.changedRatio > 0.01, `live render consumers did not change enough pixels: ${JSON.stringify(pixelDifference)}`);
  assert.ok(pixelDifference.meanAbsoluteChannelDifference > 0.5, `live render delta is too small: ${JSON.stringify(pixelDifference)}`);
  const fatalErrors = [...new Set(browserErrors)].filter((message) => !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/iu.test(message));
  assert.deepEqual(fatalErrors, []);
  const receipt = {
    schema: 'atomic-acres/pass73-live-graphics@1',
    verdict: 'pass',
    route: page.url(),
    browser: browser.version(),
    before: {
      profile: before.render.liveProfile,
      pixelRatio: before.render.pixelRatio,
      drawingBuffer: before.render.drawingBuffer,
      shadows: before.render.shadows,
      effects: before.render.atomicSignal.advancedGraphics,
      matchEpoch: before.killstreak.matchEpoch,
      frameCount: before.frameCount,
    },
    after: {
      profile: after.render.liveProfile,
      pixelRatio: after.render.pixelRatio,
      drawingBuffer: after.render.drawingBuffer,
      shadows: after.render.shadows,
      effects: after.render.atomicSignal.advancedGraphics,
      applicationState: after.render.graphicsApplication.state,
      fullPresetEffective: after.render.graphicsApplication.fullPresetEffective,
      stagedReconstruction: after.render.graphicsApplication.stagedReconstruction,
      pendingRendererReload: after.render.graphicsApplication.pendingRendererReload,
      matchEpoch: after.killstreak.matchEpoch,
      frameCount: after.frameCount,
    },
    screenshots: [`${artifactRoot}/quality-before.png`, `${artifactRoot}/performance-after.png`],
    pairedGameplaySurface: {
      menuVisible: [before.menuVisible, after.menuVisible],
      playerPosition: [before.player.position, after.player.position],
      yaw: [before.player.yaw, after.player.yaw],
      pitch: [before.player.pitch, after.player.pitch],
      pixelDifference,
    },
    browserErrors: fatalErrors,
  };
  await writeFile(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
