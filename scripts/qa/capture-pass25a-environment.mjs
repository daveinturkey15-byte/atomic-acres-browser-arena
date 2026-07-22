import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const record = process.argv.includes('--record');
const chromiumArgs = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (!headed) {
    const cdp = await context.newCDPSession(page);
    cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
  }
  await page.goto(`${baseUrl}?render=performance&seed=pass25a-environment`);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 20_000 });
  await page.waitForTimeout(5_000);
  const browserFacts = await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const gl = canvas.getContext('webgl2');
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      viewport: [window.innerWidth, window.innerHeight],
      devicePixelRatio: window.devicePixelRatio,
      webgl: {
        version: gl?.getParameter(gl.VERSION) ?? null,
        shadingLanguageVersion: gl?.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? null,
        vendor: gl?.getParameter(gl.VENDOR) ?? null,
        renderer: gl?.getParameter(gl.RENDERER) ?? null,
      },
      render: state.render,
      frameCount: state.frameCount,
      matchPhase: state.matchPhase,
      random: state.random,
    };
  });
  const lock = await readFile('package-lock.json');
  const manifest = {
    schema: 'atomic-acres/pass25a-reference-environment@2',
    baselineSource: '3a1ead06bfdede4b3d6c96f9ecde228520c04ccf',

    packageLockSha256: createHash('sha256').update(lock).digest('hex'),
    playwrightBrowserVersion: browser.version(),
    os: process.platform,
    architecture: process.arch,
    node: process.version,
    measurementMode: headed ? 'headed Chromium under Xvfb' : 'playwright CDP screencast heartbeat; cadence is instrumentation-capped',
    ...browserFacts,
  };
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir('artifacts/pass25a', { recursive: true });
  await writeFile('artifacts/pass25a/reference-environment.json', content);
  if (record) {
    await mkdir('baselines/pass25a', { recursive: true });
    await writeFile('baselines/pass25a/reference-environment.json', content);
  }
  console.log(content);
} finally {
  await browser.close();
}
