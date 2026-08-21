import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS73_NETWORK_REVEAL_PEER_PORT ?? 9_077);
let peerServer: OwnedPeerServer | null = null;

type GlassSnapshot = Readonly<{
  id: string;
  broken: boolean;
  visible: boolean;
  position: readonly [number, number, number];
  glassState: Readonly<{
    matchEpoch: number;
    revision: number;
    phase: 'intact' | 'cracked' | 'breached' | 'detached';
    damageQ: number;
    breachRevision: number | null;
    rememberedImpactIds: readonly string[];
  }> | null;
}>;

test.use({
  viewport: { width: 1_280, height: 720 },
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
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS73_NETWORK_REVEAL_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(context: BrowserContext, name: string, seed: string): Promise<Page> {
  if (!peerServer) throw new Error('Owned PeerJS server is not ready');
  const page = await context.newPage();
  const url = new URL(test.info().project.use.baseURL as string);
  for (const [key, value] of Object.entries({
    release: 'latest',
    map: 'atomic-acres',
    renderer: 'webgl2',
    render: 'performance',
    signal: 'off',
    grass: 'off',
    mist: 'off',
    clouds: 'off',
    rays: 'off',
    externalServices: 'off',
    multiplayerQa: '1',
    peerQaPort: String(peerPort),
    peerQaPath: peerServer.path,
    previewTime: '0',
    seed,
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state?.weaponReady === true
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 60_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function startMatch(
  hostContext: BrowserContext,
  guestContext: BrowserContext,
): Promise<Readonly<{ host: Page; guest: Page }>> {
  const [host, guest] = await Promise.all([
    openPlayer(hostContext, 'Pass 73 Authority Host', 'pass73-authority-host'),
    openPlayer(guestContext, 'Pass 73 Authority Guest', 'pass73-authority-guest'),
  ]);
  await host.locator('[data-menu-tab="kit"]').click();
  await host.locator('[data-custom-preset-id="custom-2"] [data-custom-modify]').click();
  await expect(host.locator('#loadout-manager')).toBeVisible();
  await host.locator('#loadout-manage-preset').selectOption('custom-2');
  await host.locator('#loadout-primary').selectOption('m14-ebr');
  await host.locator('#loadout-secondary').selectOption('explosive-crossbow');
  await host.locator('#loadout-save').click();
  await expect(host.locator('#loadout-manager')).toBeHidden();
  await host.locator('[data-menu-tab="deploy"]').click();
  expect(await host.evaluate(() => {
    const player = window.__ATOMIC_ACRES_DEBUG__!.snapshot().player;
    return { primary: player.primaryWeapon, secondary: player.secondaryWeapon };
  })).toEqual({ primary: 'm14-ebr', secondary: 'explosive-crossbow' });
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  expect(roomCode).not.toBe('');
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().privateMatch?.members.length === 2
  ), undefined, { timeout: 30_000 })));
  await host.locator('#lobby-bots').selectOption('2');
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true
      && state?.matchPhase === 'active'
      && state?.remotePlayers.length === 1
      && state?.bots.length === 2;
  }, undefined, { timeout: 90_000 })));
  await Promise.all([host, guest].map((page) => page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__!.setBotsFrozen(true);
  })));
  return Object.freeze({ host, guest });
}

async function ensurePointerLock(page: Page): Promise<void> {
  if (await page.evaluate(() => document.pointerLockElement === document.querySelector('#game'))) return;
  const game = page.locator('#game');
  const box = await game.boundingBox();
  if (!box) throw new Error('Game canvas has no input bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, {
    timeout: 5_000,
  });
}

async function registerTrustedInputProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = globalThis as typeof globalThis & {
      __PASS73_TRUSTED_INPUT__?: Array<{ button: number; trusted: boolean }>;
    };
    target.__PASS73_TRUSTED_INPUT__ = [];
    document.querySelector('#game')?.addEventListener('mousedown', (event) => {
      target.__PASS73_TRUSTED_INPUT__!.push({ button: event.button, trusted: event.isTrusted });
    }, { capture: true });
  });
}

async function glass(page: Page, windowId: string): Promise<GlassSnapshot> {
  return page.evaluate((id) => {
    const pane = window.__ATOMIC_ACRES_DEBUG__!.snapshot().breakableWindows
      .find((candidate: GlassSnapshot) => candidate.id === id);
    if (!pane) throw new Error(`Missing breakable pane ${id}`);
    return pane as GlassSnapshot;
  }, windowId);
}

async function waitForReplicatedGlass(
  page: Page,
  windowId: string,
  explosionBaseline: number,
  phase: 'breached' | 'detached',
  requireBeforeExplosion: boolean,
): Promise<void> {
  try {
    await page.waitForFunction(({ id, baseline, expectedPhase, beforeExplosion }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const pane = state?.breakableWindows.find((candidate: GlassSnapshot) => candidate.id === id) as GlassSnapshot | undefined;
      return pane?.broken === true
        && pane.visible === false
        && pane.glassState?.revision === 1
        && pane.glassState.phase === expectedPhase
        && (!beforeExplosion || state?.grenadeExplosion.total === baseline);
    }, {
      id: windowId,
      baseline: explosionBaseline,
      expectedPhase: phase,
      beforeExplosion: requireBeforeExplosion,
    }, { polling: 'raf', timeout: 8_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(({ id, baseline }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        pane: state.breakableWindows.find((candidate: GlassSnapshot) => candidate.id === id) ?? null,
        explosionBaseline: baseline,
        explosion: state.grenadeExplosion,
        role: state.privateMatch?.role ?? null,
        player: state.player,
        remotes: state.remotePlayers,
        shotProtocol: state.multiplayer?.shotProtocol ?? null,
        runtimeLog: localStorage.getItem('atomic-acres:client-runtime-log:v1'),
      };
    }, { id: windowId, baseline: explosionBaseline });
    throw new Error(`Glass authority did not converge: ${JSON.stringify(diagnostic, null, 2)}`, { cause: error });
  }
}

async function pressAds(page: Page): Promise<void> {
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().textChat.adsHeld === true, undefined, {
    polling: 'raf',
    timeout: 5_000,
  });
}

async function releaseAds(page: Page): Promise<void> {
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().textChat.adsHeld === false, undefined, {
    polling: 'raf',
    timeout: 5_000,
  });
}

async function selectLoadoutWeapon(
  host: Page,
  guest: Page,
  key: 'Digit1' | 'Digit2',
  weapon: 'm14-ebr' | 'explosive-crossbow',
): Promise<void> {
  await host.keyboard.press(key);
  await Promise.all([
    host.waitForFunction((weaponId) => (
      window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.weapon === weaponId
    ), weapon, { polling: 'raf', timeout: 8_000 }),
    guest.waitForFunction((weaponId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.remotePlayers.length === 1 && state.remotePlayers[0]?.weapon === weaponId;
    }, weapon, { polling: 'raf', timeout: 8_000 }),
  ]);
}

test('host-canonical crossbow glass and trusted ADS reveal converge across independent peers', async ({ browser }) => {
  const [hostContext, guestContext] = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const { host, guest } = await startMatch(hostContext, guestContext);
    await host.bringToFront();
    await ensurePointerLock(host);
    await registerTrustedInputProbe(host);

    const directSetup = await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      api.setBotsFrozen(true);
      api.stageWindow(0, 5);
      const staged = api.snapshot().player;
      api.teleportPlayer(...staged.position, staged.yaw, staged.pitch);
      const state = api.snapshot();
      const pane = state.breakableWindows[0] as GlassSnapshot;
      if (!pane || pane.broken) throw new Error('Direct-impact pane is not intact');
      return { windowId: pane.id, explosionBaseline: state.grenadeExplosion.total };
    });
    await selectLoadoutWeapon(host, guest, 'Digit2', 'explosive-crossbow');
    const guestDirectExplosionBaseline = await guest.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().grenadeExplosion.total
    ));
    expect((await glass(guest, directSetup.windowId)).broken).toBe(false);

    await host.mouse.click(640, 360, { button: 'left' });
    await Promise.all([
      waitForReplicatedGlass(host, directSetup.windowId, directSetup.explosionBaseline, 'breached', true),
      waitForReplicatedGlass(guest, directSetup.windowId, guestDirectExplosionBaseline, 'breached', true),
    ]);
    const [hostDirect, guestDirect] = await Promise.all([
      glass(host, directSetup.windowId),
      glass(guest, directSetup.windowId),
    ]);
    expect(guestDirect.glassState).toMatchObject({
      matchEpoch: hostDirect.glassState?.matchEpoch,
      revision: hostDirect.glassState?.revision,
      phase: hostDirect.glassState?.phase,
      damageQ: hostDirect.glassState?.damageQ,
      breachRevision: hostDirect.glassState?.breachRevision,
      rememberedImpactIds: hostDirect.glassState?.rememberedImpactIds,
    });
    expect(hostDirect.glassState?.rememberedImpactIds).toHaveLength(1);
    expect(hostDirect.glassState?.rememberedImpactIds[0]).toMatch(/^bullet:/);

    await Promise.all([host, guest].map((page) => page.waitForFunction((baseline) => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().grenadeExplosion.total > baseline
    ), page === host ? directSetup.explosionBaseline : guestDirectExplosionBaseline, { timeout: 8_000 })));
    await host.waitForTimeout(250);
    expect((await glass(host, directSetup.windowId)).glassState).toEqual(hostDirect.glassState);
    expect((await glass(guest, directSetup.windowId)).glassState).toEqual(guestDirect.glassState);

    await host.keyboard.press('KeyR');
    await host.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.player.weapon === 'explosive-crossbow'
        && state?.player.ammo === 1
        && state?.player.reloading === false;
    }, undefined, { polling: 'raf', timeout: 8_000 });

    const blastSetup = await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      api.stageWindow(3, 6);
      const staged = api.snapshot().player;
      api.teleportPlayer(...staged.position, staged.yaw, staged.pitch);
      api.placeBotRelative(0, 4.2);
      api.setBotsFrozen(true);
      api.aimAtBot('body');
      const state = api.snapshot();
      const pane = state.breakableWindows[3] as GlassSnapshot;
      const bot = state.bots[0];
      if (!pane || pane.broken || !bot?.alive) throw new Error('Blast-only fixture is not intact');
      const distanceM = Math.hypot(
        pane.position[0] - bot.position[0],
        pane.position[1] - (bot.position[1] + 1),
        pane.position[2] - bot.position[2],
      );
      return {
        windowId: pane.id,
        botId: bot.id as string,
        paneToBotDistanceM: distanceM,
        explosionBaseline: state.grenadeExplosion.total as number,
      };
    });
    expect(blastSetup.paneToBotDistanceM).toBeLessThan(3.5);
    const guestBlastExplosionBaseline = await guest.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().grenadeExplosion.total
    ));
    expect((await glass(guest, blastSetup.windowId)).broken).toBe(false);
    await host.mouse.click(640, 360, { button: 'left' });
    await Promise.all([
      waitForReplicatedGlass(host, blastSetup.windowId, blastSetup.explosionBaseline, 'detached', false),
      waitForReplicatedGlass(guest, blastSetup.windowId, guestBlastExplosionBaseline, 'detached', false),
    ]);
    const [hostBlast, guestBlast] = await Promise.all([
      glass(host, blastSetup.windowId),
      glass(guest, blastSetup.windowId),
    ]);
    expect(guestBlast.glassState).toMatchObject({
      matchEpoch: hostBlast.glassState?.matchEpoch,
      revision: hostBlast.glassState?.revision,
      phase: hostBlast.glassState?.phase,
      damageQ: hostBlast.glassState?.damageQ,
      breachRevision: hostBlast.glassState?.breachRevision,
      rememberedImpactIds: hostBlast.glassState?.rememberedImpactIds,
    });
    expect(hostBlast.glassState?.rememberedImpactIds).toHaveLength(1);
    expect(hostBlast.glassState?.rememberedImpactIds[0]).toMatch(/^explosion:/);

    await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
      api.setBotsFrozen(true);
    });
    await guest.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__!.teleportPlayer(-9, 1.7, -21.5, Math.PI, 0);
    });
    await selectLoadoutWeapon(host, guest, 'Digit1', 'm14-ebr');
    await host.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.remotePlayers[0]?.authoritativePosition[2] < -20;
    }, undefined, { timeout: 8_000 });
    expect(await host.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.segmentBlocked(-9, -12.5, -9, -21.5)
    ))).toBe(true);

    const targetIds = await host.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      const hostileBot = state.bots.find((bot: { alive: boolean; team: number }) => (
        bot.alive && bot.team !== state.player.team
      ));
      if (!state.remotePlayers[0] || !hostileBot) throw new Error('Remote and bot reveal targets are absent');
      return { remote: state.remotePlayers[0].id as string, bot: hostileBot.id as string };
    });

    await pressAds(host);
    await host.waitForFunction(({ remoteId, botId }) => {
      const reveal = window.__ATOMIC_ACRES_DEBUG__?.snapshot().dmrThermal.exactOperatorReveal;
      return reveal?.activeTargetIds.includes(remoteId)
        && reveal.activeTargetIds.includes(botId)
        && reveal.geometryIdentity === true
        && reveal.skeletonIdentity === true
        && reveal.boneWorldMatrixIdentity === true;
    }, { remoteId: targetIds.remote, botId: targetIds.bot }, { polling: 'raf', timeout: 10_000 });
    await releaseAds(host);
    await host.waitForFunction(() => (
      window.__ATOMIC_ACRES_DEBUG__?.snapshot().dmrThermal.exactOperatorReveal.activeTargets === 0
    ), undefined, { polling: 'raf', timeout: 5_000 });

    const railgunReady = await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      const staged = api.stageRailgunSpawn(0);
      api.teleportPlayer(...staged.pickupPosition);
      if (!api.interactRailgun()) return false;
      api.teleportPlayer(-9, 1.7, -12.5, 0, 0);
      return true;
    });
    expect(railgunReady).toBe(true);
    await pressAds(host);
    await host.waitForFunction(({ remoteId, botId }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const reveal = state?.dmrThermal.exactOperatorReveal;
      return state?.player.weapon === 'railgun'
        && state?.railgun.thermalVisible === true
        && reveal?.activeTargetIds.includes(remoteId)
        && reveal.activeTargetIds.includes(botId)
        && reveal.boneWorldMatrixIdentity === true;
    }, { remoteId: targetIds.remote, botId: targetIds.bot }, { polling: 'raf', timeout: 10_000 });

    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.equipWeapon('sniper'));
    await host.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.player.weapon === 'sniper'
        && state?.sniperScope.active === true
        && state?.dmrThermal.exactOperatorReveal.activeTargets === 0;
    }, undefined, { polling: 'raf', timeout: 8_000 });
    await releaseAds(host);

    const trustedInputs = await host.evaluate(() => (
      (globalThis as typeof globalThis & {
        __PASS73_TRUSTED_INPUT__?: Array<{ button: number; trusted: boolean }>;
      }).__PASS73_TRUSTED_INPUT__ ?? []
    ));
    expect(trustedInputs.filter(({ button, trusted }) => button === 0 && trusted)).toHaveLength(2);
    expect(trustedInputs.filter(({ button, trusted }) => button === 2 && trusted)).toHaveLength(2);
    expect(await Promise.all([host, guest].map(readPersistedClientRuntimeLog))).toEqual([[], []]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
