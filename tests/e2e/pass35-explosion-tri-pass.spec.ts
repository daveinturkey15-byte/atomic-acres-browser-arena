import { expect, test } from '@playwright/test';

type ExplosionPool = {
  active: number;
  capacity: number;
  emitted: number;
  overflowReuses: number;
  dynamicLights: number;
  prewarmed: boolean;
};

type Pass35Snapshot = {
  matchPhase: 'warmup' | 'active' | 'ended';
  bots: Array<{ id: string; alive: boolean; position: number[] }>;
  deathDropPresentation: { capacity: number; active: number; prewarmed: boolean; dynamicLights: number };
  botEscalation: {
    dormantBots: number;
    dormantBotsPrewarmed: boolean;
    dynamicReinforcementLights: number;
    lastEliminationProfile: { deathDropMs: number; deathPoseMs: number; rewardAndFeedMs: number; reinforcementMs: number; totalSyncMs: number };
  };
  grenadeExplosion: {
    poolCapacity: number;
    dynamicLights: number;
    prewarmed: boolean;
    profile: { totalSyncMs: number };
  };
  audio: {
    explosionMix: { requests: number; mixes: number; coalesced: number; coalesceMs: number };
  };
  render: { contextLifecycle: { lost: boolean; losses: number; restorations: number } };
  fieldSupport: {
    tacticalMapOpen: boolean;
    tacticalHostiles: Array<{ id: string; kind: 'bot' | 'remote'; world: [number, number]; canvas: [number, number] }>;
    tacticalTargets: Array<{ x: number; z: number }>;
    triPassImpacts: number;
    explosionPresentation: ExplosionPool;
    explosionProfile: { source: string | null; totalSyncMs: number; visualMs: number; audioMs: number };
    explosionFrameProfile: { sources: string[]; impacts: number; totalSyncMs: number; maxImpactSyncMs: number };
    retiredPresentationRoots: number;
    prewarmedNuke: { shockwaveInScene: boolean; prewarmed: boolean; dynamicLights: number };
  };
};

type Pass35Api = {
  snapshot(): Pass35Snapshot;
  startSolo(): void;
  earnSupport(kills: number): void;
  activateSupport(id: 'tri-pass'): void;
  setBotsFrozen(frozen: boolean): void;
  placeBotAhead(distance: number): void;
  activateDormantReinforcement(): { activated: boolean; syncMs: number };
  selectTriPassWorldTargets(points: Array<[number, number]>): boolean;
  setRenderPaused(paused: boolean): void;
  throwGrenade(): void;
};

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: Pass35Api }).__ATOMIC_ACRES_DEBUG__;
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return Boolean(api && solo && !solo.disabled);
  }, undefined, { timeout: 30_000 });
}

async function deploySolo(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#player-name').fill('PASS 35 QA');
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
}

async function snapshot(page: import('@playwright/test').Page): Promise<Pass35Snapshot> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

test.describe('Pass 35 hitch-free explosions and Tri-Pass live targeting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=3501');
    await waitReady(page);
    await deploySolo(page);
  });

  test('shows moving living hostiles while selecting three Tri-Pass targets', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 960, height: 540 });
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
    await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.placeBotAhead(6);
      api.earnSupport(7);
      api.activateSupport('tri-pass');
    });
    const strikeOverlay = page.locator('#strike-map-overlay');
    await expect(strikeOverlay).toBeVisible();
    const overlayBounds = await strikeOverlay.boundingBox();
    expect(overlayBounds).not.toBeNull();
    expect(overlayBounds!.y).toBeGreaterThanOrEqual(0);
    expect(overlayBounds!.y + overlayBounds!.height).toBeLessThanOrEqual(540);

    let state = await snapshot(page);
    expect(state.fieldSupport.tacticalMapOpen).toBe(true);
    expect(state.fieldSupport.tacticalHostiles.length).toBeGreaterThan(0);
    await expect(page.locator('#strike-hostile-count')).toContainText(`ENEMIES LIVE · ${state.fieldSupport.tacticalHostiles.length}`);
    expect(state.fieldSupport.tacticalHostiles[0]).toMatchObject({ kind: 'bot' });
    const hostileId = state.fieldSupport.tacticalHostiles[0].id;
    const before = state.fieldSupport.tacticalHostiles[0].world;

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.placeBotAhead(14));
    await expect.poll(async () => (await snapshot(page)).fieldSupport.tacticalHostiles.find((entry) => entry.id === hostileId)?.world).not.toEqual(before);
    state = await snapshot(page);
    const hostile = state.fieldSupport.tacticalHostiles.find((entry) => entry.id === hostileId)!;
    expect(hostile.canvas[0]).toBeGreaterThan(0);
    expect(hostile.canvas[0]).toBeLessThan(480);
    expect(hostile.canvas[1]).toBeGreaterThan(0);
    expect(hostile.canvas[1]).toBeLessThan(480);

    const selected = await page.evaluate((target) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__;
      return api.selectTriPassWorldTargets([
        [target[0], target[1]],
        [target[0] + 2, target[1]],
        [target[0] - 2, target[1]],
      ]);
    }, hostile.world);
    expect(selected).toBe(true);
    await expect(page.locator('#strike-map-overlay')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).fieldSupport.triPassImpacts, { timeout: 12_000 }).toBe(3);

    state = await snapshot(page);
    expect(state.fieldSupport.explosionPresentation).toMatchObject({
      capacity: 12,
      emitted: 3,
      overflowReuses: 0,
      dynamicLights: 0,
      prewarmed: true,
    });
    expect(state.fieldSupport.explosionProfile.source).toBe('tri-pass');
    expect(state.fieldSupport.explosionProfile.totalSyncMs).toBeLessThan(12);
    expect(state.fieldSupport.explosionFrameProfile).toMatchObject({
      sources: ['tri-pass', 'tri-pass', 'tri-pass'],
      impacts: 3,
    });
    const impactTimingEvidence = JSON.stringify({
      frame: state.fieldSupport.explosionFrameProfile,
      elimination: state.botEscalation.lastEliminationProfile,
    });
    expect(state.fieldSupport.explosionFrameProfile.maxImpactSyncMs, impactTimingEvidence).toBeLessThan(12);
    expect(state.fieldSupport.explosionFrameProfile.totalSyncMs, impactTimingEvidence).toBeLessThan(30);
    expect(state.deathDropPresentation).toMatchObject({ capacity: 12, active: 1, prewarmed: true, dynamicLights: 0 });
    expect(state.botEscalation).toMatchObject({ dormantBots: 4, dormantBotsPrewarmed: true, dynamicReinforcementLights: 0 });
    expect(state.botEscalation.lastEliminationProfile.deathDropMs, impactTimingEvidence).toBeLessThan(4);
    const reinforcement = await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.activateDormantReinforcement());
    expect(reinforcement.activated).toBe(true);
    expect(reinforcement.syncMs).toBeLessThan(4);
    expect((await snapshot(page)).botEscalation.dormantBots).toBe(3);
    expect(state.audio.explosionMix.requests).toBeGreaterThanOrEqual(3);
    expect(state.audio.explosionMix.coalesced).toBeGreaterThanOrEqual(2);
    expect(state.fieldSupport.retiredPresentationRoots).toBeGreaterThanOrEqual(6);
    expect(state.fieldSupport.prewarmedNuke).toEqual({ shockwaveInScene: true, prewarmed: true, dynamicLights: 0 });
    expect(state.render.contextLifecycle.lost).toBe(false);
    expect(errors).toEqual([]);
  });

  test('keeps grenade detonation on its prewarmed unlit pool', async ({ page }) => {
    const before = await snapshot(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: Pass35Api }).__ATOMIC_ACRES_DEBUG__.throwGrenade());
    await expect.poll(async () => (await snapshot(page)).grenadeExplosion.profile.totalSyncMs, { timeout: 8_000 }).toBeGreaterThan(0);
    const state = await snapshot(page);
    expect(state.grenadeExplosion).toMatchObject({
      poolCapacity: 4,
      dynamicLights: 0,
      prewarmed: true,
    });
    expect(state.grenadeExplosion.profile.totalSyncMs).toBeLessThan(12);
    expect(state.audio.explosionMix.requests).toBeGreaterThan(before.audio.explosionMix.requests);
    expect(state.render.contextLifecycle.lost).toBe(false);
  });
});
