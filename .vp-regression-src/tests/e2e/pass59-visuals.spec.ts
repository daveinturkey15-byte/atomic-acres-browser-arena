import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const evidenceRoot = resolve('artifacts/pass59/browser');
const maps = [
  { id: 'rustworks-1v1', pose: [0, 9, 24, 0, -0.14], expectedAudit: 'object' },
  { id: 'skyline-terminal', pose: [0, 5, -20, 0, -0.02], expectedAudit: 'array' },
  { id: 'atomic-acres', pose: [27, 5, 38, 0, -0.08], expectedAudit: 'object' },
] as const;

async function ready(page: Page, map: string, profile: string): Promise<void> {
  await page.goto(`/?render=${profile}&map=${map}&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=5901`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((expectedMap) => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => { arenaSelection: { id: string }; frameCount: number } } }).__ATOMIC_ACRES_DEBUG__;
    const state = api?.snapshot();
    return state?.arenaSelection.id === expectedMap && state.frameCount > 12;
  }, map, { timeout: 60_000 });
}

test('keeps Pass 59 mechanical geometry invariant across render profiles', async ({ page }) => {
  test.setTimeout(180_000);
  const baselineByMap = new Map<string, { colliders: number; physicsColliders: number; audit: string }>();
  const performanceComparison: Array<{
    map: string;
    profile: string;
    cadenceHz: number;
    medianMs: number;
    p95Ms: number;
    maxMs: number;
    calls: number;
    triangles: number;
  }> = [];
  for (const profile of ['performance', 'blender', 'compat'] as const) {
    for (const map of maps) {
      await ready(page, map.id, profile);
      await page.waitForFunction(() => (
        window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => { render: { framePacing: { ready: boolean } } } } }
      ).__ATOMIC_ACRES_DEBUG__?.snapshot().render.framePacing.ready, undefined, { timeout: 60_000 });
      const state = await page.evaluate(() => (
        window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => {
          arenaSelection: { colliders: number; physicsColliders: number; pass59GeometryAudit: unknown };
          render: {
            profile: string;
            calls: number;
            triangles: number;
            contextLifecycle: { losses: number; restorations: number };
            framePacing: {
              ready: boolean;
              sampleCount: number;
              cadenceHz: number;
              medianMs: number;
              p95Ms: number;
              maxMs: number;
            };
          };
        } } }
      ).__ATOMIC_ACRES_DEBUG__.snapshot());
      expect(state.arenaSelection.colliders).toBeGreaterThan(0);
      expect(state.arenaSelection.physicsColliders).toBeGreaterThan(0);
      expect(state.arenaSelection.pass59GeometryAudit).toBeTruthy();
      if (map.expectedAudit === 'array') expect(Array.isArray(state.arenaSelection.pass59GeometryAudit)).toBe(true);
      else expect(Array.isArray(state.arenaSelection.pass59GeometryAudit)).toBe(false);
      const mechanics = {
        colliders: state.arenaSelection.colliders,
        physicsColliders: state.arenaSelection.physicsColliders,
        audit: JSON.stringify(state.arenaSelection.pass59GeometryAudit),
      };
      if (profile === 'performance') baselineByMap.set(map.id, mechanics);
      else expect(mechanics).toEqual(baselineByMap.get(map.id));
      expect(state.render.framePacing.sampleCount).toBeGreaterThanOrEqual(90);
      expect(state.render.framePacing.p95Ms).toBeLessThan(250);
      expect(state.render.contextLifecycle.losses).toBe(0);
      performanceComparison.push({
        map: map.id,
        profile,
        cadenceHz: state.render.framePacing.cadenceHz,
        medianMs: state.render.framePacing.medianMs,
        p95Ms: state.render.framePacing.p95Ms,
        maxMs: state.render.framePacing.maxMs,
        calls: state.render.calls,
        triangles: state.render.triangles,
      });
    }
  }
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(
    resolve(evidenceRoot, 'performance-comparison.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), samples: performanceComparison }, null, 2)}\n`,
    'utf8',
  );
});

test('captures the corrected Rustworks, Skyline, and Atomic Acres structures', async ({ page }) => {
  await mkdir(evidenceRoot, { recursive: true });
  for (const map of maps) {
    await ready(page, map.id, 'performance');
    await page.evaluate(([x, y, z, yaw, pitch]) => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        startSolo: () => void;
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
        setCaptureViewmodelHidden: (hidden: boolean) => void;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.startSolo();
      api.setCaptureCameraPose(x, y, z, yaw, pitch);
      api.setCaptureViewmodelHidden(true);
    }, map.pose);
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve(evidenceRoot, `${map.id}.png`), animations: 'disabled' });
  }
});