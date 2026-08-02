import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { startOwnedPeerServer, type OwnedPeerServer } from './pass66-e2e-support';

const peerPort = 9_063;
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
  peerServer = await startOwnedPeerServer(peerPort, '/peerjs');
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  const page = await context.newPage();
  const url = new URL('/', test.info().project.use.baseURL as string);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgl2');
  url.searchParams.set('render', 'compat');
  url.searchParams.set('signal', 'off');
  url.searchParams.set('grass', 'off');
  url.searchParams.set('mist', 'off');
  url.searchParams.set('clouds', 'off');
  url.searchParams.set('rays', 'off');
  url.searchParams.set('renderPaused', '1');
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function openChat(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('#text-chat-input')).toBeFocused();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await openChat(page);
  await page.locator('#text-chat-input').fill(text);
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat')).toHaveAttribute('data-open', 'false');
}

async function chatSnapshot(page: Page): Promise<any> {
  return page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat);
}

async function chatPlacement(page: Page): Promise<Record<string, string | number>> {
  return page.locator('#text-chat').evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      position: style.position,
      left: style.left,
      right: style.right,
      bottom: style.bottom,
      transform: style.transform,
      rightInset: Math.round((innerWidth - bounds.right) * 10) / 10,
      bottomInset: Math.round((innerHeight - bounds.bottom) * 10) / 10,
      width: Math.round(bounds.width * 10) / 10,
    };
  });
}

test('shares safe chat and restores identity plus authoritative hosted bots on rejoin', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  const guestContext = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  try {
  const host = await openPlayer(hostContext, 'Host 63', 'pass63-chat-host');
  const guest = await openPlayer(guestContext, 'Guest 63', 'pass63-chat-guest');

  await host.click('#host');
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.textContent('#room-code'))!.trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([
    host.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2),
    guest.waitForFunction(() => document.querySelectorAll('#lobby-roster .lobby-player').length === 2),
  ]);
  await host.locator('#lobby-bots').selectOption('2');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.hostedBotCount === 2
  ))));

  await sendChat(host, 'Host says hello.');
  await expect(host.locator('#text-chat-log')).toContainText('Host says hello.');
  await expect(guest.locator('#text-chat-log')).toContainText('Host says hello.');
  await expect(host.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
  await expect(guest.locator('#text-chat')).toHaveAttribute('data-visible', 'true');

  const xssText = 'Literal <img src=x onerror="window.__chatXss=1">';
  await sendChat(guest, xssText);
  await expect(host.locator('#text-chat-log')).toContainText(xssText);
  await expect(guest.locator('#text-chat-log')).toContainText(xssText);
  expect(await host.locator('#text-chat-log img').count()).toBe(0);
  expect(await guest.locator('#text-chat-log img').count()).toBe(0);
  expect(await host.evaluate(() => (window as any).__chatXss)).toBeUndefined();
  expect(await guest.evaluate(() => (window as any).__chatXss)).toBeUndefined();

  const beforeSpoof = (await chatSnapshot(host)).entries.length;
  const hostId = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members[0].id);
  expect(await guest.evaluate(({ claimedBy }) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.sendRawChat('spoofed sender', claimedBy)
  ), { claimedBy: hostId })).toBe(true);
  await host.waitForTimeout(500);
  expect((await chatSnapshot(host)).entries).toHaveLength(beforeSpoof);
  expect((await chatSnapshot(guest)).entries).toHaveLength(beforeSpoof);

  await expect(guest.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
  await expect(guest.locator('#private-lobby > #text-chat')).toHaveCount(1);
  await openChat(guest);
  await expect(guest.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
  await expect(guest.locator('#text-chat')).toHaveCSS('opacity', '1');
  await guest.keyboard.down('w');
  await guest.keyboard.up('w');
  expect((await chatSnapshot(guest)).heldKeys).not.toContain('KeyW');
  expect((await chatSnapshot(guest)).triggerHeld).toBe(false);
  await guest.keyboard.press('Escape');
  await expect(guest.locator('#text-chat')).toHaveAttribute('data-open', 'false');
  await expect(guest.locator('#text-chat-input')).toHaveValue('');
  await expect(host.locator('#text-chat')).toHaveAttribute('data-context', 'lobby');
  const lobbyChatPlacement = await chatPlacement(host);
  expect(lobbyChatPlacement.position).toBe('relative');

  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([
    host.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted === true && state.matchPhase === 'active' && state.bots.length === 2;
    }, undefined, { timeout: 60_000 }),
    guest.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted === true && state.matchPhase === 'active' && state.bots.length === 2;
    }, undefined, { timeout: 60_000 }),
  ]);
  await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await expect(host.locator('#text-chat')).toHaveAttribute('data-context', 'game');
  await expect(host.locator('#app > #text-chat')).toHaveCount(1);
  const gameChatPlacement = await chatPlacement(host);
  expect(gameChatPlacement.position).toBe('fixed');
  expect(gameChatPlacement).not.toEqual(lobbyChatPlacement);

  await sendChat(guest, 'Live match check.');
  await expect(host.locator('#text-chat-log')).toContainText('Live match check.');
  await expect(guest.locator('#text-chat-log')).toContainText('Live match check.');
  await expect(host.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
  await expect(guest.locator('#text-chat')).toHaveAttribute('data-visible', 'true');

  for (const viewport of [
    { width: 1_280, height: 720 },
    { width: 1_920, height: 1_080 },
    { width: 2_560, height: 1_440 },
    { width: 3_840, height: 2_160 },
    { width: 3_440, height: 1_440 },
  ]) {
    await host.setViewportSize(viewport);
    const overlapAudit = await host.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
      const chat = rect('#text-chat');
      const core = ['#health-block', '#weapon-block', '#support-block', '#minimap'].map((selector) => ({ selector, rect: rect(selector) }));
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return {
        viewport: [window.innerWidth, window.innerHeight],
        chat: chat ? { left: chat.left, top: chat.top, right: chat.right, bottom: chat.bottom } : null,
        collisions: chat ? core.filter((item) => item.rect && overlaps(chat, item.rect)).map((item) => item.selector) : ['missing-chat'],
      };
    });
    expect(overlapAudit.viewport).toEqual([viewport.width, viewport.height]);
    expect(overlapAudit.chat, `${viewport.width}x${viewport.height}: chat`).not.toBeNull();
    expect(overlapAudit.collisions, `${viewport.width}x${viewport.height}: collisions`).toEqual([]);
  }
  await host.setViewportSize({ width: 1_920, height: 1_080 });

  const expectedHistory = (await chatSnapshot(host)).entries.map((entry: any) => entry.text);
  const beforeRejoin = await guest.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      playerId: state.privateMatch.members.find((member: any) => member.name === 'Guest 63')?.id,
      bots: state.bots.map((bot: any) => ({ id: bot.id, weapon: bot.weapon, hp: bot.hp, alive: bot.alive })),
    };
  });
  const reliableCommitsBeforeRejoin = await host.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.reliableStateCommitMirrors
  ));
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await host.waitForFunction(() => document.querySelector('#lobby-roster')?.textContent?.includes('REJOINING'));
  await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await expect(guest.locator('#room-input')).toHaveValue(roomCode);
  await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
  await expect(guest.locator('#join')).toHaveAttribute('data-rejoin-available', 'true');
  await guest.fill('#player-name', 'Guest 63');
  await guest.click('#join');
  await guest.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted === true
      && state.matchPhase === 'active'
      && state.bots.length === 2
      && state.remotePlayers.length === 1
      && state.privateMatch?.members.every((member: any) => member.connected);
  }, undefined, { timeout: 60_000 });
  await host.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.remotePlayers.length === 1
      && state.privateMatch?.members.every((member: any) => member.connected);
  });
  await guest.waitForFunction((count) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().textChat.entries.length === count
  ), expectedHistory.length);
  expect((await chatSnapshot(guest)).entries.map((entry: any) => entry.text)).toEqual(expectedHistory);
  await expect(guest.locator('#text-chat-log')).toContainText('Live match check.');
  const afterRejoin = await guest.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      playerId: state.privateMatch.members.find((member: any) => member.name === 'Guest 63')?.id,
      bots: state.bots.map((bot: any) => ({
        id: bot.id,
        weapon: bot.weapon,
        hp: bot.hp,
        alive: bot.alive,
        visible: bot.rootVisible,
        presentationReady: bot.presentationReady,
      })),
    };
  });
  expect(afterRejoin.playerId).toBe(beforeRejoin.playerId);
  expect(afterRejoin.bots.map(({ visible: _visible, presentationReady: _ready, ...bot }: any) => bot)).toEqual(beforeRejoin.bots);
  expect(afterRejoin.bots.every((bot: any) => bot.visible && bot.presentationReady)).toBe(true);
  await expect.poll(async () => host.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.reliableStateCommitMirrors
  ))).toBeGreaterThan(reliableCommitsBeforeRejoin);

  const hostConsensus = await host.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arenaId: state.arenaSelection.id,
      matchPhase: state.matchPhase,
      activeAtEpochMs: state.privateMatch.activeAtEpochMs,
      hostedBotCount: state.privateMatch.hostedBotCount,
      memberIds: state.privateMatch.members.map((member: any) => member.id).sort(),
      scores: state.privateMatch.scores
        .map((score: any) => ({ id: score.id, kills: score.kills, deaths: score.deaths }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      botIds: state.bots.map((bot: any) => bot.id).sort(),
      matchEpoch: state.killstreak.matchEpoch,
    };
  });
  await expect.poll(async () => guest.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      arenaId: state.arenaSelection.id,
      matchPhase: state.matchPhase,
      activeAtEpochMs: state.privateMatch.activeAtEpochMs,
      hostedBotCount: state.privateMatch.hostedBotCount,
      memberIds: state.privateMatch.members.map((member: any) => member.id).sort(),
      scores: state.privateMatch.scores
        .map((score: any) => ({ id: score.id, kills: score.kills, deaths: score.deaths }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id)),
      botIds: state.bots.map((bot: any) => bot.id).sort(),
      matchEpoch: state.killstreak.matchEpoch,
    };
  }), { timeout: 15_000 }).toEqual(hostConsensus);

  } finally {
    await Promise.allSettled([hostContext.close(), guestContext.close()]);
  }
});
