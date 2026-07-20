import { expect, test, type Page } from '@playwright/test';

type ArenaId = 'atomic-acres' | 'rustworks-1v1' | 'gun-range';
type Snapshot = {
  matchPhase: 'warmup' | 'active' | 'ended';
  arenaSelection: { id: ArenaId; physicsColliders: number };
  rangePractice: {
    score: number;
    hits: number;
    unlimitedAmmo: boolean;
    reserveHud: string;
    firingLineZ: number;
    playerDownrange: boolean;
    targets: Array<{ id: string; active: boolean; health: number; maxHealth: number }>;
  };
  leaderboard: {
    schemaVersion: number;
    entries: Array<{ id: string; name: string; kills: number; bestStreak: number }>;
    uniquePlayerKeys: number;
    renderedRows: number;
  };
  player: { hp: number; ammo: number; reserve: number; reloading: boolean; position: [number, number, number] };
  bots: Array<{ id: string; weapon: 'carbine' | 'smg' | 'scattergun' | 'sniper'; grenadeActive: boolean; presentationWeaponSafe: boolean }>;
  botGrenades: { active: number; maximumActiveObserved: number; throws: number; lastDamage: number; damageMultiplier: number; ownerIds: string[] };
  breakableWindows: Array<{ id: string; broken: boolean; visible: boolean }>;
  deathDrops: Array<{ id: string; ammoAvailable: boolean; weaponAvailable: boolean; expiresInMs: number }>;
  deathDropPresentation: { active: number; capacity: number };
  render: {
    lighting: { fogNear: number; fogFar: number };
    atmosphere: { enabled: boolean; arenaId: ArenaId; mistCards: number; smokeCards: number; dustMotes: number; triangles: number; perFrameAllocations: number };
    blenderEnvironment: { status: string; proceduralRootActuallyVisible: boolean; qualityArtRootVisible: boolean; overlappingPrimaryArenaRoots: boolean };
    contextLifecycle: { lost: boolean; losses: number; restorations: number };
  };
};

type DebugApi = {
  snapshot(): Snapshot;
  startSolo(): void;
  setBotsFrozen(frozen: boolean): void;
  placeBotAhead(distance?: number): void;
  forceBotGrenade(fuseMs?: number): boolean;
  setAmmo(weapon: 'carbine', ammo: number, reserve: number): void;
  equipWeapon(weapon: 'carbine'): void;
  teleportPlayer(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  fireOnce(): void;
  setMovement(forward: boolean, sprint?: boolean): void;
  hitRangeTarget(id: string, damage?: number, zone?: 'head' | 'body' | 'limb'): void;
  selectArena(id: ArenaId): Promise<void>;
  stageWindow(index: number, distance?: number): void;
  spawnDeathDrop(ageMs?: number): string | null;
};

function api(): DebugApi {
  return (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => api().snapshot());
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return Boolean(solo && !solo.disabled && (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__);
  }, undefined, { timeout: 35_000 });
  // page.evaluate serializes callbacks without Node closures; provide a
  // browser-global accessor used by the concise QA callbacks below.
  await page.evaluate(() => {
    (window as unknown as { api: () => DebugApi }).api = () => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__;
  });
}

async function deploySolo(page: Page): Promise<void> {
  await page.locator('#player-name').fill('PASS 36 QA');
  await page.evaluate(() => api().startSolo());
  await expect.poll(async () => (await snapshot(page)).matchPhase, { timeout: 15_000 }).toBe('active');
}

const light = 'render=performance&signal=off&grass=off&clouds=off&rays=off&multiplayerQa=1';

test.describe('Pass 36 range, atmosphere, windows, drops, and leaderboard', () => {
  test('deduplicates Dave to one best leaderboard row and rewrites legacy storage', async ({ page }) => {
    await page.addInitScript(() => {
      const base = { name: 'Dave', deaths: 4, won: false, recordedAt: Date.now() };
      localStorage.setItem('atomic-acres:high-scores:v1', JSON.stringify({
        version: 2,
        entries: [
          { ...base, id: 'global:dave', kills: 12, bestStreak: 8 },
          { ...base, id: 'score:local:completed', name: 'dave', kills: 14, bestStreak: 10 },
        ],
      }));
    });
    await page.goto(`/?${light}&mist=off&seed=3601`);
    await waitReady(page);
    const state = await snapshot(page);
    expect(state.leaderboard).toMatchObject({ schemaVersion: 3, uniquePlayerKeys: 1, renderedRows: 1 });
    expect(state.leaderboard.entries).toEqual([
      expect.objectContaining({ id: 'score:local:completed', kills: 14, bestStreak: 10 }),
    ]);
    await expect(page.locator('#high-score-list li:not(.empty)')).toHaveCount(1);
    await expect(page.locator('#high-score-list')).toContainText('dave');
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('atomic-acres:high-scores:v1')!));
    expect(persisted.version).toBe(3);
    expect(persisted.entries).toHaveLength(1);
  });

  test('Gun Range has endless reload supply, cumulative target score, and a bullet-transparent movement barrier', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?${light}&mist=off&seed=3602&map=gun-range`);
    await waitReady(page);
    await deploySolo(page);
    await page.evaluate(() => {
      const debug = api();
      debug.equipWeapon('carbine');
      debug.teleportPlayer(0, 1.7, 6, 0, 0);
      debug.setAmmo('carbine', 1, 0);
      debug.fireOnce();
    });
    await expect.poll(async () => {
      const state = await snapshot(page);
      return { ammo: state.player.ammo, reserve: state.player.reserve, reloading: state.player.reloading };
    }, { timeout: 5_000 }).toEqual({ ammo: 30, reserve: 0, reloading: false });
    await expect(page.locator('#reserve')).toHaveText('∞');
    expect((await snapshot(page)).rangePractice).toMatchObject({ unlimitedAmmo: true, reserveHud: '∞' });

    await page.evaluate(() => {
      const debug = api();
      debug.setAmmo('carbine', 1, 0);
      debug.fireOnce();
    });
    await expect.poll(async () => (await snapshot(page)).player.ammo, { timeout: 5_000 }).toBe(30);
    expect((await snapshot(page)).player.reserve).toBe(0);

    for (const expectedScore of [100, 200, 300]) {
      await page.evaluate(() => api().hitRangeTarget('near-0', 500, 'body'));
      await expect.poll(async () => (await snapshot(page)).rangePractice.score).toBe(expectedScore);
      await expect.poll(async () => (await snapshot(page)).rangePractice.targets.find((target) => target.id === 'near-0')?.active, { timeout: 4_000 }).toBe(true);
    }
    expect((await snapshot(page)).matchPhase).toBe('active');

    await page.evaluate(() => {
      const debug = api();
      debug.teleportPlayer(0, 1.7, 3.2, 0, 0);
      debug.setMovement(true, true);
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(1_800);
    await page.evaluate(() => api().setMovement(false));
    const stopped = await snapshot(page);
    expect(stopped.rangePractice.playerDownrange).toBe(false);
    expect(stopped.player.position[2]).toBeGreaterThanOrEqual(stopped.rangePractice.firingLineZ);

    const hitsBefore = stopped.rangePractice.hits;
    await page.evaluate(() => {
      const debug = api();
      debug.teleportPlayer(0, 1.7, 3.2, 0, 0);
      debug.setAmmo('carbine', 1, 0);
      debug.fireOnce();
    });
    await expect.poll(async () => (await snapshot(page)).rangePractice.hits).toBeGreaterThan(hitsBefore);
    const final = await snapshot(page);
    expect(final.render.contextLifecycle).toMatchObject({ lost: false, losses: 0 });
    expect(errors).toEqual([]);
  });

  test('uses one bounded, visible atmosphere pool with effective fog on every map', async ({ page }) => {
    await page.goto(`/?${light}&mist=on&seed=3603`);
    await waitReady(page);
    expect((await snapshot(page)).render).toMatchObject({
      lighting: { fogNear: 36, fogFar: 112 },
      atmosphere: { enabled: true, arenaId: 'atomic-acres', mistCards: 10, smokeCards: 5, dustMotes: 64, triangles: 30, perFrameAllocations: 0 },
    });
    await page.evaluate(() => api().selectArena('rustworks-1v1'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('rustworks-1v1');
    expect((await snapshot(page)).render).toMatchObject({
      lighting: { fogNear: 30, fogFar: 92 },
      atmosphere: { enabled: true, arenaId: 'rustworks-1v1', mistCards: 6, smokeCards: 3, dustMotes: 32, triangles: 18, perFrameAllocations: 0 },
    });
    await page.evaluate(() => api().selectArena('gun-range'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('gun-range');
    expect((await snapshot(page)).render).toMatchObject({
      lighting: { fogNear: 42, fogFar: 105 },
      atmosphere: { enabled: true, arenaId: 'gun-range', mistCards: 4, smokeCards: 2, dustMotes: 24, triangles: 12, perFrameAllocations: 0 },
    });
  });

  test('Quality Graphics never re-enables the coplanar procedural arena root', async ({ page }) => {
    await page.goto('/?render=blender&signal=off&grass=off&mist=on&clouds=off&rays=off&multiplayerQa=1&seed=36035');
    await waitReady(page);
    await expect(page.locator('#graphics-profile option[value="blender"]')).toHaveText('QUALITY GRAPHICS');
    expect((await snapshot(page)).render.blenderEnvironment).toMatchObject({
      status: 'ready',
      proceduralRootActuallyVisible: false,
      qualityArtRootVisible: true,
      overlappingPrimaryArenaRoots: false,
    });
    await page.evaluate(() => api().selectArena('rustworks-1v1'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('rustworks-1v1');
    await page.evaluate(() => api().selectArena('atomic-acres'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('atomic-acres');
    expect((await snapshot(page)).render.blenderEnvironment).toMatchObject({
      proceduralRootActuallyVisible: false,
      qualityArtRootVisible: true,
      overlappingPrimaryArenaRoots: false,
    });
  });

  test('spawns mixed bot weapons and admits only one reduced-damage bot grenade', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?${light}&mist=off&seed=36036`);
    await waitReady(page);
    await deploySolo(page);
    await page.waitForTimeout(1_100);
    await page.evaluate(() => {
      const debug = api();
      debug.setBotsFrozen(true);
      debug.placeBotAhead(8);
    });
    const spawned = await snapshot(page);
    expect(spawned.bots).toHaveLength(2);
    expect(new Set(spawned.bots.map((bot) => bot.weapon)).size).toBe(2);
    expect(spawned.bots.every((bot) => bot.presentationWeaponSafe)).toBe(true);
    const admissions = await page.evaluate(() => [api().forceBotGrenade(1_100), api().forceBotGrenade(1_100)]);
    expect(admissions).toEqual([true, false]);
    expect((await snapshot(page)).botGrenades).toMatchObject({
      active: 1,
      maximumActiveObserved: 1,
      throws: 1,
      damageMultiplier: 0.25,
    });
    await expect.poll(async () => (await snapshot(page)).botGrenades.active, { timeout: 4_000 }).toBe(0);
    const exploded = await snapshot(page);
    expect(exploded.botGrenades.maximumActiveObserved).toBe(1);
    expect(exploded.botGrenades.lastDamage).toBeGreaterThan(0);
    expect(exploded.botGrenades.lastDamage).toBeLessThanOrEqual(57.5);
    expect(exploded.player.hp).toBeCloseTo(100 - exploded.botGrenades.lastDamage, 4);
    expect(errors).toEqual([]);
  });

  test('breaks all six authored panes from playable sides in both render profiles', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const profile of ['performance', 'blender'] as const) {
      await page.goto(`/?render=${profile}&signal=off&grass=off&mist=off&clouds=off&rays=off&renderPaused=1&multiplayerQa=1&seed=3604-${profile}`);
      await waitReady(page);
      await deploySolo(page);
      await page.evaluate(() => {
        api().setBotsFrozen(true);
        api().equipWeapon('carbine');
        api().setAmmo('carbine', 30, 0);
      });
      for (let index = 0; index < 6; index += 1) {
        await page.evaluate((windowIndex) => {
          api().stageWindow(windowIndex, 4);
          api().fireOnce();
        }, index);
        await page.waitForTimeout(110);
      }
      await expect.poll(async () => (await snapshot(page)).breakableWindows.filter((pane) => pane.broken).length).toBe(6);
      expect((await snapshot(page)).breakableWindows.every((pane) => pane.broken && !pane.visible)).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('keeps a pooled gun/ammo death drop for 30 seconds and then releases it', async ({ page }) => {
    await page.goto(`/?${light}&mist=off&seed=3605`);
    await waitReady(page);
    await deploySolo(page);
    const freshId = await page.evaluate(() => api().spawnDeathDrop(0));
    expect(freshId).not.toBeNull();
    let state = await snapshot(page);
    expect(state.deathDrops[0]).toMatchObject({ id: freshId, ammoAvailable: true, weaponAvailable: true });
    expect(state.deathDrops[0].expiresInMs).toBeGreaterThan(28_500);
    expect(state.deathDrops[0].expiresInMs).toBeLessThanOrEqual(30_000);
    expect(state.deathDropPresentation.active).toBe(1);

    await page.evaluate(() => api().spawnDeathDrop(25_000));
    await page.waitForTimeout(150);
    expect((await snapshot(page)).deathDrops).toHaveLength(2);
    await expect.poll(async () => (await snapshot(page)).deathDrops.length, { timeout: 7_000 }).toBe(1);
    state = await snapshot(page);
    expect(state.deathDropPresentation.active).toBe(1);
  });
});
