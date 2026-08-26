import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  THERMAL_GHOST_HALO_SCALE,
  THERMAL_GHOST_MAX_BODY_LAYERS,
  THERMAL_GHOST_MAX_OWNED_MATERIALS,
  THERMAL_GHOST_ORANGE_HEX,
  THERMAL_GHOST_PRESENTATION_CONTRACT,
  ThermalGhostPresentation,
} from './thermal-ghost-presentation';

describe('M14 thermal ghost residency', () => {
  it('freezes the complete shipped operator body below the exact-layer bound', () => {
    for (const asset of [
      '../public/assets/original/models/operators/pass65-third-person-operator-lod0.glb',
      '../public/assets/original/models/operators/pass65-third-person-operator-lod1.glb',
    ]) {
      const bytes = readFileSync(new URL(asset, import.meta.url));
      const jsonLength = bytes.readUInt32LE(12);
      const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as {
        meshes: Array<{ primitives: unknown[] }>;
        materials: unknown[];
      };
      const bodyPrimitives = gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0);
      expect(bodyPrimitives, asset).toBe(9);
      expect(bodyPrimitives, asset).toBeLessThanOrEqual(THERMAL_GHOST_MAX_BODY_LAYERS);
      expect(gltf.materials, asset).toHaveLength(4);
    }
  });

  it('retains exact live-id ghost records across inactive ADS frames', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial()),
    );
    scene.add(root);
    const presentation = new ThermalGhostPresentation();
    const target = { id: 'bot-live-7', relation: 'hostile' as const, root };

    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({
      contract: THERMAL_GHOST_PRESENTATION_CONTRACT,
      trackedTargets: 1,
      activeTargets: 1,
      activeModelLayers: 2,
      activeHaloLayers: 2,
      proxyMeshes: 0,
      geometryIdentity: true,
      throughGeometry: true,
      orangeHalo: true,
    });
    const childrenAfterFirstAds = root.children.map((child) => child.children.length);

    presentation.sync([], false);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeModelLayers: 0, activeHaloLayers: 0 });
    presentation.sync([target], true);

    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeModelLayers: 2, activeHaloLayers: 2 });
    expect(root.children.map((child) => child.children.length)).toEqual(childrenAfterFirstAds);
    expect(root.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(2);
    expect(root.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(2);
    presentation.sync([{ ...target, relation: 'friendly' }], true);
    expect(root.children.map((child) => child.children.length)).toEqual(childrenAfterFirstAds);
    presentation.terminalDispose();
  });

  it('releases unseen admission-prewarm records when the live reveal set takes ownership', () => {
    const scene = new THREE.Scene();
    const prewarmRoot = new THREE.Group();
    const liveRoot = new THREE.Group();
    prewarmRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    liveRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    scene.add(prewarmRoot, liveRoot);
    const presentation = new ThermalGhostPresentation();

    presentation.sync([{ id: 'thermal-prewarm-corpse-0', relation: 'hostile', root: prewarmRoot }], true);
    presentation.sync([{ id: 'bot-live', relation: 'hostile', root: liveRoot }], true, true);

    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeTargetIds: ['bot-live'] });
    expect(prewarmRoot.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(0);
    expect(prewarmRoot.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(0);
    presentation.terminalDispose();
  });

  it('shares exact geometry and a live skeleton while rendering normal model plus orange halo', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.position.set(3.2, -1.1, 4.7);
    root.rotation.set(0.2, -0.7, 0.1);
    root.scale.set(1.3, 0.8, 1.1);
    const hip = new THREE.Bone();
    const leg = new THREE.Bone();
    hip.add(leg);
    const skeleton = new THREE.Skeleton([hip, leg]);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(geometry.attributes.position.count * 4), 4));
    const weights = new Float32Array(geometry.attributes.position.count * 4);
    for (let index = 0; index < weights.length; index += 4) weights[index] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x2f5b48, roughness: 0.73 });
    const source = new THREE.SkinnedMesh(geometry, sourceMaterial);
    source.position.set(-0.4, 1.8, 0.6);
    source.rotation.set(-0.15, 0.33, 0.08);
    source.scale.set(0.9, 1.15, 1.05);
    // Runtime operator meshes carry this non-authority marker; it must not
    // suppress their exact visual reveal.
    source.userData.presentationOnly = true;
    source.add(hip);
    source.bind(skeleton);
    const visual = new THREE.Group();
    visual.name = 'rigged-operator-visual';
    visual.add(source);
    // Runtime-authored static attachments below the visual must not make the
    // shipped nine-skinned-mesh body fail its 12-layer exact-model bound.
    for (let index = 0; index < 4; index += 1) {
      const attachment = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      attachment.name = `runtime-static-attachment-${index}`;
      visual.add(attachment);
    }
    root.add(visual);
    scene.add(root);
    const presentation = new ThermalGhostPresentation();

    presentation.sync([{ id: 'animated-operator', relation: 'hostile', root }], true);
    const model = root.getObjectByName('through-wall-exact-operator-model') as THREE.SkinnedMesh;
    const halo = root.getObjectByName('through-wall-operator-orange-halo') as THREE.SkinnedMesh;
    expect(model).toBeInstanceOf(THREE.SkinnedMesh);
    expect(halo).toBeInstanceOf(THREE.SkinnedMesh);
    expect(model.geometry).toBe(source.geometry);
    expect(halo.geometry).toBe(source.geometry);
    expect(model.skeleton).toBe(source.skeleton);
    expect(halo.skeleton).toBe(source.skeleton);
    expect(model.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((model.material as THREE.MeshStandardMaterial).color.getHex()).toBe(sourceMaterial.color.getHex());
    expect((model.material as THREE.Material).depthTest).toBe(false);
    expect((model.material as THREE.Material).depthWrite).toBe(false);
    expect((halo.material as THREE.MeshBasicMaterial).color.getHex()).toBe(THERMAL_GHOST_ORANGE_HEX);
    expect((halo.material as THREE.MeshBasicMaterial).side).toBe(THREE.BackSide);
    expect(model.parent).toBe(source.parent);
    expect(halo.parent).toBe(source.parent);
    expect(model.parent).not.toBe(source);
    expect(root.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(1);
    expect(root.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(1);
    expect(model.matrix.equals(source.matrix)).toBe(true);
    expect(halo.matrix.equals(source.matrix.clone().scale(new THREE.Vector3(
      THERMAL_GHOST_HALO_SCALE,
      THERMAL_GHOST_HALO_SCALE,
      THERMAL_GHOST_HALO_SCALE,
    )))).toBe(true);
    expect(model.raycast(new THREE.Raycaster(), [])).toBeUndefined();
    expect(halo.raycast(new THREE.Raycaster(), [])).toBeUndefined();
    leg.rotation.x = 0.62;
    root.updateWorldMatrix(true, true);
    expect(presentation.telemetry()).toMatchObject({
      activeSourceBodyLayers: 1,
      activeModelLayers: 1,
      activeHaloLayers: 1,
      activeNormalMaterialSlots: 1,
      geometryIdentity: true,
      skeletonIdentity: true,
      bindMatrixIdentity: true,
      meshWorldMatrixIdentity: true,
      haloWorldMatrixIdentity: true,
      boneWorldMatrixIdentity: true,
      normalMaterialEquivalence: true,
      silhouetteLayerIdentity: true,
      siblingParentIdentity: true,
      proxyMeshes: 0,
    });
    presentation.terminalDispose();
  });

  it('synchronizes live normal-material appearance without replacing the resident clone or churning versions', () => {
    const root = new THREE.Group();
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: 0x223344,
      emissive: 0x010203,
      opacity: 1,
      roughness: 0.7,
      metalness: 0.15,
    });
    const source = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial);
    root.add(source);
    const target = { id: 'dynamic-material', relation: 'hostile' as const, root };
    const presentation = new ThermalGhostPresentation();

    presentation.sync([target], true);
    const model = root.getObjectByName('through-wall-exact-operator-model') as THREE.Mesh;
    const residentMaterial = model.material as THREE.MeshStandardMaterial;
    const map = new THREE.Texture();
    sourceMaterial.color.setHex(0x8a4f2a);
    sourceMaterial.emissive.setHex(0x190500);
    sourceMaterial.emissiveIntensity = 2.2;
    sourceMaterial.opacity = 0.61;
    sourceMaterial.transparent = true;
    sourceMaterial.roughness = 0.32;
    sourceMaterial.metalness = 0.74;
    sourceMaterial.map = map;
    sourceMaterial.normalScale.set(0.45, -0.72);

    presentation.sync([target], true);
    expect(model.material).toBe(residentMaterial);
    expect(residentMaterial.color.equals(sourceMaterial.color)).toBe(true);
    expect(residentMaterial.emissive.equals(sourceMaterial.emissive)).toBe(true);
    expect(residentMaterial.emissiveIntensity).toBe(sourceMaterial.emissiveIntensity);
    expect(residentMaterial.opacity).toBe(sourceMaterial.opacity);
    expect(residentMaterial.transparent).toBe(true);
    expect(residentMaterial.roughness).toBe(sourceMaterial.roughness);
    expect(residentMaterial.metalness).toBe(sourceMaterial.metalness);
    expect(residentMaterial.map).toBe(map);
    expect(residentMaterial.normalScale.equals(sourceMaterial.normalScale)).toBe(true);
    expect(residentMaterial.depthTest).toBe(false);
    expect(residentMaterial.depthWrite).toBe(false);
    expect(presentation.telemetry().normalMaterialEquivalence).toBe(true);
    const versionAfterChange = residentMaterial.version;

    presentation.sync([target], true);
    expect(model.material).toBe(residentMaterial);
    expect(residentMaterial.version).toBe(versionAfterChange);
    expect(presentation.telemetry().normalMaterialEquivalence).toBe(true);
    presentation.terminalDispose();
    map.dispose();
  });

  it('never expands the authority-approved target set or synthesizes relation aliases', () => {
    const scene = new THREE.Scene();
    const roots = Array.from({ length: 20 }, (_, index) => {
      const root = new THREE.Group();
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
      scene.add(root);
      return { id: `target-${index}`, relation: index % 2 ? 'friendly' as const : 'hostile' as const, root };
    });
    const presentation = new ThermalGhostPresentation();
    presentation.sync(roots, true);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 16, activeTargets: 16, proxyMeshes: 0 });
    presentation.sync([roots[3]], true);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 16, activeTargets: 1 });
    expect(scene.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(16);
    presentation.terminalDispose();
  });

  it('shares one halo and caches exact material clones within the bounded 16-target corpus', () => {
    const scene = new THREE.Scene();
    const roots = Array.from({ length: 16 }, (_, targetIndex) => {
      const root = new THREE.Group();
      root.name = `operator-${targetIndex}`;
      const visual = new THREE.Group();
      visual.name = 'rigged-operator-visual';
      const materials = Array.from({ length: 4 }, (_, materialIndex) => (
        new THREE.MeshStandardMaterial({ color: 0x223344 + targetIndex * 0x100 + materialIndex })
      ));
      for (let layer = 0; layer < 9; layer += 1) {
        visual.add(new THREE.Mesh(new THREE.BoxGeometry(), materials[layer % materials.length]));
      }
      root.add(visual);
      scene.add(root);
      return { id: `operator-${targetIndex}`, relation: 'hostile' as const, root };
    });
    const presentation = new ThermalGhostPresentation();
    presentation.sync(roots, true);
    const telemetry = presentation.telemetry();
    expect(telemetry).toMatchObject({
      trackedTargets: 16,
      activeTargets: 16,
      activeModelLayers: 144,
      activeHaloLayers: 144,
      exactModelMaterials: 64,
      haloMaterials: 1,
      ownedMaterials: 65,
      maxOwnedMaterials: THERMAL_GHOST_MAX_OWNED_MATERIALS,
      materialBudgetExceeded: false,
      completeOperatorModels: true,
      incompleteTargets: 0,
    });
    expect(telemetry.ownedMaterials).toBeLessThanOrEqual(telemetry.maxOwnedMaterials);
    const haloMaterials = new Set(
      scene.getObjectsByProperty('name', 'through-wall-operator-orange-halo')
        .map((object) => (object as THREE.Mesh).material),
    );
    expect(haloMaterials.size).toBe(1);
    presentation.terminalDispose();
    expect(presentation.telemetry()).toMatchObject({ ownedMaterials: 0, haloMaterials: 0 });
  });

  it('does not false-green hidden ancestors or non-color-writing source materials', () => {
    const root = new THREE.Group();
    const lod = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const source = new THREE.Mesh(new THREE.BoxGeometry(), material);
    lod.add(source);
    root.add(lod);
    const target = { id: 'visibility-adversary', relation: 'hostile' as const, root };
    const presentation = new ThermalGhostPresentation();
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ activeModelLayers: 1, throughGeometry: true });

    lod.visible = false;
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({
      activeTargets: 0, activeModelLayers: 0, activeHaloLayers: 0, throughGeometry: false, orangeHalo: false,
    });
    lod.visible = true;
    material.visible = false;
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 0, throughGeometry: false });
    material.visible = true;
    material.colorWrite = false;
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 0, throughGeometry: false });
    material.colorWrite = true;
    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 1, throughGeometry: true, orangeHalo: true });
    presentation.terminalDispose();
  });

  it('fails telemetry closed for model and halo opacity, visibility, colorWrite, or depthTest mutations', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'material-adversary', relation: 'hostile', root }], true);
    const model = root.getObjectByName('through-wall-exact-operator-model') as THREE.Mesh;
    const halo = root.getObjectByName('through-wall-operator-orange-halo') as THREE.Mesh;
    const modelMaterial = model.material as THREE.Material;
    const haloMaterial = halo.material as THREE.Material;

    expect(presentation.telemetry()).toMatchObject({
      exactModelVisible: true,
      exactModelColorWrite: true,
      exactModelOpacity: 1,
      exactModelDepthTestDisabled: true,
      exactModelDepthWriteDisabled: true,
      haloVisible: true,
      haloColorWrite: true,
      haloOpacity: 0.88,
      haloDepthTestDisabled: true,
      haloDepthWriteDisabled: true,
      throughGeometry: true,
      orangeHalo: true,
    });

    const assertModelFailure = (field: 'exactModelVisible' | 'exactModelColorWrite'
      | 'exactModelDepthTestDisabled', mutate: () => void, restore: () => void): void => {
      mutate();
      expect(presentation.telemetry()).toMatchObject({ [field]: false, throughGeometry: false });
      restore();
    };
    modelMaterial.opacity = 0;
    expect(presentation.telemetry()).toMatchObject({ exactModelOpacity: 0, throughGeometry: false });
    modelMaterial.opacity = 1;
    assertModelFailure('exactModelVisible', () => { modelMaterial.visible = false; }, () => { modelMaterial.visible = true; });
    assertModelFailure('exactModelColorWrite', () => { modelMaterial.colorWrite = false; }, () => { modelMaterial.colorWrite = true; });
    assertModelFailure('exactModelDepthTestDisabled', () => { modelMaterial.depthTest = true; }, () => { modelMaterial.depthTest = false; });

    const assertHaloFailure = (field: 'haloVisible' | 'haloColorWrite'
      | 'haloDepthTestDisabled', mutate: () => void, restore: () => void): void => {
      mutate();
      expect(presentation.telemetry()).toMatchObject({ [field]: false, throughGeometry: false, orangeHalo: false });
      restore();
    };
    haloMaterial.opacity = 0;
    expect(presentation.telemetry()).toMatchObject({ haloOpacity: 0, throughGeometry: false, orangeHalo: false });
    haloMaterial.opacity = 0.88;
    assertHaloFailure('haloVisible', () => { haloMaterial.visible = false; }, () => { haloMaterial.visible = true; });
    assertHaloFailure('haloColorWrite', () => { haloMaterial.colorWrite = false; }, () => { haloMaterial.colorWrite = true; });
    assertHaloFailure('haloDepthTestDisabled', () => { haloMaterial.depthTest = true; }, () => { haloMaterial.depthTest = false; });

    expect(presentation.telemetry()).toMatchObject({ throughGeometry: true, orangeHalo: true });
    presentation.terminalDispose();
  });

  it('supports paired-raster hiding without changing the admitted target set', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'paired-raster', relation: 'hostile', root }], true);
    expect(presentation.telemetry()).toMatchObject({
      activeTargetIds: ['paired-raster'],
      activeTargets: 1,
      evidenceControlHidden: false,
    });
    expect(presentation.setEvidenceControlHidden(true)).toBe(true);
    expect(presentation.telemetry()).toMatchObject({
      activeTargetIds: ['paired-raster'],
      activeTargets: 1,
      evidenceControlHidden: true,
      exactModelVisible: false,
      haloVisible: false,
      throughGeometry: false,
      orangeHalo: false,
    });
    expect(presentation.setEvidenceControlHidden(false)).toBe(true);
    presentation.sync([{ id: 'paired-raster', relation: 'hostile', root }], true);
    expect(presentation.telemetry()).toMatchObject({
      activeTargetIds: ['paired-raster'],
      activeTargets: 1,
      evidenceControlHidden: false,
      normalMaterialEquivalence: true,
    });
    presentation.terminalDispose();
  });

  it('binds active reveal records to the current life, continuity, attached root, and animated pose', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    const source = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(source);
    scene.add(root);
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'live-operator', relation: 'hostile', root, lifeId: 3, continuityId: 8 }], true);
    const first = presentation.telemetry(true);
    expect(first).toMatchObject({
      lifeIdentityCurrent: true,
      poseIdentity: true,
      sourceRootsAttached: true,
      sourceRootIdentityUnique: true,
      detachedLayers: 0,
      extraneousModelLayers: 0,
      extraneousHaloLayers: 0,
      duplicateSourceRootInputs: 0,
      targets: [{
        id: 'live-operator', lifeId: 3, continuityId: 8, active: true,
        sourceRootAttached: true, sourceVisualAttached: true, poseIdentity: true,
      }],
    });
    const firstPose = first.targets?.[0]!.sourcePoseDigest;
    source.rotation.y = 0.64;
    presentation.sync([{ id: 'live-operator', relation: 'hostile', root, lifeId: 3, continuityId: 8 }], true);
    const second = presentation.telemetry(true);
    expect(second.targets?.[0]!.sourcePoseDigest).not.toBe(firstPose);
    expect(second.targets?.[0]!.modelPoseDigest).toBe(second.targets?.[0]!.sourcePoseDigest);
    presentation.terminalDispose();
  });

  it('rebuilds an identical target id at a new life and rejects duplicate source roots', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    scene.add(root);
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'respawned', relation: 'hostile', root, lifeId: 1, continuityId: 4 }], true);
    const oldModelUuid = root.getObjectByName('through-wall-exact-operator-model')!.uuid;
    presentation.sync([{ id: 'respawned', relation: 'hostile', root, lifeId: 2, continuityId: 5 }], true);
    expect(root.getObjectByName('through-wall-exact-operator-model')!.uuid).not.toBe(oldModelUuid);
    expect(presentation.telemetry(true)).toMatchObject({
      activeTargets: 1,
      lifeIdentityCurrent: true,
      targets: [{ id: 'respawned', lifeId: 2, continuityId: 5 }],
    });

    presentation.sync([
      { id: 'respawned', relation: 'hostile', root, lifeId: 2, continuityId: 5 },
      { id: 'duplicate-alias', relation: 'hostile', root, lifeId: 2, continuityId: 5 },
    ], true);
    expect(presentation.telemetry(true)).toMatchObject({
      activeTargetIds: ['respawned'],
      duplicateSourceRootInputs: 1,
      sourceRootIdentityUnique: true,
      extraneousModelLayers: 0,
      extraneousHaloLayers: 0,
    });
    presentation.terminalDispose();
  });

  it('reports detached and duplicate reveal layers instead of certifying a split model', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    scene.add(root);
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'structural-adversary', relation: 'hostile', root, lifeId: 0, continuityId: 1 }], true);
    const model = root.getObjectByName('through-wall-exact-operator-model')!;
    model.removeFromParent();
    expect(presentation.telemetry(true)).toMatchObject({ detachedLayers: 1, siblingParentIdentity: false });
    root.add(model);
    const duplicate = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    duplicate.name = 'through-wall-exact-operator-model';
    root.add(duplicate);
    expect(presentation.telemetry(true)).toMatchObject({ extraneousModelLayers: 1 });
    duplicate.removeFromParent();
    duplicate.geometry.dispose();
    (duplicate.material as THREE.Material).dispose();
    presentation.terminalDispose();
  });

  it('fails closed instead of drawing a partial body above the frozen layer bound', () => {
    const root = new THREE.Group();
    const visual = new THREE.Group();
    visual.name = 'rigged-operator-visual';
    const material = new THREE.MeshBasicMaterial();
    for (let index = 0; index < THERMAL_GHOST_MAX_BODY_LAYERS + 1; index += 1) {
      visual.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    }
    root.add(visual);
    const presentation = new ThermalGhostPresentation();
    presentation.sync([{ id: 'oversized-body', relation: 'hostile', root }], true);
    expect(presentation.telemetry()).toMatchObject({
      trackedTargets: 1,
      activeTargets: 0,
      activeModelLayers: 0,
      activeHaloLayers: 0,
      completeOperatorModels: false,
      incompleteTargets: 1,
      throughGeometry: false,
      orangeHalo: false,
    });
    expect(root.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(0);
    expect(root.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(0);
    presentation.terminalDispose();
  });
});
