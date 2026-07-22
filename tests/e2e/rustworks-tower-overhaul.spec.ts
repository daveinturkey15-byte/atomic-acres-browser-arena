import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

type DebugSnapshot = {
  matchPhase: string;
  arenaSelection: { id: string; colliders: number; physicsColliders: number; raycastMeshes: number };
  render: {
    profile: string;
    calls: number;
    triangles: number;
    sceneObjects: number;
    framePacing: { cadenceHz: number; p95Ms: number; sampleCount: number };
    rustworksBlender: {
      status: string;
      assetVersion: string | null;
      authoredHeight: number;
      meshCount: number;
      triangleCount: number;
      semanticParts: number;
      texturedMaterials: number;
      pbrMaterials: number;
    };
  };
};

type DebugApi = {
  snapshot(): DebugSnapshot;
  startSolo(): void;
  setBotsFrozen(frozen: boolean): void;
  clearBots(): void;
  setCaptureCameraPose(x: number | null, y?: number, z?: number, yaw?: number, pitch?: number): void;
  setCaptureViewmodelHidden(hidden: boolean): void;
};

const outputRoot = resolve('artifacts/rustworks-tower-overhaul/browser');
const query = 'render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=5801&map=rustworks-1v1';

async function snapshot(page: import('@playwright/test').Page): Promise<DebugSnapshot> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

test('Rustworks tower overhaul renders the undercroft, west trench, and open freight route', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleEntries: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error' || entry.type() === 'warning') consoleEntries.push({ type: entry.type(), text: entry.text() });
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await mkdir(outputRoot, { recursive: true });

  await page.goto(`/?${query}`);
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    return Boolean(api && api.snapshot().arenaSelection.id === 'rustworks-1v1');
  }, undefined, { timeout: 30_000 });
  await expect.poll(async () => (await snapshot(page)).render.rustworksBlender.status, { timeout: 30_000 }).toBe('ready');

  await page.locator('#player-name').fill('RUSTWORKS QA');
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
  });
  await expect.poll(async () => (await snapshot(page)).matchPhase).toBe('active');
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.clearBots();
    api.setCaptureViewmodelHidden(true);
  });

  const poses = [
    { name: 'tower-hero', position: [24.5, 4.2, 0], yaw: Math.PI / 2, pitch: -0.24 },
    { name: 'undercroft-north', position: [0, 1.7, -7], yaw: Math.PI, pitch: -0.06 },
    { name: 'west-service-trench', position: [-13.8, 2.2, -18], yaw: Math.PI, pitch: -0.07 },
    { name: 'north-open-container', position: [-13.2, 1.7, -21.5], yaw: -Math.PI / 2, pitch: 0 },
  ] as const;
  for (const pose of poses) {
    await page.evaluate(({ position, yaw, pitch }) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__;
      api.setCaptureCameraPose(position[0], position[1], position[2], yaw, pitch);
    }, pose);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(outputRoot, `${pose.name}.png`) });
  }

  await page.waitForTimeout(1_200);
  const state = await snapshot(page);
  await writeFile(resolve(outputRoot, 'telemetry.json'), JSON.stringify(state, null, 2));
  await writeFile(resolve(outputRoot, 'console.json'), JSON.stringify({ consoleEntries, pageErrors }, null, 2));

  expect(state.arenaSelection).toMatchObject({ id: 'rustworks-1v1' });
  expect(state.arenaSelection.colliders).toBe(state.arenaSelection.physicsColliders);
  expect(state.arenaSelection.raycastMeshes).toBeGreaterThanOrEqual(state.arenaSelection.colliders);
  expect(state.render.rustworksBlender).toMatchObject({
    status: 'ready',
    assetVersion: 'rustworks-tower-overhaul-v1',
  });
  expect(state.render.rustworksBlender.authoredHeight).toBeGreaterThanOrEqual(15.8);
  expect(state.render.rustworksBlender.semanticParts).toBeGreaterThanOrEqual(250);
  expect(state.render.rustworksBlender.meshCount).toBeGreaterThanOrEqual(250);
  expect(state.render.rustworksBlender.texturedMaterials).toBeGreaterThanOrEqual(8);
  expect(state.render.rustworksBlender.pbrMaterials).toBeGreaterThanOrEqual(8);
  expect(pageErrors).toEqual([]);
  expect(consoleEntries.filter((entry) => entry.type === 'error')).toEqual([]);
});
