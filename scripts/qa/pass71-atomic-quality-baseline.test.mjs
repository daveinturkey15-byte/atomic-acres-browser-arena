import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  extractClassMethod,
  extractConstDeclaration,
  extractFunctionDeclaration,
  glbSceneSignature,
  treeDigest,
  verifyAtomicQualityBaseline,
} from './verify-pass71-atomic-quality-baseline.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const recordPath = join(root, 'baselines', 'pass70', 'atomic-acres-quality.json');

function git(args, cwd = root) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function minimalGlb(materialName) {
  const source = Buffer.from(JSON.stringify({
    asset: { version: '2.0' },
    scenes: [{}],
    nodes: [{ name: 'authored-node', mesh: 0, extras: { atomic_semantic: 'fixture' } }],
    meshes: [{}],
    materials: [{ name: materialName, pbrMetallicRoughness: {} }],
    textures: [],
    images: [],
    bufferViews: [],
  }));
  const paddedLength = Math.ceil(source.length / 4) * 4;
  const output = Buffer.alloc(20 + paddedLength, 0x20);
  output.write('glTF', 0, 'ascii');
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedLength, 12);
  output.write('JSON', 16, 'ascii');
  source.copy(output, 20);
  return output;
}

test('deterministic comparators reject path, byte, declaration, method, function and GLB scene drift', () => {
  const originalTree = treeDigest([{ path: 'asset.bin', bytes: Buffer.from('authored') }]);
  assert.notEqual(originalTree, treeDigest([{ path: 'renamed.bin', bytes: Buffer.from('authored') }]));
  assert.notEqual(originalTree, treeDigest([{ path: 'asset.bin', bytes: Buffer.from('downgraded') }]));

  const source = `function retained() { const brace = "}"; /* { ignored } */ return { quality: true }; }`;
  assert.equal(extractFunctionDeclaration(source, 'retained'), source);
  assert.notEqual(
    extractFunctionDeclaration(source, 'retained'),
    extractFunctionDeclaration(source.replace('quality: true', 'quality: false'), 'retained'),
  );

  const typedSource = `export const CONFIG: Readonly<{ offset: number }> = Object.freeze({ offset: 0.025 });\nexport class Fixture {\n  move(): number { return CONFIG.offset; }\n}`;
  assert.match(extractConstDeclaration(typedSource, 'CONFIG'), /offset: 0\.025/u);
  assert.match(extractClassMethod(typedSource, 'Fixture', 'move'), /return CONFIG\.offset/u);
  assert.notEqual(
    extractConstDeclaration(typedSource, 'CONFIG'),
    extractConstDeclaration(typedSource.replace('0.025', '0.25'), 'CONFIG'),
  );
  assert.notEqual(
    extractClassMethod(typedSource, 'Fixture', 'move'),
    extractClassMethod(typedSource.replace('return CONFIG.offset', 'return 0'), 'Fixture', 'move'),
  );

  assert.notDeepEqual(glbSceneSignature(minimalGlb('authored-material')), glbSceneSignature(minimalGlb('reduced-material')));
});

test('the full verifier fails closed on policy, audit metadata, runtime, texture, LOD, physics, preset and renderer mutations', { timeout: 120_000 }, () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-quality-baseline-'));
  const checkout = join(temporaryRoot, 'checkout');
  const safeTemporaryRoot = resolve(tmpdir());
  assert.ok(resolve(temporaryRoot).startsWith(`${safeTemporaryRoot}\\`) || resolve(temporaryRoot).startsWith(`${safeTemporaryRoot}/`));
  try {
    git(['worktree', 'add', '--detach', checkout, 'HEAD']);
    const baseline = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(baseline.status, 'PASS', baseline.problems.join('\n'));
    assert.equal(baseline.pixelParity.status, 'UNPROVEN');

    const weakenedRecordPath = join(temporaryRoot, 'weakened-record.json');
    const weakenedRecord = JSON.parse(readFileSync(recordPath, 'utf8'));
    weakenedRecord.semanticTokenParity = [];
    writeFileSync(weakenedRecordPath, JSON.stringify(weakenedRecord));
    const weakenedPolicy = verifyAtomicQualityBaseline({ root: checkout, recordPath: weakenedRecordPath });
    assert.equal(weakenedPolicy.status, 'FAIL');
    assert.match(weakenedPolicy.problems.join('\n'), /guard policy drift/u);

    const runtimePath = 'src/legacy-main.ts';
    const forgedProvenanceRecordPath = join(temporaryRoot, 'forged-runtime-provenance-record.json');
    const forgedProvenanceRecord = JSON.parse(readFileSync(recordPath, 'utf8'));
    const auditedRuntime = forgedProvenanceRecord.auditedSourceVariants
      .find((specification) => specification.path === runtimePath);
    const finalRuntimeVariant = auditedRuntime?.allowedVariants
      .find((variant) => variant.auditSourceSha === 'f2bb3a56f07370be3d4a35fa7a1177da2bda4e82');
    assert.deepEqual(finalRuntimeVariant, {
      auditSourceSha: 'f2bb3a56f07370be3d4a35fa7a1177da2bda4e82',
      gitBlobSha: '10fd592422711eda076da8235471b2a4ef67a473',
      sha256: '7ba164c4d33d98f43d163ad4d7ad88edb00aafe025ed88c90c7cd0e1e5efffac',
      classification: 'Exact audited Pass 71 runtime composition for the repaired owner-test candidate product freeze: retains every previously admitted owner-feedback, glass, Chopper, debris, explosive-bolt, authenticated-host-liveness and bounded local-multiplayer-QA path, and adds only an explicit reliable mirror of the current schema-valid player state for HF-296 projection evidence after exact local staging. The mirror remains restricted to active local multiplayer QA, traverses the real network validator and remote admission path, and does not alter production gameplay authority or ordinary state cadence. Immutable Pass 70 source and asset checks, together with semantic-function parity, continue to protect Atomic Quality selection, house structure, visibility and lighting; no other legacy-main variant is admitted.',
    });
    finalRuntimeVariant.auditSourceSha = '7034aa446acf65ed05d37905cfd977beec28ec32';
    writeFileSync(forgedProvenanceRecordPath, JSON.stringify(forgedProvenanceRecord));
    const forgedProvenance = verifyAtomicQualityBaseline({ root: checkout, recordPath: forgedProvenanceRecordPath });
    assert.equal(forgedProvenance.status, 'FAIL');
    assert.match(forgedProvenance.problems.join('\n'), /guard policy drift/u);
    assert.match(
      forgedProvenance.problems.join('\n'),
      /audited source variant does not match 7034aa446acf65ed05d37905cfd977beec28ec32: src\/legacy-main\.ts/u,
    );

    const runtime = readFileSync(join(checkout, runtimePath));
    writeFileSync(join(checkout, runtimePath), Buffer.concat([runtime, Buffer.from('\n// unaudited Atomic Quality source mutation\n')]));
    const runtimeMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(runtimeMutation.status, 'FAIL');
    assert.match(runtimeMutation.problems.join('\n'), /unaudited source drift: src\/legacy-main\.ts/u);
    git(['restore', '--source', 'HEAD', '--', runtimePath], checkout);

    const texturePath = 'public/assets/original/textures/asphalt-aged.png';
    writeFileSync(join(checkout, texturePath), Buffer.concat([readFileSync(join(checkout, texturePath)), Buffer.from([0])]));
    const textureMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(textureMutation.status, 'FAIL');
    assert.match(textureMutation.problems.join('\n'), /protected texture drift: public\/assets\/original\/textures\/asphalt-aged\.png/u);
    git(['restore', '--source', 'HEAD', '--', texturePath], checkout);

    const lodPath = 'public/assets/original/models/operators/pass65-third-person-operator-lod2.glb';
    writeFileSync(join(checkout, lodPath), Buffer.concat([readFileSync(join(checkout, lodPath)), Buffer.from([0])]));
    const lodMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(lodMutation.status, 'FAIL');
    assert.match(lodMutation.problems.join('\n'), /candidate runtime asset drift: .*operator-lod2\.glb/u);
    git(['restore', '--source', 'HEAD', '--', lodPath], checkout);

    const physicsPath = 'src/physics.ts';
    const physics = readFileSync(join(checkout, physicsPath), 'utf8');
    const floorThickness = 'const WORLD_FLOOR_THICKNESS = 0.2;';
    assert.ok(physics.includes(floorThickness), 'missing canonical world-floor audit fixture');
    writeFileSync(join(checkout, physicsPath), physics.replace(floorThickness, 'const WORLD_FLOOR_THICKNESS = 0.25;'));
    const floorMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(floorMutation.status, 'FAIL');
    assert.match(floorMutation.problems.join('\n'), /unaudited source drift: src\/physics\.ts/u);
    git(['restore', '--source', 'HEAD', '--', physicsPath], checkout);

    const physicsMutations = [
      ['gravity: -22', 'gravity: -12', /quality semantic declaration drift: src\/physics\.ts#CHARACTER_PHYSICS_CONFIG/u],
      ['controllerOffset: 0.025', 'controllerOffset: 0.25', /quality semantic declaration drift: src\/physics\.ts#CHARACTER_PHYSICS_CONFIG/u],
      ['.setFriction(0)', '.setFriction(0.5)', /candidate token count drift: src\/physics\.ts "\.setFriction\(0\)"/u],
      ['const epsilon = 0.0005', 'const epsilon = 0.005', /quality semantic method drift: src\/physics\.ts#CharacterPhysics\.move/u],
    ];
    for (const [before, after, semanticFailure] of physicsMutations) {
      assert.ok(physics.includes(before), `missing physics fixture ${before}`);
      writeFileSync(join(checkout, physicsPath), physics.replace(before, after));
      const physicsMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
      assert.equal(physicsMutation.status, 'FAIL');
      assert.match(physicsMutation.problems.join('\n'), /unaudited source drift: src\/physics\.ts/u);
      assert.match(physicsMutation.problems.join('\n'), semanticFailure);
      git(['restore', '--source', 'HEAD', '--', physicsPath], checkout);
    }

    const profilePath = 'src/render-profile.ts';
    const profile = readFileSync(join(checkout, profilePath), 'utf8');
    assert.match(profile, /shadowMapSize: 2048/u);
    writeFileSync(join(checkout, profilePath), profile.replace('shadowMapSize: 2048', 'shadowMapSize: 1024'));
    const profileMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(profileMutation.status, 'FAIL');
    assert.match(profileMutation.problems.join('\n'), /protected source drift: src\/render-profile\.ts/u);
    git(['restore', '--source', 'HEAD', '--', profilePath], checkout);

    const signalPath = 'src/atomic-signal.ts';
    const signal = readFileSync(join(checkout, signalPath), 'utf8');
    const occlusion = 'step(bloomDepth, sceneSampleDepth + 0.0025)';
    assert.match(signal, new RegExp(occlusion.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    writeFileSync(join(checkout, signalPath), signal.replace(occlusion, 'step(bloomDepth, sceneSampleDepth + 0.25)'));
    const rendererMutation = verifyAtomicQualityBaseline({ root: checkout, recordPath });
    assert.equal(rendererMutation.status, 'FAIL');
    assert.match(rendererMutation.problems.join('\n'), /candidate token count drift/u);
  } finally {
    try { git(['worktree', 'remove', '--force', checkout]); } catch { /* Preserve the primary failure. */ }
    if (resolve(temporaryRoot).startsWith(`${safeTemporaryRoot}\\`) || resolve(temporaryRoot).startsWith(`${safeTemporaryRoot}/`)) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});
