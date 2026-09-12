// The gate behind the owner's second standing instruction about QA browsers.
//
// Owner, 2026-08-31, verbatim: "is there a way to stop all these chrome etc
// sessions popping up on my screen, its good you turned the audio off but it
// interupts my PC use alot, maybe an easyer way, keep it wrapped in IDE? or
// just make it invisible to me on windows somehow?"
//
// The audio half of that was already fixed and gated. This is the visibility
// half, held to the same standard: a QA browser may not appear on the owner's
// screen while he is working, and nobody can quietly reintroduce one.
//
// Two acceptable presentations, in preference order:
//   1. HEADLESS - it cannot appear at all, which beats a hidden window.
//   2. HEADED, parked at -32000,-32000 - for lanes that need a real,
//      composited, focusable window (pointer lock, real input delivery).
// Both always mute.
//
// THE TRAP THIS TEST EXISTS TO PREVENT, as much as the popping windows:
// a window parked off-screen can stop being composited, and an uncomposited
// window's requestAnimationFrame FREE-RUNS instead of tracking vsync. Parking a
// lane that measures frame pacing does not hide its number, it replaces it with
// a flattering fiction. So "off-screen" is NOT unconditionally the right answer,
// and this file refuses to let a presentation-measuring lane be parked. Those
// lanes stay visible, mute, and say in their own source why. That is what the
// DECLARED VISIBLE LANE marker means, and why it must carry a real reason.
//
// The roster is SCANNED, never listed. A hardcoded roster of launcher files is
// the precise bug class this repo has spent the week removing - the
// cross-browser gate's frozen arena list (144ead77), the eye-clearance sweep's
// five-arena array, the menu-preview roster (5ac48931). Each went stale in
// silence and reported green over work it had stopped doing. A scan that stops
// matching would fail the same way, so the floors below exist to make an empty
// or collapsed scan LOUD instead of green.
//
// Run: node --test scripts/qa/browser-visibility-contract.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MUTE_FLAG, OFFSCREEN_FLAG, classifySource, countTopLevelArgsKeys, scanBrowserLaunchers,
} from './lib/browser-visibility-scan.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const ROWS = scanBrowserLaunchers(REPO_ROOT);
const HEADED = ROWS.filter((row) => row.headedPossible);

const read = (relative) => readFileSync(resolve(REPO_ROOT, relative), 'utf8');

/**
 * Floors. These are the guards that make a dead scan fail instead of pass.
 * They are deliberately well below the real counts (174 launchers, 32
 * headed-capable at the time of writing) so ordinary churn does not trip them,
 * and far above zero so a derivation that stops matching cannot slip through.
 */
const MINIMUM_LAUNCHERS = 120;
const MINIMUM_HEADED_LANES = 10;
/** ...and a ceiling, so nobody declares their way out of the rule wholesale. */
const MAXIMUM_DECLARED_VISIBLE = 12;

const DECLARED_VISIBLE = /DECLARED VISIBLE LANE|DELIBERATELY VISIBLE/u;

test('the scan still reaches the launchers it is supposed to guard', () => {
  // If the detection ever stops matching the tree's shape it yields an EMPTY
  // list, and an empty list satisfies every "for each launcher" assertion below
  // while proving nothing. That is exactly how the cross-browser gate passed
  // over arenas it had stopped opening.
  assert.ok(
    ROWS.length >= MINIMUM_LAUNCHERS,
    `expected at least ${MINIMUM_LAUNCHERS} browser launchers, scanned ${ROWS.length}`,
  );
  assert.ok(
    HEADED.length >= MINIMUM_HEADED_LANES,
    `expected at least ${MINIMUM_HEADED_LANES} headed-capable lanes, found ${HEADED.length}`,
  );

  // Independent spot-checks of the derivation: three launch SHAPES that are
  // written differently on purpose. If the scanner regresses to understanding
  // only one of them, one of these disappears and this fails.
  const files = ROWS.map((row) => row.file);
  for (const required of [
    'playwright.config.ts', //                                  use.launchOptions, no call site
    'scripts/qa/verify-pass66-hidden-tab-admission.mjs', //      direct-CDP spawn, no Playwright
    'scripts/qa/measure-presented-frames.mjs', //                ordinary chromium.launch()
  ]) {
    assert.ok(files.includes(required), `${required} launches a browser and must be scanned`);
  }
});

// ---------------------------------------------------------------------------
// The audio half. Already true when this file was written; pinned here so the
// two halves of the owner's rule live in one place and regress together.
// ---------------------------------------------------------------------------

test('every browser this repo launches is muted', () => {
  const noisy = ROWS.filter((row) => !row.mutes).map((row) => row.file);
  assert.deepEqual(
    noisy, [],
    `these launch a browser without muting it: ${noisy.join(', ')}`,
  );
});

test('the installed-browser lanes mute BOTH engines, not just Chromium', () => {
  // Several lanes never spell a flag themselves - this module builds their argv.
  // browser-visibility-scan.mjs treats importing it as proof of muting, so that
  // delegation has to be checked here or it is just an assumption.
  const lanes = read('scripts/qa/installed-browser-lanes.mjs');
  assert.match(lanes, /'--mute-audio'/u, 'the Chromium lane argv must carry --mute-audio');
  assert.match(
    lanes,
    /media\.volume_scale/u,
    'Firefox has no --mute-audio; its profile must set media.volume_scale instead',
  );
});

// ---------------------------------------------------------------------------
// The visibility half.
// ---------------------------------------------------------------------------

test('every headed lane is parked off-screen, or declared visible with a reason', () => {
  const offenders = [];
  for (const row of HEADED) {
    if (row.offscreen) continue;
    const source = read(row.file);
    if (!DECLARED_VISIBLE.test(source)) offenders.push(row.file);
  }
  assert.deepEqual(
    offenders, [],
    'these can open a window on the owner\'s screen without being parked off-screen '
    + `or declared: ${offenders.join(', ')}`,
  );
});

test('a declared-visible lane has to give a real reason, not just the marker', () => {
  const declared = HEADED.filter((row) => !row.offscreen);
  assert.ok(declared.length > 0, 'the declared-visible set should not be empty while measurement lanes exist');
  assert.ok(
    declared.length <= MAXIMUM_DECLARED_VISIBLE,
    `${declared.length} lanes claim to need a visible window; the rule is being declared away `
    + `(ceiling ${MAXIMUM_DECLARED_VISIBLE})`,
  );
  for (const row of declared) {
    const source = read(row.file);
    // The marker plus enough prose that somebody actually thought about it. A
    // bare "DECLARED VISIBLE LANE" with no argument is how an exemption list
    // turns into a rubber stamp.
    const block = source.slice(source.search(DECLARED_VISIBLE));
    assert.ok(
      block.length > 200,
      `${row.file}: the declaration needs a written reason, not just the marker`,
    );
    assert.match(
      block.slice(0, 1200),
      /composit|foreground|free-run|occlusion|presentation|vsync|frame/iu,
      `${row.file}: say WHY a real window is required (what breaks when it is hidden)`,
    );
  }
});

test('a lane that wins the foreground is never parked off-screen', () => {
  // The caveat that makes "just park everything" wrong. foregroundWindow() is
  // this repo's marker for "this measurement needs the real compositor": the
  // renderer refuses to author frames without document focus, and an occluded
  // or uncomposited window is throttled. Parking such a lane does not hide its
  // number, it silently replaces it with one that means nothing.
  const contradictions = ROWS.filter((row) => {
    const source = read(row.file);
    return /foregroundWindow\s*\(/u.test(source) && source.includes(OFFSCREEN_FLAG);
  }).map((row) => row.file);
  assert.deepEqual(
    contradictions, [],
    'these take the foreground AND park off-screen, which cannot both be true - '
    + `the measurement is now fiction: ${contradictions.join(', ')}`,
  );
});

test('the off-screen position is actually off every screen', () => {
  const flags = read('scripts/qa/lib/browser-launch-flags.mjs');
  const match = flags.match(/--window-position=(-?\d+),(-?\d+)/u);
  assert.ok(match, 'the helper must define a concrete off-screen position');
  const [x, y] = [Number(match[1]), Number(match[2])];
  // -32000 rather than a small negative: a window at -100,-100 still shows most
  // of itself, and a multi-monitor arrangement can put a display well into
  // negative coordinates.
  assert.ok(x <= -10000 && y <= -10000, `--window-position=${x},${y} is not far enough off-screen`);
  assert.equal(`--window-position=${x},${y}`, OFFSCREEN_FLAG, 'the scanner and the helper must agree');
  assert.match(flags, /--mute-audio/u, 'the helper defines the mute flag too');
  assert.equal(MUTE_FLAG, '--mute-audio');
});

test('the helper is the shared source of these flags, not one file among many', () => {
  // The point of the helper is that the literals stop being re-typed. If almost
  // nobody imports it, the next sweep is another 50-file find-and-replace.
  const importers = ROWS.filter((row) => row.usesHelper).length;
  assert.ok(
    importers >= 30,
    `only ${importers} launchers route their flags through lib/browser-launch-flags.mjs`,
  );
});

// ---------------------------------------------------------------------------
// The shape bug a previous sweep of this exact kind introduced.
// ---------------------------------------------------------------------------

test('no launch options object carries two args keys', () => {
  // The failure that makes a grep-based sweep untrustworthy: an earlier pass
  // added a second `args:` to object literals that already had one. The file
  // still contained '--mute-audio', a grep still said "muted", and the flag
  // never reached Chrome - a duplicate key in an object literal wins by being
  // last. This is checked structurally, per call site.
  const duplicated = ROWS.filter((row) => row.duplicateArgsKeys).map((row) => row.file);
  assert.deepEqual(
    duplicated, [],
    `these silently drop their first args array: ${duplicated.join(', ')}`,
  );
});

test('the duplicate-args detector actually detects duplicate args', () => {
  // A detector that always returns false would make the test above pass over
  // anything. Exercised on both shapes so it cannot rot into a constant.
  assert.equal(countTopLevelArgsKeys("({ headless: true, args: ['--a'] })"), 1);
  assert.equal(countTopLevelArgsKeys("({ headless: true, args: ['--a'], args: ['--b'] })"), 2);
  // A nested args key belongs to somebody else's object and must not count.
  assert.equal(
    countTopLevelArgsKeys("({ args: ['--a'], launchOptions: { args: ['--b'] } })"),
    1,
  );
});

test('the headed/headless classifier reads every spelling this repo uses', () => {
  // Guards the derivation the whole file rests on. `headless: !headed` was
  // silently missed at one point during this very sweep, because /\b(false|!)/
  // can never match `!` - there is no word boundary in front of it. Every shape
  // below appears somewhere in the tree.
  // Assembled rather than written literally: a sample containing the exact text
  // `.launch(` would make THIS file scan as a browser launcher.
  const sample = (headless) => `await chromium.${'launch'}({ ${headless} })`;

  assert.equal(classifySource(sample('headless: false')).headedPossible, true);
  assert.equal(classifySource(sample('headless: !headed')).headedPossible, true);
  assert.equal(classifySource(sample('headless: true')).headedPossible, false);
  // Env-gated lanes default to hidden but CAN be asked for a window, so they
  // count as headed and must carry the flags. Anything that is not a literal
  // `true` is treated as "can appear".
  assert.equal(
    classifySource(sample("headless: process.env.QA_HEADFUL !== '1'")).headedPossible,
    true,
    'an env-gated launch can still be asked for a window',
  );
  assert.equal(
    classifySource(sample('headless: pass73Native ? false : undefined')).headedPossible,
    true,
    'the ternary form playwright.config.ts uses is headed on one branch',
  );
  // ...and a file with no launch at all is not a launcher.
  assert.equal(classifySource('const x = 1;'), null);
});
