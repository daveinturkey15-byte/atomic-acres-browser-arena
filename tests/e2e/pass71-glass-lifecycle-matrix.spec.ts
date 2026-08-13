import { expect, test, type Page } from '@playwright/test';

const PROFILES = [
  { label: 'quality', query: 'quality' },
  { label: 'performance', query: 'performance' },
] as const;
const PANE_COUNT = 6;
const ALL_PANE_INDEXES = Object.freeze(Array.from({ length: PANE_COUNT }, (_, index) => index));

type GlassPhase = 'intact' | 'breached' | 'detached';
type ArenaId = 'atomic-acres' | 'skyline-terminal';
type PaneObservation = Readonly<{
  id: string;
  broken: boolean;
  visible: boolean;
  activeWorldColliderPresent: boolean;
  persistentDebrisId: string | null;
  position: readonly number[];
  authority: Readonly<{
    phase: GlassPhase;
    paneVisible: boolean;
    apertureOpen: boolean;
    movementSolid: boolean;
    ballisticSolid: boolean;
    aiLineOfSightSolid: boolean;
  }>;
  rapierDynamicColliders: number;
}>;

async function deploy(
  page: Page,
  render: string,
  arenaId: ArenaId = 'atomic-acres',
  multiplayerQa = false,
): Promise<void> {
  const seed = arenaId === 'atomic-acres'
    ? `pass71-glass-${render}`
    : `pass71-glass-${arenaId}-${render}`;
  await page.goto(
    `/?release=latest&map=${arenaId}&renderer=webgl2&render=${render}`
      + '&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off'
      + (multiplayerQa ? '&multiplayerQa=1' : '')
      + `&seed=${seed}`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 },
  );
  await page.waitForFunction(() => Boolean(
    window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false,
  ), undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return debug?.admissionState().matchPhase === 'active'
      && debug.admissionState().presentedGameplayFrame > 2;
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function observePane(page: Page, index: number): Promise<PaneObservation> {
  return page.evaluate((paneIndex) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const pane = snapshot.breakableWindows[paneIndex];
    return {
      ...pane,
      rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
    };
  }, index);
}

async function resetBreakableWindows(page: Page): Promise<void> {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.resetBreakableWindows());
  await expect.poll(async () => {
    const ready = await page.evaluate((paneCount) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      return snapshot.breakableWindows.length === paneCount
      && snapshot.breakableWindows.every((pane: any) => (
        pane.broken === false
        && pane.visible === true
        && pane.authority?.phase === 'intact'
        && pane.activeWorldColliderPresent === true
      ))
      && snapshot.interactiveWorld.rapierDynamicColliders >= paneCount;
    }, PANE_COUNT);
    return ready;
  }, { timeout: 5_000 }).toBe(true);
}

async function assertPaneBreached(
  page: Page,
  index: number,
  label: string,
  rapierColliderCountBefore: number,
  expectedPhase: Exclude<GlassPhase, 'intact'>,
  waitForProjectile = false,
): Promise<PaneObservation> {
  const authorityMatches = (pane: PaneObservation): boolean => pane.broken === true
    && pane.visible === false
    && pane.authority?.phase === expectedPhase
    && pane.authority?.paneVisible === false
    && pane.authority?.apertureOpen === true
    && pane.authority?.movementSolid === false
    && pane.authority?.ballisticSolid === false
    && pane.authority?.aiLineOfSightSolid === false
    && pane.activeWorldColliderPresent === false;
  if (waitForProjectile) {
    await expect.poll(async () => authorityMatches(await observePane(page, index)), { timeout: 8_000 }).toBe(true);
  }
  const admittedPane = await observePane(page, index);
  expect(admittedPane, `${label}: pane ${index}`).toMatchObject({
    broken: true,
    visible: false,
    activeWorldColliderPresent: false,
    authority: {
      phase: expectedPhase,
      paneVisible: false,
      apertureOpen: true,
      movementSolid: false,
      ballisticSolid: false,
      aiLineOfSightSolid: false,
    },
  });
  // Pane authority remains immediate for hitscan/melee/grenade. Only the
  // already-deferred Rapier reconciliation receives a bounded poll.
  await expect.poll(async () => (
    (await observePane(page, index)).rapierDynamicColliders < rapierColliderCountBefore
  ), { timeout: 5_000 }).toBe(true);
  return observePane(page, index);
}

async function observePaneDebris(page: Page, index: number): Promise<any | null> {
  return page.evaluate((paneIndex) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const debrisId = snapshot.breakableWindows[paneIndex]?.persistentDebrisId;
    return debrisId
      ? snapshot.persistentWindowDebris.find((entry: any) => entry.id === debrisId) ?? null
      : null;
  }, index);
}

async function assertDebrisMovesAndSettles(page: Page, index: number, label: string): Promise<any> {
  await expect.poll(async () => Boolean(await observePaneDebris(page, index)), { timeout: 1_000 }).toBe(true);
  const initial = await observePaneDebris(page, index);
  expect(initial, `${label}: retained debris is created`).not.toBeNull();
  expect(initial.position.every(Number.isFinite), `${label}: finite initial debris position`).toBe(true);

  await expect.poll(async () => {
    const current = await observePaneDebris(page, index);
    if (!current) return false;
    const displacement = Math.hypot(
      current.position[0] - initial.position[0],
      current.position[1] - initial.position[1],
      current.position[2] - initial.position[2],
    );
    return current.position[1] <= initial.position[1] - 0.025 && displacement >= 0.04;
  }, { timeout: 2_500 }).toBe(true);
  const moving = await observePaneDebris(page, index);

  await expect.poll(async () => {
    const current = await observePaneDebris(page, index);
    const restY = current?.support?.restY;
    return current?.fallbackSettled === true
      && current.physicsActive === false
      && current.physical === false
      && typeof restY === 'number'
      && Math.abs(current.position[1] - restY) <= 0.04;
  }, { timeout: 4_250 }).toBe(true);
  const settled = await observePaneDebris(page, index);
  expect(settled, `${label}: shards settle on authored support`).toMatchObject({
    visible: true,
    physical: false,
    physicsActive: false,
    fallbackSettled: true,
  });
  return { initial, moving, settled };
}

async function assertDebrisRetired(
  page: Page,
  label: string,
  expectedBrokenPaneIndexes: readonly number[] = ALL_PANE_INDEXES,
): Promise<any> {
  await page.waitForTimeout(4_750);
  const snapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot() as any);
  for (const paneIndex of expectedBrokenPaneIndexes) {
    expect(snapshot.breakableWindows[paneIndex], `${label}: pane ${paneIndex} remains canonically open`)
      .toMatchObject({
        broken: true,
        visible: false,
        activeWorldColliderPresent: false,
        authority: {
          apertureOpen: true,
          movementSolid: false,
          ballisticSolid: false,
          aiLineOfSightSolid: false,
        },
      });
  }
  expect(snapshot.windowGlassDebrisPool, label).toMatchObject({
    retained: PANE_COUNT,
    currentArenaRetained: PANE_COUNT,
    visibleRetained: 0,
    active: 0,
    activePhysics: 0,
    prewarmedPhysicsBodies: PANE_COUNT,
    lifecycle: {
      maxPhysicsMs: 1_800,
      maxLifetimeMs: 4_500,
      missingPrewarm: 0,
    },
  });
  expect(snapshot.persistentWindowDebris, `${label}: no fragment or collider remains`).toEqual([]);
  return {
    panes: snapshot.breakableWindows.map((pane: any) => ({
      id: pane.id,
      broken: pane.broken,
      apertureOpen: pane.authority.apertureOpen,
      activeWorldColliderPresent: pane.activeWorldColliderPresent,
    })),
    pool: snapshot.windowGlassDebrisPool,
    rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
  };
}

async function waitForWeaponReady(page: Page, weapon: string): Promise<void> {
  await expect.poll(async () => page.evaluate((weaponId) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    const readiness = debug.sampleWeaponActionReadiness();
    return snapshot.player.weapon === weaponId
      && snapshot.player.ammo > 0
      && snapshot.player.reloading === false
      && readiness.switchingReady === true
      && readiness.fireReady === true;
  }, weapon), { timeout: 6_000 }).toBe(true);
}

async function acquireSkylineFlare(page: Page): Promise<any> {
  const staged = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.stageTimedMapWeaponMidpoint('flare-gun', 'exact')
  ));
  expect(staged).toMatchObject({ status: 'available', announcementSent: true });
  const pickup = (staged as any).pickupPosition as [number, number, number];
  expect(pickup?.every(Number.isFinite)).toBe(true);
  await page.evaluate(([x, y, z]) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z), pickup);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop())).toBe(true);
  await expect.poll(async () => page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const state = snapshot.timedMapWeapons.states['flare-gun'];
    return state.status === 'held'
      && state.holderId === snapshot.player.id
      && snapshot.player.weapon === 'flare-gun';
  }), { timeout: 5_000 }).toBe(true);
  await waitForWeaponReady(page, 'flare-gun');
  return staged;
}

async function stageSkylinePane(page: Page, paneIndex: number, distance = 6): Promise<void> {
  await page.evaluate(({ paneIndex: index, distance: approachDistance }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const pane = (debug.snapshot() as any).breakableWindows[index];
    const [targetX, targetY, targetZ] = pane.position as [number, number, number];
    const eyeY = 1.7;
    const playerX = targetX;
    const playerZ = targetZ + approachDistance;
    const deltaX = targetX - playerX;
    const deltaZ = targetZ - playerZ;
    const yaw = Math.atan2(-deltaX, -deltaZ);
    const pitch = Math.atan2(targetY - eyeY, Math.hypot(deltaX, deltaZ));
    debug.teleportPlayer(playerX, eyeY, playerZ, yaw, pitch);
  }, { paneIndex, distance });
}

for (const profile of PROFILES) {
  test(`${profile.label}: all six authored panes breach by bullet, knife and grenade and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);
    const receipts: Record<string, unknown> = {};

    await resetBreakableWindows(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'));
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 4);
        debug.fireOnce();
      }, pane);
      await assertPaneBreached(page, pane, `${profile.label}/bullet`, before.rapierDynamicColliders, 'breached');
      await page.waitForTimeout(130);
    }
    receipts.bullet = await assertDebrisRetired(page, `${profile.label}/bullet`);

    await resetBreakableWindows(page);
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      const accepted = await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 1.25);
        return debug.melee().accepted;
      }, pane);
      expect(accepted, `${profile.label}/knife pane ${pane} admitted`).toBe(true);
      await assertPaneBreached(page, pane, `${profile.label}/knife`, before.rapierDynamicColliders, 'breached');
      await page.waitForTimeout(670);
    }
    receipts.knife = await assertDebrisRetired(page, `${profile.label}/knife`);

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      const before = await observePane(page, pane);
      const broken = await page.evaluate((paneIndex) => (
        window.__ATOMIC_ACRES_DEBUG__.detonateGrenadeAtWindow(paneIndex)
      ), pane);
      expect(broken, `${profile.label}/grenade pane ${pane} admitted`).toBeGreaterThanOrEqual(1);
      await assertPaneBreached(page, pane, `${profile.label}/grenade`, before.rapierDynamicColliders, 'detached');
    }
    // Finish with all six concurrently breached so the four presentation-only
    // fallbacks beyond the two-body Rapier partition are exercised together.
    await resetBreakableWindows(page);
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      for (let pane = 0; pane < 6; pane += 1) debug.detonateGrenadeAtWindow(pane);
    });
    receipts.grenade = await assertDebrisRetired(page, `${profile.label}/grenade`);

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    await testInfo.attach(`pass71-glass-${profile.label}-matrix`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipts, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: real Flare Gun impacts breach all six Skyline panes and shards fall, settle and retire`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query, 'skyline-terminal', true);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    const grant = await acquireSkylineFlare(page);
    const paneReceipts: unknown[] = [];
    let lifecycle: unknown = null;

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      await waitForWeaponReady(page, 'flare-gun');
      await stageSkylinePane(page, pane);
      const before = await observePane(page, pane);
      const impactCountBefore = await page.evaluate(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.flareProjectiles.impactCount
      ));
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      const breached = await assertPaneBreached(
        page,
        pane,
        `${profile.label}/flare-gun`,
        before.rapierDynamicColliders,
        'breached',
        true,
      );
      await expect.poll(async () => page.evaluate(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.flareProjectiles.impactCount
      )), { timeout: 2_000 }).toBeGreaterThan(impactCountBefore);
      if (pane === 0) lifecycle = await assertDebrisMovesAndSettles(page, pane, `${profile.label}/flare-gun`);
      paneReceipts.push({ id: breached.id, phase: breached.authority.phase });
    }

    const retired = await assertDebrisRetired(page, `${profile.label}/flare-gun`, [PANE_COUNT - 1]);
    const timedState = await page.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).timedMapWeapons.states['flare-gun']
    ));
    expect(timedState).toMatchObject({ status: 'depleted', shotsRemaining: 0 });
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    await testInfo.attach(`pass71-glass-${profile.label}-flare-gun`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'skyline-terminal',
        grant,
        paneReceipts,
        lifecycle,
        retired,
        timedState,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: real explosive-crossbow impact stays solid until detonation then breaches every pane`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    const paneReceipts: unknown[] = [];
    let lifecycle: unknown = null;

    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      await resetBreakableWindows(page);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('explosive-crossbow'));
      await waitForWeaponReady(page, 'explosive-crossbow');
      await page.evaluate((paneIndex) => window.__ATOMIC_ACRES_DEBUG__.stageWindow(paneIndex, 6), pane);
      const before = await observePane(page, pane);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());

      await expect.poll(async () => page.evaluate(() => (
        (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).projectileGlass.explosiveBolts
          .some((bolt: any) => bolt.authority === true && bolt.impacted === true && bolt.detonatesInMs > 0)
      )), { timeout: 2_000 }).toBe(true);
      const impacted = await observePane(page, pane);
      expect(impacted, `${profile.label}/explosive-crossbow pane ${pane} remains solid on bolt impact`)
        .toMatchObject({
          broken: false,
          visible: true,
          activeWorldColliderPresent: true,
          rapierDynamicColliders: before.rapierDynamicColliders,
          authority: {
            phase: 'intact',
            paneVisible: true,
            apertureOpen: false,
            movementSolid: true,
            ballisticSolid: true,
            aiLineOfSightSolid: true,
          },
        });

      const breached = await assertPaneBreached(
        page,
        pane,
        `${profile.label}/explosive-crossbow`,
        before.rapierDynamicColliders,
        'detached',
        true,
      );
      if (pane === 0) lifecycle = await assertDebrisMovesAndSettles(page, pane, `${profile.label}/explosive-crossbow`);
      paneReceipts.push({ id: breached.id, phase: breached.authority.phase });
    }

    const retired = await assertDebrisRetired(page, `${profile.label}/explosive-crossbow`, [PANE_COUNT - 1]);
    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    await testInfo.attach(`pass71-glass-${profile.label}-explosive-crossbow`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'atomic-acres',
        paneReceipts,
        lifecycle,
        retired,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });
}
