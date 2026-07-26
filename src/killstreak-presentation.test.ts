import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HUNTER_DRONE_ASSET, KillstreakPresentation, hunterDronePresentationTelemetry } from './killstreak-presentation';
import type { KillstreakRecipientSnapshot } from './killstreak-runtime';
import { DRONE_GUN_PROFILE_ID } from './killstreak-support-catalog';
import { SUPPORT_VEHICLE_PRESENTATION_CONTRACT, missingSupportNodes, supportForwardAlignment } from './support-vehicle-presentation-contract';

const snapshot = (count: number, sensorContacts: KillstreakRecipientSnapshot['sensorContacts'] = []): KillstreakRecipientSnapshot => ({
  schemaVersion: 1,
  matchEpoch: 1,
  revision: 1,
  actors: [],
  entities: Array.from({ length: count }, (_, index) => ({
    id: `ks-1-swarm-drone-${index + 1}`,
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
    captureProgress: null,
    revealedReward: null,
    revision: 1,
  })),
  sensorContacts,
});

describe('killstreak presentation', () => {
  it('binds the runtime presentation loader to the gated authored Hunter Drone LOD0', () => {
    expect(HUNTER_DRONE_ASSET).toBe('./assets/original/models/support/hunter-drone-lod0.glb');
    expect(hunterDronePresentationTelemetry()).toMatchObject({ state: 'idle', asset: HUNTER_DRONE_ASSET });
  });

  it('renders a sleek chopper/care/drone vocabulary and retires stale entities', () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    presentation.sync(snapshot(4), 1_000);
    expect(presentation.telemetry()).toEqual({ entities: 4, impactFlashes: 0, sensorContacts: 0, bounded: true });
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
    const carePackage = presentation.root.getObjectByName('pass65-care-package') as THREE.Group;
    expect(carePackage.userData).toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    expect(carePackage.getObjectByName('care-package-crate')!.userData)
      .toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    presentation.sync(snapshot(0), 1_100);
    expect(presentation.telemetry().entities).toBe(0);
    presentation.dispose();
    expect(scene.getObjectByName('pass65-killstreak-presentations')).toBeUndefined();
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
});
