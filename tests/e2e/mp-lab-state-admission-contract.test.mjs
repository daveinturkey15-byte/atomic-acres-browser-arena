// MP-LAB contract: state admission may not demand a wall margin the movement
// authority never grants.
//
// Finding 2026-09-02 (host+guest harness, atomic-acres): the host stood at
// x = 36.595 against maxX 37 - a legal pose, because the Rapier player capsule
// radius is 0.38 (physics.ts) and the boundary walls' inner faces are the
// bounds - and the guest dropped five of its state packets as
// 'outside-arena-bounds' because legacy-main demanded a 0.44 m margin. The
// host froze in place for the guest. This pins the admission margin to a
// named constant that is never larger than the smallest capsule radius.
//
//   node --test tests/e2e/mp-lab-state-admission-contract.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const legacyMain = readFileSync(resolve(ROOT, 'src/legacy-main.ts'), 'utf8');
const physics = readFileSync(resolve(ROOT, 'src/physics.ts'), 'utf8');

function smallestCapsuleRadius() {
  const radii = [];
  const configured = physics.match(/playerRadius:\s*([0-9.]+)/);
  assert.ok(configured, 'physics.ts must declare playerRadius');
  radii.push(Number(configured[1]));
  for (const match of physics.matchAll(/radius:\s*([0-9.]+)/g)) radii.push(Number(match[1]));
  assert.ok(radii.length >= 2, 'physics.ts must declare stance capsule radii');
  return Math.min(...radii);
}

test('legacy-main.ts stays LF so the source pins below read the shipped bytes', () => {
  assert.ok(!legacyMain.includes('\r\n'), 'src/legacy-main.ts must be LF-terminated');
});

test('the outside-arena-bounds drop uses the named admission margin', () => {
  const site = legacyMain.match(/if \(!pointInsideBounds\(incoming, arena\.bounds, ([A-Za-z0-9_.]+)\)\) \{\s*\n\s*recordStateAdmissionDrop\('outside-arena-bounds'\);/);
  assert.ok(site, 'the state admission bounds check must precede the outside-arena-bounds drop');
  assert.equal(site[1], 'STATE_ADMISSION_BOUNDS_MARGIN', 'the margin must be the named constant, not a literal');
});

test('the admission margin never exceeds the smallest character capsule radius', () => {
  const declared = legacyMain.match(/const STATE_ADMISSION_BOUNDS_MARGIN = ([0-9.]+);/);
  assert.ok(declared, 'STATE_ADMISSION_BOUNDS_MARGIN must be a numeric constant');
  const margin = Number(declared[1]);
  const radius = smallestCapsuleRadius();
  assert.ok(margin >= 0, 'a negative margin would admit poses outside the world');
  assert.ok(margin <= radius, `margin ${margin} exceeds the smallest capsule radius ${radius}: a peer against a wall would be dropped`);
});

test('the perimeter probe drives the host into a wall and reads the guest drop telemetry', () => {
  const probe = readFileSync(resolve(ROOT, 'scripts/qa/mp-lab/probe-perimeter-replication.mjs'), 'utf8');
  assert.match(probe, /aimAtRemoteWithOffset\(offset, 0\)/);
  assert.match(probe, /stateAdmissionDrops/);
  assert.match(probe, /\(guestRemoteView\.drops\?\.total \?\? 1\) === 0/);
});
