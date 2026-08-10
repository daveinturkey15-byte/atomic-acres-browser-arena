import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const graph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[]; evidenceKinds: string[]; visualArtifactPaths?: string[] }>;
  feedbackNodes: Array<{ id: string; verification: { testRefs: string[] } }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-rigged-bot-live.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass69-3-rigged-bot-live.spec.ts', 'utf8');
const operator = readFileSync('src/operator-model.ts', 'utf8');
const dummyUnit = readFileSync('src/additional-maps-rigged-dummy.test.ts', 'utf8');

describe('Pass 69.3 real rigged-bot evidence boundary', () => {
  it('owns separate clean-SHA installed-Edge hardware WebGL2 and native-WebGPU lanes', () => {
    expect(packageJson.scripts['qa:pass69-3:rigged-bot-live:edge-webgl2'])
      .toBe('node scripts/qa/run-pass69-3-rigged-bot-live.mjs edge-webgl2');
    expect(packageJson.scripts['qa:pass69-3:rigged-bot-live:edge-webgpu'])
      .toBe('node scripts/qa/run-pass69-3-rigged-bot-live.mjs edge-webgpu');
    expect(packageJson.scripts['qa:pass69-3:rigged-bot-live'])
      .toBe('npm run qa:pass69-3:rigged-bot-live:edge-webgl2 && npm run qa:pass69-3:rigged-bot-live:edge-webgpu');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4561' })",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4562' })",
      "['status', '--porcelain', '--untracked-files=all']",
      "QA_INSTALLED_EDGE: '1'",
      'QA_PREVIEW_PORT: target.port',
      'PASS69_3_RIGGED_BOT_SOURCE_SHA: sourceSha',
      'PASS69_3_RIGGED_BOT_TARGET: targetName',
      "!key.toUpperCase().startsWith('VITE_')",
      'run-playwright-with-topology.mjs',
      'tests/e2e/pass69-3-rigged-bot-live.spec.ts',
      "runtime.softwareAdapter === false",
      "runtime.adapterClass === 'GPUAdapter'",
      "runtime.adapterClass === 'WebGL2RenderingContext'",
      'surface.contextLifecycle.losses === 0',
      "receipt.browser?.channel !== 'msedge'",
      'endingSha !== sourceSha || sourceStatus()',
    ]) expect(runner).toContain(token);
  });

  it('uses the real authored GLB and proves both complete arm chains leave the bind pose', () => {
    for (const token of [
      "OPERATOR_SOURCE = 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative'",
      "OPERATOR_ASSET = './assets/original/models/operators/pass65-third-person-operator-lod0.glb'",
      "MINIMUM_BIND_ROTATION_RADIANS = 0.005",
      "role: 'shoulder', bone: 'UpperArmL'",
      "role: 'elbow', bone: 'LowerArmL'",
      "role: 'wrist-hand', bone: 'WristL'",
      "role: 'shoulder', bone: 'UpperArmR'",
      "role: 'elbow', bone: 'LowerArmR'",
      "role: 'wrist-hand', bone: 'WristR'",
      "activeClip: 'Walk'",
      'bone.bindQuaternionDeltaRadians',
      'model.armPose.bones',
      'movingChains',
    ]) expect(spec).toContain(token);
    expect(operator).toContain("contract: 'source-glb-bind-arm-chain-v1'");
    expect(operator).toContain("reference: 'authored-glb-local-transform-before-animation'");
    expect(operator).toContain('bindQuaternionDeltaRadians');
    expect(operator).toContain('armBindPose');
    expect(dummyUnit).toContain("['UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR']");
    expect(dummyUnit).toContain('expect(posedBones).toHaveLength(6)');
  });

  it('covers an armed live combat bot and all four explicitly unarmed moving test-bay dummies', () => {
    for (const token of [
      "api.setBotPresentation('stand', 1.2, 'carbine')",
      'model?.supportGrip?.bothHandsConnected === true',
      "weapon: armedFirst.weapon",
      'dummy.armed === false',
      'dummy.operatorModel?.weaponChildren === 0',
      'dummy.operatorModel?.weaponMount === null',
      "expect(model.weaponMount, `${label}: no mounted weapon`).toBeNull()",
      "expect(model.supportGrip, `${label}: no fabricated grip telemetry`).toBeNull()",
      "expect(motion.positionM, `${label}: target moves in world`).toBeGreaterThan(0.12)",
    ]) expect(spec).toContain(token);
    expect(runner).toContain('expectedDummyIds = Object.freeze([');
    for (const id of ['test-dummy-alpha', 'test-dummy-bravo', 'test-dummy-charlie', 'test-dummy-delta']) {
      expect(runner).toContain(`'${id}'`);
    }
    expect(runner).toContain('receipt.gunRangeDummies.entries.length === expectedDummyIds.length');
    expect(runner).toContain('motionValid(entry.first, entry.second, entry.motion, true)');
  });

  it('hashes close and medium screenshots and binds the gate directly to HF-228', () => {
    for (const token of [
      "'armed-live-bot-medium'",
      "'armed-live-bot-close'",
      "'gun-range-dummies-medium'",
      '`${dummy.id}-close`',
      'sha256: sha256(screenshot)',
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "evidenceScope: 'real-glb-armed-bot-and-four-unarmed-moving-dummies-arm-chain-pose'",
    ]) expect(spec).toContain(token);
    expect(runner).toContain('sha256(path) === record.sha256');
    const catalog = graph.testCatalog.find(({ id }) => id === 'T-PASS69-3-RIGGED-DUMMY');
    expect(catalog).toMatchObject({
      command: 'npm run qa:pass69-3:rigged-bot-live',
      evidenceKinds: ['unit', 'browser', 'visual'],
      visualArtifactPaths: ['artifacts/pass69-3/rigged-bot-live'],
    });
    expect(catalog?.paths).toEqual(expect.arrayContaining([
      'scripts/qa/run-pass69-3-rigged-bot-live.mjs',
      'src/operator-model.ts',
      'src/legacy-main.ts',
      'src/pass69-3-rigged-bot-live-runner.test.ts',
      'tests/e2e/pass69-3-rigged-bot-live.spec.ts',
    ]));
    const hf228 = graph.feedbackNodes.find(({ id }) => id === 'HF-228');
    expect(hf228?.verification.testRefs).toContain('T-PASS69-3-RIGGED-DUMMY');
  });
});
