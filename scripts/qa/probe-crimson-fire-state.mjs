#!/usr/bin/env node
// One-off probe: why does the held trigger not emit? Samples trigger state,
// fire admission diagnostics and ammo while the mouse is held down.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 200)); });

await page.goto('http://127.0.0.1:41911/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  await api.selectArena('atomic-acres');
  api.startSolo();
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 120_000 });

await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setBotsFrozen(true);
  api.placeBotAhead(6);
  api.equipWeapon('flamethrower');
  api.setAmmo('flamethrower', 999, 0);
  api.aimAtBot();
});
await page.locator('#game').click({ position: { x: 640, y: 360 } });
await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, { timeout: 10_000 });

await page.mouse.down();
await page.waitForTimeout(2500);
const state = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const snapshot = api.snapshot();
  return {
    fireBlock: snapshot.fireBlock ?? null,
    triggerHeldProbe: (() => { try { return api.snapshot().fireBlock; } catch { return null; } })(),
    admission: (() => { try { return api.sampleFireAdmissionDiagnostics(); } catch (e) { return String(e).slice(0, 120); } })(),
    flame: snapshot.timedMapWeapons?.flameStream ?? null,
    status: (document.getElementById('status')?.textContent ?? '').slice(0, 200),
  };
});
await page.mouse.up();
console.log(JSON.stringify(state, null, 2));
await browser.close();
