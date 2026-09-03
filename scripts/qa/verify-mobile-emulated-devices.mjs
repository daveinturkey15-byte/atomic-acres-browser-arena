#!/usr/bin/env node
// PASS 85 Lane AE - the emulated mobile pass.
//
// WHAT THIS IS FOR
// ----------------
// The owner plays on a PC and his friends sometimes join from a phone. The
// real-device pass needs his hands on his own handsets, so it is shelved. This
// lane does everything that does NOT need a phone, and it says plainly what it
// therefore cannot tell you (see `instrumentCaveat` in the receipt and
// docs/MOBILE_PHONE_CHECKLIST.md for the five minutes only he can do).
//
// It is the sibling of `verify-mobile-touch-playability.mjs`, not a replacement.
// That script answers "can a thumb move, look, shoot and jump" on two
// viewports of one arena. This one widens the question in the three directions
// a phone build actually fails in:
//
//   DEVICES   three emulated devices, not two viewports: a 6.1" phone in
//             portrait AND in landscape (two genuinely different CSS layouts -
//             the overlay's action rails move, the HUD consoles re-anchor, and
//             `@media (orientation: landscape)` blocks only one of them), plus
//             a 10" tablet, where every clamp() upper bound is exercised for
//             the first time. Each carries a real device scale factor, touch
//             events, `isMobile`, and an Android Chrome user agent, because the
//             game reads `navigator.maxTouchPoints` to decide whether the touch
//             overlay defaults on at all.
//
//   ARENAS    a registry-derived roster (scripts/qa/arena-roster.mjs), never a
//             hand-written id list. Three gates in this repository have shipped
//             green while looking at a stale list; the contract test next to
//             this file (`verify-mobile-emulated-devices.contract.test.mjs`)
//             fails if an id literal reappears here.
//
//   ACTIONS   the whole loop a phone player performs, through real touch input
//             on the real overlay: deploy, move, look, fire, reload, ADS,
//             switch weapon, jump, sprint, pause, open settings, resume. Plus
//             the two things Lane E added in PASS 84 and only ever measured at
//             one viewport: a connected pad must SUPPRESS the overlay, and
//             touch must own the strongest aim-assist tier.
//
// WHAT IT MEASURES, AND WHY EACH ONE IS A DEFECT
// ----------------------------------------------
//   - controls outside the viewport             a thumb cannot reach them
//   - touch targets under 44 CSS px             Apple HIG and WCAG 2.5.5 floor
//   - overlapping controls                      the thumb hits FIRE, gets RELOAD
//   - HUD text under 9 px                       AGENTS.md legibility floor
//   - a HUD console under a control             a readout you cannot read
//   - horizontal document overflow              the page pans under the thumb
//   - page/console errors                       a broken build that still draws
//   - frame time                                an UPPER BOUND, see the caveat
//
// HEADLESS ONLY. The owner works at this machine; a QA browser that appears is
// a defect in the harness. `--headed` does not exist here on purpose, and the
// contract test asserts it never comes back.
//
// Usage:
//   node scripts/qa/verify-mobile-emulated-devices.mjs
//     [--url http://127.0.0.1:41876]
//     [--arenas atomic-acres,test2]     (default: the derived selectable roster)
//     [--devices phone-portrait,tablet] (default: every profile)
//     [--render quality|performance] [--renderer webgpu|webgl2]
//     [--min-target-px 44] [--min-font-px 9]
//     [--screenshots docs/evidence/pass85/lane-ae]
//     [--out artifacts/qa/mobile-emulated-devices.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startStableDevProxy } from './stable-dev-proxy.mjs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { selectableArenaIds } from './arena-roster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * THE THREE DEVICES.
 *
 * Sizes are the CSS viewport a browser actually reports on these classes of
 * device, not the marketing resolution: a 6.1" phone is ~393x852 CSS px at
 * dpr 3, and a 10" tablet ~820x1180 at dpr 2. The landscape entry is the SAME
 * phone rotated, and it is a separate profile rather than a flag because the
 * stylesheet treats it as a separate layout - `@media (orientation: landscape)`
 * moves both action rails and re-anchors four HUD consoles.
 */
export const MOBILE_DEVICE_PROFILES = Object.freeze([
  Object.freeze({
    id: 'phone-portrait',
    label: '6.1-inch phone, portrait',
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    orientation: 'portrait',
  }),
  Object.freeze({
    id: 'phone-landscape',
    label: '6.1-inch phone, landscape',
    width: 852,
    height: 393,
    deviceScaleFactor: 3,
    orientation: 'landscape',
  }),
  Object.freeze({
    id: 'tablet-portrait',
    label: '10-inch tablet, portrait',
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    orientation: 'portrait',
  }),
]);

/**
 * An Android Chrome UA. Playwright's webkit build has no WebGPU at all, so an
 * iPhone cannot be emulated here in any way that would boot the game; the
 * honest substitute is Chrome device emulation with a mobile UA, and iOS/Safari
 * stays an owner-only row in the phone checklist.
 */
export const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

/** Apple HIG and WCAG 2.5.5 settle on the same number. */
export const MIN_TOUCH_TARGET_PX = 44;

/** AGENTS.md: "menu labels and critical HUD status text are at least 9px". */
export const MIN_HUD_FONT_PX = 9;

/** The controls a phone player cannot play without. Missing = fail, not warn. */
export const REQUIRED_TOUCH_CONTROLS = Object.freeze([
  'stick-move', 'stick-look', 'fire', 'ads', 'reload', 'switch-weapon', 'jump', 'pause',
]);

/**
 * HUD roots that must stay legible and unobstructed on a touch layout. Read
 * from the live DOM; absent roots are reported, never assumed fine.
 */
export const AUDITED_HUD_ROOTS = Object.freeze([
  '.hud-mission-console', '.hud-operator-console', '.hud-weapon-console', '.hud-map-console',
]);

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

/**
 * The arena roster, derived from the registry and then FILTERED by `--arenas`.
 * A requested id that the registry does not offer is an error rather than a
 * silent skip: that is exactly how a sweep quietly stops covering an arena.
 */
export function resolveArenaRoster(requested) {
  const roster = selectableArenaIds();
  if (!requested) return roster;
  const wanted = requested.split(',').map((entry) => entry.trim()).filter(Boolean);
  const unknown = wanted.filter((id) => !roster.includes(id));
  if (unknown.length > 0) {
    throw new Error(
      `--arenas names ${unknown.join(', ')}, which the registry does not offer. `
      + `Selectable arenas are: ${roster.join(', ')}`,
    );
  }
  return roster.filter((id) => wanted.includes(id));
}

/** Device profiles filtered by `--devices`, same strictness as the roster. */
export function resolveDeviceProfiles(requested) {
  if (!requested) return MOBILE_DEVICE_PROFILES;
  const wanted = requested.split(',').map((entry) => entry.trim()).filter(Boolean);
  const known = MOBILE_DEVICE_PROFILES.map((profile) => profile.id);
  const unknown = wanted.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    throw new Error(`--devices names ${unknown.join(', ')}; known profiles are ${known.join(', ')}`);
  }
  return MOBILE_DEVICE_PROFILES.filter((profile) => wanted.includes(profile.id));
}

/** Rectangle intersection in CSS px, with a tolerance for sub-pixel layout. */
export function rectanglesOverlap(a, b, tolerance = 2) {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapX > tolerance && overlapY > tolerance
    ? { overlapX: Math.round(overlapX), overlapY: Math.round(overlapY) }
    : null;
}

// --------------------------------------------------------------------------
// In-page readers. Each is a pure evaluate() so a failure reports as a missing
// measurement rather than as a passing one.
// --------------------------------------------------------------------------

const readOverlay = (page) => page.evaluate(() => {
  const root = document.getElementById('mobile-touch-controls');
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const documentOverflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  if (!root) return { present: false, controls: [], viewport, documentOverflowX };
  const controls = [...root.querySelectorAll('[data-mtc]')].map((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      id: element.getAttribute('data-mtc'),
      label: element.getAttribute('aria-label') ?? null,
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      fontPx: Number.parseFloat(styles.fontSize) || null,
      visible: styles.visibility !== 'hidden' && styles.display !== 'none' && Number(styles.opacity) > 0.05,
    };
  });
  return {
    present: true,
    hidden: root.hidden,
    bodyLive: document.body.classList.contains('mtc-live'),
    controls,
    viewport,
    documentOverflowX,
  };
});

/**
 * Every HUD root's box plus the smallest font size of any NON-EMPTY text node
 * inside it. Empty elements are excluded deliberately: a 6px empty span is not
 * a legibility defect, and counting it produces noise that hides the real ones.
 */
const readHud = (page, roots) => page.evaluate((selectors) => {
  const measured = [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (!element) { measured.push({ selector, present: false }); continue; }
    const styles = window.getComputedStyle(element);
    const visible = styles.visibility !== 'hidden' && styles.display !== 'none' && Number(styles.opacity) > 0.05;
    const rect = element.getBoundingClientRect();
    const smallText = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? '').trim();
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const parentStyles = window.getComputedStyle(parent);
      if (parentStyles.visibility === 'hidden' || parentStyles.display === 'none') continue;
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.width < 1 || parentRect.height < 1) continue;
      const size = Number.parseFloat(parentStyles.fontSize);
      if (Number.isFinite(size)) {
        smallText.push({ text: text.slice(0, 24), fontPx: Number(size.toFixed(2)), tag: parent.tagName.toLowerCase(), id: parent.id || null });
      }
    }
    measured.push({
      selector,
      present: true,
      visible,
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      offscreen: rect.right > window.innerWidth + 1 || rect.left < -1
        || rect.bottom > window.innerHeight + 1 || rect.top < -1,
      text: smallText,
    });
  }
  return measured;
}, roots);

/**
 * Every tappable control on the visible menu surface, with its box AND what a
 * finger landing on its centre would actually hit.
 *
 * The hit test is the point of this reader. A control can be present, on
 * screen, the right size, and still be untappable because something is painted
 * over it - and every geometric audit in this repository reports that control
 * as fine. Lane AE found exactly that on the pause surface (a full-screen modal
 * over the menu), and this repository has the same lesson written down from a
 * Pixi button whose only geometry was a mask: it looked right, it measured
 * right, and it never fired.
 */
const readMenuTargets = (page) => page.evaluate(() => {
  const menu = document.getElementById('menu');
  const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  if (!menu || menu.classList.contains('hidden')) {
    return { visible: false, overflowX, interactive: [] };
  }
  const describe = (element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`
    + `${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/u)[0]}` : ''}`;
  const interactive = [...menu.querySelectorAll('button, select, input, [role="tab"]')]
    .filter((element) => {
      const styles = window.getComputedStyle(element);
      if (styles.display === 'none' || styles.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const centreX = rect.x + rect.width / 2;
      const centreY = rect.y + rect.height / 2;
      // A control whose centre is outside the viewport is BELOW THE FOLD, not
      // blocked: the options panel is a long scrolling list and a phone player
      // reaches the rest of it by scrolling. Only a control the finger can
      // already touch is hit-tested, so a scrollable panel is never reported as
      // an obstruction.
      const inViewport = centreX >= 0 && centreY >= 0 && centreX <= window.innerWidth && centreY <= window.innerHeight;
      const top = inViewport ? document.elementFromPoint(centreX, centreY) : null;
      const reachable = inViewport ? (Boolean(top) && (top === element || element.contains(top))) : null;
      return {
        id: element.id || null,
        text: (element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 32),
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        fontPx: Number(Number.parseFloat(styles.fontSize).toFixed(2)),
        offscreen: rect.right > window.innerWidth + 1 || rect.left < -1,
        inViewport,
        reachable,
        blockedBy: reachable !== false || !top ? null : describe(top),
      };
    });
  return { visible: true, overflowX, interactive };
});

const playerState = (page) => page.evaluate(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null;
  if (!state) return null;
  const camera = state.deterministicReview?.captureCamera ?? null;
  return {
    weapon: state.player?.weapon ?? null,
    ammo: state.player?.ammo ?? null,
    reserve: state.player?.reserve ?? null,
    reloading: state.player?.reloading ?? null,
    stance: state.player?.stance ?? null,
    sprinting: state.player?.sprinting ?? null,
    yaw: state.player?.yaw ?? null,
    position: state.player?.position ?? null,
    cameraHeight: Array.isArray(camera?.position) ? camera.position[1] : null,
    adsHeld: state.textChat?.adsHeld ?? null,
    matchPhase: state.matchPhase ?? null,
  };
});

// --------------------------------------------------------------------------
// Real touch input. Playwright's CDP touch dispatch, not synthesised mouse.
// --------------------------------------------------------------------------

async function withTouch(page, run) {
  const client = await page.context().newCDPSession(page);
  try {
    await run((type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points }));
  } finally {
    await client.detach().catch(() => {});
  }
}

async function dragStick(page, box, dx, dy, holdMs) {
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await withTouch(page, async (send) => {
    await send('touchStart', [{ x: startX, y: startY, id: 1 }]);
    for (let step = 1; step <= 6; step += 1) {
      await send('touchMove', [{ x: startX + (dx * step) / 6, y: startY + (dy * step) / 6, id: 1 }]);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(holdMs);
    await send('touchEnd', [{ x: startX + dx, y: startY + dy, id: 1 }]);
  });
}

async function tapBox(page, box, holdMs = 120) {
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
  await withTouch(page, async (send) => {
    await send('touchStart', point);
    await page.waitForTimeout(holdMs);
    await send('touchEnd', point);
  });
}

async function tapSelector(page, selector, holdMs = 120) {
  const box = await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
  if (!box) return false;
  await tapBox(page, box, holdMs);
  return true;
}

/**
 * A pad injected through `navigator.getGamepads`, the same shape Lane E's e2e
 * uses. Kept in this file rather than imported because it is serialised into
 * the page and cannot close over module scope.
 */
function installFakeGamepad() {
  let pad = null;
  const makePad = () => ({
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: performance.now(),
  });
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [pad, null, null, null],
  });
  window.__FAKE_GAMEPAD__ = {
    connect: () => {
      pad = makePad();
      window.dispatchEvent(new CustomEvent('gamepadconnected', { detail: { gamepad: pad } }));
    },
    disconnect: () => {
      if (pad) pad.connected = false;
      pad = null;
      window.dispatchEvent(new CustomEvent('gamepaddisconnected'));
    },
  };
}

// --------------------------------------------------------------------------
// Per-cell audits, each returning failures rather than throwing.
// --------------------------------------------------------------------------

/** Reachability + size + collision for the live touch overlay. */
export function auditOverlay(overlay, profile, minTargetPx) {
  const failures = [];
  if (!overlay.present) return { failures: ['touch-overlay-never-mounted'] };
  if (overlay.hidden) failures.push('touch-overlay-hidden-during-active-match');
  if (!overlay.bodyLive) failures.push('body-missing-mtc-live-class');
  if (overlay.documentOverflowX > 0) failures.push(`match-horizontal-overflow:${overlay.documentOverflowX}px`);

  const controls = overlay.controls.filter((control) => control.visible);
  const present = new Set(controls.map((control) => control.id));
  const missing = REQUIRED_TOUCH_CONTROLS.filter((id) => !present.has(id));
  if (missing.length > 0) failures.push(`required-controls-missing:${missing.join('/')}`);

  const offscreen = controls.filter((control) => control.x < -1 || control.y < -1
    || control.x + control.width > profile.width + 1
    || control.y + control.height > profile.height + 1);
  if (offscreen.length > 0) {
    failures.push(`controls-outside-viewport:${offscreen.map((entry) => `${entry.id}(${entry.x},${entry.y} ${entry.width}x${entry.height})`).join(',')}`);
  }

  const tooSmall = controls.filter((control) => Math.min(control.width, control.height) < minTargetPx);
  if (tooSmall.length > 0) {
    failures.push(`touch-targets-below-${minTargetPx}px:${tooSmall.map((entry) => `${entry.id}(${entry.width}x${entry.height})`).join(',')}`);
  }

  const overlaps = [];
  for (let left = 0; left < controls.length; left += 1) {
    for (let right = left + 1; right < controls.length; right += 1) {
      const hit = rectanglesOverlap(controls[left], controls[right]);
      if (hit) overlaps.push({ a: controls[left].id, b: controls[right].id, ...hit });
    }
  }
  if (overlaps.length > 0) {
    failures.push(`overlapping-controls:${overlaps.map((entry) => `${entry.a}+${entry.b}`).join(',')}`);
  }

  return {
    failures,
    controlCount: controls.length,
    controlsOffscreen: offscreen,
    controlsBelowMinimum: tooSmall.map((entry) => ({ id: entry.id, width: entry.width, height: entry.height })),
    controlOverlaps: overlaps,
  };
}

/** Legibility + obstruction for the HUD consoles behind the overlay. */
export function auditHud(hudRoots, overlay, minFontPx) {
  const failures = [];
  const missing = hudRoots.filter((root) => !root.present).map((root) => root.selector);
  if (missing.length > 0) failures.push(`hud-roots-absent:${missing.join(',')}`);

  const visible = hudRoots.filter((root) => root.present && root.visible);
  const offscreen = visible.filter((root) => root.offscreen).map((root) => root.selector);
  if (offscreen.length > 0) failures.push(`hud-consoles-outside-viewport:${offscreen.join(',')}`);

  const belowFloor = [];
  for (const root of visible) {
    for (const entry of root.text ?? []) {
      if (entry.fontPx < minFontPx) {
        belowFloor.push({ selector: root.selector, ...entry });
      }
    }
  }
  if (belowFloor.length > 0) {
    failures.push(`hud-text-below-${minFontPx}px:${belowFloor.map((entry) => `${entry.id ?? entry.tag}@${entry.fontPx}px`).join(',')}`);
  }

  const obstructed = [];
  const controls = (overlay.controls ?? []).filter((control) => control.visible);
  for (const root of visible) {
    for (const control of controls) {
      const hit = rectanglesOverlap(root, control, 4);
      if (hit) obstructed.push({ hud: root.selector, control: control.id, ...hit });
    }
  }
  if (obstructed.length > 0) {
    failures.push(`hud-under-touch-control:${obstructed.map((entry) => `${entry.hud}<${entry.control}`).join(',')}`);
  }

  return { failures, hudTextBelowFloor: belowFloor, hudObstructedByControls: obstructed };
}

/** Reachability + size for a menu surface (lobby, pause, options). */
export function auditMenuSurface(menu, profile, minTargetPx, minFontPx, label) {
  const failures = [];
  if (!menu.visible) return { failures: [`${label}-menu-not-visible`] };
  if (menu.overflowX > 0) failures.push(`${label}-horizontal-overflow:${menu.overflowX}px`);
  const offscreen = menu.interactive.filter((entry) => entry.offscreen);
  if (offscreen.length > 0) {
    failures.push(`${label}-controls-offscreen:${offscreen.map((entry) => entry.id ?? entry.text).join(',')}`);
  }
  // A control something else is painted over is untappable no matter how well
  // it measures. Only ID'd controls are failed: the arena cards are a deliberate
  // horizontal carousel whose off-carousel siblings are legitimately covered,
  // and they are reported below rather than failed.
  const blocked = menu.interactive.filter((entry) => entry.reachable === false);
  const blockedNamed = blocked.filter((entry) => entry.id);
  if (blockedNamed.length > 0) {
    failures.push(`${label}-controls-not-tappable:${blockedNamed.map((entry) => `${entry.id}<${entry.blockedBy}`).join(',')}`);
  }
  const tooSmall = menu.interactive.filter((entry) => entry.height < minTargetPx);
  const tinyText = menu.interactive.filter((entry) => entry.fontPx < minFontPx);
  return {
    failures,
    interactiveCount: menu.interactive.length,
    controlsOffscreen: offscreen,
    // Menu control HEIGHT below the target floor is reported but not failed:
    // a lobby row is a wide full-width strip whose 40px height is still an easy
    // thumb target, and failing it would either be ignored or answered by
    // padding the whole lobby out of the viewport. The overlay - where a miss
    // costs a life - is where the 44px floor is enforced hard.
    controlsBelowTargetHeight: tooSmall.map((entry) => ({ id: entry.id ?? entry.text, height: entry.height })),
    controlsBelowFontFloor: tinyText.map((entry) => ({ id: entry.id ?? entry.text, fontPx: entry.fontPx })),
    controlsNotTappable: blocked.map((entry) => ({ id: entry.id ?? entry.text, blockedBy: entry.blockedBy })),
    // Reported, never failed: a long options list legitimately scrolls.
    controlsBelowTheFold: menu.interactive.filter((entry) => !entry.inViewport).length,
  };
}

// --------------------------------------------------------------------------
// One cell: one device x one arena.
// --------------------------------------------------------------------------

async function runCell({ browser, proxy, profile, arena, options }) {
  const failures = [];
  const record = {
    device: profile.id,
    deviceLabel: profile.label,
    arena,
    viewport: `${profile.width}x${profile.height}`,
    deviceScaleFactor: profile.deviceScaleFactor,
    failures,
    screenshots: [],
  };
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: MOBILE_USER_AGENT,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text().slice(0, 200)); });
  page.on('pageerror', (error) => pageErrors.push(`pageerror: ${String(error).slice(0, 200)}`));

  const shot = async (name) => {
    if (!options.screenshotDir) return;
    const file = resolve(options.screenshotDir, `${profile.id}-${arena}-${name}.png`);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file }).catch(() => {});
    record.screenshots.push(file);
  };

  try {
    await page.addInitScript(installFakeGamepad);
    // The overlay defaults on for a touch device, but the preference is
    // persisted, so it is pinned rather than assumed.
    await page.addInitScript((key) => { try { localStorage.setItem(key, 'on'); } catch { /* private mode */ } },
      'atomic-acres-mobile-controls');

    const url = new URL('/', proxy.origin);
    url.searchParams.set('release', 'latest');
    url.searchParams.set('map', arena);
    url.searchParams.set('render', options.render);
    if (options.renderer) url.searchParams.set('renderer', options.renderer);
    url.searchParams.set('externalServices', 'off');
    url.searchParams.set('seed', 'pass85-lane-ae');
    const bootStart = Date.now();
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      return Boolean(debug) && debug.snapshot().bootstrap?.stage === 'ready';
    }, undefined, { timeout: options.bootTimeoutMs });
    record.bootMs = Date.now() - bootStart;

    // ---- MENU -------------------------------------------------------------
    const menu = await readMenuTargets(page);
    const menuAudit = auditMenuSurface(menu, profile, options.minTargetPx, options.minFontPx, 'lobby');
    record.lobby = menuAudit;
    failures.push(...menuAudit.failures);
    await shot('01-lobby');

    // ---- DEPLOY, by touch on the real button ------------------------------
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.waitForFunction((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state?.arenaSelection?.id === id && state?.weaponReady === true;
    }, arena, { timeout: options.bootTimeoutMs });
    await shot('02-arena-selected');

    const soloBox = await page.evaluate(() => {
      const button = document.querySelector('#solo');
      if (!button || button.disabled) return null;
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    if (soloBox) {
      record.deployButton = { width: Math.round(soloBox.width), height: Math.round(soloBox.height), tappedByTouch: true };
      await tapBox(page, soloBox, 140);
    } else {
      // A deploy button a thumb cannot reach is itself the defect; the debug
      // call is used only so the rest of the cell still produces measurements.
      failures.push('deploy-button-not-tappable');
      record.deployButton = { tappedByTouch: false };
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    }
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state?.gameStarted === true && state?.matchPhase === 'active';
    }, undefined, { timeout: options.matchTimeoutMs });
    await page.waitForTimeout(6_000);

    // ---- IN-MATCH LAYOUT --------------------------------------------------
    const overlay = await readOverlay(page);
    record.overlay = { hidden: overlay.hidden, bodyLive: overlay.bodyLive, documentOverflowX: overlay.documentOverflowX, controls: overlay.controls };
    const overlayAudit = auditOverlay(overlay, profile, options.minTargetPx);
    Object.assign(record, {
      controlCount: overlayAudit.controlCount,
      controlsOffscreen: overlayAudit.controlsOffscreen,
      controlsBelowMinimum: overlayAudit.controlsBelowMinimum,
      controlOverlaps: overlayAudit.controlOverlaps,
    });
    failures.push(...overlayAudit.failures);

    const hudRoots = await readHud(page, AUDITED_HUD_ROOTS);
    const hudAudit = auditHud(hudRoots, overlay, options.minFontPx);
    record.hud = { roots: hudRoots.map(({ text, ...rest }) => rest), ...hudAudit };
    delete record.hud.failures;
    failures.push(...hudAudit.failures);
    await shot('03-in-match');

    // ---- THE LOOP, THROUGH TOUCH -----------------------------------------
    const byId = Object.fromEntries(overlay.controls.filter((control) => control.visible).map((control) => [control.id, control]));
    const play = {};

    if (byId['stick-move']) {
      const before = await playerState(page);
      await dragStick(page, byId['stick-move'], 0, -Math.min(60, byId['stick-move'].height / 2), 1_400);
      const after = await playerState(page);
      if (!before?.position || !after?.position) failures.push('move-UNMEASURED(no-player-state)');
      else {
        const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
        play.moveMetres = Number(moved.toFixed(3));
        if (moved <= 0.25) failures.push(`move-stick-does-not-move-player(${play.moveMetres}m)`);
      }
    }

    if (byId['stick-look']) {
      const before = await playerState(page);
      await dragStick(page, byId['stick-look'], Math.min(60, byId['stick-look'].width / 2), 0, 1_400);
      const after = await playerState(page);
      if (before?.yaw === null || after?.yaw === null || !before || !after) failures.push('look-UNMEASURED(no-player-state)');
      else {
        play.lookRadians = Number(Math.abs(after.yaw - before.yaw).toFixed(4));
        if (play.lookRadians <= 0.05) failures.push(`look-stick-does-not-turn-camera(${play.lookRadians}rad)`);
      }
    }

    if (byId.fire) {
      // Three taps, not one. Measured on this machine: a single tap taken a few
      // seconds after admission can land while the weapon is still settling and
      // consume nothing, which makes the gate flaky - and a flaky gate stops
      // being run. Three taps over ~2.5s is still a hard assertion (a player
      // who taps FIRE three times and fires nothing has a broken build), and the
      // attempt count is recorded so a build that needs the retries is visible
      // rather than merely green.
      const before = await playerState(page);
      play.ammoBeforeFire = before?.ammo ?? null;
      let after = before;
      let attempts = 0;
      while (attempts < 3) {
        attempts += 1;
        await tapBox(page, byId.fire, 350);
        await page.waitForTimeout(700);
        after = await playerState(page);
        if (Number.isFinite(after?.ammo) && Number.isFinite(play.ammoBeforeFire) && after.ammo < play.ammoBeforeFire) break;
      }
      play.fireTapAttempts = attempts;
      play.ammoAfterFire = after?.ammo ?? null;
      if (!(Number.isFinite(play.ammoBeforeFire) && Number.isFinite(play.ammoAfterFire) && play.ammoAfterFire < play.ammoBeforeFire)) {
        failures.push(`fire-consumed-no-ammo-in-${attempts}-taps(${play.ammoBeforeFire}->${play.ammoAfterFire})`);
      }
    }

    if (byId.reload) {
      await tapBox(page, byId.reload, 120);
      // Reloading is a state that starts and then ends; polling for the START
      // is what proves the button did something, and it is polled rather than
      // sampled once because a short magazine reload can finish inside 400ms.
      const started = await page.waitForFunction(
        () => window.__ATOMIC_ACRES_DEBUG__.snapshot().player?.reloading === true,
        undefined, { timeout: 4_000 },
      ).then(() => true).catch(() => false);
      play.reloadStarted = started;
      if (!started) {
        // A full magazine legitimately refuses to reload; the fire above spent
        // rounds, so a refusal here is a real defect - unless the reserve is
        // empty, which is recorded rather than assumed away.
        const state = await playerState(page);
        play.reloadRefusedWithReserve = state?.reserve ?? null;
        if ((state?.reserve ?? 0) > 0) failures.push('reload-button-did-not-reload');
      }
      await page.waitForTimeout(2_500);
    }

    if (byId.ads) {
      await withTouch(page, async (send) => {
        const point = [{ x: byId.ads.x + byId.ads.width / 2, y: byId.ads.y + byId.ads.height / 2, id: 1 }];
        await send('touchStart', point);
        await page.waitForTimeout(600);
        const held = await playerState(page);
        play.adsHeldWhileDown = held?.adsHeld ?? null;
        await send('touchEnd', point);
      });
      await page.waitForTimeout(300);
      const released = await playerState(page);
      play.adsHeldAfterRelease = released?.adsHeld ?? null;
      if (play.adsHeldWhileDown !== true) failures.push(`ads-button-did-not-aim(${play.adsHeldWhileDown})`);
      if (play.adsHeldAfterRelease === true) failures.push('ads-stuck-on-after-release');
    }

    if (byId['switch-weapon']) {
      const before = await playerState(page);
      await tapBox(page, byId['switch-weapon'], 120);
      await page.waitForTimeout(1_200);
      const after = await playerState(page);
      play.weaponBefore = before?.weapon ?? null;
      play.weaponAfter = after?.weapon ?? null;
      if (play.weaponBefore === play.weaponAfter) failures.push(`switch-weapon-did-not-switch(${play.weaponBefore})`);
      await tapBox(page, byId['switch-weapon'], 120);
      await page.waitForTimeout(800);
    }

    if (byId.jump) {
      const before = await playerState(page);
      await tapBox(page, byId.jump, 120);
      await page.waitForTimeout(180);
      const during = await playerState(page);
      if (before?.cameraHeight === null || during?.cameraHeight === null) failures.push('jump-UNMEASURED(no-camera)');
      else {
        play.jumpRiseMetres = Number((during.cameraHeight - before.cameraHeight).toFixed(3));
        if (play.jumpRiseMetres <= 0.05) failures.push(`jump-no-vertical-response(${play.jumpRiseMetres}m)`);
      }
      await page.waitForTimeout(1_200);
    }

    if (byId.sprint) {
      await withTouch(page, async (send) => {
        const point = [{ x: byId.sprint.x + byId.sprint.width / 2, y: byId.sprint.y + byId.sprint.height / 2, id: 1 }];
        await send('touchStart', point);
        await page.waitForTimeout(400);
        await send('touchEnd', point);
      });
      play.sprintButtonPresent = true;
    }
    record.play = play;

    // ---- AIM ASSIST TIER + PAD SUPPRESSION -------------------------------
    // Lane E shipped both at ONE viewport (844x390). A tier that is decided by
    // the last input scheme has no reason to vary by viewport, and a suppression
    // driven by CSS visibility has every reason to - which is why both are
    // re-measured on all three profiles rather than assumed to carry over.
    const assist = {};
    const tierSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    assist.tierAfterTouch = tierSample?.tier ?? null;
    assist.overlaySuppressedBeforePad = tierSample?.overlaySuppressed ?? null;
    if (assist.tierAfterTouch !== 'touch') failures.push(`aim-assist-tier-after-touch:${assist.tierAfterTouch}`);
    if (assist.overlaySuppressedBeforePad !== false) failures.push('overlay-reported-suppressed-with-no-pad');

    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    assist.overlayHiddenAfterPadConnect = await page.waitForFunction(
      () => document.getElementById('mobile-touch-controls')?.hidden === true,
      undefined, { timeout: 6_000 },
    ).then(() => true).catch(() => false);
    if (!assist.overlayHiddenAfterPadConnect) failures.push('pad-connect-did-not-suppress-touch-overlay');
    await shot('04-pad-connected');

    await page.evaluate(() => window.__FAKE_GAMEPAD__.disconnect());
    assist.overlayRestoredAfterPadDisconnect = await page.waitForFunction(
      () => document.getElementById('mobile-touch-controls')?.hidden === false,
      undefined, { timeout: 6_000 },
    ).then(() => true).catch(() => false);
    if (!assist.overlayRestoredAfterPadDisconnect) failures.push('pad-disconnect-did-not-restore-touch-overlay');
    record.aimAssist = assist;

    // ---- FRAME TIME -------------------------------------------------------
    // An UPPER BOUND on a desktop GPU, said so in the receipt. It is measured
    // anyway because a layout change that costs 30ms a frame is visible here.
    // `completedSequence` is the GPU-CONFIRMED presented-frame counter, which is
    // the one number that survives an uncomposited window; requestAnimationFrame
    // free-runs there and would report a flattering fiction.
    const framesBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.samplePresentationCounters?.() ?? null);
    const sampleStart = Date.now();
    await page.waitForTimeout(4_000);
    const framesAfter = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.samplePresentationCounters?.() ?? null);
    if (Number.isFinite(framesBefore?.completedSequence) && Number.isFinite(framesAfter?.completedSequence)) {
      const presented = framesAfter.completedSequence - framesBefore.completedSequence;
      const elapsedMs = Date.now() - sampleStart;
      record.frame = {
        presentedFrames: presented,
        windowMs: elapsedMs,
        meanFrameMs: presented > 0 ? Number((elapsedMs / presented).toFixed(2)) : null,
        approxFps: presented > 0 ? Number(((presented * 1000) / elapsedMs).toFixed(1)) : null,
      };
      if (presented <= 0) failures.push('no-frames-presented-during-sample');
    } else {
      record.frame = { presentedFrames: null, note: 'samplePresentationCounters unavailable' };
    }

    // ---- PAUSE, SETTINGS, RESUME -----------------------------------------
    const pauseBox = byId.pause;
    if (pauseBox) {
      await tapBox(page, pauseBox, 140);
      const paused = await page.waitForFunction(
        () => !document.getElementById('menu')?.classList.contains('hidden'),
        undefined, { timeout: 6_000 },
      ).then(() => true).catch(() => false);
      record.pause = { opened: paused };
      if (!paused) failures.push('pause-button-did-not-open-the-pause-menu');
      else {
        const overlayWhilePaused = await readOverlay(page);
        record.pause.overlayHiddenWhilePaused = overlayWhilePaused.hidden;
        if (overlayWhilePaused.hidden !== true) failures.push('touch-overlay-still-live-while-paused');

        // THE FALL-THROUGH CHECK. One tap must open exactly one surface. A
        // touch tap is pointerdown + a synthesised click on touchend, and the
        // click is hit-tested against the DOM the pointerdown just changed - so
        // a control that dismisses the overlay can hand its own tap to whatever
        // the newly revealed surface put underneath the finger. Lane AE found
        // the pause button doing precisely that.
        const strayModals = await page.evaluate(() => [...document.querySelectorAll('.menu-modal-panel')]
          .filter((panel) => !panel.hidden && window.getComputedStyle(panel).display !== 'none')
          .map((panel) => panel.id || panel.className));
        record.pause.straySurfacesOpenedByTheSameTap = strayModals;
        if (strayModals.length > 0) {
          failures.push(`pause-tap-fell-through-and-opened:${strayModals.join(',')}`);
        }
        const pauseMenu = await readMenuTargets(page);
        const pauseAudit = auditMenuSurface(pauseMenu, profile, options.minTargetPx, options.minFontPx, 'pause');
        Object.assign(record.pause, pauseAudit);
        delete record.pause.failures;
        failures.push(...pauseAudit.failures);
        await shot('05-pause');

        const openedOptions = await tapSelector(page, '#menu-tab-options', 140);
        record.settings = { tabTapped: openedOptions };
        if (!openedOptions) failures.push('options-tab-not-tappable');
        else {
          await page.waitForTimeout(600);
          const optionsVisible = await page.evaluate(() => {
            const panel = document.getElementById('menu-panel-options');
            return Boolean(panel) && !panel.hidden;
          });
          record.settings.panelVisible = optionsVisible;
          if (!optionsVisible) failures.push('options-panel-did-not-open');
          const settingsMenu = await readMenuTargets(page);
          const settingsAudit = auditMenuSurface(settingsMenu, profile, options.minTargetPx, options.minFontPx, 'settings');
          Object.assign(record.settings, settingsAudit);
          delete record.settings.failures;
          failures.push(...settingsAudit.failures);
          await shot('06-settings');
        }

        // Back to the deploy panel first: RESUME lives in the deploy panel, so
        // reading it while the options panel is open measures a hidden element
        // rather than the button a paused player actually taps.
        await tapSelector(page, '#menu-tab-deploy', 140);
        await page.waitForTimeout(500);
        const resumed = await tapSelector(page, '#resume', 140);
        record.pause.resumeTapped = resumed;
        if (!resumed) failures.push('resume-not-tappable');
        else {
          const back = await page.waitForFunction(
            () => document.getElementById('mobile-touch-controls')?.hidden === false,
            undefined, { timeout: 8_000 },
          ).then(() => true).catch(() => false);
          record.pause.overlayRestoredAfterResume = back;
          if (!back) failures.push('resume-did-not-restore-the-touch-overlay');
          await shot('07-resumed');
        }
      }
    }

    record.pageErrors = [...new Set(pageErrors)].slice(0, 10);
    if (record.pageErrors.length > 0) failures.push(`page-errors:${record.pageErrors.length}`);
  } catch (error) {
    record.error = String(error).slice(0, 400);
    failures.push(`threw:${record.error.slice(0, 160)}`);
    await shot('99-error');
  } finally {
    await context.close().catch(() => {});
  }

  record.verdict = failures.length === 0 ? 'pass' : 'fail';
  return record;
}

// --------------------------------------------------------------------------

export async function main() {
  const options = {
    render: arg('--render', 'quality'),
    renderer: arg('--renderer', ''),
    minTargetPx: Number(arg('--min-target-px', String(MIN_TOUCH_TARGET_PX))),
    minFontPx: Number(arg('--min-font-px', String(MIN_HUD_FONT_PX))),
    screenshotDir: arg('--screenshots', '') ? resolve(process.cwd(), arg('--screenshots', '')) : null,
    bootTimeoutMs: Number(arg('--boot-timeout-ms', '240000')),
    matchTimeoutMs: Number(arg('--match-timeout-ms', '180000')),
  };
  const out = resolve(process.cwd(), arg('--out', 'artifacts/qa/mobile-emulated-devices.json'));
  const arenas = resolveArenaRoster(arg('--arenas', ''));
  const profiles = resolveDeviceProfiles(arg('--devices', ''));

  const proxy = await startStableDevProxy({ target: new URL(arg('--url', 'http://127.0.0.1:41876')) });
  // Installed Chrome, headless. Playwright's bundled Chromium cannot acquire a
  // WebGPU device on this machine (dxil.dll Windows Error 87 out of Dawn), so a
  // WebGPU-only build never boots on it and every cell times out looking like
  // "mobile is broken". Headless is not a compromise here: measured on this
  // machine, headless Chrome gets a real adapter AND device.
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [...SILENT_ARGS, '--use-angle=d3d11', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });

  const results = [];
  try {
    for (const profile of profiles) {
      for (const arena of arenas) {
        const record = await runCell({ browser, proxy, profile, arena, options });
        results.push(record);
        console.error(`[mobile-emulated] ${profile.id} / ${arena}: ${record.verdict}`
          + `${record.failures.length ? ` - ${record.failures.join(' | ')}` : ''}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await proxy.close().catch(() => {});
  }

  const verdict = results.every((record) => record.verdict === 'pass') ? 'PASS' : 'FAIL';
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({
    verdict,
    measuredAt: new Date().toISOString(),
    devices: profiles,
    arenas,
    minTouchTargetPx: options.minTargetPx,
    minHudFontPx: options.minFontPx,
    render: options.render,
    renderer: options.renderer || 'default',
    instrumentCaveat:
      'Chromium device emulation on a desktop GPU, headless. Layout, touch input, reachability, '
      + 'target size and control collision are REAL and transfer to a handset. The frame rate is an '
      + 'UPPER BOUND no physical phone will reach. iOS/Safari is not covered at all (Playwright webkit '
      + 'has no WebGPU), nor is a real Bluetooth pad, thermal throttle, cellular network or notch '
      + 'safe-area inset. Those five rows are docs/MOBILE_PHONE_CHECKLIST.md, for the owner.',
    results,
  }, null, 2)}\n`);

  console.log('');
  for (const record of results) {
    console.log(`${record.device.padEnd(16)} ${record.arena.padEnd(16)} ${record.verdict.toUpperCase().padEnd(5)}`
      + ` controls=${record.controlCount ?? '-'} boot=${record.bootMs ?? '-'}ms fps~${record.frame?.approxFps ?? '-'}`);
    for (const failure of record.failures) console.log(`    FAIL ${failure}`);
  }
  console.log(`\nverdict=${verdict}  receipt=${out}`);
  return verdict === 'PASS' ? 0 : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(await main());

export { HERE as MODULE_DIR };
