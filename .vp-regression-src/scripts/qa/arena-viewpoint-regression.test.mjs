// Contract test for the arena viewpoint regression instrument.
// Run: node --test scripts/qa/arena-viewpoint-regression.test.mjs
//
// Pins the three things that keep the instrument trustworthy:
//   1. The viewpoint catalog never drifts from the AUTHORED review cameras in
//      src/rendering/arenas/*.ts (both directions: missing and stale).
//   2. The capture script keeps its environment proofs: installed-Chrome
//      headless WebGPU route, adapter/device/vendor validation, game-loop
//      commit proof before every screenshot, manifest provenance.
//   3. The diff thresholds stay at their calibrated strictness. Loosening one
//      requires editing THIS file with evidence - that is the point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VIEWPOINT_CATALOG, CATALOG_ARENAS, CATALOG_VIEWPOINT_COUNT } from './viewpoint-catalog.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ARENA_SOURCES = {
  'atomic-acres': 'src/rendering/arenas/atomic-acres.ts',
  farcrysis: 'src/rendering/arenas/farcrysis.ts',
  'gun-range': 'src/rendering/arenas/gun-range.ts',
  'high-seas': 'src/rendering/arenas/high-seas.ts',
  'rustworks-1v1': 'src/rendering/arenas/rustworks-1v1.ts',
  'skyline-terminal': 'src/rendering/arenas/skyline-terminal.ts',
};

const authoredCameraIds = () => {
  const found = {};
  for (const [arenaId, relPath] of Object.entries(ARENA_SOURCES)) {
    const source = readFileSync(resolve(ROOT, relPath), 'utf8');
    const blockStart = source.indexOf('reviewCameras: [');
    // Scan to the TWO-SPACE-indented closer: the first ']' belongs to a
    // nested position array, not the reviewCameras list.
    const blockEnd = source.indexOf('\n  ],', blockStart);
    assert.notEqual(blockStart, -1, `${relPath} must declare reviewCameras`);
    const block = source.slice(blockStart, blockEnd);
    found[arenaId] = [...block.matchAll(/camera\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  }
  return found;
};

test('catalog covers every authored review camera', () => {
  const authored = authoredCameraIds();
  assert.deepEqual(Object.keys(authored).sort(), [...CATALOG_ARENAS].sort(),
    'catalog arenas must equal the arenas that author reviewCameras');
  for (const [arenaId, ids] of Object.entries(authored)) {
    for (const id of ids) {
      assert.ok(VIEWPOINT_CATALOG[arenaId].includes(id),
        `authored camera '${id}' (${arenaId}) is missing from VIEWPOINT_CATALOG - the regression sweep would silently skip it`);
    }
  }
});

test('catalog has no stale entries', () => {
  const authored = authoredCameraIds();
  for (const [arenaId, ids] of Object.entries(VIEWPOINT_CATALOG)) {
    for (const id of ids) {
      assert.ok(authored[arenaId].includes(id),
        `catalog entry '${arenaId}/${id}' no longer exists in ${ARENA_SOURCES[arenaId]} - remove it or fix the id`);
    }
  }
  assert.equal(CATALOG_VIEWPOINT_COUNT,
    CATALOG_ARENAS.reduce((sum, arena) => sum + VIEWPOINT_CATALOG[arena].length, 0));
});

test('capture script keeps its environment proofs', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/capture-arena-viewpoints.mjs'), 'utf8');
  // The owner plays native WebGPU; only installed Chrome headless provides it
  // without a governor slot. Bundled chromium fails requestDevice here.
  assert.match(source, /headless: true/);
  assert.match(source, /channel: 'chrome'/);
  // Software-rasteriser guard: a Microsoft vendor string must invalidate.
  assert.match(source, /vendor/i);
  assert.match(source, /software rasteriser/);
  assert.match(source, /presentedCamera\.captureRevision === review\.captureCameraRevision/);
  assert.match(source, /requestDevice/);
  // Every screenshot waits for the presentation loop to COMMIT the camera
  // revision - a sleep alone cannot prove which pose the pixels show.
  assert.match(source, /presentedCamera\?\.captureRevision === rev/);
  // Provenance manifest so two directories can be attributed to builds.
  assert.match(source, /capture-manifest\.json/);
  assert.match(source, /bundleAtStart/);
  // A webgpu run that got another backend is INVALIDATED, never recorded as a baseline.
  assert.match(source, /asked for webgpu, got backend=/);
});

test('diff script refuses cross-backend comparisons and pins provenance', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'), 'utf8');
  assert.match(source, /backend mismatch/);
  assert.match(source, /process\.exit\(2\)/);
  assert.match(source, /environmentInvalid/);
  assert.match(source, /diff-report\.json/);
});

test('diff thresholds stay at calibrated strictness', async () => {
  const { THRESHOLDS } = await import('./diff-arena-viewpoints.mjs');
  // Calibrated 2026-08-25 by same-build self-diff on the shared preview
  // (see artifacts/viewpoint-regression/). Tightening is fine; loosening any
  // value needs a new same-build calibration proving the old floor was noise,
  // recorded next to this comment.
  assert.deepEqual({ ...THRESHOLDS }, {
    meanQuiet: 0.5,
    regionMin: 0.0025,
    regionGlobal: 0.15,
    deltaHard: 32,
    deltaSoft: 8,
  });
});
