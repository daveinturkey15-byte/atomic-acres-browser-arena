import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function sourceSlice(source: string, start: string, end: string, fromIndex = 0): string {
  const startIndex = source.indexOf(start, fromIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('allocation-light match admission observation contract', () => {
  it('exposes only authoritative scalar admission state without scene or render telemetry', () => {
    const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const sampler = sourceSlice(source, 'function sampleAdmissionState()', 'function sampleDmrThermalReadiness()');

    expect(sampler).toContain('bootstrapStage,');
    expect(sampler).toContain('gameStarted,');
    expect(sampler).toContain('matchPhase: matchState.phase,');
    expect(sampler).toContain('arenaId: selectedArena.id,');
    expect(sampler).toContain('arenaTransitionPhase,');
    expect(sampler).toContain('presentedGameplayFrame: lastGameplayPresentedFrame,');
    expect(sampler).toContain('matchAdmissionGeneration,');
    expect(sampler).not.toContain('snapshot(');
    expect(sampler).not.toContain('renderRuntime');
    expect(sampler).not.toContain('telemetry(');
    expect(sampler).not.toContain('scene.');
    expect(source).toContain('admissionState: sampleAdmissionState,');
  });

  it('keeps the exact ladder active-phase poll scalar and the frozen timeout intact', () => {
    const source = readFileSync(new URL('../tests/e2e/atomic-acres.spec.ts', import.meta.url), 'utf8');
    const startSolo = sourceSlice(
      source,
      'async function startSolo(page: Page): Promise<void>',
      '// Browser gameplay tests must never read from or write to the production',
    );

    // Pass 68 defers arena construction to deployment admission. The bounded
    // browser gate (hosted CI on SwiftShader) needs up to 60s to complete the
    // deferred arena construction, route markers, and spawn safety commit.
    expect(startSolo).toContain('__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase');
    expect(startSolo).toContain('{ timeout: 60_000 }');
    expect(startSolo).not.toContain('.snapshot(');
    expect(startSolo).not.toContain('.render');
    expect(startSolo).not.toContain('telemetry');
  });

  it('keeps endurance startSolo waits scalar while retaining one-shot health evidence', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-webgpu-endurance.mjs', import.meta.url), 'utf8');
    const mainStart = source.indexOf('api.startSolo();');
    expect(mainStart).toBeGreaterThanOrEqual(0);
    const mainPolls = sourceSlice(source, 'api.startSolo();', 'const admissionHealth', mainStart);
    const visualStart = source.indexOf('api.startSolo();', mainStart + 1);
    expect(visualStart).toBeGreaterThan(mainStart);
    const visualPoll = sourceSlice(source, 'api.startSolo();', 'const visualAdmissionHealth', visualStart);

    expect(mainPolls.match(/page\.waitForFunction/g)).toHaveLength(2);
    expect(mainPolls.match(/\.admissionState\(\)/g)).toHaveLength(2);
    expect(mainPolls).toContain('{ timeout: 15_000 }');
    expect(visualPoll.match(/page\.waitForFunction/g)).toHaveLength(1);
    expect(visualPoll.match(/\.admissionState\(\)/g)).toHaveLength(1);
    expect(visualPoll).toContain('{ timeout: 30_000 }');
    for (const highFrequencyPolls of [mainPolls, visualPoll]) {
      expect(highFrequencyPolls).not.toContain('.snapshot(');
      expect(highFrequencyPolls).not.toContain('.render');
      expect(highFrequencyPolls).not.toContain('.sampleEnduranceHealth(');
    }
    expect(source).toContain('const admissionHealth = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleEnduranceHealth());');
    expect(source).toContain('const visualAdmissionHealth = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleEnduranceHealth());');
  });

  it('starts hardware-WebGL2 admission timing from one trusted physical Solo click and a new match generation', () => {
    const source = readFileSync(new URL('../scripts/qa/verify-pass65-hardware-webgl2-admission.ts', import.meta.url), 'utf8');
    const gameSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const arm = sourceSlice(
      source,
      'target.__PASS65_HARDWARE_WEBGL2_START_WATCH__ = () => {',
      'const beginTrustedAdmissionWatch = () => {',
    );
    const trustedStart = sourceSlice(
      source,
      'const beginTrustedAdmissionWatch = () => {',
      "document.addEventListener('click'",
    );
    const clickCapture = sourceSlice(source, "document.addEventListener('click'", '}, { capture: true });');

    expect(arm).toContain('gate.armedBaselineGeneration = api?.admissionState().matchAdmissionGeneration ?? null;');
    expect(arm).toContain('gate.deploymentStartedAt = null;');
    expect(arm).not.toContain('requestAnimationFrame(');
    expect(trustedStart).toContain('gate.deploymentStartedAt = performance.now();');
    expect(trustedStart).toContain('gate.expectedAdmissionGeneration = gate.armedBaselineGeneration + 1;');
    expect(trustedStart).toContain('state.matchAdmissionGeneration === gate.expectedAdmissionGeneration');
    expect(trustedStart).toContain('readyGeneration === gate.expectedAdmissionGeneration && Number.isFinite(readyAt)');
    expect(trustedStart).toContain('Number.isSafeInteger(readyPresentedGameplayFrame) && readyPresentedGameplayFrame >= 0');
    expect(gameSource).toContain('delete deploymentTransition.dataset.readyGeneration;');
    expect(gameSource).toContain('deploymentTransition.dataset.readyGeneration = String(matchAdmissionGeneration);');
    expect(gameSource).toContain('deploymentTransition.dataset.readyPresentedGameplayFrame = String(lastGameplayPresentedFrame);');
    expect(source).toContain('const expectedAdmissionGeneration = Number(baselines.armedBaselineGeneration) + 1;');
    expect(source).toContain('bootstrap: state.bootstrap,');
    expect(source).toContain('state?.matchAdmissionGeneration !== expectedGeneration');
    expect(source).toContain('gate?.expectedAdmissionGeneration !== expectedGeneration');
    expect(source).toContain('gate?.observedAdmissionGeneration !== expectedGeneration');
    expect(source).toContain("return state.gameStarted && state.matchPhase === 'active'");
    expect(source).toContain("state.arenaTransitionPhase === 'idle' && gate.activeAt !== null;");
    expect(trustedStart).toContain("expectedGenerationActive && state.gameStarted && state.matchPhase === 'active'");
    expect(trustedStart).toContain("state.arenaTransitionPhase === 'idle' && gate.activeAt === null");
    expect(trustedStart).toContain('gate.presentedGameplayFrameAtReady = readyPresentedGameplayFrame;');
    expect(trustedStart).toContain('gate.transitionReadyAt !== null');
    expect(trustedStart).toContain('state.presentedGameplayFrame > gate.presentedGameplayFrameAtReady');
    expect(clickCapture).toContain('event.isTrusted');
    expect(clickCapture).toContain('beginTrustedAdmissionWatch();');
  });
});
