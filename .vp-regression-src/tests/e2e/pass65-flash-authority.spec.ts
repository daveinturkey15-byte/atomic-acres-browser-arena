import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { resolve } from 'node:path';

const peerPort = 9_237;
let peerProcess: ChildProcess | null = null;

test.use({
  launchOptions: {
    args: [
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  },
});

async function peerServerReady(): Promise<boolean> {
  return new Promise((resolveReady) => {
    const request = http.get(`http://127.0.0.1:${peerPort}/peerjs`, (response) => {
      response.resume();
      resolveReady(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.once('error', () => resolveReady(false));
    request.setTimeout(250, () => {
      request.destroy();
      resolveReady(false);
    });
  });
}

test.beforeAll(async () => {
  peerProcess = spawn(process.execPath, [
    resolve('node_modules/peer/dist/bin/peerjs.js'),
    '--host', '127.0.0.1',
    '--port', String(peerPort),
    '--path', '/peerjs',
    '--no-allow_discovery',
  ], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await peerServerReady()) return;
    if (peerProcess.exitCode !== null) throw new Error(`Local PeerJS server exited with ${peerProcess.exitCode}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Local PeerJS server did not become ready');
});

test.afterAll(() => {
  if (peerProcess?.exitCode === null) peerProcess.kill();
  peerProcess = null;
});

async function openPeer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  const url = new URL('/', test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    renderer: 'webgl2', render: 'performance', signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    multiplayerQa: '1', peerQaPort: String(peerPort), seed, previewTime: '0',
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 30_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
}

test('accepts one host-authored victim-life flash and rejects forged and replayed results', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const [host, guest] = await Promise.all([
    openPeer(context, 'FLASH HOST', 'pass65-flash-host'),
    openPeer(context, 'FLASH GUEST', 'pass65-flash-guest'),
  ]);
  const errors: string[] = [];
  host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
  guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));

  try {
    await Promise.all([host, guest].map((page) => page.evaluate(async () => {
      await window.__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1');
    })));
    await host.locator('#team').selectOption('0');
    await guest.locator('#team').selectOption('1');
    await host.locator('#host').click();
    await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()), undefined, { timeout: 30_000 });
    const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
    await guest.locator('#room-input').fill(roomCode);
    await guest.locator('#join').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(
      () => document.querySelectorAll('#lobby-roster .lobby-player').length === 2,
      undefined,
      { timeout: 30_000 },
    )));
    await host.locator('#lobby-ready').click();
    await guest.locator('#lobby-ready').click();
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.locator('#lobby-start').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.gameStarted === true && snapshot.matchPhase === 'active' && snapshot.remotePlayers.length === 1;
    }, undefined, { timeout: 45_000 })));
    const guestId = (await state(host)).remotePlayers[0].id as string;
    const guestLifeId = (await state(guest)).flashAuthority.victim.targetLifeId as number;
    await expect.poll(async () => (await state(host)).flashAuthority.remoteVictimLifeIds[guestId] ?? null).toBe(guestLifeId);

    const forged = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sendForgedFlashResult());
    expect(forged).toBe(true);
    await guest.waitForTimeout(300);
    expect((await state(guest)).flashAuthority).toMatchObject({
      victim: { lastSequence: 0, accepted: 0 },
      overlayVisible: false,
      lastAdmission: null,
    });
    expect((await state(guest)).audio.flashbang).toMatchObject({ plays: 0, scheduledBeeps: 0 });
    expect((await state(host)).flashAuthority.host.resolvedActivations).toBe(0);

    expect(await host.evaluate((targetId) => (
      window.__ATOMIC_ACRES_DEBUG__.authorFlashResult(targetId, 0.72, 2_800)
    ), guestId)).toBe(true);
    await expect.poll(async () => (await state(guest)).flashAuthority.lastAdmission?.resultId ?? null).not.toBeNull();
    await expect(guest.locator('#ordnance-flash')).toBeVisible({ timeout: 1_000 });
    await expect(guest.locator('#hud')).toBeVisible();
    const admitted = await state(guest);
    expect(admitted.flashAuthority).toMatchObject({
      victim: { lastSequence: 1, accepted: 1 },
      lastAdmission: { intensity: 0.72, reducedSensory: false, audioGain: 0.72 },
    });
    expect(admitted.flashAuthority.lastAdmission.remainingDurationMs).toBeGreaterThan(0);
    expect(admitted.flashAuthority.lastAdmission.remainingDurationMs).toBeLessThanOrEqual(2_800);
    expect(admitted.audio.flashbang).toMatchObject({
      plays: 1,
      lastAudioGain: 0.72,
      immediateOnsets: 1,
      scheduledBeeps: 0,
      maximumTailMs: 745,
    });
    const remainingBeforeReplay = admitted.flashAuthority.remainingDurationMs as number;
    expect(await host.evaluate((targetId) => (
      window.__ATOMIC_ACRES_DEBUG__.replayLastFlashResult(targetId)
    ), guestId)).toBe(true);
    await expect.poll(async () => (await state(guest)).flashAuthority.victim.rejected.duplicate).toBe(1);
    const replayed = await state(guest);
    expect(replayed.flashAuthority.victim).toMatchObject({ lastSequence: 1, accepted: 1 });
    expect(replayed.audio.flashbang.plays).toBe(1);
    expect(replayed.flashAuthority.remainingDurationMs).toBeLessThanOrEqual(remainingBeforeReplay);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
