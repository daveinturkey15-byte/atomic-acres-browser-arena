import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE,
  PASS73_NATIVE_GRENADE_PROFILES,
  PASS73_NATIVE_GRENADE_SCHEMA,
  assertPass73NativeGrenadeReceipt,
  pass73NativeGrenadeFailures,
} from '../../scripts/qa/pass73-native-grenade-contract.mjs';

const enabled = process.env.PASS73_NATIVE_WEBGPU === '1';
const expectedHead = process.env.PASS73_NATIVE_SOURCE_SHA ?? '';
const expectedTree = process.env.PASS73_NATIVE_TREE_SHA ?? '';
const chromePath = process.env.PASS73_NATIVE_CHROME_PATH ?? '';
const chromeSha256 = process.env.PASS73_NATIVE_CHROME_SHA256 ?? '';
const compositor = process.env.PASS73_NATIVE_COMPOSITOR ?? '';
const artifactRoot = 'artifacts/pass73/native-grenade';

test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'Run only through the owned Pass 73 installed-Chrome native-WebGPU gate.');

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function deploy(page: Page, baseURL: string, profile: string, trial: number): Promise<string> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"entries":[]}',
  }));
  const route = new URL('/channels/the-big-one/', baseURL);
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1',
    render: profile, externalServices: 'off', traceNodeBuilds: '1',
    seed: `pass73-native-grenade-${profile}-${trial}`,
  })) route.searchParams.set(key, value);
  await page.goto(route.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.locator('#solo')).toBeEnabled({ timeout: 90_000 });
  await page.locator('#player-name').fill(`Pass 73 Grenade ${profile} ${trial}`);
  await expect(page.locator('#selected-kit-summary b')).toContainText('FRAG');
  await page.locator('#solo').click();
  await page.waitForFunction((expectedProfile) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const admission = api?.admissionState();
    const telemetry = api?.sampleGrenadeColdPathTelemetry();
    const expectedRuntimeProfile = expectedProfile === 'quality' ? 'blender' : expectedProfile;
    return admission?.matchPhase === 'active'
      && telemetry?.render?.actualBackend === 'webgpu'
      && telemetry?.render?.softwareAdapter === false
      && document.documentElement.dataset.renderProfile === expectedRuntimeProfile
      && document.documentElement.dataset.grenadeEffectsAudioPrewarm === 'ready';
  }, profile, { polling: 'raf', timeout: 90_000 });
  await page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
    api.setGrenades(1);
  });
  await page.waitForTimeout(1_000);
  return route.toString();
}

async function captureTrustedGrenadeWindow(page: Page): Promise<any> {
  await page.evaluate(() => {
    const scope = window as any;
    const api = scope.__ATOMIC_ACRES_DEBUG__;
    scope.__PASS73_GRENADE_PROBE__ = { result: null, armed: true };
    const longTasks: Array<{ startTime: number; duration: number }> = [];
    const observer = typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      })
      : null;
    try { observer?.observe({ type: 'longtask', buffered: false } as PerformanceObserverInit); } catch { /* unsupported is recorded below */ }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyG' || !scope.__PASS73_GRENADE_PROBE__?.armed) return;
      scope.__PASS73_GRENADE_PROBE__.armed = false;
      window.removeEventListener('keydown', onKeyDown, true);
      const startedAt = performance.now();
      const telemetryBefore = api.sampleGrenadeColdPathTelemetry();
      const resourceEntryCountBefore = performance.getEntriesByType('resource').length;
      const performanceMemory = performance as Performance & { memory?: { usedJSHeapSize?: number } };
      const heapBefore = Number.isFinite(performanceMemory.memory?.usedJSHeapSize)
        ? Number(performanceMemory.memory?.usedJSHeapSize)
        : null;
      const gapsMs: number[] = [];
      let priorFrameAt = startedAt;
      const percentile = (samples: readonly number[], fraction: number): number => {
        if (samples.length === 0) return 0;
        const ordered = [...samples].sort((left, right) => left - right);
        return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1))]!;
      };
      const sample = (frameAt: number): void => {
        gapsMs.push(Math.max(0, frameAt - priorFrameAt));
        priorFrameAt = frameAt;
        if (frameAt - startedAt < 450) {
          requestAnimationFrame(sample);
          return;
        }
        for (const entry of observer?.takeRecords() ?? []) {
          longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
        observer?.disconnect();
        const relevantLongTasks = longTasks.filter(({ startTime, duration }) => (
          startTime + duration >= startedAt && startTime <= startedAt + 450
        ));
        const telemetryAfter = api.sampleGrenadeColdPathTelemetry();
        const resourceLoads = performance.getEntriesByType('resource')
          .slice(resourceEntryCountBefore)
          .map((entry) => {
            const resource = entry as PerformanceResourceTiming;
            let path = resource.name;
            try { path = new URL(resource.name, location.href).pathname; } catch { /* retain raw name */ }
            return {
              path,
              initiatorType: resource.initiatorType,
              duration: resource.duration,
              decodedBodySize: resource.decodedBodySize,
            };
          });
        const heapAfter = Number.isFinite(performanceMemory.memory?.usedJSHeapSize)
          ? Number(performanceMemory.memory?.usedJSHeapSize)
          : null;
        scope.__PASS73_GRENADE_PROBE__.result = {
          keyCode: event.code,
          keyTrusted: event.isTrusted,
          keyRepeat: event.repeat,
          gapsMs,
          maximumGapMs: Math.max(0, ...gapsMs),
          p50Ms: percentile(gapsMs, 0.5),
          p95Ms: percentile(gapsMs, 0.95),
          p99Ms: percentile(gapsMs, 0.99),
          longTaskObserverSupported: observer !== null,
          longTasks: relevantLongTasks,
          telemetryBefore,
          telemetryAfter,
          resourceLoads,
          heap: { beforeBytes: heapBefore, afterBytes: heapAfter },
        };
      };
      requestAnimationFrame(sample);
    };
    window.addEventListener('keydown', onKeyDown, true);
  });
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => Boolean((window as any).__PASS73_GRENADE_PROBE__?.result), undefined, {
    polling: 'raf', timeout: 10_000,
  });
  return page.evaluate(() => (window as any).__PASS73_GRENADE_PROBE__.result);
}

async function completeAction(page: Page, sequence: number): Promise<any> {
  await page.waitForFunction((expectedSequence) => {
    const action = (window as any).__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().action;
    return action?.sequence === expectedSequence && action?.observationComplete === true;
  }, sequence, { polling: 'raf', timeout: 10_000 });
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().action);
}

async function waitForGrenadeDrain(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const telemetry = (window as any).__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry();
    return telemetry.pool.active === 0
      && telemetry.explosion.total >= 1
      && telemetry.explosion.active === 0
      && (telemetry.explosion.lastExplosionAgeMs ?? 0) >= 250;
  }, undefined, { polling: 'raf', timeout: 12_000 });
}

test('first grenade stays inside the warm envelope in three fresh Quality and Performance contexts', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  expect(expectedHead).toMatch(/^[a-f0-9]{40}$/u);
  expect(expectedTree).toMatch(/^[a-f0-9]{40}$/u);
  expect(chromeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(chromePath).toMatch(/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/iu);
  expect(git('status', '--porcelain', '--untracked-files=all')).toBe('');
  expect(git('rev-parse', 'HEAD')).toBe(expectedHead);
  expect(git('rev-parse', 'HEAD^{tree}')).toBe(expectedTree);

  const baseURL = testInfo.project.use.baseURL as string;
  const trials: any[] = [];
  for (const profile of PASS73_NATIVE_GRENADE_PROFILES) {
    for (let trial = 1; trial <= PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE; trial += 1) {
      const context = await browser.newContext({ viewport: { width: 2_560, height: 1_440 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      try {
        const route = await deploy(page, baseURL, profile, trial);
        const pose = await page.evaluate(() => {
          const player = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player;
          return { position: player.position, yaw: player.yaw, pitch: player.pitch };
        });
        const resetPose = async (): Promise<void> => page.evaluate((fixedPose) => {
          const api = (window as any).__ATOMIC_ACRES_DEBUG__;
          api.teleportPlayer(
            fixedPose.position[0], fixedPose.position[1], fixedPose.position[2], fixedPose.yaw, fixedPose.pitch,
          );
          api.setMovement(false);
          api.setGrenades(1);
          return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, pose);

        await resetPose();
        const firstWindow = await captureTrustedGrenadeWindow(page);
        const firstAction = await completeAction(page, 0);
        await waitForGrenadeDrain(page);
        await resetPose();
        const secondWindow = await captureTrustedGrenadeWindow(page);
        const secondAction = await completeAction(page, 1);
        const fatalErrors = [...new Set(browserErrors)].filter((message) => (
          !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/iu.test(message)
        ));
        trials.push({
          profile,
          trial,
          route,
          userAgent: await page.evaluate(() => navigator.userAgent),
          viewport: [2_560, 1_440],
          deviceScaleFactor: 1,
          browserErrors: fatalErrors,
          first: { window: firstWindow, action: firstAction },
          second: { window: secondWindow, action: secondAction },
        });
      } finally {
        await context.close();
      }
    }
  }

  const endingHead = git('rev-parse', 'HEAD');
  const endingTree = git('rev-parse', 'HEAD^{tree}');
  const receipt = {
    schema: PASS73_NATIVE_GRENADE_SCHEMA,
    verdict: 'pass',
    source: {
      head: expectedHead,
      tree: expectedTree,
      clean: git('status', '--porcelain', '--untracked-files=all') === '',
      endingHead,
      endingTree,
    },
    browser: {
      executablePath: chromePath.replaceAll('\\', '/'),
      executableSha256: chromeSha256,
      version: browser.version(),
    },
    gate: {
      profiles: [...PASS73_NATIVE_GRENADE_PROFILES],
      contextsPerProfile: PASS73_NATIVE_GRENADE_CONTEXTS_PER_PROFILE,
      viewport: [2_560, 1_440],
      deviceScaleFactor: 1,
      backend: 'native-hardware-webgpu',
      input: 'trusted-keyboard-KeyG',
      freshBrowserContextPerTrial: true,
      compositor,
    },
    trials,
  };
  const receiptFailures = pass73NativeGrenadeFailures(receipt, {
    head: expectedHead,
    tree: expectedTree,
    executableSha256: chromeSha256,
  });
  receipt.verdict = receiptFailures.length === 0 ? 'pass' : 'fail';
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  assertPass73NativeGrenadeReceipt(receipt, { head: expectedHead, tree: expectedTree, executableSha256: chromeSha256 });
  await testInfo.attach('pass73-native-grenade-receipt', {
    body: Buffer.from(JSON.stringify(receipt, null, 2)), contentType: 'application/json',
  });
});
