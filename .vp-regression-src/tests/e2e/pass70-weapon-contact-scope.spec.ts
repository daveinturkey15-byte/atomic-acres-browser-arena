import { expect, test } from '@playwright/test';
import { WEAPON_IDS, type WeaponId } from '../../src/protocol';
import { HIP_VIEWMODEL_SCALE } from '../../src/weapon-presentation';

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
  }, CONTACT_FIXTURE);
  await page.waitForFunction(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation.surfaceRetreat > 0.15
  ), undefined, { timeout: 10_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
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
      contract: 'catalog-viewmodel-contact-response-v2',
      profileId: weapon,
      active: true,
      aimAuthority: 'camera-forward-unchanged',
    });
    expect(presentation.contactResponse.obstructionBlend, weapon).toBeGreaterThan(0.25);
    expect(presentation.contactResponse.pitchRadians, weapon).toBeGreaterThan(0.14);
    expect(presentation.contactResponse.additionalDropMeters, weapon).toBeGreaterThan(0.04);
    expect(presentation.viewmodelViewport.rootScale, weapon).toBeGreaterThanOrEqual(0.55);
    expect(presentation.viewmodelViewport.rootScale, weapon).toBeCloseTo(
      HIP_VIEWMODEL_SCALE
        * presentation.viewmodelViewport.scaleMultiplier
        * presentation.contactResponse.scale,
      8,
    );
    expect(presentation.viewmodelViewport.rootScale, weapon).toBeLessThan(1);
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
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    expect(state.weaponPresentation.contactResponse.highReadyBlend, weapon).toBeGreaterThan(0.2);
    expect(state.weaponPresentation.contactResponse.pitchRadians, weapon).toBeGreaterThan(0.1);
    expect(state.weaponPresentation.contactResponse.additionalDropMeters, weapon).toBeGreaterThan(0.04);
    expect(state.weaponPresentation.contactResponse.scale, weapon).toBeLessThan(1);
    assertFraming(state.weaponPresentation.weaponFraming, `${weapon}/contact-ads/weapon`);
    assertFraming(state.weaponPresentation.armFraming, `${weapon}/contact-ads/arms`);
    expect(state.aimAlignment.errorCssPixels, `${weapon}: retained camera-forward aim`).toBeLessThanOrEqual(1);
    expect(state.weaponPresentation.contactResponse.aimAuthority, weapon).toBe('camera-forward-unchanged');
    expect(state.weaponPresentation.opticMaterialSemantics.invalidOpticWindowCount, weapon).toBe(0);
    expect(state.weaponPresentation.opticMaterialSemantics.invalidOpaqueBodyCount, weapon).toBe(0);
  }

  // A contact fold deliberately moves the physical weapon away from its
  // ordinary sight picture. Re-prove the authored centre aperture separately
  // in open space so this gate cannot pass by either disabling contact stow or
  // accepting an opaque scope/iron-sight block.
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.setStance('stand');
    api.teleportPlayer(0, 1.7, 8, 0, 0);
  });
  // Teleporting invalidates grounded contact for a few frames; the production
  // stance guard correctly rejects an early stand request, so poll the real
  // request until the player has settled rather than mutating stance state.
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    if (api.snapshot().player.stance !== 'stand') api.setStance('stand');
    return api.snapshot().player.stance === 'stand';
  }, undefined, { timeout: 10_000, polling: 50 });
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation;
    return presentation.surfaceRetreat < 0.01 && presentation.contactResponse.active === false;
  }, undefined, { timeout: 10_000 });
  for (const weapon of ['carbine', 'mini-uzi'] as const) {
    await page.evaluate((weaponId) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.equipWeapon(weaponId);
      api.setAds(true);
    }, weapon);
    await page.waitForFunction((weaponId) => {
      const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation;
      return presentation.weapon === weaponId && presentation.adsProgress > 0.999;
    }, weapon);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    expect(state.weaponPresentation.contactResponse.active, weapon).toBe(false);
    expect(state.weaponPresentation.adsOpaqueSightWindow.accepted, `${weapon}: open-space clear centre aperture`).toBe(true);
    expect(state.weaponPresentation.sightOffset[0], weapon).toBeCloseTo(0, 3);
    expect(state.weaponPresentation.sightOffset[1], weapon).toBeCloseTo(0, 3);
  }

  await page.evaluate(({ position, yaw }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setAds(false);
    api.teleportPlayer(position[0], position[1], position[2], yaw, 0);
  }, CONTACT_FIXTURE);
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    if (api.snapshot().player.stance !== 'prone') api.setStance('prone');
    return api.snapshot().player.stance === 'prone';
  }, undefined, { timeout: 10_000, polling: 50 });
  await page.waitForFunction(() => {
    const presentation = window.__ATOMIC_ACRES_DEBUG__.snapshot().weaponPresentation;
    return presentation.surfaceRetreat > 0.25 && presentation.contactResponse.active === true;
  }, undefined, { timeout: 10_000 });

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
