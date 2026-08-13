import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const ARENAS = ['atomic-acres', 'rustworks-1v1', 'skyline-terminal', 'gun-range'] as const;
const requestedArena = process.env.PASS66_AUDIO_ARENA;
const selectedArenas = ARENAS.filter((arenaId) => !requestedArena || requestedArena === arenaId);
const enabled = process.env.PASS66_AUDIO_LONG_RUN === '1';
const expectedSourceSha = process.env.PASS66_AUDIO_SOURCE_SHA ?? '';
const expectedReleasePass = process.env.PASS66_AUDIO_RELEASE_PASS ?? '';

test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'Run through npm run qa:pass66:audio-long-run for fresh exact-SHA evidence.');

for (const arenaId of selectedArenas) {
  test(`${arenaId} keeps the intentional audio graph bounded beyond the reported one-minute hiss point`, async ({ page, request }, testInfo) => {
    test.setTimeout(150_000);
    expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(expectedReleasePass).toMatch(/^PASS [1-9][0-9]*(?:\.[0-9]+)?$/u);
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
      releasePass: expectedReleasePass,
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
    await page.waitForFunction(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (!debug) return false;
      const admission = debug.admissionState();
      return admission.matchPhase === 'active' && admission.presentedGameplayFrame > 2;
    }, undefined, { timeout: 90_000 });
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
      expect(sample.audio.ambience).toMatchObject({ continuousSources: 0, arena: arenaId });
      expect(sample.audio.ambience.transientSources).toBeLessThanOrEqual(1);
      expect(sample.audio.ambience.lastDurationMs).toBeLessThanOrEqual(720);
      expect(sample.audio.runtime.voices).toBeLessThanOrEqual(sample.audio.runtime.globalCap);
      expect(sample.audio.runtime.spatialChains).toBeLessThanOrEqual(sample.audio.runtime.spatialCap);
      expect(sample.audio.runtime.spatialChains).toBeLessThanOrEqual(5);
      expect(sample.audio.runtime.retainedSources).toBe(12);
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
      expect(sample.audio.outputProbe.peak).toBeGreaterThanOrEqual(sample.audio.outputProbe.rms);
      for (const bus of Object.values(sample.audio.buses)) {
        expect(Number.isFinite(bus.effectiveGain)).toBe(true);
        expect(bus.effectiveGain).toBeGreaterThanOrEqual(0);
        expect(bus.effectiveGain).toBeLessThanOrEqual(1);
      }
      if (index > 0) expect(sample.frameCount).toBeGreaterThan(samples[index - 1]!.frameCount);
    }
    expect(samples.every((sample) => sample.audio.ambience.continuousSources === 0)).toBe(true);
    expect(samples.map((sample) => sample.audio.ambience.events))
      .toEqual([...samples.map((sample) => sample.audio.ambience.events)].sort((left, right) => left - right));
    expect(samples.at(-1)!.audio.ambience.events).toBeGreaterThanOrEqual(4);
    // A bounded cue can occupy one analyser window; a recurring tonal carrier
    // cannot appear in consecutive one-second samples after the former hiss point.
    expect(samples.slice(-6).filter((sample) => sample.audio.outputProbe.narrowbandTonePresent))
      .toHaveLength(0);

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
