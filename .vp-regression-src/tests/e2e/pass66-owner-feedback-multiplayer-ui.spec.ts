import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_OWNER_FEEDBACK_PEER_PORT ?? 9_064);
let peerServer: OwnedPeerServer | null = null;

test.use({ viewport: { width: 1_920, height: 1_080 } });
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_OWNER_FEEDBACK_PEER_PATH);
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
  url.searchParams.set('multiplayerQa', '1');
  url.searchParams.set('arenaSwitchQaDelayMs', '800');
  url.searchParams.set('peerQaPort', String(peerPort));
  url.searchParams.set('peerQaPath', peerServer.path);
  url.searchParams.set('seed', seed);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLButtonElement>('.map-card')].some((button) => !button.disabled));
  await page.fill('#player-name', name);
  return page;
}

async function sendChat(page: Page, text: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await expect(page.locator('#text-chat-input')).toBeFocused();
  await page.locator('#text-chat-input').fill(text);
  await page.keyboard.press('Enter');
}

test('host map changes converge and lobby controls remain stable across streak selection', async ({ browser, browserName }, testInfo) => {
  test.setTimeout(240_000);
  test.skip(browserName === 'firefox', 'Bundled headless Firefox SWGL cannot retain two simultaneous GPU pages; the single-page Firefox contract runs below.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
    browser.newContext({ viewport: { width: 1_920, height: 1_080 } }),
  ]);
  const [host, guest] = await Promise.all([
    openPlayer(hostContext, 'Owner Host', 'pass66-owner-host'),
    openPlayer(guestContext, 'Owner Guest', 'pass66-owner-guest'),
  ]);

  await host.click('#host');
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.textContent('#room-code'))!.trim();
  await guest.fill('#room-input', roomCode);
  await guest.click('#join');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));

  for (const page of [host, guest]) {
    await expect(page.locator('#text-chat')).toHaveAttribute('data-context', 'lobby');
    await expect(page.locator('#text-chat')).toHaveAttribute('data-visible', 'true');
    await expect(page.locator('#private-lobby > #text-chat')).toHaveCount(1);
  }
  const lobbyLayout = await host.evaluate(() => {
    const rect = (selector: string) => document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
    const lobby = rect('#private-lobby');
    const roster = rect('#lobby-roster');
    const chat = rect('#text-chat');
    const actions = rect('.lobby-actions');
    return {
      position: getComputedStyle(document.querySelector<HTMLElement>('#text-chat')!).position,
      withinLobby: chat.left >= lobby.left && chat.right <= lobby.right && chat.top >= lobby.top && chat.bottom <= lobby.bottom,
      afterRoster: chat.top >= roster.bottom,
      beforeActions: chat.bottom <= actions.top,
    };
  });
  expect(lobbyLayout).toEqual({ position: 'relative', withinLobby: true, afterRoster: true, beforeActions: true });

  const beforeStreakMenu = await host.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      config: {
        arenaId: state.privateMatch.arenaId,
        mode: state.privateMatch.mode,
        capacity: state.privateMatch.capacity,
        hostedBotCount: state.privateMatch.hostedBotCount,
        autoBalance: state.privateMatch.autoBalance,
      },
      members: state.privateMatch.members.map((member: any) => ({
        id: member.id, team: member.team, ready: member.ready, connected: member.connected,
      })),
    };
  });
  await host.click('#menu-tab-streaks');
  await host.locator('[data-killstreak-slot="1"]').selectOption('adrenaline');
  await expect(host.locator('#killstreak-demo-title')).toHaveText('ADRENALINE BOOST');
  expect(await host.evaluate(() => ({
    gameStarted: (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted,
    pointerLock: document.pointerLockElement?.id ?? null,
    hudHidden: document.querySelector<HTMLElement>('#hud')!.hidden,
    adrenalineHidden: document.querySelector<HTMLElement>('#adrenaline-hud')!.hidden,
  }))).toEqual({ gameStarted: false, pointerLock: null, hudHidden: true, adrenalineHidden: true });
  await host.click('#menu-tab-deploy');
  const afterStreakMenu = await host.evaluate(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      gameStarted: state.gameStarted,
      config: {
        arenaId: state.privateMatch.arenaId,
        mode: state.privateMatch.mode,
        capacity: state.privateMatch.capacity,
        hostedBotCount: state.privateMatch.hostedBotCount,
        autoBalance: state.privateMatch.autoBalance,
      },
      members: state.privateMatch.members.map((member: any) => ({
        id: member.id, team: member.team, ready: member.ready, connected: member.connected,
      })),
    };
  });
  expect(afterStreakMenu).toEqual(beforeStreakMenu);
  await expect(host.locator('#private-lobby')).toBeVisible();
  await expect(host.locator('#lobby-ready')).toBeEnabled();

  // Exercise every hosted arena plus a return transition. A one-way change can
  // miss stale scene roots, collider ownership, or forced Gun Range settings
  // that leak into the next selection.
  const hostArenaSequence = [
    'rustworks-1v1',
    'skyline-terminal',
    'gun-range',
    'atomic-acres',
    'rustworks-1v1',
  ] as const;
  for (const arenaId of hostArenaSequence) {
    await host.locator('#lobby-arena').selectOption(arenaId);
    await Promise.all([host, guest].map((page) => page.waitForFunction((expectedArenaId) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.arenaId === expectedArenaId
    ), arenaId)));
    await Promise.all([host, guest].map((page) => page.waitForFunction((expectedArenaId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.arenaSelection.id === expectedArenaId
        && state.arenaSelection.activeRoots.length === 1
        && state.arenaSelection.activeRoots[0] === expectedArenaId
        && state.arenaSelection.navigationCollidersMatchArena === true;
    }, arenaId, { timeout: 60_000 })));
    for (const page of [host, guest]) {
      await expect(page.locator('#lobby-arena')).toHaveValue(arenaId);
      await expect(page.locator('#lobby-ready')).toBeEnabled();
      await expect(page.locator('#game')).toHaveAttribute(
        'aria-label',
        `${arenaId === 'atomic-acres' ? 'Nuke Town' : arenaId === 'skyline-terminal' ? 'Terminal' : arenaId === 'rustworks-1v1' ? 'RustRig' : 'Gun Range'} multiplayer arena`,
      );
      expect(await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.durationMs))
        .toBe(arenaId === 'gun-range' ? 120_000 : 300_000);
    }
    await expect(guest.locator('#lobby-arena')).toBeDisabled();
  }

  const output = resolve(process.cwd(), 'artifacts/pass66/owner-feedback-multiplayer-ui');
  mkdirSync(output, { recursive: true });
  await host.setViewportSize({ width: 2_560, height: 1_440 });
  const lobbyShot = resolve(output, 'lobby-chat-map-sync-2560x1440.png');
  await host.screenshot({ path: lobbyShot, animations: 'disabled' });
  await testInfo.attach('lobby-chat-map-sync-2560x1440', { path: lobbyShot, contentType: 'image/png' });

  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted === true && state.matchPhase === 'active' && state.arenaSelection.id === 'rustworks-1v1';
  }, undefined, { timeout: 60_000 })));

  const guestPosition = await guest.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.position as [number, number, number]
  ));
  await host.evaluate(([x, y, z]) => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    debug.teleportPlayer(x, y, z + 5, 0, 0);
  }, guestPosition);
  await host.waitForFunction(([x, _y, z]) => {
    const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
    return remote && Math.abs(remote.authoritativePosition[0] - x) < 0.5
      && Math.abs(remote.authoritativePosition[2] - z) < 0.5;
  }, guestPosition);
  await host.evaluate(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    debug.aimAtRemoteWithOffset(0, 0);
    debug.setRenderPaused(false);
  });
  await host.waitForTimeout(750);
  await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const servedReadability = await host.evaluate(() => {
    const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0];
    return { readability: remote.readability, screenPosition: remote.screenPosition };
  });
  expect(servedReadability.readability).toMatchObject({
    color: 0xff8c3a,
    intensity: 0.25,
    allDepthTested: true,
    allDepthWriting: true,
  });
  expect(servedReadability.readability.highlightedMeshes).toBeGreaterThan(0);
  expect(servedReadability.readability.highlightedMaterials).toBeGreaterThan(0);
  expect(Math.abs(servedReadability.screenPosition[0])).toBeLessThan(0.25);
  expect(Math.abs(servedReadability.screenPosition[1])).toBeLessThan(0.25);
  const readabilityShot = resolve(output, 'remote-human-orange-highlight-2560x1440.png');
  await host.screenshot({ path: readabilityShot, animations: 'disabled' });
  await testInfo.attach('remote-human-orange-highlight-2560x1440', { path: readabilityShot, contentType: 'image/png' });

  await expect(host.locator('#text-chat')).toHaveAttribute('data-context', 'game');
  await expect(host.locator('#app > #text-chat')).toHaveCount(1);
  await sendChat(host, 'Chat geometry check.');
  await expect(guest.locator('#text-chat-log')).toContainText('Chat geometry check.');

  for (const viewport of [
    { width: 1_280, height: 720 },
    { width: 1_920, height: 1_080 },
    { width: 2_560, height: 1_440 },
    { width: 3_840, height: 2_160 },
    { width: 3_440, height: 1_440 },
  ]) {
    await host.setViewportSize(viewport);
    const audit = await host.evaluate(() => {
      const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;
      const chat = rect('#text-chat');
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const surfaces = ['#health-block', '#weapon-block', '#support-block', '#minimap', '#matchbar'];
      const chatStyle = getComputedStyle(document.querySelector<HTMLElement>('#text-chat')!);
      const line = document.querySelector<HTMLElement>('#text-chat-log p');
      return {
        viewport: [innerWidth, innerHeight],
        position: chatStyle.position,
        withinViewport: Boolean(chat && chat.left >= 0 && chat.top >= 0 && chat.right <= innerWidth && chat.bottom <= innerHeight),
        collisions: chat ? surfaces.filter((selector) => {
          const surface = rect(selector);
          return surface ? overlaps(chat, surface) : false;
        }) : ['missing-chat'],
        messageFontPx: line ? Number.parseFloat(getComputedStyle(line).fontSize) : 0,
      };
    });
    expect(audit.viewport).toEqual([viewport.width, viewport.height]);
    expect(audit.position).toBe('fixed');
    expect(audit.withinViewport).toBe(true);
    expect(audit.collisions).toEqual([]);
    expect(audit.messageFontPx).toBeGreaterThanOrEqual(viewport.width >= 2_400 ? 14 : 13);
    const viewportShot = resolve(output, `match-chat-${viewport.width}x${viewport.height}.png`);
    await host.screenshot({ path: viewportShot, animations: 'disabled' });
    await testInfo.attach(`match-chat-${viewport.width}x${viewport.height}`, {
      path: viewportShot,
      contentType: 'image/png',
    });
  }

  const collapsedChat = await host.evaluate(() => {
    const chat = document.querySelector<HTMLElement>('#text-chat')!;
    chat.dataset.visible = 'false';
    const log = document.querySelector<HTMLElement>('#text-chat-log')!;
    const header = chat.querySelector<HTMLElement>('header')!;
    return {
      opacity: Number.parseFloat(getComputedStyle(chat).opacity),
      logDisplay: getComputedStyle(log).display,
      headerVisible: header.getBoundingClientRect().height > 0,
      hint: document.querySelector<HTMLElement>('#text-chat-hint')!.textContent,
    };
  });
  expect(collapsedChat.opacity).toBeGreaterThan(0.5);
  expect(collapsedChat).toMatchObject({ logDisplay: 'none', headerVisible: true, hint: 'ENTER TO CHAT' });

  await host.setViewportSize({ width: 2_560, height: 1_440 });
  await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  await host.waitForTimeout(500);
  await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
  const matchShot = resolve(output, 'match-chat-2560x1440.png');
  await host.screenshot({ path: matchShot, animations: 'disabled' });
  await testInfo.attach('match-chat-2560x1440', { path: matchShot, contentType: 'image/png' });

  // A second round turns the prior false-positive QA shortcut into a real
  // guest-to-host authority adversary without weakening the first match's
  // retained RustRig UI/readability coverage.
  await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.endMatch());
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    document.querySelector('#rematch') !== null
  ), undefined, { timeout: 15_000 })));
  await host.click('#rematch');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted === false && state.privateMatch?.phase === 'waiting';
  }, undefined, { timeout: 30_000 })));
  await host.locator('#lobby-arena').selectOption('atomic-acres');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.privateMatch?.arenaId === 'atomic-acres' && state.arenaSelection.id === 'atomic-acres';
  }, undefined, { timeout: 60_000 })));
  await host.click('#lobby-ready');
  await guest.click('#lobby-ready');
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.click('#lobby-start');
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active' && state.arenaSelection.id === 'atomic-acres';
  }, undefined, { timeout: 60_000 })));

  const guestId = await host.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch.members
      .find((member: any) => member.name === 'Owner Guest')?.id
  ));
  expect(typeof guestId).toBe('string');
  const stagedRailgun = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.stageRailgunSpawn(0));
  await guest.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.status === 'available'
  ), undefined, { timeout: 15_000 });
  await guest.evaluate(([x, y, z]) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z)
  ), stagedRailgun.pickupPosition);
  await host.waitForFunction(({ id, pickup }) => {
    const remote = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers
      .find((candidate: any) => candidate.id === id);
    return remote && Math.hypot(
      remote.authoritativePosition[0] - pickup[0],
      remote.authoritativePosition[2] - pickup[2],
    ) < 0.25;
  }, { id: guestId, pickup: stagedRailgun.pickupPosition }, { timeout: 15_000 });
  expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.interactRailgun())).toBe(true);
  await Promise.all([host, guest].map((page) => page.waitForFunction((expectedHolderId) => {
    const railgun = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun;
    return railgun.status === 'held' && railgun.holderId === expectedHolderId;
  }, guestId, { timeout: 15_000 })));
  expect(await host.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.claimAudit.accepted
  ))).toBe(1);
  expect(await guest.evaluate(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().railgun.localHolder
  ))).toBe(true);
  await Promise.all([hostContext.close(), guestContext.close()]);
});
