import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * PASS 84 Lane E — gamepad support + tiered aim assist.
 *
 * A fake pad is injected through `navigator.getGamepads` (addInitScript) so the
 * whole poll → mapping → look → fire → assist → HUD-glyph chain is exercised in
 * a headless browser with no real hardware. Real-pad verification (Bluetooth,
 * several models, PC + phone) is the owner's; this spec proves the software
 * path and the hot-plug lifecycle.
 *
 * Headless installed Chrome, always muted (owner standing instruction: no
 * visible QA windows, no audio).
 */
test.use({ channel: 'chrome', launchOptions: { args: ['--mute-audio'] } });

const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const DUALSHOCK_ID = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
const MOBILE_STORAGE_KEY = 'atomic-acres-mobile-controls';

type FakeGamepadApi = {
  connect: (id?: string, mapping?: string) => void;
  disconnect: () => void;
  setAxes: (axes: number[]) => void;
  press: (index: number, value?: number) => void;
  release: (index: number) => void;
  effects: () => number;
};

declare global {
  interface Window {
    __FAKE_GAMEPAD__: FakeGamepadApi;
  }
}

function installFakeGamepad(): void {
  type FakeButton = { pressed: boolean; touched: boolean; value: number };
  type FakePad = {
    id: string;
    index: number;
    connected: boolean;
    mapping: string;
    axes: number[];
    buttons: FakeButton[];
    timestamp: number;
    vibrationActuator: { type: string; playEffect: (type: string, params: unknown) => Promise<string> };
  };
  let pad: FakePad | null = null;
  let effectCount = 0;
  const makePad = (id: string, mapping: string): FakePad => ({
    id,
    index: 0,
    connected: true,
    mapping,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: performance.now(),
    vibrationActuator: {
      type: 'dual-rumble',
      playEffect: async () => {
        effectCount += 1;
        return 'complete';
      },
    },
  });
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [pad, null, null, null],
  });
  // Inlined: this function is serialised into the page, so module constants are out of scope.
  const defaultId = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
  const api: FakeGamepadApi = {
    connect: (id = defaultId, mapping = 'standard') => {
      pad = makePad(id, mapping);
      window.dispatchEvent(new CustomEvent('gamepadconnected', { detail: { gamepad: pad } }));
    },
    disconnect: () => {
      if (pad) pad.connected = false;
      pad = null;
      window.dispatchEvent(new CustomEvent('gamepaddisconnected'));
    },
    setAxes: (axes) => {
      if (!pad) return;
      pad.axes = axes.slice();
      pad.timestamp = performance.now();
    },
    press: (index, value = 1) => {
      if (!pad) return;
      pad.buttons[index] = { pressed: value > 0.5, touched: true, value };
      pad.timestamp = performance.now();
    },
    release: (index) => {
      if (!pad) return;
      pad.buttons[index] = { pressed: false, touched: false, value: 0 };
      pad.timestamp = performance.now();
    },
    effects: () => effectCount,
  };
  window.__FAKE_GAMEPAD__ = api;
}

async function ready(page: Page, options: { mobile?: boolean } = {}): Promise<void> {
  await page.addInitScript(installFakeGamepad);
  if (options.mobile) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript((storageKey) => localStorage.setItem(storageKey, 'on'), MOBILE_STORAGE_KEY);
  }
  await page.goto('/?release=latest&map=atomic-acres&renderer=webgl2&render=performance&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass84-gamepad&previewTime=0');
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return solo?.disabled === false
      && debug?.snapshot().weaponReady === true
      && debug.snapshot().bootstrap.stage === 'ready';
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase === 'active',
    undefined,
    { timeout: 60_000 },
  );
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await page.waitForTimeout(400);
}

async function playerPose(page: Page): Promise<{ yaw: number; pitch: number; ammo: number }> {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as unknown as {
      player: { yaw: number; pitch: number; ammo: number };
    };
    return { yaw: snapshot.player.yaw, pitch: snapshot.player.pitch, ammo: snapshot.player.ammo };
  });
}

async function holdRightStick(page: Page, x: number, ms: number): Promise<number> {
  const before = (await playerPose(page)).yaw;
  await page.evaluate((value) => window.__FAKE_GAMEPAD__.setAxes([0, 0, value, 0]), x);
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
  await page.waitForTimeout(150);
  const after = (await playerPose(page)).yaw;
  return after - before;
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

test.describe('pass84 gamepad (desktop, no pointer lock)', () => {
  test('a pad that connects mid-match looks and fires without pointer lock, and drops out cleanly', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(page.locator('#menu')).toHaveClass(/hidden/u);

    // Baseline: with no pad connected the fake stick does nothing.
    const idle = await holdRightStick(page, 1, 250);
    expect(Math.abs(wrapAngle(idle))).toBeLessThan(0.01);

    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await page.waitForTimeout(250);
    const turned = await holdRightStick(page, 1, 500);
    expect(Math.abs(wrapAngle(turned)), 'right stick must turn the view without pointer lock').toBeGreaterThan(0.4);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(page.locator('#menu')).toHaveClass(/hidden/u);

    const ammoBefore = (await playerPose(page)).ammo;
    await page.evaluate(() => window.__FAKE_GAMEPAD__.press(7, 1));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.release(7));
    await page.waitForTimeout(100);
    const ammoAfter = (await playerPose(page)).ammo;
    expect(ammoAfter, 'right trigger must fire without pointer lock').toBeLessThan(ammoBefore);
    expect(await page.evaluate(() => window.__FAKE_GAMEPAD__.effects()), 'fire rumble reaches the actuator').toBeGreaterThan(0);

    await page.evaluate(() => window.__FAKE_GAMEPAD__.disconnect());
    await page.waitForTimeout(250);
    const afterDisconnect = await holdRightStick(page, 1, 250);
    expect(Math.abs(wrapAngle(afterDisconnect)), 'a disconnected pad must stop steering the view').toBeLessThan(0.01);
    await expect(page.locator('#menu')).toHaveClass(/hidden/u);

    // Reconnect works without a reload.
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await page.waitForTimeout(250);
    const reconnected = await holdRightStick(page, -1, 400);
    expect(Math.abs(wrapAngle(reconnected))).toBeGreaterThan(0.3);
  });

  test('HUD glyphs follow the pad in the player\'s hands', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    const scheme = () => page.evaluate(() => ({
      scheme: document.documentElement.dataset.inputScheme ?? null,
      faces: document.documentElement.dataset.padFaces ?? null,
      interact: document.querySelector('#support-interaction-prompt kbd')?.textContent ?? null,
      pickup: document.querySelector('#pickup-prompt kbd')?.textContent ?? null,
    }));
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0.6, 0]));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
    await expect.poll(async () => (await scheme()).scheme).toBe('gamepad');
    expect(await scheme()).toMatchObject({ faces: 'xbox', interact: 'X', pickup: 'X' });

    await page.evaluate(() => window.__FAKE_GAMEPAD__.disconnect());
    await page.evaluate((id) => window.__FAKE_GAMEPAD__.connect(id), DUALSHOCK_ID);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0.6, 0]));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
    await expect.poll(async () => (await scheme()).faces).toBe('playstation');
    expect(await scheme()).toMatchObject({ scheme: 'gamepad', interact: '□', pickup: '□' });

    // Touching the keyboard hands the prompts back to key labels.
    await page.keyboard.press('KeyW');
    await expect.poll(async () => (await scheme()).scheme).toBe('keyboard');
    expect(await scheme()).toMatchObject({ interact: 'F', pickup: 'F' });
  });

  test('aim assist slows the pad look rate near a staged target and not in open air', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await page.waitForTimeout(250);
    const staged = await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const placed = api.placeBotAhead(6);
      api.aimAtBot('head');
      return placed;
    });
    expect(staged, 'a bot must be staged ahead of the player').not.toBeNull();
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0.2, 0]));
    await page.waitForTimeout(150);
    const nearSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
    await page.waitForTimeout(150);
    expect(nearSample.assist.tier).toBe('pad');
    expect(nearSample.assist.lookRateScale, 'reticle on a hostile must slow the look rate').toBeLessThan(0.9);

    await page.evaluate(() => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.aimAtBot('head');
    });
    await page.waitForTimeout(100);
    const near = await holdRightStick(page, 0.2, 400);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0.2, 0]));
    await page.waitForTimeout(150);
    const farSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
    await page.waitForTimeout(150);
    expect(farSample.assist.lookRateScale).toBe(1);
    const far = await holdRightStick(page, 0.2, 400);

    const evidence = {
      tier: nearSample.assist.tier,
      nearLookRateScale: nearSample.assist.lookRateScale,
      nearAngleDeg: nearSample.assist.nearestAngleDeg,
      farLookRateScale: farSample.assist.lookRateScale,
      nearYawDeltaRad: wrapAngle(near),
      farYawDeltaRad: wrapAngle(far),
      ratio: Math.abs(wrapAngle(near)) / Math.max(1e-9, Math.abs(wrapAngle(far))),
      stick: 0.2,
      holdMs: 400,
    };
    mkdirSync(resolve('artifacts/pass84-gamepad'), { recursive: true });
    writeFileSync(resolve('artifacts/pass84-gamepad/assist-evidence.json'), JSON.stringify(evidence, null, 2));
    expect(Math.abs(wrapAngle(far))).toBeGreaterThan(0.02);
    expect(Math.abs(wrapAngle(near)), `near ${near.toFixed(4)} vs far ${far.toFixed(4)}`).toBeLessThan(Math.abs(wrapAngle(far)) * 0.85);
  });
});

test.describe('pass84 gamepad (mobile emulation)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a connected pad suppresses the touch overlay and disconnect restores it', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page, { mobile: true });
    await expect(page.locator('body')).toHaveClass(/mtc-live/u);
    await expect(page.locator('#mobile-touch-controls')).toBeVisible();

    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await expect(page.locator('#mobile-touch-controls')).toBeHidden({ timeout: 5_000 });
    // The pad still steers the view while the overlay is suppressed.
    const turned = await holdRightStick(page, 1, 400);
    expect(Math.abs(wrapAngle(turned))).toBeGreaterThan(0.3);

    await page.evaluate(() => window.__FAKE_GAMEPAD__.disconnect());
    await expect(page.locator('#mobile-touch-controls')).toBeVisible({ timeout: 5_000 });
  });
});
