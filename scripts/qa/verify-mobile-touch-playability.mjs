#!/usr/bin/env node
// Is the game PLAYABLE with touch - not "does it render at a phone size".
//
// The mobile row has been reported as PARTIAL for several passes on the
// strength of a viewport screenshot and a HUD legibility audit. Neither of
// those can tell you whether a player can move, look, or shoot, and a build
// that lays out perfectly at 390x844 while the left thumbstick does nothing is
// a build that does not work on a phone. So this drives the real touch overlay
// with real touch input and reads the result out of the game's own state:
//
//   move   drag the left stick, camera POSITION must change
//   look   drag the right stick, camera YAW must change
//   fire   tap FIRE, the ammo readout must fall
//   jump   tap JUMP, camera HEIGHT must rise
//
// Plus the reachability questions a phone actually poses: is every control
// inside the viewport, is any control smaller than the 44 CSS px minimum touch
// target both Apple's HIG and the WCAG 2.5.5 target-size guidance settle on,
// and do any two controls overlap so that one steals the other's taps.
//
// Chromium device emulation, driven by Playwright: this lane has no installed
// browser to open, the engine is the one Android ships, and Playwright's touch
// input is genuine Input.dispatchTouchEvent, not a synthesised mouse event.
// What it cannot tell you is written down in the report rather than glossed:
// this is a desktop GPU at a phone viewport, so the frame rate here is an
// upper bound no real handset will reach.
//
// Usage:
//   node scripts/qa/verify-mobile-touch-playability.mjs
//     [--url http://127.0.0.1:41876] [--arena atomic-acres]
//     [--viewports 390x844,768x1024] [--min-target-px 44]
//     [--out artifacts/qa/mobile-touch-playability.json]
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startStableDevProxy } from './stable-dev-proxy.mjs';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENA = arg('--arena', 'atomic-acres');
const MIN_TARGET_PX = Number(arg('--min-target-px', '44'));
const HEADED = argv.includes('--headed');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/mobile-touch-playability.json'));
const VIEWPORTS = arg('--viewports', '390x844,768x1024').split(',').map((entry) => {
  const [width, height] = entry.trim().split('x').map(Number);
  return { label: entry.trim(), width, height };
});

const proxy = await startStableDevProxy({ target: new URL(BASE) });

// Owner 2026-08-31: this lane must drive the INSTALLED Chrome, not Playwright's
// bundled Chromium. Measured on this machine, same flags, same device emulation,
// same URL: bundled Chromium gets an adapter but requestDevice() throws
// "DynamicLib.Open: dxil.dll Windows Error: 87" from Dawn's EnsureDXCLibraries,
// so a WebGPU-only build can never boot and every mobile cell timed out at 240 s.
// Installed Chrome acquires a device on the same call. That made the lane look
// like "mobile is broken" for a reason that has nothing to do with mobile - the
// same trap as this repo's bundled-Firefox lane, which drives firefox.exe for
// exactly this kind of reason.
const browser = await chromium.launch({
  headless: !HEADED,
  channel: 'chrome',
  args: [...OFFSCREEN_ARGS,
      '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});

/** Rectangles a finger has to hit, read from the live overlay. */
const readControlBoxes = (page) => page.evaluate(() => {
  const root = document.getElementById('mobile-touch-controls');
  if (!root) return { present: false, controls: [] };
  const controls = [...root.querySelectorAll('[data-mtc]')].map((element) => {
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return {
      id: element.getAttribute('data-mtc'),
      label: element.getAttribute('aria-label') ?? null,
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      visible: styles.visibility !== 'hidden' && styles.display !== 'none' && Number(styles.opacity) > 0.05,
    };
  });
  return {
    present: true,
    hidden: root.hidden,
    controls,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    // Horizontal overflow is the phone failure the HUD audit was built for, and
    // it is measured on the document, not the overlay: a single wide HUD row
    // makes the whole page pan sideways under the player's thumb.
    documentOverflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  };
});

// The camera lives under snapshot().deterministicReview.captureCamera, not at
// the top level. Getting this wrong is not a cosmetic bug: a null camera makes
// every movement delta compute as zero, and the harness then reports "the move
// stick does not move the player" about a game that moves perfectly well. It
// cost exactly one false accusation before it was caught, so the reader is
// checked and a missing camera is reported as MISSING rather than as no motion.
const cameraOf = (page) => page.evaluate(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null;
  const camera = state?.deterministicReview?.captureCamera ?? state?.captureCamera ?? null;
  if (!camera || !Array.isArray(camera.position)) return null;
  return { position: camera.position, yaw: camera.yaw, pitch: camera.pitch };
});

const ammoOf = (page) => page.evaluate(() => Number(document.getElementById('ammo')?.textContent ?? 'NaN'));

/** A press-drag-release with real touch input, held long enough to integrate. */
async function dragStick(page, box, dx, dy, holdMs) {
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  const send = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [{ x: startX, y: startY, id: 1 }]);
  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    await send('touchMove', [{ x: startX + (dx * step) / steps, y: startY + (dy * step) / steps, id: 1 }]);
    await page.waitForTimeout(30);
  }
  // Hold at full deflection: the look stick integrates rate against real frame
  // time, so a flick that ends immediately legitimately moves almost nothing.
  await page.waitForTimeout(holdMs);
  await send('touchEnd', [{ x: startX + dx, y: startY + dy, id: 1 }]);
  await client.detach().catch(() => {});
}

async function tapControl(page, box, holdMs = 120) {
  const client = await page.context().newCDPSession(page);
  const point = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point });
  await page.waitForTimeout(holdMs);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: point });
  await client.detach().catch(() => {});
}

const results = [];
for (const viewport of VIEWPORTS) {
  const failures = [];
  const record = { viewport: viewport.label, width: viewport.width, height: viewport.height, failures };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.width < 500 ? 3 : 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200)); });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`));

  try {
    const url = new URL('/', proxy.origin);
    url.searchParams.set('release', 'latest');
    url.searchParams.set('render', 'quality');
    url.searchParams.set('externalServices', 'off');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });

    // --- MENU, before any match. A phone player meets this first. -----------
    record.menu = await page.evaluate(() => {
      const overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      // Every control a player must be able to reach to get INTO a match.
      const interactive = [...document.querySelectorAll('#menu button, #menu select, #menu input')]
        .filter((element) => {
          const styles = window.getComputedStyle(element);
          return styles.display !== 'none' && styles.visibility !== 'hidden';
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: (element.textContent ?? element.getAttribute('aria-label') ?? element.id ?? '').trim().slice(0, 32),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            offscreen: rect.right > window.innerWidth + 1 || rect.left < -1,
          };
        });
      return { overflowX, interactiveCount: interactive.length, interactive };
    });
    if (record.menu.overflowX > 0) failures.push(`menu-horizontal-overflow:${record.menu.overflowX}px`);
    const tinyMenuTargets = (record.menu.interactive ?? []).filter((entry) => entry.height > 0 && entry.height < MIN_TARGET_PX);
    record.menuTargetsBelowMinimum = tinyMenuTargets;
    const offscreenMenu = (record.menu.interactive ?? []).filter((entry) => entry.offscreen);
    record.menuControlsOffscreen = offscreenMenu;
    if (offscreenMenu.length > 0) failures.push(`menu-controls-offscreen:${offscreenMenu.length}`);

    // --- IN MATCH ----------------------------------------------------------
    await page.evaluate(async (arena) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(arena); }, ARENA);
    await page.waitForFunction((arena) => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state?.arenaSelection?.id === arena && state?.weaponReady === true;
    }, ARENA, { timeout: 240_000 });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return state?.gameStarted === true && state?.matchPhase === 'active';
    }, undefined, { timeout: 180_000 });
    await page.waitForTimeout(6_000);

    const overlay = await readControlBoxes(page);
    record.overlay = overlay;
    if (!overlay.present) failures.push('touch-overlay-never-mounted');
    else if (overlay.hidden) failures.push('touch-overlay-hidden-during-active-match');
    if (overlay.documentOverflowX > 0) failures.push(`match-horizontal-overflow:${overlay.documentOverflowX}px`);

    const controls = (overlay.controls ?? []).filter((control) => control.visible);
    record.visibleControlCount = controls.length;

    const offscreen = controls.filter((control) => control.x < -1 || control.y < -1
      || control.x + control.width > viewport.width + 1
      || control.y + control.height > viewport.height + 1);
    record.controlsOffscreen = offscreen;
    if (offscreen.length > 0) failures.push(`controls-outside-viewport:${offscreen.map((entry) => entry.id).join('/')}`);

    const tooSmall = controls.filter((control) => Math.min(control.width, control.height) < MIN_TARGET_PX);
    record.controlsBelowMinimumTarget = tooSmall.map((control) => ({ id: control.id, width: control.width, height: control.height }));
    if (tooSmall.length > 0) failures.push(`touch-targets-below-${MIN_TARGET_PX}px:${tooSmall.map((entry) => `${entry.id}(${entry.width}x${entry.height})`).join(',')}`);

    // Overlapping controls are the defect that makes a phone build feel broken
    // rather than look broken: the thumb lands on FIRE and gets RELOAD.
    const overlaps = [];
    for (let left = 0; left < controls.length; left += 1) {
      for (let right = left + 1; right < controls.length; right += 1) {
        const a = controls[left];
        const b = controls[right];
        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX > 2 && overlapY > 2) overlaps.push({ a: a.id, b: b.id, overlapX, overlapY });
      }
    }
    record.controlOverlaps = overlaps;
    if (overlaps.length > 0) failures.push(`overlapping-controls:${overlaps.length}`);

    // --- DOES IT ACTUALLY PLAY --------------------------------------------
    const byId = Object.fromEntries(controls.map((control) => [control.id, control]));
    const play = {};

    if (byId['stick-move']) {
      const before = await cameraOf(page);
      await dragStick(page, byId['stick-move'], 0, -Math.min(60, byId['stick-move'].height / 2), 1_400);
      const after = await cameraOf(page);
      if (!before || !after) {
        play.moveStickMetres = null;
        play.moveWorks = null;
        failures.push('move-stick-UNMEASURED(camera-unreadable)');
      } else {
        const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
        play.moveStickMetres = Number(moved.toFixed(3));
        play.moveWorks = moved > 0.25;
        if (!play.moveWorks) failures.push(`move-stick-does-not-move-player(${play.moveStickMetres}m)`);
      }
    } else failures.push('move-stick-missing');

    if (byId['stick-look']) {
      const before = await cameraOf(page);
      await dragStick(page, byId['stick-look'], Math.min(60, byId['stick-look'].width / 2), 0, 1_400);
      const after = await cameraOf(page);
      if (!before || !after) {
        play.lookStickRadians = null;
        play.lookWorks = null;
        failures.push('look-stick-UNMEASURED(camera-unreadable)');
      } else {
        const turned = Math.abs(after.yaw - before.yaw);
        play.lookStickRadians = Number(turned.toFixed(4));
        play.lookWorks = turned > 0.05;
        if (!play.lookWorks) failures.push(`look-stick-does-not-turn-camera(${play.lookStickRadians}rad)`);
      }
    } else failures.push('look-stick-missing');

    if (byId.fire) {
      const before = await ammoOf(page);
      await tapControl(page, byId.fire, 350);
      await page.waitForTimeout(700);
      const after = await ammoOf(page);
      play.ammoBefore = before;
      play.ammoAfter = after;
      play.fireWorks = Number.isFinite(before) && Number.isFinite(after) && after < before;
      if (!play.fireWorks) failures.push(`fire-button-consumed-no-ammo(${before}->${after})`);
    } else failures.push('fire-button-missing');

    if (byId.jump) {
      const before = await cameraOf(page);
      await tapControl(page, byId.jump, 120);
      await page.waitForTimeout(180);
      const during = await cameraOf(page);
      if (!before || !during) {
        play.jumpRiseMetres = null;
        play.jumpWorks = null;
        failures.push('jump-button-UNMEASURED(camera-unreadable)');
      } else {
        play.jumpRiseMetres = Number((during.position[1] - before.position[1]).toFixed(3));
        play.jumpWorks = play.jumpRiseMetres > 0.05;
        if (!play.jumpWorks) failures.push(`jump-button-no-vertical-response(${play.jumpRiseMetres}m)`);
      }
    } else failures.push('jump-button-missing');

    record.play = play;
    record.consoleErrors = [...new Set(consoleErrors)].slice(0, 10);
    if (record.consoleErrors.length > 0) failures.push(`console-errors:${record.consoleErrors.length}`);
  } catch (error) {
    record.error = String(error).slice(0, 300);
    failures.push(`threw:${record.error.slice(0, 120)}`);
  } finally {
    await context.close().catch(() => {});
  }

  record.verdict = failures.length === 0 ? 'pass' : 'fail';
  results.push(record);
  console.error(`[mobile] ${viewport.label}: ${record.verdict}${failures.length ? ` - ${failures.join(' | ')}` : ''}`);
}

await browser.close();
await proxy.close();

const verdict = results.every((record) => record.verdict === 'pass') ? 'PASS' : 'FAIL';
mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({
  verdict,
  measuredAt: new Date().toISOString(),
  arena: ARENA,
  minTouchTargetPx: MIN_TARGET_PX,
  // Said plainly in the receipt so nobody reads this as a handset result.
  instrumentCaveat: 'Chromium device emulation on a desktop GPU. Layout, touch input and reachability are real; the frame rate is an upper bound no physical phone will reach, and iOS/Safari is not covered by this lane at all.',
  results,
}, null, 2)}\n`);

console.log('');
for (const record of results) {
  console.log(`${record.viewport}  ${record.verdict.toUpperCase()}  controls=${record.visibleControlCount ?? '-'}  move=${record.play?.moveWorks ?? '-'}  look=${record.play?.lookWorks ?? '-'}  fire=${record.play?.fireWorks ?? '-'}  jump=${record.play?.jumpWorks ?? '-'}`);
  for (const failure of record.failures) console.log(`    FAIL ${failure}`);
}
console.log(`\nverdict=${verdict}  receipt=${OUT}`);
process.exit(verdict === 'PASS' ? 0 : 1);
