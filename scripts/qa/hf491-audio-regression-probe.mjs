import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4300/';
const LABEL = process.env.PROBE_LABEL ?? 'hf491';
const OUTPUT_DIR = resolve(process.env.PROBE_OUTPUT_DIR ?? 'docs/evidence/pass94/audio/raw');

const STOCK_CHROME_ARGS = [
  '--mute-audio',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--window-position=-32000,-32000',
  '--window-size=2640,1520',
];

const MENU_URL = `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}release=latest&renderer=webgpu&grass=off&mist=off&clouds=off&rays=off&seed=hf491-audio`;

function addWebAudioProbe(page) {
  return page.addInitScript(() => {
    const records = [];
    const nativeAudioContext = globalThis.AudioContext;
    const nativeWebkitAudioContext = globalThis.webkitAudioContext;

    function observe(context) {
      const record = {
        sampleRate: context.sampleRate ?? null,
        stateAtCreate: context.state ?? null,
        createBuffer: 0,
        createBufferSource: 0,
        createOscillator: 0,
        createGain: 0,
        createPanner: 0,
        createBiquadFilter: 0,
        createAnalyser: 0,
        starts: 0,
        stops: 0,
        decodeCalls: 0,
        decodeErrors: [],
      };
      records.push(record);
      const wrap = (name, onCall) => {
        const original = context[name];
        if (typeof original !== 'function') return;
        context[name] = function (...args) {
          onCall();
          return original.apply(this, args);
        };
      };
      wrap('createBuffer', () => { record.createBuffer += 1; });
      wrap('createBufferSource', () => { record.createBufferSource += 1; });
      wrap('createOscillator', () => { record.createOscillator += 1; });
      wrap('createGain', () => { record.createGain += 1; });
      wrap('createPanner', () => { record.createPanner += 1; });
      wrap('createBiquadFilter', () => { record.createBiquadFilter += 1; });
      wrap('createAnalyser', () => { record.createAnalyser += 1; });
      const decode = context.decodeAudioData;
      if (typeof decode === 'function') {
        context.decodeAudioData = function (...args) {
          record.decodeCalls += 1;
          const result = decode.apply(this, args);
          if (result && typeof result.catch === 'function') {
            result.catch((error) => record.decodeErrors.push(String(error)));
          }
          return result;
        };
      }
      const sourceStart = AudioScheduledSourceNode?.prototype?.start;
      const sourceStop = AudioScheduledSourceNode?.prototype?.stop;
      if (sourceStart) AudioScheduledSourceNode.prototype.start = function (...args) { record.starts += 1; return sourceStart.apply(this, args); };
      if (sourceStop) AudioScheduledSourceNode.prototype.stop = function (...args) { record.stops += 1; return sourceStop.apply(this, args); };
    }

    if (typeof nativeAudioContext === 'function') {
      globalThis.AudioContext = class extends nativeAudioContext {
        constructor(...args) {
          super(...args);
          observe(this);
          globalThis.__HF491_AUDIO_PROBE__?.contexts.push(this);
        }
      };
    }
    if (typeof nativeWebkitAudioContext === 'function') {
      globalThis.webkitAudioContext = class extends nativeWebkitAudioContext {
        constructor(...args) {
          super(...args);
          observe(this);
          globalThis.__HF491_AUDIO_PROBE__?.contexts.push(this);
        }
      };
    }
    globalThis.__HF491_AUDIO_PROBE__ = { records, contexts: [] };
  });
}

async function visible(page, selector) {
  return page.locator(selector).isVisible().catch(() => false);
}

async function dismissStaleUi(page) {
  for (const selector of ['#changelog-close', '#project-map-close', '#rtx-native-runtime-explainer-close']) {
    if (await visible(page, selector)) await page.locator(selector).click();
  }
  await page.keyboard.press('Escape').catch(() => undefined);
}

async function readAudio(page) {
  return page.evaluate(() => {
    const api = globalThis.__ATOMIC_ACRES_DEBUG__;
    return {
      telemetry: typeof api?.audioTelemetry === 'function' ? api.audioTelemetry() : null,
      snapshot: typeof api?.snapshot === 'function' ? api.snapshot().audio ?? null : null,
      webAudio: globalThis.__HF491_AUDIO_PROBE__?.records?.map((record, index) => ({
        ...record,
        state: globalThis.__HF491_AUDIO_PROBE__?.contexts?.[index]?.state ?? null,
      })) ?? [],
    };
  });
}

async function run() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: STOCK_CHROME_ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text(), location: message.location() }));
  page.on('pageerror', (error) => pageErrors.push({ name: error.name, message: error.message }));
  page.on('requestfailed', (request) => failedRequests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType(), failure: request.failure() }));
  page.on('response', (response) => { if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url(), resourceType: response.request().resourceType() }); });

  const report = {
    schemaVersion: 1,
    label: LABEL,
    baseUrl: BASE_URL,
    requestedUrl: MENU_URL,
    browser: { channel: 'chrome', headless: true, args: STOCK_CHROME_ARGS, viewport: { width: 1280, height: 720 } },
    boot: null,
    actions: [],
    beforeActions: null,
    afterFire: null,
    afterSteps: null,
    consoleErrors: [],
    pageErrors,
    failedAudioRequests: [],
    badAudioResponses: [],
    allFailedRequests: failedRequests,
    allBadResponses: badResponses,
  };

  try {
    await addWebAudioProbe(page);
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await dismissStaleUi(page);
    if (await visible(page, '#release-channel-gate')) await page.locator('[data-release-choice="latest"]').click();
    await page.waitForSelector('#menu', { state: 'visible', timeout: 60_000 });
    await page.locator('.map-card[data-arena-id="nuketown2"]:not([disabled])').click();
    await page.waitForFunction(() => document.querySelector('.map-card[aria-pressed="true"]')?.getAttribute('data-arena-id') === 'nuketown2', undefined, { timeout: 10_000 });
    report.actions.push({ event: 'solo-deploy-requested' });
    await page.locator('#solo').click();
    await page.waitForFunction(() => {
      const api = globalThis.__ATOMIC_ACRES_DEBUG__;
      const state = typeof api?.snapshot === 'function' ? api.snapshot() : null;
      return document.documentElement.dataset.gameplayArena === 'nuketown2'
        && document.querySelector('#menu')?.classList.contains('hidden') === true
        && state?.gameStarted === true && state?.matchPhase === 'active';
    }, undefined, { timeout: 120_000 });
    report.boot = await page.evaluate(() => ({
      backend: document.documentElement.dataset.renderBackend ?? null,
      snapshot: globalThis.__ATOMIC_ACRES_DEBUG__?.samplePlayerPose?.() ?? null,
    }));
    report.beforeActions = await readAudio(page);

    report.actions.push({ event: 'weapon-shot-requested', api: '__ATOMIC_ACRES_DEBUG__.fireOnce' });
    await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(150);
    report.afterFire = await readAudio(page);

    const stepTrace = [];
    for (let step = 1; step <= 5; step += 1) {
      await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.setMovement(true, false));
      await page.waitForTimeout(300);
      await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.setMovement(false, false));
      await page.waitForTimeout(100);
      stepTrace.push({ step, pose: await page.evaluate(() => globalThis.__ATOMIC_ACRES_DEBUG__.samplePlayerPose()), audio: await readAudio(page) });
    }
    report.actions.push({ event: 'five-forward-steps-requested', api: '__ATOMIC_ACRES_DEBUG__.setMovement', pulses: 5, pulseMs: 300, gapMs: 100 });
    report.stepTrace = stepTrace;
    report.afterSteps = await readAudio(page);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    report.consoleErrors = consoleMessages.filter((entry) => entry.type === 'error' || /audio|sound|decode/i.test(entry.text));
    const isAudioUrl = (entry) => entry.resourceType === 'audio' || /(?:audio|sound|sfx|\.(?:ogg|wav|mp3|m4a|aac|flac))(?:[?#/]|$)/i.test(entry.url);
    report.failedAudioRequests = failedRequests.filter(isAudioUrl);
    report.badAudioResponses = badResponses.filter(isAudioUrl);
    writeFileSync(resolve(OUTPUT_DIR, `${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await page.close();
    await browser.close();
  }
  console.log(JSON.stringify({
    label: LABEL,
    baseUrl: BASE_URL,
    boot: report.boot,
    error: report.error ?? null,
    consoleErrors: report.consoleErrors.length,
    pageErrors: report.pageErrors.length,
    failedAudioRequests: report.failedAudioRequests.length,
    badAudioResponses: report.badAudioResponses.length,
  }, null, 2));
  if (report.error || report.pageErrors.length > 0) process.exitCode = 1;
}

await run();
