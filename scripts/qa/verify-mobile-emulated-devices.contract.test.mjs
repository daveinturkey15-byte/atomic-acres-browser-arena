/**
 * Contract for the emulated mobile sweep (verify-mobile-emulated-devices.mjs).
 *
 * PASS 85, Lane AE.
 *
 * WHY A CONTRACT TEST AND NOT JUST THE SWEEP
 * ------------------------------------------
 * The sweep itself takes minutes and needs a GPU, a dev server and a browser,
 * so it runs as a gate rather than on every commit. Everything that can make it
 * quietly stop covering the game - a frozen arena list, a device profile
 * deleted, a floor lowered, a headed browser sneaking back onto the owner's
 * screen - is cheap to check without any of that, and is checked here.
 *
 * Three separate gates in this repository have shipped green while looking at a
 * hand-written arena roster, each found by the owner rather than by CI. The
 * roster assertions below are the reason this one cannot join them.
 *
 * Run: npm run qa:mobile:emulated:contract
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectableArenaIds } from './arena-roster.mjs';
import {
  AUDITED_HUD_ROOTS,
  MIN_HUD_FONT_PX,
  MIN_TOUCH_TARGET_PX,
  MOBILE_DEVICE_PROFILES,
  MOBILE_USER_AGENT,
  REQUIRED_TOUCH_CONTROLS,
  auditHud,
  auditMenuSurface,
  auditOverlay,
  rectanglesOverlap,
  resolveArenaRoster,
  resolveDeviceProfiles,
} from './verify-mobile-emulated-devices.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SWEEP = join(HERE, 'verify-mobile-emulated-devices.mjs');
const source = readFileSync(SWEEP, 'utf8');

/**
 * The sweep with its comments removed. Several assertions below are about what
 * the sweep DOES, and this file's own subject matter (arena ids, `--headed`)
 * appears in the sweep's documentation on purpose. Stripping comments keeps the
 * prose free and the code held.
 */
const code = source
  .replace(/\/\*[\S\s]*?\*\//gu, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//u.test(line))
  .join('\n');

test('the arena roster is derived from the registry, with no id literal in the sweep', () => {
  assert.deepEqual(resolveArenaRoster(''), selectableArenaIds());
  assert.ok(resolveArenaRoster('').length >= 8, 'the derived roster must not silently shrink');

  // No arena id may appear as a literal anywhere in the sweep's CODE. The
  // documentation is free to name arenas; the executable roster is not.
  for (const id of selectableArenaIds()) {
    assert.ok(
      !code.includes(`'${id}'`) && !code.includes(`"${id}"`),
      `${id} appears as a literal in the sweep; the roster must come from arena-roster.mjs`,
    );
  }
});

test('an arena the registry does not offer is an error, never a silent skip', () => {
  assert.throws(() => resolveArenaRoster('not-an-arena'), /does not offer/u);
  const [first] = selectableArenaIds();
  assert.deepEqual(resolveArenaRoster(first), [first]);
});

test('three devices are covered: a phone in both orientations and a tablet', () => {
  assert.equal(MOBILE_DEVICE_PROFILES.length, 3);
  const ids = MOBILE_DEVICE_PROFILES.map((profile) => profile.id);
  assert.equal(new Set(ids).size, 3, 'device ids must be unique');

  const portraitPhone = MOBILE_DEVICE_PROFILES.find((profile) => profile.id === 'phone-portrait');
  const landscapePhone = MOBILE_DEVICE_PROFILES.find((profile) => profile.id === 'phone-landscape');
  const tablet = MOBILE_DEVICE_PROFILES.find((profile) => profile.id === 'tablet-portrait');
  assert.ok(portraitPhone && landscapePhone && tablet);

  // The landscape entry must be the SAME phone rotated. A "landscape" profile
  // that is secretly a different device would mean the two CSS layouts were
  // never compared on equal terms.
  assert.equal(landscapePhone.width, portraitPhone.height);
  assert.equal(landscapePhone.height, portraitPhone.width);
  assert.equal(landscapePhone.deviceScaleFactor, portraitPhone.deviceScaleFactor);

  for (const profile of MOBILE_DEVICE_PROFILES) {
    assert.ok(profile.width >= 320 && profile.height >= 320, `${profile.id} is not a real device size`);
    assert.ok(profile.deviceScaleFactor >= 2, `${profile.id} must carry a real device pixel ratio`);
    assert.equal(
      profile.orientation,
      profile.width > profile.height ? 'landscape' : 'portrait',
      `${profile.id} declares an orientation its own dimensions contradict`,
    );
  }

  assert.throws(() => resolveDeviceProfiles('desktop'), /known profiles are/u);
  assert.deepEqual(resolveDeviceProfiles('tablet-portrait').map((p) => p.id), ['tablet-portrait']);
});

test('the emulation is a mobile one: touch, device scale and a mobile user agent', () => {
  assert.match(MOBILE_USER_AGENT, /Mobile/u, 'the UA must read as a phone; the game gates the overlay on it');
  assert.match(source, /isMobile:\s*true/u);
  assert.match(source, /hasTouch:\s*true/u);
  assert.match(source, /deviceScaleFactor:\s*profile\.deviceScaleFactor/u);
  assert.match(source, /userAgent:\s*MOBILE_USER_AGENT/u);
  // Real touch input, not a synthesised mouse: the whole lane is worthless if
  // the taps are mouse events, because a mouse cannot reproduce a tap's
  // compatibility-click behaviour - which is where Lane AE's defect lived.
  assert.match(source, /Input\.dispatchTouchEvent/u);
});

test('the floors are the documented ones and cannot be lowered here', () => {
  assert.equal(MIN_TOUCH_TARGET_PX, 44, 'Apple HIG and WCAG 2.5.5 both settle on 44');
  assert.equal(MIN_HUD_FONT_PX, 9, 'AGENTS.md pins the HUD text floor at 9px');
});

test('every control a phone player cannot play without is required', () => {
  for (const control of ['stick-move', 'stick-look', 'fire', 'ads', 'reload', 'switch-weapon', 'jump', 'pause']) {
    assert.ok(REQUIRED_TOUCH_CONTROLS.includes(control), `${control} must be required of every device`);
  }
  // The required set must be a real subset of what the overlay actually
  // renders, or the sweep would demand a control that cannot exist.
  const overlaySource = readFileSync(join(REPO, 'src/mobile-touch-controls.ts'), 'utf8');
  const authored = new Set([...overlaySource.matchAll(/id:\s*'([a-z-]+)'/gu)].map((match) => match[1]));
  authored.add('stick-move');
  authored.add('stick-look');
  for (const control of REQUIRED_TOUCH_CONTROLS) {
    assert.ok(authored.has(control), `${control} is required but the overlay does not author it`);
  }
});

test('the sweep is headless-only and never asks for a window', () => {
  assert.match(source, /headless:\s*true/u);
  // Checked against the CODE, not the prose: the header comment says out loud
  // that `--headed` does not exist, and that sentence must not fail this.
  assert.ok(!/--headed/u.test(code), 'the owner asked for no browser windows; --headed must not come back');
  assert.ok(!/OFFSCREEN_ARGS|window-position/u.test(code),
    'an off-screen window is not headless: its rAF free-runs and every frame number becomes fiction');
});

test('rectangle overlap is symmetric, tolerant, and does not fire on a shared edge', () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  const b = { x: 100, y: 0, width: 100, height: 100 };
  assert.equal(rectanglesOverlap(a, b), null, 'touching edges are not an overlap');
  const c = { x: 50, y: 50, width: 100, height: 100 };
  assert.deepEqual(rectanglesOverlap(a, c), { overlapX: 50, overlapY: 50 });
  assert.deepEqual(rectanglesOverlap(c, a), { overlapX: 50, overlapY: 50 });
  const nudge = { x: 99, y: 0, width: 100, height: 100 };
  assert.equal(rectanglesOverlap(a, nudge), null, 'a 1px sub-pixel kiss is not an overlap');
});

// --------------------------------------------------------------------------
// The audits are pure, so their verdicts are pinned here against fixtures
// rather than against a live browser. Each fixture is a defect the sweep has
// actually reported at least once.
// --------------------------------------------------------------------------

const profile = { id: 'phone-portrait', width: 393, height: 852 };
const goodOverlay = () => ({
  present: true,
  hidden: false,
  bodyLive: true,
  documentOverflowX: 0,
  controls: REQUIRED_TOUCH_CONTROLS.map((id, index) => ({
    id, visible: true, x: 8, y: 8 + index * 60, width: 52, height: 48, fontPx: 11,
  })),
});

test('the overlay audit passes a clean overlay and names every defect class', () => {
  assert.deepEqual(auditOverlay(goodOverlay(), profile, MIN_TOUCH_TARGET_PX).failures, []);

  assert.deepEqual(auditOverlay({ present: false }, profile, 44).failures, ['touch-overlay-never-mounted']);

  const hidden = goodOverlay();
  hidden.hidden = true;
  assert.ok(auditOverlay(hidden, profile, 44).failures.includes('touch-overlay-hidden-during-active-match'));

  const missing = goodOverlay();
  missing.controls = missing.controls.filter((control) => control.id !== 'reload');
  assert.ok(auditOverlay(missing, profile, 44).failures.some((entry) => entry.startsWith('required-controls-missing:reload')));

  const small = goodOverlay();
  small.controls[0] = { ...small.controls[0], width: 30, height: 30 };
  assert.ok(auditOverlay(small, profile, 44).failures.some((entry) => entry.includes('touch-targets-below-44px')));

  const offscreen = goodOverlay();
  offscreen.controls[1] = { ...offscreen.controls[1], x: 380 };
  assert.ok(auditOverlay(offscreen, profile, 44).failures.some((entry) => entry.startsWith('controls-outside-viewport')));

  const overlapping = goodOverlay();
  overlapping.controls[2] = { ...overlapping.controls[2], x: 8, y: overlapping.controls[1].y };
  assert.ok(auditOverlay(overlapping, profile, 44).failures.some((entry) => entry.startsWith('overlapping-controls')));

  const overflowing = goodOverlay();
  overflowing.documentOverflowX = 12;
  assert.ok(auditOverlay(overflowing, profile, 44).failures.includes('match-horizontal-overflow:12px'));
});

test('the HUD audit fails small text, an absent console and a console under a control', () => {
  const overlay = goodOverlay();
  const clean = [{
    selector: '.hud-weapon-console', present: true, visible: true,
    x: 300, y: 300, width: 90, height: 80, offscreen: false,
    text: [{ text: 'AMMO', fontPx: 9, tag: 'span', id: null }],
  }];
  assert.deepEqual(auditHud(clean, overlay, MIN_HUD_FONT_PX).failures, []);

  const tiny = structuredClone(clean);
  tiny[0].text = [{ text: 'AMMO', fontPx: 7.5, tag: 'span', id: 'weapon-name' }];
  assert.ok(auditHud(tiny, overlay, 9).failures.some((entry) => entry.startsWith('hud-text-below-9px')));

  const absent = [{ selector: '.hud-map-console', present: false }];
  assert.ok(auditHud(absent, overlay, 9).failures.includes('hud-roots-absent:.hud-map-console'));

  const buried = structuredClone(clean);
  buried[0].x = overlay.controls[0].x;
  buried[0].y = overlay.controls[0].y;
  assert.ok(auditHud(buried, overlay, 9).failures.some((entry) => entry.startsWith('hud-under-touch-control')));

  const away = structuredClone(clean);
  away[0].offscreen = true;
  assert.ok(auditHud(away, overlay, 9).failures.includes('hud-consoles-outside-viewport:.hud-weapon-console'));
});

test('the menu audit fails a control something is painted over, and never a scrolled one', () => {
  const reachable = (over) => ({
    visible: true,
    overflowX: 0,
    interactive: [{
      id: 'resume', text: 'RESUME', x: 40, y: 600, width: 300, height: 44, fontPx: 14,
      offscreen: false, inViewport: true, reachable: !over, blockedBy: over ? 'li.project-boundaries' : null,
    }],
  });
  assert.deepEqual(auditMenuSurface(reachable(false), profile, 44, 9, 'pause').failures, []);
  const blocked = auditMenuSurface(reachable(true), profile, 44, 9, 'pause');
  assert.ok(blocked.failures.some((entry) => entry.startsWith('pause-controls-not-tappable:resume<li.project-boundaries')),
    'a control under a modal is untappable no matter how well it measures');

  // A control scrolled out of the viewport is BELOW THE FOLD, not blocked. The
  // options panel is a long list; failing it would make the audit meaningless.
  const scrolled = {
    visible: true,
    overflowX: 0,
    interactive: [{
      id: 'graphics-shadows', text: 'SHADOWS', x: 40, y: 1400, width: 300, height: 44, fontPx: 12,
      offscreen: false, inViewport: false, reachable: null, blockedBy: null,
    }],
  };
  const audit = auditMenuSurface(scrolled, profile, 44, 9, 'settings');
  assert.deepEqual(audit.failures, []);
  assert.equal(audit.controlsBelowTheFold, 1, 'below-the-fold controls are reported, not failed');
});

test('the receipt says out loud what emulation cannot tell you', () => {
  for (const phrase of ['UPPER BOUND', 'iOS/Safari', 'MOBILE_PHONE_CHECKLIST.md']) {
    assert.ok(source.includes(phrase), `the instrument caveat must mention ${phrase}`);
  }
});

test('the owner-only checklist the sweep defers to actually exists', () => {
  const checklist = readFileSync(join(REPO, 'docs/MOBILE_PHONE_CHECKLIST.md'), 'utf8');
  assert.ok(checklist.length > 400, 'the checklist must be a real document, not a stub');
  for (const row of ['iPhone', 'Android', 'Bluetooth']) {
    assert.ok(checklist.includes(row), `the checklist must cover ${row}: emulation cannot`);
  }
});

test('the npm entry points exist and the gate runs this contract first', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['qa:mobile:emulated:contract'],
    'node --test scripts/qa/verify-mobile-emulated-devices.contract.test.mjs');
  assert.match(pkg.scripts['qa:mobile:emulated'], /^npm run qa:mobile:emulated:contract && /u,
    'the sweep must not be runnable without its own contract passing first');
  assert.match(pkg.scripts['qa:mobile:emulated'], /run-with-dev-server\.mjs/u,
    'a gate that needs "remember to start the dev server first" quietly stops being run');
});
