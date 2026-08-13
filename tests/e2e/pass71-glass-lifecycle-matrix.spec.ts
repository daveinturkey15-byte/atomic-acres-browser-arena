import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PROFILES = [
  { label: 'quality', query: 'quality' },
  { label: 'performance', query: 'performance' },
] as const;
const PANE_COUNT = 6;
const ALL_PANE_INDEXES = Object.freeze(Array.from({ length: PANE_COUNT }, (_, index) => index));
const HF304_COMPONENT_PATH = process.env.PASS71_HF304_BROWSER_COMPONENT_PATH
  ? resolve(process.env.PASS71_HF304_BROWSER_COMPONENT_PATH)
  : null;
const HF304_EXPECTED_SOURCE_SHA = process.env.PASS71_HF304_EXPECTED_SOURCE_SHA ?? null;
const HF304_RELEASE_PASS = process.env.PASS71_HF304_RELEASE_PASS ?? null;
const HF304_CASE_IDS = Object.freeze(PROFILES.flatMap((profile) => (
  ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'].map((path) => `${profile.label}/${path}`)
)));
const hf304Cases: Array<Record<string, unknown>> = [];
let hf304ServedCandidate: Record<string, unknown> | null = null;
let hf304UserAgent: string | null = null;

async function captureHf304RuntimeIdentity(page: Page): Promise<void> {
  if (!HF304_COMPONENT_PATH) return;
  expect(HF304_EXPECTED_SOURCE_SHA).toMatch(/^[a-f0-9]{40}$/u);
  expect(HF304_RELEASE_PASS).toBe('PASS 71');
  const identity = await page.evaluate(async () => {
    const response = await fetch(new URL('channel-provenance.json', window.location.href), {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HF-304 candidate provenance returned HTTP ${response.status}`);
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return {
      servedCandidate: await response.json(),
      userAgent: navigator.userAgent,
      actualRenderer: snapshot.render?.runtime?.actualBackend,
    };
  });
  expect(identity.servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: HF304_RELEASE_PASS,
    sourceSha: HF304_EXPECTED_SOURCE_SHA,
    path: 'channels/the-big-one',
  });
  expect(identity.userAgent).toMatch(/Edg\//u);
  expect(identity.actualRenderer).toBe('webgl2');
  if (hf304ServedCandidate === null) hf304ServedCandidate = identity.servedCandidate;
  else expect(identity.servedCandidate).toEqual(hf304ServedCandidate);
  if (hf304UserAgent === null) hf304UserAgent = identity.userAgent;
  else expect(identity.userAgent).toBe(hf304UserAgent);
}

function recordHf304Case(
  profile: string,
  path: string,
  arenaId: ArenaId,
  receipt: unknown,
  faults: readonly string[],
): void {
  if (!HF304_COMPONENT_PATH) return;
  hf304Cases.push({
    id: `${profile}/${path}`,
    profile,
    path,
    arenaId,
    status: 'PASS',
    paneCount: PANE_COUNT,
    receipt,
    faults: [...faults],
  });
}

test.afterAll(() => {
  if (!HF304_COMPONENT_PATH) return;
  expect(hf304Cases.map((entry) => entry.id)).toEqual(HF304_CASE_IDS);
  expect(hf304ServedCandidate).not.toBeNull();
  expect(hf304UserAgent).toMatch(/Edg\//u);
  const component = {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf304-glass-browser-component@1',
    status: 'PASS',
    sourceSha: HF304_EXPECTED_SOURCE_SHA,
    servedCandidate: hf304ServedCandidate,
    browser: { channel: 'msedge', userAgent: hf304UserAgent },
    renderer: { requested: 'webgl2', actual: 'webgl2' },
    coverage: {
      profiles: ['quality', 'performance'],
      arenas: ['atomic-acres', 'skyline-terminal'],
      paneCountPerArena: PANE_COUNT,
      paths: ['bullet', 'knife', 'grenade', 'flare-gun', 'explosive-crossbow'],
      caseCount: HF304_CASE_IDS.length,
      authorityMode: 'solo',
      hostedRuntimeTopologyObserved: false,
    },
    cases: hf304Cases,
    faults: [],
  };
  mkdirSync(dirname(HF304_COMPONENT_PATH), { recursive: true });
  const temporary = `${HF304_COMPONENT_PATH}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
  renameSync(temporary, HF304_COMPONENT_PATH);
});

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
  await captureHf304RuntimeIdentity(page);
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
  if (waitForProjectile) {
    await page.waitForFunction(({ paneIndex, phase }) => {
      const pane = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).breakableWindows[paneIndex];
      return pane.broken === true
        && pane.visible === false
        && pane.authority?.phase === phase
        && pane.authority?.paneVisible === false
        && pane.authority?.apertureOpen === true
        && pane.authority?.movementSolid === false
        && pane.authority?.ballisticSolid === false
        && pane.authority?.aiLineOfSightSolid === false
        && pane.activeWorldColliderPresent === false;
    }, { paneIndex: index, phase: expectedPhase }, { timeout: 8_000 });
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
  await page.waitForFunction(({ colliderCountBefore }) => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).interactiveWorld.rapierDynamicColliders
      < colliderCountBefore
  ), { colliderCountBefore: rapierColliderCountBefore }, { timeout: 5_000 });
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
  await expect.poll(async () => {
    const current = await observePaneDebris(page, index);
    return current?.physical === true
      && current.physicsActive === true
      && current.receivedPhysicsPose === true;
  }, { timeout: 1_500 }).toBe(true);
  const initial = await observePaneDebris(page, index);
  expect(initial, `${label}: retained debris begins on collision-backed physics`).toMatchObject({
    visible: true,
    physical: true,
    physicsActive: true,
    receivedPhysicsPose: true,
    fallbackSettled: false,
  });
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
  expect(snapshot.interactiveWorld.rapierMajorBodies, `${label}: no active major-debris body remains`).toBe(0);
  return {
    panes: snapshot.breakableWindows.map((pane: any) => ({
      id: pane.id,
      broken: pane.broken,
      apertureOpen: pane.authority.apertureOpen,
      activeWorldColliderPresent: pane.activeWorldColliderPresent,
    })),
    pool: snapshot.windowGlassDebrisPool,
    rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
    rapierMajorBodies: snapshot.interactiveWorld.rapierMajorBodies,
    persistentWindowDebris: snapshot.persistentWindowDebris,
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
    const [paneX, targetY, targetZ] = pane.position as [number, number, number];
    // Skyline's authored centre mullion is solid, so aim through clear pane area.
    const targetX = paneX + 1;
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
  test(`${profile.label}: all six authored panes breach by bullet and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

    await resetBreakableWindows(page);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'));
    let lifecycle: unknown = null;
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 4);
        debug.fireOnce();
      }, pane);
      await assertPaneBreached(page, pane, `${profile.label}/bullet`, before.rapierDynamicColliders, 'breached');
      if (pane === 0) lifecycle = await assertDebrisMovesAndSettles(page, pane, `${profile.label}/bullet`);
      await page.waitForTimeout(130);
    }
    const retired = await assertDebrisRetired(page, `${profile.label}/bullet`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'bullet', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-bullet`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: all six authored panes breach by knife and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

    await resetBreakableWindows(page);
    let lifecycle: unknown = null;
    for (let pane = 0; pane < PANE_COUNT; pane += 1) {
      const before = await observePane(page, pane);
      const accepted = await page.evaluate((paneIndex) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        debug.stageWindow(paneIndex, 1.25);
        return debug.melee().accepted;
      }, pane);
      expect(accepted, `${profile.label}/knife pane ${pane} admitted`).toBe(true);
      await assertPaneBreached(page, pane, `${profile.label}/knife`, before.rapierDynamicColliders, 'breached');
      if (pane === 0) lifecycle = await assertDebrisMovesAndSettles(page, pane, `${profile.label}/knife`);
      await page.waitForTimeout(670);
    }
    const retired = await assertDebrisRetired(page, `${profile.label}/knife`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'knife', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-knife`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
      contentType: 'application/json',
    });
  });

  test(`${profile.label}: all six authored panes breach by grenade and retire debris by 5s`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const faults: string[] = [];
    page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') faults.push(message.text());
    });
    await deploy(page, profile.query);

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
    const lifecycle = await assertDebrisMovesAndSettles(page, 0, `${profile.label}/grenade`);
    const retired = await assertDebrisRetired(page, `${profile.label}/grenade`);
    const receipt = { lifecycle, retired };

    expect(faults, JSON.stringify(faults, null, 2)).toEqual([]);
    recordHf304Case(profile.label, 'grenade', 'atomic-acres', receipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-grenade`, {
      body: Buffer.from(JSON.stringify({ profile: profile.label, paneCount: PANE_COUNT, receipt, faults }, null, 2)),
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
    const evidenceReceipt = {
      grant,
      paneReceipts,
      lifecycle,
      retired,
      timedState,
    };
    recordHf304Case(profile.label, 'flare-gun', 'skyline-terminal', evidenceReceipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-flare-gun`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'skyline-terminal',
        ...evidenceReceipt,
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

      // Capture the pane in the same browser sample as the live fuse. A separate
      // protocol round trip can outlast the two-second fuse on software CI.
      const impactSampleHandle = await page.waitForFunction((paneIndex) => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
        const bolt = snapshot.projectileGlass.explosiveBolts
          .find((candidate: any) => (
            candidate.authority === true
              && candidate.impacted === true
              && candidate.detonatesInMs > 0
          ));
        if (!bolt) return false;
        const impactedPane = snapshot.breakableWindows[paneIndex];
        return {
          bolt: {
            impacted: bolt.impacted,
            authority: bolt.authority,
            detonatesInMs: bolt.detonatesInMs,
          },
          pane: {
            ...impactedPane,
            authority: { ...impactedPane.authority },
            rapierDynamicColliders: snapshot.interactiveWorld.rapierDynamicColliders,
          },
        };
      }, pane, { timeout: 2_000 });
      const impactSample = await impactSampleHandle.jsonValue() as {
        bolt: { impacted: boolean; authority: boolean; detonatesInMs: number };
        pane: PaneObservation;
      };
      await impactSampleHandle.dispose();
      expect(impactSample.bolt).toMatchObject({ impacted: true, authority: true });
      expect(impactSample.bolt.detonatesInMs).toBeGreaterThan(0);
      const impacted = impactSample.pane;
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
    const evidenceReceipt = { paneReceipts, lifecycle, retired };
    recordHf304Case(profile.label, 'explosive-crossbow', 'atomic-acres', evidenceReceipt, faults);
    await testInfo.attach(`pass71-glass-${profile.label}-explosive-crossbow`, {
      body: Buffer.from(JSON.stringify({
        profile: profile.label,
        arena: 'atomic-acres',
        ...evidenceReceipt,
        faults,
      }, null, 2)),
      contentType: 'application/json',
    });
  });
}
