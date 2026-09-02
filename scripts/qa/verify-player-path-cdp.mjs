// Drives the game the way a PLAYER does, in installed Chrome over CDP.
//
// WHY THIS EXISTS. `verify-arena-boot-cdp.mjs` reports six-of-six green while the owner
// cannot start a match. It is not lying - it is answering a different question. It calls
// `window.__ATOMIC_ACRES_DEBUG__.selectArena(id)` and `.startSolo()`, a debug backdoor, so
// it proves "the engine can reach matchPhase active", never "a person can reach it through
// the menu". Everything between the two - the callsign requirement, the real arena card,
// the real deploy button, the canvas actually being sized - is unmeasured by it, and every
// one of those is a place a player can get stuck looking at a black screen.
//
// It also only ever ran against a local `vite preview` of the freshly built dist. The
// DEPLOYED site was never driven by anything before the owner opened it.
//
// So this harness touches no debug API to get into the match. It types a callsign into
// `#player-name`, clicks the real `.map-card` for the arena, clicks the real `#solo`
// button, and only then reads `__ATOMIC_ACRES_DEBUG__.snapshot()` for the verdict -
// observation is fine, driving is not.
//
// Usage:
//   node scripts/qa/verify-player-path-cdp.mjs [--url ...] [--arenas a,b] [--per-arena ms]
//
// Default --url is the LIVE Pages channel, because that is the thing the owner opens.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { defaultSelectableRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass80');
const RENDERER = arg('--renderer', 'webgpu');
const PER_ARENA_MS = Number(arg('--per-arena', '240000'));
const CALLSIGN = arg('--callsign', 'qa-player');
// PASS 85 Lane N: this default was a hardcoded six-arena literal, so Test1,
// Test2 and Map 3 were never swept by it and nothing said so. It is now
// derived from the registry (scripts/qa/arena-roster.mjs) and is a strict
// superset of what it covered before; `--arenas` still overrides it.
const ARENAS = arg('--arenas', defaultSelectableRoster())
  .split(',').map((entry) => entry.trim()).filter(Boolean);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is timer-throttled and reads EXACTLY like a
    // wedged arena. This harness's predecessor documented that trap; it applies here too.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const results = [];

for (const [index, arena] of ARENAS.entries()) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false, ms: 0, stoppedAt: null };

  try {
    // Full reload per arena: a player arrives at the menu cold, not from a previous match.
    await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}&render=quality`, { waitUntil: 'domcontentloaded' });

    record.stoppedAt = 'waiting for menu';
    await page.waitForSelector('#solo', { timeout: 120_000 });

    // 1. The callsign gate. Deploy silently refuses without one, and the only feedback is
    //    a small status line - which is exactly how a player concludes the game is broken.
    record.stoppedAt = 'callsign field';
    const callsign = page.locator('#player-name');
    if (await callsign.count() !== 1) throw new Error('no #player-name callsign input on the menu');
    await callsign.fill(CALLSIGN);

    // 2. The real arena card, not selectArena().
    record.stoppedAt = `arena card [data-arena-id="${arena}"]`;
    const card = page.locator(`.map-card[data-arena-id="${arena}"]`);
    if (await card.count() !== 1) throw new Error(`no .map-card for ${arena} - is it still in ARENA_SELECTIONS?`);
    await card.click();

    // 3. The real deploy button, not startSolo().
    record.stoppedAt = 'clicking #solo';
    await page.locator('#solo').click();

    // 4. The match must actually become playable.
    record.stoppedAt = 'waiting for matchPhase active';
    await page.waitForFunction(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      if (!debug) return false;
      const snapshot = debug.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });

    // 5. And the canvas must actually be SIZED. A backing store still at the 300x150
    //    default is a black screen no matter what the match phase says, and it is what
    //    the owner reported. matchPhase alone would call that a pass.
    record.stoppedAt = 'canvas sizing';
    const canvas = await page.evaluate(() => {
      const element = document.querySelector('canvas');
      if (!element) return null;
      return { width: element.width, height: element.height, cssWidth: element.clientWidth, cssHeight: element.clientHeight };
    });
    record.canvas = canvas;
    if (!canvas) throw new Error('no canvas in the document');
    if (canvas.width <= 300 && canvas.height <= 150) {
      throw new Error(`canvas backing store never sized (${canvas.width}x${canvas.height}) - the player sees black`);
    }

    record.ok = true;
    record.stoppedAt = null;
  } catch (error) {
    record.error = String(error).slice(0, 240);
    record.diagnostics = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const snapshot = debug ? debug.snapshot() : null;
      const status = [...document.querySelectorAll('[id*=status]')]
        .map((element) => (element.textContent || '').trim()).filter(Boolean).slice(0, 4);
      const element = document.querySelector('canvas');
      return {
        debugPresent: Boolean(debug),
        matchPhase: snapshot?.matchPhase ?? null,
        gameStarted: snapshot?.gameStarted ?? null,
        bootstrapStage: snapshot?.bootstrap?.stage ?? null,
        canvas: element ? `${element.width}x${element.height}` : null,
        status,
      };
    }).catch(() => null);
  }

  record.ms = Date.now() - startedAt;
  record.pageErrors = errors.slice(0, 6);
  results.push(record);
  console.error(`[player-path] ${arena.padEnd(18)} ${record.ok ? 'OK  ' : 'FAIL'} ${record.ms} ms${record.ok ? '' : ` — stopped at: ${record.stoppedAt} — ${record.error}`}`);
}

await browser.close();

const failed = results.filter((record) => !record.ok).map((record) => record.arena);
const verdict = failed.length ? 'FAIL' : 'PASS';
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(resolve('artifacts/qa/player-path-cdp.json'), `${JSON.stringify({ verdict, url: BASE, renderer: RENDERER, failed, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, url: BASE, failed, results: results.map((r) => ({ arena: r.arena, ok: r.ok, ms: r.ms, stoppedAt: r.stoppedAt, canvas: r.canvas ?? r.diagnostics?.canvas ?? null })) }, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
