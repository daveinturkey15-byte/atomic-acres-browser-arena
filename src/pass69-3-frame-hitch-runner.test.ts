import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const ownerGraph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[] }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-frame-hitch-matrix.mjs', 'utf8');
const helper = readFileSync('tests/e2e/pass69-3-frame-hitch-evidence.ts', 'utf8');
const glassSpec = readFileSync('tests/e2e/pass69-3-glass-m14-frame-hitch.spec.ts', 'utf8');
const specialSpec = readFileSync('tests/e2e/pass69-3-special-weapon-frame-hitch.spec.ts', 'utf8');

describe('Pass 69.3 clean exact-SHA frame-hitch matrix', () => {
  it('exposes one installed-Edge target per hardware renderer and a serial matrix', () => {
    expect(packageJson.scripts['qa:pass69-3:frame-hitch:edge-webgl2'])
      .toBe('node scripts/qa/run-pass69-3-frame-hitch-matrix.mjs edge-webgl2');
    expect(packageJson.scripts['qa:pass69-3:frame-hitch:edge-webgpu'])
      .toBe('node scripts/qa/run-pass69-3-frame-hitch-matrix.mjs edge-webgpu');
    expect(packageJson.scripts['qa:pass69-3:frame-hitch'])
      .toBe('npm run qa:pass69-3:frame-hitch:edge-webgl2 && npm run qa:pass69-3:frame-hitch:edge-webgpu');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4551' })",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4552' })",
      "['status', '--porcelain', '--untracked-files=all']",
      "QA_INSTALLED_EDGE: '1'",
      'QA_PREVIEW_PORT: target.port',
      "PASS69_3_FRAME_HITCH_RENDER_PROFILE: 'blender'",
      "'--workers=1'",
      "'--retries=0'",
      'run-playwright-with-topology.mjs',
      'tests/e2e/pass69-3-glass-m14-frame-hitch.spec.ts',
      'tests/e2e/pass69-3-special-weapon-frame-hitch.spec.ts',
      "endingSha !== sourceSha || sourceStatus()",
    ]) expect(runner).toContain(token);
    expect(runner).not.toContain('process.env.QA_PREVIEW_PORT ??');
    for (const id of ['T-PASS69-3-GLASS-M14-HITCH', 'T-PASS69-3-FLAME-FLARE-HITCH']) {
      const entry = ownerGraph.testCatalog.find((candidate) => candidate.id === id);
      expect(entry?.command).toBe('npm run qa:pass69-3:frame-hitch');
      expect(entry?.paths).toEqual(expect.arrayContaining([
        'scripts/qa/run-pass69-3-frame-hitch-matrix.mjs',
        'src/pass69-3-frame-hitch-runner.test.ts',
        'tests/e2e/pass69-3-frame-hitch-evidence.ts',
      ]));
    }
  });

  it('requires exact native renderer, hardware adapter, zero loss/errors and served source provenance', () => {
    for (const token of [
      'runtime.softwareAdapter !== false',
      "runtime.adapterClass === 'GPUAdapter'",
      "runtime.deviceClass === 'GPUDevice'",
      "runtime.presentation?.status === 'healthy'",
      "runtime.adapterClass === 'WebGL2RenderingContext'",
      "runtime.presentation?.status === 'synchronous'",
      "contextLifecycle?.lost === false",
      'contextLifecycle.losses === 0',
      'contextLifecycle.restorations === 0',
      'webgl.unmaskedRenderer === runtime.adapterLabel',
      "receipt.browser?.channel === 'msedge'",
      "receipt.servedCandidate.sourceSha === sourceSha",
      "!key.toUpperCase().startsWith('VITE_')",
    ]) expect(runner).toContain(token);
    expect(helper).toContain("const requireWebGpu = frameHitchRenderer === 'webgpu' ? '&requireWebGPU=1' : ''");
    expect(helper).toContain("expectedTarget !== expectedTargetForRenderer");
    expect(helper).toContain("frameHitchRenderProfile !== 'blender'");
    expect(helper).toContain("expect(evidence.runtime.softwareAdapter, `${label}: hardware adapter`).toBe(false)");
  });

  it('keeps AtomicSignal enabled for glass/M14 while retaining the special-weapon isolation route', () => {
    expect(helper).toContain("options.signal === false ? '&signal=off' : ''");
    expect(glassSpec).toContain("frameHitchRoute('atomic-acres', 'pass69-3-glass-m14-hitch-gate')");
    expect(glassSpec).not.toContain('signal: false');
    expect(specialSpec).toContain("frameHitchRoute('gun-range', seed, { signal: false })");
  });

  it('retains and independently validates every absolute and relative freeze threshold', () => {
    for (const spec of [glassSpec, specialSpec]) {
      expect(spec).toContain('const MAX_EVENT_TO_PRESENTED_FRAME_MS = 120;');
      expect(spec).toContain('const MAX_SYNCHRONOUS_ACTION_MS = 50;');
    }
    expect(glassSpec).toContain('baseline.eventToPresentedFrameMs * 4 + 40');
    expect(glassSpec).toContain('const MAX_M14_TRANSITION_READY_MS = 5_000;');
    expect(glassSpec).toContain('transition.maximumAnimationFrameGapMs');
    expect(specialSpec).toContain('baseline.p95Ms * 4 + 40');
    expect(specialSpec).toContain('const MAX_SUSTAINED_PRESENTED_FRAME_GAP_MS = 120;');
    expect(specialSpec).toContain('const MAX_SUSTAINED_P95_MS = 50;');
    for (const token of [
      'thresholds?.maximumEventToPresentedFrameMs === 120',
      'thresholds.maximumSynchronousActionMs === 50',
      'thresholds.maximumSustainedPresentedFrameGapMs === 120',
      'thresholds.maximumSustainedP95Ms === 50',
      'thresholds.maximumRelativeMultiplier === 4',
      'thresholds.maximumRelativeAllowanceMs === 40',
      'receipt.thresholds.maximumM14TransitionReadyMs !== 5_000',
      'probe.maximumAnimationFrameGapMs < 120',
      'probe.eventToPresentedFrameMs < baseline.eventToPresentedFrameMs * 4 + 40',
      'probe.maximumAnimationFrameGapMs < baseline.eventToPresentedFrameMs * 4 + 40',
      'probe.frameWindow.maximumMs < baseline.p95Ms * 4 + 40',
      'evidence.sustained.maximumMs < evidence.baseline.p95Ms * 4 + 40',
      'rounded(percentile(sorted, 0.95))',
      'rounded(sorted[sorted.length - 1])',
    ]) expect(runner).toContain(token);
  });

  it('binds receipts to actual glass breach, held flame, and flare flight-impact-burn telemetry', () => {
    for (const token of [
      "'cold-carbine-empty-sky'",
      "debug.teleportPlayer(x, y, z, snapshot.player.yaw, 1.25)",
      "debug.stageWindow(0, 4)",
      "window.__ATOMIC_ACRES_DEBUG__.stageWindow(1, 4)",
      ').breakableWindows[0].broken',
      ').breakableWindows[1].broken',
      "['fire', 'cold-glass-breach']",
      "['fire', 'warm-glass-breach']",
      "['equip-m14', 'm14-cold-equip']",
      "['ads-on', 'm14-cold-ads-on']",
      'debug.sampleActiveWeaponReadiness()',
      'weapon.ready',
      'debug.sampleWeaponAssetCache().loading',
      'debug.sampleDmrThermalReadiness()',
      'thermal.active',
      'assetCacheLoading === 0',
      'readiness.dmrThermalActive === thermalActive',
      'coldWindowBroken !== true',
      'warmWindowBroken !== true',
    ]) expect(`${glassSpec}\n${runner}`).toContain(token);
    expect(glassSpec.indexOf("m14TransitionToReady(page, 'm14-cold-equip'"))
      .toBeLessThan(glassSpec.indexOf("eventToNextPresentedFrame(page, 'cold-glass-breach'"));
    expect(runner.indexOf("['equip-m14', 'm14-cold-equip']"))
      .toBeLessThan(runner.indexOf("['fire', 'cold-glass-breach']"));
    for (const token of [
      "label: 'flamethrower-held-fire'",
      "await page.mouse.down({ button: 'left' })",
      'probe.emissions >= 8',
      'probe.particlesSpawned === probe.emissions * 4',
      'probe.groundFireActive > 0',
      "coldFireProbeValid(releaseProbe, 'flamethrower-release-clearance')",
      "label: 'flare-gun-impact-and-burn-lifecycle'",
      'effect.spawnCountDelta === 1',
      'effect.impactCountDelta > 0',
      'effect.burnPulseCountDelta > 0',
      'after.flying + after.burning === after.active',
    ]) expect(`${specialSpec}\n${runner}`).toContain(token);
    expect(glassSpec).toContain("writeOfficialFrameHitchReceipt(\n    'glass-m14'");
    expect(specialSpec).toContain("'flamethrower', runtimeBefore, runtimeAfter, thresholds");
    expect(specialSpec).toContain("'flare-gun', runtimeBefore, runtimeAfter, thresholds");
  });
});
