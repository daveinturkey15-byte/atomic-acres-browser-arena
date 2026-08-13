import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PASS71_AUDIO_NATIVE } from '../../scripts/qa/pass71-audio-native-receipt-contract.mjs';

const enabled = process.env.PASS71_AUDIO_NATIVE === '1';
const expectedSourceSha = process.env.PASS71_AUDIO_SOURCE_SHA ?? '';
const expectedReleasePass = process.env.PASS71_AUDIO_RELEASE_PASS ?? '';
const browserName = process.env.PASS71_AUDIO_BROWSER_NAME ?? '';
const requestedArena = process.env.PASS71_AUDIO_ARENA;
const arenas = PASS71_AUDIO_NATIVE.arenas.filter((arena) => !requestedArena || requestedArena === arena);

test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'Run through qa:pass71:audio-native for fresh exact-SHA installed-browser evidence.');

type Snapshot = ReturnType<typeof window.__ATOMIC_ACRES_DEBUG__.snapshot>;

function phaseFrom(snapshot: Snapshot, elapsedMs: number) {
  return {
    elapsedMs,
    frameCount: snapshot.frameCount,
    contextState: snapshot.audio.context.state,
    outputProbe: snapshot.audio.outputProbe,
    runtime: snapshot.audio.runtime,
    lifecycle: snapshot.audio.lifecycle,
    counters: {
      glassPulses: snapshot.audio.glassImpactPrewarm.pulses,
      grenadeAutomations: snapshot.audio.grenadeEffectsPrewarm.automations,
      supportCues: snapshot.audio.support.cues,
      countdownCues: snapshot.audio.countdown.cues,
    },
    buses: snapshot.audio.buses,
  };
}

async function capture(page: Page, startedAt: number) {
  return page.evaluate(({ origin }) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { snapshot, elapsedMs: Math.max(0, Math.round(performance.now() - origin)) };
  }, { origin: startedAt }).then(({ snapshot, elapsedMs }) => phaseFrom(snapshot, elapsedMs));
}

async function loudest(page: Page, startedAt: number, durationMs: number) {
  const samples = [];
  const deadline = Date.now() + durationMs;
  do {
    samples.push(await capture(page, startedAt));
    await page.waitForTimeout(25);
  } while (Date.now() < deadline);
  return samples.reduce((best, sample) => sample.outputProbe.peak > best.outputProbe.peak ? sample : best);
}

async function waitActive(page: Page) {
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug) return false;
    const admission = debug.admissionState();
    return admission.matchPhase === 'active' && admission.presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

for (const [arenaIndex, arenaId] of arenas.entries()) {
  test(`${arenaId} proves event-driven native Quality audio and bounded cleanup for 65 seconds`, async ({ page, request }, testInfo) => {
    test.setTimeout(210_000);
    expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(expectedReleasePass).toMatch(/^PASS [1-9][0-9]*(?:\.[0-9]+)?$/u);
    expect(['chrome', 'msedge']).toContain(browserName);
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(expectedSourceSha);
    const provenanceResponse = await request.get(new URL('/channels/the-big-one/channel-provenance.json', testInfo.project.use.baseURL as string).toString());
    expect(provenanceResponse.ok()).toBe(true);
    const servedCandidate = await provenanceResponse.json();
    expect(servedCandidate).toMatchObject({ schemaVersion: 4, channel: 'the-big-one', releasePass: expectedReleasePass, sourceSha: expectedSourceSha, path: 'channels/the-big-one' });

    const faults: Array<{ kind: 'pageerror' | 'console'; text: string }> = [];
    page.on('pageerror', (error) => faults.push({ kind: 'pageerror', text: error.stack ?? error.message }));
    page.on('console', (message) => { if (message.type() === 'error') faults.push({ kind: 'console', text: message.text() }); });
    await page.addInitScript(() => localStorage.removeItem('atomic-acres:client-runtime-log:v1'));
    const url = new URL('/', testInfo.project.use.baseURL as string);
    for (const [key, value] of Object.entries({
      release: 'latest', map: arenaId, renderer: 'webgpu', render: 'blender', externalServices: 'off', signal: 'off',
      seed: `pass71-audio-native-${arenaId}`,
    })) url.searchParams.set(key, value);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false), undefined, { timeout: 90_000 });
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#player-name');
      if (!input) throw new Error('missing player name input');
      input.value = 'Pass 71 Native Audio';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const startedAt = await page.evaluate(() => performance.now());
    const timeline = [];
    const startBefore = await capture(page, startedAt);

    // The real pointer activation must create/resume Web Audio. Debug-only
    // unlocks are deliberately insufficient evidence.
    await page.locator('#solo').click();
    const startDuring = await loudest(page, startedAt, 3_500);
    await waitActive(page);
    await page.waitForTimeout(900);
    const startAfter = await capture(page, startedAt);
    timeline.push({ id: 'start', action: 'physical #solo click', before: startBefore, during: startDuring, after: startAfter,
      audibleDelta: startDuring.outputProbe.peak - startBefore.outputProbe.peak, returnedToBaseline: startAfter.outputProbe.rms <= Math.max(0.004, startBefore.outputProbe.rms + 0.002) });

    async function event(id: string, action: () => Promise<string>, preSampleMs: number, duringMs: number, settleMs: number) {
      const before = await capture(page, startedAt);
      const actionResult = await action();
      if (preSampleMs > 0) await page.waitForTimeout(preSampleMs);
      const during = await loudest(page, startedAt, duringMs);
      await page.waitForTimeout(settleMs);
      const after = await capture(page, startedAt);
      timeline.push({ id, action: actionResult, before, during, after,
        audibleDelta: during.outputProbe.peak - before.outputProbe.peak,
        returnedToBaseline: after.outputProbe.rms <= Math.max(0.004, before.outputProbe.rms + 0.002) });
    }

    await event('combat', async () => { await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce()); return 'debug fireOnce through combat authority'; }, 0, 350, 900);
    await event('grenade', async () => { await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.throwGrenade()); return 'debug throwGrenade through carried-inventory authority'; }, 1_500, 1_100, 1_000);
    await event('glass', async () => {
      const broken = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.detonateGrenadeAtWindow(0));
      expect(broken).toBeGreaterThan(0); return `grenade blast broke ${broken} window panes`;
    }, 0, 400, 900);
    await event('support', async () => {
      const result = await page.evaluate(() => {
        const debug = window.__ATOMIC_ACRES_DEBUG__; debug.earnSupport(3); debug.activateSupport('scout-sweep');
        return debug.snapshot().audio.support.cues;
      });
      return `scout-sweep support cue count ${result}`;
    }, 0, 400, 12_300);
    await event('rematch', async () => { await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.rematch()); return 'debug rematch through solo restart'; }, 0, 3_500, 900);
    await waitActive(page);
    const transitionArenaId = PASS71_AUDIO_NATIVE.arenas[(PASS71_AUDIO_NATIVE.arenas.indexOf(arenaId) + 1) % PASS71_AUDIO_NATIVE.arenas.length]!;
    await event('arena-transition', async () => {
      await page.evaluate((nextArena) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.returnToMainMenu();
        return debug.selectArena(nextArena as typeof arenaId);
      }, transitionArenaId);
      await page.waitForFunction((nextArena) => window.__ATOMIC_ACRES_DEBUG__.snapshot().audio.ambience.arena === nextArena, transitionArenaId);
      await page.locator('#solo').click();
      return `selectArena(${transitionArenaId}) plus physical #solo click`;
    }, 0, 3_500, 900);
    await waitActive(page);

    const postMinuteSamples = [];
    for (const elapsedMs of [60_000, 61_000, 62_000, 63_000, 64_000, 65_000]) {
      const remaining = elapsedMs - (await page.evaluate((origin) => performance.now() - origin, startedAt));
      if (remaining > 0) await page.waitForTimeout(remaining);
      postMinuteSamples.push(await capture(page, startedAt));
    }
    expect(timeline.map((entry) => entry.id)).toEqual(PASS71_AUDIO_NATIVE.events);
    for (const entry of timeline) {
      expect(entry.audibleDelta, `${entry.id} must change the final audible mix`).toBeGreaterThan(0.000001);
      expect(entry.returnedToBaseline, `${entry.id} must return to baseline`).toBe(true);
    }
    for (const sample of postMinuteSamples) {
      expect(sample.outputProbe.suspiciousBroadbandHiss).toBe(false);
      expect(sample.runtime.voices).toBeLessThanOrEqual(sample.runtime.globalCap);
      expect(sample.runtime.retainedSources).toBe(sample.lifecycle.owners.arena + sample.lifecycle.owners.combatFeedback);
      expect(sample.lifecycle.owners.arena).toBe(0);
      expect(sample.outputProbe.logBandsDb).toHaveLength(PASS71_AUDIO_NATIVE.retainedSampleCount);
      expect(sample.outputProbe.timeDomainSamples).toHaveLength(PASS71_AUDIO_NATIVE.retainedSampleCount);
    }
    const adapter = await page.evaluate(async () => {
      const gpuAdapter = await navigator.gpu?.requestAdapter();
      const info = gpuAdapter?.info;
      const description = [info?.vendor, info?.architecture, info?.device, info?.description].filter(Boolean).join(' ');
      return { description, vendor: info?.vendor ?? '', architecture: info?.architecture ?? '', software: /swiftshader|llvmpipe|software|warp/i.test(description) };
    });
    expect(adapter.description).not.toBe('');
    expect(adapter.software).toBe(false);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const clientRuntimeLog = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]'); } catch { return ['invalid-client-runtime-log-json']; } });
    expect(clientRuntimeLog).toEqual([]);
    expect(faults).toEqual([]);
    const outputDirectory = resolve(process.cwd(), 'artifacts/pass71/audio-native');
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, `${arenaId}-${browserName}.json`), `${JSON.stringify({
      schema: PASS71_AUDIO_NATIVE.arenaSchema, status: 'PASS', sourceSha: expectedSourceSha, servedCandidate,
      arenaId, transitionArenaId, browserName, browserVersion: page.context().browser()?.version() ?? '', userAgent, adapter,
      physicalAudioUnlock: true, profile: PASS71_AUDIO_NATIVE.profile, durationMs: 65_000, timeline, postMinuteSamples,
      clientRuntimeLog, faults,
    }, null, 2)}\n`, 'utf8');
  });
}
