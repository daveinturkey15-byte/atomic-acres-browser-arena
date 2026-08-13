import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  THERMAL_GHOST_MAX_BODY_LAYERS,
  THERMAL_GHOST_MAX_OWNED_MATERIALS,
  THERMAL_GHOST_ORANGE_HEX,
  THERMAL_GHOST_PRESENTATION_CONTRACT,
  ThermalGhostPresentation,
} from './thermal-ghost-presentation';

function operatorRoot(layerCount = 2): THREE.Group {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  visual.name = 'rigged-operator-visual';
  const material = new THREE.MeshStandardMaterial({ color: 0x493d36 });
  for (let index = 0; index < layerCount; index += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.position.y = index;
    visual.add(mesh);
  }
  root.add(visual);
  return root;
}

describe('single exact animated thermal operator', () => {
  it('uses no duplicate treatment while visible and one monochrome exact body only while occluded', () => {
    const root = operatorRoot();
    const presentation = new ThermalGhostPresentation();
    const visible = { id: 'bot-1', relation: 'hostile' as const, root, occluded: false };

    presentation.sync([visible], true);
    expect(presentation.telemetry()).toMatchObject({
      contract: THERMAL_GHOST_PRESENTATION_CONTRACT,
      trackedTargets: 1,
      activeTargets: 0,
      activeTargetIds: [],
      visibleOriginalTargets: 1,
      visibleOriginalTargetIds: ['bot-1'],
      activeModelLayers: 0,
      activeHaloLayers: 0,
      treatmentsPerTarget: 0,
      proxyMeshes: 0,
    });
    expect(root.getObjectsByProperty('name', 'through-wall-single-thermal-operator-model')).toHaveLength(2);
    expect(root.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(0);

    presentation.sync([{ ...visible, occluded: true }], true);
    expect(presentation.telemetry()).toMatchObject({
      activeTargets: 1,
      activeTargetIds: ['bot-1'],
      occludedTargets: 1,
      occludedTargetIds: ['bot-1'],
      visibleOriginalTargets: 0,
      activeModelLayers: 2,
      activeThermalLayers: 2,
      activeHaloLayers: 0,
      monochromeThermal: true,
      throughGeometry: true,
      treatmentsPerTarget: 1,
      orangeHalo: false,
      ownedMaterials: 1,
      maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS,
    });
    expect(presentation.setEvidenceControlHidden(true)).toBe(true);
    const evidenceLayer = root.getObjectByName('through-wall-single-thermal-operator-model') as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    expect(evidenceLayer.material.visible).toBe(false);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 1, activeTargetIds: ['bot-1'] });
    expect(presentation.setEvidenceControlHidden(false)).toBe(true);
    expect(evidenceLayer.material.visible).toBe(true);
    presentation.terminalDispose();
  });

  it('shares exact geometry and live skeleton as a transform-identical sibling', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.position.set(3.2, -1.1, 4.7);
    root.rotation.set(0.2, -0.7, 0.1);
    const hip = new THREE.Bone();
    const leg = new THREE.Bone();
    hip.add(leg);
    const skeleton = new THREE.Skeleton([hip, leg]);
    const geometry = new THREE.BoxGeometry();
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count * 4), 4));
    const weights = new Float32Array(geometry.attributes.position.count * 4);
    for (let index = 0; index < weights.length; index += 4) weights[index] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const source = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
    source.position.set(-0.4, 1.8, 0.6);
    source.rotation.set(-0.15, 0.33, 0.08);
    source.scale.set(0.9, 1.15, 1.05);
    source.add(hip);
    source.bind(skeleton);
    root.add(source);
    scene.add(root);
    const presentation = new ThermalGhostPresentation();

    presentation.sync([{ id: 'animated', relation: 'hostile', root, occluded: true }], true);
    const model = root.getObjectByName('through-wall-single-thermal-operator-model') as THREE.SkinnedMesh;
    expect(model).toBeInstanceOf(THREE.SkinnedMesh);
    expect(model.parent).toBe(source.parent);
    expect(model.geometry).toBe(source.geometry);
    expect(model.skeleton).toBe(source.skeleton);
    expect(model.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect((model.material as THREE.MeshBasicMaterial).color.getHex()).toBe(THERMAL_GHOST_ORANGE_HEX);
    expect((model.material as THREE.Material).depthTest).toBe(false);
    expect((model.material as THREE.Material).depthWrite).toBe(false);
    expect(root.getObjectByName('through-wall-exact-operator-model')).toBeUndefined();
    expect(root.getObjectByName('through-wall-operator-orange-halo')).toBeUndefined();
    leg.rotation.x = 0.62;
    root.updateWorldMatrix(true, true);
    expect(presentation.telemetry()).toMatchObject({
      geometryIdentity: true,
      skeletonIdentity: true,
      bindMatrixIdentity: true,
      meshWorldMatrixIdentity: true,
      boneWorldMatrixIdentity: true,
      silhouetteLayerIdentity: true,
      exactModelMaterials: 0,
      haloMaterials: 0,
      thermalMaterials: 1,
    });
    presentation.terminalDispose();
  });

  it('retains one resident clone per source without rebuilding across ADS or relation changes', () => {
    const root = operatorRoot();
    new THREE.Scene().add(root);
    const presentation = new ThermalGhostPresentation();
    const target = { id: 'stable', relation: 'hostile' as const, root, occluded: true };
    presentation.sync([target], true);
    const models = root.getObjectsByProperty('name', 'through-wall-single-thermal-operator-model');
    presentation.sync([], false);
    presentation.sync([{ ...target, relation: 'friendly' }], true);
    expect(root.getObjectsByProperty('name', 'through-wall-single-thermal-operator-model')).toEqual(models);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeTargets: 1, ownedMaterials: 1 });
    presentation.terminalDispose();
    expect(presentation.telemetry()).toMatchObject({ ownedMaterials: 0, thermalMaterials: 0 });
  });

  it('never expands the approved target set and owns one shared material for the bounded corpus', () => {
    const scene = new THREE.Scene();
    const targets = Array.from({ length: 20 }, (_, index) => {
      const root = operatorRoot();
      scene.add(root);
      return { id: `target-${index}`, relation: 'hostile' as const, root, occluded: true };
    });
    const presentation = new ThermalGhostPresentation();
    presentation.sync(targets, true);
    expect(presentation.telemetry()).toMatchObject({
      trackedTargets: 16,
      activeTargets: 16,
      treatmentsPerTarget: 1,
      thermalMaterials: 1,
      ownedMaterials: 1,
      materialBudgetExceeded: false,
      proxyMeshes: 0,
    });
    const materials = new Set(
      scene.getObjectsByProperty('name', 'through-wall-single-thermal-operator-model')
        .map((object) => (object as THREE.Mesh).material),
    );
    expect(materials.size).toBe(1);
    presentation.terminalDispose();
  });

  it('does not false-green hidden ancestors or non-color-writing source material', () => {
    const root = operatorRoot(1);
    const source = root.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    const presentation = new ThermalGhostPresentation();
    const target = { id: 'visibility', relation: 'hostile' as const, root, occluded: true };
    presentation.sync([target], true);
    expect(presentation.telemetry().activeTargets).toBe(1);
    source.parent!.visible = false;
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 0, throughGeometry: false });
    source.parent!.visible = true;
    (source.material as THREE.Material).colorWrite = false;
    presentation.sync([target], true);
    expect(presentation.telemetry().activeTargets).toBe(0);
    presentation.terminalDispose();
  });

  it('fails closed rather than drawing a partial future operator', () => {
    const root = operatorRoot(THERMAL_GHOST_MAX_BODY_LAYERS + 1);
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'oversized', relation: 'hostile', root, occluded: true }], true);
    expect(presentation.telemetry()).toMatchObject({
      trackedTargets: 1,
      activeTargets: 0,
      activeModelLayers: 0,
      completeOperatorModels: false,
      incompleteTargets: 1,
      throughGeometry: false,
    });
    expect(root.getObjectsByProperty('name', 'through-wall-single-thermal-operator-model')).toHaveLength(0);
    presentation.terminalDispose();
  });
});
