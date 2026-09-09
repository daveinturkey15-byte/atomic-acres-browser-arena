#!/usr/bin/env node
// One-lane diagnostic probe: host creates a room, swaps to the target arena,
// and we dump every console error / transition field to find WHY the lobby's
// arena synchronization never completes.
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41953/';
const ARENA = process.argv[3] ?? 'rustworks-1v1';
const PEER_PORT = 9341;

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--allow-loopback-in-peer-connection',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) console.log(`[console.${message.type()}]`, message.text().slice(0, 400));
});
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 400)));

const url = new URL(BASE);
url.searchParams.set('release', 'latest');
url.searchParams.set('renderer', 'webgpu');
url.searchParams.set('render', 'quality');
url.searchParams.set('multiplayerQa', '1');
url.searchParams.set('peerQaPort', String(PEER_PORT));
await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 120_000 });
await page.fill('#player-name', 'Probe');

console.log('backend=', await page.evaluate(() => document.documentElement.dataset.renderBackend));
console.log('creating room...');
await page.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 60_000 });

// NO guest: just swap arenas solo in the waiting lobby and watch the transition.
await page.selectOption('#lobby-arena', ARENA);
for (let tick = 0; tick < 20; tick += 1) {
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameplayArena: document.documentElement.dataset.gameplayArena,
      arenaId: document.documentElement.dataset.arenaId,
      matchPhase: s.matchPhase,
      privateMatch: s.privateMatch ? { arenaId: s.privateMatch.arenaId, phase: s.privateMatch.phase, revision: s.privateMatch.revision } : null,
      readyDisabled: document.querySelector('#lobby-ready')?.disabled ?? null,
      guidance: document.querySelector('#lobby-guidance')?.textContent?.slice(0, 80) ?? null,
      status: (document.getElementById('status')?.textContent ?? '').slice(0, 120),
      bootstrapStage: s.bootstrap?.stage ?? null,
      deterministicReview: s.deterministicReview ? { renderSubmissionPaused: s.deterministicReview.renderSubmissionPaused, matchAdmissionPresentationPaused: s.deterministicReview.matchAdmissionPresentationPaused } : null,
    };
  });
  console.log(`t+${(tick + 1) * 2}s`, JSON.stringify(state));
  if (state.readyDisabled === false || state.status.includes('failed')) break;
}
await browser.close();
