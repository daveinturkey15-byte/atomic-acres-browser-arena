import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS72_CORRECTIONS_PEER_PORT ?? 9_072);
const lastHostedRoomKey = 'atomic-acres:last-hosted-room';
let peerServer: OwnedPeerServer | null = null;

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
  viewport: { width: 1_920, height: 1_080 },
});
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('signal', 'off');
  url.searchParams.set('grass', 'off');
  url.searchParams.set('mist', 'off');
  url.searchParams.set('clouds', 'off');
  url.searchParams.set('rays', 'off');
  url.searchParams.set('renderPaused', '1');
  url.searchParams.set('externalServices', 'off');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerServer.port));
  url.searchParams.set('peerQaPath', peerServer.path);
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')]
    .some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function hostRoom(page: Page): Promise<string> {
  await page.click('#host');
  await page.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  return (await page.textContent('#room-code'))!.trim();
}

test('replicates a guest squad name and visible colour swatch to both rosters', async ({ browser }) => {
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
  ]);
  try {
    const [host, guest] = await Promise.all([
      openPlayer(hostContext, 'Pass 72 Host', 'pass72-squad-host'),
      openPlayer(guestContext, 'Pass 72 Guest', 'pass72-squad-guest'),
    ]);
    const roomCode = await hostRoom(host);
    await guest.fill('#room-input', roomCode);
    await guest.click('#join');
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
    ))));

    await guest.evaluate(() => {
      const name = document.querySelector<HTMLInputElement>('#lobby-squad-name')!;
      const color = document.querySelector<HTMLInputElement>('#lobby-squad-color')!;
      name.value = 'North Wing';
      color.value = '#123456';
      name.dispatchEvent(new Event('change', { bubbles: true }));
    });

    for (const page of [host, guest]) {
      const guestRow = page.locator('#lobby-roster .lobby-player').filter({ hasText: 'Pass 72 Guest' });
      await expect(guestRow).toHaveCount(1);
      await expect(guestRow.locator('.lobby-squad-badge')).toHaveText('North Wing');
      await expect.poll(() => guestRow.locator('.lobby-squad-swatch').evaluate((swatch) => (
        getComputedStyle(swatch).backgroundColor
      ))).toBe('rgb(18, 52, 86)');
    }
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('clears the old hosted-room pointer in the reset click turn before reload', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  try {
    const host = await openPlayer(context, 'Pass 72 Reset Host', 'pass72-reset-host');
    const oldRoomCode = await hostRoom(host);
    await expect.poll(() => host.evaluate((key) => localStorage.getItem(key), lastHostedRoomKey))
      .toBe(oldRoomCode);

    const navigation = host.waitForNavigation({ waitUntil: 'domcontentloaded' });
    const triggerReload = host.evaluate(({ key, expectedRoom }) => {
      const reset = document.querySelector<HTMLButtonElement>('#lobby-reset');
      if (!reset || reset.disabled) throw new Error('Active host reset control is unavailable');
      const before = localStorage.getItem(key);
      reset.click();
      const immediatelyAfter = localStorage.getItem(key);
      if (before !== expectedRoom || immediatelyAfter !== null) {
        throw new Error(`Hosted-room invalidation order failed: ${JSON.stringify({ before, immediatelyAfter })}`);
      }
      sessionStorage.setItem('pass72:reset-same-turn-evidence', JSON.stringify({ before, immediatelyAfter }));
      window.location.reload();
    }, { key: lastHostedRoomKey, expectedRoom: oldRoomCode });
    await Promise.all([
      navigation,
      triggerReload.catch((error: unknown) => {
        if (!/execution context was destroyed|target page, context or browser has been closed/i.test(String(error))) throw error;
      }),
    ]);

    await host.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
    await host.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')]
      .some((button) => !button.disabled));
    const sameTurn = await host.evaluate(() => JSON.parse(
      sessionStorage.getItem('pass72:reset-same-turn-evidence') ?? 'null',
    ));
    expect(sameTurn).toEqual({ before: oldRoomCode, immediatelyAfter: null });
    expect(await host.evaluate((key) => localStorage.getItem(key), lastHostedRoomKey)).toBeNull();
    await expect(host.locator('#host')).toHaveText('HOST LOBBY');
    await expect(host.locator('#host')).toHaveAttribute('data-recovery-available', 'false');
    await host.fill('#player-name', 'Pass 72 Reset Host');

    const freshRoomCode = await hostRoom(host);
    expect(freshRoomCode).not.toBe(oldRoomCode);
    await expect.poll(() => host.evaluate((key) => localStorage.getItem(key), lastHostedRoomKey))
      .toBe(freshRoomCode);
  } finally {
    await context.close();
  }
});

test('opens a distinct replacement room and durably stores only its new code', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  try {
    const host = await openPlayer(context, 'Pass 72 Fresh Code Host', 'pass72-fresh-code-host');
    const oldRoomCode = await hostRoom(host);
    await expect.poll(() => host.evaluate((key) => localStorage.getItem(key), lastHostedRoomKey))
      .toBe(oldRoomCode);

    expect(await host.evaluate((key) => {
      const reset = document.querySelector<HTMLButtonElement>('#lobby-reset');
      if (!reset || reset.disabled) throw new Error('Active host reset control is unavailable');
      reset.click();
      return localStorage.getItem(key);
    }, lastHostedRoomKey)).toBeNull();

    await host.waitForFunction((oldCode) => {
      const nextCode = document.querySelector('#room-code')?.textContent?.trim() ?? '';
      return nextCode.length > 0 && nextCode !== oldCode;
    }, oldRoomCode);
    const newRoomCode = (await host.textContent('#room-code'))!.trim();
    expect(newRoomCode).not.toBe(oldRoomCode);
    await expect.poll(() => host.evaluate((key) => localStorage.getItem(key), lastHostedRoomKey))
      .toBe(newRoomCode);
  } finally {
    await context.close();
  }
});
