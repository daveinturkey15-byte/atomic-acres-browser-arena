import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readCameraNearPlaneM } from './lib/camera-near-plane.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * PASS 87 Lane AR, item 9.
 *
 * Eye-clearance stage 3 grades every runtime row against the shipped camera's
 * near plane. It read that number by scraping a NUMERIC third argument out of
 * the PerspectiveCamera construction - and HF-410 replaced that literal with
 * FIRST_PERSON_CAMERA_NEAR_METERS in PASS 85, so the scrape has thrown ever
 * since and `--check` has produced no verdict for two passes. Nothing noticed,
 * because the function was unreachable from a test: it lived in a script that
 * launches a browser at module scope.
 */
test('reads the shipped near plane through a named constant', () => {
  const near = readCameraNearPlaneM();
  assert.equal(typeof near, 'number');
  assert.ok(Number.isFinite(near) && near > 0, `near plane must be a positive finite number, got ${near}`);
  // Cross-checked against the constant's own definition, so this test cannot
  // pass by scraping the wrong thing.
  const bodyFit = readFileSync(resolve(ROOT, 'src', 'viewmodel-body-fit.ts'), 'utf8');
  const declared = /export const FIRST_PERSON_CAMERA_NEAR_METERS = ([0-9.]+);/u.exec(bodyFit);
  assert.ok(declared, 'FIRST_PERSON_CAMERA_NEAR_METERS must still be declared with a literal');
  assert.equal(near, Number(declared[1]));
});

test('the shipped camera really is built from the constant, not a literal', () => {
  const legacy = readFileSync(resolve(ROOT, 'src', 'legacy-main.ts'), 'utf8');
  assert.match(
    legacy,
    /const camera = new THREE\.PerspectiveCamera\(76, 1, FIRST_PERSON_CAMERA_NEAR_METERS, 180\);/u,
    'this contract exists because the construction names a constant; if it went back to a literal, '
      + 'say so here rather than letting the numeric path quietly take over',
  );
});

test('a numeric third argument still works', () => {
  const near = readCameraNearPlaneM({
    legacyMainSource: 'const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);',
  });
  assert.equal(near, 0.08);
});

test('the PASS 85 defect, reproduced: a named constant used to be unreadable', () => {
  // The old regex was /...\s*([\d.]+),/ - this is the input it could not match.
  const oldStyle = /const camera = new THREE\.PerspectiveCamera\(\s*[\d.]+,\s*[\d.]+,\s*([\d.]+),/u;
  const shipped = readFileSync(resolve(ROOT, 'src', 'legacy-main.ts'), 'utf8');
  assert.equal(oldStyle.exec(shipped), null, 'the old scrape must be shown to fail on the shipped source');
  assert.ok(readCameraNearPlaneM() > 0, 'and the current one must succeed on it');
});

test('an unresolvable constant throws rather than guessing', () => {
  assert.throws(
    () => readCameraNearPlaneM({
      legacyMainSource: 'const camera = new THREE.PerspectiveCamera(76, 1, SOME_UNKNOWN_NEAR, 180);',
      readModule: () => '',
    }),
    /no module this script knows about defines it/u,
  );
});

test('a camera construction it cannot find at all throws', () => {
  assert.throws(
    () => readCameraNearPlaneM({ legacyMainSource: '// no camera here' }),
    /could not read the player camera near plane/u,
  );
});

test('stage 3 follows QA_BASE_URL, so the preview-server runner can drive it', () => {
  // Lane J's half of item 9, kept asserted: the stage hardcoded 127.0.0.1:41975
  // while run-with-preview-server.mjs defaults to 4180 and exports QA_BASE_URL,
  // so every invocation without an explicit --url died on
  // ERR_CONNECTION_REFUSED before teleporting to a single spot.
  const stage3 = readFileSync(resolve(ROOT, 'scripts', 'qa', 'verify-eye-clearance-runtime.mjs'), 'utf8');
  assert.match(stage3, /process\.env\.QA_BASE_URL/u);
});
