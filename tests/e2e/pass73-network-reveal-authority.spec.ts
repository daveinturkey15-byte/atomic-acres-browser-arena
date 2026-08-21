import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  readPersistedClientRuntimeLog,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS73_NETWORK_REVEAL_PEER_PORT ?? 9_077);
let peerServer: OwnedPeerServer | null = null;
const NETWORK_BROWSER_ARGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--allow-loopback-in-peer-connection',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

type GlassSnapshot = Readonly<{
  id: string;
  broken: boolean;
  visible: boolean;
  position: readonly [number, number, number];
  glassState: Readonly<{
    schemaVersion: number;
    paneId: string;
    matchEpoch: number;
    revision: number;
    phase: 'intact' | 'cracked' | 'breached' | 'detached';
    damageQ: number;
    breachRevision: number | null;
    rememberedImpactIds: readonly string[];
  }> | null;
}>;

function replicatedGlassAuthority(pane: GlassSnapshot): Readonly<Record<string, unknown>> | null {
  const state = pane.glassState;
  if (!state) return null;
  return {
    schemaVersion: state.schemaVersion,
    paneId: state.paneId,
    matchEpoch: state.matchEpoch,
    revision: state.revision,
    phase: state.phase,
    damageQ: state.damageQ,
    breachRevision: state.breachRevision,
    rememberedImpactIds: state.rememberedImpactIds,
  };
}

test.use({
  viewport: { width: 1_280, height: 720 },
  launchOptions: {
    args: NETWORK_BROWSER_ARGS,
  },
});
test.describe.configure({ timeout: 360_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS73_NETWORK_REVEAL_PEER_PATH);
});

test.afterAll(async () => {
  await peerServer?.stop();
  peerServer = null;
});

async function openPlayer(
  context: BrowserContext,
  name: string,
  seed: string,
  eventDelayQaMs = 0,
): Promise<Page> {
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
    eventDelayQaMs: String(eventDelayQaMs),
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

async function configureM14CrossbowLoadout(page: Page): Promise<void> {
  await page.locator('[data-menu-tab="kit"]').click();
  await page.locator('[data-custom-preset-id="custom-2"] [data-custom-modify]').click();
  await expect(page.locator('#loadout-manager')).toBeVisible();
  await page.locator('#loadout-manage-preset').selectOption('custom-2');
  await page.locator('#loadout-primary').selectOption('m14-ebr');
  await page.locator('#loadout-secondary').selectOption('explosive-crossbow');
  await page.locator('#loadout-save').click();
  await expect(page.locator('#loadout-manager')).toBeHidden();
  await page.locator('[data-menu-tab="deploy"]').click();
  expect(await page.evaluate(() => {
    const player = window.__ATOMIC_ACRES_DEBUG__!.snapshot().player;
    return { primary: player.primaryWeapon, secondary: player.secondaryWeapon };
  })).toEqual({ primary: 'm14-ebr', secondary: 'explosive-crossbow' });
}

async function startMatch(
  hostContext: BrowserContext,
  guestContext: BrowserContext,
  options: Readonly<{
    hostEventDelayQaMs?: number;
    guestEventDelayQaMs?: number;
    hostedBotCount?: 0 | 2;
  }> = {},
): Promise<Readonly<{ host: Page; guest: Page }>> {
  const hostedBotCount = options.hostedBotCount ?? 2;
  const [host, guest] = await Promise.all([
    openPlayer(
      hostContext,
      'Pass 73 Authority Host',
      'pass73-authority-host',
      options.hostEventDelayQaMs ?? 0,
    ),
    openPlayer(
      guestContext,
      'Pass 73 Authority Guest',
      'pass73-authority-guest',
      options.guestEventDelayQaMs ?? 0,
    ),
  ]);
  await Promise.all([host, guest].map(configureM14CrossbowLoadout));
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
  await host.locator('#lobby-bots').selectOption(String(hostedBotCount));
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction((expectedBots) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true
      && state?.matchPhase === 'active'
      && state?.remotePlayers.length === 1
      && state?.bots.length === expectedBots;
  }, hostedBotCount, { timeout: 90_000 })));
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    try {
      await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#game'), undefined, {
        timeout: 5_000,
      });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(250);
    }
  }
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

async function fireTrustedThenForegroundReceiver(shooter: Page, receiver: Page): Promise<void> {
  await shooter.mouse.down({ button: 'left' });
  try {
    await receiver.bringToFront();
  } finally {
    await shooter.mouse.up({ button: 'left' });
  }
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
      const mutation = state?.crossbowGlassAuthority.recentAuthoritativeMutations
        .findLast((entry: { windowId: string; phase: string; revision: number; explosionCountAtMutation: number }) => (
          entry.windowId === id && entry.phase === 'impact' && entry.revision === 1
        )) ?? state?.crossbowGlassAuthority.recentCanonicalClientMutations
        .findLast((entry: { windowId: string; phase: string; revision: number; explosionCountAtMutation: number }) => (
          entry.windowId === id && entry.phase === 'impact' && entry.revision === 1
        ));
      return pane?.broken === true
        && pane.visible === false
        && pane.glassState?.revision === 1
        && pane.glassState.phase === expectedPhase
        && (!beforeExplosion || mutation?.explosionCountAtMutation === baseline);
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
        shotProtocol: state.networkSync?.shotProtocol ?? null,
        shotTimeline: state.networkSync?.shotTimeline ?? null,
        crossbowGlassAuthority: state.crossbowGlassAuthority,
        networkLifecycle: state.networkLifecycle,
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
  shooter: Page,
  observer: Page,
  key: 'Digit1' | 'Digit2',
  weapon: 'm14-ebr' | 'explosive-crossbow',
): Promise<void> {
  await shooter.keyboard.press(key);
  await Promise.all([
    shooter.waitForFunction((weaponId) => (
      window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.weapon === weaponId
    ), weapon, { polling: 'raf', timeout: 20_000 }),
    observer.waitForFunction((weaponId) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.remotePlayers.length === 1 && state.remotePlayers[0]?.weapon === weaponId;
    }, weapon, { polling: 'raf', timeout: 20_000 }),
  ]);
}

async function waitForAdsSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const readiness = window.__ATOMIC_ACRES_DEBUG__?.sampleDmrThermalReadiness();
    return readiness?.weapon === 'm14-ebr' && readiness.adsProgress >= 0.95;
  }, undefined, { polling: 'raf', timeout: 8_000 });
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
      waitForReplicatedGlass(guest, directSetup.windowId, guestDirectExplosionBaseline, 'breached', false),
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
        && reveal.boneWorldMatrixIdentity === true
        && reveal.exactModelVisible === true
        && reveal.exactModelColorWrite === true
        && reveal.exactModelOpacity > 0
        && reveal.exactModelDepthTestDisabled === true
        && reveal.haloVisible === true
        && reveal.haloColorWrite === true
        && reveal.haloOpacity === 0.88
        && reveal.haloDepthTestDisabled === true;
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
      const railgunReveal = state?.railgun.presentation;
      return state?.player.weapon === 'railgun'
        && state?.railgun.thermalVisible === true
        && reveal?.activeTargetIds.includes(remoteId)
        && reveal.activeTargetIds.includes(botId)
        && reveal.boneWorldMatrixIdentity === true
        && railgunReveal?.exactModelVisible === true
        && railgunReveal.exactModelColorWrite === true
        && railgunReveal.exactModelOpacity > 0
        && railgunReveal.exactModelDepthTestDisabled === true
        && railgunReveal.exactHaloVisible === true
        && railgunReveal.exactHaloColorWrite === true
        && railgunReveal.exactHaloOpacity === 0.88
        && railgunReveal.exactHaloDepthTestDisabled === true
        && railgunReveal.exactOperatorComplete === true;
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

test('guest crossbow glass authority and rematch reset converge through impaired host transport', async ({ browser }, testInfo) => {
  test.setTimeout(480_000);
  const [hostContext, guestContext] = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const { host, guest } = await startMatch(hostContext, guestContext, {
      hostEventDelayQaMs: 250,
      hostedBotCount: 0,
    });
    expect(await Promise.all([host, guest].map((page) => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().networkLifecycle.qaEventDelayMs
    ))))).toEqual([250, 0]);
    await guest.bringToFront();
    await ensurePointerLock(guest);
    await Promise.all([host, guest].map(registerTrustedInputProbe));

    const directSetup = await guest.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      const before = api.snapshot();
      const paneIndex = before.breakableWindows.findIndex((candidate: GlassSnapshot, index: number) => (
        index !== 3 && candidate.broken === false && (candidate.glassState?.revision ?? 0) === 0
      ));
      if (paneIndex < 0) throw new Error('No pristine direct-impact pane remains after match admission');
      api.stageWindow(paneIndex, 3);
      const state = api.snapshot();
      const pane = state.breakableWindows[paneIndex] as GlassSnapshot;
      if (!pane || pane.broken || (pane.glassState?.revision ?? 0) !== 0) throw new Error('Guest direct pane is not pristine');
      return {
        paneIndex,
        windowId: pane.id,
        playerPosition: state.player.position as [number, number, number],
        explosionBaseline: state.grenadeExplosion.total as number,
        predictedBaseline: state.crossbowGlassAuthority.predictedImpactRejections as number,
        canonicalBaseline: state.crossbowGlassAuthority.canonicalClientMutations as number,
      };
    });
    await host.waitForFunction(({ position }) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
      return remote && Math.hypot(
        remote.authoritativePosition[0] - position[0],
        remote.authoritativePosition[1] - position[1],
        remote.authoritativePosition[2] - position[2],
      ) < 0.35;
    }, { position: directSetup.playerPosition }, { polling: 'raf', timeout: 8_000 });
    await selectLoadoutWeapon(guest, host, 'Digit2', 'explosive-crossbow');
    const directHostBaseline = await host.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        explosion: state.grenadeExplosion.total as number,
        impactMutations: state.crossbowGlassAuthority.authoritativeImpactMutations as number,
      };
    });
    expect(await glass(host, directSetup.windowId)).toMatchObject({ broken: false });
    expect((await glass(host, directSetup.windowId)).glassState?.revision ?? 0).toBe(0);

    await guest.mouse.click(640, 360, { button: 'left' });
    const predictedGateHandle = await guest.waitForFunction(({ id, predictedBaseline, canonicalBaseline }) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      const pane = state?.breakableWindows.find((candidate: GlassSnapshot) => candidate.id === id) as GlassSnapshot | undefined;
      const authority = state?.crossbowGlassAuthority;
      const predictionRejected = authority?.predictedImpactRejections === predictedBaseline + 1
        && authority.lastPredictedImpactRejection?.windowId === id
        && authority.lastPredictedImpactRejection.revision === 0;
      const canonicalWonRace = authority?.predictedImpactRejections === predictedBaseline
        && authority.canonicalClientMutations === canonicalBaseline + 1
        && authority.lastCanonicalClientMutation?.windowId === id
        && authority.lastCanonicalClientMutation.revision === 1
        && pane?.broken === true;
      if (predictionRejected) return { outcome: 'prediction-rejected', pane, authority };
      if (canonicalWonRace) return { outcome: 'canonical-won-race', pane, authority };
      return null;
    }, {
      id: directSetup.windowId,
      predictedBaseline: directSetup.predictedBaseline,
      canonicalBaseline: directSetup.canonicalBaseline,
    }, { polling: 'raf', timeout: 3_000 });
    const predictedGate = await predictedGateHandle.jsonValue();
    await predictedGateHandle.dispose();
    if (predictedGate.outcome === 'prediction-rejected') {
      expect(predictedGate.authority.lastPredictedImpactRejection).toMatchObject({
        windowId: directSetup.windowId,
        phase: 'impact',
        revision: 0,
      });
    } else {
      expect(predictedGate.outcome).toBe('canonical-won-race');
      expect(predictedGate.authority.predictedImpactRejections).toBe(directSetup.predictedBaseline);
      expect(predictedGate.authority.lastCanonicalClientMutation).toMatchObject({
        windowId: directSetup.windowId,
        phase: 'impact',
        revision: 1,
      });
    }

    await Promise.all([
      waitForReplicatedGlass(host, directSetup.windowId, directHostBaseline.explosion, 'breached', true),
      waitForReplicatedGlass(guest, directSetup.windowId, directSetup.explosionBaseline, 'breached', false),
    ]);
    await Promise.all([
      host.waitForFunction((baseline) => (
        window.__ATOMIC_ACRES_DEBUG__!.snapshot().grenadeExplosion.total > baseline
      ), directHostBaseline.explosion, { timeout: 8_000 }),
      guest.waitForFunction((baseline) => (
        window.__ATOMIC_ACRES_DEBUG__!.snapshot().grenadeExplosion.total > baseline
      ), directSetup.explosionBaseline, { timeout: 8_000 }),
    ]);
    const [hostDirect, guestDirect] = await Promise.all([host, guest].map((page) => page.evaluate((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        pane: state.breakableWindows.find((candidate: GlassSnapshot) => candidate.id === id) as GlassSnapshot,
        authority: state.crossbowGlassAuthority,
      };
    }, directSetup.windowId)));
    expect(replicatedGlassAuthority(guestDirect.pane)).toEqual(replicatedGlassAuthority(hostDirect.pane));
    const hostDirectEvents = hostDirect.authority.recentAuthoritativeMutations.filter((entry: any) => (
      entry.windowId === directSetup.windowId
    ));
    const guestDirectEvents = guestDirect.authority.recentCanonicalClientMutations.filter((entry: any) => (
      entry.windowId === directSetup.windowId
    ));
    expect(hostDirectEvents).toHaveLength(1);
    expect(guestDirectEvents).toHaveLength(1);
    expect(hostDirectEvents[0]).toMatchObject({
      phase: 'impact',
      revision: 1,
      explosionCountAtMutation: directHostBaseline.explosion,
    });
    expect(guestDirectEvents[0]).toMatchObject({
      windowId: hostDirectEvents[0].windowId,
      actionNonce: hostDirectEvents[0].actionNonce,
      phase: hostDirectEvents[0].phase,
      revision: hostDirectEvents[0].revision,
    });
    if (predictedGate.outcome === 'prediction-rejected') {
      expect(predictedGate.authority.lastPredictedImpactRejection.actionNonce).toBe(hostDirectEvents[0].actionNonce);
    }
    await guest.waitForTimeout(300);
    expect((await glass(host, directSetup.windowId)).glassState?.revision).toBe(1);
    expect((await glass(guest, directSetup.windowId)).glassState?.revision).toBe(1);

    await guest.keyboard.press('KeyR');
    await guest.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.player.weapon === 'explosive-crossbow'
        && state.player.ammo === 1
        && state.player.reloading === false;
    }, undefined, { polling: 'raf', timeout: 8_000 });

    const blastStage = await guest.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      const before = api.snapshot();
      // The ground-front pane has the upper-front pane inside the same 7 m
      // blast sphere but behind the intervening authored wall/sill geometry.
      // The rear pane has no same-side upper sibling, so it cannot prove the
      // live line-of-sight exclusion contract.
      const paneIndex = before.breakableWindows[4]?.broken === false
        && (before.breakableWindows[4]?.glassState?.revision ?? 0) === 0
        ? 4
        : before.breakableWindows.findIndex((candidate: GlassSnapshot) => (
          candidate.broken === false && (candidate.glassState?.revision ?? 0) === 0
        ));
      if (paneIndex < 0) throw new Error('No pristine blast pane remains after match admission');
      api.stageWindow(paneIndex, 6);
      const state = api.snapshot();
      const pane = state.breakableWindows[paneIndex] as GlassSnapshot;
      if (!pane || pane.broken || (pane.glassState?.revision ?? 0) !== 0) throw new Error('Guest blast pane is not pristine');
      return {
        paneIndex,
        windowId: pane.id,
        playerPosition: state.player.position as [number, number, number],
        explosionBaseline: state.grenadeExplosion.total as number,
      };
    });
    await host.waitForFunction(({ position }) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
      return remote && Math.hypot(
        remote.authoritativePosition[0] - position[0],
        remote.authoritativePosition[1] - position[1],
        remote.authoritativePosition[2] - position[2],
      ) < 0.35;
    }, { position: blastStage.playerPosition }, { polling: 'raf', timeout: 8_000 });
    const blastFixture = await host.evaluate(({ targetWindowId, guestPosition, guestYaw }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      const forward = [-Math.sin(guestYaw), -Math.cos(guestYaw)] as const;
      const targetEye: [number, number, number] = [
        guestPosition[0] + forward[0] * 4.2,
        1.7,
        guestPosition[2] + forward[1] * 4.2,
      ];
      if (api.collisionProbe(targetEye[0], targetEye[2])) {
        throw new Error('Guest blast target position is blocked');
      }
      api.teleportPlayer(...targetEye, guestYaw + Math.PI, 0);
      const blastPoint: [number, number, number] = [targetEye[0], 0.98, targetEye[2]];
      const inspection = api.inspectCrossbowBlastWindows(blastPoint, null, 7);
      const state = api.snapshot();
      return {
        targetWindowId,
        targetEye,
        blastPoint,
        inspection,
        hostExplosionBaseline: state.grenadeExplosion.total as number,
        authorityBaseline: state.crossbowGlassAuthority.authoritativeExplosionMutations as number,
      };
    }, {
      targetWindowId: blastStage.windowId,
      guestPosition: blastStage.playerPosition,
      guestYaw: await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().player.yaw as number),
    });
    await guest.waitForFunction((position) => {
      const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
      return remote?.hp === 100 && Math.hypot(
        remote.authoritativePosition[0] - position[0],
        remote.authoritativePosition[1] - position[1],
        remote.authoritativePosition[2] - position[2],
      ) < 0.25;
    }, blastFixture.targetEye, { polling: 'raf', timeout: 8_000 });
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.aimAtRemote('body'));
    const targetInspection = blastFixture.inspection.find((entry: any) => entry.windowId === blastStage.windowId);
    const occludedPane = blastFixture.inspection.find((entry: any) => (
      entry.windowId !== blastStage.windowId && entry.revision === 0 && entry.inRadius && entry.pathBlocked
    ));
    expect(targetInspection).toMatchObject({ revision: 0, inRadius: true, pathBlocked: false });
    expect(occludedPane, JSON.stringify(blastFixture.inspection, null, 2)).toBeDefined();
    expect((await glass(guest, blastStage.windowId)).glassState?.revision ?? 0).toBe(0);

    await guest.mouse.click(640, 360, { button: 'left' });
    await Promise.all([
      waitForReplicatedGlass(host, blastStage.windowId, blastFixture.hostExplosionBaseline, 'detached', false),
      waitForReplicatedGlass(guest, blastStage.windowId, blastStage.explosionBaseline, 'detached', false),
    ]);
    const [hostBlast, guestBlast] = await Promise.all([host, guest].map((page) => page.evaluate((id) => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        pane: state.breakableWindows.find((candidate: GlassSnapshot) => candidate.id === id) as GlassSnapshot,
        authority: state.crossbowGlassAuthority,
      };
    }, blastStage.windowId)));
    expect(replicatedGlassAuthority(guestBlast.pane)).toEqual(replicatedGlassAuthority(hostBlast.pane));
    const hostBlastEvents = hostBlast.authority.recentAuthoritativeMutations.filter((entry: any) => (
      entry.windowId === blastStage.windowId
    ));
    const guestBlastEvents = guestBlast.authority.recentCanonicalClientMutations.filter((entry: any) => (
      entry.windowId === blastStage.windowId
    ));
    expect(hostBlastEvents).toHaveLength(1);
    expect(guestBlastEvents).toHaveLength(1);
    expect(hostBlastEvents[0]).toMatchObject({ phase: 'explosion', revision: 1 });
    expect(guestBlastEvents[0]).toEqual(hostBlastEvents[0]);
    expect(hostBlast.authority.authoritativeExplosionMutations).toBeGreaterThan(
      blastFixture.authorityBaseline,
    );
    const [hostOccluded, guestOccluded] = await Promise.all([
      glass(host, occludedPane!.windowId),
      glass(guest, occludedPane!.windowId),
    ]);
    expect(hostOccluded).toMatchObject({ broken: false, visible: true, glassState: { revision: 0, phase: 'intact' } });
    expect(guestOccluded.glassState).toEqual(hostOccluded.glassState);

    const oldMatchEpoch = hostBlast.pane.glassState!.matchEpoch;
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.endMatch());
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
      window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'ended'
    ), undefined, { timeout: 8_000 })));
    await host.locator('#rematch').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === false && state.privateMatch?.phase === 'waiting';
    }, undefined, { timeout: 8_000 })));
    await host.locator('#lobby-ready').click();
    await guest.locator('#lobby-ready').click();
    await expect(host.locator('#lobby-start')).toBeEnabled();
    await host.locator('#lobby-start').click();
    await Promise.all([host, guest].map((page) => page.waitForFunction((priorEpoch) => {
      const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
      return state?.gameStarted === true
        && state.matchPhase === 'active'
        && state.player.alive === true
        && state.player.hp === 100
        && state.breakableWindows.length > 0
        && state.breakableWindows.every((pane: GlassSnapshot) => (
          pane.broken === false && pane.visible === true
            && pane.glassState?.matchEpoch > priorEpoch
            && pane.glassState.revision === 0
            && pane.glassState.phase === 'intact'
        ))
        && state.crossbowGlassAuthority.matchEpoch > priorEpoch
        && state.crossbowGlassAuthority.predictedImpactRejections === 0
        && state.crossbowGlassAuthority.authoritativeImpactMutations === 0
        && state.crossbowGlassAuthority.authoritativeExplosionMutations === 0
        && state.crossbowGlassAuthority.canonicalClientMutations === 0;
    }, oldMatchEpoch, { polling: 'raf', timeout: 90_000 })));
    const resetEvidence = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        matchEpoch: state.breakableWindows[0].glassState.matchEpoch as number,
        revisions: state.breakableWindows.map((pane: GlassSnapshot) => pane.glassState?.revision),
        phases: state.breakableWindows.map((pane: GlassSnapshot) => pane.glassState?.phase),
        telemetry: state.crossbowGlassAuthority,
      };
    })));
    expect(resetEvidence[0].matchEpoch).toBeGreaterThan(oldMatchEpoch);
    expect(resetEvidence[1].matchEpoch).toBe(resetEvidence[0].matchEpoch);
    expect(resetEvidence[1].revisions).toEqual(resetEvidence[0].revisions);
    expect(resetEvidence[1].phases).toEqual(resetEvidence[0].phases);

    const trustedInputs = await Promise.all([host, guest].map((page) => page.evaluate(() => (
      (globalThis as typeof globalThis & {
        __PASS73_TRUSTED_INPUT__?: Array<{ button: number; trusted: boolean }>;
      }).__PASS73_TRUSTED_INPUT__ ?? []
    ))));
    expect(trustedInputs[0].filter(({ button, trusted }) => button === 0 && trusted)).toHaveLength(0);
    expect(trustedInputs[1].filter(({ button, trusted }) => button === 0 && trusted)).toHaveLength(2);
    expect(await Promise.all([host, guest].map(readPersistedClientRuntimeLog))).toEqual([[], []]);

    await testInfo.attach('pass73-crossbow-network-authority-receipt', {
      body: Buffer.from(JSON.stringify({
        renderer: 'webgl2',
        eventDelayQaMs: { hostToGuest: 250, guestToHost: 0 },
        direct: {
          windowId: directSetup.windowId,
          predictedGate,
          host: hostDirect,
          guest: guestDirect,
        },
        blast: {
          windowId: blastStage.windowId,
          occludedWindowId: occludedPane!.windowId,
          host: hostBlast,
          guest: guestBlast,
          occluded: { host: hostOccluded, guest: guestOccluded },
        },
        reset: resetEvidence,
      }, null, 2)),
      contentType: 'application/json',
    });
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('bidirectional M14 trusted-input authority converges once without QA impairment', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const [hostContext, guestContext] = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const { host, guest } = await startMatch(hostContext, guestContext, { hostedBotCount: 0 });
    expect(await Promise.all([host, guest].map((page) => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__!.snapshot().networkLifecycle.qaEventDelayMs
    ))))).toEqual([0, 0]);

    const duelLane = await host.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__!;
      const bounds = api.snapshot().arenaSelection.bounds;
      const directions = [[8, 0], [0, 8], [8, 8], [8, -8]] as const;
      for (let x = bounds.minX + 4; x <= bounds.maxX - 4; x += 3) {
        for (let z = bounds.minZ + 4; z <= bounds.maxZ - 4; z += 3) {
          if (api.collisionProbe(x, z)) continue;
          for (const [dx, dz] of directions) {
            const bx = x + dx;
            const bz = z + dz;
            if (bx > bounds.maxX - 3 || bz > bounds.maxZ - 3 || bz < bounds.minZ + 3) continue;
            if (!api.collisionProbe(bx, bz) && !api.segmentBlocked(x, z, bx, bz)) {
              return {
                host: [x, 1.7, z] as [number, number, number],
                guest: [bx, 1.7, bz] as [number, number, number],
              };
            }
          }
        }
      }
      throw new Error('No clear sub-falloff two-player M14 lane found');
    });
    await Promise.all([
      host.evaluate((position) => window.__ATOMIC_ACRES_DEBUG__!.teleportPlayer(...position, 0, 0), duelLane.host),
      guest.evaluate((position) => window.__ATOMIC_ACRES_DEBUG__!.teleportPlayer(...position, Math.PI, 0), duelLane.guest),
    ]);
    await Promise.all([
      host.waitForFunction((position) => {
        const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
        return remote && Math.hypot(
          remote.authoritativePosition[0] - position[0],
          remote.authoritativePosition[2] - position[2],
        ) < 0.3;
      }, duelLane.guest, { polling: 'raf', timeout: 8_000 }),
      guest.waitForFunction((position) => {
        const remote = window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0];
        return remote && Math.hypot(
          remote.authoritativePosition[0] - position[0],
          remote.authoritativePosition[2] - position[2],
        ) < 0.3;
      }, duelLane.host, { polling: 'raf', timeout: 8_000 }),
    ]);
    await host.waitForTimeout(900);

    await host.bringToFront();
    await ensurePointerLock(host);
    await registerTrustedInputProbe(host);
    await selectLoadoutWeapon(host, guest, 'Digit1', 'm14-ebr');
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.aimAtRemote('body'));
    await pressAds(host);
    await waitForAdsSettled(host);
    await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.aimAtRemote('body'));
    const hostAmmoBefore = await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().player.ammo as number);
    await fireTrustedThenForegroundReceiver(host, guest);
    await Promise.all([
      host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0]?.hp === 62.8, undefined, {
        polling: 'raf', timeout: 8_000,
      }),
      guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.hp === 62.8, undefined, {
        polling: 'raf', timeout: 8_000,
      }),
    ]);
    await releaseAds(host);
    const hostToGuest = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return { localHp: state.player.hp as number, remoteHp: state.remotePlayers[0]?.hp as number };
    })));
    for (const observedHp of [hostToGuest[0].remoteHp, hostToGuest[1].localHp]) {
      expect(observedHp).toBeGreaterThanOrEqual(62.8);
      expect(observedHp).toBeLessThan(100);
    }
    expect(await host.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().player.ammo)).toBe(hostAmmoBefore - 1);

    await guest.bringToFront();
    await ensurePointerLock(guest);
    await registerTrustedInputProbe(guest);
    await selectLoadoutWeapon(guest, host, 'Digit1', 'm14-ebr');
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.aimAtRemote('body'));
    await pressAds(guest);
    await waitForAdsSettled(guest);
    await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.aimAtRemote('body'));
    const guestAmmoBefore = await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().player.ammo as number);
    const protocolBefore = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        protocol: state.networkSync.shotProtocol as Record<string, number>,
        resolutions: state.networkSync.shotTimeline.recentResolutions.length as number,
      };
    })));
    await fireTrustedThenForegroundReceiver(guest, host);
    await Promise.all([
      host.waitForFunction(({ received, accepted, resolutions }) => {
        const shot = window.__ATOMIC_ACRES_DEBUG__?.snapshot().networkSync;
        const last = shot?.shotTimeline.recentResolutions.at(-1);
        return shot?.shotProtocol.received === received + 1
          && shot.shotProtocol['accepted-hit'] === accepted + 1
          && shot.shotTimeline.recentResolutions.length === resolutions + 1
          && last?.outcome === 'accepted-hit'
          && last.appliedRewindMs <= shot.shotTimeline.rewindCeilingMs
          && last.receivedHostTimeMs - last.fireTimeMs <= shot.shotTimeline.maximumFireAgeMs;
      }, {
        received: protocolBefore[0].protocol.received ?? 0,
        accepted: protocolBefore[0].protocol['accepted-hit'] ?? 0,
        resolutions: protocolBefore[0].resolutions,
      }, { polling: 'raf', timeout: 8_000 }),
      host.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().player.hp === 62.8, undefined, {
        polling: 'raf', timeout: 8_000,
      }),
      guest.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().remotePlayers[0]?.hp === 62.8, undefined, {
        polling: 'raf', timeout: 8_000,
      }),
    ]);
    await releaseAds(guest);
    const [hostAuthority, guestAuthority] = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return {
        localHp: state.player.hp as number,
        remoteHp: state.remotePlayers[0]?.hp as number,
        protocol: state.networkSync.shotProtocol as Record<string, number>,
        recentResolutions: state.networkSync.shotTimeline.recentResolutions,
      };
    })));
    for (const observedHp of [hostAuthority.localHp, guestAuthority.remoteHp]) {
      expect(observedHp).toBeGreaterThanOrEqual(62.8);
      expect(observedHp).toBeLessThan(100);
    }
    expect(await guest.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot().player.ammo)).toBe(guestAmmoBefore - 1);
    expect(hostAuthority.protocol.received).toBe((protocolBefore[0].protocol.received ?? 0) + 1);
    expect(hostAuthority.protocol['accepted-hit']).toBe((protocolBefore[0].protocol['accepted-hit'] ?? 0) + 1);
    expect(hostAuthority.protocol['duplicate-request'] ?? 0).toBe(protocolBefore[0].protocol['duplicate-request'] ?? 0);
    expect(hostAuthority.protocol['rejected-stale'] ?? 0).toBe(protocolBefore[0].protocol['rejected-stale'] ?? 0);
    expect(guestAuthority.protocol['created-sent']).toBe((protocolBefore[1].protocol['created-sent'] ?? 0) + 1);
    expect(guestAuthority.protocol['result-hit-presented']).toBe((protocolBefore[1].protocol['result-hit-presented'] ?? 0) + 1);
    expect(guestAuthority.protocol['duplicate-result'] ?? 0).toBe(protocolBefore[1].protocol['duplicate-result'] ?? 0);
    expect(guestAuthority.protocol['result-rejected-stale'] ?? 0)
      .toBe(protocolBefore[1].protocol['result-rejected-stale'] ?? 0);

    const standardDamageState = await Promise.all([host, guest].map((page) => page.evaluate(() => {
      const state = window.__ATOMIC_ACRES_DEBUG__!.snapshot();
      return { dhv: state.player.dhv, overdriveDamageMultiplier: state.overdrive.damageMultiplier };
    })));
    expect(standardDamageState).toEqual([
      { dhv: 10, overdriveDamageMultiplier: 1 },
      { dhv: 10, overdriveDamageMultiplier: 1 },
    ]);
    const trustedInputs = await Promise.all([host, guest].map((page) => page.evaluate(() => (
      (globalThis as typeof globalThis & {
        __PASS73_TRUSTED_INPUT__?: Array<{ button: number; trusted: boolean }>;
      }).__PASS73_TRUSTED_INPUT__ ?? []
    ))));
    expect(trustedInputs[0].filter(({ button, trusted }) => button === 0 && trusted)).toHaveLength(1);
    expect(trustedInputs[1].filter(({ button, trusted }) => button === 0 && trusted)).toHaveLength(1);
    expect(await Promise.all([host, guest].map(readPersistedClientRuntimeLog))).toEqual([[], []]);

    const lastResolution = hostAuthority.recentResolutions.at(-1);
    expect(lastResolution).toMatchObject({ outcome: 'accepted-hit' });
    expect(lastResolution.receivedHostTimeMs - lastResolution.fireTimeMs).toBeLessThanOrEqual(250);
    await testInfo.attach('pass73-m14-network-authority-receipt', {
      body: Buffer.from(JSON.stringify({
        renderer: 'webgl2',
        eventDelayQaMs: { hostToGuest: 0, guestToHost: 0 },
        canonicalBodyDamage: 37.2,
        hostToGuest,
        guestToHost: { host: hostAuthority, guest: guestAuthority },
        hostAmmoDelta: 1,
        guestAmmoDelta: 1,
        protocolBefore,
        lastResolution,
        standardDamageState,
      }, null, 2)),
      contentType: 'application/json',
    });
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
