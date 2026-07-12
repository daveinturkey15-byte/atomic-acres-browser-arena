import { expect, test, type Page } from '@playwright/test';

type DebugState = {
  gameStarted: boolean;
  gameMode: string;
  matchPhase: 'warmup' | 'active' | 'ended';
  player: {
    hp: number;
    kills: number;
    deaths: number;
    weapon: string;
    ammo: number;
    reserve: number;
    stance: 'stand' | 'crouch' | 'prone';
    crouched: boolean;
    prone: boolean;
    sprinting: boolean;
    grenades: number;
    position: number[];
  };
  bots: Array<{ id: string; hp: number; alive: boolean; kills: number; position: number[] }>;
  remotes: number;
  remotePlayers: Array<{ id: string; stance: 'stand' | 'crouch' | 'prone'; position: number[] }>;
  grenades: number;
  originalArtLoaded: boolean;
  weaponReady: boolean;
  menuVisible: boolean;
  render: { calls: number; triangles: number; points: number; lines: number; sceneObjects: number; reducedMode: boolean };
};

async function debug(page: Page): Promise<DebugState> {
  return page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot());
}

async function pageReady(page: Page): Promise<void> {
  await page.goto('/?render=compat');
  await page.waitForFunction(() => {
    const status = document.querySelector<HTMLElement>('#network-status');
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debugApi = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__;
    const snapshot = debugApi?.snapshot();
    return status?.dataset.kind === 'ok' && solo?.disabled === false && snapshot?.weaponReady === true && snapshot.originalArtLoaded === true;
  }, undefined, { timeout: 30_000 });
}

async function startSolo(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { startSolo: () => void } }).__ATOMIC_ACRES_DEBUG__.startSolo());
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => DebugState } }).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active',
    undefined,
    { timeout: 15_000 },
  );
}

test.describe('boot and authored presentation', () => {
  test('boots without runtime errors and loads original art/weapons', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReady(page);
    const state = await debug(page);
    expect(state.originalArtLoaded).toBe(true);
    expect(state.weaponReady).toBe(true);
    expect(state.menuVisible).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: 'test-results/menu-structured-pass.png', fullPage: true });
  });

  test('menu exposes controls and accessibility settings', async ({ page }) => {
    await pageReady(page);
    await expect(page.locator('#solo')).toHaveText('BOT SKIRMISH');
    await expect(page.locator('#sensitivity')).toBeVisible();
    await expect(page.locator('#field-of-view')).toBeVisible();
    await expect(page.locator('.controls')).toContainText('crouch');
    await expect(page.locator('.controls')).toContainText('prone');
    await expect(page.locator('.controls')).toContainText('melee');
    await expect(page.locator('.controls')).toContainText('frag');
  });
});

test.describe('solo mechanics', () => {
  test.beforeEach(async ({ page }) => {
    await pageReady(page);
    await startSolo(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  });

  test('spawns one bounded close-range combat bot and it navigates', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setBotsFrozen: (frozen: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setBotsFrozen(false));
    const before = await debug(page);
    expect(before.bots).toHaveLength(1);
    expect(before.bots.every((bot) => bot.alive)).toBe(true);
    await page.waitForTimeout(1_200);
    const after = await debug(page);
    const moved = after.bots.some((bot, index) => {
      const previous = before.bots[index].position;
      return Math.hypot(bot.position[0] - previous[0], bot.position[2] - previous[2]) > 0.05;
    });
    expect(moved).toBe(true);
    expect(after.bots.every((bot) => bot.position[0] >= -40.56 && bot.position[0] <= 40.56
      && bot.position[2] >= -50.56 && bot.position[2] <= 50.56)).toBe(true);
  });

  test('walk, sprint, crouch and prone alter the real player stance', async ({ page }) => {
    const before = await debug(page);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(650);
    await page.keyboard.up('KeyW');
    const walked = await debug(page);
    expect(Math.hypot(walked.player.position[0] - before.player.position[0], walked.player.position[2] - before.player.position[2])).toBeGreaterThan(0.4);

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(160);
    expect((await debug(page)).player.sprinting).toBe(true);
    await page.waitForTimeout(490);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyC');
    await page.waitForTimeout(120);
    const crouched = await debug(page);
    expect(crouched.player.crouched).toBe(true);
    await page.keyboard.up('KeyC');

    await page.keyboard.press('KeyZ');
    await page.waitForTimeout(180);
    const prone = await debug(page);
    expect(prone.player.stance).toBe('prone');
    expect(prone.player.prone).toBe(true);
    expect(prone.player.position[1]).toBeLessThan(crouched.player.position[1] - 0.45);

    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(180);
    const recovered = await debug(page);
    expect(recovered.player.stance).toBe('stand');
    expect(recovered.player.sprinting).toBe(true);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
  });

  test('fires, switches weapon and completes a staged reload', async ({ page }) => {
    const before = await debug(page);
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(120);
    const fired = await debug(page);
    expect(fired.player.ammo).toBeLessThan(before.player.ammo);

    await page.keyboard.press('Digit2');
    await page.waitForTimeout(450);
    expect((await debug(page)).player.weapon).toBe('smg');

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { fireOnce: () => void } }).__ATOMIC_ACRES_DEBUG__.fireOnce());
    await page.waitForTimeout(120);
    const beforeReload = await debug(page);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(1_750);
    const afterReload = await debug(page);
    expect(afterReload.player.ammo).toBeGreaterThan(beforeReload.player.ammo);
    expect(afterReload.player.reserve).toBeLessThan(beforeReload.player.reserve);
  });

  test('throws one frag, consumes inventory and resolves the fuse', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { throwGrenade: () => void } }).__ATOMIC_ACRES_DEBUG__.throwGrenade());
    await page.waitForTimeout(100);
    const thrown = await debug(page);
    expect(thrown.player.grenades).toBe(0);
    expect(thrown.grenades).toBe(1);
    await page.waitForTimeout(2_500);
    expect((await debug(page)).grenades).toBe(0);
  });

  test('HUD reports match, stance, equipment and bots in roster', async ({ page }) => {
    await expect(page.locator('#connection-pill')).toHaveText('BOT SKIRMISH');
    await expect(page.locator('#objective')).toContainText('FIRST TO 25');
    await expect(page.locator('#grenades')).toHaveText('FRAG ×1');
    await expect(page.locator('#minimap')).toBeVisible();
    await page.keyboard.down('Tab');
    await expect(page.locator('#roster-list > div')).toHaveCount(2);
    await page.keyboard.up('Tab');
    await page.screenshot({ path: 'test-results/gameplay-structured-pass.png', fullPage: true });
  });

  test('shows directional damage, ADS telemetry and delayed health recovery', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForTimeout(150);
    await expect(page.locator('#crosshair')).toHaveClass(/ads/);
    await expect(page.locator('#crosshair i').first()).toHaveCSS('opacity', '0');
    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { setAds: (held: boolean) => void } }).__ATOMIC_ACRES_DEBUG__.setAds(false));

    await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { damage: (amount: number) => void } }).__ATOMIC_ACRES_DEBUG__.damage(40));
    const damaged = await debug(page);
    expect(damaged.player.hp).toBeLessThanOrEqual(60);
    await expect(page.locator('#damage-direction')).toHaveClass(/pulse/);
    await page.waitForTimeout(5_700);
    expect((await debug(page)).player.hp).toBeGreaterThan(damaged.player.hp);
  });
});

test.describe('performance and stability', () => {
  test('maintains interactive frame rate with bots active', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await pageReady(page);
    await startSolo(page);
    const fps = await page.evaluate(() => new Promise<number>((resolve) => {
      let frames = 0;
      const started = performance.now();
      const sample = () => {
        frames += 1;
        const elapsed = performance.now() - started;
        if (elapsed >= 2_500) resolve((frames * 1_000) / elapsed);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    const state = await debug(page);
    expect(fps).toBeGreaterThanOrEqual(40);
    expect(state.render.calls).toBeLessThanOrEqual(180);
    expect(state.render.triangles).toBeLessThanOrEqual(350_000);
    expect(errors).toEqual([]);
  });
});
