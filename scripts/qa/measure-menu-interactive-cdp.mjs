// How long after load can a player ACTUALLY click anything?
//
// verify-player-path-cdp.mjs says PASS while the owner cannot launch a map. Playwright's
// click() auto-waits for an element to become enabled, so a menu that is inert for a minute
// reads as a pass there - the harness patiently waits, a person clicks, nothing happens, and
// they conclude the game is broken. Which is exactly what happened.
//
// The shell renders `<button id="solo" class="primary" disabled>` and every `.map-card`
// disabled on purpose, and a later module enables them. This measures the gap.

import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass80');

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

const t0 = Date.now();
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality`, { waitUntil: 'domcontentloaded' });
const domMs = Date.now() - t0;

// Poll the exact things a player would try to click.
const timeline = [];
let soloEnabledMs = null;
let cardEnabledMs = null;
const deadline = Date.now() + 180_000;
while (Date.now() < deadline && (soloEnabledMs === null || cardEnabledMs === null)) {
  const state = await page.evaluate(() => {
    const solo = document.querySelector('#solo');
    const card = document.querySelector('.map-card');
    const name = document.querySelector('#player-name');
    const status = [...document.querySelectorAll('[id*=status]')]
      .map((e) => (e.textContent || '').trim()).filter(Boolean)[0] || null;
    return {
      soloPresent: Boolean(solo),
      soloDisabled: solo ? solo.disabled : null,
      cardDisabled: card ? card.disabled : null,
      nameDisabled: name ? name.disabled : null,
      debugReady: Boolean(window.__ATOMIC_ACRES_DEBUG__),
      status,
    };
  }).catch(() => null);
  if (state) {
    const ms = Date.now() - t0;
    const last = timeline[timeline.length - 1];
    const key = JSON.stringify(state);
    if (!last || last.key !== key) timeline.push({ ms, key, ...state });
    if (soloEnabledMs === null && state.soloDisabled === false) soloEnabledMs = ms;
    if (cardEnabledMs === null && state.cardDisabled === false) cardEnabledMs = ms;
  }
  await page.waitForTimeout(250);
}

console.log(JSON.stringify({
  url: BASE,
  domContentLoadedMs: domMs,
  firstClickableMapCardMs: cardEnabledMs,
  deployButtonEnabledMs: soloEnabledMs,
  verdict: (soloEnabledMs !== null && soloEnabledMs <= 5000) ? 'OK' : 'TOO SLOW OR NEVER',
  timeline: timeline.map((t) => ({
    ms: t.ms, soloDisabled: t.soloDisabled, cardDisabled: t.cardDisabled,
    debugReady: t.debugReady, status: t.status,
  })),
  errors: errors.slice(0, 8),
}, null, 2));

await browser.close();
