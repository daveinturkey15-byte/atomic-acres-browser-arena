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
  rangePractice: { score: number; hits: number; activeTargets: number; values: number[] };
  render: { grass: { checksum: string } };
  bots: Array<{ id: string; alive: boolean }>;
  player: { kills: number; position: [number, number, number] };
};

type DebugApi = {
  snapshot(): DebugSnapshot;
  startSolo(): void;
  hitRangeTarget(id: string): void;
  setKills(kills: number): void;
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

test.describe('Pass 33 map selector and mode contracts', () => {
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

  test('1V1 Rust selects an original collision-backed arena and exactly one rival', async ({ page }) => {
    await page.goto(`/?${lightweight}&seed=3302&map=rustworks-1v1`);
    await waitReady(page);
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'rustworks-1v1');
    await expect(page.locator('.map-card[data-arena-id="rustworks-1v1"]')).toHaveAttribute('aria-pressed', 'true');
    expect((await snapshot(page)).render.grass.checksum).toBe('81871ba9');
    await page.locator('.map-card[data-arena-id="atomic-acres"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres');
    await page.locator('.map-card[data-arena-id="rustworks-1v1"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'rustworks-1v1');
    await expect(page.locator('#arena-title')).toContainText('1V1 RUST');
    await expect(page.locator('#solo')).toHaveText('1V1 BOT');
    await expect(page.locator('#host')).toBeDisabled();
    await expect(page.locator('#join')).toBeDisabled();
    const selected = await snapshot(page);
    expect(selected.arenaSelection).toMatchObject({
      id: 'rustworks-1v1',
      label: 'Rustworks 1V1',
      rules: { durationMs: 300_000, scoreLimit: 25 },
      multiplayer: false,
      soloBotCount: 1,
      rootVisible: true,
      activeRoots: ['rustworks-1v1'],
    });
    expect(selected.arenaSelection.colliders).toBeGreaterThanOrEqual(25);
    expect(selected.arenaSelection.navigationColliders).toBeGreaterThan(0);
    expect(selected.arenaSelection.navigationColliders).toBeLessThanOrEqual(selected.arenaSelection.colliders);
    expect(selected.arenaSelection.navigationCollidersMatchArena).toBe(true);
    expect(selected.render.grass.checksum).toBe('81871ba9');
    await deploySolo(page, 'DUELIST');
    const active = await snapshot(page);
    expect(active.bots).toHaveLength(1);
    expect(active.bots[0].alive).toBe(true);
    expect(active.player.position[0]).toBeGreaterThanOrEqual(active.arenaSelection.bounds.minX);
    expect(active.player.position[0]).toBeLessThanOrEqual(active.arenaSelection.bounds.maxX);
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
    await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.score === 100);
    state = await snapshot(page);
    expect(state.rangePractice).toMatchObject({ score: 100, hits: 1, activeTargets: 8 });
    await expect(page.locator('#objective')).toContainText('SCORE 100 · 1 HITS');
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice.activeTargets), { timeout: 4_000 }).toBe(9);
  });
});
