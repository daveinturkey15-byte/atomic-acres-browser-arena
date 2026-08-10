import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const graph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[]; evidenceKinds: string[]; visualArtifactPaths?: string[] }>;
  feedbackNodes: Array<{ id: string; verification: { coverage: string; testRefs: string[]; artifactRefs: string[] } }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-rigged-bot-live.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass69-3-rigged-bot-live.spec.ts', 'utf8');
const operator = readFileSync('src/operator-model.ts', 'utf8');
const legacy = readFileSync('src/legacy-main.ts', 'utf8');
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

  it('uses the real authored GLB and rejects named-but-unskinned or geometrically T-shaped chains', () => {
    for (const token of [
      "OPERATOR_SOURCE = 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative'",
      "OPERATOR_ASSET = './assets/original/models/operators/pass65-third-person-operator-lod0.glb'",
      "sourceBone: 'UpperArm.L', bone: 'UpperArmL', minimumBindRadians: 0.5",
      "sourceBone: 'LowerArm.L', bone: 'LowerArmL', minimumBindRadians: 0.15",
      "sourceBone: 'Wrist.L', bone: 'WristL', minimumBindRadians: 0.05",
      "sourceBone: 'UpperArm.R', bone: 'UpperArmR', minimumBindRadians: 0.5",
      "sourceBone: 'LowerArm.R', bone: 'LowerArmR', minimumBindRadians: 0.15",
      "sourceBone: 'Wrist.R', bone: 'WristR', minimumBindRadians: 0.05",
      "sourceBone: 'Middle2.L', bone: 'Middle2L'",
      "sourceBone: 'Ring2.L', bone: 'Ring2L'",
      "sourceBone: 'Middle2.R', bone: 'Middle2R'",
      "sourceBone: 'Ring2.R', bone: 'Ring2R'",
      "activeClip: 'Walk'",
      'bone.bindQuaternionDeltaRadians',
      'model.armPose.bones',
      'model.handPose.bones',
      'chain.directHierarchy',
      'observed.shoulderToWristVerticalDrop',
      'observed.shoulderToWristOutwardReachRatio',
      'observed.elbowFlexRadians',
      'movingChains',
    ]) expect(spec).toContain(token);
    expect(spec).not.toContain('0.005');
    expect(runner).not.toContain('0.005');
    expect(operator).toContain("contract: 'source-glb-skinned-anti-t-arm-chain-v2'");
    expect(operator).toContain("contract: 'source-glb-animated-middle-ring-finger-descendants-v1'");
    expect(operator).toContain("reference: 'authored-glb-local-transform-before-animation'");
    expect(operator).toContain('mesh.skeleton.bones.includes(bone)');
    expect(operator).toContain('descendantPath(entry.bone, wrist)');
    expect(operator).toContain('antiTPoseGeometry: directHierarchy === true');
    expect(operator).toContain('bindQuaternionDeltaRadians');
    expect(operator).toContain('armBindPose');
    expect(operator).toContain('handBindPose');
    expect(dummyUnit).toContain("['UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR']");
    expect(dummyUnit).toContain('expect(posedBones).toHaveLength(6)');
    expect(dummyUnit).toContain("expect(handPose.bones.map(({ bone }) => bone)).toEqual(['Middle2L', 'Ring2L', 'Middle2R', 'Ring2R'])");
  });

  it('covers an armed live combat bot and all four explicitly unarmed moving test-bay dummies', () => {
    for (const token of [
      "api.setBotPresentation('stand', 1.2, 'carbine')",
      'grip?.bothHandsConnected === true',
      'grip.elbowTorsoOutward >= grip.minimumOutwardClearance',
      'grip.dominantGrip.elbowTorsoOutward >= grip.dominantGrip.minimumOutwardClearance',
      'weaponLocalBounds: { containsTarget: true }',
      "weapon: armedFirst.weapon",
      'actor.armed === false',
      'model.weaponChildren === 0',
      'model.weaponMount === null',
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
    const botSnapshot = legacy.slice(legacy.indexOf('bots: [...bots.values()].map((bot) => {'), legacy.indexOf('botEscalation:', legacy.indexOf('bots: [...bots.values()].map((bot) => {')));
    expect(botSnapshot.match(/riggedOperatorTelemetry\(bot\.root\)/gu)).toHaveLength(1);
    expect(botSnapshot).toContain('presentationReady: operatorModel !== null');
  });

  it('hashes bounded live actor captures while preserving owner visual review and partial HF-228 status', () => {
    for (const token of [
      "'armed-live-bot-medium'",
      "'armed-live-bot-close'",
      "'gun-range-dummies-medium'",
      '`${dummy.id}-close`',
      'sha256: sha256(screenshot)',
      'rootEffectivelyVisible',
      'effectivelyVisibleSkinnedMeshes',
      'withinRoi',
      'onScreen',
      'captureFraming(',
      "status: 'PENDING_OWNER_INSPECTION'",
      'automatedFramingIsNotVisualAcceptance: true',
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "evidenceScope: 'real-glb-skinned-hierarchy-anti-t-hands-grip-and-live-framing'",
    ]) expect(spec).toContain(token);
    expect(runner).toContain('sha256(path) === record.sha256');
    expect(runner).toContain('framingValid(record.framing, actor, expectedRoi)');
    expect(runner).toContain("receipt.visualReview.status !== 'PENDING_OWNER_INSPECTION'");
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
    expect(hf228?.verification.coverage).toBe('partial');
    expect(hf228?.verification.artifactRefs).toEqual([]);
  });
});
