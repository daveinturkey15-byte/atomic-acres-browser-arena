import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  HUNTER_DRONE_ASSET,
  SUPPORT_VEHICLE_ASSETS,
  KillstreakPresentation,
  hunterDronePresentationTelemetry,
  supportAircraftPresentationVariant,
  supportVehiclePresentationTelemetry,
} from './killstreak-presentation';
import type { KillstreakImpactEvent, KillstreakRecipientSnapshot } from './killstreak-runtime';
import { DRONE_GUN_PROFILE_ID } from './killstreak-support-catalog';
import { SUPPORT_VEHICLE_PRESENTATION_CONTRACT, missingSupportNodes, supportForwardAlignment } from './support-vehicle-presentation-contract';

const snapshot = (
  count: number,
  sensorContacts: KillstreakRecipientSnapshot['sensorContacts'] = [],
  placementMarkers: KillstreakRecipientSnapshot['placementMarkers'] = [],
): KillstreakRecipientSnapshot => ({
  schemaVersion: 1,
  matchEpoch: 1,
  revision: 1,
  actors: [],
  entities: Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'ks-1-chopper-1'
      : index === 1 ? 'ks-1-care-aircraft-2'
        : index === 2 ? 'ks-1-care-3'
          : `ks-1-swarm-drone-${index + 1}`,
    activationId: `activation-${index + 1}`,
    ownerId: 'owner',
    team: 0,
    kind: index === 0 ? 'chopper' : index === 1 ? 'aircraft' : index === 2 ? 'care-crate' : 'drone',
    mode: index <= 2 ? null : 'swarm',
    phase: 'active',
    position: [index, 4, 0],
    velocity: [1, 0, 0],
    attitude: [0.02, Math.PI / 2, -0.04],
    health: 50,
    expiresInMs: 10_000,
    magazine: index <= 2 ? null : 20,
    reserveClips: null,
    gunProfileId: index <= 2 ? null : DRONE_GUN_PROFILE_ID,
    gunController: index === 0 ? 'ai' : null,
    captureActorId: null,
    captureProgress: null,
    revealedReward: null,
    revision: 1,
  })),
  sensorContacts,
  placementMarkers,
});

const carpetImpacts = (count: number, phase: KillstreakImpactEvent['phase'] = 'impact'): readonly KillstreakImpactEvent[] => Array.from(
  { length: count },
  (_, ordinal): KillstreakImpactEvent => ({
    activationId: 'ks-carpet-pool-test',
    source: 'carpet-bomber',
    ordinal,
    phase,
    position: [ordinal * 0.5, 0, ordinal * -0.25],
    impactAtMs: 1_000,
    atMs: phase === 'drop' ? 580 : 1_000,
  }),
);

describe('killstreak presentation', () => {
  it('binds the runtime presentation loader to the gated authored Hunter Drone LOD0', () => {
    expect(HUNTER_DRONE_ASSET).toBe('./assets/original/models/support/hunter-drone-lod0.glb');
    expect(hunterDronePresentationTelemetry()).toMatchObject({ state: 'idle', asset: HUNTER_DRONE_ASSET });
  });

  it('pins the exact authored chopper, Care, Carpet, and parachute-crate LOD set', () => {
    expect(SUPPORT_VEHICLE_ASSETS).toEqual({
      chopper: [
        './assets/original/models/support/pass65-chopper-gunner-lod0.glb',
        './assets/original/models/support/pass65-chopper-gunner-lod1.glb',
        './assets/original/models/support/pass65-chopper-gunner-lod2.glb',
      ],
      care: [
        './assets/original/models/support/pass65-care-aircraft-lod0.glb',
        './assets/original/models/support/pass65-care-aircraft-lod1.glb',
        './assets/original/models/support/pass65-care-aircraft-lod2.glb',
      ],
      carpet: [
        './assets/original/models/support/pass65-carpet-aircraft-lod0.glb',
        './assets/original/models/support/pass65-carpet-aircraft-lod1.glb',
        './assets/original/models/support/pass65-carpet-aircraft-lod2.glb',
      ],
      crate: [
        './assets/original/models/support/pass65-care-crate-lod0.glb',
        './assets/original/models/support/pass65-care-crate-lod1.glb',
      ],
    });
    expect(supportVehiclePresentationTelemetry()).toMatchObject({
      state: 'idle', loadedAssets: [], readyFamilies: [], maxConcurrentDecodes: 2,
    });
    expect(supportAircraftPresentationVariant('ks-9-care-aircraft-12')).toBe('care');
    expect(supportAircraftPresentationVariant('ks-9-carpet-aircraft-13')).toBe('carpet');
    expect(supportAircraftPresentationVariant('malformed-aircraft')).toBeNull();
  });

  it('GPU-prewarms every bounded resource family once and restores exact pooled state', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera();
    const chopper = presentation.root.getObjectByName('prewarmed-chopper-1') as THREE.Group;
    const chopperChild = chopper.getObjectByName('chopper-first-person-rotor')!;
    const chopperFuselage = chopper.getObjectByName('chopper-fuselage')!;
    const dashboard = chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh;
    const dashboardMaterial = dashboard.material as THREE.Material;
    chopper.scale.set(2, 3, 4);
    chopper.frustumCulled = true;
    chopperChild.visible = false;
    chopperChild.frustumCulled = true;
    const lod = new THREE.LOD();
    lod.name = 'prewarm-test-authored-lod';
    const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const lod1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    lod0.visible = false;
    lod1.visible = true;
    lod.addLevel(lod0, 0);
    lod.addLevel(lod1, 20);
    lod.autoUpdate = true;
    chopper.add(lod);
    const telemetryBefore = presentation.telemetry();
    let compilePass = 0;
    const compileAndRender = vi.fn(async (root: THREE.Object3D, stagedCamera: THREE.Camera, parentScene: THREE.Scene) => {
      compilePass += 1;
      expect(root).toBe(presentation.root);
      expect(stagedCamera).toBe(camera);
      expect(parentScene).toBe(scene);
      expect(chopper.visible).toBe(true);
      expect(chopper.scale.toArray()).toEqual([2, 3, 4]);
      expect(chopper.frustumCulled).toBe(false);
      expect(chopperChild.visible).toBe(true);
      expect(chopperChild.frustumCulled).toBe(false);
      expect(presentation.root.getObjectByName('prewarmed-swarm-drone-1')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('prewarmed-swarm-drone-2')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('prewarmed-swarm-drone-24')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('pass65-impact-flash-pool-20')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('pass65-bomb-shell-pool-20')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('pass65-ember-pool-120')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('piloted-drone-hostile-sensor-16')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('prewarmed-support-placement-ground-x')?.visible).toBe(true);
      expect(presentation.root.getObjectByName('prewarmed-support-placement-corridor')?.visible).toBe(true);
      if (compilePass === 1) {
        expect(lod.autoUpdate).toBe(false);
        expect(lod0.visible).toBe(true);
        expect(lod1.visible).toBe(true);
        expect(chopperFuselage.visible).toBe(true);
        expect(dashboardMaterial.depthWrite).toBe(true);
      } else {
        expect(chopperFuselage.visible).toBe(false);
        expect(dashboard.visible).toBe(true);
        expect(dashboardMaterial.depthWrite).toBe(false);
      }
    });
    await Promise.all([
      presentation.prewarm({ compileAndRender }, camera),
      presentation.prewarm({ compileAndRender }, camera),
    ]);
    await presentation.prewarm({ compileAndRender }, camera);
    expect(compileAndRender).toHaveBeenCalledTimes(2);
    expect(chopper.visible).toBe(false);
    expect(chopper.scale.toArray()).toEqual([2, 3, 4]);
    expect(chopper.frustumCulled).toBe(true);
    expect(chopperChild.visible).toBe(false);
    expect(chopperChild.frustumCulled).toBe(true);
    expect(lod.autoUpdate).toBe(true);
    expect(lod0.visible).toBe(false);
    expect(lod1.visible).toBe(true);
    expect(dashboardMaterial.depthWrite).toBe(true);
    expect(presentation.root.getObjectByName('prewarmed-support-placement-ground-x')).toBeUndefined();
    expect(presentation.root.getObjectByName('prewarmed-support-placement-corridor')).toBeUndefined();
    expect(presentation.telemetry()).toEqual(telemetryBefore);
    presentation.dispose();
  });

  it('restores failed prewarm state and invalidates the GPU receipt when the authored pool is rebuilt', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera();
    const chopper = presentation.root.getObjectByName('prewarmed-chopper-1')!;
    const originalScale = chopper.scale.toArray();
    const failedRuntime = { compileAndRender: vi.fn(async () => { throw new Error('compile failed'); }) };
    await expect(presentation.prewarm(failedRuntime, camera)).rejects.toThrow('compile failed');
    expect(chopper.visible).toBe(false);
    expect(chopper.scale.toArray()).toEqual(originalScale);

    let releasePrewarm!: () => void;
    let compilePass = 0;
    const blockedRuntime = {
      compileAndRender: vi.fn(() => {
        compilePass += 1;
        if (compilePass > 1) return Promise.resolve();
        return new Promise<void>((resolve) => { releasePrewarm = resolve; });
      }),
    };
    const inFlight = presentation.prewarm(blockedRuntime, camera);
    expect(() => presentation.prewarmAuthoredAssets()).toThrow('during GPU prewarm');
    releasePrewarm();
    await inFlight;

    presentation.prewarmAuthoredAssets();
    const rebuiltRuntime = { compileAndRender: vi.fn(async () => undefined) };
    await presentation.prewarm(rebuiltRuntime, camera);
    expect(rebuiltRuntime.compileAndRender).toHaveBeenCalledTimes(2);
    presentation.dispose();
    await expect(presentation.prewarm(rebuiltRuntime, camera)).rejects.toThrow('disposed');
  });

  it('defers terminal disposal until an active GPU prewarm settles', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera();
    const chopper = presentation.root.getObjectByName('prewarmed-chopper-1')!;
    const originalScale = chopper.scale.toArray();
    let releasePrewarm!: () => void;
    let compilePass = 0;
    const runtime = {
      compileAndRender: vi.fn(() => {
        compilePass += 1;
        if (compilePass > 1) return Promise.resolve();
        return new Promise<void>((resolve) => { releasePrewarm = resolve; });
      }),
    };
    const inFlight = presentation.prewarm(runtime, camera);
    expect(chopper.scale.toArray()).toEqual(originalScale);
    presentation.dispose();
    expect(presentation.root.parent).toBe(scene);
    releasePrewarm();
    await inFlight;
    await Promise.resolve();
    expect(presentation.root.parent).toBeNull();
    expect(chopper.parent).toBeNull();
    expect(chopper.scale.toArray()).toEqual(originalScale);
    await expect(presentation.prewarm(runtime, camera)).rejects.toThrow('disposed');
  });

  it('renders a sleek chopper/care/drone vocabulary and retires stale entities', () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    presentation.sync(snapshot(4), 1_000);
    expect(presentation.telemetry()).toEqual({
      entities: 4,
      impactFlashes: 0,
      bombShells: 0,
      emberParticles: 0,
      sensorContacts: 0,
      placementMarkers: 0,
      prewarmed: 6,
      pooledEntityInstances: 29,
      pooledSwarmDrones: 24,
      prewarmedAuthoredSupportFamilies: [],
      markerDetails: [],
      bounded: true,
    });
    expect(presentation.root.getObjectByName('chopper-sleek-cockpit-canopy')).toBeDefined();
    expect(presentation.root.getObjectByName('pass65-care-package-aircraft')).toBeDefined();
    expect(presentation.root.getObjectByName('care-package-parachute')).toBeDefined();
    expect(presentation.root.getObjectByName('pass65-swarm-drone')).toBeDefined();
    const chopper = presentation.root.getObjectByName('pass65-chopper-gunner') as THREE.Group;
    const drone = presentation.root.getObjectByName('pass65-swarm-drone') as THREE.Group;
    const aircraft = presentation.root.getObjectByName('pass65-care-package-aircraft') as THREE.Group;
    expect(chopper.rotation.x).toBeCloseTo(0.02);
    expect(chopper.rotation.z).toBeCloseTo(-0.04);
    expect(missingSupportNodes(chopper, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredNodes)).toEqual([]);
    expect(missingSupportNodes(drone, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes)).toEqual([]);
    expect(missingSupportNodes(aircraft, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.aircraft.requiredNodes)).toEqual([]);
    expect(supportForwardAlignment(chopper, 'chopper-player-gun', 'chopper-gun-muzzle-socket')).toBeCloseTo(1, 6);
    expect(supportForwardAlignment(drone, 'drone-gun-receiver', 'drone-gun-muzzle-socket')).toBeCloseTo(1, 6);
    expect(supportForwardAlignment(aircraft, 'care-aircraft-fuselage', 'care-aircraft-forward-socket')).toBeCloseTo(1, 6);
    expect(presentation.firstPersonCameraAnchor('ks-1-chopper-1')).not.toBeNull();
    const dashboardMaterial = (chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh)
      .material as THREE.Material;
    const dashboardBaseDepthWrite = dashboardMaterial.depthWrite;
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    expect(chopper.visible).toBe(true);
    expect((chopper.getObjectByName('chopper-fuselage') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-display-cyan') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-first-person-rotor-blade-a') as THREE.Mesh).visible).toBe(true);
    expect(dashboardMaterial.depthWrite).toBe(false);
    const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.8, 0, 'YXZ'));
    presentation.alignFirstPersonCockpit('ks-1-chopper-1', cameraQuaternion);
    const cockpitWorldQuaternion = chopper.getObjectByName('chopper-first-person-cockpit')!
      .getWorldQuaternion(new THREE.Quaternion());
    expect(cockpitWorldQuaternion.angleTo(cameraQuaternion)).toBeLessThan(1e-6);
    presentation.setFirstPersonEntity(null);
    expect(chopper.visible).toBe(true);
    expect((chopper.getObjectByName('chopper-fuselage') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-first-person-rotor-blade-a') as THREE.Mesh).visible).toBe(false);
    expect(dashboardMaterial.depthWrite).toBe(dashboardBaseDepthWrite);
    const carePackage = presentation.root.getObjectByName('pass65-care-package') as THREE.Group;
    expect(carePackage.userData).toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    expect(carePackage.getObjectByName('care-package-crate')!.userData)
      .toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    presentation.sync(snapshot(0), 1_100);
    expect(presentation.telemetry().entities).toBe(0);
    presentation.dispose();
    expect(scene.getObjectByName('pass65-killstreak-presentations')).toBeUndefined();
  });

  it('applies a retained first-person entity ID when that entity arrives later', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    presentation.sync(snapshot(1), 1_000);
    const chopper = presentation.entityRoot('ks-1-chopper-1')!;
    const fuselage = chopper.getObjectByName('chopper-fuselage') as THREE.Mesh;
    const dashboard = chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh;
    const dashboardMaterial = dashboard.material as THREE.Material;
    expect(fuselage.visible).toBe(false);
    expect(dashboard.visible).toBe(true);
    expect(dashboardMaterial.depthWrite).toBe(false);
    presentation.setFirstPersonEntity(null);
    expect(fuselage.visible).toBe(true);
    expect(dashboardMaterial.depthWrite).toBe(true);
    presentation.dispose();
  });

  it('does not overwrite dynamic support visibility while applying third-person state', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const descending = snapshot(3);
    presentation.sync({
      ...descending,
      entities: descending.entities.map((entity) => (
        entity.kind === 'care-crate' ? { ...entity, phase: 'descending' as const } : entity
      )),
    }, 1_000);
    const parachute = presentation.entityRoot('ks-1-care-3')!.getObjectByName('care-package-parachute')!;
    expect(parachute.visible).toBe(true);
    presentation.sync(snapshot(3), 1_100);
    expect(parachute.visible).toBe(false);
    presentation.dispose();
  });

  it('uses the exact same visual and gun family for standalone and swarm drones', () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const swarmSnapshot = snapshot(4);
    const droneEntity = swarmSnapshot.entities[3]!;
    presentation.sync({ ...swarmSnapshot, entities: [{ ...droneEntity, id: 'standalone', mode: 'piloted' }] }, 1_000);
    const standalone = presentation.root.getObjectByName('pass65-piloted-drone') as THREE.Group;
    expect(standalone.userData).toMatchObject({
      presentationFamilyId: 'hunter-drone-visual-family-v1',
      gunProfileId: DRONE_GUN_PROFILE_ID,
    });
    expect(standalone.getObjectByName('drone-mounted-gun')).toBeDefined();
    presentation.sync({ ...swarmSnapshot, entities: [{ ...droneEntity, id: 'swarm', mode: 'swarm' }] }, 1_016);
    const swarm = presentation.root.getObjectByName('pass65-swarm-drone') as THREE.Group;
    expect(swarm.userData.presentationFamilyId).toBe(standalone.userData.presentationFamilyId);
    expect(swarm.userData.gunProfileId).toBe(standalone.userData.gunProfileId);
    expect(swarm.getObjectByName('drone-mounted-gun')).toBeDefined();
    presentation.dispose();
  });

  it('renders only host-admitted piloted-drone sensor contacts through depth', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.sync(snapshot(1, [{
      id: 'enemy', kind: 'player', team: 1, lifeId: 3, position: [4, 1.7, 8], relation: 'hostile', throughWall: true,
    }]), 1_000);
    expect(presentation.telemetry().sensorContacts).toBe(1);
    const silhouette = presentation.root.getObjectByName('piloted-drone-hostile-sensor-1') as THREE.Group;
    expect(silhouette.visible).toBe(true);
    expect(silhouette.userData).toMatchObject({ contactId: 'enemy', relation: 'hostile', throughWall: true });
    const material = (silhouette.getObjectByName('drone-sensor-head') as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(material.depthTest).toBe(false);
    presentation.dispose();
  });

  it('caps malformed presentation storms at the authority snapshot bound', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.sync(snapshot(40), 1_000);
    expect(presentation.telemetry()).toMatchObject({ entities: 32, bounded: true });
    presentation.dispose();
  });

  it('reuses deterministic bounded impact pools without per-impact GPU resource creation', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const flashPool = presentation.root.getObjectByName('pass65-impact-flash-pool') as THREE.Group;
    const shellPool = presentation.root.getObjectByName('pass65-bomb-shell-pool') as THREE.Group;
    const emberPool = presentation.root.getObjectByName('pass65-ember-pool') as THREE.Group;
    expect(flashPool.children).toHaveLength(20);
    expect(shellPool.children).toHaveLength(20);
    expect(emberPool.children).toHaveLength(120);
    const pooledResources = [...flashPool.children, ...shellPool.children, ...emberPool.children]
      .map((node) => {
        const mesh = node as THREE.Mesh;
        return { mesh, geometry: mesh.geometry, material: mesh.material };
      });

    const impacts = carpetImpacts(40);
    presentation.presentImpacts(carpetImpacts(20, 'drop'), 1_000);
    presentation.presentImpacts(impacts, 1_000);
    expect(presentation.telemetry()).toMatchObject({
      impactFlashes: 20,
      bombShells: 20,
      emberParticles: 120,
      bounded: true,
    });
    presentation.sync(snapshot(0), 1_100);
    const firstTrajectory = emberPool.children.slice(0, 6).map((node) => node.position.toArray());
    presentation.sync(snapshot(0), 1_801);
    expect(presentation.telemetry()).toMatchObject({ impactFlashes: 0, bombShells: 0, emberParticles: 0 });

    presentation.presentImpacts(carpetImpacts(20, 'drop'), 2_000);
    presentation.presentImpacts(impacts, 2_000);
    presentation.sync(snapshot(0), 2_100);
    const repeatedTrajectory = emberPool.children.slice(0, 6).map((node) => node.position.toArray());
    expect(repeatedTrajectory).toEqual(firstTrajectory);
    for (const [index, resource] of pooledResources.entries()) {
      const mesh = [...flashPool.children, ...shellPool.children, ...emberPool.children][index] as THREE.Mesh;
      expect(mesh).toBe(resource.mesh);
      expect(mesh.geometry).toBe(resource.geometry);
      expect(mesh.material).toBe(resource.material);
    }
    presentation.dispose();
  });

  it('preserves the authored 420ms fall after delayed drop delivery', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const shellPool = presentation.root.getObjectByName('pass65-bomb-shell-pool') as THREE.Group;
    const delayedDrop = [{
      activationId: 'ks-carpet-delayed', source: 'carpet-bomber' as const, ordinal: 0, phase: 'drop' as const,
      position: [2, 0, -3] as const, atMs: 1_080, impactAtMs: 1_500,
    }];
    presentation.presentImpacts(delayedDrop, 1_200);
    const shell = shellPool.children[0]!;
    const startY = shell.position.y;
    presentation.sync(snapshot(0), 1_350);
    expect(shell.visible).toBe(true);
    expect(shell.position.y).toBeLessThan(startY);
    expect(shell.position.y).toBeGreaterThan(0.35);
    presentation.sync(snapshot(0), 1_619);
    expect(shell.visible).toBe(true);
    presentation.sync(snapshot(0), 1_620);
    expect(shell.visible).toBe(false);
    presentation.dispose();
  });

  it('uses the clock-invariant 420ms event delta for both positive and negative unmapped clock offsets', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const shellPool = presentation.root.getObjectByName('pass65-bomb-shell-pool') as THREE.Group;
    presentation.presentImpacts([{
      activationId: 'ks-carpet-offset-domain', source: 'carpet-bomber', ordinal: 0, phase: 'drop',
      position: [0, 0, 0], atMs: 5_000, impactAtMs: 5_420,
    }], 2_000);
    const shell = shellPool.children[0]!;
    presentation.sync(snapshot(0), 2_419);
    expect(shell.visible).toBe(true);
    presentation.sync(snapshot(0), 2_420);
    expect(shell.visible).toBe(false);
    presentation.presentImpacts([{
      activationId: 'ks-carpet-negative-offset', source: 'carpet-bomber', ordinal: 1, phase: 'drop',
      position: [0, 0, 0], atMs: -1_000, impactAtMs: -580,
    }], 3_000);
    presentation.sync(snapshot(0), 3_419);
    expect(shell.visible).toBe(true);
    presentation.sync(snapshot(0), 3_420);
    expect(shell.visible).toBe(false);
    presentation.dispose();
  });

  it('keeps impact pools through clear and retires each pool exactly once on dispose', () => {
    const retired: THREE.Object3D[] = [];
    const presentation = new KillstreakPresentation(new THREE.Scene(), (root) => {
      retired.push(root);
      root.removeFromParent();
    });
    const flashPool = presentation.root.getObjectByName('pass65-impact-flash-pool') as THREE.Group;
    const shellPool = presentation.root.getObjectByName('pass65-bomb-shell-pool') as THREE.Group;
    const emberPool = presentation.root.getObjectByName('pass65-ember-pool') as THREE.Group;
    presentation.presentImpacts(carpetImpacts(20, 'drop'), 1_000);
    presentation.presentImpacts(carpetImpacts(20), 1_000);
    presentation.clear();
    expect(retired).not.toContain(flashPool);
    expect(retired).not.toContain(shellPool);
    expect(retired).not.toContain(emberPool);
    expect([...flashPool.children, ...shellPool.children, ...emberPool.children].every((node) => !node.visible)).toBe(true);
    presentation.dispose();
    presentation.dispose();
    expect(retired.filter((root) => root === flashPool)).toHaveLength(1);
    expect(retired.filter((root) => root === shellPool)).toHaveLength(1);
    expect(retired.filter((root) => root === emberPool)).toHaveLength(1);
  });

  it('presents host-admitted ground X markers to peers and the carpet corridor only when supplied to its owner', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.sync(snapshot(0, [], [{
      id: 'ks-activation-7-1:carpet-target', activationId: 'ks-activation-7-1', source: 'carpet-bomber', shape: 'ground-x',
      ownerId: 'owner', team: 0, audience: 'all-combatants', anchor: [2, 0, 3], pathStart: null, pathEnd: null, halfWidthM: null, expiresInMs: 900,
    }, {
      id: 'ks-activation-7-1:carpet-corridor', activationId: 'ks-activation-7-1', source: 'carpet-bomber', shape: 'corridor',
      ownerId: 'owner', team: 0, audience: 'owner-only', anchor: [2, 0, 3], pathStart: [-15, 0, -8], pathEnd: [18, 0, 12], halfWidthM: 6.25, expiresInMs: 900,
    }]), 1_000);
    const telemetry = presentation.telemetry();
    expect(telemetry.placementMarkers).toBe(2);
    expect(telemetry.markerDetails).toEqual([
      expect.objectContaining({
        id: 'ks-activation-7-1:carpet-corridor',
        activationId: 'ks-activation-7-1',
        source: 'carpet-bomber',
        shape: 'corridor',
        audience: 'owner-only',
        anchor: [2, 0, 3],
        pathStart: [-15, 0, -8],
        pathEnd: [18, 0, 12],
        halfWidthM: 6.25,
        colourHexes: ['#ff253f'],
        depthTest: true,
        writesDepth: false,
        maximumOpacity: 0.84,
        raycastDisabled: true,
        visible: true,
      }),
      expect.objectContaining({
        id: 'ks-activation-7-1:carpet-target',
        activationId: 'ks-activation-7-1',
        source: 'carpet-bomber',
        shape: 'ground-x',
        audience: 'all-combatants',
        anchor: [2, 0, 3],
        halfWidthM: null,
        worldPosition: [2, 0.055, 3],
        colourHexes: ['#ff253f'],
        depthTest: true,
        writesDepth: false,
        maximumOpacity: 0.88,
        raycastDisabled: true,
        visible: true,
      }),
    ]);
    expect(telemetry.markerDetails[0]?.corridorLengthM).toBeCloseTo(Math.hypot(33, 20));
    const targetBounds = telemetry.markerDetails[1]!.worldBounds;
    expect(targetBounds.max[0]! - targetBounds.min[0]!).toBeGreaterThan(5);
    expect(targetBounds.max[2]! - targetBounds.min[2]!).toBeGreaterThan(5);
    expect(presentation.root.getObjectByName('support-placement-ground-x')?.userData.audience).toBe('all-combatants');
    const corridorFill = presentation.root.getObjectByName('carpet-bomber-flight-corridor') as THREE.Mesh;
    expect((corridorFill.material as THREE.MeshBasicMaterial).opacity).toBe(0.1);
    expect((corridorFill.material as THREE.MeshBasicMaterial).depthTest).toBe(true);
    expect((corridorFill.material as THREE.MeshBasicMaterial).depthWrite).toBe(false);
    expect(presentation.root.getObjectByName('carpet-bomber-flight-corridor-left-edge')).toBeDefined();
    expect(presentation.root.getObjectByName('carpet-bomber-flight-corridor-right-edge')).toBeDefined();
    // A stale network snapshot cannot keep a marker alive after its local
    // deadline; no later host snapshot is required for teardown.
    presentation.sync(snapshot(0, [], [{
      id: 'ks-activation-7-1:carpet-target', activationId: 'ks-activation-7-1', source: 'carpet-bomber', shape: 'ground-x',
      ownerId: 'owner', team: 0, audience: 'all-combatants', anchor: [2, 0, 3], pathStart: null, pathEnd: null, halfWidthM: null, expiresInMs: 900,
    }, {
      id: 'ks-activation-7-1:carpet-corridor', activationId: 'ks-activation-7-1', source: 'carpet-bomber', shape: 'corridor',
      ownerId: 'owner', team: 0, audience: 'owner-only', anchor: [2, 0, 3], pathStart: [-15, 0, -8], pathEnd: [18, 0, 12], halfWidthM: 6.25, expiresInMs: 900,
    }]), 2_000);
    expect(presentation.telemetry().placementMarkers).toBe(0);
    presentation.sync({ ...snapshot(0, [], [{
      id: 'care:target', activationId: 'care', source: 'care-package', shape: 'ground-x',
      ownerId: 'owner', team: 0, audience: 'all-combatants', anchor: [0, 0, 0], pathStart: null, pathEnd: null, halfWidthM: null, expiresInMs: 900,
    }]), revision: 2 }, 2_001);
    expect(presentation.telemetry().placementMarkers).toBe(1);
    presentation.clear();
    expect(presentation.telemetry()).toMatchObject({ placementMarkers: 0, markerDetails: [] });
    presentation.dispose();
  });
});
