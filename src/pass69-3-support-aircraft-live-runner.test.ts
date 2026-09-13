import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const ownerGraph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[]; evidenceKinds: string[]; visualArtifactPaths?: string[] }>;
  feedbackNodes: Array<{ id: string; verification: { testRefs: string[] } }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-support-aircraft-live.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass65-support-vehicle-assets.spec.ts', 'utf8');
const presentation = readFileSync('src/killstreak-presentation.ts', 'utf8');
const legacyMain = readFileSync('src/legacy-main.ts', 'utf8');

describe('Pass 69.3 clean exact-SHA support-aircraft live matrix', () => {
  it('adds installed-Edge WebGL2 and native-WebGPU lanes without replacing the retained static asset gate', () => {
    expect(packageJson.scripts['qa:pass65:support-vehicles'])
      .toBe('node scripts/qa/verify-pass65-support-vehicle-production.mjs');
    expect(packageJson.scripts['qa:pass69-3:support-aircraft:edge-webgl2'])
      .toBe('node scripts/qa/run-pass69-3-support-aircraft-live.mjs edge-webgl2');
    expect(packageJson.scripts['qa:pass69-3:support-aircraft:edge-webgpu'])
      .toBe('node scripts/qa/run-pass69-3-support-aircraft-live.mjs edge-webgpu');
    expect(packageJson.scripts['qa:pass69-3:support-aircraft'])
      .toBe('npm run qa:pass69-3:support-aircraft:edge-webgl2 && npm run qa:pass69-3:support-aircraft:edge-webgpu');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4561' })",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4562' })",
      "['status', '--porcelain', '--untracked-files=all']",
      'run-playwright-with-topology.mjs',
      'tests/e2e/pass65-support-vehicle-assets.spec.ts',
      "QA_INSTALLED_EDGE: '1'",
      'QA_PREVIEW_PORT: target.port',
      "PASS69_3_SUPPORT_AIRCRAFT_RENDER_PROFILE: 'blender'",
      "PASS69_3_SUPPORT_AIRCRAFT_LIVE_ONLY: '1'",
      "!key.toUpperCase().startsWith('VITE_')",
      'endingSha !== sourceSha || sourceStatus()',
    ]) expect(runner).toContain(token);
    expect(runner).not.toContain('process.env.QA_PREVIEW_PORT ??');
  });

  it('parameterizes the existing served test and binds exact source, tree, browser and hardware renderer identity', () => {
    for (const token of [
      "process.env.PASS69_3_SUPPORT_AIRCRAFT_RENDERER ?? 'webgl2'",
      "process.env.PASS69_3_SUPPORT_AIRCRAFT_RENDER_PROFILE ?? 'compat'",
      "renderer === 'webgpu' ? '&requireWebGPU=1' : ''",
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "requestedBackend: renderer",
      "actualBackend: renderer",
      "deviceLost: false",
      "uncapturedErrors: 0",
      "adapterClass: 'GPUAdapter'",
      "deviceClass: 'GPUDevice'",
      "adapterClass: 'WebGL2RenderingContext'",
      "lost: false, losses: 0, restorations: 0",
      "channel: 'msedge'",
      '/Edg\\//u',
      "softwareAdapter, `${label}: hardware adapter`).toBe(false)",
      "sourceSha,",
      'servedCandidate.treeSha256',
      'servedCandidate.exactRootFileCount',
    ]) expect(spec).toContain(token);
    for (const token of [
      'runtime.softwareAdapter === false',
      'runtime.deviceLost === false',
      'runtime.uncapturedErrors === 0',
      "receipt.browser?.channel !== 'msedge'",
      "receipt.servedCandidate.sourceSha !== sourceSha",
      'contextLifecycle.losses === 0',
      'webgl.unmaskedRenderer === runtime?.adapterLabel',
    ]) expect(runner).toContain(token);
  });

  it('proves all three live LODs for both authored aircraft and hashes renderer-separated captures', () => {
    expect(spec).toContain("Object.freeze({ lodIndex: 0, distanceM: 40, label: 'near' })");
    expect(spec).toContain("Object.freeze({ lodIndex: 1, distanceM: 120, label: 'mid' })");
    expect(spec).toContain("Object.freeze({ lodIndex: 2, distanceM: 220, label: 'far' })");
    expect(spec).toContain("...await captureLiveAircraftLods(page, testInfo, 'care')");
    expect(spec).toContain("...await captureLiveAircraftLods(page, testInfo, 'carpet')");
    expect(spec).toContain('setCaptureCameraFarPlane(360)');
    expect(spec).toContain('setCaptureCameraFarPlane(null)');
    expect(spec).toContain("presentationSource === 'project-original-blender-glb'");
    expect(spec).toContain("detail.activeLodIndex === expectedLod");
    expect(spec).toContain("detail.activeAircraftWing?.contract === 'visible-rendered-wing-span-v1'");
    expect(spec).toContain('detail.activeAircraftWing?.passed === true');
    expect(spec).toContain('sha256: sha256(screenshot)');
    expect(spec).toContain('resolve(supportAircraftArtifactBase, renderer)');
    for (const token of [
      'activeLodIndex: number | null',
      'activeLodName: string | null',
      'activeLodAsset: string | null',
      'activeAircraftWing: SupportAircraftWingVisibility | null',
      'child instanceof THREE.LOD',
      'authoredLod.getCurrentLevel()',
      'authoredLod.levels[currentLevel]?.object.visible === true',
    ]) expect(presentation).toContain(token);
    expect(legacyMain).toContain('setCaptureCameraFarPlane: (far: number | null) => void;');
    expect(legacyMain).toContain('const arenaFarPlane = sharedWaterBodyForArena(selectedArena.id) ? 1_400 : 180;');
    expect(legacyMain).toContain("THREE.MathUtils.clamp(far!, camera.near + 1, 2_000)");
    expect(runner).toContain('receipt.lodCaptures.length === expectedCaptures.length');
    expect(runner).toContain('statSync(screenshotFile).size > 10_000');
    expect(runner).toContain('sha256(screenshotFile) === capture.screenshot.sha256');
    expect(runner).toContain('new Set(receipt.lodCaptures.map((capture) => capture.screenshot.sha256)).size === expectedCaptures.length');
    expect(runner).toContain("sameArray(liveKeys, ['care-aircraft', 'carpet-aircraft'])");
    expect(runner).toContain("['care', 'carpet'].every((family)");
  });

  it('registers one canonical browser evidence gate directly on HF-223', () => {
    const testEntry = ownerGraph.testCatalog.find((entry) => entry.id === 'T-PASS69-3-SUPPORT-AIRCRAFT-LIVE');
    expect(testEntry).toEqual({
      id: 'T-PASS69-3-SUPPORT-AIRCRAFT-LIVE',
      command: 'npm run qa:pass69-3:support-aircraft',
      paths: [
        'package.json',
        'scripts/qa/run-pass69-3-support-aircraft-live.mjs',
        'src/killstreak-presentation.ts',
        'src/legacy-main.ts',
        'src/pass69-3-support-aircraft-live-runner.test.ts',
        'tests/e2e/pass65-support-vehicle-assets.spec.ts',
      ],
      evidenceKinds: ['browser', 'visual'],
      visualArtifactPaths: ['artifacts/pass69-3/support-aircraft-live'],
    });
    expect(ownerGraph.feedbackNodes.find((entry) => entry.id === 'HF-223')?.verification.testRefs)
      .toContain('T-PASS69-3-SUPPORT-AIRCRAFT-LIVE');
  });
});
