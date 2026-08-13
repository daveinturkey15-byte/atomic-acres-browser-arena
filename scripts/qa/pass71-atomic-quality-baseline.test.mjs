import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
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

test('deterministic comparators reject path, byte, function and GLB scene drift', () => {
  const originalTree = treeDigest([{ path: 'asset.bin', bytes: Buffer.from('authored') }]);
  assert.notEqual(originalTree, treeDigest([{ path: 'renamed.bin', bytes: Buffer.from('authored') }]));
  assert.notEqual(originalTree, treeDigest([{ path: 'asset.bin', bytes: Buffer.from('downgraded') }]));

  const source = `function retained() { const brace = "}"; /* { ignored } */ return { quality: true }; }`;
  assert.equal(extractFunctionDeclaration(source, 'retained'), source);
  assert.notEqual(
    extractFunctionDeclaration(source, 'retained'),
    extractFunctionDeclaration(source.replace('quality: true', 'quality: false'), 'retained'),
  );

  assert.notDeepEqual(glbSceneSignature(minimalGlb('authored-material')), glbSceneSignature(minimalGlb('reduced-material')));
});

test('the full verifier fails closed on policy, texture, LOD, preset and renderer-semantic mutations', { timeout: 120_000 }, () => {
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
