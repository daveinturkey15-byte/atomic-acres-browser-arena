import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { AIM_ASSIST_PROFILES, smoothstep, type AimAssistTier } from '../../src/input/gamepad/aim-assist';

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

/** Briefly moves the right stick so the runtime promotes the pad to the active scheme. */
async function nudgeStick(page: Page): Promise<void> {
  await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0.6, 0]));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__FAKE_GAMEPAD__.setAxes([0, 0, 0, 0]));
  await page.waitForTimeout(150);
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

/**
 * The documented slowdown curve, read from the shipped profile table rather
 * than restated here, so the gate tracks the source of truth:
 *   lookRateScale = min + (1 - min) * smoothstep(inner, outer, angleDeg)
 */
function expectedLookRateScale(tier: AimAssistTier, angleDeg: number): number {
  const profile = AIM_ASSIST_PROFILES[tier];
  return profile.minLookScale + (1 - profile.minLookScale) * smoothstep(profile.slowdownInnerDeg, profile.slowdownOuterDeg, angleDeg);
}

/**
 * `aimAtAimAssistPoint(yawOffsetDeg)` points the view exactly `yawOffsetDeg`
 * away from the assist's own aim point (body centre + AIM_ASSIST_POINT_LIFT_M),
 * so the staged angle is a CHOSEN constant instead of a by-product of distance,
 * hit-proxy geometry and stance. The previous staging (`aimAtBot('body')` at the
 * 9 m placement clamp) left the touch case at 1.894 deg against a 2.0 deg snap
 * cone - 5% headroom on its own precondition. These angles carry real margin:
 * 2.5 deg sits mid-zone for the pad (1.6-5.5 deg) and 1.0 deg is half the touch
 * snap cone. The measured angle is the offset scaled by cos(pitch) - the yaw
 * component of the angular metric - which at these distances is within 0.2% of 1.
 */
const STAGED_DISTANCE_M = 6;
const STAGED_YAW_OFFSET_DEG = 2.5;
const TOUCH_STAGED_DISTANCE_M = 9;
const TOUCH_STAGED_YAW_OFFSET_DEG = 1;

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
    // The pad must be the input IN USE, not merely connected, before it earns
    // the pad tier (see the mixed-input regression test below).
    await nudgeStick(page);
    const staged = await page.evaluate(({ distance, offset }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const placed = api.placeBotAhead(distance);
      api.aimAtAimAssistPoint(offset);
      return placed;
    }, { distance: STAGED_DISTANCE_M, offset: STAGED_YAW_OFFSET_DEG });
    expect(staged, 'a bot must be staged ahead of the player').not.toBeNull();
    // Sample with the stick at rest: the assist is evaluated every frame the pad
    // is driving, so holding the stick first only smears the staged angle by
    // however far the view had already turned.
    await page.waitForTimeout(200);
    const nearSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(nearSample.scheme, 'the pad must own the scheme to earn the pad tier').toBe('gamepad');
    expect(nearSample.tier).toBe('pad');
    expect(nearSample.assist.tier).toBe('pad');
    const nearAngle = nearSample.assist.nearestAngleDeg;
    // Staging precondition: the view was placed an exact number of degrees off
    // the assist point, so the angle IS that offset (times cos(pitch)).
    expect(nearAngle, 'staging must land on the chosen offset').toBeCloseTo(STAGED_YAW_OFFSET_DEG, 1);
    expect(nearAngle!, 'mid-zone, with margin on both edges')
      .toBeGreaterThan(AIM_ASSIST_PROFILES.pad.slowdownInnerDeg);
    expect(nearAngle!).toBeLessThan(AIM_ASSIST_PROFILES.pad.slowdownOuterDeg);
    // The gate itself: the live look-rate scale is exactly the documented curve
    // evaluated at the angle the runtime measured — no tolerance band, no
    // dependence on how far the staged reticle happened to land.
    const expectedScale = expectedLookRateScale('pad', nearAngle!);
    expect(nearSample.assist.lookRateScale, `pad curve at ${nearAngle!.toFixed(4)}°`).toBeCloseTo(expectedScale, 6);
    expect(expectedScale, 'the staged angle must produce a real slowdown').toBeLessThan(0.8);
    expect(nearSample.assist.nearestTargetId).toBe(staged!.bot.id);

    await page.evaluate((offset) => window.__ATOMIC_ACRES_DEBUG__.aimAtAimAssistPoint(offset), STAGED_YAW_OFFSET_DEG);
    await page.waitForTimeout(100);
    // 250 ms at stick 0.2 sweeps roughly 2.9 deg, so the whole near sweep stays
    // inside the pad zone instead of leaving it half way and diluting the
    // measurement with unassisted travel. That is what buys the ratio its
    // headroom under the (unchanged) 0.85 bound.
    const near = await holdRightStick(page, 0.2, 250);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    await page.waitForTimeout(200);
    const farSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(farSample.assist.lookRateScale, 'open air is unassisted').toBe(1);
    expect(farSample.assist.nearestAngleDeg, 'no target means no nearest angle').toBeNull();
    const far = await holdRightStick(page, 0.2, 250);

    const ratio = Math.abs(wrapAngle(near)) / Math.max(1e-9, Math.abs(wrapAngle(far)));
    const evidence = {
      tier: nearSample.assist.tier,
      nearLookRateScale: nearSample.assist.lookRateScale,
      nearAngleDeg: nearSample.assist.nearestAngleDeg,
      expectedLookRateScale: expectedScale,
      stagedYawOffsetDeg: STAGED_YAW_OFFSET_DEG,
      farLookRateScale: farSample.assist.lookRateScale,
      nearYawDeltaRad: wrapAngle(near),
      farYawDeltaRad: wrapAngle(far),
      ratio,
      stick: 0.2,
      holdMs: 250,
    };
    mkdirSync(resolve('artifacts/pass84-gamepad'), { recursive: true });
    writeFileSync(resolve('artifacts/pass84-gamepad/assist-evidence.json'), JSON.stringify(evidence, null, 2));
    // The yaw-delta comparison is the wiring proof: the same stick input must
    // turn the view less while a hostile is under the reticle. It is a path
    // integral over a sweep that leaves the zone, so it is bounded on both
    // sides rather than pinned — the exact-curve assertion above is the gate.
    expect(Math.abs(wrapAngle(far))).toBeGreaterThan(0.02);
    expect(ratio, `near ${near.toFixed(4)} vs far ${far.toFixed(4)}`).toBeLessThan(0.85);
    // "The assist never slows more than its own curve floor" used to be asserted
    // on this ratio. That was the wrong quantity: the sweep converges on the
    // target, so the near integral saturates and the ratio moved between 0.41
    // and 0.82 across runs purely with the hold window. The same invariant is
    // asserted here on the exact value it is actually about, plus the property
    // the bound was really guarding - the assist may slow the view, never freeze it.
    expect(nearSample.assist.lookRateScale, 'the curve floor is a hard lower bound')
      .toBeGreaterThanOrEqual(AIM_ASSIST_PROFILES.pad.minLookScale);
    expect(nearSample.assist.lookRateScale).toBeLessThanOrEqual(1);
    expect(Math.abs(wrapAngle(near)), 'a slowed view is still a moving view').toBeGreaterThan(0.005);
  });

  /**
   * PASS 84 skeptic finding 2026-09-02 (MAJOR). pollGamepad() applied the pad
   * assist whenever a pad was CONNECTED, so a keyboard/mouse player with an idle
   * paired Bluetooth pad silently received pad slowdown and strafe magnetism
   * while every read-out said MOUSE. Measured then: 0.000000 rad of yaw drift on
   * a keyboard strafe with no pad, -0.012589 rad with an untouched pad connected
   * (lookRateScale 0.657 instead of 1). DoD 9 says MOUSE gets none.
   */
  test('a connected but untouched pad gives a keyboard/mouse player no assist at all', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page);
    const staged = await page.evaluate(({ distance, offset }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const placed = api.placeBotAhead(distance);
      api.aimAtAimAssistPoint(offset);
      return placed;
    }, { distance: STAGED_DISTANCE_M, offset: STAGED_YAW_OFFSET_DEG });
    expect(staged, 'a bot must be staged ahead of the player').not.toBeNull();

    // A keyboard strafe with no pad in the room: the reference drift.
    const strafeYawDelta = async (): Promise<number> => {
      await page.evaluate((offset) => window.__ATOMIC_ACRES_DEBUG__.aimAtAimAssistPoint(offset), STAGED_YAW_OFFSET_DEG);
      await page.waitForTimeout(120);
      const before = (await playerPose(page)).yaw;
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(220);
      await page.keyboard.up('KeyD');
      await page.waitForTimeout(80);
      return wrapAngle((await playerPose(page)).yaw - before);
    };
    const withoutPad = await strafeYawDelta();
    expect(Math.abs(withoutPad), 'a keyboard strafe must not rotate the view at all').toBeLessThan(1e-6);

    // Same strafe, pad connected and NEVER touched. The pad must change nothing.
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await page.waitForTimeout(300);
    const idleSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(idleSample.connected, 'the pad really is connected').toBe(true);
    expect(idleSample.scheme, 'an untouched pad never takes the scheme').toBe('keyboard');
    expect(idleSample.tier, 'so the player is a MOUSE player').toBe('mouse');
    expect(idleSample.assist.lookRateScale, 'MOUSE gets no slowdown').toBe(1);
    expect(idleSample.assist.frictionYawRadPerSec, 'MOUSE gets no strafe magnetism').toBe(0);
    expect(idleSample.assist.nearestAngleDeg, 'and the assist is not even evaluating targets').toBeNull();
    const withIdlePad = await strafeYawDelta();
    expect(Math.abs(withIdlePad), 'an idle pad must not drag a keyboard strafe').toBeLessThan(1e-6);

    // And the moment the player actually uses the pad, the tier arrives.
    await nudgeStick(page);
    // Re-staged from where the strafes left the player, so the aim assist's own
    // line-of-sight test is looking down the same cleared ray placeBotAhead probed.
    await page.evaluate(({ distance, offset }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.placeBotAhead(distance);
      api.aimAtAimAssistPoint(offset);
    }, { distance: STAGED_DISTANCE_M, offset: STAGED_YAW_OFFSET_DEG });
    await page.waitForTimeout(200);
    const usedSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(usedSample.scheme).toBe('gamepad');
    expect(usedSample.tier).toBe('pad');
    expect(usedSample.assist.lookRateScale, 'the pad player does get the pad curve')
      .toBeCloseTo(expectedLookRateScale('pad', usedSample.assist.nearestAngleDeg!), 6);
    expect(usedSample.assist.lookRateScale).toBeLessThan(1);
  });
});

test.describe('pass84 gamepad options panel (lobby, no match)', () => {
  const BINDINGS_KEY = 'atomic-acres-gamepad-bindings.v1';

  test('the Options gamepad section rebinds a button from the pad itself and resets', async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(installFakeGamepad);
    await page.goto('/?release=latest&map=atomic-acres&renderer=webgl2&render=performance&externalServices=off&seed=pass84-gamepad-options');
    await page.waitForFunction(() => {
      const solo = document.querySelector<HTMLButtonElement>('#solo');
      return solo?.disabled === false && window.__ATOMIC_ACRES_DEBUG__?.snapshot().bootstrap.stage === 'ready';
    }, undefined, { timeout: 60_000 });

    await page.locator('#menu-tab-options').click();
    const section = page.locator('#gamepad-settings');
    await expect(section).toBeVisible();
    await expect(page.locator('#gamepad-status')).toHaveText(/NO PAD DETECTED/u);

    // No gameplay poll runs in the lobby: the panel's own presence timer (which
    // only ticks while the section is on screen) has to notice the pad.
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await expect(page.locator('#gamepad-status')).toHaveText(/CONNECTED/u, { timeout: 5_000 });
    const rows = page.locator('#gamepad-binding-rows .key-binding-row');
    await expect(rows).toHaveCount(17);
    const grenadeRow = page.locator('#gamepad-binding-rows [data-pad-action="grenade"]');
    await expect(grenadeRow.locator('kbd')).toHaveText('LB');
    await expect(page.locator('#gamepad-bindings-status')).toHaveText('DEFAULT LAYOUT');

    await grenadeRow.locator('button[data-pad-rebind="grenade"]').click();
    await expect(grenadeRow.locator('kbd')).toHaveText('PRESS A PAD BUTTON…');
    await page.evaluate(() => window.__FAKE_GAMEPAD__.press(16, 1));
    await expect(grenadeRow.locator('kbd')).toHaveAttribute('data-button', '16', { timeout: 5_000 });
    await expect(page.locator('#gamepad-bindings-status')).toHaveText('CUSTOM LAYOUT');
    expect(await page.evaluate((key) => localStorage.getItem(key), BINDINGS_KEY)).toContain('"grenade":16');

    await page.evaluate(() => window.__FAKE_GAMEPAD__.release(16));
    await page.locator('#gamepad-bindings-reset').click();
    await expect(grenadeRow.locator('kbd')).toHaveText('LB');
    await expect(page.locator('#gamepad-bindings-status')).toHaveText('DEFAULT LAYOUT');
    expect(await page.evaluate((key) => localStorage.getItem(key), BINDINGS_KEY)).toBeNull();

    // Every one of the six per-stick curve numbers has a control (DoD 3).
    for (const id of [
      'gamepad-move-deadzone', 'gamepad-move-outer', 'gamepad-move-curve',
      'gamepad-look-deadzone', 'gamepad-look-outer', 'gamepad-look-curve',
    ]) {
      await expect(page.locator(`#${id}`), id).toHaveAttribute('type', 'range');
    }
    await page.locator('#gamepad-move-curve').fill('2.5');
    await expect.poll(async () => page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? '{}').moveCurve?.exponent,
      'atomic-acres-gamepad-settings.v1',
    )).toBe(2.5);
  });
});

test.describe('pass84 gamepad (mobile emulation)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a connected pad suppresses the touch overlay and disconnect restores it', async ({ page }) => {
    test.setTimeout(180_000);
    await ready(page, { mobile: true });
    await expect(page.locator('body')).toHaveClass(/mtc-live/u);
    await expect(page.locator('#mobile-touch-controls')).toBeVisible();

    // TOUCH is the strongest tier and the only one with a trigger micro-snap.
    // Staged at the placement clamp (9 m) the 0.3 m aim-point lift subtends
    // 1.9°, inside the 2.0° snap cone, so both halves are deterministic.
    const stagedTouch = await page.evaluate(({ distance, offset }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const placed = api.placeBotAhead(distance);
      api.aimAtAimAssistPoint(offset);
      return placed;
    }, { distance: TOUCH_STAGED_DISTANCE_M, offset: TOUCH_STAGED_YAW_OFFSET_DEG });
    expect(stagedTouch, 'a bot must be staged ahead of the player').not.toBeNull();
    await page.waitForTimeout(250);
    const touchSample = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(touchSample.tier, 'the touch overlay owns the strongest tier').toBe('touch');
    const touchAngle = touchSample.touchAssist.nearestAngleDeg;
    expect(touchAngle).not.toBeNull();
    expect(touchSample.touchAssist.tier).toBe('touch');
    expect(touchSample.touchAssist.lookRateScale, `touch curve at ${touchAngle!.toFixed(4)}°`)
      .toBeCloseTo(expectedLookRateScale('touch', touchAngle!), 6);
    // Fairness ordering at one instant: the touch tier slows, the pad tier
    // (no pad connected) does not.
    expect(touchSample.touchAssist.lookRateScale).toBeLessThan(expectedLookRateScale('pad', touchAngle!));
    expect(touchSample.assist.lookRateScale).toBe(1);

    // Precondition with real margin: the view was staged an exact 1.0 deg off the
    // assist point, which is HALF the 2.0 deg snap cone. The old staging relied on
    // the 0.3 m lift at the 9 m placement clamp landing at 1.894 deg - 5% inside.
    expect(touchAngle!, 'staging must land on the chosen offset').toBeCloseTo(TOUCH_STAGED_YAW_OFFSET_DEG, 1);
    expect(TOUCH_STAGED_YAW_OFFSET_DEG, 'and that offset must be well inside the snap cone')
      .toBeLessThan(AIM_ASSIST_PROFILES.touch.snapConeDeg / 1.5);
    expect(touchAngle!, 'staging must land inside the touch snap cone').toBeLessThan(AIM_ASSIST_PROFILES.touch.snapConeDeg);
    const ammoBeforeTap = (await playerPose(page)).ammo;
    await page.locator('#mobile-touch-controls .mtc-fire').tap();
    await page.waitForTimeout(200);
    const snapped = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleGamepad());
    expect(snapped.touchSnapDeg, 'a tap inside the cone nudges the view toward the target')
      .toBeCloseTo(AIM_ASSIST_PROFILES.touch.snapMaxDeg, 6);
    expect(snapped.touchAssist.nearestAngleDeg!, 'the snap closes the gap by at most snapMaxDeg')
      .toBeLessThan(touchAngle!);
    expect((await playerPose(page)).ammo, 'the tap still fires the weapon').toBeLessThan(ammoBeforeTap);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots());
    await page.evaluate(() => window.__FAKE_GAMEPAD__.connect());
    await expect(page.locator('#mobile-touch-controls')).toBeHidden({ timeout: 5_000 });
    // The pad still steers the view while the overlay is suppressed.
    const turned = await holdRightStick(page, 1, 400);
    expect(Math.abs(wrapAngle(turned))).toBeGreaterThan(0.3);

    await page.evaluate(() => window.__FAKE_GAMEPAD__.disconnect());
    await expect(page.locator('#mobile-touch-controls')).toBeVisible({ timeout: 5_000 });
  });
});
