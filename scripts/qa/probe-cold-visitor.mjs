// What a real visitor sees. No callsign typed, no saved profile, no debug API.
//
// verify-player-path-cdp.mjs FILLS #player-name before clicking deploy, so it can never
// see the failure a first-time visitor hits. This probe deliberately does not.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass80');
const ARENA = arg('--arena', 'high-seas');
const OUT = resolve('artifacts/qa/cold-visitor');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
// A brand new context: empty localStorage, so no remembered callsign or profile.
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });

const read = async (label) => {
  const state = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const solo = q('#solo');
    const name = q('#player-name');
    const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null;
    return {
      soloDisabled: solo?.disabled ?? null,
      callsignValue: name?.value ?? null,
      callsignInvalid: name ? name.getAttribute('aria-invalid') : null,
      nameError: (q('#player-name-error')?.textContent || '').trim() || null,
      statuses: [...document.querySelectorAll('[id*=status]')].map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 3),
      menuDisplay: q('#menu') ? getComputedStyle(q('#menu')).display : null,
      matchPhase: snap?.matchPhase ?? null,
      gameStarted: snap?.gameStarted ?? null,
    };
  });
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log(`\n--- ${label} ---\n${JSON.stringify(state, null, 2)}`);
  return state;
};

await read('1-menu-ready');

// Click the arena card exactly as a person would.
await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
await page.waitForTimeout(700);
await read('2-arena-selected');

// Click deploy WITHOUT typing a callsign.
await page.locator('#solo').click();
// Wait for the match to actually become playable, not for an arbitrary few seconds. A
// 4 s wait reported DID NOT LAUNCH on a build that launches fine in ~40 s - a probe that
// gives up before the thing it measures has happened is just a slower way to be wrong.
const launched = await page.waitForFunction(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snap && snap.matchPhase === 'active' && snap.gameStarted === true);
}, undefined, { timeout: 180_000 }).then(() => true).catch(() => false);
const after = await read('3-after-deploy-no-callsign');
after.launched = launched;

console.log(`\nVERDICT: ${after.launched ? 'LAUNCHES on the first click, no callsign typed' : 'DID NOT LAUNCH - this is what a cold visitor gets'}`);
console.log('errors:', errors.slice(0, 6));
console.log(`screenshots in ${OUT}`);
await browser.close();
