// The owner's exact journey, in Chrome launched WITHOUT the harness GPU flags.
//
// Every other probe passes --enable-unsafe-webgpu --ignore-gpu-blocklist. The owner's
// Chrome has neither. If his Chrome ends up on a different render backend, he is playing
// a different code path from every gate we run - and the Lane Q audit measured real
// fallback-path failures. So: load the ROOT chooser, click the newest-pass card, then
// deploy as a cold visitor, and REPORT THE BACKEND alongside the verdict.

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena');
const CARD = arg('--card', 'pass81');
const ARENA = arg('--arena', 'atomic-acres');

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  // Anti-throttling only by default. --extra-flag adds one Chrome flag per use, so the
  // masking flag can be bisected: the harness set ran green while default Chrome failed.
  args: [
    ...argv.flatMap((value, index) => (argv[index - 1] === '--extra-flag' ? [value] : [])),
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
const fullErrors = [];
page.on('pageerror', (e) => { errors.push('PAGE: ' + String(e).slice(0, 220)); fullErrors.push('PAGE: ' + String(e)); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push('CONSOLE: ' + m.text().slice(0, 220)); fullErrors.push('CONSOLE: ' + m.text()); } });

// 1. The root chooser, like a person following the link - or --direct to skip it and
// load the channel URL exactly as the chooser would land it, isolating the journey.
const CHANNEL_URL = arg('--channel-url', null);
if (CHANNEL_URL) {
  await page.goto(`${CHANNEL_URL}/?release=latest`, { waitUntil: 'domcontentloaded' });
} else if (argv.includes('--direct')) {
  await page.goto(`${ROOT}/channels/${CARD}/?release=latest`, { waitUntil: 'domcontentloaded' });
} else {
  await page.goto(`${ROOT}/?probe=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-release-choice="${CARD}"]`, { timeout: 60_000 });
  await page.locator(`[data-release-choice="${CARD}"]`).click();
  await page.waitForURL(`**/channels/${CARD}/**`, { timeout: 60_000 });
}

// 2. In-game identity: what does the build SAY it is?
await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });
const identity = await page.evaluate(() => {
  const badge = [...document.querySelectorAll('header *,[class*=badge],[id*=session]')]
    .map((e) => (e.textContent || '').trim()).find((t) => /PASS \d+/.test(t)) ?? null;
  return {
    badge,
    backend: document.documentElement.dataset.renderBackend ?? null,
    callsign: document.querySelector('#player-name')?.value ?? null,
  };
});
console.log('identity:', JSON.stringify(identity));

// 3. Deploy as a cold visitor: click the card, click solo, type nothing.
await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
await page.locator('#solo').click();
const waitActive = (timeout) => page.waitForFunction(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snap && snap.matchPhase === 'active' && snap.gameStarted === true);
}, undefined, { timeout }).then(() => true).catch(() => false);

let launched = await waitActive(240_000);
// The build now escalates repeated WebGPU pipeline failures by reloading onto the
// WebGL2 compat route (?renderer=webgl2) and asking for one more deploy click. Follow
// that exactly as a player would: if we were bounced onto the compat route, click the
// card and deploy once more.
if (!launched && page.url().includes('renderer=webgl2')) {
  console.log('followed fallback: page reloaded onto the WebGL2 compat route');
  await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });
  await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
  await page.locator('#solo').click();
  launched = await waitActive(240_000);
}

const finalState = await page.evaluate(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.() ?? null;
  const canvas = document.querySelector('canvas');
  return {
    matchPhase: snap?.matchPhase ?? null,
    backend: document.documentElement.dataset.renderBackend ?? null,
    canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
    status: [...document.querySelectorAll('[id*=status]')].map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 2),
  };
}).catch(() => null);

console.log(JSON.stringify({
  verdict: launched ? 'LAUNCHES in plain Chrome' : 'DID NOT LAUNCH in plain Chrome',
  finalState,
  errors: errors.slice(0, 10),
}, null, 2));
if (!launched && fullErrors.length) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('artifacts/qa/tint-swizzle', { recursive: true });
  writeFileSync('artifacts/qa/tint-swizzle/full-console-errors.txt', fullErrors.slice(0, 6).join(String.fromCharCode(10) + '=====' + String.fromCharCode(10)));
  console.log('full errors -> artifacts/qa/tint-swizzle/full-console-errors.txt');
}
await browser.close();
process.exit(launched ? 0 : 1);
