import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import {
  pass25aSoakFailures,
  summarizePass25aSoakBrowserIssues,
} from './pass25a-soak-contract.mjs';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/';
const durationMs = Number(process.env.QA_SOAK_MS ?? 1_800_000);
const sampleIntervalMs = Number(process.env.QA_SOAK_SAMPLE_MS ?? 5_000);
if (!Number.isFinite(durationMs) || durationMs < 30_000) throw new Error('QA_SOAK_MS must be at least 30000');
const chromiumArgs = [
  ...OFFSCREEN_ARGS,
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const headed = process.env.QA_HEADED === '1';
const browser = await chromium.launch({ headless: !headed, args: chromiumArgs });
const browserIssues = [];
const samples = [];
let browserIssuePhase = 'bootstrap';
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (!headed) {
    cdp.on('Page.screencastFrame', ({ sessionId }) => cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 1, everyNthFrame: 5 });
  }
  page.on('pageerror', (error) => browserIssues.push({
    phase: browserIssuePhase,
    source: 'pageerror',
    message: error.message,
  }));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) browserIssues.push({
      phase: browserIssuePhase,
      source: 'console:error',
      message: message.text(),
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    const path = new URL(response.url()).pathname;
    if (path === '/favicon.ico') return;
    browserIssues.push({
      phase: browserIssuePhase,
      source: 'http',
      message: `HTTP ${response.status()} ${response.url()}`,
    });
  });
  const candidateUrl = new URL(baseUrl);
  candidateUrl.searchParams.set('release', 'latest');
  candidateUrl.searchParams.set('render', 'performance');
  candidateUrl.searchParams.set('seed', 'pass25a-soak');
  await page.goto(candidateUrl.toString());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 30_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.map-card[data-arena-id]')].some((button) => !button.disabled),
    undefined,
    { timeout: 60_000 },
  );
  await page.fill('#player-name', 'Soak Operator');
  await page.click('#solo');
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  const beforeContextLoss = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      frameCount: state.frameCount,
      contextLifecycle: state.render.contextLifecycle,
      framePacing: state.render.framePacing,
    };
  });
  browserIssuePhase = 'intentional-context-loss';
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
  const lostContext = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      frameCount: state.frameCount,
      contextLifecycle: state.render.contextLifecycle,
      framePacing: state.render.framePacing,
    };
  });
  await page.evaluate(() => window.__PASS25_SOAK_CONTEXT_EXTENSION__.restoreContext());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.contextLifecycle.restorations >= 1, undefined, { timeout: 10_000 });
  await page.waitForFunction((beforeFrameCount) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.render.contextLifecycle.lost === false && state.frameCount > beforeFrameCount;
  }, beforeContextLoss.frameCount, { timeout: 10_000 });
  const restoredBoundaryFrameCount = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  // Keep issue attribution inside the injected-loss phase until two fresh
  // game frames have crossed the restored context boundary. This
  // admits the synchronous runtime diagnostic without admitting a later loss.
  await page.waitForFunction((restoredFrameCount) => (
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().frameCount >= restoredFrameCount + 2
  ), restoredBoundaryFrameCount, { timeout: 10_000 });
  const recoveredContext = await page.evaluate(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      frameCount: state.frameCount,
      contextLifecycle: state.render.contextLifecycle,
      framePacing: state.render.framePacing,
    };
  });
  const contextRecovery = {
    exercised: contextRecoveryExercised,
    before: beforeContextLoss,
    lost: lostContext,
    recovered: recoveredContext,
  };
  browserIssuePhase = 'soak';
  await page.evaluate(() => {
    const clock = { sampleCount: 0, maxMs: 0, lastAt: null };
    window.__PASS25_SOAK_STEADY_FRAME_CLOCK__ = clock;
    const tick = (now) => {
      if (clock.lastAt !== null) {
        clock.sampleCount += 1;
        clock.maxMs = Math.max(clock.maxMs, now - clock.lastAt);
      }
      clock.lastAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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
  const steadyFramePacing = await page.evaluate(() => {
    const clock = window.__PASS25_SOAK_STEADY_FRAME_CLOCK__;
    return { sampleCount: clock?.sampleCount ?? 0, maxMs: clock?.maxMs ?? null };
  });
  const heapGrowthRatio = Number.isFinite(baselineHeapBytes) && baselineHeapBytes > 0 && Number.isFinite(finalHeapBytes)
    ? (finalHeapBytes - baselineHeapBytes) / baselineHeapBytes
    : null;
  const maximumEffects = {
    impactParticles: Math.max(...samples.map((sample) => sample.activeImpactParticles)),
    impactMarks: Math.max(...samples.map((sample) => sample.activeImpactMarks)),
    tracers: Math.max(...samples.map((sample) => sample.activeTracers)),
  };
  const browserIssueSummary = summarizePass25aSoakBrowserIssues(browserIssues, contextRecovery);
  const report = {
    schema: 'atomic-acres/pass25a-soak@3',
    measurementMode: headed ? 'headed Chromium under Xvfb' : 'playwright CDP screencast heartbeat; cadence is instrumentation-capped',
    requestedDurationMs: durationMs,
    samples: samples.length,
    browserIssues,
    errors: browserIssueSummary.unexpected,
    expectedInjectedErrors: browserIssueSummary.expectedInjected,
    contextRecoveryExercised,
    contextRecovery,
    baselineHeapBytes,
    finalHeapBytes,
    heapGrowthRatio,
    maximumEffects,
    first: samples[0] ?? null,
    last: samples.at(-1) ?? null,
    sampleFrames: samples,
    maxP95FrameMs: Math.max(...samples.map((sample) => sample.framePacing.p95Ms)),
    minAverageFps: Math.min(...samples.map((sample) => sample.framePacing.cadenceHz)),
    steadyFramePacing,
    maxFrameMs: steadyFramePacing.maxMs,
    applicationMaxFrameMsIncludingInjectedRecovery: Math.max(...samples.map((sample) => sample.framePacing.maxMs)),
  };
  await mkdir('artifacts/pass25a', { recursive: true });
  await writeFile('artifacts/pass25a/soak.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  const failures = pass25aSoakFailures(report);
  if (failures.length > 0) {
    console.error(`Pass 25A soak failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
