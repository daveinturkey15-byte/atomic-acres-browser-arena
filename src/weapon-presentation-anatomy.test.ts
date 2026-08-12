import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_ARM_PROPORTION_CONTRACT,
  FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC,
  FIRST_PERSON_ARM_TRANSVERSE_SCALE,
  FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT,
  FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT,
  FIRST_PERSON_NEAR_PLANE_CONTACT_RETREAT_CONTRACT,
  HIP_VIEWMODEL_POSITION,
  HIP_VIEWMODEL_SCALE,
  VIEWMODEL_NEAR_PLANE_CLEARANCE,
  WeaponPresentation,
  authoredNearPlaneContactRetreat,
} from './weapon-presentation';
import {
  VIEWMODEL_CONTACT_PROFILES,
  VIEWMODEL_CONTACT_RESPONSE_CONTRACT,
  viewmodelContactResponse,
} from './weapon-presentation-state';
import { WEAPON_IDS, type WeaponId } from './protocol';

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
    expect(presentation.root.position.toArray()).toEqual([
      HIP_VIEWMODEL_POSITION.x,
      HIP_VIEWMODEL_POSITION.y + contact.additionalLiftMeters - contact.additionalDropMeters,
      HIP_VIEWMODEL_POSITION.z + surfaceRetreat - VIEWMODEL_NEAR_PLANE_CLEARANCE
        - authoredNearPlaneContactRetreat('minigun', surfaceRetreat),
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
          surfaceLift: 0.2,
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
  });

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
      for (let frame = 0; frame < 150; frame += 1) {
        presentation.update({ ...REST_POSE, surfaceRetreat: 0.7, surfaceLift: 0 });
      }
      camera.updateMatrixWorld(true);
      const priorCapBounds = new THREE.Box3().setFromObject(mountedModel)
        .union(new THREE.Box3().setFromObject(arms!));

      for (let frame = 0; frame < 150; frame += 1) {
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

      for (let frame = 0; frame < 150; frame += 1) {
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
      expect(state.armFraming?.ndcMin[1], `${weapon}: arms terminate inside viewport`).toBeLessThan(-1.2);
      expect(state.weaponFraming?.nearPlaneClear, weapon).toBe(true);
      expect(state.armFraming?.nearPlaneClear, weapon).toBe(true);
      expect(state.contactResponse.aimAuthority, weapon).toBe('camera-forward-unchanged');

      presentation.fire(0.02);
      presentation.setFireCaptureAgeMs(0);
      for (let frame = 0; frame < 90; frame += 1) {
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
        for (let frame = 0; frame < 90; frame += 1) {
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

  it('thickens authored arm bones without shortening reach and crops both shoulders below the viewport', () => {
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
      applyRiggedArmMuscleProportions(): void;
      placeRiggedShoulderEntryBelowFrame(
        arm: typeof rig,
        cameraRotation: THREE.Quaternion,
      ): Readonly<{ ndc: readonly [number, number, number]; displacementMeters: number }>;
    };
    privatePresentation.riggedArmRigs.push(rig);
    camera.updateMatrixWorld(true);
    const bindReach = shoulder.getWorldPosition(new THREE.Vector3())
      .distanceTo(wrist.getWorldPosition(new THREE.Vector3()));

    privatePresentation.applyRiggedArmMuscleProportions();
    camera.updateMatrixWorld(true);
    expect(shoulder.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.upperArm,
      1,
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.upperArm,
    ]);
    expect(elbow.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.forearmAbsolute,
      1,
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.forearmAbsolute,
    ]);
    expect(wrist.getWorldScale(new THREE.Vector3()).toArray()).toEqual([
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.wristAbsolute,
      1,
      FIRST_PERSON_ARM_TRANSVERSE_SCALE.wristAbsolute,
    ]);
    expect(shoulder.getWorldPosition(new THREE.Vector3())
      .distanceTo(wrist.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(bindReach, 8);
    expect(FIRST_PERSON_ARM_PROPORTION_CONTRACT).toBe('authored-muscular-transverse-bone-profile-v1');

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
      expect(crop.ndc[1], scenario.name).toBeLessThanOrEqual(FIRST_PERSON_ARM_SHOULDER_ENTRY_NDC.right);
      expect(crop.displacementMeters, scenario.name).toBeGreaterThan(0);
    }
    expect(FIRST_PERSON_ARM_VIEWPORT_ENTRY_CONTRACT).toBe('both-shoulders-below-minus-1.20-ndc-v1');
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
