import { expect, test, type Page } from '@playwright/test';

type ArenaId = 'atomic-acres' | 'rustworks-1v1' | 'gun-range' | 'skyline-terminal';
type Snapshot = {
  arenaSelection: { id: ArenaId };
  render: {
    atomicSignal: {
      enabled: boolean;
      contactShadowStrength: number;
      selectiveBloomStrength: number;
      bloomResolutionScale: number;
      depthFogStrength: number;
    };
    graphicsRefinement: {
      pass: 62;
      arenaId: ArenaId;
      refinedMaterials: number;
      refinedTextures: number;
      selectiveBloomObjects: number;
      shadowVolume: { halfWidth: number; halfHeight: number; near: number; far: number };
      budget: { tier: string; particleDensityScale: number; decalLifetimeScale: number };
    };
    qualityAssetStreaming: {
      initialArena: ArenaId;
      eagerQualityGlbs: number;
      atomicAcres: string;
      rustworks: string;
    };
  };
};

type DebugApi = {
  snapshot(): Snapshot;
  selectArena(id: ArenaId): Promise<void>;
};

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('#solo');
    return Boolean(button && !button.disabled && (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__);
  }, undefined, { timeout: 40_000 });
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
  ).__ATOMIC_ACRES_DEBUG__.snapshot());
}

test.describe('Pass 62 isolated graphics refinement', () => {
  test('streams compressed Quality arenas on demand and exposes bounded effect telemetry', async ({ page }) => {
    test.setTimeout(150_000);
    const qualityGlbRequests: string[] = [];
    page.on('request', (request) => {
      if (/atomic-acres-blender-arena\.glb|rustworks-central-tower\.glb/.test(request.url())) qualityGlbRequests.push(request.url());
    });
    await page.goto('/?render=blender&map=gun-range&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=62001');
    await waitReady(page);
    const initial = await snapshot(page);
    expect(initial.render.graphicsRefinement).toMatchObject({ pass: 62, arenaId: 'gun-range' });
    expect(initial.render.graphicsRefinement.refinedMaterials).toBeGreaterThan(0);
    expect(initial.render.graphicsRefinement.shadowVolume.halfHeight).toBe(66);
    expect(initial.render.graphicsRefinement.budget.particleDensityScale).toBeGreaterThan(0);
    expect(initial.render.graphicsRefinement.budget.decalLifetimeScale).toBeGreaterThan(0);
    expect(initial.render.atomicSignal.contactShadowStrength).toBeGreaterThan(0);
    expect(initial.render.atomicSignal.selectiveBloomStrength).toBeGreaterThan(0);
    expect(initial.render.atomicSignal.depthFogStrength).toBeGreaterThan(0);
    expect(initial.render.qualityAssetStreaming).toMatchObject({ initialArena: 'gun-range', eagerQualityGlbs: 0 });
    expect(qualityGlbRequests).toHaveLength(0);

    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.selectArena('rustworks-1v1'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id, { timeout: 40_000 }).toBe('rustworks-1v1');
    expect(qualityGlbRequests.filter((url) => url.includes('rustworks-central-tower.glb'))).toHaveLength(1);
    expect(qualityGlbRequests.some((url) => url.includes('atomic-acres-blender-arena.glb'))).toBe(false);

    await page.evaluate(() => (
      window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }
    ).__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'));
    await expect.poll(async () => (await snapshot(page)).arenaSelection.id, { timeout: 40_000 }).toBe('atomic-acres');
    const final = await snapshot(page);
    expect(qualityGlbRequests.filter((url) => url.includes('atomic-acres-blender-arena.glb'))).toHaveLength(1);
    expect(final.render.graphicsRefinement.arenaId).toBe('atomic-acres');
    expect(final.render.qualityAssetStreaming).toMatchObject({ atomicAcres: 'ready', rustworks: 'ready' });
  });
});
