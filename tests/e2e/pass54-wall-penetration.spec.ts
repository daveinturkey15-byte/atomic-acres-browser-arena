import { expect, test } from '@playwright/test';

type WallbangTrace = {
  reachedDistance: boolean;
  damageMultiplier: number;
  stoppedBy?: { material: string };
  impacts: Array<{ surface: { material: string }; penetrated: boolean }>;
};

type WallbangDebugApi = {
  snapshot(): {
    ballistics: {
      activeSurfaces: number;
      weaponProfiles: Record<string, { caliber: string; penetrationPower: number }>;
      arenas: Record<string, { raycastMeshes: number; shotSurfaces: number; fallbackSurfaces: string[] }>;
    };
  };
  traceBallistics(
    weapon: string,
    origin: [number, number, number],
    direction: [number, number, number],
    distance: number,
    arenaId?: string,
  ): WallbangTrace;
};

test('all live arenas use classified wallbang authority and actual authored cover', async ({ page }) => {
  await page.goto('/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&renderPaused=1&multiplayerQa=1&seed=5401');
  await page.waitForFunction(() => Boolean(
    (window as unknown as { __ATOMIC_ACRES_DEBUG__?: WallbangDebugApi }).__ATOMIC_ACRES_DEBUG__?.snapshot().ballistics,
  ), undefined, { timeout: 30_000 });

  const result = await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: WallbangDebugApi }).__ATOMIC_ACRES_DEBUG__;
    const closeSmg = api.traceBallistics('smg', [-17, 1.7, -17], [0, 0, -1], 8, 'atomic-acres');
    const longSmg = api.traceBallistics('smg', [-17, 1.7, 10], [0, 0, -1], 35, 'atomic-acres');
    const longSniper = api.traceBallistics('sniper', [-17, 1.7, 10], [0, 0, -1], 35, 'atomic-acres');
    const fence = api.traceBallistics('carbine', [0, 1.5, -33], [0, 0, -1], 6, 'skyline-terminal');
    const container = api.traceBallistics('sniper', [-20, 1.3, -8], [0, 0, -1], 8, 'rustworks-1v1');
    return { snapshot: api.snapshot().ballistics, closeSmg, longSmg, longSniper, fence, container };
  });

  expect(Object.keys(result.snapshot.weaponProfiles).sort()).toEqual([
    'carbine', 'machine-pistol', 'pistol', 'scattergun', 'smg', 'sniper',
  ]);
  expect(Object.keys(result.snapshot.arenas).sort()).toEqual([
    'atomic-acres', 'gun-range', 'rustworks-1v1', 'skyline-terminal',
  ]);
  for (const arena of Object.values(result.snapshot.arenas)) {
    expect(arena.shotSurfaces).toBeGreaterThan(0);
    expect(arena.fallbackSurfaces).toEqual([]);
  }

  expect(result.closeSmg.reachedDistance).toBe(true);
  expect(result.closeSmg.impacts.some((impact) => impact.surface.material === 'interior-wall' && impact.penetrated)).toBe(true);
  expect(result.longSmg.reachedDistance).toBe(true);
  expect(result.longSmg.damageMultiplier).toBeLessThan(result.closeSmg.damageMultiplier);
  expect(result.longSniper.damageMultiplier).toBeGreaterThan(result.longSmg.damageMultiplier);
  expect(result.fence.impacts.some((impact) => impact.surface.material === 'fence' && impact.penetrated)).toBe(true);
  expect(result.container.reachedDistance).toBe(false);
  expect(result.container.stoppedBy?.material).toBe('container');
});
