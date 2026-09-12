import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponPresentation } from './weapon-presentation';
import { VIEWMODEL_BODY_FIT_SCALE } from './viewmodel-body-fit';
import { PARTICLE_READABILITY } from './particles/combat-readability';
import { WEAPON_IDS } from './protocol';

/**
 * HF-410 REPAIR - THE FIT MOVED THE MUZZLE INSIDE THE PARTICLE NEAR-LENS CULL.
 *
 * `PARTICLE_READABILITY.nearCullM` is a hard 0.35 m "not drawn at all, in any
 * family, at any opacity" (src/particles/combat-readability.ts). Fitting the rig
 * inside the player's capsule put the muzzle socket 0.216-0.376 m from the eye,
 * so 14 of 21 weapons emitted their HF-371 powder smoke, and the flamethrower
 * its stream origin, from INSIDE that cull. Nothing failed loudly: the effects
 * simply stopped existing for the local player. Before the fit the socket sat
 * 1.66-2.89 m out and cleared it by 5x.
 *
 * The correction is `muzzleEffectWorldPosition()`, which undoes the uniform
 * scale about the eye. Two properties make it the right anchor and both are
 * asserted here per weapon:
 *
 *   1. IT IS THE SAME PIXEL. The un-fitted point lies on the same ray from the
 *      eye, so the effect still starts at the muzzle on screen. Asserted as a
 *      unit-dot of 1 to 9 decimal places.
 *   2. IT IS THE SHIPPED WORLD DISTANCE. Exactly 1/k times the fitted distance,
 *      which is where the socket sat on 75a4e508, so every world system tuned
 *      against it - the cull, the protected centre cone, the stream length -
 *      sees what it saw before.
 *
 * The fix that must NOT be made instead is lowering nearCullM: that guard is a
 * combat-readability contract about the player's view of a fight, and it is not
 * the viewmodel's to spend.
 */
const REST_POSE = {
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
};

describe('HF-410 muzzle effect anchor', () => {
  it('emits world effects outside the particle near-lens cull, on the muzzle pixel, for every weapon', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    let culledAtTheRigSocket = 0;
    for (const weapon of WEAPON_IDS) {
      presentation.setWeapon(weapon, true);
      for (let frame = 0; frame < 60; frame += 1) presentation.update({ ...REST_POSE });
      camera.updateMatrixWorld(true);
      const eye = camera.getWorldPosition(new THREE.Vector3());
      const rigSocket = presentation.muzzleWorldPosition(new THREE.Vector3());
      const effectAnchor = presentation.muzzleEffectWorldPosition(new THREE.Vector3());
      expect(rigSocket, `${weapon}: muzzle socket resolves`).not.toBeNull();
      expect(effectAnchor, `${weapon}: effect anchor resolves`).not.toBeNull();
      const rigMeters = (rigSocket as THREE.Vector3).distanceTo(eye);
      const effectMeters = (effectAnchor as THREE.Vector3).distanceTo(eye);
      if (rigMeters < PARTICLE_READABILITY.nearCullM) culledAtTheRigSocket += 1;

      expect(effectMeters, `${weapon}: effect anchor clears the near-lens cull`)
        .toBeGreaterThan(PARTICLE_READABILITY.nearCullM);
      expect(effectMeters, `${weapon}: effect anchor is exactly the unfitted muzzle distance`)
        .toBeCloseTo(rigMeters / VIEWMODEL_BODY_FIT_SCALE, 6);
      const towardRig = (rigSocket as THREE.Vector3).clone().sub(eye).normalize();
      const towardEffect = (effectAnchor as THREE.Vector3).clone().sub(eye).normalize();
      expect(towardRig.dot(towardEffect), `${weapon}: effect anchor is the same pixel as the muzzle`)
        .toBeCloseTo(1, 9);
    }
    // The defect this gate exists for was real and this pins how real: on the
    // fitted rig, most of the catalog's muzzles are inside the cull. If that
    // ever reaches zero the fit has been reverted, and this test would then be
    // passing for a reason that has nothing to do with what it checks.
    expect(culledAtTheRigSocket, 'the rig socket is inside the cull for most of the catalog')
      .toBeGreaterThanOrEqual(14);
  }, 120_000);
});
