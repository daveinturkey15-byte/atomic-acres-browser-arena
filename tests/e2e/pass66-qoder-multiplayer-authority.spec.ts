import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  assertPass66OwnedCandidatePage,
  startOwnedPeerServer,
  type OwnedPeerServer,
} from './pass66-e2e-support';

const peerPort = Number(process.env.PASS66_QODER_AUTHORITY_PEER_PORT ?? 9_069);
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
  viewport: { width: 1_280, height: 720 },
});
test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  peerServer = await startOwnedPeerServer(peerPort, process.env.PASS66_QODER_AUTHORITY_PEER_PATH);
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
    release: 'latest', renderer: 'webgl2', render: 'performance', signal: 'off', grass: 'off', mist: 'off',
    clouds: 'off', rays: 'off', multiplayerQa: '1', peerQaPort: String(peerPort), peerQaPath: peerServer.path,
    seed, previewTime: '0',
  })) url.searchParams.set(key, value);
  await page.goto(url.toString());
  await assertPass66OwnedCandidatePage(page);
  await page.waitForFunction(() => {
    const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
    return debug?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#host')?.disabled === false;
  }, undefined, { timeout: 45_000 });
  await page.locator('#player-name').fill(name);
  return page;
}

async function startMatch(
  hostContext: BrowserContext,
  guestContext: BrowserContext,
  names: readonly [string, string],
  seeds: readonly [string, string],
  hostedBots: '0' | '2' = '0',
): Promise<{ host: Page; guest: Page; roomCode: string }> {
  const [host, guest] = await Promise.all([
    openPlayer(hostContext, names[0], seeds[0]),
    openPlayer(guestContext, names[1], seeds[1]),
  ]);
  await host.locator('#team').selectOption('0');
  await guest.locator('#team').selectOption('1');
  await host.locator('#host').click();
  await host.waitForFunction(() => Boolean(document.querySelector('#room-code')?.textContent?.trim()));
  const roomCode = (await host.locator('#room-code').textContent())?.trim() ?? '';
  await guest.locator('#room-input').fill(roomCode);
  await guest.locator('#join').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction(() => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().privateMatch?.members.length === 2
  ))));
  if (hostedBots !== '0') await host.locator('#lobby-bots').selectOption(hostedBots);
  await host.locator('#lobby-ready').click();
  await guest.locator('#lobby-ready').click();
  await expect(host.locator('#lobby-start')).toBeEnabled();
  await host.locator('#lobby-start').click();
  await Promise.all([host, guest].map((page) => page.waitForFunction((botCount) => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.remotePlayers.length === 1
      && state.bots.length === botCount
      && state.killstreak.actors.length === 2;
  }, Number(hostedBots), { timeout: 75_000 })));
  return { host, guest, roomCode };
}

async function rejoinGuest(guest: Page, roomCode: string, name: string): Promise<void> {
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await assertPass66OwnedCandidatePage(guest);
  await guest.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true);
  await expect(guest.locator('#room-input')).toHaveValue(roomCode);
  await expect(guest.locator('#join')).toHaveText('REJOIN LAST MATCH');
  await guest.locator('#player-name').fill(name);
  await guest.locator('#join').click();
  await guest.waitForFunction(() => {
    const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.gameStarted && state.matchPhase === 'active'
      && state.networkLifecycle.hostConnectionOpen === true
      && state.privateMatch?.members.every((member: any) => member.connected);
  }, undefined, { timeout: 75_000 });
}

function ladderProjection(state: any): any[] {
  return state.killstreak.actors.map((actor: any) => ({
    actorId: actor.actorId,
    lifeId: actor.lifeId,
    streak: actor.streak,
    cycleProgress: actor.cycleProgress,
    charges: actor.availableCharges.map((charge: any) => ({ ...charge })),
  })).sort((left: any, right: any) => left.actorId.localeCompare(right.actorId));
}

test('post-death ladders survive authenticated replacements and an immediate host renderer crash exactly once', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const started = await startMatch(
      hostContext,
      guestContext,
      ['Ladder Host', 'Ladder Guest'],
      ['pass66-ladder-host', 'pass66-ladder-guest'],
    );
    let host = started.host;
    const { guest, roomCode } = started;
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    const guestId = await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().remotePlayers[0].id as string);
    expect(await host.evaluate((id) => {
      const debug = (window as any).__ATOMIC_ACRES_DEBUG__;
      debug.earnSupport(15);
      debug.earnSupport(15);
      return debug.earnSupportForActor(id, 15) && debug.earnSupportForActor(id, 15);
    }, guestId)).toBe(true);

    await expect.poll(async () => {
      const actors = ladderProjection(await guest.evaluate(() => (
        (window as any).__ATOMIC_ACRES_DEBUG__.snapshot()
      )));
      return actors.length === 2 && actors.every((actor) => (
        actor.streak === 30 && actor.cycleProgress === 0
        && actor.charges.length === 5 && actor.charges.every((charge: any) => charge.count === 2)
      ));
    }).toBe(true);

    // Advance the guest to a later host-owned life before replacing its
    // document. A fresh document begins with new transport counters but must
    // not be allowed to replace or forge this retained actor life.
    const death = await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.forceRemoteDeathForReconnect(id)
    ), guestId);
    expect(death).toMatchObject({ targetId: guestId });
    expect(death.nextLifeId).toBeGreaterThan(2);
    await expect.poll(async () => guest.evaluate((lifeId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.player.alive
        && state.player.continuity === lifeId
        && state.player.hostConfirmedContinuity === lifeId;
    }, death.nextLifeId), { timeout: 8_000 }).toBe(true);
    await expect.poll(async () => host.evaluate(({ id, lifeId }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const remote = state.remotePlayers.find((candidate: any) => candidate.id === id);
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === id);
      return remote?.continuity === lifeId && remote?.hp === 100 && actor?.lifeId === lifeId;
    }, { id: guestId, lifeId: death.nextLifeId }), { timeout: 8_000 }).toBe(true);

    expect(await host.evaluate((id) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.earnSupportForActor(id, 15)
    ), guestId)).toBe(true);
    const beforeReplacement = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(beforeReplacement).toMatchObject({ sequence: 1, lifeId: death.nextLifeId });
    await expect.poll(async () => host.evaluate((id) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0;
    }, guestId)).toBe(2);

    await rejoinGuest(guest, roomCode, 'Ladder Guest');
    await expect.poll(async () => guest.evaluate((lifeId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === state.player.id);
      return state.player.continuity === lifeId
        && state.player.hostConfirmedContinuity === lifeId
        && state.player.awaitingAuthoritativeRejoinContinuity === false
        && actor?.lifeId === lifeId;
    }, death.nextLifeId)).toBe(true);

    // The replacement document restarts at sequence one. The authenticated
    // replacement reset must admit it even though the prior document already
    // used sequence one, while its new request ID consumes exactly one charge.
    const afterReplacement = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(afterReplacement).toMatchObject({ sequence: 1, lifeId: death.nextLifeId });
    expect(afterReplacement.activationId).not.toBe(beforeReplacement.activationId);
    await expect.poll(async () => host.evaluate((id) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0;
    }, guestId)).toBe(1);

    // Spend the final retained charge, prove its replay identity reached durable
    // storage in under the old two-second crash window, then crash the renderer
    // without pagehide/unload checkpoint assistance.
    const crashActivation = await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.activateKillstreakWithReceipt('scout-sweep')
    ));
    expect(crashActivation).toMatchObject({ sequence: 2, lifeId: death.nextLifeId });
    await expect.poll(async () => host.evaluate(({ id, activationId }) => {
      const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
      if (!raw) return null;
      const checkpoint = JSON.parse(raw);
      const actor = checkpoint.killstreak?.actors?.find((candidate: any) => candidate.actorId === id);
      return {
        replayIdRetained: checkpoint.killstreak?.seenActivationRequestIds?.includes(activationId) === true,
        charge: actor?.availableCharges?.find((entry: any) => entry.id === 'scout-sweep')?.count ?? 0,
        lifeId: actor?.lifeId ?? null,
        containsRawToken: JSON.stringify(checkpoint).includes('resumeToken"'),
      };
    }, { id: guestId, activationId: crashActivation.activationId }), {
      timeout: 1_000,
      intervals: [25, 50, 100],
    }).toEqual({ replayIdRetained: true, charge: 0, lifeId: death.nextLifeId, containsRawToken: false });

    // The renderer crash below is deliberate. Retain any errors already observed,
    // but do not mistake Chromium's crash diagnostic for a game page error.
    host.removeAllListeners('pageerror');
    const cdp = await hostContext.newCDPSession(host);
    await cdp.send('Page.crash').catch(() => undefined);
    host = await openPlayer(hostContext, 'Ladder Host', 'pass66-ladder-host-recovery');
    host.on('pageerror', (error) => errors.push(`recovered host: ${error.message}`));
    await expect(host.locator('#host')).toHaveText('RESUME HOSTED MATCH');
    await host.locator('#host').click();
    await host.waitForFunction(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return state.gameStarted && state.matchPhase === 'active' && state.killstreak.actors.length === 2;
    }, undefined, { timeout: 90_000 });
    await guest.waitForFunction(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().networkLifecycle.hostConnectionOpen === true
    ), undefined, { timeout: 90_000 });

    await expect.poll(async () => host.evaluate(({ id, lifeId }) => {
      const actor = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().killstreak.actors
        .find((candidate: any) => candidate.actorId === id);
      return {
        lifeId: actor?.lifeId ?? null,
        streak: actor?.streak ?? null,
        firstSlotCharge: actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0,
      };
    }, { id: guestId, lifeId: death.nextLifeId })).toEqual({
      lifeId: death.nextLifeId,
      streak: 15,
      firstSlotCharge: 0,
    });
    expect(await guest.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.replayLastKillstreakActivation()
    ))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await host.evaluate(({ id, activationId }) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      const actor = state.killstreak.actors.find((candidate: any) => candidate.actorId === id);
      const raw = localStorage.getItem('atomic-acres:host-match-checkpoint:v3');
      const checkpoint = raw ? JSON.parse(raw) : null;
      return {
        firstSlotCharge: actor?.availableCharges.find((charge: any) => charge.id === 'scout-sweep')?.count ?? 0,
        retainedReplayIds: checkpoint?.killstreak?.seenActivationRequestIds
          ?.filter((candidate: string) => candidate === activationId).length ?? 0,
      };
    }, { id: guestId, activationId: crashActivation.activationId })).toEqual({
      firstSlotCharge: 0,
      retainedReplayIds: 1,
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('Semtex and crossbolt sticky results apply once under duplicate, reorder and guest rejoin', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const { host, guest, roomCode } = await startMatch(
      hostContext,
      guestContext,
      ['Sticky Host', 'Sticky Guest'],
      ['pass66-sticky-host', 'pass66-sticky-guest'],
    );
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    const semtex = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorStickyEffect('semtex')
    ));
    expect(semtex).not.toBeNull();
    expect(semtex.stuckDamage).toBeCloseTo(semtex.baseDamage * 2, 6);
    expect(semtex.stuckRadiusM).toBeCloseTo(semtex.baseRadiusM * 2, 6);
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, feedback: state.stickyAuthority };
    })).toMatchObject({
      hp: semtex.healthAfter,
      feedback: { victimFeedbackCount: 1, lastVictimFeedback: { label: 'STUCK', source: 'semtex' } },
    });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: semtex.healthAfter, count: 1 });

    await rejoinGuest(guest, roomCode, 'Sticky Guest');
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount, receipts: state.stickyAuthority.retainedReceiptCount };
    })).toEqual({ hp: semtex.healthAfter, count: 0, receipts: 1 });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: semtex.healthAfter, count: 0 });

    const crossbolt = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.authorStickyEffect('explosive-crossbow')
    ));
    expect(crossbolt).not.toBeNull();
    expect(crossbolt.stuckDamage).toBeCloseTo(crossbolt.baseDamage * 2, 6);
    expect(crossbolt.stuckRadiusM).toBeCloseTo(crossbolt.baseRadiusM * 2, 6);
    await expect.poll(async () => guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount, source: state.stickyAuthority.lastVictimFeedback?.source };
    })).toEqual({ hp: crossbolt.healthAfter, count: 1, source: 'explosive-crossbow' });
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('explosive-crossbow'))).toBe(true);
    expect(await host.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.replayStickyEffect('semtex'))).toBe(true);
    await guest.waitForTimeout(350);
    expect(await guest.evaluate(() => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { hp: state.player.hp, count: state.stickyAuthority.victimFeedbackCount };
    })).toEqual({ hp: crossbolt.healthAfter, count: 1 });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('host-authoritative facing flash and semantic smoke break bot lock while the guest observes safe replicas', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Two simultaneous headless Firefox SWGL pages are covered by the serial browser matrix.');
  const [hostContext, guestContext] = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const errors: string[] = [];
  try {
    const { host, guest } = await startMatch(
      hostContext,
      guestContext,
      ['Perception Host', 'Perception Guest'],
      ['pass66-perception-host', 'pass66-perception-guest'],
      '2',
    );
    host.on('pageerror', (error) => errors.push(`host: ${error.message}`));
    guest.on('pageerror', (error) => errors.push(`guest: ${error.message}`));
    const hpBeforeFlash = await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp as number);
    const flash = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.stageBotPerceptionAgainstRemote('flash')
    ));
    expect(flash).toMatchObject({ effect: 'flash', preLockId: flash.targetId, postLockId: null, canFire: false, volumeId: null });
    expect(flash.blindRemainingMs).toBeGreaterThan(0);
    await expect.poll(async () => host.evaluate((botId) => {
      const bot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots.find((candidate: any) => candidate.id === botId);
      return bot?.perception ?? null;
    }, flash.botId)).toMatchObject({ targetLockId: null, canFire: false });
    await guest.waitForTimeout(500);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp)).toBe(hpBeforeFlash);

    const hpBeforeSmoke = await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp as number);
    const smoke = await host.evaluate(() => (
      (window as any).__ATOMIC_ACRES_DEBUG__.stageBotPerceptionAgainstRemote('smoke')
    ));
    expect(smoke).toMatchObject({ effect: 'smoke', preLockId: smoke.targetId, postLockId: null, canFire: false });
    expect(smoke.volumeId).toMatch(/^smoke-/);
    expect(smoke.aimErrorRadians).toBeGreaterThan(0);
    await expect.poll(async () => guest.evaluate((botId) => {
      const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        activeSmoke: state.dmrThermal.smokeAuthority.activeVolumes,
        smokeVolumes: state.dmrThermal.smokeVolumes,
        botVisible: state.bots.some((bot: any) => bot.id === botId && bot.rootVisible),
      };
    }, smoke.botId)).toMatchObject({ activeSmoke: 1, smokeVolumes: 1, botVisible: true });
    await guest.waitForTimeout(750);
    expect(await guest.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp)).toBe(hpBeforeSmoke);
    await expect.poll(async () => host.evaluate((botId) => {
      const bot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().bots.find((candidate: any) => candidate.id === botId);
      return bot?.perception ?? null;
    }, smoke.botId)).toMatchObject({ targetLockId: null, canFire: false });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});
