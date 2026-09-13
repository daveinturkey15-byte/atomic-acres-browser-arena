import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { ARENA_IDS, isArenaId } from '../../src/arena-identity';

const ARENAS = ['atomic-acres', 'rustworks-1v1', 'skyline-terminal', 'gun-range'] as const;
const requestedArena = process.env.PASS66_AUDIO_ARENA;
// PASS 85 Lane N repair. The filter below used to be silent about a
// PASS66_AUDIO_ARENA it did not recognise: it yielded an EMPTY selection, every
// test skipped, and the run reported success having measured no audio at all.
// The identical shape was a live bug in tests/e2e/pass66-browser-admission-cycles.spec.ts.
// An unknown id is named against the canonical registry, not dropped.
if (requestedArena !== undefined && !isArenaId(requestedArena)) {
  throw new Error(
    `PASS66_AUDIO_ARENA=${requestedArena} is not an arena id; known ids: ${ARENA_IDS.join(', ')}`,
  );
}
if (requestedArena !== undefined && !(ARENAS as readonly string[]).includes(requestedArena)) {
  throw new Error(
    `PASS66_AUDIO_ARENA=${requestedArena} is a real arena but is outside this soak's measured `
    + `budget (${ARENAS.join(', ')}); widen ARENAS here and in scripts/qa/run-pass66-audio-long-run.mjs together`,
  );
}
const selectedArenas = ARENAS.filter((arenaId) => !requestedArena || requestedArena === arenaId);
if (selectedArenas.length === 0) {
  throw new Error('pass66 audio long run selected no arena; refusing to report success over nothing');
}
const enabled = process.env.PASS66_AUDIO_LONG_RUN === '1';
const expectedSourceSha = process.env.PASS66_AUDIO_SOURCE_SHA ?? '';

test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'Run through npm run qa:pass66:audio-long-run for fresh exact-SHA evidence.');

for (const arenaId of selectedArenas) {
  test(`${arenaId} keeps the intentional audio graph bounded beyond the reported one-minute hiss point`, async ({ page, request }, testInfo) => {
    test.setTimeout(150_000);
    expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()).toBe('');
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()).toBe(expectedSourceSha);
    const provenanceResponse = await request.get(new URL(
      '/channels/the-big-one/channel-provenance.json',
      testInfo.project.use.baseURL as string,
    ).toString());
    expect(provenanceResponse.ok()).toBe(true);
    const servedCandidate = await provenanceResponse.json();
    expect(servedCandidate).toMatchObject({
      schemaVersion: 4,
      channel: 'the-big-one',
      releasePass: 'PASS 66',
      sourceSha: expectedSourceSha,
      path: 'channels/the-big-one',
    });
    expect(servedCandidate.treeSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(servedCandidate.exactRootFileCount).toBeGreaterThan(1);
    const faults: Array<{ kind: 'pageerror' | 'console'; text: string }> = [];
    page.on('pageerror', (error) => faults.push({ kind: 'pageerror', text: error.stack ?? error.message }));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push({ kind: 'console', text: message.text() });
    });
    await page.addInitScript(() => localStorage.removeItem('atomic-acres:client-runtime-log:v1'));

    const url = new URL('/', testInfo.project.use.baseURL as string);
    for (const [key, value] of Object.entries({
      release: 'latest', map: arenaId, renderer: 'webgl2', render: 'performance',
      externalServices: 'off', signal: 'off', grass: 'off', mist: 'off', rays: 'off',
      seed: `pass66-audio-long-run-${arenaId}`,
    })) url.searchParams.set(key, value);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.locator('#solo')).toBeEnabled({ timeout: 60_000 });

    // A physical click is part of the contract: Web Audio unlock behavior must
    // be exercised rather than bypassed through the debug API.
    await page.locator('#solo').click();
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 90_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));

    const samples: Array<{
      elapsedMs: number;
      frameCount: number;
      audio: ReturnType<typeof window.__ATOMIC_ACRES_DEBUG__.snapshot>['audio'];
    }> = [];
    const capture = async (elapsedMs: number) => {
      samples.push(await page.evaluate((sampleElapsedMs) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { elapsedMs: sampleElapsedMs, frameCount: snapshot.frameCount, audio: snapshot.audio };
      }, elapsedMs));
    };

    await page.waitForTimeout(2_000);
    await capture(2_000);
    await page.waitForTimeout(30_000);
    await capture(32_000);
    await page.waitForTimeout(28_000);
    await capture(60_000);
    for (const elapsedMs of [61_000, 62_000, 63_000, 64_000, 65_000]) {
      await page.waitForTimeout(1_000);
      await capture(elapsedMs);
    }

    expect(samples.map((sample) => sample.elapsedMs)).toEqual([
      2_000, 32_000, 60_000, 61_000, 62_000, 63_000, 64_000, 65_000,
    ]);
    for (const [index, sample] of samples.entries()) {
      expect(sample.audio.context.source).toMatch(/^(standard|webkit)$/);
      expect(sample.audio.context.state).toMatch(/^(running|suspended)$/);
      expect(sample.audio.ambience).toMatchObject({ continuousSources: 2, arena: arenaId });
      expect(sample.audio.runtime.voices).toBeLessThanOrEqual(sample.audio.runtime.globalCap);
      expect(sample.audio.runtime.spatialChains).toBeLessThanOrEqual(sample.audio.runtime.spatialCap);
      expect(sample.audio.runtime.spatialChains).toBe(2);
      expect(sample.audio.runtime.stolen).toBe(0);
      expect(sample.audio.runtime.dropped).toBe(0);
      expect(sample.audio.minigunDrive.active).toBe(false);
      expect(sample.audio.support.chopperRotorActive).toBe(false);
      expect(sample.audio.outputProbe).toMatchObject({
        available: true,
        sampleRate: expect.any(Number),
        fftSize: 2_048,
        suspiciousBroadbandHiss: false,
      });
      expect(sample.audio.outputProbe.sampleRate).toBeGreaterThanOrEqual(8_000);
      expect(sample.audio.outputProbe.rms).toBeGreaterThan(0);
      expect(sample.audio.outputProbe.peak).toBeGreaterThanOrEqual(sample.audio.outputProbe.rms);
      expect(sample.audio.outputProbe.spectralFlatness).toBeLessThan(0.5);
      expect(sample.audio.outputProbe.highFrequencyEnergyRatio).toBeLessThan(0.18);
      for (const bus of Object.values(sample.audio.buses)) {
        expect(Number.isFinite(bus.effectiveGain)).toBe(true);
        expect(bus.effectiveGain).toBeGreaterThanOrEqual(0);
        expect(bus.effectiveGain).toBeLessThanOrEqual(1);
      }
      if (index > 0) expect(sample.frameCount).toBeGreaterThan(samples[index - 1]!.frameCount);
    }
    expect(samples.every((sample) => sample.audio.ambience.continuousSources === 2)).toBe(true);
    expect(samples.every((sample) => sample.audio.runtime.spatialChains === 2)).toBe(true);

    const clientRuntimeLog = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]'); }
      catch { return ['invalid-client-runtime-log-json']; }
    });
    expect(clientRuntimeLog).toEqual([]);
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);

    const outputDirectory = resolve(process.cwd(), 'artifacts/pass66/audio-long-run');
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, `${arenaId}-${testInfo.project.name}.json`), `${JSON.stringify({
      schemaVersion: 3,
      status: 'PASS',
      sourceSha: expectedSourceSha,
      servedCandidate,
      arenaId,
      browserName: testInfo.project.name,
      browserVersion: page.context().browser()?.version() ?? null,
      physicalAudioUnlock: true,
      durationMs: 65_000,
      samples,
      clientRuntimeLog,
      faults,
    }, null, 2)}\n`, 'utf8');
  });
}
