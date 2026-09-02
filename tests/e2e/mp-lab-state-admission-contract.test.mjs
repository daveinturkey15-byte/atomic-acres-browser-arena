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
import { spawnSync } from 'node:child_process';
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

test('the perimeter probe cannot report PASS without entering the band the fix opened', () => {
  // A run that stops short of the wall never exercises the drop. test2 did
  // exactly that on 2026-09-02 (0.805 m short) and reported zero drops, so the
  // probe now requires the host inside the pre-fix 0.44 m margin before PASS.
  const probe = readFileSync(resolve(ROOT, 'scripts/qa/mp-lab/probe-perimeter-replication.mjs'), 'utf8');
  const declared = probe.match(/const OLD_BOUNDS_MARGIN_M = ([0-9.]+);/);
  assert.ok(declared, 'the probe must name the pre-fix margin it has to enter');
  assert.equal(Number(declared[1]), 0.44, 'the pre-fix admission margin was 0.44 m');
  assert.match(probe, /const reachedRejectBand = distanceToWall < OLD_BOUNDS_MARGIN_M;/);
  assert.match(probe, /pass: reachedRejectBand && noDrops,/);
});

// --- the same family, one call site further on ------------------------------
// The guest-resume authority handshake asks the same "may this body stand
// here?" question when a reconnecting guest is handed the host's canonical
// pose, and it asked it with the same 0.44 m literal: a guest that reconnects
// while hugging a perimeter wall NACKs 'blocked-pose' and burns its resume
// retries on a legal position. The world half now uses the admission margin;
// the collider half keeps the mover's own radius.

test('guest-resume authority asks the world question with the admission margin', () => {
  const site = legacyMain.match(/if \(!pointInsideBounds\(canonical, arena\.bounds, ([A-Za-z0-9_.]+)\) \|\| isBlocked\(canonical, activeWorldColliders\(\), ([0-9.]+)\)\) \{\s+nackGuestResumeAuthority\(message, 'blocked-pose'\);/);
  assert.ok(site, 'the guest-resume blocked-pose check must precede the NACK');
  assert.equal(site[1], 'STATE_ADMISSION_BOUNDS_MARGIN', 'the bounds half must use the named admission margin, not a literal');
  assert.equal(Number(site[2]), 0.44, 'the collider half keeps the mover radius: this contract must not be used to weaken it');
});

test('no other perimeter-bounds literal survives in the admission or resume paths', () => {
  // Every remaining 0.44 bounds check is recorded in the lane report as OPEN
  // (shot/attacker pose, bot re-spawn, remote overdrive claim). This test pins
  // the two that are this lane's own, so a later edit cannot quietly put the
  // literal back.
  const admission = legacyMain.match(/pointInsideBounds\(incoming, arena\.bounds, ([A-Za-z0-9_.]+)\)/);
  assert.equal(admission?.[1], 'STATE_ADMISSION_BOUNDS_MARGIN');
  const resume = legacyMain.match(/pointInsideBounds\(canonical, arena\.bounds, ([A-Za-z0-9_.]+)\)/);
  assert.equal(resume?.[1], 'STATE_ADMISSION_BOUNDS_MARGIN');
});

test('a resting pose against a wall is rejected at 0.44 and admitted at the declared margin', () => {
  // Executable arithmetic over the REAL collision function and the REAL capsule
  // radii, so this stops being a number someone typed into a report.
  const margin = Number(legacyMain.match(/const STATE_ADMISSION_BOUNDS_MARGIN = ([0-9.]+);/)[1]);
  const tsx = resolve(ROOT, 'node_modules/tsx/dist/cli.mjs');
  const probe = resolve(ROOT, 'scripts/qa/mp-lab/resting-pose-admission.mts');
  const run = spawnSync(process.execPath, [tsx, probe, '--print', '--margins', `${margin},0.44`], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `resting-pose-admission.mts failed: ${run.stderr || run.stdout}`);
  const report = JSON.parse(run.stdout.trim().split(/\r?\n/).pop());
  assert.ok(report.rows.length >= 3, 'every stance must be checked');
  for (const row of report.rows) {
    assert.equal(row.admittedAtMargin['0.44'], false, `${row.stance} resting at the wall was admitted at 0.44: the pre-fix rejection is gone, so this contract no longer proves anything`);
    assert.equal(row.admittedAtMargin[String(margin)], true, `${row.stance} resting at the wall is rejected at the declared admission margin ${margin}`);
  }
  // And the margin still rejects something: admission is a real check, not a
  // check that was deleted by setting its constant to zero.
  assert.equal(report.outsideWorld.admittedAtZeroMargin, false, 'a pose beyond the arena face must still be rejected');
});
