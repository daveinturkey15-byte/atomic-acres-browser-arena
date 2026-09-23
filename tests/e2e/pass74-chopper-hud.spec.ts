import { expect, test } from '@playwright/test';

const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

test('shows Chopper gun and missile controls and cleans them up on exit and death', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  await page.goto('/?release=latest&map=gun-range&renderer=webgl2&render=performance&grass=off&mist=off&rays=off&externalServices=off&seed=pass74-chopper-hud');
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 45_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return snapshot.gameStarted && snapshot.matchPhase === 'active'
      && snapshot.supportVehiclePresentation?.state === 'ready';
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.earnSupport(15);
    if (!window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper')) throw new Error('Chopper activation rejected');
  });
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);

  await expect(page.locator('#gunner-control-strip')).toBeVisible();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#gunner-gun-control')).toContainText('LMB');
  await expect(page.locator('#gunner-gun-control')).toContainText('GUN');
  await expect(page.locator('#gunner-missile-status')).toContainText('RMB');
  await expect(page.locator('#gunner-missile-status')).toContainText('MISSILES');
  const ammo = await page.evaluate(() => {
    const entity = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
      .find((candidate: any) => candidate.kind === 'chopper' && candidate.phase === 'orbiting');
    return { entity: entity?.missileAmmo, hud: document.querySelector('#gunner-missile-ammo')?.textContent };
  });
  expect(ammo.hud).toBe(`×${ammo.entity} / 6`);
  // HF-389, the defect this spec used to bless: it read ONLY the <b>'s own
  // textContent, so it could not see the second multiplication glyph that the
  // shell markup contributed beside it - "× ×3 / 6" shipped green for six days
  // in the exact readout the owner named. Read the COMPOSED value box instead.
  const composed = await page.evaluate(() => ({
    value: document.querySelector('#gunner-missile-status .gunner-control-value')?.textContent ?? '',
    panel: document.querySelector('#gunner-missile-status')?.textContent ?? '',
  }));
  expect(composed.value).toBe(`×${ammo.entity} / 6`);
  expect(composed.panel.match(/×/gu) ?? []).toHaveLength(1);
  await expect(page.locator('#gunner-missile-cooldown')).not.toHaveText('OFFLINE');

  // HF-389, the regression the owner reported: two unlayered reskin sheets
  // (pass75, pass77) had reached into the cockpit rails with a `border:`
  // shorthand and a `background-image:`, and because pass65-hud.css wraps the
  // cockpit in `@layer pass65.hud` those unlayered rules won on layer alone -
  // turning two diegetic canopy rails into rounded opaque cards. The fix and
  // its guard were both SOURCE-TEXT level; nothing ever read the composed
  // cascade in a real browser. This does.
  //
  // These are the CHOPPER-GUNNER values. The base cockpit rails (the piloted
  // drone possession state) are the border-block hairline plus the gradient
  // that fades to transparent at both ends; the chopper variant deliberately
  // replaces both with a left accent bar over a flat translucent fill
  // (pass65-hud.css `#gunner-cockpit-hud[data-support-kind="chopper-gunner"]`).
  // What both states share, and what regressed, is: no full border box, no
  // corner radius, and no reskin-sheet gradient.
  const rails = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
        borderLeftStyle: style.borderLeftStyle,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    };
    return {
      supportKind: document.querySelector('#gunner-cockpit-hud')?.getAttribute('data-support-kind') ?? null,
      status: read('#gunner-cockpit-hud .gunner-status'),
      instruments: read('#gunner-cockpit-hud .gunner-instruments'),
    };
  });
  expect(rails.supportKind).toBe('chopper-gunner');
  for (const [name, rail] of [['status', rails.status], ['instruments', rails.instruments]] as const) {
    expect(rail, `${name} rail must exist in the possessed cockpit`).not.toBeNull();
    // A hairline on ONE axis only - never the four-sided border of a card.
    expect(rail!.borderTopWidth, `${name} border-top`).toBe('0px');
    expect(rail!.borderRightWidth, `${name} border-right`).toBe('0px');
    expect(rail!.borderBottomWidth, `${name} border-bottom`).toBe('0px');
    expect(rail!.borderLeftWidth, `${name} border-left`).toBe('2px');
    expect(rail!.borderLeftStyle, `${name} border-left style`).toBe('solid');
    // Square: a radius is what made them read as floating cards.
    expect(rail!.borderTopLeftRadius, `${name} radius`).toBe('0px');
    expect(rail!.borderBottomRightRadius, `${name} radius`).toBe('0px');
    // No reskin gradient, and a translucent fill rather than an opaque panel.
    expect(rail!.backgroundImage, `${name} background-image`).toBe('none');
    expect(rail!.backgroundColor, `${name} background-color`).toMatch(/^rgba\(2, 14, 10, 0\.2\d\)$/u);
    // pass77's material is still applied - the fix kept the depth, it only
    // stopped the sheet claiming the two axes pass65 owns.
    expect(rail!.boxShadow, `${name} box-shadow`).not.toBe('none');
  }

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-control-strip')).toBeHidden();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(1_000));
  await expect(page.locator('#gunner-control-strip')).toBeHidden();
  await expect(page.locator('#gunner-control-strip')).toHaveAttribute('aria-hidden', 'true');
  expect(errors).toEqual([]);
});
