import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_ARM_PROPORTION_CONTRACT,
  FIRST_PERSON_ARM_ADS_PRESENTATION_SCALE,
  FIRST_PERSON_ARM_BIND_SEGMENT_LENGTH_SCALE,
  FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE,
  FIRST_PERSON_ARM_RELOAD_SCALE_LIFT,
  FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_UNIFORM_SCALE,
  FIRST_PERSON_MELEE_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT,
  FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT,
  FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT_CONTRACT,
  FIRST_PERSON_HIP_TRIGGER_HAND_LIFT,
  FIRST_PERSON_HIP_TRIGGER_HAND_LIFT_CEILING,
  FIRST_PERSON_VIEWMODEL_FILL_INTENSITY,
  ARM_FILL_EMISSIVE_INTENSITY,
  armFillEmissiveIntensity,
  HIP_VIEWMODEL_POSITION,
  HIP_VIEWMODEL_SCALE,
  VIEWMODEL_NEAR_PLANE_CLEARANCE,
  VIEWMODEL_NEAR_PLANE_SAFE_RETREAT,
  VIEWMODEL_WALL_PULLBACK_SCALE,
  WeaponPresentation,
  authoredNearPlaneContactRetreat,
  firstPersonArmPresentationScale,
  firstPersonArmShoulderEntryNdc,
  FINGER_FIRE_CURL,
  FINGER_SUPPORT_CURL,
  firstPersonHipTriggerHandLift,
} from './weapon-presentation';
import {
  VIEWMODEL_CONTACT_PROFILES,
  VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
  viewmodelContactResponse,
} from './weapon-presentation-state';
import { WEAPON_IDS, type WeaponId } from './protocol';
import { FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY } from './operator-model';

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

describe('first-person anatomical presentation', () => {
  it('adds action-state mass with uniform scale and no retained reload deformation', () => {
    expect(firstPersonArmPresentationScale(0, null)).toBeCloseTo(FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE, 8);
    expect(firstPersonArmPresentationScale(1, null)).toBeCloseTo(FIRST_PERSON_ARM_ADS_PRESENTATION_SCALE, 8);
    expect(firstPersonArmPresentationScale(0, 0)).toBeCloseTo(FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE, 8);
    expect(firstPersonArmPresentationScale(0, 0.5)).toBeCloseTo(
      FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE + FIRST_PERSON_ARM_RELOAD_SCALE_LIFT,
      8,
    );
    expect(firstPersonArmPresentationScale(0, 1)).toBeCloseTo(FIRST_PERSON_ARM_HIP_PRESENTATION_SCALE, 8);
    expect(firstPersonArmShoulderEntryNdc('left', 'heavy', 1, 1))
      .toBe(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.left);
    expect(firstPersonArmShoulderEntryNdc('right', 'long-gun', 0, 0))
      .toBe(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right);
    expect(firstPersonArmShoulderEntryNdc('right', 'heavy', 0, 0))
      .toBe(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC);
    expect(firstPersonArmShoulderEntryNdc('right', 'long-gun', 1, 0))
      .toBe(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC);
    expect(firstPersonArmShoulderEntryNdc('right', 'long-gun', 0, 1))
      .toBe(FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC);
    expect(firstPersonArmShoulderEntryNdc('right', 'long-gun', 0.5, 0))
      .toBeCloseTo((FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right
        + FIRST_PERSON_ARM_RAISED_SHOULDER_ENTRY_NDC) / 2, 8);
  });

  it('starts at the readable hip framing shared by high-resolution displays', () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    expect(presentation.root.scale.x).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.scale.y).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.scale.z).toBeCloseTo(HIP_VIEWMODEL_SCALE, 8);
    expect(presentation.root.position.toArray()).toEqual([
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y,
      HIP_VIEWMODEL_POSITION.z,
    ]);
  });

  it('solves arm bones in parent space without missing the weapon socket under a reflected ancestor', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const mirroredVisual = new THREE.Group();
    mirroredVisual.scale.x = -1;
    const shoulder = new THREE.Bone();
    const elbow = new THREE.Bone();
    shoulder.add(elbow);
    elbow.position.set(0, -1, 0);
    mirroredVisual.add(shoulder);
    mirroredVisual.updateWorldMatrix(true, true);

    const target = new THREE.Vector3(0.5, -0.5, -Math.sqrt(0.5));
    const orient = (presentation as unknown as {
      orientRiggedBone: (bone: THREE.Bone, child: THREE.Bone, targetWorld: THREE.Vector3) => void;
    }).orientRiggedBone;
    orient.call(presentation, shoulder, elbow, target);

    const solved = elbow.getWorldPosition(new THREE.Vector3());
    expect(solved.distanceTo(target)).toBeLessThan(1e-6);
  });

  it('applies the authored floor-clearance lift while prone instead of reporting a no-op', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const baseline = new WeaponPresentation(camera, false);
    const cleared = new WeaponPresentation(camera, false);
    for (let frame = 0; frame < 180; frame += 1) {
      baseline.update({ ...REST_POSE, prone: true, surfaceLift: 0 });
      cleared.update({ ...REST_POSE, prone: true, surfaceLift: 0.34 });
    }
    expect(cleared.presentationState().surfaceLift).toBeCloseTo(0.34, 8);
    const floorResponse = viewmodelContactResponse('carbine', 0, 0.34, true, 0);
    expect(cleared.root.position.y - baseline.root.position.y)
      .toBeCloseTo(0.34 + floorResponse.additionalLiftMeters, 3);
  });

  it('returns to the resolution-stable dynamically centred sight picture in ADS', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    for (let frame = 0; frame < 180; frame += 1) presentation.update({ ...REST_POSE, ads: true });
    const state = presentation.presentationState();
    expect(state.adsProgress).toBeGreaterThan(0.999);
    expect(presentation.root.scale.x).toBeCloseTo(0.76, 3);
    expect(state.opticMaterialSemantics.sightPictureRetreat).toBeCloseTo(0.26, 3);
    expect(state.viewmodelViewport.rootPosition[2]).toBeLessThan(-1.25);
    expect(state.sightOffset?.[0]).toBeCloseTo(0, 3);
    expect(state.sightOffset?.[1]).toBeCloseTo(0, 3);
  });

  it('preserves detailed PBR sleeve, hand and finger meshes in the quality viewmodel', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms).toBeDefined();

    for (const side of ['left', 'right'] as const) {
      for (const detailName of [`${side}-upper-arm`, `${side}-forearm`, `${side}-palm`, `${side}-thumb`, `${side}-finger-articulated-cluster`]) {
        const detail = arms!.getObjectByName(detailName);
        expect(detail).toBeInstanceOf(THREE.Mesh);
        expect((detail as THREE.Mesh).material).toBeInstanceOf(THREE.MeshStandardMaterial);
      }
      expect(arms!.getObjectByName(`${side}-finger-articulated-cluster`)?.userData.segmentCount).toBe(8);
      expect(arms!.getObjectByName(`${side}-wrist-joint`)).toBeInstanceOf(THREE.Group);
    }

    expect(presentation.presentationState().armMeshCount).toBeGreaterThanOrEqual(16);
  });

  it('pins a readable fire cycle for deterministic visual evidence', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    presentation.fire(0.02);
    presentation.setFireCaptureAgeMs(18);
    presentation.update({
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
    });
    expect(presentation.presentationState().fireCycle.flash).toBeGreaterThan(0.1);
    expect(presentation.presentationState().fireCycle.boltTravel).toBeGreaterThan(0.5);
    expect(presentation.presentationState().muzzleFlashMeshCount).toBe(1);
    presentation.setFireCaptureAgeMs(null);
  });

  it('keeps the flashlight lighting topology resident across live weapon switches', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const flashlight = camera.getObjectByName('always-on-solid-occluded-weapon-flashlight') as THREE.SpotLight;
    expect(flashlight).toBeInstanceOf(THREE.SpotLight);

    presentation.setWeapon('carbine', true);
    expect(flashlight.visible).toBe(true);
    expect(flashlight.intensity).toBe(0);
    expect(flashlight.shadow.autoUpdate).toBe(false);
    expect(flashlight.userData.shadowBudgetActive).toBe(false);

    presentation.setWeapon('flashlight-pistol', true);
    expect(flashlight.visible).toBe(true);
    expect(flashlight.intensity).toBeGreaterThan(0);
    expect(flashlight.castShadow).toBe(true);
    expect(flashlight.shadow.autoUpdate).toBe(true);
    expect(flashlight.userData.shadowBudgetActive).toBe(true);

    presentation.setWeapon('pistol', true);
    expect(flashlight.visible).toBe(true);
    expect(flashlight.intensity).toBe(0);
    expect(flashlight.shadow.autoUpdate).toBe(false);
    expect(flashlight.userData.shadowBudgetActive).toBe(false);
  });

  it('makes a non-scattergun casing visible at the accepted shot boundary', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);

    expect(presentation.presentationState().activeCasings).toBe(0);
    presentation.fire(0.02);

    expect(presentation.presentationState().activeCasings).toBe(1);
  });

  it('shows the knife immediately when melee is accepted', () => {
    const camera = new THREE.PerspectiveCamera();
    const presentation = new WeaponPresentation(camera, false);

    presentation.melee();
    const state = presentation.presentationState();

    expect(state.knifeVisible).toBe(true);
    expect(state.actionContract.meleeProgress).toBe(0);
    expect(state.armsVisible).toBe(true);
    expect(state.meleeArmSource).toBe('headless-procedural-fallback');
    expect(state.proceduralMeleeArmVisible).toBe(true);
    expect(state.browserProceduralMeleeArmViolation).toBe(false);
  });

  it('never floats a passive knife beside a firearm', () => {
    const camera = new THREE.PerspectiveCamera();
    const presentation = new WeaponPresentation(camera, false);
    const initial = presentation.presentationState();
    expect(initial.passiveKnifeVisible).toBe(false);
    expect(initial.passiveKnifeModel).toBe(true);
    expect(presentation.root.getObjectByName('field-knife-blade')).toBeInstanceOf(THREE.Mesh);

    presentation.melee();
    presentation.fire(0.02);
    presentation.update({ ...REST_POSE });
    const fired = presentation.presentationState();
    expect(fired.shotsPresented).toBe(1);
    expect(fired.knifeVisible).toBe(false);
    expect(fired.passiveKnifeVisible).toBe(false);
  });

  it('snaps retained match-start presentation state without advancing an action frame', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const surfaceRetreat = 0.12;
    presentation.setWeapon('minigun', true);
    for (let frame = 0; frame < 20; frame += 1) {
      presentation.update({ ...REST_POSE, moving: true, sprinting: true, ads: true, triggerHeld: true });
    }
    presentation.fire(0.02);
    presentation.melee();

    presentation.snapToMatchStartRestPose(surfaceRetreat);

    const state = presentation.presentationState();
    const contact = viewmodelContactResponse('minigun', surfaceRetreat, 0, false, 0);
    const appliedRetreat = Math.min(surfaceRetreat, VIEWMODEL_NEAR_PLANE_SAFE_RETREAT)
      * VIEWMODEL_WALL_PULLBACK_SCALE;
    expect(appliedRetreat, 'HF-397 halves the applied pullback').toBe(surfaceRetreat / 2);
    expect(presentation.root.position.toArray()).toEqual([
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y + contact.additionalLiftMeters - contact.additionalDropMeters,
      // HF-397: the owner asked for the near-wall pullback to be halved, so
      // the APPLIED retreat is the probed one scaled. Pinned here through the
      // exported constant so a silent return to the full pullback fails.
      HIP_VIEWMODEL_POSITION.z + appliedRetreat - VIEWMODEL_NEAR_PLANE_CLEARANCE
        - authoredNearPlaneContactRetreat('minigun', appliedRetreat),
    ]);
    expect(presentation.root.scale.toArray()).toEqual([
      HIP_VIEWMODEL_SCALE * contact.scale,
      HIP_VIEWMODEL_SCALE * contact.scale,
      HIP_VIEWMODEL_SCALE * contact.scale,
    ]);
    expect(state).toMatchObject({
      adsProgress: 0,
      activeCasings: 0,
      activeSmoke: 0,
      shotsPresented: 0,
      knifeVisible: false,
      passiveKnifeVisible: false,
      surfaceRetreat,
      contactResponse: contact,
      meleeArmSource: 'inactive',
      minigunSpool: { fraction: 0, phase: 'idle' },
      nearPlaneClearance: {
        contract: FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT_CONTRACT,
        cameraNear: camera.near,
        baseRetreat: VIEWMODEL_NEAR_PLANE_CLEARANCE,
        cachedRetreat: FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT.minigun,
        blendedRetreat: authoredNearPlaneContactRetreat('minigun', surfaceRetreat),
      },
      actionContract: {
        state: 'hip',
        weapon: 'minigun',
        aimBlend: 0,
        reloadProgress: null,
        meleeProgress: null,
      },
    });
  });

  it('telemetry reports the retreat the renderer performed, not the uncapped demand', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    presentation.setWeapon('carbine', true);
    // Prone against a wall: the obstruction pose demands the carbine profile's
    // full retreat, but near-plane safety caps the camera-space translation the
    // renderer actually performs. HF-387 audit: telemetry used to publish the
    // uncapped demand, so every instrument measured a retreat that never happened.
    const demanded = VIEWMODEL_CONTACT_PROFILES.carbine.maximumSurfaceRetreatMeters;
    expect(demanded).toBeGreaterThan(VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    for (let frame = 0; frame < 10; frame += 1) {
      presentation.update({ ...REST_POSE, prone: true, surfaceRetreat: demanded, surfaceLift: 0.2 });
    }
    const capped = presentation.presentationState();
    expect(capped.surfaceRetreat).toBe(VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    expect(capped.requestedSurfaceRetreat).toBe(demanded);
    expect(capped.surfaceRetreatCapMeters).toBe(VIEWMODEL_NEAR_PLANE_SAFE_RETREAT);
    expect(capped.surfaceRetreatCapped).toBe(true);
    // Combat-safety consumers (fire admission, contact fold) keep reading the
    // uncapped demand; only the translation is capped.
    expect(capped.contactResponse.wallBlend).toBe(1);
    for (let frame = 0; frame < 10; frame += 1) {
      presentation.update({ ...REST_POSE, prone: false, surfaceRetreat: 0.12, surfaceLift: 0 });
    }
    const open = presentation.presentationState();
    expect(open.surfaceRetreat).toBe(0.12);
    expect(open.requestedSurfaceRetreat).toBe(0.12);
    expect(open.surfaceRetreatCapped).toBe(false);
  });

  it('keeps every visible arm mesh opaque throughout ADS', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    await presentation.load();
    for (let frame = 0; frame < 180; frame += 1) presentation.update({ ...REST_POSE, ads: true });
    const arms = presentation.root.getObjectByName('first-person-arms');
    expect(arms?.visible).toBe(true);
    arms?.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        expect(material.transparent).toBe(false);
        expect(material.opacity).toBe(1);
        expect(material.depthWrite).toBe(true);
      }
    });
  });

  it('folds the connected weapon-and-hands root away from contact for the complete catalog', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    for (const weapon of WEAPON_IDS) {
      presentation.setWeapon(weapon, true);
      for (let frame = 0; frame < 120; frame += 1) {
        presentation.update({
          ...REST_POSE,
          prone: true,
          surfaceRetreat: 0.7,
          // 2026-08-30 re-pin: 0.2 is now the flat-ground prone BASELINE
          // (which must not fold at all); a genuine under-cover squeeze sits
          // past it. The deep-contact contract this test defends is about the
          // squeeze.
          surfaceLift: 0.29,
        });
      }
      const state = presentation.presentationState();
      expect(state.contactResponse, weapon).toMatchObject({
        contract: VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
        profileId: weapon,
        active: true,
        aimAuthority: 'camera-forward-unchanged',
      });
      expect(state.contactResponse.obstructionBlend, weapon).toBeGreaterThan(0.85);
      expect(state.contactResponse.pitchRadians, weapon).toBeGreaterThan(0.5);
      expect(state.viewmodelViewport.rootScale, weapon).toBeGreaterThan(0.55);
      expect(state.viewmodelViewport.rootScale, weapon).toBeLessThan(HIP_VIEWMODEL_SCALE);
      expect(state.viewmodelViewport.rootRotation.every(Number.isFinite), weapon).toBe(true);
      expect(state.weaponFraming?.finite, weapon).toBe(true);
      expect(state.weaponFraming?.nearPlaneClear, weapon).toBe(true);
      expect(state.armFraming?.finite, weapon).toBe(true);
      expect(state.armFraming?.nearPlaneClear, weapon).toBe(true);
    }
  }, 15_000);

  // This is a deliberately exhaustive synthetic catalog (every weapon × five
  // poses × 45 settling frames). Keep the cross-platform runner budget above
  // the default 5s without weakening any geometry assertion.
  it('keeps the shipped arm rig fixed-length, connected and reachable across the action catalog', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    const privatePresentation = presentation as unknown as { nextRiggedArmDiagnosticsAt: number };
    for (const weapon of WEAPON_IDS) {
      presentation.setWeapon(weapon, true);
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      const scenarios = Object.freeze([
        Object.freeze({ name: 'hip', pose: REST_POSE }),
        Object.freeze({ name: 'fire', pose: REST_POSE }),
        Object.freeze({ name: 'ads', pose: Object.freeze({ ...REST_POSE, ads: true }) }),
        Object.freeze({
          name: 'prone-contact',
          pose: Object.freeze({
            ...REST_POSE,
            prone: true,
            surfaceRetreat: profile.maximumSurfaceRetreatMeters,
            surfaceLift: 0.2,
          }),
        }),
        Object.freeze({ name: 'reload', pose: Object.freeze({ ...REST_POSE, reloadProgress: 0.5 }) }),
      ]);
      for (const scenario of scenarios) {
        if (scenario.name === 'fire') {
          presentation.fire(0.02);
          presentation.setFireCaptureAgeMs(0);
        }
        for (let frame = 0; frame < 45; frame += 1) presentation.update(scenario.pose);
        privatePresentation.nextRiggedArmDiagnosticsAt = 0;
        presentation.update(scenario.pose);
        const state = presentation.presentationState();
        expect(state.riggedArms, `${weapon}/${scenario.name}: both authored chains`).toHaveLength(2);
        for (const arm of state.riggedArms.filter((entry) => entry.active === true)) {
          const label = `${weapon}/${scenario.name}/${String(arm.side)}`;
          expect(arm.segmentLengthScale, `${label}: segment scale`).toBe(FIRST_PERSON_ARM_BIND_SEGMENT_LENGTH_SCALE);
          expect(arm.bindOffsetsPreserved, `${label}: bind offsets`).toBe(true);
          expect((arm.shoulderEntryNdc as readonly number[])[1], `${label}: sleeve crop`).toBeLessThanOrEqual(-0.98);
          expect(arm.withinStableReach, `${label}: stable reach`).toBe(true);
          expect(arm.contactError as number, `${label}: palm contact`).toBeLessThanOrEqual(0.02);
          expect(arm.finite, `${label}: finite solve`).toBe(true);
        }
        for (const arm of state.riggedArms.filter((entry) => entry.stowed === true)) {
          const label = `${weapon}/${scenario.name}/${String(arm.side)}`;
          expect(arm.supportChainScale, `${label}: intact stow scale`).toBe(1);
          expect(arm.stowedWithoutScaling, `${label}: intact stow`).toBe(true);
        }
        if (scenario.name === 'fire') presentation.setFireCaptureAgeMs(1_000);
      }
    }
  }, 15_000);

  it('keeps the complete long-gun geometry camera-side of the calibrated wall and prone floor planes', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    const longGunWallPlanes: Readonly<Partial<Record<WeaponId, number>>> = Object.freeze({
      lmg: -1.84,
      scattergun: -1.62,
      sniper: -1.84,
      minigun: -1.66,
      'm14-ebr': -1.78,
      'slug-shotgun': -1.60,
      railgun: -1.85,
      flamethrower: -1.72,
      // HF-334: shares the flamethrower chassis, so the same calibrated plane.
      'crimson-flamethrower': -1.72,
    });
    expect(Object.keys(longGunWallPlanes).sort()).toEqual(
      WEAPON_IDS.filter((weapon) => VIEWMODEL_CONTACT_PROFILES[weapon].maximumSurfaceRetreatMeters >= 0.92).sort(),
    );

    for (const weapon of WEAPON_IDS) {
      const profile = VIEWMODEL_CONTACT_PROFILES[weapon];
      presentation.setFireCaptureAgeMs(1_000);
      presentation.setWeapon(weapon, true);
      const mountedModel = (presentation as unknown as { mountedModel(): THREE.Object3D }).mountedModel();
      const arms = presentation.root.getObjectByName('first-person-arms');
      expect(arms, weapon).toBeDefined();

      // Recreate the prior universal 0.70 m response. Every long-gun sentinel
      // must falsify that pose before the authored envelope is applied.
      for (let frame = 0; frame < 45; frame += 1) {
        presentation.update({ ...REST_POSE, surfaceRetreat: 0.7, surfaceLift: 0 });
      }
      camera.updateMatrixWorld(true);
      const priorCapBounds = new THREE.Box3().setFromObject(mountedModel)
        .union(new THREE.Box3().setFromObject(arms!));

      for (let frame = 0; frame < 45; frame += 1) {
        presentation.update({
          ...REST_POSE,
          surfaceRetreat: profile.maximumSurfaceRetreatMeters,
          surfaceLift: 0,
        });
      }
      camera.updateMatrixWorld(true);
      const authoredWallBounds = new THREE.Box3().setFromObject(mountedModel)
        .union(new THREE.Box3().setFromObject(arms!));
      const wallPlane = longGunWallPlanes[weapon];
      if (wallPlane !== undefined) {
        expect(priorCapBounds.min.z, `${weapon}: prior 0.70m cap must cross wall plane`).toBeLessThan(wallPlane);
        expect(authoredWallBounds.min.z, `${weapon}: authored response behind wall plane`).toBeGreaterThanOrEqual(wallPlane);
      }

      for (let frame = 0; frame < 45; frame += 1) {
        presentation.update({
          ...REST_POSE,
          prone: true,
          surfaceRetreat: profile.maximumSurfaceRetreatMeters,
          surfaceLift: 0.2,
        });
      }
      camera.updateMatrixWorld(true);
      const proneBounds = new THREE.Box3().setFromObject(mountedModel);
      const state = presentation.presentationState();
      expect(proneBounds.min.y, `${weapon}: weapon below 0.61m prone floor plane`).toBeGreaterThanOrEqual(-0.61);
      expect(state.weaponFraming?.nearPlaneClear, weapon).toBe(true);
      expect(state.armFraming?.nearPlaneClear, weapon).toBe(true);
      expect(state.contactResponse.aimAuthority, weapon).toBe('camera-forward-unchanged');

      presentation.fire(0.02);
      presentation.setFireCaptureAgeMs(0);
      for (let frame = 0; frame < 30; frame += 1) {
        presentation.update({
          ...REST_POSE,
          prone: true,
          surfaceRetreat: profile.maximumSurfaceRetreatMeters,
          surfaceLift: 0.2,
        });
      }
      camera.updateMatrixWorld(true);
      expect(
        new THREE.Box3().setFromObject(mountedModel).min.y,
        `${weapon}: recoil crossed prone floor plane`,
      ).toBeGreaterThanOrEqual(-0.61);
      presentation.setFireCaptureAgeMs(1_000);

      for (const reloadProgress of [0.5, 0.6]) {
        for (let frame = 0; frame < 30; frame += 1) {
          presentation.update({
            ...REST_POSE,
            prone: true,
            surfaceRetreat: profile.maximumSurfaceRetreatMeters,
            surfaceLift: 0.2,
            reloadProgress,
          });
        }
        camera.updateMatrixWorld(true);
        expect(
          new THREE.Box3().setFromObject(mountedModel).min.y,
          `${weapon}: reload ${reloadProgress} crossed prone floor plane`,
        ).toBeGreaterThanOrEqual(-0.61);
      }
    }
    presentation.setFireCaptureAgeMs(null);
  });

  it('strengthens the complete authored arm uniformly without shearing articulated joints', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    const parent = new THREE.Group();
    parent.position.z = -1;
    camera.add(parent);
    const shoulder = new THREE.Bone();
    const elbow = new THREE.Bone();
    const wrist = new THREE.Bone();
    const finger = new THREE.Bone();
    const palmContact = new THREE.Object3D();
    shoulder.position.set(0.28, -0.18, 0);
    elbow.position.set(0, -0.31, 0);
    wrist.position.set(0, -0.28, 0);
    finger.position.set(0, -0.12, 0);
    palmContact.position.set(0, -0.08, 0);
    parent.add(shoulder);
    shoulder.add(elbow);
    elbow.add(wrist);
    wrist.add(finger, palmContact);
    const rig = {
      shoulder,
      elbow,
      wrist,
      finger,
      palmContact,
      side: 'right' as const,
      bindShoulder: shoulder.quaternion.clone(),
      bindElbow: elbow.quaternion.clone(),
      bindWrist: wrist.quaternion.clone(),
      bindShoulderPosition: shoulder.position.clone(),
      bindElbowPosition: elbow.position.clone(),
      bindWristPosition: wrist.position.clone(),
      bindShoulderScale: shoulder.scale.clone(),
      bindElbowScale: elbow.scale.clone(),
      bindWristScale: wrist.scale.clone(),
    };
    const privatePresentation = presentation as unknown as {
      riggedArmRigs: Array<typeof rig>;
      placeRiggedShoulderEntryBelowFrame(
        arm: typeof rig,
        cameraRotation: THREE.Quaternion,
        targetNdcY?: number,
      ): Readonly<{ ndc: readonly [number, number, number]; displacementMeters: number }>;
      constrainRiggedShoulderEntryToReach(
        arm: typeof rig,
        cameraRotation: THREE.Quaternion,
        socketTarget: THREE.Vector3,
        maximumSocketReach: number,
        targetNdcY?: number,
      ): Readonly<{
        ndc: readonly [number, number, number];
        displacementMeters: number;
        adjusted: boolean;
        socketDistance: number;
      }>;
    };
    privatePresentation.riggedArmRigs.push(rig);
    camera.updateMatrixWorld(true);
    const bindReach = shoulder.getWorldPosition(new THREE.Vector3())
      .distanceTo(wrist.getWorldPosition(new THREE.Vector3()));

    parent.scale.setScalar(FIRST_PERSON_ARM_UNIFORM_SCALE);
    camera.updateMatrixWorld(true);
    expect(shoulder.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
    ]);
    expect(elbow.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
    ]);
    expect(wrist.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
      FIRST_PERSON_ARM_UNIFORM_SCALE,
    ]);
    expect(shoulder.getWorldPosition(new THREE.Vector3())
      .distanceTo(wrist.getWorldPosition(new THREE.Vector3())))
      .toBeCloseTo(bindReach * FIRST_PERSON_ARM_UNIFORM_SCALE, 8);
    expect(shoulder.scale.toArray()).toEqual([1, 1, 1]);
    expect(elbow.scale.toArray()).toEqual([1, 1, 1]);
    expect(wrist.scale.toArray()).toEqual([1, 1, 1]);
    expect(FIRST_PERSON_ARM_PROPORTION_CONTRACT).toBe('authored-fixed-length-strong-operator-arms-v5');

    const cropScenarios = Object.freeze([
      Object.freeze({ name: 'hip', rotation: [0, 0, 0] as const }),
      Object.freeze({ name: 'recoil', rotation: [0.22, -0.04, 0.03] as const }),
      Object.freeze({ name: 'reload', rotation: [0.5, 0.2, 0.48] as const }),
      Object.freeze({ name: 'prone-contact', rotation: [0.96, -0.18, 0.11] as const }),
    ]);
    for (const scenario of cropScenarios) {
      shoulder.position.copy(rig.bindShoulderPosition);
      parent.rotation.set(scenario.rotation[0], scenario.rotation[1], scenario.rotation[2]);
      camera.updateMatrixWorld(true);
      const crop = privatePresentation.placeRiggedShoulderEntryBelowFrame(rig, camera.quaternion);
      expect(crop.ndc[1], scenario.name).toBeCloseTo(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right - 0.01, 8);
      expect(crop.displacementMeters, scenario.name).toBeGreaterThan(0);
    }
    shoulder.position.copy(rig.bindShoulderPosition);
    parent.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    const meleeCrop = privatePresentation.placeRiggedShoulderEntryBelowFrame(
      rig,
      camera.quaternion,
      FIRST_PERSON_MELEE_SHOULDER_ENTRY_NDC,
    );
    expect(meleeCrop.ndc[1]).toBeCloseTo(FIRST_PERSON_MELEE_SHOULDER_ENTRY_NDC - 0.01, 8);
    expect(FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT)
      .toBe('fixed-length-reachable-shoulders-continuous-sleeve-crop-v5');
    expect(FIRST_PERSON_ARM_BIND_SEGMENT_LENGTH_SCALE).toBe(1);

    shoulder.position.copy(rig.bindShoulderPosition);
    elbow.position.copy(rig.bindElbowPosition);
    wrist.position.copy(rig.bindWristPosition);
    parent.rotation.set(0, 0, 0);
    camera.updateMatrixWorld(true);
    privatePresentation.placeRiggedShoulderEntryBelowFrame(rig, camera.quaternion);
    const elbowBind = elbow.position.clone();
    const wristBind = wrist.position.clone();
    // Use a camera-near grip socket whose reachable sphere intersects the
    // below-frame crop. A deeper synthetic socket has no mechanically valid
    // solution without stretching the arm and would only test impossible IK.
    const socketTarget = new THREE.Vector3(0.1, -0.22, -0.62);
    const maximumSocketReach = bindReach * FIRST_PERSON_ARM_UNIFORM_SCALE * 0.82;
    const reachCrop = privatePresentation.constrainRiggedShoulderEntryToReach(
      rig,
      camera.quaternion,
      socketTarget,
      maximumSocketReach,
    );
    expect(reachCrop.adjusted).toBe(true);
    expect(reachCrop.ndc[1]).toBeLessThanOrEqual(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right);
    expect(reachCrop.socketDistance).toBeLessThanOrEqual(maximumSocketReach + 1e-8);
    expect(elbow.position).toEqual(elbowBind);
    expect(wrist.position).toEqual(wristBind);
    expect([shoulder.scale, elbow.scale, wrist.scale].every((scale) => (
      Math.abs(scale.x - scale.y) < 1e-9 && Math.abs(scale.y - scale.z) < 1e-9
    ))).toBe(true);
  });

  it('preserves Carbine and Mini Uzi centre apertures during contact ADS', async () => {
    for (const weapon of ['carbine', 'mini-uzi'] as const) {
      const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
      await presentation.load();
      presentation.setWeapon(weapon, true);
      for (let frame = 0; frame < 180; frame += 1) {
        presentation.update({
          ...REST_POSE,
          prone: true,
          ads: true,
          surfaceRetreat: 0.7,
          surfaceLift: 0.2,
        });
      }
      const state = presentation.presentationState();
      expect(state.adsProgress, weapon).toBeGreaterThan(0.999);
      expect(state.contactResponse.highReadyBlend, weapon).toBeGreaterThan(0.4);
      expect(state.contactResponse.pitchRadians, weapon).toBeGreaterThan(0.2);
      expect(state.contactResponse.additionalDropMeters, weapon).toBeGreaterThan(0.1);
      expect(state.sightOffset?.[0], weapon).toBeCloseTo(0, 3);
      expect(state.sightOffset?.[1], weapon).toBeCloseTo(0, 3);
      expect(state.adsOpaqueSightWindow.acceptance, weapon).toBe(
        weapon === 'carbine' ? 'nine-ray-window-clear' : 'centre-ray-clear',
      );
    }
  });

  it('rotates the authored minigun barrel cluster before the first legal shot', async () => {
    const presentation = new WeaponPresentation(new THREE.PerspectiveCamera(), false);
    await presentation.load();
    presentation.setWeapon('minigun', true);
    const barrels = presentation.root.getObjectByName('minigun-barrel-cluster');
    expect(barrels).toBeDefined();
    const startingAngle = barrels!.rotation.z;
    for (let frame = 0; frame < 12; frame += 1) {
      presentation.update({ ...REST_POSE, triggerHeld: true });
    }
    expect(presentation.presentationState().minigunSpool).toMatchObject({ phase: 'spooling-up' });
    expect(presentation.minigunSpoolFraction()).toBeGreaterThan(0);
    expect(barrels!.rotation.z).not.toBe(startingAngle);
    expect(presentation.presentationState().shotsPresented).toBe(0);
  });

  it('keeps the complete articulated hand silhouette in the reduced presentation', () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, true);
    const arms = presentation.root.getObjectByName('first-person-arms');
    let meshes = 0;
    arms?.traverse((node) => { if (node instanceof THREE.Mesh) meshes += 1; });
    expect(meshes).toBe(6);
    expect((arms?.getObjectByName('left-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((arms?.getObjectByName('right-glove') as THREE.Mesh).material).toBeInstanceOf(THREE.MeshBasicMaterial);
    for (const side of ['left', 'right'] as const) {
      const glove = arms?.getObjectByName(`${side}-glove`) as THREE.Mesh;
      expect(glove.geometry.getAttribute('position').count).toBeGreaterThan(300);
      expect(glove.userData.style).toBe('atomic-tactical-v3-detailed');
      expect(glove.userData.cuffConnected).toBe(true);
      expect(glove.userData.sourcePartCount).toBeGreaterThanOrEqual(10);
      const material = glove.material as THREE.MeshBasicMaterial;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(1);
      const colors = glove.geometry.getAttribute('color') as THREE.BufferAttribute;
      const uniqueColors = new Set<string>();
      for (let index = 0; index < colors.count; index += 1) {
        uniqueColors.add(`${colors.getX(index).toFixed(3)}:${colors.getY(index).toFixed(3)}:${colors.getZ(index).toFixed(3)}`);
      }
      expect(uniqueColors.size).toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * HF-388 wiring falsifier. The per-grip-family hip lift is the change that
 * brings the welded trigger hand back inside the frame, and a table of numbers
 * that no live code path reads is exactly the failure this project keeps
 * repeating. So this drives the real `update()` loop and reads
 * `root.position.y`, not the constant.
 *
 * At REST_POSE every other vertical term is either zero or weapon-independent
 * (bob, breath and the aspect-driven screen drop are shared; contact response,
 * switch drop, reload lift, recoil kick and stance drop are all zero), so the
 * ONLY thing that can separate two converged hip viewmodels of different grip
 * families on the Y axis is this lift. Which is what makes the difference an
 * exact number rather than an impression.
 */
describe('HF-388: the hip trigger-hand lift is applied by the live update loop', () => {
  const settle = (weapon: WeaponId, ads: boolean) => {
    const camera = new THREE.PerspectiveCamera(82, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    presentation.setWeapon(weapon, true);
    for (let frame = 0; frame < 400; frame += 1) {
      presentation.update({ ...REST_POSE, ads });
    }
    return presentation.root.position.y;
  };

  it('separates a heavy hip viewmodel from a long-gun one by exactly the authored deficit', () => {
    const heavy = settle('lmg', false);
    const longGun = settle('carbine', false);
    // The root chases its target through an exponential lerp, so 400 frames
    // leaves a measured 0.085 mm of residual approach. Bound the error
    // explicitly at 0.2 mm rather than rounding to a decimal place: 0.2 mm is
    // 0.3% of the 60 mm being asserted, and stating it is how the next person
    // knows the difference is convergence and not slack.
    const expectedDelta = FIRST_PERSON_HIP_TRIGGER_HAND_LIFT.heavy
      - FIRST_PERSON_HIP_TRIGGER_HAND_LIFT['long-gun'];
    expect(Math.abs((heavy - longGun) - expectedDelta)).toBeLessThan(2e-4);
    // ...and the heavy family is the one that needed it: measured on the live
    // build, the M249's right-hand bones sat at NDC y -1.110..-0.888, part of
    // the hand BELOW the bottom edge, while the carbine's sat at -0.963.
    expect(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT.heavy)
      .toBeGreaterThan(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT['long-gun']);
  });

  it('gives back exactly nothing at full ADS, so the accepted sight picture cannot move', () => {
    expect(settle('lmg', true) - settle('carbine', true)).toBeCloseTo(0, 4);
    for (const family of ['long-gun', 'compact', 'handgun', 'heavy', 'crossbow'] as const) {
      expect(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT[family]).toBeLessThanOrEqual(
        FIRST_PERSON_HIP_TRIGGER_HAND_LIFT_CEILING,
      );
      expect(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT[family]).toBeGreaterThan(0);
    }
    expect(firstPersonHipTriggerHandLift('lmg', 1, 0)).toBe(0);
    expect(firstPersonHipTriggerHandLift('lmg', 0, 1)).toBe(0);
    expect(firstPersonHipTriggerHandLift('lmg', 0, 0))
      .toBeCloseTo(FIRST_PERSON_HIP_TRIGGER_HAND_LIFT.heavy, 8);
  });

  it('is immune to the wall clock: settling across half a breath period drifts nothing', () => {
    // The lift delta above is only an exact number while every vertical term
    // at REST_POSE is shared or zero. Breath used to read performance.now(),
    // so two settles sampled different phases and the measured delta moved
    // with machine load (measured drift: 8.995 mm across a half period -
    // 45x this bound - which is what intermittently failed the assertion
    // above in loaded full-suite runs). Breath now rides the accumulated
    // arm-motion clock, so wall-clock time between settles must move root Y
    // by exactly nothing.
    const first = settle('lmg', false);
    const halfBreathPeriodMs = Math.PI / 1.7 * 1000;
    const until = performance.now() + halfBreathPeriodMs;
    while (performance.now() < until) { /* spin: force maximal phase divergence */ }
    const second = settle('lmg', false);
    expect(second - first).toBe(0);
  });
});

/**
 * HF-388. The support hand's curl table, pinned to the SHAPE a chained
 * finger-curl constraint produces - the rig idea taken from the CC0 reference
 * (para, OpenGameArt, public domain; register row 31). Numbers may be re-tuned;
 * these properties may not be quietly flattened back out, which is what left
 * the support index bending four degrees and the hand reading as an open plate
 * laid on the handguard instead of a hand closed around it.
 */
describe('HF-388: the support hand closes on the handguard like a C-clamp', () => {
  const DIGITS = ['index', 'middle', 'ring', 'pinky'] as const;

  it('curls monotonically down each finger, deepest at the middle joint', () => {
    for (const digit of DIGITS) {
      const [metacarpal, middle, distal] = FINGER_SUPPORT_CURL[digit];
      // A chained constraint compounds into the chain, so the metacarpal is
      // never the deepest joint...
      expect(Math.abs(middle), digit).toBeGreaterThan(Math.abs(metacarpal));
      expect(Math.abs(middle), digit).toBeGreaterThan(Math.abs(distal));
      // ...and every joint is genuinely closed, not a token few degrees. The
      // pre-HF-388 support index metacarpal was 0.07 rad - four degrees.
      expect(Math.abs(metacarpal), digit).toBeGreaterThan(0.2);
      expect(metacarpal, digit).toBeLessThan(0);
      expect(middle, digit).toBeLessThan(0);
      expect(distal, digit).toBeLessThan(0);
    }
  });

  it('keeps the index shallowest and the little finger deepest, and the thumb opposed', () => {
    for (let index = 1; index < DIGITS.length; index += 1) {
      const previous = FINGER_SUPPORT_CURL[DIGITS[index - 1]!];
      const current = FINGER_SUPPORT_CURL[DIGITS[index]!];
      for (let joint = 0; joint < 3; joint += 1) {
        expect(Math.abs(current[joint]!), `${DIGITS[index]}[${joint}]`)
          .toBeGreaterThan(Math.abs(previous[joint]!));
      }
    }
    // The thumb's metacarpal stays ABDUCTED (positive) so it lies over the
    // rail. A negative value here would be a fist, not a support grip.
    expect(FINGER_SUPPORT_CURL.thumb[0]).toBeGreaterThan(0);
    expect(FINGER_SUPPORT_CURL.thumb[1]).toBeLessThan(0);
    // The support hand still reads as a clamp, not the trigger fist: the three
    // WRAPPING fingers stay shallower than the firing hand's same joint.
    for (const digit of ['middle', 'ring', 'pinky'] as const) {
      for (let joint = 0; joint < 3; joint += 1) {
        expect(Math.abs(FINGER_SUPPORT_CURL[digit][joint]!), `${digit}[${joint}]`)
          .toBeLessThan(Math.abs(FINGER_FIRE_CURL[digit][joint]!));
      }
    }
    // The index is the one digit that inverts, and deliberately: the FIRING
    // index lies along a trigger, so it is the shallowest finger of the firing
    // hand, while the SUPPORT index wraps a handguard like the rest of its
    // hand. Asserting "support is always shallower" here would have pinned the
    // wrong anatomy - it is pinned in the direction the hands actually work.
    for (let joint = 0; joint < 3; joint += 1) {
      expect(Math.abs(FINGER_FIRE_CURL.index[joint]!), `fire index[${joint}]`)
        .toBeLessThan(Math.abs(FINGER_FIRE_CURL.middle[joint]!));
      expect(Math.abs(FINGER_SUPPORT_CURL.index[joint]!), `support index[${joint}]`)
        .toBeGreaterThan(Math.abs(FINGER_FIRE_CURL.index[joint]!));
    }
  });
});

describe('HF-388 first-person arm exposure contract', () => {
  /**
   * The bypass this pins used to be real: `FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY`
   * declared 0.18 and `tuneAuthoredFirstPersonArmMaterials` wrote 0.34-0.38
   * directly past it. Nothing asserted the bound, so the constant described a
   * contract the code did not keep. This asserts the PRODUCED value, not the
   * intent - the failure mode this project keeps paying for is a test that
   * checks the input it just wrote.
   */
  it('never lets the lit arm fill exceed the declared emissive cap', () => {
    const roles = Object.keys(ARM_FILL_EMISSIVE_INTENSITY) as (keyof typeof ARM_FILL_EMISSIVE_INTENSITY)[];
    expect(roles.length).toBeGreaterThan(0);
    for (const role of roles) {
      expect(armFillEmissiveIntensity(role, false), role)
        .toBeLessThanOrEqual(FIRST_PERSON_ARM_MAX_EMISSIVE_INTENSITY);
      // A cap honoured by clamping everything to zero would also pass the line
      // above while re-creating the black-wedge failure, so the floor is pinned
      // in the same breath.
      expect(armFillEmissiveIntensity(role, false), role).toBeGreaterThan(0);
    }
  });

  /**
   * The reduced-render path runs with the viewmodel fill at ZERO, so emissive
   * really is its only floor and the below-deck measurement that made the cap
   * free on the lit path says nothing about it. Its authored values are pinned
   * exactly so that a future tidy of the table cannot quietly darken a path
   * nobody re-measured.
   */
  it('keeps the reduced-render arm floor above the lit-path value it does not share', () => {
    const roles = Object.keys(ARM_FILL_EMISSIVE_INTENSITY) as (keyof typeof ARM_FILL_EMISSIVE_INTENSITY)[];
    for (const role of roles) {
      expect(armFillEmissiveIntensity(role, true), role)
        .toBeGreaterThan(armFillEmissiveIntensity(role, false));
    }
    expect(ARM_FILL_EMISSIVE_INTENSITY.sleeve.reduced).toBe(0.24);
    expect(ARM_FILL_EMISSIVE_INTENSITY.glove.reduced).toBe(0.26);
    expect(ARM_FILL_EMISSIVE_INTENSITY.accent.reduced).toBe(0.28);
    expect(ARM_FILL_EMISSIVE_INTENSITY.skin.reduced).toBe(0.2);
  });

  /**
   * The viewmodel fill is the term that made the arm render at the same
   * brightness below deck as in full sunset. Measured: with the arm albedo
   * forced black the shipped frame still returned mean 100.5 of its 140.5, so
   * three quarters of the arm was the fill's own white specular sheen.
   *
   * Both ends are bounded. The ceiling stops a future pass walking the veil
   * back in; the floor stops it over-correcting into the flat-black-wedge
   * failure that is the expensive historical bug on this arm.
   */
  it('bounds the viewmodel fill at both ends and reaches the live light', () => {
    expect(FIRST_PERSON_VIEWMODEL_FILL_INTENSITY).toBeLessThanOrEqual(6);
    expect(FIRST_PERSON_VIEWMODEL_FILL_INTENSITY).toBeGreaterThanOrEqual(3);

    const lit = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), false);
    const fill = lit.root.children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
        && child.name === 'first-person-viewmodel-fill',
    );
    expect(fill).toBeDefined();
    expect(fill!.userData.authoredIntensity).toBe(FIRST_PERSON_VIEWMODEL_FILL_INTENSITY);
    expect(fill!.decay).toBe(2);

    // The reduced path is the one place this light is meant to be absent.
    const reduced = new WeaponPresentation(new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250), true);
    const reducedFill = reduced.root.children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
        && child.name === 'first-person-viewmodel-fill',
    );
    expect(reducedFill!.userData.authoredIntensity).toBe(0);
  });
});
