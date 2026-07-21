import { expect, test } from '@playwright/test';

type DebugSnapshot = {
  gameStarted: boolean;
  matchPhase: 'warmup' | 'active' | 'ended';
  arenaSelection: {
    id: 'atomic-acres' | 'rustworks-1v1' | 'gun-range';
    label: string;
    rules: { durationMs: number | null; scoreLimit: number | null };
    multiplayer: boolean;
    soloBotCount: number;
    rootVisible: boolean;
    activeRoots: string[];
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    spawnCounts: [number, number];
    colliders: number;
    navigationColliders: number;
    navigationCollidersMatchArena: boolean;
    targets: number;
  };
  rangePractice: {
    score: number;
    hits: number;
    activeTargets: number;
    values: number[];
    targets: Array<{ id: string; active: boolean; health: number; maxHealth: number }>;
  };
  menuCamera: { position: number[]; towerNdc: number[] };
  render: {
    grass: { checksum: string };
    rustworksBlender: {
      status: string;
      meshCount: number;
      triangleCount: number;
      authoredHeight: number;
      semanticParts: number;
      texturedMaterials?: number;
      pbrMaterials?: number;
      assetVersion?: string | null;
    };
  };
  bots: Array<{ id: string; alive: boolean }>;
  player: { kills: number; position: [number, number, number] };
};

type RustworksAccessStage = {
  route: 'ground-to-lower' | 'lower-to-upper';
  descending: boolean;
  start: number[];
  target: number[];
  direction: number[];
  run: number;
};

type DebugApi = {
  snapshot(): DebugSnapshot;
  startSolo(): void;
  returnToMainMenu(): void;
  hitRangeTarget(id: string, damage?: number, zone?: 'head' | 'body' | 'limb'): void;
  setKills(kills: number): void;
  stageRustworksAccess(route: 'ground-to-lower' | 'lower-to-upper', descending?: boolean): RustworksAccessStage | null;
  setMovement(forward: boolean, sprint?: boolean): void;
  teleportPlayer(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  fireOnce(): void;
};

async function snapshot(page: import('@playwright/test').Page): Promise<DebugSnapshot> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return Boolean(solo && !solo.disabled && (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__);
  }, undefined, { timeout: 30_000 });
}

async function deploySolo(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.locator('#player-name').fill(name);
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
}

const lightweight = 'render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&renderPaused=1';
const blenderLightweight = 'render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&renderPaused=1';

test.describe('Pass 34 combat, navigation, and authored map contracts', () => {
  test('Atomic Acres keeps five minutes and does not end at 25 kills', async ({ page }) => {
    await page.goto(`/?${lightweight}&seed=3301`);
    await waitReady(page);
    await expect(page.locator('.map-card[data-arena-id]')).toHaveCount(3);
    await expect(page.locator('.map-card[data-arena-id="atomic-acres"]')).toHaveAttribute('aria-pressed', 'true');
    const before = await snapshot(page);
    expect(before.arenaSelection).toMatchObject({
      id: 'atomic-acres',
      rules: { durationMs: 300_000, scoreLimit: null },
      rootVisible: true,
      activeRoots: ['atomic-acres'],
    });
    await deploySolo(page, 'NO CAP');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.setKills(30));
    await page.waitForTimeout(250);
    const after = await snapshot(page);
    expect(after.player.kills).toBe(30);
    expect(after.matchPhase).toBe('active');
    await expect(page.locator('#objective')).not.toContainText('25');
    await expect(page.locator('#timer')).toHaveText(/04:5[5-9]/);
  });

  test('Rustworks selects an original collision-backed arena with private host options and one solo bot', async ({ page }) => {
    await page.goto(`/?${lightweight}&seed=3302&map=rustworks-1v1`);
    await waitReady(page);
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'rustworks-1v1');
    await expect(page.locator('.map-card[data-arena-id="rustworks-1v1"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await snapshot(page)).render.grass.checksum).toBe('c15dd4d5');
    await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres');
    await page.locator('.map-card[data-arena-id="rustworks-1v1"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'rustworks-1v1');
    await expect(page.locator('#arena-title')).toContainText('RUST');
    await expect(page.locator('#solo')).toHaveText('1 BOT SKIRMISH');
    await expect(page.locator('#host')).toBeEnabled();
    await expect(page.locator('#join')).toBeEnabled();
    const selected = await snapshot(page);
    expect(selected.arenaSelection).toMatchObject({
      id: 'rustworks-1v1',
      label: 'Rustworks',
      rules: { durationMs: 300_000, scoreLimit: null },
      multiplayer: true,
      soloBotCount: 1,
      rootVisible: true,
      activeRoots: ['rustworks-1v1'],
    });
    expect(selected.arenaSelection.colliders).toBeGreaterThanOrEqual(25);
    expect(selected.arenaSelection.navigationColliders).toBeGreaterThan(0);
    expect(selected.arenaSelection.navigationColliders).toBeLessThanOrEqual(selected.arenaSelection.colliders);
    expect(selected.arenaSelection.navigationCollidersMatchArena).toBe(true);
    expect(selected.menuCamera.towerNdc[0]).toBeGreaterThan(0.2);
    expect(selected.menuCamera.towerNdc[0]).toBeLessThan(0.75);
    expect(selected.render.grass.checksum).toBe('c15dd4d5');
    await deploySolo(page, 'DUELIST');
    const active = await snapshot(page);
    expect(active.bots).toHaveLength(1);
    expect(active.bots[0].alive).toBe(true);
    expect(active.player.position[0]).toBeGreaterThanOrEqual(active.arenaSelection.bounds.minX);
    expect(active.player.position[0]).toBeLessThanOrEqual(active.arenaSelection.bounds.maxX);
    await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#main-menu')).toBeHidden();
    await expect(page.locator('.map-card[data-arena-id="gun-range"]')).toBeEnabled();
    expect((await snapshot(page)).gameStarted).toBe(false);
  });

  test('Gun Range is untimed solo score practice with three target values', async ({ page }) => {
    await page.goto(`/?${lightweight}&seed=3303&map=gun-range`);
    await waitReady(page);
    await expect(page.locator('.map-card[data-arena-id="gun-range"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#solo')).toHaveText('START RANGE');
    await expect(page.locator('#host')).toBeDisabled();
    await expect(page.locator('#join')).toBeDisabled();
    await deploySolo(page, 'RANGER');
    let state = await snapshot(page);
    expect(state.arenaSelection).toMatchObject({
      id: 'gun-range',
      label: 'Acres Gun Range',
      rules: { durationMs: null, scoreLimit: null },
      multiplayer: false,
      soloBotCount: 0,
      rootVisible: true,
      activeRoots: ['gun-range'],
      targets: 9,
      navigationCollidersMatchArena: true,
    });
    expect(state.bots).toHaveLength(0);
    expect(state.rangePractice.values.sort((a, b) => a - b)).toEqual([
      100, 100, 100, 200, 200, 200, 300, 300, 300,
    ]);
    await expect(page.locator('#timer')).toHaveText('--:--');
    await expect(page.locator('#aqua-label')).toHaveText('SCORE');
    await expect(page.locator('#coral-label')).toHaveText('HITS');
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.teleportPlayer(0, 1.7, 6, 0, 0);
      api.fireOnce();
    });
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.hits === 1);
    state = await snapshot(page);
    expect(state.rangePractice).toMatchObject({ score: 0, hits: 1, activeTargets: 9 });
    const centreTarget = state.rangePractice.targets.find((target) => target.id === 'near-0');
    expect(centreTarget?.maxHealth).toBe(500);
    expect(centreTarget?.health).toBeGreaterThan(0);
    expect(centreTarget?.health).toBeLessThan(500);
    await page.evaluate(() => {
      (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.hitRangeTarget('near-0', 500, 'body');
    });
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.score === 100);
    state = await snapshot(page);
    expect(state.rangePractice).toMatchObject({ score: 100, hits: 2, activeTargets: 8 });
    await expect(page.locator('#objective')).toContainText('SCORE 100 · 2 HITS');
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.activeTargets), { timeout: 4_000 }).toBe(9);
  });

  test('Quality Graphics loads the original tall Rustworks tower detail asset', async ({ page }) => {
    await page.goto(`/?${blenderLightweight}&seed=3404&map=rustworks-1v1`);
    await waitReady(page);
    const state = await snapshot(page);
    expect(state.arenaSelection.id).toBe('rustworks-1v1');
    expect(state.render.rustworksBlender.status).toBe('ready');
    expect(state.render.rustworksBlender.meshCount).toBeGreaterThanOrEqual(140);
    expect(state.render.rustworksBlender.meshCount).toBeLessThanOrEqual(550);
    expect(state.render.rustworksBlender.semanticParts).toBeGreaterThanOrEqual(140);
    expect(state.render.rustworksBlender.authoredHeight).toBeGreaterThanOrEqual(14);
    expect(state.render.rustworksBlender.triangleCount).toBeGreaterThan(0);
    expect(state.render.rustworksBlender.texturedMaterials ?? 0).toBeGreaterThanOrEqual(8);
  });

  test('Rustworks access routes walk ascending and descending with normal movement', async ({ page }) => {
    await page.goto(`/?${lightweight}&seed=3405&map=rustworks-1v1`);
    await waitReady(page);
    await deploySolo(page, 'CLIMBER');
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi & { setBotsFrozen(frozen: boolean): void } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
    });

    async function walkRoute(route: 'ground-to-lower' | 'lower-to-upper', descending: boolean): Promise<void> {
      const staged = await page.evaluate(({ routeName, down }) => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
        return api.stageRustworksAccess(routeName, down);
      }, { routeName: route, down: descending });
      expect(staged, `${route}:${descending ? 'down' : 'up'}`).toBeTruthy();
      await page.evaluate(() => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.setMovement(true, true);
      });
      await page.waitForFunction(({ targetY, targetX, targetZ }) => {
        const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
        const pos = api.snapshot().player.position;
        const horizontal = Math.hypot(pos[0] - targetX, pos[2] - targetZ);
        const vertical = Math.abs(pos[1] - targetY);
        return horizontal < 0.9 && vertical < 0.9;
      }, {
        targetY: staged!.target[1],
        targetX: staged!.target[0],
        targetZ: staged!.target[2],
      }, { timeout: 25_000 });
      await page.evaluate(() => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.setMovement(false, false);
      });
      const after = await snapshot(page);
      expect(Math.hypot(after.player.position[0] - staged!.target[0], after.player.position[2] - staged!.target[2])).toBeLessThan(0.95);
      expect(Math.abs(after.player.position[1] - staged!.target[1])).toBeLessThan(0.95);
      // Confirm the climb/descent actually changed elevation for vertical routes.
      expect(Math.abs(after.player.position[1] - staged!.start[1])).toBeGreaterThan(1.2);
    }

    await walkRoute('ground-to-lower', false);
    await walkRoute('ground-to-lower', true);
    await walkRoute('lower-to-upper', false);
    await walkRoute('lower-to-upper', true);
  });
});
