import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RAILGUN_BOLT_PRESENTATION, RailgunPresentation } from './railgun-presentation';
import { createRailgunBeamAuthority, type RailgunAuthorityState, type RailgunShotResultMessage } from './railgun-authority';

vi.mock('./art-kit', () => ({
  buildWeaponModel: () => {
    const root = new THREE.Group();
    root.userData.weaponModelId = 'railgun-test-model';
    return root;
  },
}));

class FakeElement {
  hidden = false;
  className = '';
  dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  readonly style = {
    left: '',
    top: '',
    setProperty: (_name: string, _value: string) => undefined,
  };

  append(child: FakeElement): void { this.children.push(child); }
  get childElementCount(): number { return this.children.length; }
}

describe('railgun presentation', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: () => new FakeElement() }));
  afterEach(() => vi.unstubAllGlobals());

  it('presents only a host-accepted identity on its exact authoritative ray and derives depth bypass from the live materials', () => {
    const scene = new THREE.Scene();
    const presentation = new RailgunPresentation(scene, new FakeElement() as unknown as HTMLElement, true);
    const authority = createRailgunBeamAuthority(3, 'shot-authority-0001', [3, 2, 7], [0.6, 0, -0.8]);
    const accepted: RailgunShotResultMessage = {
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'shooter', generation: 3,
      shotId: authority.shotId, status: 'accepted-hit', reason: 'accepted', outcomes: [
        { target: 'near', damageRequested: 50, damageApplied: 50, resultingHealth: 50, died: false, distanceMeters: 12 },
        { target: 'middle', damageRequested: 50, damageApplied: 40, resultingHealth: 0, died: true, distanceMeters: 24 },
        { target: 'far', damageRequested: 50, damageApplied: 10, resultingHealth: 0, died: true, distanceMeters: 36 },
      ], beam: authority, nonce: 1,
    };
    expect(presentation.presentAcceptedResult(accepted, 1_000)).toBe(true);
    expect(presentation.presentAcceptedResult(accepted, 1_001)).toBe(false);
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 1, beamPresentations: 1 });
    const beam = scene.getObjectByName('railgun-massive-beam-1') as THREE.Group;
    expect(beam.visible).toBe(true);
    const core = beam.getObjectByName('railgun-beam-core') as THREE.Mesh;
    const bloom = beam.getObjectByName('railgun-beam-bloom') as THREE.Mesh;
    const shock = beam.getObjectByName('railgun-beam-shock-sheath') as THREE.Mesh;
    const filaments = beam.getObjectByName('railgun-beam-energy-filaments') as THREE.Group;
    const launch = beam.getObjectByName('railgun-launch-origin') as THREE.Group;
    const launchCore = launch.getObjectByName('railgun-launch-core') as THREE.Mesh;
    const launchBridge = launch.getObjectByName('railgun-launch-bridge') as THREE.Mesh;
    expect(core.scale).toMatchObject({ x: RAILGUN_BOLT_PRESENTATION.coreRadiusM, y: 180 });
    expect(bloom.scale).toMatchObject({ x: RAILGUN_BOLT_PRESENTATION.haloRadiusM, y: 180 });
    expect(shock.scale).toMatchObject({ x: RAILGUN_BOLT_PRESENTATION.shockRadiusM, y: 180 });
    expect(filaments.children).toHaveLength(RAILGUN_BOLT_PRESENTATION.filamentCount);
    expect(launch.visible).toBe(true);
    expect(launch.position.y).toBeCloseTo(-RAILGUN_BOLT_PRESENTATION.minimumLengthM * 0.5, 6);
    expect(launch.children.filter((child) => child.name.startsWith('railgun-launch-spark-'))).toHaveLength(
      RAILGUN_BOLT_PRESENTATION.launchSparkCount,
    );
    expect(launchBridge.visible).toBe(false);
    expect((launchCore.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((core.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((bloom.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((core.material as THREE.MeshBasicMaterial).side).toBe(THREE.FrontSide);
    expect((bloom.material as THREE.MeshBasicMaterial).side).toBe(THREE.FrontSide);
    const expectedDirection = new THREE.Vector3(...authority.end).sub(new THREE.Vector3(...authority.start)).normalize();
    const renderedDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(beam.quaternion).normalize();
    expect(renderedDirection.distanceTo(expectedDirection)).toBeLessThan(1e-6);
    expect(beam.position.distanceTo(new THREE.Vector3(...authority.start).add(new THREE.Vector3(...authority.end)).multiplyScalar(0.5))).toBeLessThan(1e-6);
    expect(presentation.telemetry()).toMatchObject({
      lastBeamLengthM: 180,
      visibleDurationMs: 1_000,
      shockRadiusM: 1.6,
      filamentCount: 3,
      launchDurationMs: 280,
      launchSparkCount: 6,
      launchLayerCount: 10,
      poolCapacity: 6,
      throughGeometry: true,
      openEnded: true,
      lastPresentationStartOffsetM: 0,
      lastViewer: 'peer',
      lastAcceptedBeam: {
        generation: 3,
        shotId: 'shot-authority-0001',
        start: authority.start,
        end: authority.end,
        lengthM: 180,
      },
      lastAcceptedOutcomes: accepted.outcomes,
    });
    (core.material as THREE.MeshBasicMaterial).depthTest = true;
    expect(presentation.telemetry().throughGeometry).toBe(false);
    (core.material as THREE.MeshBasicMaterial).depthTest = false;

    const hiddenWorld = { status: 'held', pickupPosition: null } as RailgunAuthorityState;
    presentation.updateWorld(hiddenWorld, 1_000 + RAILGUN_BOLT_PRESENTATION.visibleDurationMs - 1);
    expect(presentation.telemetry().activeBeams).toBe(1);
    presentation.updateWorld(hiddenWorld, 1_000 + RAILGUN_BOLT_PRESENTATION.visibleDurationMs + 1);
    expect(presentation.telemetry().activeBeams).toBe(0);
    presentation.resetBeams();
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 0, beamPresentations: 0, lastAcceptedBeam: null });
  });

  it('starts the shooter view beyond the near plane while preserving the full authoritative path', () => {
    const scene = new THREE.Scene();
    const presentation = new RailgunPresentation(scene, new FakeElement() as unknown as HTMLElement, true);
    const authority = createRailgunBeamAuthority(4, 'shot-shooter-view-0001', [-17, 1.7, -17], [0, 0, -1]);
    const accepted: RailgunShotResultMessage = {
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'shooter', generation: 4,
      shotId: authority.shotId, status: 'accepted-miss', reason: 'accepted', outcomes: [], beam: authority, nonce: 2,
    };
    expect(presentation.presentAcceptedResult(accepted, 2_000, 'shooter')).toBe(true);
    const beam = scene.getObjectByName('railgun-massive-beam-1') as THREE.Group;
    const core = beam.getObjectByName('railgun-beam-core') as THREE.Mesh;
    const bloom = beam.getObjectByName('railgun-beam-bloom') as THREE.Mesh;
    const launch = beam.getObjectByName('railgun-launch-origin') as THREE.Group;
    const launchBridge = launch.getObjectByName('railgun-launch-bridge') as THREE.Mesh;
    expect(core.scale).toMatchObject({
      x: RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM,
      y: 180 - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      z: RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM,
    });
    expect(bloom.scale).toMatchObject({
      x: RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM,
      y: 180 - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      z: RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM,
    });
    expect((core.material as THREE.MeshBasicMaterial).side).toBe(THREE.FrontSide);
    expect((bloom.material as THREE.MeshBasicMaterial).side).toBe(THREE.FrontSide);
    expect(launch.position.y).toBeCloseTo(
      -(180 - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM) * 0.5
        - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM
        + RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      6,
    );
    expect(launchBridge.visible).toBe(true);
    expect(launchBridge.scale.y).toBeCloseTo(
      RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM - RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      6,
    );
    expect(beam.userData).toMatchObject({
      authoritativeStart: authority.start,
      authoritativeEnd: authority.end,
      presentationStartOffsetM: RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      presentationCoreRadiusM: RAILGUN_BOLT_PRESENTATION.shooterCoreRadiusM,
      presentationHaloRadiusM: RAILGUN_BOLT_PRESENTATION.shooterHaloRadiusM,
      presentationLaunchOffsetM: RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      presentationLaunchBridgeLengthM:
        RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM - RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      viewer: 'shooter',
    });
    expect(presentation.telemetry()).toMatchObject({
      lastBeamLengthM: 180,
      lastPresentationStartOffsetM: RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      lastViewer: 'shooter',
      shooterLaunchOffsetM: RAILGUN_BOLT_PRESENTATION.shooterLaunchOffsetM,
      lastAcceptedBeam: { start: authority.start, end: authority.end, lengthM: 180 },
      throughGeometry: true,
      openEnded: true,
    });
  });

  it('deduplicates one shooter result without suppressing a later holder that reuses its shot id', () => {
    const scene = new THREE.Scene();
    const presentation = new RailgunPresentation(scene, new FakeElement() as unknown as HTMLElement, true);
    const authority = createRailgunBeamAuthority(7, 'shared-shot-id-0001', [0, 1.7, 0], [0, 0, -1]);
    const accepted: RailgunShotResultMessage = {
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'shooter-a', generation: 7,
      shotId: authority.shotId, status: 'accepted-miss', reason: 'accepted', outcomes: [], beam: authority, nonce: 1,
    };
    expect(presentation.presentAcceptedResult(accepted, 1_000)).toBe(true);
    expect(presentation.presentAcceptedResult({ ...accepted, nonce: 2 }, 1_001)).toBe(false);
    expect(presentation.presentAcceptedResult({ ...accepted, forPlayerId: 'shooter-b', nonce: 3 }, 1_002)).toBe(true);
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 2, beamPresentations: 2 });
  });

  it('never presents a rejected or identity-mismatched result', () => {
    const scene = new THREE.Scene();
    const presentation = new RailgunPresentation(scene, new FakeElement() as unknown as HTMLElement, true);
    const rejected: RailgunShotResultMessage = {
      type: 'railgun-shot-result', protocolVersion: 6, by: 'host', forPlayerId: 'shooter', generation: 3,
      shotId: 'shot-rejected-0001', status: 'rejected', reason: 'not-ready', outcomes: [], beam: null, nonce: 1,
    };
    expect(presentation.presentAcceptedResult(rejected, 1_000)).toBe(false);
    const authority = createRailgunBeamAuthority(3, 'shot-accepted-0002', [0, 1, 0], [0, 0, -1]);
    expect(presentation.presentAcceptedResult({
      ...rejected,
      status: 'accepted-miss',
      reason: 'accepted',
      shotId: 'different-shot-0002',
      beam: authority,
    }, 1_001)).toBe(false);
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 0, beamPresentations: 0, lastAcceptedBeam: null });
  });

  it('creates no pawn/DOM proxy and binds compatibility telemetry to actual shared reveal layers', () => {
    const scene = new THREE.Scene();
    const thermal = new FakeElement();
    const presentation = new RailgunPresentation(scene, thermal as unknown as HTMLElement, true);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const contacts = [{ id: 'bot-1', kind: 'bot' as const, position: new THREE.Vector3(0, 0, -5) }];
    presentation.updateThermal(camera, contacts, true);
    expect(presentation.telemetry()).toMatchObject({
      thermalContacts: 1,
      worldSilhouettes: 0,
      thermalThroughGeometry: false,
      revealPresentation: 'occlusion-conditioned-single-exact-animated-thermal-operator',
      proxyMeshes: 0,
      domBodyMarkers: 0,
    });
    expect(scene.getObjectByName('railgun-thermal-silhouette-1')).toBeUndefined();
    expect(thermal.childElementCount).toBe(0);
    presentation.syncExactOperatorReveal(true, {
      contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
      trackedTargets: 1,
      activeTargets: 1,
      activeTargetIds: ['bot-1'],
      occludedTargets: 1,
      occludedTargetIds: ['bot-1'],
      visibleOriginalTargets: 0,
      visibleOriginalTargetIds: [],
      activeModelLayers: 6,
      activeThermalLayers: 6,
      activeHaloLayers: 0,
      activeSourceBodyLayers: 6,
      geometryIdentity: true,
      skeletonIdentity: true,
      bindMatrixIdentity: true,
      meshWorldMatrixIdentity: true,
      boneWorldMatrixIdentity: true,
      silhouetteLayerIdentity: true,
      throughGeometry: true,
      monochromeThermal: true,
      orangeHalo: false,
      treatmentsPerTarget: 1,
      proxyMeshes: 0,
      maxTargets: 16,
      thermalMaterials: 1,
      exactModelMaterials: 0,
      haloMaterials: 0,
      ownedMaterials: 1,
      maxOwnedMaterials: 1,
      materialBudgetExceeded: false,
      completeOperatorModels: true,
      incompleteTargets: 0,
      maxBodyLayers: 12,
    });
    expect(presentation.telemetry()).toMatchObject({
      worldSilhouettes: 6,
      thermalThroughGeometry: true,
      exactOperatorModels: 6,
      exactOperatorHalos: 0,
      exactGeometryIdentity: true,
      exactSkeletonIdentity: true,
      orangeHalo: false,
      exactOperatorComplete: true,
      exactOperatorMaterialBudgetExceeded: false,
    });
    presentation.syncExactOperatorReveal(true, {
      contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
      trackedTargets: 1, activeTargets: 1, activeTargetIds: ['bot-1'],
      occludedTargets: 1, occludedTargetIds: ['bot-1'],
      visibleOriginalTargets: 0, visibleOriginalTargetIds: [],
      activeModelLayers: 6, activeThermalLayers: 6, activeHaloLayers: 0, activeSourceBodyLayers: 6,
      geometryIdentity: true, skeletonIdentity: true, bindMatrixIdentity: true,
      meshWorldMatrixIdentity: true, boneWorldMatrixIdentity: true, silhouetteLayerIdentity: true,
      throughGeometry: true, monochromeThermal: true, orangeHalo: false, treatmentsPerTarget: 1,
      proxyMeshes: 0, maxTargets: 16, thermalMaterials: 1,
      exactModelMaterials: 0, haloMaterials: 0, ownedMaterials: 1, maxOwnedMaterials: 1,
      materialBudgetExceeded: false, completeOperatorModels: false, incompleteTargets: 1, maxBodyLayers: 12,
    });
    expect(presentation.telemetry()).toMatchObject({
      worldSilhouettes: 0,
      thermalThroughGeometry: false,
      exactOperatorComplete: false,
    });
  });
});
