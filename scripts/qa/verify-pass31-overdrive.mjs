import { chromium, firefox } from '@playwright/test';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4173/';
const timeout = 30_000;
const errors = [];
const browser = process.env.QA_BROWSER === 'firefox'
  ? await firefox.launch({ headless: true })
  : await chromium.launch({
      headless: process.env.QA_HEADFUL !== '1',
      args: [
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--allow-loopback-in-peer-connection',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
      ],
    });

async function movePlausibly(page, x, y, z, steps = 48) {
  const start = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await page.evaluate(({ px, py, pz }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(px, py, pz), {
      px: start[0] + (x - start[0]) * t,
      py: start[1] + (y - start[1]) * t,
      pz: start[2] + (z - start[2]) * t,
    });
    await page.waitForTimeout(100);
  }
}

try {
  const host = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const guest = await browser.newPage({ viewport: { width: 640, height: 360 } });
  for (const [label, page] of [['host', host], ['guest', guest]]) {
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') console.error(`${label} console ${message.type()}: ${message.text()}`);
    });
    const url = new URL(baseUrl);
    url.searchParams.set('render', 'compatibility');
    url.searchParams.set('multiplayerQa', '1');
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout });
    await page.fill('#player-name', label === 'host' ? 'Core Host' : 'Core Guest');
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    console.log(`stage: ${label}-ready`);
  }

  await host.evaluate(() => document.querySelector('#host')?.click());
  await host.waitForFunction(() => document.querySelector('#room-code')?.textContent?.trim().length > 0, undefined, { timeout });
  const roomCode = (await host.textContent('#room-code')).trim();
  console.log('stage: room-ready');
  await guest.selectOption('#team', '1');
  await guest.fill('#room-input', roomCode);
  console.log('join diagnostics', await guest.evaluate(() => ({
    disabled: document.querySelector('#join')?.disabled,
    hidden: document.querySelector('#join')?.closest('.menu')?.classList.contains('hidden'),
    room: document.querySelector('#room-input')?.value,
    status: document.querySelector('#status')?.textContent,
  })));
  await guest.evaluate(() => document.querySelector('#join')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  try {
    await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout });
    await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotes === 1, undefined, { timeout });
  } catch (error) {
    console.error('host diagnostics', await host.evaluate(() => ({ state: window.__ATOMIC_ACRES_DEBUG__?.snapshot(), status: document.querySelector('#status')?.textContent })));
    console.error('guest diagnostics', await guest.evaluate(() => ({ state: window.__ATOMIC_ACRES_DEBUG__?.snapshot(), status: document.querySelector('#status')?.textContent })));
    throw error;
  }
  console.log('stage: peers-connected');

  const initialSpawnInMs = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive.nextSpawnAt - performance.now());
  if (initialSpawnInMs <= 90_000 || initialSpawnInMs > 120_000) {
    throw new Error(`Overdrive initial spawn was not anchored to match start: ${initialSpawnInMs}ms`);
  }

  const guestStart = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 0.02, 0));
  await guest.waitForTimeout(250);
  const hostObservedTeleport = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0]?.position ?? null);
  if (!hostObservedTeleport || Math.hypot(hostObservedTeleport[0], hostObservedTeleport[2]) < 3) {
    throw new Error(`Host admitted an implausible one-snapshot centre teleport: ${JSON.stringify(hostObservedTeleport)}`);
  }
  await guest.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), guestStart);
  await guest.waitForTimeout(250);

  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setOverdrive('available'));
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().overdrive.available === true, undefined, { timeout });
  await movePlausibly(guest, 0, 0.02, 0);
  console.log('stage: guest-paced-to-core');
  await guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().overdrive.damageMultiplier === 4, undefined, { timeout });
  await host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().overdrive.holderId !== null, undefined, { timeout });
  console.log('stage: claim-admitted');

  const beforeSecondClaim = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive);
  await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 0.02, 0));
  await host.waitForTimeout(350);
  const hostState = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive);
  const guestState = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive);
  if (hostState.pickups !== beforeSecondClaim.pickups || hostState.damageMultiplier !== 1) {
    throw new Error('Overdrive admitted a second claimant while the guest held the core');
  }
  if (guestState.damageMultiplier !== 4 || guestState.available || guestState.visible) {
    throw new Error('Guest did not receive the single host-authoritative Overdrive state');
  }

  await host.waitForFunction(() => {
    const overdrive = window.__ATOMIC_ACRES_DEBUG__?.snapshot().overdrive;
    return overdrive?.holderId === null && overdrive.expiries === 1;
  }, undefined, { timeout });
  await guest.waitForFunction(() => {
    const overdrive = window.__ATOMIC_ACRES_DEBUG__?.snapshot().overdrive;
    return overdrive?.holderId === null && overdrive.damageMultiplier === 1;
  }, undefined, { timeout });
  const result = {
    errors,
    initialSpawnInMs,
    host: hostState,
    guest: guestState,
    expiredMultiplier: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive.damageMultiplier),
  };
  console.log(JSON.stringify(result, null, 2));
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
