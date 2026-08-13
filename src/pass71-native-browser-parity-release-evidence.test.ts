import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = readFileSync('scripts/qa/pass71-native-browser-parity-contract.mjs', 'utf8');
const runner = readFileSync('scripts/qa/run-pass71-native-browser-parity.mjs', 'utf8');
const runtime = readFileSync('src/legacy-main.ts', 'utf8');
const acceptance = readFileSync('scripts/release/acceptance-gate.mjs', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('Pass 71 installed Firefox and Chrome Quality parity evidence', () => {
  it('owns exact staged candidate A, installed signed browsers and two real combat scenes', () => {
    for (const token of [
      "evidenceId: 'HF-311'",
      "kind: 'pass71-firefox-chrome-quality-parity'",
      "sceneModes: Object.freeze(['solo-quality-combat', 'hosted-quality-combat'])",
      "actionTimeline: Object.freeze(['pointer-lock', 'ads-down', 'fire', 'ads-up', 'reload'])",
      'minimumFirefoxMedianFpsRatio: 0.8',
      'maximumFirefoxP95FrameTimeRatio: 1.25',
      'maximumFirefoxMaximumFrameTimeRatio: 1.25',
      'maximumLongTasksPerScene: 0',
      'stableTelemetrySampleCount: 3',
      "sceneStageContract: 'atomic-acres/pass71-native-parity-scene-stage@1'",
      'scenePositionToleranceM: 0.15',
      'maximumSceneSampleDriftM: 0.025',
      'PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS',
    ]) expect(contract).toContain(token);
    for (const token of [
      "if (sourceSha !== expectedSourceSha",
      "VITE_MATCH_BUILD_ID = sourceSha",
      "RELEASE_PASS: 'PASS 71'",
      "readServedCandidate()",
      "requireExecutable([",
      "Get-AuthenticodeSignature",
      "browserName: 'firefox'",
      "chromium.launchPersistentContext",
      "await stageHosted(launched.host, launched.guest)",
      "await adapter.pointerDown(2)",
      "await adapter.pointerClick(canvas.x, canvas.y, 0, 60)",
      "await adapter.keyPress('r')",
      'await adapter.focusAndSize();',
      'const trustedEvents = probe.events.filter',
      'eventTimestampMs: Number(event.timeStamp)',
      'observedAtMs',
      "captureStableTelemetry(adapter, 'before-action')",
      "captureStableTelemetry(adapter, 'after-action')",
      'rendererSamples',
      'assertSceneSamples',
    ]) expect(runner).toContain(token);
  });

  it('retains raw cadence, long-task, allocation, draw, material and synchronous WebGL evidence', () => {
    for (const token of [
      'intervalsMs: raw.intervalsMs',
      'gameFrameToCallbackRatio',
      'longTasks: { entries: raw.longTasks',
      'sampleRendererResidency()',
      'renderInventory(before.audit)',
      'rendererReportedCalls: measured.rendererReportedCalls',
      'status: presentation.status',
      'state.render.runtime.uncapturedErrors',
      'state.render.runtime.deviceLost',
      'pass71NativeBrowserParitySceneSignature(sceneIdentity)',
    ]) expect(runner).toContain(token);
    expect(runtime).toContain('const materialIdentity = (material: THREE.Material): string');
    expect(runtime).toContain('textureIdentity(visual.normalMap)');
    expect(runtime).not.toContain('material.uuid.slice');
  });

  it('captures trusted actions before release and re-focuses every measured host', () => {
    expect(runner).toMatch(/async function auditScene[\s\S]*?await adapter\.focusAndSize\(\);[\s\S]*?const settledAt/u);
    expect(runner).toMatch(/const probe = await adapter\.evaluate[\s\S]*?await adapter\.releaseActions\(\);[\s\S]*?const trustedEvents = probe\.events\.filter/u);
    expect(runner).toMatch(/rendererSamples: samples\.map|const rendererSamples = samples\.map/u);
    expect(contract).toContain("failures.push(`${prefix}:trusted-action-events`)");
    expect(contract).toContain("failures.push(`${prefix}:scene-render-sample-alignment:${phase}`)");
  });

  it('fails closed on source, Quality, identity, scene, action and browser parity drift', () => {
    for (const token of [
      "record.status !== 'passed'",
      "failures.push('exact-source-identity')",
      "failures.push(`${prefix}:installed-browser-identity`)",
      "failures.push(`${prefix}:named-quality-settings`)",
      "failures.push(`${prefix}:deterministic-scene-signature`)",
      "failures.push(`${prefix}:representative-combat-action`)",
      "failures.push(`${prefix}:trusted-action-events`)",
      'stable-renderer-sampling',
      'scene-render-sample-alignment',
      "failures.push(`${prefix}:renderer-allocation-drift`)",
      "failures.push(`${prefix}:material-or-drawable-drift`)",
      "failures.push(`${prefix}:long-task-budget`)",
      "failures.push(`${prefix}:median-fps-ratio`)",
      "failures.push(`${prefix}:p95-frame-time-ratio`)",
      "machine: 'dave-gaming-pc'",
    ]) expect(contract).toContain(token);
  });

  it('exposes the exact native command and registry descriptor', () => {
    expect(packageJson.scripts['qa:pass71:native-browser-parity:contract'])
      .toBe('node --test scripts/qa/pass71-native-browser-parity-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:native-browser-parity'])
      .toContain('run-pass71-native-browser-parity.mjs');
    expect(contract).toContain('PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR');
    expect(contract).toContain('validatePass71NativeBrowserParityEvidence');
    expect(acceptance).toContain('PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR');
    expect(acceptance).toContain('PASS71_NATIVE_BROWSER_PARITY_REGISTRY_ENTRY');
    expect(acceptance).toContain("['HF-311', PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR]");
    expect(acceptance).toContain('for (const [index, record] of pass71NativeRecords.entries())');
  });
});
