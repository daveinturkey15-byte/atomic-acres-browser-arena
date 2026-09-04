/**
 * PASS 95 boot check for the netcode diagnostics overlay.
 *
 * Unit tests never boot the DOM (AGENTS.md: "2,858 passing tests once
 * accompanied a build that would not start"). This is the smallest thing that
 * proves the F3 wiring is real in the shipped bundle rather than only in a fake
 * Document: it loads the built app, asserts the overlay element does NOT exist
 * before the key, presses F3 and reads the text back off the live element,
 * presses F3 again and asserts it hid, then presses Ctrl+F3 to confirm arming
 * the recorder throws nothing. Any pageerror or console error fails it.
 *
 * It deliberately does not join a room: a solo boot is enough to prove the
 * wiring, and the per-peer numbers are covered by the unit tests. Real per-peer
 * evidence comes from a WAN session — see HOW-TO-COLLECT.md, which is the whole
 * point of the lane.
 *
 * Run against a PREVIEW server (not dev — HMR kills long-lived contexts):
 *   npx vite build && npx vite preview --port 4207 --strictPort
 *   node scripts/qa/netcode-overlay-boot-check.mjs
 *
 * Exits non-zero on any failed expectation.
 */

import { chromium } from 'playwright';

const URL = 'http://localhost:4207/';
const errors = [];
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--window-position=2560,0'],
  env: { ...process.env, PASS73_NATIVE_WEBGPU: '1' },
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 200)}`); });

// PASS 95 verification: this script does NOT start its own server, and with no
// preview running it died on a raw Playwright ERR_CONNECTION_REFUSED stack. The
// docblock above says to start one, but a gate whose failure mode is an
// unhandled exception reads as "the FEATURE broke" rather than "you forgot the
// server", so the setup mistake is named instead. The guard wraps the real
// navigation rather than probing first with fetch(): vite binds ::1 only here,
// where a fetch to `localhost` resolves to 127.0.0.1 and fails against a server
// Chrome reaches perfectly well - a preflight that disagrees with the check it
// guards would red this gate on a machine where the overlay is fine.
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
} catch (error) {
  const why = error instanceof Error ? error.message.split('\n')[0] : String(error);
  process.stderr.write([
    `netcode overlay boot check: could not load ${URL} (${why}).`,
    'This check needs a PREVIEW server (not dev - HMR kills long-lived contexts):',
    '  npx vite build && npx vite preview --port 4207 --strictPort',
    'then re-run: node scripts/qa/netcode-overlay-boot-check.mjs',
    '',
  ].join('\n'));
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(6_000);

const before = await page.locator('#netcode-diagnostics-overlay').count();
await page.keyboard.press('F3');
await page.waitForTimeout(400);
const after = await page.$eval('#netcode-diagnostics-overlay',
  (el) => ({ present: true, hidden: el.hidden, text: (el.textContent || '').slice(0, 300) })).catch(() => ({ present: false }));
await page.keyboard.press('F3');
await page.waitForTimeout(300);
const toggledOff = await page.$eval('#netcode-diagnostics-overlay', (el) => el.hidden).catch(() => null);

// Ctrl+F3 must arm the recorder without throwing.
await page.keyboard.press('Control+F3');
await page.waitForTimeout(300);

const result = {
  overlayCountBeforeF3: before,
  afterFirstF3: after,
  hiddenAfterSecondF3: toggledOff,
  errors: errors.slice(0, 12),
};
console.log(JSON.stringify(result, null, 2));
await browser.close();

const failures = [];
if (before !== 0) failures.push('the overlay element existed before F3 was pressed');
if (!after.present) failures.push('F3 did not create the overlay element');
if (after.present && after.hidden) failures.push('F3 created the overlay but left it hidden');
if (after.present && !/^NETCODE  role=/u.test(after.text)) failures.push(`unexpected overlay text: ${after.text.slice(0, 80)}`);
if (toggledOff !== true) failures.push('a second F3 did not hide the overlay');
if (errors.length > 0) failures.push(`page/console errors: ${errors.join(' | ')}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else {
  console.log('OK netcode overlay boot check');
}
