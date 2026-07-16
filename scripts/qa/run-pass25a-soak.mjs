import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const durationMs = Number(process.env.QA_SOAK_MS ?? 1_800_000);
const sampleIntervalMs = Number(process.env.QA_SOAK_SAMPLE_MS ?? 5_000);
if (!Number.isFinite(durationMs) || durationMs < 30_000) throw new Error('QA_SOAK_MS must be at least 30000');
const chromiumArgs = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
const errors = [];
const samples = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (!headed) {
    cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
  }
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const path = new URL(response.url()).pathname;
    if (path === '/favicon.ico') return;
    errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}?render=performance&seed=pass25a-soak`);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
  const contextRecoveryExercised = await page.evaluate(() => {
    const canvas = document.querySelector('#game');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.__PASS25_SOAK_CONTEXT_EXTENSION__ = extension;
    extension.loseContext();
    return true;
  });
  if (!contextRecoveryExercised) throw new Error('WEBGL_lose_context is required for the Pass 25A soak gate');
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.contextLifecycle.lost === true, undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__PASS25_SOAK_CONTEXT_EXTENSION__.restoreContext());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.contextLifecycle.restorations >= 1, undefined, { timeout: 10_000 });
  await cdp.send('HeapProfiler.collectGarbage');
  const baselineHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    await page.waitForTimeout(Math.min(sampleIntervalMs, durationMs - (Date.now() - startedAt)));
    const sample = await page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        elapsedMs: performance.now(),
        frameCount: state.frameCount,
        matchPhase: state.matchPhase,
        framePacing: state.render.framePacing,
        adaptive: state.render.adaptive,
        contextLifecycle: state.render.contextLifecycle,
        calls: state.render.calls,
        triangles: state.render.triangles,
        activeImpactParticles: state.activeImpactParticles,
        activeImpactMarks: state.activeImpactMarks,
        activeTracers: state.activeTracers,
        heapBytes: performance.memory?.usedJSHeapSize ?? null,
      };
    });
    samples.push(sample);
    if (sample.matchPhase === 'ended') {
      await page.click('#rematch');
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 10_000 });
    }
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const finalHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  const heapGrowthRatio = Number.isFinite(baselineHeapBytes) && baselineHeapBytes > 0 && Number.isFinite(finalHeapBytes)
    ? (finalHeapBytes - baselineHeapBytes) / baselineHeapBytes
    : null;
  const maximumEffects = {
    impactParticles: Math.max(...samples.map((sample) => sample.activeImpactParticles)),
    impactMarks: Math.max(...samples.map((sample) => sample.activeImpactMarks)),
    tracers: Math.max(...samples.map((sample) => sample.activeTracers)),
  };
  const report = {
    schema: 'atomic-acres/pass25a-soak@2',
    measurementMode: headed ? 'headed Chromium under Xvfb' : 'playwright CDP screencast heartbeat; cadence is instrumentation-capped',
    requestedDurationMs: durationMs,
    samples: samples.length,
    errors,
    contextRecoveryExercised,
    baselineHeapBytes,
    finalHeapBytes,
    heapGrowthRatio,
    maximumEffects,
    first: samples[0] ?? null,
    last: samples.at(-1) ?? null,
    maxP95FrameMs: Math.max(...samples.map((sample) => sample.framePacing.p95Ms)),
    minAverageFps: Math.min(...samples.map((sample) => sample.framePacing.cadenceHz)),
    maxFrameMs: Math.max(...samples.map((sample) => sample.framePacing.maxMs)),
  };
  await mkdir('artifacts/pass25a', { recursive: true });
  await writeFile('artifacts/pass25a/soak.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  const finalContext = report.last?.contextLifecycle;
  if (errors.length || samples.length < 2 || report.minAverageFps < 4 || report.maxFrameMs > 500
    || !contextRecoveryExercised || !finalContext || finalContext.lost || finalContext.losses < 1 || finalContext.losses !== finalContext.restorations
    || maximumEffects.impactParticles > 72 || maximumEffects.impactMarks > 32 || maximumEffects.tracers > 18
    || (heapGrowthRatio !== null && heapGrowthRatio > 0.25)) process.exitCode = 1;
} finally {
  await browser.close();
}
