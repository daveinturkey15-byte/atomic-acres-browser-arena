import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startOwnedPeerServer, type OwnedPeerServer } from './pass66-e2e-support';

/**
 * HF-504 lobby/room flow — the browser half of the evidence.
 *
 * The pure state machine (roles, ready, kick authority, migration election,
 * snapshot handoff) is proved in `src/lobby-roles.test.ts`. What a unit test
 * CANNOT prove is that the room the player actually sees agrees with it: that
 * the badge on each roster row is the role the module resolved, that a KICK
 * button exists on the host's screen and on nobody else's, and that pressing
 * it removes that peer from EVERY roster in the room rather than only the
 * host's own view. Three real browsers on an owned PeerJS server, so the
 * removal travels over the wire it will travel over in a real match.
 */

const peerPort = Number(process.env.PASS95_LOBBY_PEER_PORT ?? 4_202);
let peerServer: OwnedPeerServer | null = null;

test.use({
  launchOptions: {
    args: [
      '--mute-audio',
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
  // The lobby is the subject; the renderer is not. Everything expensive is off
  // so three contexts fit on one GPU the owner is also using.
  for (const [key, value] of Object.entries({
    release: 'latest', renderer: 'webgl2', render: 'compat', signal: 'off',
    grass: 'off', mist: 'off', clouds: 'off', rays: 'off', renderPaused: '1',
    externalServices: 'off', multiplayerQa: '1', seed,
    peerQaPort: String(peerServer.port), peerQaPath: peerServer.path,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => (window as { __ATOMIC_ACRES_DEBUG__?: { snapshot(): { weaponReady: boolean } } })
    .__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
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

async function memberCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as {
    __ATOMIC_ACRES_DEBUG__?: { snapshot(): { privateMatch: { members: unknown[] } | null } };
  }).__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length ?? 0);
}

test('shows one host seat, guest seats for the rest, and offers KICK to the host alone', async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({
    viewport: { width: 1_920, height: 1_080 },
  })));
  try {
    const [host, guestOne, guestTwo] = await Promise.all([
      openPlayer(contexts[0], 'HF504 Host', 'hf504-host'),
      openPlayer(contexts[1], 'HF504 Guest One', 'hf504-guest-one'),
      openPlayer(contexts[2], 'HF504 Guest Two', 'hf504-guest-two'),
    ]);
    const roomCode = await hostRoom(host);
    for (const guest of [guestOne, guestTwo]) {
      await guest.fill('#room-input', roomCode);
      await guest.click('#join');
      // Sequential joins: HF-323 holds the room while an admission is in flight,
      // so two simultaneous joins race a gate this test is not about.
      await expect.poll(() => memberCount(host)).toBeGreaterThan(0);
    }
    await Promise.all([host, guestOne, guestTwo].map(
      (page) => expect.poll(() => memberCount(page), { timeout: 60_000 }).toBe(3),
    ));

    // ROLES. Exactly one host seat, and it is the same seat on every screen.
    for (const page of [host, guestOne, guestTwo]) {
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toHaveCount(1);
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toContainText('HOST');
      await expect(page.locator('#lobby-roster .lobby-player[data-seat-role="guest"]')).toHaveCount(2);
    }

    // HOST CONTROLS. The offer exists on the host's screen for the two guests
    // and on nobody else's — a guest is never shown a control it may not use.
    await expect(host.locator('#lobby-roster [data-lobby-kick]')).toHaveCount(2);
    for (const guest of [guestOne, guestTwo]) {
      await expect(guest.locator('#lobby-roster [data-lobby-kick]')).toHaveCount(0);
    }

    // The host removes guest two; the removal reaches every roster in the room.
    await host.locator('#lobby-roster .lobby-player', { hasText: 'HF504 Guest Two' })
      .locator('[data-lobby-kick]').click();
    await Promise.all([host, guestOne].map(
      (page) => expect.poll(() => memberCount(page), { timeout: 60_000 }).toBe(2),
    ));
    for (const page of [host, guestOne]) {
      await expect(page.locator('#lobby-roster .lobby-player', { hasText: 'HF504 Guest Two' })).toHaveCount(0);
      await expect(page.locator('#lobby-roster .lobby-player')).toHaveCount(2);
    }
    // The removed player is told why, and is out of the room rather than
    // sitting in it disconnected.
    await expect.poll(() => guestTwo.textContent('#network-status'), { timeout: 60_000 })
      .toContain('The host removed you from the room.');
    expect(await memberCount(guestTwo)).toBe(0);

    // The surviving guest kept its seat and its role.
    await expect(guestOne.locator('#lobby-roster .lobby-player[data-seat-role="host"]')).toHaveCount(1);
    await expect(guestOne.locator('#lobby-roster .lobby-player[data-seat-role="guest"]')).toHaveCount(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
