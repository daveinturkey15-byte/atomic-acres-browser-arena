import { expect, test, type Page } from '@playwright/test';

type Pass25State = {
  frameCount: number;
  gameStarted: boolean;
  matchPhase: string;
  menuVisible: boolean;
  scores: [number, number];
  player: { position: [number, number, number]; velocity: [number, number, number] };
  deathDrops: unknown[];
  breakableWindows: Array<{ broken: boolean }>;
  random: { seed: string; gameplayState: number; presentationState: number };
  aimAlignment: {
    canvas: { left: number; top: number; width: number; height: number };
    reticleCentre: { x: number; y: number };
    rayNdc: [number, number];
    errorCssPixels: number;
  };
  lastPrincipalShotAlignment: {
    weapon: string;
    angularError: number;
    sample: [number, number];
    direction: [number, number, number];
    cameraDirection: [number, number, number];
  } | null;
  weaponReady: boolean;
  originalArtLoaded: boolean;
  weaponPresentation: { adsProgress: number; weapon: string; shotsPresented: number };
  render: {
    profile: string;
    shadowMode: string;
    shadowAutoUpdate: boolean;
    staticShadowDynamicRefreshes: number;
    contextLifecycle: { lost: boolean; losses: number; restorations: number };
    atomicSignal: { enabled: boolean; targetValidated: boolean; outputValidated: boolean };
  };
};

async function snapshot(page: Page): Promise<Pass25State> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Pass25State } }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function ready(page: Page, profile: 'performance' | 'blender' = 'performance', forceSignal = false): Promise<void> {
  await page.goto(`/?render=${profile}&seed=pass25a-browser-baseline${forceSignal ? '&signal=on' : ''}`);
  await page.waitForFunction(() => {
    const state = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => Pass25State } }).__ATOMIC_ACRES_DEBUG__?.snapshot();
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    return state?.weaponReady === true && state.originalArtLoaded === true && solo?.disabled === false;
  }, undefined, { timeout: 30_000 });
}

async function startSolo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { startSolo: () => void } }).__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Pass25State } }).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, { timeout: 15_000 });
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
}

async function assertAimAlignment(page: Page): Promise<void> {
  const state = await snapshot(page);
  expect(state.aimAlignment.canvas.width).toBeGreaterThan(0);
  expect(state.aimAlignment.canvas.height).toBeGreaterThan(0);
  expect(state.aimAlignment.errorCssPixels).toBeLessThanOrEqual(1);
  expect(Math.abs(state.aimAlignment.rayNdc[0])).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(state.aimAlignment.rayNdc[1])).toBeLessThanOrEqual(1e-6);
}

test.describe('Pass 25A baseline and lifecycle', () => {
  test('stores a stable seeded menu visual baseline', async ({ page }) => {
    await ready(page);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
    expect((await snapshot(page)).random.seed).toBe('pass25a-browser-baseline');
    await expect(page).toHaveScreenshot('pass25a-performance-menu.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
  });

  const aimViewports = [{ width: 960, height: 540 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }];
  for (const viewport of aimViewports) {
    test(`keeps canvas reticle and principal shot on the authoritative ray for every weapon at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(240_000);
      await ready(page);
      await startSolo(page);
      await page.setViewportSize(viewport);
      const weapons = ['carbine', 'smg', 'scattergun', 'sniper', 'pistol', 'machine-pistol'];
      for (const weapon of weapons) {
        await page.evaluate(({ selected }) => {
          const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
            equipWeapon: (weapon: string) => void;
            setAds: (held: boolean) => void;
            fireOnce: () => void;
          } }).__ATOMIC_ACRES_DEBUG__;
          api.setAds(false);
          api.equipWeapon(selected);
          api.fireOnce();
        }, { selected: weapon });
        await expect.poll(async () => (await snapshot(page)).lastPrincipalShotAlignment?.weapon).toBe(weapon);
        let state = await snapshot(page);
        expect(state.lastPrincipalShotAlignment?.sample).toEqual([0, 0]);
        expect(state.lastPrincipalShotAlignment?.angularError).toBeLessThanOrEqual(1e-7);
        await assertAimAlignment(page);

        await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setAds(true));
        await expect.poll(async () => (await snapshot(page)).weaponPresentation.adsProgress, { timeout: 5_000 }).toBeGreaterThanOrEqual(0.9);
        await assertAimAlignment(page);
        const shotsBeforeAdsFire = (await snapshot(page)).weaponPresentation.shotsPresented;
        await page.evaluate(({ selected }) => {
          const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { equipWeapon: (weapon: string) => void; fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__;
          api.equipWeapon(selected);
          api.fireOnce();
        }, { selected: weapon });
        await expect.poll(async () => (await snapshot(page)).weaponPresentation.shotsPresented).toBe(shotsBeforeAdsFire + 1);
        state = await snapshot(page);
        expect(state.lastPrincipalShotAlignment?.weapon).toBe(weapon);
        expect(state.lastPrincipalShotAlignment?.sample).toEqual([0, 0]);
        expect(state.lastPrincipalShotAlignment?.angularError).toBeLessThanOrEqual(1e-7);
      }
    });
  }

  test('restores a deliberately lost WebGL context without reloading the match', async ({ page }) => {
    test.setTimeout(120_000);
    await ready(page, 'performance', true);
    await startSolo(page);
    const before = await snapshot(page);
    const supported = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const gl = canvas.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      (window as unknown as { __PASS25_CONTEXT_EXTENSION__?: WEBGL_lose_context }).__PASS25_CONTEXT_EXTENSION__ = extension;
      extension.loseContext();
      return true;
    });
    test.skip(!supported, 'WEBGL_lose_context is unavailable in this browser');
    await expect.poll(async () => (await snapshot(page)).render.contextLifecycle.lost).toBe(true);
    await page.evaluate(() => (window as unknown as { __PASS25_CONTEXT_EXTENSION__: WEBGL_lose_context }).__PASS25_CONTEXT_EXTENSION__.restoreContext());
    await expect.poll(async () => (await snapshot(page)).render.contextLifecycle.restorations, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => {
      const signal = (await snapshot(page)).render.atomicSignal;
      return signal.enabled && signal.targetValidated && signal.outputValidated;
    }, { timeout: 30_000 }).toBe(true);
    const restored = await snapshot(page);
    expect(restored.render.contextLifecycle).toEqual({ lost: false, losses: 1, restorations: 1 });
    expect(restored.gameStarted).toBe(true);
    expect(restored.matchPhase).toBe('active');
    expect(restored.random.seed).toBe(before.random.seed);
    expect(restored.frameCount).toBeGreaterThan(before.frameCount);
  });

  test('neutralizes input on focus loss and reacquires pointer lock after resize', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    await startSolo(page);
    await page.locator('#game').click({ position: { x: 100, y: 100 } });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('game');
    const beforeMove = await snapshot(page);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyW', key: 'w', bubbles: true,
    })));
    await expect.poll(async () => {
      const moving = await snapshot(page);
      return Math.hypot(
        moving.player.position[0] - beforeMove.player.position[0],
        moving.player.position[2] - beforeMove.player.position[2],
      );
    }, { timeout: 10_000 }).toBeGreaterThan(0.02);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      if (document.pointerLockElement) document.exitPointerLock();
    });
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBeNull();
    const blurred = await snapshot(page);
    await page.waitForTimeout(350);
    const afterBlur = await snapshot(page);
    expect(Math.hypot(afterBlur.player.position[0] - blurred.player.position[0], afterBlur.player.position[2] - blurred.player.position[2])).toBeLessThan(0.05);
    await page.setViewportSize({ width: 1_111, height: 777 });
    await assertAimAlignment(page);
    await page.locator('#resume').click();
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id ?? null)).toBe('game');
    await assertAimAlignment(page);
  });

  test('survives twenty complete match-end and rematch reset cycles', async ({ page }) => {
    test.setTimeout(420_000);
    await ready(page);
    await startSolo(page);
    for (let cycle = 0; cycle < 20; cycle += 1) {
      await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { endMatch: () => void } }).__ATOMIC_ACRES_DEBUG__.endMatch());
      await expect.poll(async () => (await snapshot(page)).matchPhase).toBe('ended');
      await page.locator('#rematch').click();
      await expect.poll(async () => (await snapshot(page)).matchPhase, { timeout: 6_000 }).toBe('active');
      const reset = await snapshot(page);
      expect(reset.scores, `cycle ${cycle + 1}`).toEqual([0, 0]);
      expect(reset.deathDrops, `cycle ${cycle + 1}`).toHaveLength(0);
      expect(reset.breakableWindows.some((pane) => pane.broken), `cycle ${cycle + 1}`).toBe(false);
    }
  });

  test('refreshes Blender static shadows at a bounded rate for moving casters', async ({ page }) => {
    await ready(page, 'blender');
    await startSolo(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(false));
    const before = await page.evaluate(() => ({
      now: performance.now(),
      state: (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Pass25State } }).__ATOMIC_ACRES_DEBUG__.snapshot(),
    }));
    expect(before.state.render.shadowMode).toBe('static');
    expect(before.state.render.shadowAutoUpdate).toBe(false);
    await page.waitForTimeout(750);
    const after = await page.evaluate(() => ({
      now: performance.now(),
      state: (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => Pass25State } }).__ATOMIC_ACRES_DEBUG__.snapshot(),
    }));
    const refreshes = after.state.render.staticShadowDynamicRefreshes - before.state.render.staticShadowDynamicRefreshes;
    expect(refreshes).toBeGreaterThanOrEqual(1);
    // Keep this a rate assertion rather than assuming waitForTimeout advances the
    // busy Windows renderer by exactly 750 ms. The production gate is 100 ms.
    const elapsedMs = after.now - before.now;
    expect(refreshes).toBeLessThanOrEqual(Math.ceil(elapsedMs / 100) + 1);
    const outputHashes = await page.evaluate(() => {
      const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: {
        setBotsFrozen: (frozen: boolean) => void;
        teleportPlayer: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
        setRenderPaused: (paused: boolean) => void;
        captureShadowProbeFrame: (horizontalOffset: number) => string;
      } }).__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.teleportPlayer(0, 1.7, 12, 0, 0.35);
      api.setRenderPaused(true);
      return [api.captureShadowProbeFrame(-1.8), api.captureShadowProbeFrame(1.8)];
    });
    expect(outputHashes[0]).not.toBe(outputHashes[1]);
  });
});
