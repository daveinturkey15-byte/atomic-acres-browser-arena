#!/usr/bin/env node
// Focused diagnostic for the smoke finding: guest fires (30->24) while the
// HOST's real-mouse trigger produced no ammo drop and no fireBlock entry.
// Reads textChat.triggerHeld live so we can tell INPUT-PATH failure (trigger
// never registers) from GAME refusal (trigger registers, ammo frozen).
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:41911/';
const PEER_PORT = 9337;

function peerServerReady() {
  return new Promise((resolveReady) => {
    const probe = httpRequest({ host: '127.0.0.1', port: PEER_PORT, path: '/peerjs/id', timeout: 500 }, (response) => {
      response.resume();
      resolveReady(true);
    });
    probe.on('error', () => resolveReady(false));
    probe.on('timeout', () => { probe.destroy(); resolveReady(false); });
    probe.end();
  });
}

async function ensurePeerServer() {
  if (await peerServerReady()) return null;
  const child = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1', '--port', String(PEER_PORT),
    '--path', '/peerjs', '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
  for (let i = 0; i < 100; i += 1) {
    if (await peerServerReady()) return child;
    await new Promise((w) => setTimeout(w, 100));
  }
  child.kill();
  throw new Error('peer server never ready');
}

const peerProcess = await ensurePeerServer();
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns'],
});

async function openPage(label) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(BASE);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('render', 'quality');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(PEER_PORT));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 180000 });
  await page.fill('#player-name', label);
  return page;
}

function report(label, state) {
  console.log(`[${label}]`, JSON.stringify(state));
}

try {
  const host = await openPage('Diag Host');
  const guest = await openPage('Diag Guest');
  await host.evaluate(() => document.querySelector('#host')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await host.waitForFunction(() => (document.querySelector('#room-code')?.textContent ?? '').trim().length > 0, undefined, { timeout: 120000 });
  const roomCode = (await host.textContent('#room-code')).trim();
  await guest.fill('#room-input', roomCode);
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  for (const page of [host, guest]) {
    await page.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2, undefined, { timeout: 120000 });
  }
  await host.selectOption('#lobby-mode', 'tdm');
  await host.waitForTimeout(300);
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await host.waitForFunction(() => document.querySelector('#lobby-start')?.disabled === false, undefined, { timeout: 120000 });
  await host.click('#lobby-start');
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 120000 });
    report(label, await page.evaluate(() => ({ phase: window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase })));
  }

  // Probe A: plain mouse down on each page, watch triggerHeld + ammo.
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    const before = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { ammo: s.player.ammo, trigger: s.textChat.triggerHeld, pointerLock: s.textChat ? undefined : undefined };
    });
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const during = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { trigger: s.textChat.triggerHeld, ads: s.textChat.adsHeld };
    });
    await page.waitForTimeout(600);
    await page.mouse.up();
    const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
    report(`${label}-plain-mouse`, { before, during, after });
  }

  // Probe B (host only): focus canvas explicitly, then retry.
  {
    await host.focus('#canvas').catch(() => {});
    await host.evaluate(() => document.querySelector('canvas')?.focus?.());
    await host.click('body');
    await host.mouse.move(640, 360);
    await host.mouse.down();
    await page0Wait(200);
    const during = await host.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return { trigger: s.textChat.triggerHeld, activeElement: document.activeElement?.id ?? document.activeElement?.tagName };
    });
    await host.waitForTimeout(500);
    await host.mouse.up();
    const after = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
    report('host-canvas-focus-retry', { during, after });
  }

  // Probe C (host): what element sits at (640,360)? Is an overlay eating clicks?
  {
    const hit = await host.evaluate(() => {
      const element = document.elementFromPoint(640, 360);
      return { tag: element?.tagName, id: element?.id ?? null, cls: element?.className?.toString?.().slice(0, 80) ?? null };
    });
    report('host-elementFromPoint', hit);
  }

  // Probe D (host): debug setTriggerHeld path - does the GAME fire when the
  // trigger definitely registers?
  {
    const before = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(true));
    await host.waitForTimeout(700);
    const duringTrigger = await host.evaluate(() => ({
      trigger: window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld,
      fireBlock: window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock,
    }));
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(false));
    const after = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
    report('host-setTriggerHeld', { before, duringTrigger, after });
  }

  await browser.close();
} finally {
  await browser?.close().catch(() => {});
  peerProcess?.kill();
}
async function page0Wait(ms) { await new Promise((w) => setTimeout(w, ms)); }
