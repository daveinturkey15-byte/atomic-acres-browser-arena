import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RailgunPresentation } from './railgun-presentation';

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

  it('presents a massive pooled beam for local and replicated shot hooks', () => {
    const scene = new THREE.Scene();
    const presentation = new RailgunPresentation(scene, new FakeElement() as unknown as HTMLElement, true);
    presentation.presentBeam(new THREE.Vector3(), new THREE.Vector3(0, 0, -180), 1_000);
    expect(presentation.telemetry()).toMatchObject({ activeBeams: 1, beamPresentations: 1 });
    const beam = scene.getObjectByName('railgun-massive-beam-1') as THREE.Group;
    expect(beam.visible).toBe(true);
    expect(beam.getObjectByName('railgun-beam-bloom')?.scale.y).toBeCloseTo(180);
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
