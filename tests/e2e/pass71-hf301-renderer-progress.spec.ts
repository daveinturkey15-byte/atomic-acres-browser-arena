import { expect, test, type Browser, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PASS71_HF301_RENDERERS,
  PASS71_HF301_TRACE_ORDER,
} from '../../scripts/qa/pass71-hf301-renderer-progress-evidence-contract.mjs';

type Renderer = 'webgl2' | 'webgpu';
type TraceId = typeof PASS71_HF301_TRACE_ORDER[number];

const componentPath = process.env.PASS71_HF301_COMPONENT_PATH;
const expectedSourceSha = process.env.PASS71_HF301_EXPECTED_SOURCE_SHA;
const checkoutSourceSha = componentPath
  ? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim()
  : undefined;
const installedEdge = process.env.QA_INSTALLED_EDGE === '1';
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});
const scopes: any[] = [];
const aggregateFaults: string[] = [];

if (componentPath && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')
  || checkoutSourceSha !== expectedSourceSha || !installedEdge)) {
  throw new Error('Official HF-301 components require exact-SHA installed-Edge evidence');
}

test.use({
  viewport: { width: 1_280, height: 720 },
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  },
});

async function candidateProvenance(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`HF-301 candidate provenance request failed: ${response.status}`);
    const value = await response.json() as any;
    return {
      schemaVersion: value.schemaVersion,
      channel: value.channel,
      releasePass: value.releasePass,
      sourceSha: value.sourceSha,
      path: value.path,
      treeSha256: value.treeSha256,
      exactRootFileCount: value.exactRootFileCount,
    };
  });
}

async function installAuditTripwires(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      readbacks: {
        webglReadPixels: 0,
        webgl2ReadPixels: 0,
        canvasToDataUrl: 0,
        canvasToBlob: 0,
        canvasGetImageData: 0,
      },
      longTaskObserverSupported: false,
      longTasks: [] as Array<{ startTimeMs: number; durationMs: number }>,
      faults: [] as string[],
    };
    (globalThis as any).__PASS71_HF301_AUDIT__ = state;
    const wrap = (prototype: any, method: string, counter: keyof typeof state.readbacks) => {
      const original = prototype?.[method];
      if (typeof original !== 'function') return;
      Object.defineProperty(prototype, method, {
        configurable: true,
        writable: true,
        value: function hf301ReadbackTripwire(this: unknown, ...args: unknown[]) {
          state.readbacks[counter] += 1;
          return Reflect.apply(original, this, args);
        },
      });
    };
    wrap((globalThis as any).WebGLRenderingContext?.prototype, 'readPixels', 'webglReadPixels');
    wrap((globalThis as any).WebGL2RenderingContext?.prototype, 'readPixels', 'webgl2ReadPixels');
    wrap((globalThis as any).HTMLCanvasElement?.prototype, 'toDataURL', 'canvasToDataUrl');
    wrap((globalThis as any).HTMLCanvasElement?.prototype, 'toBlob', 'canvasToBlob');
    wrap((globalThis as any).CanvasRenderingContext2D?.prototype, 'getImageData', 'canvasGetImageData');
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push({
            startTimeMs: Number(entry.startTime.toFixed(3)),
            durationMs: Number(entry.duration.toFixed(3)),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
      state.longTaskObserverSupported = true;
    } catch {
      state.longTaskObserverSupported = false;
    }
    addEventListener('unhandledrejection', (event) => {
      state.faults.push(`unhandledrejection:${String(event.reason)}`);
    });
    addEventListener('error', (event) => {
      state.faults.push(`window-error:${event.message}`);
    });
  });
}

async function deploy(page: Page, renderer: Renderer): Promise<Record<string, unknown>> {
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  await page.bringToFront();
  const required = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(
    `/?release=latest&map=atomic-acres&renderer=${renderer}${required}`
      + '&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + `&seed=pass71-hf301-forward-progress-${renderer}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.locator('#player-name').fill(`Pass 71 HF-301 ${renderer}`);
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot() as any;
    const support = snapshot?.supportVehiclePresentation;
    const requiredAssets = support?.requiredAssets ?? [];
    const loadedAssets = support?.loadedAssets ?? [];
    return snapshot?.gameStarted === true && snapshot?.matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2
      && support?.state === 'ready'
      && requiredAssets.length > 0 && requiredAssets.length === loadedAssets.length
      && requiredAssets.every((asset: string) => loadedAssets.includes(asset))
      && snapshot?.audio?.grenadeEffectsPrewarm?.prepared === true;
  }, undefined, { timeout: 90_000, polling: 50 });
  await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    debug.setBotsFrozen(true);
    debug.equipWeapon('carbine');
    debug.setAmmo('carbine', 30, 120);
  });
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const weapon = debug.sampleActiveWeaponReadiness();
    return weapon.requestedWeapon === 'carbine' && weapon.ready && weapon.gpuReady
      && weapon.resident && weapon.mountedIsRequested && debug.sampleWeaponAssetCache().loading === 0;
  }, undefined, { timeout: 30_000 });
  return candidateProvenance(page);
}

async function prepareTrace(page: Page, id: TraceId): Promise<void> {
  if (id === 'combat-first-fire') {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAmmo('carbine', 30, 120));
    return;
  }
  if (id === 'glass-first-breach') {
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.resetBreakableWindows();
      debug.equipWeapon('carbine');
      debug.setAmmo('carbine', 30, 120);
      debug.stageWindow(0, 4);
    });
    await page.waitForFunction(() => {
      const pane = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).breakableWindows[0];
      return pane && pane.broken === false;
    });
    return;
  }
  if (id === 'grenade-first-frag') {
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setSelectedGrenade('frag');
      debug.setGrenades(1);
    });
    return;
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
}

async function captureTrace(page: Page, id: TraceId): Promise<any> {
  return page.evaluate((traceId) => new Promise((resolveTrace, rejectTrace) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const audit = (globalThis as any).__PASS71_HF301_AUDIT__ as any;
    if (!debug || !audit) {
      rejectTrace(new Error('HF-301 debug or audit surface is unavailable'));
      return;
    }
    const readbacksBefore = { ...audit.readbacks };
    const longTaskIndex = audit.longTasks.length;
    debug.resetPresentationProgressWindow();
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const before = debug.snapshot() as any;
      const beforePresentation = debug.samplePresentationTelemetry() as any;
      const samples: any[] = [];
      const sample = (now: number) => {
        const presentation = debug.samplePresentationTelemetry() as any;
        const snapshot = debug.snapshot() as any;
        samples.push({
          elapsedMs: Number((now - startedAt).toFixed(3)),
          presentedFrame: debug.admissionState().presentedGameplayFrame,
          status: presentation.status,
          submissionMode: presentation.submissionMode,
          submissionSequence: presentation.submissionSequence,
          completedSequence: presentation.completedSequence,
          inFlightSubmissions: presentation.inFlightSubmissions,
          pendingForMs: Number(presentation.pendingForMs.toFixed(3)),
          currentSubmissionGapMs: Number(presentation.progress.currentSubmissionGapMs.toFixed(3)),
          currentCompletionGapMs: Number(presentation.progress.currentCompletionGapMs.toFixed(3)),
          completionFailures: presentation.completionFailures,
          slowNodeBuildCount: Array.isArray(snapshot.render?.runtime?.slowNodeBuilds)
            ? snapshot.render.runtime.slowNodeBuilds.length : 0,
          visibilityState: document.visibilityState,
          documentFocused: document.hasFocus(),
        });
      };
      sample(startedAt);
      let actionReturned = false;
      let supportAccepted: boolean | null = null;
      try {
        if (traceId === 'combat-first-fire' || traceId === 'glass-first-breach') debug.fireOnce();
        else if (traceId === 'grenade-first-frag') debug.throwGrenade();
        else supportAccepted = debug.activateKillstreak('chopper');
        actionReturned = true;
      } catch (error) {
        rejectTrace(error);
        return;
      }
      const inspect = (now: number) => {
        sample(now);
        if (now - startedAt < 1_200) {
          requestAnimationFrame(inspect);
          return;
        }
        const after = debug.snapshot() as any;
        const first = samples[0];
        const last = samples.at(-1);
        const gaps = samples.slice(1).map((entry, index) => entry.elapsedMs - samples[index].elapsedMs);
        const outcome = traceId === 'combat-first-fire'
          ? { ammoBefore: before.player.ammo, ammoAfter: after.player.ammo }
          : traceId === 'glass-first-breach'
            ? {
                windowId: before.breakableWindows[0]?.id ?? '',
                brokenBefore: before.breakableWindows[0]?.broken ?? null,
                brokenAfter: after.breakableWindows[0]?.broken ?? null,
                apertureOpenAfter: after.breakableWindows[0]?.authority?.apertureOpen ?? null,
              }
            : traceId === 'grenade-first-frag'
              ? {
                  grenadesBefore: before.player.grenades,
                  grenadesAfter: after.player.grenades,
                  profileGrenade: after.grenadeFirstAction?.grenade ?? null,
                  profileCold: after.grenadeFirstAction?.cold ?? null,
                  profileObservationComplete: after.grenadeFirstAction?.observationComplete ?? null,
                }
              : {
                  accepted: supportAccepted,
                  entitiesBefore: before.killstreak.entities.length,
                  entitiesAfter: after.killstreak.entities.length,
                  chopperPresent: after.killstreak.entities.some((entity: any) => entity.kind === 'chopper'),
                };
        const readbacks = Object.fromEntries(Object.entries(audit.readbacks).map(([key, value]) => [
          key, (value as number) - (readbacksBefore[key] as number),
        ]));
        resolveTrace({
          id: traceId,
          durationMs: Number((now - startedAt).toFixed(3)),
          actionReturned,
          lifecycle: { arenaId: after.arenaId, matchPhase: after.matchPhase, gameStarted: after.gameStarted },
          outcome,
          summary: {
            sampleCount: samples.length,
            presentedFrameAdvances: last.presentedFrame - first.presentedFrame,
            submissionAdvances: last.submissionSequence - first.submissionSequence,
            completionAdvances: last.completedSequence - first.completedSequence,
            maximumAnimationFrameGapMs: Number(Math.max(...gaps).toFixed(3)),
            maximumPendingForMs: Number(Math.max(...samples.map((entry) => entry.pendingForMs)).toFixed(3)),
            maximumSubmissionGapMs: Number(Math.max(...samples.map((entry) => entry.currentSubmissionGapMs)).toFixed(3)),
            maximumCompletionGapMs: Number(Math.max(...samples.map((entry) => entry.currentCompletionGapMs)).toFixed(3)),
            maximumInFlightSubmissions: Math.max(...samples.map((entry) => entry.inFlightSubmissions)),
            startingSubmissionSequence: first.submissionSequence,
            startingCompletedSequence: first.completedSequence,
            endingSubmissionSequence: last.submissionSequence,
            endingCompletedSequence: last.completedSequence,
          },
          samples,
          longTaskObserverSupported: audit.longTaskObserverSupported,
          longTasks: audit.longTasks.slice(longTaskIndex).filter((entry: any) => (
            entry.startTimeMs >= startedAt && entry.startTimeMs <= now
          )),
          readbacks,
          startingPresentationStatus: beforePresentation.status,
        });
      };
      requestAnimationFrame(inspect);
    });
  }), id).then((trace: any) => {
    // The starting status is checked here but deliberately omitted from the
    // signed component schema; every per-frame status remains embedded.
    expect(trace.startingPresentationStatus).toMatch(/^(?:healthy|synchronous)$/u);
    delete trace.startingPresentationStatus;
    return trace;
  });
}

function runtimeIdentity(snapshot: any, renderer: Renderer) {
  const runtime = snapshot.render.runtime;
  return {
    requestedBackend: runtime.requestedBackend,
    actualBackend: runtime.actualBackend,
    initialized: runtime.initialized,
    adapterClass: runtime.adapterClass,
    deviceClass: runtime.deviceClass,
    adapterLabel: runtime.adapterLabel,
    softwareAdapter: runtime.softwareAdapter,
    deviceLost: runtime.deviceLost,
    uncapturedErrors: runtime.uncapturedErrors,
    slowNodeBuildCount: Array.isArray(runtime.slowNodeBuilds) ? runtime.slowNodeBuilds.length : 0,
  };
}

test.describe.serial('Pass 71 HF-301 exact renderer forward progress', () => {
  for (const renderer of PASS71_HF301_RENDERERS as readonly Renderer[]) {
    test(`${renderer}: first combat, glass, grenade and support actions retain foreground progress`, async ({ browser, page }) => {
      test.setTimeout(180_000);
      const faults: string[] = [];
      page.on('pageerror', (error) => faults.push(`pageerror:${error.stack ?? error.message}`));
      page.on('crash', () => faults.push('page-crash'));
      page.on('console', (message) => {
        if (message.type() === 'error') faults.push(`console:${message.text()}`);
      });
      page.on('requestfailed', (request) => faults.push(
        `requestfailed:${request.method()}:${request.url()}:${request.failure()?.errorText ?? 'unknown'}`,
      ));
      await installAuditTripwires(page);
      const servedCandidate = await deploy(page, renderer);
      if (componentPath) {
        expect(servedCandidate).toMatchObject({
          schemaVersion: 4,
          channel: 'the-big-one',
          releasePass: 'PASS 71',
          sourceSha: expectedSourceSha,
          path: 'channels/the-big-one',
          treeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
      }
      const traces = [];
      for (const id of PASS71_HF301_TRACE_ORDER as readonly TraceId[]) {
        await prepareTrace(page, id);
        const trace = await captureTrace(page, id);
        traces.push(trace);
        if (id === 'grenade-first-frag') {
          await page.waitForFunction(() => {
            const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
            return snapshot.grenades === 0 && snapshot.grenadeExplosion.activeVisuals === 0;
          }, undefined, { timeout: 12_000, polling: 50 });
        }
      }
      const final = await page.evaluate(() => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        const snapshot = debug.snapshot() as any;
        const audit = (globalThis as any).__PASS71_HF301_AUDIT__ as any;
        const runtimeErrorLog = document.querySelector<HTMLElement>('#runtime-error-log')?.textContent ?? '';
        const support = snapshot.supportVehiclePresentation;
        const requiredAssets = support?.requiredAssets ?? [];
        const loadedAssets = support?.loadedAssets ?? [];
        return {
          snapshot,
          runtimeErrorLog: runtimeErrorLog.trim(),
          auditFaults: [...audit.faults],
          scene: {
            arenaId: snapshot.arenaId,
            matchPhase: snapshot.matchPhase,
            supportAssetsReady: support?.state === 'ready' && requiredAssets.length > 0
              && requiredAssets.length === loadedAssets.length
              && requiredAssets.every((asset: string) => loadedAssets.includes(asset)),
          },
        };
      });
      faults.push(...final.auditFaults);
      const userAgent = await page.evaluate(() => navigator.userAgent);
      expect(userAgent).toMatch(/Edg\//u);
      expect(final.runtimeErrorLog).toBe('');
      expect(faults).toEqual([]);
      const scope = {
        renderer,
        expectedSourceSha,
        checkoutSourceSha,
        servedCandidate,
        browser: { version: browser.version(), userAgent },
        runtime: runtimeIdentity(final.snapshot, renderer),
        scene: final.scene,
        traceOrder: [...PASS71_HF301_TRACE_ORDER],
        traces,
        runtimeErrorLog: final.runtimeErrorLog,
        faults,
      };
      scopes.push(scope);
      aggregateFaults.push(...faults.map((fault) => `${renderer}:${fault}`));
    });
  }
});

test.afterAll(() => {
  if (!componentPath) return;
  const record = {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf301-renderer-progress-browser-component@1',
    status: scopes.length === PASS71_HF301_RENDERERS.length && aggregateFaults.length === 0 ? 'passed' : 'failed',
    expectedSourceSha,
    checkoutSourceSha,
    scopes,
    faults: aggregateFaults,
  };
  mkdirSync(dirname(resolve(componentPath)), { recursive: true });
  writeFileSync(resolve(componentPath), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  if (record.status !== 'passed') throw new Error(`HF-301 component incomplete: ${JSON.stringify(record)}`);
});
