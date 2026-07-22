import { expect, test, type Page } from '@playwright/test';

type ArenaId = 'atomic-acres' | 'rustworks-1v1' | 'gun-range';
type Snapshot = {
  matchPhase: 'warmup' | 'active' | 'ended';
  arenaSelection: {
    id: ArenaId;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    physicsBoundaryWalls: number;
  };
  player: { position: [number, number, number] };
  render: {
    blenderEnvironment: {
      status: string;
      triangleCount: number;
      surfaceSeparationPass: boolean;
      proceduralRootActuallyVisible: boolean;
      qualityArtRootVisible: boolean;
      overlappingPrimaryArenaRoots: boolean;
    };
    contextLifecycle: { lost: boolean; losses: number; restorations: number };
  };
};

type DebugApi = {
  snapshot(): Snapshot;
  startSolo(): void;
  selectArena(id: ArenaId): Promise<void>;
  teleportPlayer(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  setMovement(forward: boolean, sprint?: boolean): void;
};

function api(): DebugApi {
  return (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return Boolean(solo && !solo.disabled && (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__);
  }, undefined, { timeout: 35_000 });
  await page.evaluate(() => {
    (window as unknown as { api: () => DebugApi }).api = () => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__;
  });
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => api().snapshot());
}

test.describe('Pass 37 Quality surface separation and fall-proof bounds', () => {
  test('loads the separated Quality asset and preserves exclusive authored-root authority through map transitions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&multiplayerQa=1&seed=37001');
    await waitReady(page);
    await expect(page.locator('.eyebrow')).toContainText('PASS 57');
    await expect(page.locator('#graphics-profile option[value="blender"]')).toHaveText('QUALITY GRAPHICS');
    expect((await snapshot(page)).render.blenderEnvironment).toMatchObject({
      status: 'ready',
      triangleCount: 34_336,
      surfaceSeparationPass: true,
      proceduralRootActuallyVisible: false,
      qualityArtRootVisible: true,
      overlappingPrimaryArenaRoots: false,
    });
    await page.evaluate(() => api().selectArena('rustworks-1v1'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('rustworks-1v1');
    await page.evaluate(() => api().selectArena('atomic-acres'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id).toBe('atomic-acres');
    const final = await snapshot(page);
    expect(final.render.blenderEnvironment).toMatchObject({
      surfaceSeparationPass: true,
      proceduralRootActuallyVisible: false,
      qualityArtRootVisible: true,
      overlappingPrimaryArenaRoots: false,
    });
    expect(final.render.contextLifecycle).toMatchObject({ lost: false, losses: 0 });
    expect(errors).toEqual([]);
  });

  test('physically contains the Gun Range player at left, right, rear, and downrange bounds', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&multiplayerQa=1&map=gun-range&seed=37002');
    await waitReady(page);
    await page.locator('#player-name').fill('PASS 37 QA');
    await page.evaluate(() => api().startSolo());
    await expect.poll(async () => (await snapshot(page)).matchPhase, { timeout: 15_000 }).toBe('active');
    expect((await snapshot(page)).arenaSelection.physicsBoundaryWalls).toBe(4);

    for (const probe of [
      { start: [14, 1.7, -17] as const, yaw: -Math.PI / 2, edge: 'right' as const },
      { start: [-14, 1.7, -17] as const, yaw: Math.PI / 2, edge: 'left' as const },
      { start: [0, 1.7, 8] as const, yaw: Math.PI, edge: 'rear' as const },
      { start: [0, 1.7, -41] as const, yaw: 0, edge: 'downrange' as const },
    ]) {
      await page.evaluate(({ start, yaw }) => {
        const debug = api();
        debug.teleportPlayer(start[0], start[1], start[2], yaw, 0);
        debug.setMovement(true, true);
      }, probe);
      await page.waitForTimeout(1_200);
      await page.evaluate(() => api().setMovement(false));
      const state = await snapshot(page);
      const [x, y, z] = state.player.position;
      expect(x).toBeGreaterThan(state.arenaSelection.bounds.minX);
      expect(x).toBeLessThan(state.arenaSelection.bounds.maxX);
      expect(z).toBeGreaterThan(state.arenaSelection.bounds.minZ);
      expect(z).toBeLessThan(state.arenaSelection.bounds.maxZ);
      expect(y).toBeGreaterThan(1.5);
      if (probe.edge === 'right') expect(x).toBeGreaterThan(14.4);
      if (probe.edge === 'left') expect(x).toBeLessThan(-14.4);
      if (probe.edge === 'rear') expect(z).toBeGreaterThan(8.4);
      if (probe.edge === 'downrange') expect(z).toBeLessThan(-41.4);
    }
    const final = await snapshot(page);
    expect(final.render.contextLifecycle).toMatchObject({ lost: false, losses: 0 });
    expect(errors).toEqual([]);
  });
});
