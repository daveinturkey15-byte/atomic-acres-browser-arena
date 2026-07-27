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
      shotId: authority.shotId, status: 'accepted-miss', reason: 'accepted', outcomes: [], beam: authority, nonce: 1,
    };
    expect(presentation.presentAcceptedResult(accepted, 1_000)).toBe(true);
    expect(presentation.presentAcceptedResult(accepted, 1_001)).toBe(false);
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 1, beamPresentations: 1 });
    const beam = scene.getObjectByName('railgun-massive-beam-1') as THREE.Group;
    expect(beam.visible).toBe(true);
    const core = beam.getObjectByName('railgun-beam-core') as THREE.Mesh;
    const bloom = beam.getObjectByName('railgun-beam-bloom') as THREE.Mesh;
    expect(core.scale).toMatchObject({ x: RAILGUN_BOLT_PRESENTATION.coreRadiusM, y: 180 });
    expect(bloom.scale).toMatchObject({ x: RAILGUN_BOLT_PRESENTATION.haloRadiusM, y: 180 });
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
      visibleDurationMs: 900,
      poolCapacity: 6,
      throughGeometry: true,
      lastPresentationStartOffsetM: 0,
      lastViewer: 'peer',
      lastAcceptedBeam: {
        generation: 3,
        shotId: 'shot-authority-0001',
        start: authority.start,
        end: authority.end,
        lengthM: 180,
      },
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
    expect(core.scale.y).toBeCloseTo(180 - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM, 6);
    expect(bloom.scale.y).toBeCloseTo(180 - RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM, 6);
    expect((core.material as THREE.MeshBasicMaterial).side).toBe(THREE.BackSide);
    expect((bloom.material as THREE.MeshBasicMaterial).side).toBe(THREE.BackSide);
    expect(beam.userData).toMatchObject({
      authoritativeStart: authority.start,
      authoritativeEnd: authority.end,
      presentationStartOffsetM: RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      viewer: 'shooter',
    });
    expect(presentation.telemetry()).toMatchObject({
      lastBeamLengthM: 180,
      lastPresentationStartOffsetM: RAILGUN_BOLT_PRESENTATION.shooterStartOffsetM,
      lastViewer: 'shooter',
      lastAcceptedBeam: { start: authority.start, end: authority.end, lengthM: 180 },
      throughGeometry: true,
    });
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

  it('keeps neon-blue enemy silhouettes in the 3D scene through depth and reuses DOM markers', () => {
    const scene = new THREE.Scene();
    const thermal = new FakeElement();
    const presentation = new RailgunPresentation(scene, thermal as unknown as HTMLElement, true);
    const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 100);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const contacts = [{ id: 'bot-1', kind: 'bot' as const, position: new THREE.Vector3(0, 0, -5) }];
    presentation.updateThermal(camera, contacts, true);
    expect(presentation.telemetry()).toMatchObject({ thermalContacts: 1, worldSilhouettes: 1 });
    const silhouette = scene.getObjectByName('railgun-thermal-silhouette-1') as THREE.Group;
    expect(silhouette.visible).toBe(true);
    const head = silhouette.getObjectByName('thermal-head') as THREE.Mesh;
    expect((head.material as THREE.MeshBasicMaterial).depthTest).toBe(false);
    expect((head.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x2bdcff);
    presentation.updateThermal(camera, contacts, true);
    expect(thermal.childElementCount).toBe(1);
  });
});
