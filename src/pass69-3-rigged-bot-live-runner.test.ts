import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const graph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[]; evidenceKinds: string[]; visualArtifactPaths?: string[] }>;
  feedbackNodes: Array<{ id: string; verification: { coverage: string; testRefs: string[]; artifactRefs: string[] } }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-rigged-bot-live.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass69-3-rigged-bot-live.spec.ts', 'utf8');
const operator = readFileSync('src/operator-model.ts', 'utf8');
const operatorUnit = readFileSync('src/operator-model.test.ts', 'utf8');
const artKit = readFileSync('src/art-kit.ts', 'utf8');
const artKitTest = readFileSync('src/art-kit.test.ts', 'utf8');
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
    expect(packageJson.scripts['qa:pass69-3:rigged-bot-contract'])
      .toBe('node scripts/qa/run-pass69-3-rigged-bot-live.mjs --self-test');
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
      "sourceBone: 'Thumb2.L', bone: 'Thumb2L'",
      "sourceBone: 'Index2.L', bone: 'Index2L'",
      "sourceBone: 'Middle2.L', bone: 'Middle2L'",
      "sourceBone: 'Ring2.L', bone: 'Ring2L'",
      "sourceBone: 'Pinky2.L', bone: 'Pinky2L'",
      "sourceBone: 'Thumb2.R', bone: 'Thumb2R'",
      "sourceBone: 'Index2.R', bone: 'Index2R'",
      "sourceBone: 'Middle2.R', bone: 'Middle2R'",
      "sourceBone: 'Ring2.R', bone: 'Ring2R'",
      "sourceBone: 'Pinky2.R', bone: 'Pinky2R'",
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
    expect(operator).toContain("contract: 'source-glb-weighted-five-digit-sentinels-v2'");
    expect(operator).toContain("contract: 'rendered-joints0-weights0-influence-v1'");
    expect(operator).toContain('minimumInfluencedVertices: 4');
    expect(operator).toContain('minimumMaximumNormalizedWeight: 0.2');
    expect(operator).toContain('minimumElbowFlexRadians: 0.3');
    expect(operator).toContain('UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS = 0.075');
    expect(operator).toContain('if (beforeBindDeltaRadians < UNARMED_WRIST_BIND_DELTA_FLOOR_RADIANS)');
    expect(operator).toContain('preservedAnimatedAxis: intervened && !usedMirroredFallbackAxis');
    expect(operator).toContain("contract: 'static-rendered-influence-cache-v1'");
    expect(operator).toContain('bufferAttributeVersion(weights)');
    expect(operator).toContain("reference: 'authored-glb-local-transform-before-animation'");
    expect(operator).toContain('mesh.skeleton.bones.includes(bone)');
    expect(operator).toContain('descendantPath(entry.bone, wrist)');
    expect(operator).toContain('antiTPoseGeometry: directHierarchy === true');
    expect(operator).toContain('bindQuaternionDeltaRadians');
    expect(operator).toContain('armBindPose');
    expect(operator).toContain('handBindPose');
    expect(dummyUnit).toContain("['UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR']");
    expect(dummyUnit).toContain('expect(posedBones).toHaveLength(6)');
    expect(dummyUnit).toContain("'Thumb2L', 'Index2L', 'Middle2L', 'Ring2L', 'Pinky2L'");
    expect(dummyUnit).toContain('setFromAxisAngle(aboveFloorAxis, 0.12)');
    expect(dummyUnit).toContain('angleTo(aboveFloorQuaternion)).toBeLessThan(1e-9)');
    expect(dummyUnit).toContain('usedMirroredFallbackAxis: true');
    expect(dummyUnit).toContain('zeroing every UpperArmL WEIGHTS_0 contribution');
    expect(dummyUnit).toContain('skinWeight.setXYZW');
    expect(dummyUnit).toContain('allHaveRenderedVertexInfluence).toBe(false)');
  });

  it('covers an armed live combat bot and all four explicitly unarmed moving test-bay dummies', () => {
    for (const token of [
      "api.setBotPresentation('stand', 1.2, 'carbine')",
      'grip?.bothHandsConnected === true',
      'grip.elbowTorsoOutward >= grip.minimumOutwardClearance',
      'grip.dominantGrip.elbowTorsoOutward >= grip.dominantGrip.minimumOutwardClearance',
      'sourceTransformValid: true',
      "liveTargetContract: 'runtime-calibrated-from-authored-source-v1'",
      'wristOrientation: { referenceAvailable: true',
      "weapon: armedFirst.weapon",
      'actor.armed === false',
      'model.weaponChildren === 0',
      'model.weaponMount === null',
      "expect(model.weaponMount, `${label}: no mounted weapon`).toBeNull()",
      "expect(model.supportGrip, `${label}: no fabricated grip telemetry`).toBeNull()",
      "expect(motion.positionM, `${label}: target moves in world`).toBeGreaterThan(0.12)",
    ]) expect(spec).toContain(token);
    expect(artKit).toContain('pass65-carbine-authored-source-plus-runtime-target-v2');
    expect(artKit).toContain('authoredLocalPosition: Object.freeze([-0.10000000149011612, -0.03999999910593033, 0.47999998927116394]');
    expect(artKit).toContain("liveTargetContract: 'runtime-calibrated-from-authored-source-v1'");
    expect(artKit).toContain("calibrationReason: 'third-person-swat-chain-reach-without-unsafe-stretch'");
    expect(artKit).toContain('pinky: -0.76');
    expect(artKit).toContain('right: Object.freeze({ thumb: -0.34, index: -0.46, middle: -0.7, ring: -0.76, pinky: -0.78 })');
    expect(artKit).toContain('applyRiggedCarbineFingerCurlToBone(bone, curlRadians)');
    expect(artKit).toContain('RIGGED_CARBINE_RIGHT_PINKY_BIND_DELTA_FLOOR_RADIANS = 0.38');
    expect(artKit).toContain('enforceRiggedOperatorHandBindDeltaFloor(');
    expect(operator).toContain("contract: 'post-mixer-authored-bind-relative-hand-floor-v1'");
    expect(operator).toContain('floorTargetRelativeAngleRadians');
    expect(operator).toContain('reportedBindDeltaCorrectionRadians');
    expect(operatorUnit).toContain('0.2701489666915341');
    expect(operatorUnit).toContain('0.36981904581827996');
    expect(operatorUnit).toContain('honors the 0.379999/0.38 boundary');
    expect(operatorUnit).toContain('other nine joints');
    expect(artKitTest).toContain('0.2593672251552949');
    expect(artKitTest).toContain('0.3746668889113999');
    expect(artKit).toContain("root.userData.operatorUnarmedHandPose = rig.weaponId === null");
    expect(artKit.indexOf('const observedImportedSourceLocalPosition = socket.position.toArray()'))
      .toBeLessThan(artKit.indexOf("supportGrip.position.set(...RIGGED_SUPPORT_GRIP_POSITION[weaponId])"));
    expect(spec).not.toContain('weaponLocalBounds');
    expect(runner).not.toContain('weaponLocalBounds');
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
      '`armed-live-bot-${side}-hand-close`',
      "'gun-range-dummies-medium'",
      '`${dummy.id}-close`',
      'sha256: sha256(screenshot)',
      'rootEffectivelyVisible',
      'effectivelyVisibleSkinnedMeshes',
      'withinRoi',
      'onScreen',
      'captureFraming(',
      'expectedSentinelCount: 16',
      'minimumArmChainPixels: 80',
      'minimumWristFingerPixels: 12',
      "contract: 'fixed-horizontal-wrist-from-weapon-center-v1'",
      'outsideOffsetM: 0.7',
      'upwardOffsetM: 0.12',
      'fovDegrees: 48',
      "status: 'AUTOMATION_PASS_OWNER_PENDING'",
      "status: 'PENDING_OWNER_INSPECTION'",
      'automatedFramingIsNotVisualAcceptance: true',
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "evidenceScope: 'weighted-skin-anti-t-five-digit-grip-orientation-full-body-and-fixed-hand-detail-framing'",
    ]) expect(spec).toContain(token);
    expect(runner).toContain('sha256(path) === record.sha256');
    expect(runner).toContain('framingValid(record.framing, actor, expectedRoi, requireJointDetail)');
    expect(runner).toContain('closeJointFramingValid(framing, expectedRoi)');
    expect(runner).toContain('handFramingValid(record.framing, actor, side)');
    expect(runner).toContain('armed-live-bot-left-hand-close.png');
    expect(runner).toContain('armed-live-bot-right-hand-close.png');
    expect(runner).toContain("receipt.visualReview.status !== 'PENDING_OWNER_INSPECTION'");
    const catalog = graph.testCatalog.find(({ id }) => id === 'T-PASS69-3-RIGGED-DUMMY');
    expect(catalog).toMatchObject({
      command: 'npm run qa:pass69-3:rigged-bot-live',
      evidenceKinds: ['unit', 'browser', 'visual'],
      visualArtifactPaths: ['artifacts/pass69-3/rigged-bot-live'],
    });
    expect(catalog?.paths).toEqual(expect.arrayContaining([
      'scripts/qa/run-pass69-3-rigged-bot-live.mjs',
      'src/art-kit.test.ts',
      'src/art-kit.ts',
      'src/operator-model.ts',
      'src/operator-model.test.ts',
      'src/legacy-main.ts',
      'src/pass69-3-rigged-bot-live-runner.test.ts',
      'tests/e2e/pass69-3-rigged-bot-live.spec.ts',
    ]));
    const hf228 = graph.feedbackNodes.find(({ id }) => id === 'HF-228');
    expect(hf228?.verification.testRefs).toContain('T-PASS69-3-RIGGED-DUMMY');
    expect(hf228?.verification.coverage).toBe('partial');
    expect(hf228?.verification.artifactRefs).toEqual([]);
  });

  it('executes adversarial zero-weight, elbow, grip, full-body and fixed-hand mutations', () => {
    const output = execFileSync(process.execPath, ['scripts/qa/run-pass69-3-rigged-bot-live.mjs', '--self-test'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(output).toContain('"pass69_3RiggedBotContractSelfTest":"PASS"');
    for (const token of [
      'zero-weight skeleton membership must fail',
      '0.299 rad elbow flex must fail',
      '0.300 rad elbow flex must pass',
      '0.349 rad pinky bind delta must fail',
      '0.350 rad pinky bind delta must pass',
      '0.379999 rad post-mixer pinky floor must fail',
      '0.380000 rad post-mixer pinky floor must pass',
      'floor telemetry must match rendered Pinky2R hand pose',
      'corrected wrist rotation over 0.20 rad must fail',
      'post-overwrite socket cannot impersonate imported authored source',
      'cropped/off-ROI shoulder must fail',
      'offscreen shoulder must fail',
      'sub-80px arm chain must fail',
      'full-body close framing must not impersonate hand-detail magnification',
      'cropped hand sentinel must fail',
      'sub-12px fixed hand span must fail',
      'non-fixed hand camera distance must fail',
    ]) expect(runner).toContain(token);
  });
});
