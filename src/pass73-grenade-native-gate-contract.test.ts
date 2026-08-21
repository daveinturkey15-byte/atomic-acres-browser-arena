import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runtimeSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const gateSource = readFileSync(new URL('../tests/e2e/pass73-gameplay-regressions.spec.ts', import.meta.url), 'utf8');

function sourceBlock(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt, `missing source block start: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing source block end: ${end}`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe('Pass 73 native-WebGPU first-grenade gate', () => {
  it('samples a narrow retained-resource seam instead of the allocation-heavy world snapshot', () => {
    const sampler = sourceBlock(
      runtimeSource,
      'function sampleGrenadeColdPathTelemetry()',
      'type DebugPlayerPose',
    );
    for (const token of [
      'grenadeWorldPresentationPool.telemetry()',
      'audio.telemetry().grenadeEffectsPrewarm',
      'grenadeExplosionPresentation.telemetry()',
      'compiledPipelineIds',
      'slowNodeBuilds',
      'softwareAdapter: runtime.softwareAdapter',
      'action: copyGrenadeFirstActionProfile(lastGrenadeFirstActionProfile)',
    ]) expect(sampler).toContain(token);
    expect(sampler).not.toContain('debugWindow.__ATOMIC_ACRES_DEBUG__?.snapshot');
    expect(runtimeSource).toContain(
      'await grenadeWorldPresentationPool.withStagedFirstAcquisitionVocabulary(',
    );
    expect(runtimeSource).toContain("? 'input-response'");
    expect(runtimeSource).toContain(" : 'warmed-live'");
  });

  it('keeps diagnostic collection outside the measured action and waits on the real explosion lifecycle', () => {
    const capture = sourceBlock(
      gateSource,
      'async function captureImmediateGrenadeFrameWindow',
      "test.describe('Pass 73 gameplay regression behavior'",
    );
    expect(capture).not.toContain('.snapshot()');
    expect(capture.indexOf('const telemetryBefore = api.sampleGrenadeColdPathTelemetry();'))
      .toBeLessThan(capture.indexOf('requestAnimationFrame((actionFrameAt)'));
    expect(capture.indexOf('observer?.disconnect();'))
      .toBeLessThan(capture.indexOf('const telemetryAfter = api.sampleGrenadeColdPathTelemetry();'));
    expect(gateSource).not.toContain('waitForTimeout(3_000)');
    expect(gateSource).toContain('telemetry.explosion.total >= 1');
    expect(gateSource).toContain('(telemetry.explosion.lastExplosionAgeMs ?? 0) >= 250');
  });

  it('retains strict native-backend, frame, long-task and resource-stability assertions', () => {
    for (const token of [
      "test.skip(process.env.PASS73_NATIVE_WEBGPU !== '1'",
      "actualBackend: 'webgpu'",
      'softwareAdapter: false',
      'expect(first.maximumGapMs, evidence).toBeLessThan(40)',
      'expect(first.longTasks, evidence).toEqual([])',
      'expect(second.longTasks, evidence).toEqual([])',
      'expect(first.resourceLoads, evidence).toEqual([])',
      'expect(second.resourceLoads, evidence).toEqual([])',
      '.toEqual(sample.telemetryBefore.render.compiledPipelineIds)',
      '.toEqual(sample.telemetryBefore.render.slowNodeBuilds)',
      'expect(sample.telemetryAfter.pool.total, evidence).toBe(sample.telemetryBefore.pool.total)',
      'uncapturedErrors: 0',
      'expect(sample.telemetryAfter.render.presentation.completionFailures, evidence).toBe(0)',
    ]) expect(gateSource).toContain(token);
  });
});
