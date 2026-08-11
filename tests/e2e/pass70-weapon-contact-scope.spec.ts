import { expect, test } from '@playwright/test';
import { WEAPON_IDS, type WeaponId } from '../../src/protocol';

declare global {
  interface Window {
    __ATOMIC_ACRES_DEBUG__: any;
  }
}

const CONTACT_FIXTURE = Object.freeze({
  contract: 'gun-range-west-wall-prone-pose-v2',
  position: Object.freeze([-19.65, 1.7, -14.5] as const),
  yaw: Math.PI / 2,
});

function assertFraming(framing: any, label: string): void {
  expect(framing, `${label}: framing exists`).not.toBeNull();
  expect(framing, `${label}: finite and visible beyond the near plane`).toMatchObject({
    finite: true,
    nearPlaneClear: true,
    intersectsViewport: true,
  });
  expect(framing.nearestDepth, `${label}: positive camera depth`).toBeGreaterThan(0);
}

async function equipSettledContact(page: import('@playwright/test').Page, weapon: WeaponId): Promise<any> {
  await page.evaluate((weaponId) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setReloadCaptureProgress(null);
    api.setMeleeCaptureProgress(null);
    api.setFireCaptureAgeMs(null);
    api.equipWeapon(weaponId);
  }, weapon);
  await page.waitForFunction((weaponId) => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.weaponPresentation.weapon === weaponId
      && state.weaponPresentation.importedModel?.weapon === weaponId
      && state.weaponPresentation.contactResponse.profileId === weaponId
      && state.weaponPresentation.contactResponse.highReadyBlend > 0.25;
  }, weapon, { timeout: 30_000 });
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
}

test('Pass 70 keeps every catalog viewmodel clear of prone wall/floor contact without aim drift', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?release=latest&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&map=gun-range&seed=pass70-contact-scope');
  expect(new URL(page.url()).pathname).toBe('/channels/the-big-one/');
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap.stage === 'ready' && state.weaponReady === true
      && state.arenaSelection.id === 'gun-range'
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active', undefined, {
    timeout: 60_000,
  });
  await page.evaluate(({ position, yaw }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.teleportPlayer(position[0], position[1], position[2], yaw, 0);
    api.setStance('prone');
  }, CONTACT_FIXTURE);
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return state.player.stance === 'prone'
      && state.weaponPresentation.surfaceRetreat > 0.25
      && state.weaponPresentation.surfaceLift >= 0.13;
  }, undefined, { timeout: 10_000 });

  const covered: WeaponId[] = [];
  for (const weapon of WEAPON_IDS) {
    const state = await equipSettledContact(page, weapon);
    const presentation = state.weaponPresentation;
    expect(presentation.contactResponse, weapon).toMatchObject({
      contract: 'catalog-viewmodel-contact-response-v1',
      profileId: weapon,
      active: true,
      aimAuthority: 'camera-forward-unchanged',
    });
    expect(presentation.contactResponse.obstructionBlend, weapon).toBeGreaterThan(0.25);
    expect(presentation.contactResponse.pitchRadians, weapon).toBeGreaterThan(0.14);
    expect(presentation.viewmodelViewport.rootScale, weapon).toBeGreaterThanOrEqual(0.55);
    expect(presentation.viewmodelViewport.rootScale, weapon).toBeLessThan(0.82);
    expect(presentation.viewmodelViewport.rootRotation.every(Number.isFinite), weapon).toBe(true);
    assertFraming(presentation.weaponFraming, `${weapon}/weapon`);
    assertFraming(presentation.armFraming, `${weapon}/arms`);
    expect(state.aimAlignment.errorCssPixels, `${weapon}: reticle centre`).toBeLessThanOrEqual(1);
    expect(Math.abs(state.aimAlignment.rayNdc[0]), `${weapon}: camera-forward ray x`).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(state.aimAlignment.rayNdc[1]), `${weapon}: camera-forward ray y`).toBeLessThanOrEqual(1e-6);
    covered.push(weapon);
  }
  expect(covered).toEqual(WEAPON_IDS);

  for (const weapon of ['carbine', 'mini-uzi'] as const) {
    await equipSettledContact(page, weapon);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(true));
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.adsProgress > 0.999);
    const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    expect(state.weaponPresentation.contactResponse, weapon).toMatchObject({
      pitchRadians: 0,
      yawRadians: 0,
      rollRadians: 0,
      scale: 1,
    });
    expect(state.weaponPresentation.adsOpaqueSightWindow.accepted, `${weapon}: clear centre aperture`).toBe(true);
    expect(state.weaponPresentation.opticMaterialSemantics.invalidOpticWindowCount, weapon).toBe(0);
    expect(state.weaponPresentation.opticMaterialSemantics.invalidOpaqueBodyCount, weapon).toBe(0);
    expect(state.weaponPresentation.sightOffset[0], weapon).toBeCloseTo(0, 3);
    expect(state.weaponPresentation.sightOffset[1], weapon).toBeCloseTo(0, 3);
  }

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.equipWeapon('m4a1');
    api.setAmmo('m4a1', 20, 80);
    api.fireOnce();
  });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().lastPrincipalShotAlignment?.weapon === 'm4a1');
  const fired = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  expect(fired.lastPrincipalShotAlignment).toMatchObject({ weapon: 'm4a1', ads: false, stance: 'prone' });
  expect(fired.lastPrincipalShotAlignment.angularError).toBeLessThanOrEqual(
    fired.lastPrincipalShotAlignment.spread + 1e-7,
  );
  expect(fired.weaponPresentation.contactResponse.aimAuthority).toBe('camera-forward-unchanged');
});
