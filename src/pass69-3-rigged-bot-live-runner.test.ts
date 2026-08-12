import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, Record<string, any>>;
};
const graph = JSON.parse(readFileSync('docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json', 'utf8')) as {
  testCatalog: Array<{ id: string; command: string; paths: string[]; evidenceKinds: string[]; visualArtifactPaths?: string[] }>;
  feedbackNodes: Array<{ id: string; verification: { coverage: string; testRefs: string[]; artifactRefs: string[] } }>;
};
const runner = readFileSync('scripts/qa/run-pass69-3-rigged-bot-live.mjs', 'utf8');
const rasterProofHelper = readFileSync('scripts/qa/rigged-rgb-raster-proof.mjs', 'utf8');
const spec = readFileSync('tests/e2e/pass69-3-rigged-bot-live.spec.ts', 'utf8');
const operator = readFileSync('src/operator-model.ts', 'utf8');
const operatorUnit = readFileSync('src/operator-model.test.ts', 'utf8');
const artKit = readFileSync('src/art-kit.ts', 'utf8');
const artKitTest = readFileSync('src/art-kit.test.ts', 'utf8');
const legacy = readFileSync('src/legacy-main.ts', 'utf8');
const dummyUnit = readFileSync('src/additional-maps-rigged-dummy.test.ts', 'utf8');
const handEvidence = readFileSync('src/rigged-hand-evidence.ts', 'utf8');
const handOcclusion = readFileSync('src/rigged-evidence-occlusion.ts', 'utf8');
const gitignore = readFileSync('.gitignore', 'utf8');

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
      "receipt.browser?.channel === 'msedge'",
      'endingSha !== sourceSha || sourceStatus()',
    ]) expect(runner).toContain(token);
  });

  it('source-freezes the exact direct Sharp decoder and independent RGB proof helper', () => {
    expect(packageJson.devDependencies.sharp).toBe('0.34.5');
    expect(packageLock.packages[''].devDependencies.sharp).toBe('0.34.5');
    expect(packageLock.packages['node_modules/sharp']).toMatchObject({
      version: '0.34.5',
      resolved: 'https://registry.npmjs.org/sharp/-/sharp-0.34.5.tgz',
      integrity: 'sha512-Ou9I5Ft9WNcCbXrU9cMgPBcCK8LiwLqcbywW3t4oDV37n1pzpuNLsYiAV8eODnjbtQlSDwZ2cUEeQz4E54Hltg==',
      dev: true,
    });
    expect(runner).toContain("from './rigged-rgb-raster-proof.mjs'");
    expect(rasterProofHelper).toContain("import sharp from 'sharp'");
    expect(rasterProofHelper).toContain('export async function recomputeProductionRgbRasterProof');
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
    expect(operator).toContain("contract: 'rendered-joints0-weights0-influence-v2'");
    expect(operator).toContain('bone: bone.name');
    expect(operator).toContain('boneUuid: bone.uuid');
    expect(operator).toContain('meshUuid: mesh.uuid');
    expect(operator).toContain('geometryUuid: mesh.geometry.uuid');
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
    expect(artKit).toContain('RIGGED_CARBINE_SECOND_PHALANX_BIND_DELTA_FLOOR_RADIANS = Object.freeze({');
    for (const productFloor of ['thumb: 0.04', 'index: 0.23', 'middle: 0.21', 'ring: 0.25', 'pinky: 0.38']) {
      expect(artKit).toContain(productFloor);
      expect(runner).toContain(productFloor);
    }
    expect(artKit).toContain('enforceRiggedOperatorHandBindDeltaFloor(');
    expect(artKit).toContain("contract: 'pass65-evaluated-per-digit-grip-curl-v3'");
    expect(artKit).toContain('bindFloors,');
    expect(operator).toContain("contract: 'post-mixer-authored-bind-relative-hand-floor-v1'");
    expect(operator).toContain("allocationContract: 'persistent-per-rendered-hand-bone-v1'");
    expect(runner).toContain("floor?.allocationContract === 'persistent-per-rendered-hand-bone-v1'");
    expect(runner).toContain("add('generation', Number.isInteger(floor?.generation) && floor.generation >= 1)");
    expect(runner).toContain("add('bind-floors-count', Array.isArray(curl?.bindFloors)");
    expect(runner).toContain("'shortest-bind-relative-aligned-to-previous'");
    expect(runner).not.toContain("'shortest-bind-relative-aligned-to-authored-fallback'");
    expect(runner).toContain('canonicalBindRelativePose(');
    expect(runner).toContain('multiplyQuaternions(');
    expect(runner).toContain('axisAngleQuaternion(floor.appliedAxis, floor.floorTargetRelativeAngleRadians)');
    expect(runner).toContain('expectedRenderedCorrectionRadians');
    expect(runner).toContain('carbineSecondPhalanxFallbackAxis[index]');
    expect(runner).not.toContain('close(vectorLength(floor.beforeLocalQuaternion), 1, 1e-7)');
    expect(runner).not.toContain('close(vectorLength(floor.afterLocalQuaternion), 1, 1e-7)');
    expect(runner).toContain('close(vectorLength(floor.beforeLocalQuaternion), 1, 1e-5)');
    expect(runner).toContain('close(vectorLength(floor.afterLocalQuaternion), 1, 1e-5)');
    expect(runner).toContain('finite non-unit animation quaternion uses normalized orientation validation');
    expect(runner).toContain('fingerCurlValidationFailures(');
    expect(runner).toContain("fingerCurl.left.thumb.Thumb2L.generation");
    expect(runner).toContain("'INVALID-diagnostics'");
    expect(runner).toContain('copyFileSync(sourcePath, diagnosticPath, fsConstants.COPYFILE_EXCL)');
    expect(runner).toContain('persistedSha256 !== receiptSha256 || !byteIdentical');
    expect(runner).toContain('INVALID, never canonical/publishable');
    expect(runner).toContain('firstDiagnostic.path !== receiptPath');
    expect(runner).toContain('secondDiagnostic.reusedExisting === true');
    expect(runner).toContain('statSync(firstDiagnostic.path).mtimeMs === pinnedMtimeMs');
    expect(runner).toContain('diagnosticDirectoryStat.isSymbolicLink()');
    expect(runner).toContain('rmSync(receiptPath, { force: true })');
    expect(runner).toContain('throw new Error(`${message}${diagnosticSuffix}`)');
    expect(gitignore.split(/\r?\n/u)).toContain('artifacts/');
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
    expect(runner).toContain("id: 'test-dummy-alpha', position: Object.freeze([63, 0, -16]), yaw: -Math.PI / 2");
    expect(runner).toContain("id: 'test-dummy-bravo', position: Object.freeze([72.56, Math.abs(Math.sin(1)) * 0.025, -6]), yaw: -Math.PI / 2");
    expect(runner).toContain("id: 'test-dummy-charlie', position: Object.freeze([72.52, Math.abs(Math.sin(2)) * 0.025, 4]), yaw: Math.PI / 2");
    expect(runner).toContain("id: 'test-dummy-delta', position: Object.freeze([64.88, Math.abs(Math.sin(3)) * 0.025, 14]), yaw: Math.PI / 2");
    expect(runner).toContain('receipt.gunRangeDummies?.entries?.length === expectedDummyIds.length');
    expect(runner).toContain('motionValid(entry?.first, entry?.second, entry?.motion, true)');
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
      '`${actor.id}-close-principal-suppressed`',
      '`${actor.id}-close`',
      'sha256: sha256(screenshot)',
      'rootEffectivelyVisible',
      'effectivelyVisibleSkinnedMeshes',
      'withinRoi',
      'onScreen',
      'captureFraming(',
      'expectedSentinelCount: 16',
      'minimumArmChainPixels: 80',
      'minimumWristFingerPixels: 12',
      'RIGGED_HAND_CAMERA_CONTRACT',
      "status: 'AUTOMATION_PASS_OWNER_PENDING'",
      "status: 'PENDING_OWNER_INSPECTION'",
      'automatedFramingIsNotVisualAcceptance: true',
      'worldLayoutLosDoesNotProveActorSelfOcclusion: true',
      'handSelfOcclusionRayDoesNotReplaceVisualAcceptance: true',
      'screenshotPresentedFrameWithHash(',
      "contract: 'paused-presented-frame-screenshot-v1'",
      "source: 'armed-close-submitted-frame-shoulder-grip-hemisphere-weapon-front-and-rigged-hand-world-transforms'",
      "contract: 'armed-close-submitted-actor-source-v1'",
      'api.setRiggedEvidenceCaptureTargets(targets)',
      'api.setRiggedEvidenceHandCaptureSide(requestedHandSide)',
      'options.principalWrite ?? null',
      'options.handSide ?? null',
      'principalWrite !== null && handSide !== null',
      'capture cannot combine hand self-occlusion and principal-write control',
      'const rasterState = principalWrite === null ? null : {',
      'rasterStateDigests: rasterState === null ? null : rasterStateDigests(',
      'sampleRiggedEvidenceHandSelfOcclusion(',
      'setRiggedEvidenceCaptureTargets([])',
      'awaitRiggedEvidenceCaptureCompletion()',
      'RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.atomic.expectedBotYaw',
      'capturePausedLivePoseAdvance(',
      "contract: 'paused-render-live-pose-advance-v1'",
      'capture revision advances from the sampled prior camera state',
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "evidenceScope: 'weighted-skin-anti-t-five-digit-grip-orientation-fixed-grounded-convergence-los-committed-frame-shoulder-grip-hemisphere-hand-detail-self-occlusion-hand-draw-admission-main-camera-draw-stamps-and-production-rgb-raster-proof'",
      'api.admissionState().presentedGameplayFrame',
      'waitForAtomicPlayerConvergence(',
      'presentedGameplayFrame: stagedAtomic.presentedGameplayFrame',
    ]) expect(spec).toContain(token);
    for (const token of [
      "contract: 'fixed-shoulder-grip-hemisphere-front-oblique-hand-v3'",
      'outsideOffsetM: 0.7',
      'upwardOffsetM: 0.12',
      'fovDegrees: 48',
      'minimumGripHemisphereLateralOffsetM: 0.08',
      'expectedGripHemisphereSigns: Object.freeze({ left: 1 as const, right: -1 as const })',
      'maximumSourceJointDriftM: 0.03',
      'frontObliqueDegrees: 20',
      'noFallback: true',
    ]) expect(handEvidence).toContain(token);
    expect(runner).toContain('sha256(path) === record.sha256');
    expect(runner).toContain('projectWorldToNdc(');
    expect(runner).toContain('framingActorFrameBindingValid(');
    expect(runner).toContain('screenshotFrameBindingValid(');
    expect(runner).toContain('capturePresentationValid(');
    expect(runner).toContain('nonPrincipalRasterStateAbsent(record.presentation)');
    expect(runner).toContain('non-principal capture with stray ${field} must fail');
    expect(runner).toContain('lineOfSightValid(');
    expect(runner).toContain('handSelfOcclusionValid(');
    expect(runner).toContain("contract: 'fixed-shoulder-grip-hemisphere-front-oblique-hand-v3'");
    expect(runner).toContain("contract: 'rigged-main-camera-draw-stamp-v2'");
    expect(runner).toContain("const handDrawAdmissionContract = 'rigged-hand-main-camera-draw-admission-v1'");
    expect(runner).toContain("influenceContract: 'rendered-joints0-weights0-influence-v2'");
    expect(runner).toContain('schemaVersion: 8');
    expect(runner).toContain("contract: 'pass69-3-fixed-rigged-actor-los-fixtures-v8'");
    expect(runner).toContain("receipt.contract === 'atomic-acres/pass69-3-rigged-bot-live@12'");
    expect(spec).toContain('schemaVersion: 12');
    expect(spec).toContain("contract: 'atomic-acres/pass69-3-rigged-bot-live@12'");
    expect(spec).toContain("contract: 'rigged-capture-commit-timeout-diagnostic-v1'");
    expect(spec).toContain("drawScope?: 'full-actor' | 'hand'");
    expect(runner).toContain('deriveExpectedHandCamera(');
    expect(runner).toContain('swapped shoulder basis must fail');
    expect(runner).toContain('weapon front collinear with shoulder lateral must fail without fallback');
    expect(runner).toContain('held-weapon terminal hit must never be accepted');
    expect(runner).toContain('camera-inside opaque geometry must fail');
    expect(runner).toContain('stale sampled self-occlusion frame must fail cached binding');
    expect(runner).toContain('string occluder count must fail');
    expect(runner).toContain('fractional occluder count must fail');
    expect(runner).toContain('held weapon count outside actor subset must fail');
    expect(runner).toContain('zero held weapon occluder count must fail');
    expect(runner).toContain('actor count outside render subset must fail');
    expect(runner).toContain('malformed hit-point vector must fail closed');
    expect(runner).toContain('forged blocker distance must fail');
    expect(runner).toContain('forged blocker target distance must fail');
    expect(runner).toContain('forged raw terminal delta must fail');
    expect(runner).toContain('negative raw hit-point distance must fail');
    expect(runner).toContain('noncanonical attachment terminal hit must fail');
    expect(runner).toContain('requested side and wrist mismatch must fail despite forged true binding claim');
    expect(runner).toContain('exact 0.06m comparison boundary must pass with raw evidence retained');
    expect(runner).toContain('meaningful epsilon beyond 0.06m must fail');
    expect(runner).toContain('terminalBoundaryComparisonM');
    expect(runner).toContain('hitPointBoundaryComparisonM');
    expect(runner).toContain('boundaryUlpAllowanceM');
    expect(runner).toContain('cachedMatches.length !== 1');
    expect(runner).toContain('completion.finalPausedSubmissionSequence !== paused.submissionSequence');
    expect(runner).toContain('completion.observedCompletedSequence >= paused.submissionSequence');
    expect(runner).toContain('screenshots?.medium?.presentation?.committed?.frame');
    expect(runner).toContain('distinctScreenshotHashes(');
    expect(runner).toContain('armed-live-bot-left-hand-close.png');
    expect(runner).toContain('armed-live-bot-right-hand-close.png');
    expect(runner).toContain("add('receipt.visualReview.status', receipt.visualReview?.status === 'PENDING_OWNER_INSPECTION')");
    expect(runner).toContain("const validateReceiptMode = process.argv[2] === '--validate-receipt'");
    expect(runner).toContain('failed predicates: ${failedPredicates.join(\', \')}');
    expect(runner).toContain("failedPredicates: ['receipt.readable']");
    expect(handOcclusion).toContain("contract: 'submitted-frame-hand-self-occlusion-v3'");
    expect(handOcclusion).toContain("RIGGED_EVIDENCE_MAIN_CAMERA_DRAW_CONTRACT = 'rigged-main-camera-draw-stamp-v2'");
    expect(handOcclusion).toContain("RIGGED_EVIDENCE_HAND_DRAW_ADMISSION_CONTRACT = 'rigged-hand-main-camera-draw-admission-v1'");
    expect(handOcclusion).toContain('buildRiggedEvidenceHandDrawAdmission(');
    expect(handOcclusion).toContain('handDrawBoneDescendsFromWrist(');
    expect(handOcclusion).toContain("Reflect.set(candidate, 'boundingSphere', null)");
    expect(handOcclusion).toContain('THREE.InstancedMesh.prototype.raycast.call(candidate, raycaster, intersections)');
    expect(handOcclusion).toContain("Reflect.set(candidate, 'boundingSphere', previousBoundingSphere)");
    expect(handOcclusion).toContain('THREE.BatchedMesh.prototype.raycast.call(candidate, raycaster, intersections)');
    expect(handOcclusion).toContain('canonicalSkinnedMeshes.indexOf(mesh)');
    expect(handOcclusion).toContain('manifestWrist.uuid === requestedWrist.uuid');
    expect(handOcclusion).toContain('faceInfluenceProvenanceValid && handOwnedDominantBoneCount >= 2');
    expect(legacy).toContain('riggedOperatorHandEvidenceIdentity(operatorRoot, side)');
    expect(runner).toContain("'Cube018', 'Cube018_1', 'Cube018_2', 'Swat_Feet'");
    expect(runner).toContain('canonicalOperatorSkinManifestValid');
    expect(runner).toContain('recomputeCanonicalFaceInfluence');
    expect(runner).toContain('committed and paused frames must retain the exact canonical operator object manifest');
    expect(runner).toContain('coherent terminal-radius forgery must fail camera-hit collinearity and segment arithmetic');
    const catalog = graph.testCatalog.find(({ id }) => id === 'T-PASS69-3-RIGGED-DUMMY');
    expect(catalog).toMatchObject({
      command: 'npm run qa:pass69-3:rigged-bot-live',
      evidenceKinds: ['unit', 'browser', 'visual'],
      visualArtifactPaths: ['artifacts/pass69-3/rigged-bot-live'],
    });
    expect(catalog?.paths).toEqual(expect.arrayContaining([
      'package-lock.json',
      'package.json',
      'scripts/qa/rigged-rgb-raster-proof.mjs',
      'scripts/qa/run-pass69-3-rigged-bot-live.mjs',
      'src/art-kit.test.ts',
      'src/art-kit.ts',
      'src/operator-model.ts',
      'src/operator-model.test.ts',
      'src/legacy-main.ts',
      'src/rigged-bot-visual-evidence-contract.ts',
      'src/rigged-bot-visual-evidence-contract.test.ts',
      'src/rigged-evidence-occlusion.ts',
      'src/rigged-evidence-occlusion.test.ts',
      'src/rigged-hand-evidence.ts',
      'src/rigged-hand-evidence.test.ts',
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
      'all ten above-floor rendered phases remain unchanged',
      'finite non-unit animation quaternion uses normalized orientation validation',
      'local animation quaternion norm drift beyond 1e-5 must fail',
      'named predicate diagnostics expose only failed non-sensitive field paths',
      'retired x=0 interior-ramp fixture must fail',
      'a pre-command or command-frame presentation sample must fail convergence',
      'horizontal absolute error at 0.0005m must pass',
      'horizontal absolute error at 0.000501m must fail',
      'vertical absolute error at 0.00225m must pass',
      'vertical absolute error at 0.002251m must fail',
      'depth absolute error at 0.0005m must pass despite representation rounding',
      'absolute error 1e-9m beyond its boundary must fail',
      'warmed grounded y=1.700099m must pass the command-anchored vertical envelope',
      'cold grounded y=1.698398m must pass the command-anchored vertical envelope',
      'wrong grounded hover outside the vertical command envelope must fail',
      'an earlier out-of-envelope sample cannot be hidden by a final in-envelope sample',
      'one player transition above 0.0005m must fail',
      'monotonic in-envelope 0.00049m drift must fail the 0.0005m accepted-window span',
      'a reused presented frame must fail convergence',
      'a reversed presented frame must fail convergence',
      'a strictly increasing WebGPU presentation gap must pass convergence',
      'an exact 50ms convergence window must pass',
      'a convergence window shorter than 50ms must fail',
      'an ungrounded player sample must fail convergence',
      'the later staged player must independently satisfy the horizontal envelope',
      'the later staged player must independently satisfy the vertical envelope',
      'a malformed staged-player vector must fail closed',
      'a malformed per-axis receipt maximum must fail closed',
      'a forged correct-length per-axis receipt maximum must fail recomputation',
      'a forged per-axis span summary must fail recomputation',
      'negative near-zero convergence telemetry must fail closed',
      'negative presented gameplay frames must fail closed',
      'negative observation times must fail closed',
      'the staged player must be sampled after convergence',
      'the staged player must precede the first committed Atomic capture',
      'same-turn placement independently derives the fixed forward root and facing yaw',
      'shifted player with stale nominal bot and derived fields must fail',
      'wrong staged distance must fail',
      'wrong root Y beyond the tight arithmetic epsilon must fail',
      'fallback bearing must fail',
      'wrong placement root yaw must fail',
      'placement whose presented frontier changes during the synchronous task must fail',
      'placement at or before the final convergence frame must fail',
      'malformed placement source vector must fail closed',
      'forged derived placement summary must fail independent recomputation',
      'non-finite derived yaw must fail closed',
      'later bot root mismatch must fail',
      'later bot yaw mismatch must fail',
      'old placement-less fixture fails closed without throwing',
      'receipt schema 11 is explicitly rejected without throwing',
      'previous-axis hemisphere-aligned receipt must pass',
      'forged Y-axis receipt cannot impersonate the canonical X-axis pre-floor pose',
      'exact-bind authored fallback axis must pass',
      'missing one of ten bind-floor receipts must fail',
      'duplicate bind-floor identity must not satisfy another joint',
      'duplicate rendered handPose bone must fail',
      'non-persistent receipt generation must fail',
      'floor above independent evidence but below product floor must fail',
      'floor telemetry must match rendered Pinky2R hand pose',
      'corrected wrist rotation over 0.20 rad must fail',
      'post-overwrite socket cannot impersonate imported authored source',
      'cropped/off-ROI shoulder must fail',
      'offscreen shoulder must fail',
      'sub-80px arm chain must fail',
      'full-body close framing must not impersonate hand-detail magnification',
      'forged offscreen world point with centered claimed NDC must fail',
      'post-render live animation pose cannot impersonate the frozen submitted actor frame',
      'submitted WebGL presentation fixture must pass',
      'missing shipped SkinnedMesh name must fail',
      'extra SkinnedMesh name must fail',
      'duplicate shipped SkinnedMesh name must fail',
      'wrong-frame main-camera stamp must fail',
      'coherent changed main-camera UUID must fail cross-receipt binding',
      'coherent changed gameplay-scene UUID must fail cross-receipt binding',
      'unbalanced main-camera before/after callbacks must fail',
      'missing main-camera callback must fail',
      'detached main-camera draw state must fail',
      'main-camera layer mismatch must fail',
      'offscreen main-camera frustum state must fail',
      'zero main-camera draw range must fail',
      'callback position count must equal canonical geometry',
      'invisible main-camera material must fail',
      'same-scene same-camera override-material pass must fail',
      'malformed Three.js gameplay-scene UUID must fail',
      'zero-count callback group must fail',
      'callback material/group slot mismatch must fail',
      'unpaired callback material/group multiset must fail',
      'before/after outer draw-range drift must fail',
      'duplicate principal material/group invocation must fail',
      'forged padded/shifted/out-of-frame raster ROI must fail',
      'excluded telemetry cache-path counters may differ without changing render-causal state',
      'included target render-causal state digest drift must fail',
      'included non-target render-causal state digest drift must fail',
      'coherent restored depth/stencil write-state drift must fail phase parity',
      'coherent restored material-group and effective draw-range drift must fail phase parity',
      'coherent restored material-slot drift must fail phase parity',
      'full ordered deformed-vertex projection digest drift must fail even inside unchanged extrema',
      'same/stale raster bytes produce zero diff and cannot satisfy proof',
      'one environment RGB pixel outside exact ROI is independently detected',
      'alpha-only change cannot impersonate an RGB raster proof',
      'fresh artifact creation rejects a pre-existing stale path',
      'copied stale PNG is mechanically exposed as zero-diff identical content',
      "{ label: 'near', depth: 0.1, webglZ: -1, webgpuZ: 0 }",
      "{ label: 'interior', depth: 5, webglZ: 0.9610894941634242, webgpuZ: 0.980544747081712 }",
      "{ label: 'far', depth: 180, webglZ: 1, webgpuZ: 1 }",
      'projection must use exact backend-specific NDC depth with identical x/y',
      'a WebGL-Z receipt must fail WebGPU recomputation and a WebGPU-Z receipt must fail WebGL recomputation',
      'same-ID actor-root replacement between committed and paused receipts must fail',
      'same-ID resolved operator-root swap between committed and paused receipts must fail',
      'same-root SkinnedMesh replacement between committed and paused receipts must fail',
      'same-mesh material-slot replacement between committed and paused receipts must fail',
      'completion covering only the earlier committed WebGPU frame must fail',
      'WebGPU fence completion beyond its paired submission must fail',
      'reused capture-camera revision must fail',
      'reused camera revision in a capture sequence must fail',
      'swapped armed actor identity must fail',
      'inactive or swapped dummy identity must fail',
      'live pose advance while submitted screenshot frame remains frozen must pass',
      'static live pose cannot prove separation from the frozen submitted frame',
      'sampled clear LOS cannot contradict the cached submitted-frame blocker record',
      'screenshot spanning a later gameplay frame must fail',
      'cropped hand sentinel must fail',
      'sub-12px fixed hand span must fail',
      'non-fixed hand camera distance must fail',
      'hand camera source must bind to the armed close submitted frame',
      'partial hand scope must retain the WebGPU completion frontier gate',
      'partial hand scope must reject a stale WebGPU completion fence',
      'hand fixture must retain two draws and seven exact-zero canonical meshes',
      'partial hand receipt must pass only trusted hand scope',
      '2+2 vertices across two admitted draws must satisfy every aggregate hand-bone threshold',
      '2 drawn vertices plus 2 culled vertices must fail the admitted-only hand threshold',
      'zero terminal hand faces cannot vacuously pass draw admission',
      'terminal before/after outer draw-range drift must fail',
      'aggregate thresholds cannot launder a per-mesh count/maximum incoherence',
      'influence bone UUID must bind to the expected canonical skeleton bone',
      'all contributing canonical meshes must resolve the expected bone to one UUID',
      'digit influence must descend from the trusted requested-side wrist',
    ]) expect(runner).toContain(token);

    const lineOfSightSampler = spec.slice(
      spec.indexOf('async function sampleRequiredLineOfSight('),
      spec.indexOf('async function sampleRequiredHandSelfOcclusion('),
    );
    expect(lineOfSightSampler).not.toContain(
      'RIGGED_BOT_VISUAL_EVIDENCE_CONTRACT.presentation.handDrawAdmission.contract',
    );
  });
});
