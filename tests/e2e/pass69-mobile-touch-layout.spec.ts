import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { UI_MOBILE_REVIEW_VIEWPORTS } from '../../src/ui/surface-registry';

const MOBILE_STORAGE_KEY = 'atomic-acres-mobile-controls';
test.use({ hasTouch: true, isMobile: true });

async function ready(page: Page, width: number, height: number, arena = 'atomic-acres'): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.addInitScript((storageKey) => localStorage.setItem(storageKey, 'on'), MOBILE_STORAGE_KEY);
  await page.goto(`/?release=latest&map=${arena}&renderer=webgl2&render=performance&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass69-mobile-touch&previewTime=0`);
  await page.waitForFunction(() => {
    const solo = document.querySelector<HTMLButtonElement>('#solo');
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return solo?.disabled === false
      && debug?.snapshot().weaponReady === true
      && debug.snapshot().bootstrap.stage === 'ready';
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(
    () => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase === 'active',
    undefined,
    { timeout: 60_000 },
  );
  await expect(page.locator('body')).toHaveClass(/mtc-live/u);
  await expect(page.locator('#mobile-touch-controls')).toBeVisible();
}

type RectRecord = Readonly<{ label: string; left: number; top: number; right: number; bottom: number }>;

async function visibleControlRects(page: Page): Promise<RectRecord[]> {
  return page.evaluate(() => {
    const selectors = [
      '#mobile-touch-controls .mtc-stick',
      '#mobile-touch-controls .mtc-btn',
    ];
    return selectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)])
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.dataset.mtc ?? element.id ?? element.className,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      });
  });
}

async function visibleHudPanelRects(page: Page): Promise<RectRecord[]> {
  return page.evaluate(() => [
    '.hud-mission-console', '.hud-map-console', '.hud-operator-console',
    '.hud-weapon-console', '#support-block',
  ].flatMap((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || element.hidden || getComputedStyle(element).display === 'none') return [];
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];
    return [{
      label: selector,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    }];
  }));
}

function overlaps(a: RectRecord, b: RectRecord): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
}

function edgeGap(a: RectRecord, b: RectRecord): number {
  const horizontal = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const vertical = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return Math.hypot(horizontal, vertical);
}

function centreDistance(a: RectRecord, b: RectRecord): number {
  return Math.hypot(
    (a.left + a.right - b.left - b.right) / 2,
    (a.top + a.bottom - b.top - b.bottom) / 2,
  );
}

for (const viewport of UI_MOBILE_REVIEW_VIEWPORTS) {
  test(`keeps touch controls and critical HUD usable in ${viewport.id}`, async ({ page }, testInfo) => {
    await ready(page, viewport.width, viewport.height);
    const rects = await visibleControlRects(page);
    const viewportBounds = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
    for (const rect of rects) {
      expect(rect.left, `${rect.label} left`).toBeGreaterThanOrEqual(viewportBounds.left - 1);
      expect(rect.top, `${rect.label} top`).toBeGreaterThanOrEqual(viewportBounds.top - 1);
      expect(rect.right, `${rect.label} right`).toBeLessThanOrEqual(viewportBounds.right + 1);
      expect(rect.bottom, `${rect.label} bottom`).toBeLessThanOrEqual(viewportBounds.bottom + 1);
    }
    const collisions: string[] = [];
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) {
        if (overlaps(rects[a], rects[b])) collisions.push(`${rects[a].label}↔${rects[b].label}`);
      }
    }
    expect(collisions).toEqual([]);
    const hudRects = await visibleHudPanelRects(page);
    const hudCollisions = hudRects.flatMap((hudRect) => (
      rects.filter((controlRect) => overlaps(hudRect, controlRect))
        .map((controlRect) => `${hudRect.label}↔${controlRect.label}`)
    ));
    expect(hudCollisions).toEqual([]);
    for (const rect of rects) {
      expect(rect.right - rect.left, `${rect.label} width`).toBeGreaterThanOrEqual(44);
      expect(rect.bottom - rect.top, `${rect.label} height`).toBeGreaterThanOrEqual(44);
    }

    const aimRoi: RectRecord = {
      label: 'central aim ROI',
      left: viewport.width / 2 - 80,
      right: viewport.width / 2 + 80,
      top: viewport.height / 2 - 80,
      bottom: viewport.height / 2 + 80,
    };
    expect([...rects, ...hudRects]
      .filter((rect) => overlaps(rect, aimRoi))
      .map(({ label }) => label)).toEqual([]);

    const lookStick = rects.find(({ label }) => label === 'stick-look');
    const fire = rects.find(({ label }) => label === 'fire');
    expect(lookStick).toBeDefined();
    expect(fire).toBeDefined();
    expect(fire!.right - fire!.left, 'FIRE remains a bounded thumb target').toBeLessThanOrEqual(72);
    expect(edgeGap(lookStick!, fire!), 'FIRE stays within one thumb gap of the aim stick').toBeLessThanOrEqual(16);
    expect(centreDistance(lookStick!, fire!), 'FIRE centre remains reachable from the aim stick').toBeLessThanOrEqual(128);

    const actionOrder = await page.locator('#mobile-touch-controls .mtc-btn').evaluateAll((buttons) => (
      buttons.map((button) => (button as HTMLElement).dataset.mtc)
    ));
    expect(actionOrder).toEqual([
      'fire', 'ads', 'reload', 'switch-weapon',
      'jump', 'crouch', 'prone', 'grenade', 'melee',
      'sprint', 'interact', 'support-cycle', 'support-activate',
      'pause',
    ]);

    const criticalHud = await page.evaluate(() => Object.fromEntries([
      '.hud-mission-console', '#objective', '#network-strip', '.hud-map-console', '#minimap',
      '.hud-operator-console', '#health-block', '#combat-stats', '#equipment-block',
      '.hud-weapon-console', '#weapon-block', '#support-block', '#killfeed', '#damage-feeds',
    ].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      return [selector, element ? {
        hidden: element.hidden,
        display: getComputedStyle(element).display,
        visibility: getComputedStyle(element).visibility,
      } : null];
    })));
    const stateHiddenWhenOffline = new Set(['#network-strip']);
    for (const [selector, state] of Object.entries(criticalHud)) {
      expect(state, `${selector} exists`).not.toBeNull();
      if (state!.hidden && stateHiddenWhenOffline.has(selector)) continue;
      expect(state!.hidden, `${selector} is not state-hidden`).toBe(false);
      expect(state!.display, `${selector} is not CSS-hidden`).not.toBe('none');
      expect(state!.visibility, `${selector} is visible`).not.toBe('hidden');
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const evidenceDir = resolve(process.cwd(), 'artifacts/pass69/mobile-touch-layout');
    mkdirSync(evidenceDir, { recursive: true });
    const screenshot = resolve(evidenceDir, `${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshot, animations: 'disabled' });
    await testInfo.attach(`${viewport.id}-layout`, { path: screenshot, contentType: 'image/png' });
  });
}

test('honours asymmetric safe-area insets for every touch target', async ({ page }) => {
  await ready(page, 932, 430);
  const safeArea = { top: 18, right: 20, bottom: 22, left: 34 };
  await page.evaluate((insets) => {
    const body = document.body;
    body.style.setProperty('--mtc-safe-top', `${insets.top}px`);
    body.style.setProperty('--mtc-safe-right', `${insets.right}px`);
    body.style.setProperty('--mtc-safe-bottom', `${insets.bottom}px`);
    body.style.setProperty('--mtc-safe-left', `${insets.left}px`);
  }, safeArea);
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
  for (const rect of await visibleControlRects(page)) {
    expect(rect.left, `${rect.label} clears left safe area`).toBeGreaterThanOrEqual(safeArea.left - 1);
    expect(rect.top, `${rect.label} clears top safe area`).toBeGreaterThanOrEqual(safeArea.top - 1);
    expect(rect.right, `${rect.label} clears right safe area`).toBeLessThanOrEqual(932 - safeArea.right + 1);
    expect(rect.bottom, `${rect.label} clears bottom safe area`).toBeLessThanOrEqual(430 - safeArea.bottom + 1);
  }
});

test('blocks selection and callout events on live gameplay while preserving editable chat selection', async ({ page }) => {
  await ready(page, 390, 844);
  const gameplayEvents = await page.evaluate(() => {
    const game = document.querySelector<HTMLElement>('#game');
    const objective = document.querySelector<HTMLElement>('#objective');
    if (!game || !objective) throw new Error('Missing gameplay selection targets');
    const dispatch = (target: HTMLElement, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const dispatched = target.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, dispatched };
    };
    return {
      canvasSelect: dispatch(game, 'selectstart'),
      canvasMenu: dispatch(game, 'contextmenu'),
      hudSelect: dispatch(objective, 'selectstart'),
      gameUserSelect: getComputedStyle(game).userSelect,
    };
  });
  expect(gameplayEvents.canvasSelect).toEqual({ defaultPrevented: true, dispatched: false });
  expect(gameplayEvents.canvasMenu).toEqual({ defaultPrevented: true, dispatched: false });
  expect(gameplayEvents.hudSelect).toEqual({ defaultPrevented: true, dispatched: false });
  expect(gameplayEvents.gameUserSelect).toBe('none');

  const editableEvents = await page.evaluate(() => {
    const chat = document.querySelector<HTMLElement>('#text-chat');
    const input = document.querySelector<HTMLInputElement>('#text-chat-input');
    if (!chat || !input) throw new Error('Missing chat editable target');
    chat.hidden = false;
    chat.dataset.open = 'true';
    const dispatch = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const dispatched = input.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, dispatched };
    };
    return {
      select: dispatch('selectstart'),
      menu: dispatch('contextmenu'),
      userSelect: getComputedStyle(input).userSelect,
      touchAction: getComputedStyle(input).touchAction,
    };
  });
  expect(editableEvents.select).toEqual({ defaultPrevented: false, dispatched: true });
  expect(editableEvents.menu).toEqual({ defaultPrevented: false, dispatched: true });
  expect(editableEvents.userSelect).toBe('text');
  expect(editableEvents.touchAction).toBe('manipulation');
});

test('routes switch, prone, sprint, and field support through live semantic paths', async ({ page }) => {
  await ready(page, 844, 390);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine'));
  const weaponBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon);
  await page.locator('[data-mtc="switch-weapon"]').click();
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon))
    .not.toBe(weaponBefore);

  await page.locator('[data-mtc="prone"]').click();
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.prone)).toBe(true);

  await page.keyboard.down('KeyW');
  const sprint = page.locator('[data-mtc="sprint"]');
  const sprintBounds = await sprint.boundingBox();
  if (!sprintBounds) throw new Error('SPRINT control has no held-input target');
  await page.mouse.move(sprintBounds.x + sprintBounds.width / 2, sprintBounds.y + sprintBounds.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.sprinting)).toBe(true);
  } finally {
    await page.mouse.up();
    await page.keyboard.up('KeyW');
  }
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.sprinting)).toBe(false);

  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  const supportBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.gamepadSelection);
  await page.locator('[data-mtc="support-cycle"]').click();
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.gamepadSelection
  ))).not.toBe(supportBefore);
  const activationBefore = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport;
    return {
      id: snapshot.gamepadSelection,
      charges: snapshot.availableCharges[snapshot.gamepadSelection],
    };
  });
  await page.locator('[data-mtc="support-activate"]').click();
  await expect.poll(async () => page.evaluate((before) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport;
    return snapshot.availableCharges[before.id] < before.charges
      || snapshot.targetingMode !== null
      || snapshot.tacticalMapOpen === true;
  }, activationBefore)).toBe(true);
});

test('acquires each stick through its centre knob and emits gamepad-shaped axes', async ({ page }) => {
  await ready(page, 844, 390);
  const move = page.locator('[data-mtc="stick-move"]');
  const moveKnob = move.locator('.mtc-stick-knob');
  await expect(moveKnob).not.toHaveAttribute('data-mtc', /.+/u);
  const moveBounds = await move.boundingBox();
  if (!moveBounds) throw new Error('Move stick has no touch target');
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as number[]);
  await page.mouse.move(moveBounds.x + moveBounds.width / 2, moveBounds.y + moveBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBounds.x + moveBounds.width * 0.78, moveBounds.y + moveBounds.height / 2);
  await expect.poll(async () => page.evaluate((start) => {
    const current = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position as number[];
    return Math.hypot(current[0] - start[0], current[2] - start[2]);
  }, before)).toBeGreaterThan(0.2);
  await page.mouse.up();

  const look = page.locator('[data-mtc="stick-look"]');
  const lookBounds = await look.boundingBox();
  if (!lookBounds) throw new Error('Look stick has no touch target');
  const yawBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraYaw as number);
  await page.mouse.move(lookBounds.x + lookBounds.width / 2, lookBounds.y + lookBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(lookBounds.x + lookBounds.width * 0.78, lookBounds.y + lookBounds.height / 2);
  await expect.poll(async () => page.evaluate((start) => (
    Math.abs((window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraYaw as number) - start)
  ), yawBefore)).toBeGreaterThan(0.02);
  await page.mouse.up();
});

test('survives bidirectional mid-match rotation and clears held touch ownership', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await ready(page, 390, 844);

  const move = page.locator('[data-mtc="stick-move"]');
  const moveKnob = move.locator('.mtc-stick-knob');
  const moveBounds = await move.boundingBox();
  if (!moveBounds) throw new Error('MOVE control has no touch target');
  const portraitFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.mouse.move(moveBounds.x + moveBounds.width / 2, moveBounds.y + moveBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBounds.x + moveBounds.width * 0.78, moveBounds.y + moveBounds.height / 2);
  await expect.poll(async () => moveKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe('translate(-50%, -50%)');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase)).toBe('active');
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount)).toBeGreaterThan(portraitFrame);
  await expect.poll(async () => moveKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe('translate(-50%, -50%)');
  await page.mouse.up();

  const look = page.locator('[data-mtc="stick-look"]');
  const lookKnob = look.locator('.mtc-stick-knob');
  const lookBounds = await look.boundingBox();
  if (!lookBounds) throw new Error('AIM control has no touch target');
  const landscapeFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  await page.mouse.move(lookBounds.x + lookBounds.width / 2, lookBounds.y + lookBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(lookBounds.x + lookBounds.width * 0.78, lookBounds.y + lookBounds.height / 2);
  await expect.poll(async () => lookKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe('translate(-50%, -50%)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase)).toBe('active');
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount)).toBeGreaterThan(landscapeFrame);
  await expect.poll(async () => lookKnob.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe('translate(-50%, -50%)');
  await page.mouse.up();

  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no touch target');
  await page.mouse.move(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await page.mouse.down();
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => page.evaluate(() => ({
    phase: window.__ATOMIC_ACRES_DEBUG__.admissionState().matchPhase,
    triggerHeld: window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld,
    frameCount: window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount,
  }))).toMatchObject({ phase: 'active', triggerHeld: false, frameCount: expect.any(Number) });
  await expect(page.locator('#mobile-touch-controls')).toBeVisible();
  await expect(page.locator('body')).toHaveClass(/mtc-live/u);
  await page.mouse.up();
  expect(pageErrors).toEqual([]);
});

test('fires a semi-automatic weapon from touch without pointer lock', async ({ page }) => {
  await ready(page, 390, 844);
  const before = await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.equipWeapon('scattergun');
    return {
      ammo: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo,
      pointerLocked: document.pointerLockElement !== null,
    };
  });
  expect(before.pointerLocked).toBe(false);
  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no touch target');
  await page.touchscreen.tap(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo)).toBe(before.ammo - 1);
});

test('sustains and releases automatic fire from the mobile overlay without pointer lock', async ({ page }) => {
  await ready(page, 844, 390);
  const before = await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine');
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      ammo: snapshot.player.ammo,
      pointerLocked: document.pointerLockElement !== null,
    };
  });
  expect(before.pointerLocked).toBe(false);
  const fire = page.locator('[data-mtc="fire"]');
  const fireBounds = await fire.boundingBox();
  if (!fireBounds) throw new Error('FIRE control has no held-input target');
  await page.mouse.move(fireBounds.x + fireBounds.width / 2, fireBounds.y + fireBounds.height / 2);
  await page.mouse.down();
  try {
    await expect.poll(async () => page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        ammo: snapshot.player.ammo,
        triggerHeld: snapshot.textChat.triggerHeld,
        pointerLocked: document.pointerLockElement !== null,
      };
    }), { timeout: 5_000 }).toMatchObject({
      ammo: expect.any(Number),
      triggerHeld: true,
      pointerLocked: false,
    });
    await expect.poll(async () => page.evaluate(() => (
      window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo
    )), { timeout: 5_000 }).toBeLessThanOrEqual(before.ammo - 3);
  } finally {
    await page.mouse.up();
  }
  const releasedAmmo = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => ({
    ammo: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.ammo,
    triggerHeld: window.__ATOMIC_ACRES_DEBUG__.snapshot().textChat.triggerHeld,
  }))).toEqual({ ammo: releasedAmmo, triggerHeld: false });
});

test('routes mobile USE and PAUSE through the live interaction and menu lifecycles', async ({ page }) => {
  await ready(page, 390, 844, 'gun-range');
  const staged = await page.evaluate(() => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const station = debug.snapshot().rangePractice.stations.find((candidate: any) => candidate.visible);
    if (!station) throw new Error('Gun range has no visible mobile interaction station');
    debug.teleportPlayer(station.position[0], station.position[1] + 1.7, station.position[2]);
    return {
      targetId: `station:${station.weapon}`,
    };
  });
  await expect.poll(async () => page.evaluate((targetId) => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.candidates
      .some((candidate: any) => candidate.targetId === targetId)
  ), staged.targetId)).toBe(true);

  const use = page.locator('[data-mtc="interact"]');
  await expect(use).toBeVisible();
  const useBounds = await use.boundingBox();
  if (!useBounds) throw new Error('USE control has no touch target');
  await page.touchscreen.tap(useBounds.x + useBounds.width / 2, useBounds.y + useBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.lastCommit?.candidate.targetId ?? null
  ))).toBe(staged.targetId);

  const pause = page.locator('[data-mtc="pause"]');
  await expect(pause).toBeVisible();
  const pauseBounds = await pause.boundingBox();
  if (!pauseBounds) throw new Error('PAUSE control has no touch target');
  await page.touchscreen.tap(pauseBounds.x + pauseBounds.width / 2, pauseBounds.y + pauseBounds.height / 2);
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().menuLifecycle.surface
  ))).toBe('paused-match');
  await expect(page.locator('#mobile-touch-controls')).toBeHidden();
});
