// node --test scripts/loop/reference-set.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateReferenceSet, criticTargetSources, criticCaveats, TARGETABLE_TIERS } from './reference-set.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function t3Source(overrides = {}) {
  return {
    id: 'S1',
    tier: 'T3',
    kind: 'photo',
    url: 'https://example.org/truck.jpg',
    licence: 'CC BY 4.0',
    licenceReadAt: '2026-09-04',
    evidenceFor: 'silhouette and proportion of a real box truck at three-quarter front',
    usableFor: ['silhouette', 'proportion'],
    notUsableFor: ['colour'],
    fetch: {
      httpStatus: 200, bytes: 482113, servedContentType: 'image/jpeg',
      sha256: 'a'.repeat(64), fetchedAt: '2026-09-04T11:02:00Z',
    },
    ...overrides,
  };
}

function manifest(overrides = {}) {
  return {
    contract: 'reference-set-v1',
    subject: 'demo-subject',
    subjectKind: 'prop',
    sources: [t3Source()],
    criticTargets: [{ sourceId: 'S1', asTarget: true, reason: 'T3 CC BY photo of a real box truck' }],
    measurements: [],
    unknowns: ['absolute scale is not derivable here'],
    ...overrides,
  };
}

test('the committed chopper-gunner-cockpit-1080 set validates with no errors', () => {
  const body = JSON.parse(readFileSync(join(repoRoot, 'docs/references/chopper-gunner-cockpit-1080/manifest.json'), 'utf8'));
  const result = validateReferenceSet(body);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('a valid T3 set passes', () => {
  assert.deepEqual(validateReferenceSet(manifest()).errors, []);
});

test('a source with no fetch receipt is not a source', () => {
  const body = manifest({ sources: [t3Source({ fetch: undefined })] });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('fetch receipt is required')));
});

test('a non-200 fetch is rejected - a 200 page-not-found shell is the incident this exists for', () => {
  const body = manifest({ sources: [t3Source({ fetch: { ...t3Source().fetch, httpStatus: 404 } })] });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('httpStatus')));
});

test('served content-type must be recorded, not inferred from the extension', () => {
  const fetchNoType = { ...t3Source().fetch };
  delete fetchNoType.servedContentType;
  const body = manifest({ sources: [t3Source({ fetch: fetchNoType })] });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('servedContentType')));
});

test('licence UNKNOWN is rejected outright, not warned about', () => {
  const body = manifest({ sources: [t3Source({ licence: 'UNKNOWN' })] });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('licence UNKNOWN is not a reference')));
});

test('a source must say what it is evidence FOR', () => {
  const body = manifest({ sources: [t3Source({ evidenceFor: '' })] });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('evidenceFor')));
});

test('notUsableFor is mandatory; an empty one warns rather than passing silently', () => {
  const missing = manifest({ sources: [t3Source({ notUsableFor: undefined })] });
  assert.ok(validateReferenceSet(missing).errors.some((e) => e.includes('notUsableFor is mandatory')));
  const empty = manifest({ sources: [t3Source({ notUsableFor: [] })] });
  const result = validateReferenceSet(empty);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((w) => w.includes('notUsableFor is empty')));
});

test('a T1 first-party game artefact may NOT be allow-listed as a visual target', () => {
  const body = manifest({
    sources: [t3Source({ tier: 'T1', kind: 'minimap', url: 'https://example.org/minimap.png' })],
    criticTargets: [{ sourceId: 'S1', asTarget: true, reason: 'it is the map' }],
  });
  const result = validateReferenceSet(body);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('feeds measurement only')));
});

test('the same T1 source is fine when it is NOT a critic target - measurement is allowed', () => {
  const body = manifest({
    sources: [t3Source({ tier: 'T1', kind: 'minimap', url: 'https://example.org/minimap.png' })],
    criticTargets: [{ sourceId: 'S1', asTarget: false, reason: 'measurement only' }],
  });
  assert.equal(validateReferenceSet(body).ok, true);
});

test('only T2 and T3 are ever targetable', () => {
  assert.deepEqual(TARGETABLE_TIERS, ['T2', 'T3']);
});

test('a T2 own-capture needs a localPath and a sha256 instead of a URL receipt', () => {
  const good = manifest({
    sources: [{
      id: 'S1', tier: 'T2', kind: 'own-capture', localPath: 'docs/assets/x.png', sha256: 'b'.repeat(64),
      licence: 'Own work', evidenceFor: 'the approved state of the subject', usableFor: ['framing'], notUsableFor: ['colour'],
    }],
  });
  assert.deepEqual(validateReferenceSet(good).errors, []);
  const bad = JSON.parse(JSON.stringify(good));
  delete bad.sources[0].sha256;
  assert.ok(validateReferenceSet(bad).errors.some((e) => e.includes('sha256')));
});

test('a load-bearing measurement needs a second source and a published agreement', () => {
  const body = manifest({
    measurements: [{ metric: 'box length / overall length', value: 0.554, method: 'connected-component bbox', sources: ['S1'], loadBearing: true, state: 'VERIFIED' }],
  });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('One source is a hypothesis')));
});

test('a measurement must carry a claim-state', () => {
  const body = manifest({
    measurements: [{ metric: 'x', value: 1, method: 'measured somehow', sources: ['S1'], state: 'probably' }],
  });
  assert.ok(validateReferenceSet(body).errors.some((e) => e.includes('VERIFIED, CLAIMED or OPEN')));
});

test('criticTargetSources returns only the allow-listed sources', () => {
  const body = manifest({
    sources: [t3Source(), t3Source({ id: 'S2' })],
    criticTargets: [{ sourceId: 'S1', asTarget: true, reason: 'the target photo' }, { sourceId: 'S2', asTarget: false, reason: 'capture side' }],
  });
  assert.deepEqual(criticTargetSources(body).map((s) => s.id), ['S1']);
});

test('criticCaveats carries notUsableFor and notMatchable into the prompt', () => {
  const body = manifest({ notMatchable: ['colour temperature is not scored'] });
  const lines = criticCaveats(body);
  assert.ok(lines.some((l) => l.includes('NOT usable for colour')));
  assert.ok(lines.includes('colour temperature is not scored'));
});
