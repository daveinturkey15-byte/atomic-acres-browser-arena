import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import {
  HUNTER_DRONE_ASSET,
  SUPPORT_VEHICLE_ASSETS,
  SUPPORT_VEHICLE_LOD_DISTANCES,
  SUPPORT_VEHICLE_PREWARM_DISTANCES,
  SUPPORT_VEHICLE_SHADOW_SILHOUETTE_LEVEL,
  SUPPORT_VEHICLE_TEXTURE_MEMORY_EXPECTATION,
  KillstreakPresentation,
  SupportVehicleTextureCanonicalizer,
  applyAuthoredChopperReadability,
  authoredSupportShadowSilhouetteLevel,
  authoredSupportStaticGeometryCanBatch,
  authoredSupportMaterialCastsShadow,
  mergeAuthoredSupportShadowSilhouette,
  cloneAuthoredSupportStaticGeometryForTransform,
  deriveSupportVehiclePrewarmDistances,
  hunterDronePresentationTelemetry,
  supportAircraftPresentationVariant,
  supportAircraftWingVisibility,
  supportVehiclePresentationTelemetry,
  supportVehicleStableAirframeBounds,
  FIRST_PERSON_COCKPIT_VIEW_LIFT_M,
  FIRST_PERSON_COCKPIT_VIEW_PULL_M,
} from './killstreak-presentation';
import type { KillstreakImpactEvent, KillstreakRecipientSnapshot } from './killstreak-runtime';
import { DRONE_SWARM_GUN_PROFILE_ID, PILOTED_DRONE_GUN_PROFILE_ID } from './killstreak-support-catalog';
import { SUPPORT_VEHICLE_PRESENTATION_CONTRACT, missingSupportNodes, supportForwardAlignment } from './support-vehicle-presentation-contract';

describe('authored support shadow budget', () => {
  it('keeps major opaque silhouettes while excluding tiny, emissive and transparent details', () => {
    expect(authoredSupportMaterialCastsShadow('drone', 'MAT_HunterDrone_Armor_PBR')).toBe(true);
    expect(authoredSupportMaterialCastsShadow('drone', 'MAT_HunterDrone_Gunmetal')).toBe(true);
    expect(authoredSupportMaterialCastsShadow('chopper', 'MAT_Pass65Chopper_RotorBlade')).toBe(true);
    expect(authoredSupportMaterialCastsShadow('chopper', 'MAT_Pass65Chopper_CyanInstrument')).toBe(false);
    expect(authoredSupportMaterialCastsShadow('chopper', 'MAT_Pass65Chopper_RotorBlur')).toBe(false);
    expect(authoredSupportMaterialCastsShadow('chopper', 'MAT_Pass65Chopper_CanopyGlass')).toBe(false);
    expect(authoredSupportMaterialCastsShadow('drone', 'MAT_HunterDrone_IdentityLight')).toBe(false);
    expect(authoredSupportMaterialCastsShadow('drone', 'MAT_FutureDrone_Gunmetal')).toBe(false);
  });

  // HF-336: the possessing player hides the chopper exterior outright, so every
  // other player is the only one paying for its shadow casters. One merged
  // low-detail silhouette replaces the authored mesh set in the shadow map.
  it('bakes the coarsest authored level into one shared caster silhouette', () => {
    expect(SUPPORT_VEHICLE_SHADOW_SILHOUETTE_LEVEL).toBe(2);
    expect(authoredSupportShadowSilhouetteLevel(3)).toBe(2);
    expect(authoredSupportShadowSilhouetteLevel(2)).toBe(1);
    expect(authoredSupportShadowSilhouetteLevel(1)).toBe(0);
    expect(authoredSupportShadowSilhouetteLevel(0)).toBe(-1);

    const source = new THREE.Group();
    source.name = 'pass65-chopper-gunner-authored-lod2';
    source.scale.setScalar(2);
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_Armor_PBR' }),
    );
    hull.name = 'chopper-fuselage';
    hull.position.set(1, 0, 0);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(40, 40, 40),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_CanopyGlass' }),
    );
    glass.name = 'chopper-sleek-cockpit-canopy';
    const rotor = new THREE.Group();
    rotor.name = 'chopper-main-rotor';
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(60, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_RotorBlade' }),
    );
    rotor.add(blade);
    const cockpit = new THREE.Group();
    cockpit.name = 'chopper-first-person-cockpit';
    cockpit.userData.firstPersonOnly = true;
    const cockpitMesh = new THREE.Mesh(
      new THREE.BoxGeometry(30, 30, 30),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_Gunmetal' }),
    );
    cockpit.add(cockpitMesh);
    source.add(hull, glass, rotor, cockpit);

    const merged = mergeAuthoredSupportShadowSilhouette(source, 'chopper');
    expect(merged).not.toBeNull();
    // Exactly the hull: glass is not an admitted caster material, the rotor is
    // animated and the cockpit is first-person only. One non-indexed,
    // position-only triangle soup, with the authored level scale baked in.
    expect(Object.keys(merged!.attributes)).toEqual(['position']);
    expect(merged!.getIndex()).toBeNull();
    expect(merged!.getAttribute('position').count).toBe(36);
    expect(merged!.boundingBox!.min.toArray()).toEqual([0, -1, -1]);
    expect(merged!.boundingBox!.max.toArray()).toEqual([4, 1, 1]);
    // Shared across every presented instance, so pooled retirement must not
    // dispose it out from under a live root.
    expect(typeof merged!.userData[GPU_SHARED_GEOMETRY_KEY]).toBe('string');

    const rotorsOnly = new THREE.Group();
    const orphanRotor = new THREE.Group();
    orphanRotor.name = 'chopper-tail-rotor';
    orphanRotor.add(new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_RotorBlade' }),
    ));
    rotorsOnly.add(orphanRotor);
    expect(mergeAuthoredSupportShadowSilhouette(rotorsOnly, 'chopper')).toBeNull();

    merged!.dispose();
  });

  // HF-336: the baked shadow soup is decimated toward an 800-1500 triangle
  // outline budget - a 2048x2048 shadow map reads the silhouette, not airframe
  // detail. The budget constant itself is pinned, and a dense synthetic
  // airframe-sized source must come out inside the pinned band while small
  // fixtures stay untouched.
  it('HF-336: decimates the baked shadow silhouette into the pinned outline budget', () => {
    const presentation = readFileSync(resolve(__dirname, 'killstreak-presentation.ts'), 'utf8');
    expect(presentation).toContain('const SUPPORT_SHADOW_SILHOUETTE_TRIANGLE_BUDGET = 1_200;');
    // The decimation must run at bake time, before caching, so the cached
    // geometry is already the reduced one and no per-frame work exists.
    const mergeStart = presentation.indexOf('export function mergeAuthoredSupportShadowSilhouette(');
    const cacheStart = presentation.indexOf('const supportShadowSilhouetteGeometries =');
    const mergeBody = presentation.slice(mergeStart, cacheStart);
    expect(mergeBody).toContain('decimateSupportShadowSilhouetteTriangles(positions)');
    expect(presentation.indexOf('decimateSupportShadowSilhouetteTriangles')).toBeGreaterThan(-1);

    // Dense source: ~2,000 distinct triangles of hull plating spread across a
    // chopper-scale (~8m) extent. Must decimate into the pinned band.
    const dense = new THREE.Group();
    const plating = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_Armor_PBR' }),
    );
    dense.add(plating);
    let densePositions: number[] = [];
    {
      const source = plating.geometry.getAttribute('position');
      const index = plating.geometry.getIndex()!;
      const baseTriangles = index.count / 3;
      const copies = Math.ceil(2000 / baseTriangles);
      // Spread each copy across the plate on a 0.05 grid - dense enough to
      // exercise welding, sparse enough that ~2,000 distinct triangles land
      // in distinct cells at the finest cluster ratio.
      for (let copy = 0; copy < copies; copy += 1) {
        const ox = ((copy % 45) - 22) * 0.05;
        const oy = Math.floor(copy / 45) * 0.05;
        for (let cursor = 0; cursor < index.count; cursor += 1) {
          const vi = index.getX(cursor);
          densePositions.push(
            source.getX(vi) + ox,
            source.getY(vi) + oy,
            source.getZ(vi),
          );
        }
      }
    }
    const denseGeometry = new THREE.BufferGeometry();
    denseGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(densePositions), 3));
    plating.geometry.dispose();
    // Swap in the dense position-only soup; cast through unknown because
    // mergeAuthoredSupportShadowSilhouette only reads the position attribute.
    (plating as unknown as { geometry: THREE.BufferGeometry }).geometry = denseGeometry;
    const decimated = mergeAuthoredSupportShadowSilhouette(dense, 'chopper')!;
    const decimatedTriangles = decimated.getAttribute('position').count / 3;
    expect(decimatedTriangles).toBeGreaterThanOrEqual(800);
    expect(decimatedTriangles).toBeLessThanOrEqual(1500);
    decimated.dispose();

    // Small fixtures are already inside the budget: pass-through unchanged.
    const tiny = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'MAT_Pass65Chopper_Armor_PBR' }),
    );
    tiny.add(plate);
    const passthrough = mergeAuthoredSupportShadowSilhouette(tiny, 'chopper')!;
    expect(passthrough.getAttribute('position').count).toBe(36);
    passthrough.dispose();
  });
});

describe('authored support LOD prewarm bands', () => {
  it('pins the current thresholds and derives one production-scale rehearsal inside every band', () => {
    // HF-336: re-tuned from [0, 95, 190] so LOD1/LOD2 engage at the chopper's
    // 25-35m operating altitude instead of forcing LOD0 at every range.
    expect(SUPPORT_VEHICLE_LOD_DISTANCES).toEqual([0, 36, 75]);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[0]).toBeCloseTo(8.4 * 1.2);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[0]).toBeGreaterThan(SUPPORT_VEHICLE_LOD_DISTANCES[0]);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[0]).toBeLessThan(SUPPORT_VEHICLE_LOD_DISTANCES[1]);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[1]).toBeGreaterThan(SUPPORT_VEHICLE_LOD_DISTANCES[1]);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[1]).toBeLessThan(SUPPORT_VEHICLE_LOD_DISTANCES[2]);
    expect(SUPPORT_VEHICLE_PREWARM_DISTANCES[2]).toBeGreaterThan(SUPPORT_VEHICLE_LOD_DISTANCES[2]);
  });

  it('derives farther rehearsals from changed thresholds instead of retaining stale hard-coded distances', () => {
    const changed = deriveSupportVehiclePrewarmDistances([0, 120, 300]);
    expect(changed).toEqual([8.4 * 1.2, 210, 390]);
    expect(changed).not.toEqual(SUPPORT_VEHICLE_PREWARM_DISTANCES);
  });
});

describe('stable authored airframe review bounds', () => {
  it('excludes transient weapon actions and first-person meshes from the fitted exterior bounds', () => {
    const root = new THREE.Group();
    const scene = new THREE.Scene();
    const presentationParent = new THREE.Group();
    scene.add(presentationParent);
    presentationParent.add(root);
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 3), new THREE.MeshBasicMaterial());
    body.name = 'chopper-fuselage';
    const tracer = new THREE.Group();
    tracer.name = 'chopper-tracer-action';
    const tracerMesh = new THREE.Mesh(new THREE.BoxGeometry(80, 0.05, 0.05), new THREE.MeshBasicMaterial());
    tracerMesh.position.x = -40;
    tracer.add(tracerMesh);
    const cockpit = new THREE.Group();
    cockpit.name = 'chopper-first-person-cockpit';
    cockpit.userData.firstPersonOnly = true;
    const cockpitMesh = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 1), new THREE.MeshBasicMaterial());
    cockpitMesh.position.x = 20;
    cockpit.add(cockpitMesh);
    root.add(body, tracer, cockpit);

    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.08, 180);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const stable = supportVehicleStableAirframeBounds(root, camera, scene);
    expect(stable.meshCount).toBe(1);
    expect(stable.bounds).toEqual({ min: [-4, -1, -1.5], max: [4, 1, 1.5] });
    expect(stable.drawableMeshCount).toBe(1);
    expect(stable.drawableBounds).toEqual(stable.bounds);
    expect(stable.drawRejections).toEqual({ hierarchy: 0, layer: 0, material: 0, frustum: 0 });

    body.layers.set(3);
    expect(supportVehicleStableAirframeBounds(root, camera, scene)).toMatchObject({
      meshCount: 1,
      drawableMeshCount: 0,
      drawableBounds: null,
      drawRejections: { hierarchy: 0, layer: 1, material: 0, frustum: 0 },
    });
    body.layers.set(0);
    (body.material as THREE.Material).colorWrite = false;
    expect(supportVehicleStableAirframeBounds(root, camera, scene)).toMatchObject({
      drawableMeshCount: 0,
      drawRejections: { hierarchy: 0, layer: 0, material: 1, frustum: 0 },
    });
    (body.material as THREE.Material).colorWrite = true;
    presentationParent.visible = false;
    expect(supportVehicleStableAirframeBounds(root, camera, scene)).toMatchObject({
      drawableMeshCount: 0,
      drawRejections: { hierarchy: 1, layer: 0, material: 0, frustum: 0 },
    });
    presentationParent.visible = true;
    body.position.x = 1_000;
    expect(supportVehicleStableAirframeBounds(root, camera, scene)).toMatchObject({
      drawableMeshCount: 0,
      drawRejections: { hierarchy: 0, layer: 0, material: 0, frustum: 1 },
    });
    body.position.x = 0;
    const detachedScene = new THREE.Scene();
    detachedScene.add(presentationParent);
    expect(supportVehicleStableAirframeBounds(root, camera, scene)).toMatchObject({
      meshCount: 1,
      drawableMeshCount: 0,
      drawableBounds: null,
      drawRejections: { hierarchy: 1, layer: 0, material: 0, frustum: 0 },
    });

    body.geometry.dispose();
    tracerMesh.geometry.dispose();
    cockpitMesh.geometry.dispose();
    (body.material as THREE.Material).dispose();
    (tracerMesh.material as THREE.Material).dispose();
    (cockpitMesh.material as THREE.Material).dispose();
  });
});

describe('authored Chopper runtime readability', () => {
  it('adds bounded physical self-fill and makes only the MFD backplates dark glass', () => {
    const root = new THREE.Group();
    const armorTexture = new THREE.Texture();
    const armor = new THREE.MeshStandardMaterial({ color: 0x17211a, emissiveMap: armorTexture });
    armor.name = 'MAT_Pass65Chopper_Armor_PBR';
    const cyanDisplay = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff });
    cyanDisplay.name = 'MAT_Pass65Chopper_CyanDisplay';
    const unrelated = new THREE.MeshStandardMaterial({ color: 0x123456, opacity: 1 });
    unrelated.name = 'MAT_Unrelated';
    const rear = new THREE.Group();
    rear.name = 'chopper-rear-fuselage';
    const rearMesh = new THREE.Mesh(new THREE.BoxGeometry(), armor);
    rear.add(rearMesh);
    const tail = new THREE.Group();
    tail.name = 'chopper-tail-boom';
    const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(), armor);
    tail.add(tailMesh);
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(), armor),
      new THREE.Mesh(new THREE.BoxGeometry(), cyanDisplay),
      new THREE.Mesh(new THREE.BoxGeometry(), unrelated),
      rear,
      tail,
    );

    applyAuthoredChopperReadability(root);
    const rearTailArmor = rearMesh.material as THREE.MeshStandardMaterial;
    const firstVersions = [armor.version, cyanDisplay.version, unrelated.version];
    const rearTailVersion = rearTailArmor.version;
    applyAuthoredChopperReadability(root);

    expect(armor.emissiveMap).toBeNull();
    expect(armor.emissive.getHex()).toBe(0x4d8a68);
    expect(armor.emissiveIntensity).toBe(0.7);
    expect(armor.transparent).toBe(false);
    expect(rearTailArmor).not.toBe(armor);
    expect(tailMesh.material).toBe(rearTailArmor);
    expect(rearMesh.material).toBe(rearTailArmor);
    expect(rearTailArmor.version).toBe(rearTailVersion);
    expect(rearTailArmor.name).toBe('MAT_Pass65Chopper_RearTailArmor_PBR');
    expect(rearTailArmor.map).toBe(armor.map);
    expect(rearTailArmor.normalMap).toBe(armor.normalMap);
    expect(rearTailArmor.roughnessMap).toBe(armor.roughnessMap);
    expect(rearTailArmor.emissiveMap).toBeNull();
    expect(rearTailArmor.emissive.getHex()).toBe(0x6f916d);
    expect(rearTailArmor.emissiveIntensity).toBe(0.95);
    expect(rearTailArmor.roughness).toBeGreaterThanOrEqual(0.78);
    expect(rearTailArmor.metalness).toBeLessThanOrEqual(0.28);
    expect(cyanDisplay.color.getHex()).toBe(0x02090c);
    expect(cyanDisplay.emissive.getHex()).toBe(0x00465d);
    expect(cyanDisplay.emissiveIntensity).toBe(0.34);
    expect(cyanDisplay.transparent).toBe(true);
    expect(cyanDisplay.opacity).toBe(0.38);
    expect(cyanDisplay.depthWrite).toBe(false);
    expect(unrelated.color.getHex()).toBe(0x123456);
    expect(unrelated.opacity).toBe(1);
    expect([armor.version, cyanDisplay.version, unrelated.version]).toEqual(firstVersions);

    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.geometry.dispose();
    });
    armor.dispose();
    cyanDisplay.dispose();
    unrelated.dispose();
    rearTailArmor.dispose();
    armorTexture.dispose();
  });
});

describe('authored support preparation scheduling', () => {
  it('dequantizes every transform-bearing attribute before static-batch transforms without mutating the source', () => {
    const quantized = new THREE.BufferGeometry();
    const position = new THREE.Int16BufferAttribute(new Int16Array([
      -32_767, -32_767, -32_767,
      32_767, -32_767, -32_767,
      0, 32_767, 32_767,
    ]), 3, true);
    const normal = new THREE.Int8BufferAttribute(new Int8Array([
      0, 0, 127,
      0, 0, 127,
      0, 0, 127,
    ]), 3, true);
    const tangent = new THREE.Int8BufferAttribute(new Int8Array([
      127, 0, 0, 127,
      127, 0, 0, 127,
      127, 0, 0, 127,
    ]), 4, true);
    const compactUv = new THREE.Uint16BufferAttribute(new Uint16Array([
      0, 0, 65_535, 0, 32_768, 65_535,
    ]), 2, true);
    quantized.setAttribute('position', position);
    quantized.setAttribute('normal', normal);
    quantized.setAttribute('tangent', tangent);
    quantized.setAttribute('uv', compactUv);
    quantized.setIndex([0, 1, 2]);
    quantized.addGroup(0, 3, 0);
    quantized.userData.semantic = 'quantized-support-fixture';
    const sourcePosition = new Int16Array(position.array);

    const transformed = cloneAuthoredSupportStaticGeometryForTransform(
      quantized,
      new THREE.Matrix4().compose(
        new THREE.Vector3(6, 2, 4),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
        new THREE.Vector3(2, 1, 3),
      ),
    );

    for (const name of ['position', 'normal', 'tangent'] as const) {
      const attribute = transformed.getAttribute(name);
      expect(attribute.array).toBeInstanceOf(Float32Array);
      expect(attribute.normalized).toBe(false);
    }
    expect(transformed.getAttribute('uv').array).toBeInstanceOf(Uint16Array);
    expect(transformed.getAttribute('uv').normalized).toBe(true);
    expect(transformed.index?.array).toEqual(quantized.index?.array);
    expect(transformed.groups).toEqual(quantized.groups);
    expect(transformed.userData).toEqual(quantized.userData);
    expect(position.array).toEqual(sourcePosition);
    expect(position.normalized).toBe(true);
    expect(new THREE.Box3().setFromBufferAttribute(
      transformed.getAttribute('position') as THREE.BufferAttribute,
    )).toMatchObject({
      min: { x: 3, y: 1, z: 2 },
      max: { x: 9, y: 3, z: 6 },
    });
    expect(transformed.boundingBox).toMatchObject({
      min: { x: 3, y: 1, z: 2 },
      max: { x: 9, y: 3, z: 6 },
    });
    expect(transformed.boundingSphere?.center.toArray()).toEqual([6, 2, 4]);
    expect(transformed.boundingSphere?.radius).toBeCloseTo(Math.sqrt(14));

    quantized.dispose();
    transformed.dispose();
  });

  it('fails closed instead of static-batching future morph-target support geometry', () => {
    const source = new THREE.BoxGeometry();
    source.morphAttributes.position = [source.getAttribute('position').clone()];
    expect(authoredSupportStaticGeometryCanBatch(source)).toBe(false);
    expect(() => cloneAuthoredSupportStaticGeometryForTransform(source, new THREE.Matrix4()))
      .toThrow('rejects morph-target geometry');
    source.dispose();
  });

  it('preserves translated quantized rear-cabin and tail-boom overlap in batch-anchor space', () => {
    const quantizedSegment = (): THREE.BufferGeometry => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Int16BufferAttribute(new Int16Array([
        -32_767, -32_767, -32_767,
        32_767, -32_767, -32_767,
        32_767, 32_767, 32_767,
        -32_767, 32_767, 32_767,
      ]), 3, true));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      return geometry;
    };
    const rearSource = quantizedSegment();
    const tailSource = quantizedSegment();
    const rear = cloneAuthoredSupportStaticGeometryForTransform(
      rearSource,
      new THREE.Matrix4().makeScale(1, 1, 1.25).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 2)),
    );
    const tail = cloneAuthoredSupportStaticGeometryForTransform(
      tailSource,
      new THREE.Matrix4().makeScale(0.6, 0.6, 1.25).premultiply(new THREE.Matrix4().makeTranslation(0, 0, 4)),
    );
    const rearBounds = new THREE.Box3().setFromBufferAttribute(rear.getAttribute('position') as THREE.BufferAttribute);
    const tailBounds = new THREE.Box3().setFromBufferAttribute(tail.getAttribute('position') as THREE.BufferAttribute);
    const union = rearBounds.clone().union(tailBounds);

    expect(rearBounds.min.z).toBeCloseTo(0.75);
    expect(rearBounds.max.z).toBeCloseTo(3.25);
    expect(tailBounds.min.z).toBeCloseTo(2.75);
    expect(tailBounds.max.z).toBeCloseTo(5.25);
    expect(Math.min(rearBounds.max.z, tailBounds.max.z) - Math.max(rearBounds.min.z, tailBounds.min.z))
      .toBeCloseTo(0.5);
    expect(union.min.z).toBeCloseTo(0.75);
    expect(union.max.z).toBeCloseTo(5.25);
    expect(rearSource.getAttribute('position').array).toBeInstanceOf(Int16Array);
    expect(tailSource.getAttribute('position').array).toBeInstanceOf(Int16Array);

    rearSource.dispose();
    tailSource.dispose();
    rear.dispose();
    tail.dispose();
  });

  it('optimizes retained LOD templates once and keeps runtime pool construction clone-only', () => {
    const source = readFileSync(new URL('./killstreak-presentation.ts', import.meta.url), 'utf8');
    const loadLod = source.slice(
      source.indexOf('function loadSupportVehicleLod('),
      source.indexOf('async function allSettledBounded'),
    );
    const buildVehicle = source.slice(
      source.indexOf('function buildAuthoredSupportVehicle('),
      source.indexOf('function buildProceduralChopperFallback('),
    );
    expect(loadLod).toContain('await optimizeAuthoredSupportLevel(scene, family, gltf.animations);');
    expect(buildVehicle).toContain('const level = source.scene.clone(true);');
    expect(buildVehicle).not.toContain('optimizeAuthoredSupportLevel(');
    expect(source).toContain('level.userData.supportStaticBatchOptimized = true;');
    expect(source).not.toContain('source.geometry.clone().applyMatrix4(localMatrix)');
    expect(source.match(/cloneAuthoredSupportStaticGeometryForTransform\(source\.geometry, localMatrix\)/gu))
      .toHaveLength(2);
    expect(source).not.toContain("batchAuthoredSupportStaticMeshes(mainWing, family, 'main-wing')");
    expect(source).toContain('mainWing.userData.supportStaticBatchBoundary = true;');
  });

  it('requires a visible rendered aircraft wing span, not merely an empty semantic node', () => {
    const aircraft = new THREE.Group();
    const wing = new THREE.Group();
    wing.name = 'care-aircraft-main-wing';
    const wingMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 2), new THREE.MeshBasicMaterial());
    wingMesh.name = 'care-main-wing-visible-batch';
    wing.add(wingMesh);
    aircraft.add(wing);
    expect(supportAircraftWingVisibility(aircraft, 'care')).toMatchObject({
      passed: true,
      visibleMeshCount: 1,
      contract: 'visible-rendered-wing-span-v1',
    });
    wingMesh.visible = false;
    expect(supportAircraftWingVisibility(aircraft, 'care')).toMatchObject({ passed: false, visibleMeshCount: 0 });
  });

  it('finishes cooperative pool preparation when hidden-tab animation frames are suspended', async () => {
    const suspendedAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', suspendedAnimationFrame);
    const presentation = new KillstreakPresentation(new THREE.Scene());
    let watchdog: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      await Promise.race([
        presentation.prewarmAuthoredAssets(),
        new Promise<never>((_, reject) => {
          watchdog = globalThis.setTimeout(() => reject(new Error('preparation waited for a hidden-tab animation frame')), 10_000);
        }),
      ]);
      expect(suspendedAnimationFrame).not.toHaveBeenCalled();
      expect(presentation.telemetry().prewarmed).toBe(6);
    } finally {
      if (watchdog !== undefined) globalThis.clearTimeout(watchdog);
      presentation.dispose();
      vi.unstubAllGlobals();
    }
  });
});

const snapshot = (
  count: number,
  sensorContacts: KillstreakRecipientSnapshot['sensorContacts'] = [],
  placementMarkers: KillstreakRecipientSnapshot['placementMarkers'] = [],
): KillstreakRecipientSnapshot => ({
  schemaVersion: 3,
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
    gunProfileId: index <= 2 ? null : DRONE_SWARM_GUN_PROFILE_ID,
    gunController: index === 0 ? 'ai' : null,
    missileAmmo: index === 0 ? 6 : null,
    missileCooldownMs: index === 0 ? 0 : null,
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
  it('uses storage-backed swarm matrices only for the WebGPU presentation path', () => {
    const webGpuPresentation = new KillstreakPresentation(new THREE.Scene(), undefined, true);
    const webGlPresentation = new KillstreakPresentation(new THREE.Scene());
    const webGpuBatch = webGpuPresentation.root.getObjectByName('pass65-swarm-instanced-batch-1') as THREE.InstancedMesh;
    const webGlBatch = webGlPresentation.root.getObjectByName('pass65-swarm-instanced-batch-1') as THREE.InstancedMesh;
    expect((webGpuBatch.instanceMatrix as THREE.InstancedBufferAttribute & { isStorageInstancedBufferAttribute?: boolean })
      .isStorageInstancedBufferAttribute).toBe(true);
    expect((webGlBatch.instanceMatrix as THREE.InstancedBufferAttribute & { isStorageInstancedBufferAttribute?: boolean })
      .isStorageInstancedBufferAttribute).not.toBe(true);
    webGpuPresentation.dispose();
    webGlPresentation.dispose();
  });

  it('renders every legal chopper plus 24-drone batch atomically on WebGPU and WebGL', () => {
    for (const useStorageSwarmMatrices of [true, false]) {
      const presentation = new KillstreakPresentation(new THREE.Scene(), undefined, useStorageSwarmMatrices);
      const overlapBatchCount = presentation.telemetry().swarmRenderBatches;
      presentation.sync(snapshot(27), 1_000);
      expect(presentation.telemetry()).toMatchObject({
        entities: 27,
        swarmRenderedInstances: 24,
        swarmVisibleRenderBatches: overlapBatchCount,
        swarmMinimumRenderedInstances: 24,
        swarmMaximumRenderedInstances: 24,
      });
      expect(presentation.root.children.filter((node) => (
        node.userData.swarmInstancedPresentation === true && node.visible && (node as THREE.InstancedMesh).count === 24
      ))).toHaveLength(overlapBatchCount);
      presentation.sync(snapshot(1), 1_016);
      expect(presentation.telemetry()).toMatchObject({
        swarmRenderedInstances: 0,
        swarmVisibleRenderBatches: 0,
        swarmMinimumRenderedInstances: 0,
        swarmMaximumRenderedInstances: 0,
      });
      presentation.dispose();
    }
  });

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
      textureDedup: {
        canonicalTextureCount: 0,
        reusedTextureCount: 0,
        estimatedActiveTextureBytes: 0,
        estimatedAvoidedTextureBytes: 0,
      },
    });
    expect(supportAircraftPresentationVariant('ks-9-care-aircraft-12')).toBe('care');
    expect(supportAircraftPresentationVariant('ks-9-carpet-aircraft-13')).toBe('carpet');
    expect(supportAircraftPresentationVariant('malformed-aircraft')).toBeNull();
  });

  it('canonicalizes byte-identical safe textures and releases only detached duplicate image sources', () => {
    expect(SUPPORT_VEHICLE_TEXTURE_MEMORY_EXPECTATION).toEqual({
      authoredTextureCount: 44,
      expectedCanonicalTextureCount: 5,
      decodedBytesPerTexture: 1_398_100,
      expectedActiveTextureBytes: 6_990_500,
      expectedAvoidedTextureBytes: 54_525_900,
    });
    const canonicalizer = new SupportVehicleTextureCanonicalizer();
    const canonicalClose = vi.fn();
    const duplicateClose = vi.fn();
    const canonicalImage = { width: 512, height: 512, close: canonicalClose };
    const canonicalTexture = new THREE.Texture(canonicalImage);
    canonicalTexture.name = 'pass65-support-aircraft-albedo';
    canonicalTexture.colorSpace = THREE.SRGBColorSpace;
    canonicalTexture.userData.mimeType = 'image/webp';
    const canonicalMaterial = new THREE.MeshStandardMaterial({ map: canonicalTexture });
    const canonicalRoot = new THREE.Group();
    canonicalRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), canonicalMaterial));
    canonicalizer.canonicalize(canonicalRoot, new Map([[canonicalTexture, 'sha256:identical']]));

    const duplicateTexture = new THREE.Texture({ width: 512, height: 512, close: duplicateClose });
    duplicateTexture.name = 'pass65-chopper-albedo-name-does-not-affect-safety';
    duplicateTexture.colorSpace = THREE.SRGBColorSpace;
    duplicateTexture.userData.mimeType = 'image/webp';
    const duplicateDispose = vi.spyOn(duplicateTexture, 'dispose');
    const duplicateMaterial = new THREE.MeshStandardMaterial({ map: duplicateTexture });
    const duplicateRoot = new THREE.Group();
    duplicateRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), duplicateMaterial));
    canonicalizer.canonicalize(duplicateRoot, new Map([[duplicateTexture, 'sha256:identical']]));

    const sharedSourceTexture = new THREE.Texture(canonicalImage);
    sharedSourceTexture.colorSpace = THREE.SRGBColorSpace;
    sharedSourceTexture.userData.mimeType = 'image/webp';
    const sharedSourceDispose = vi.spyOn(sharedSourceTexture, 'dispose');
    const sharedSourceMaterial = new THREE.MeshStandardMaterial({ map: sharedSourceTexture });
    const sharedSourceRoot = new THREE.Group();
    sharedSourceRoot.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedSourceMaterial));
    canonicalizer.canonicalize(sharedSourceRoot, new Map([[sharedSourceTexture, 'sha256:identical']]));

    expect(duplicateMaterial.map).toBe(canonicalTexture);
    expect(sharedSourceMaterial.map).toBe(canonicalTexture);
    expect(duplicateDispose).toHaveBeenCalledOnce();
    expect(sharedSourceDispose).toHaveBeenCalledOnce();
    expect(duplicateClose).toHaveBeenCalledOnce();
    expect(canonicalClose).not.toHaveBeenCalled();
    expect(canonicalizer.telemetry()).toEqual({
      canonicalTextureCount: 1,
      reusedTextureCount: 2,
      disposedDuplicateTextureCount: 2,
      closedDuplicateImageCount: 1,
      ineligibleTextureCount: 0,
      estimatedActiveTextureBytes: 1_398_100,
      estimatedAvoidedTextureBytes: 2_796_200,
    });
  });

  it('never merges a content match across semantic, colour-space, sampler, or albedo-digest boundaries', () => {
    const canonicalizer = new SupportVehicleTextureCanonicalizer();
    const makeTexture = (colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace): THREE.Texture => {
      const texture = new THREE.Texture({ width: 512, height: 512 });
      texture.colorSpace = colorSpace;
      texture.userData.mimeType = 'image/webp';
      return texture;
    };
    const add = (
      texture: THREE.Texture,
      property: 'map' | 'normalMap',
      digest: string,
    ): THREE.MeshStandardMaterial => {
      const material = new THREE.MeshStandardMaterial();
      material[property] = texture;
      const root = new THREE.Group();
      root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
      canonicalizer.canonicalize(root, new Map([[texture, digest]]));
      return material;
    };

    const baseline = makeTexture();
    const semanticMismatch = makeTexture();
    const colorSpaceMismatch = makeTexture(THREE.NoColorSpace);
    const samplerMismatch = makeTexture();
    samplerMismatch.minFilter = THREE.LinearFilter;
    const distinctAlbedo = makeTexture();
    const baselineMaterial = add(baseline, 'map', 'sha256:same-bytes');
    const semanticMaterial = add(semanticMismatch, 'normalMap', 'sha256:same-bytes');
    const colorSpaceMaterial = add(colorSpaceMismatch, 'map', 'sha256:same-bytes');
    const samplerMaterial = add(samplerMismatch, 'map', 'sha256:same-bytes');
    const distinctAlbedoMaterial = add(distinctAlbedo, 'map', 'sha256:different-albedo');

    expect(baselineMaterial.map).toBe(baseline);
    expect(semanticMaterial.normalMap).toBe(semanticMismatch);
    expect(colorSpaceMaterial.map).toBe(colorSpaceMismatch);
    expect(samplerMaterial.map).toBe(samplerMismatch);
    expect(distinctAlbedoMaterial.map).toBe(distinctAlbedo);
    expect(canonicalizer.telemetry()).toMatchObject({
      canonicalTextureCount: 5,
      reusedTextureCount: 0,
      disposedDuplicateTextureCount: 0,
      estimatedActiveTextureBytes: 6_990_500,
      estimatedAvoidedTextureBytes: 0,
    });
  });

  it('GPU-prewarms every bounded resource family once and restores exact pooled state', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
    const chopper = presentation.root.getObjectByName('prewarmed-chopper-1') as THREE.Group;
    const chopperChild = chopper.getObjectByName('chopper-cockpit-hud-glass')!;
    const chopperFuselage = chopper.getObjectByName('chopper-fuselage')!;
    const chopperRearFuselage = chopper.getObjectByName('chopper-rear-fuselage')!;
    const chopperMainRotor = chopper.getObjectByName('chopper-main-rotor')!;
    const dashboard = chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh;
    const gunnerHudMaterial = (chopperChild as THREE.Mesh).material as THREE.Material;
    const chopperChildLayerMask = chopperChild.layers.mask;
    chopper.scale.set(2, 3, 4);
    chopper.frustumCulled = true;
    chopperChild.visible = false;
    chopperChild.frustumCulled = true;
    const lod = new THREE.LOD();
    lod.name = 'prewarm-test-authored-lod';
    const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const lod1 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const lod2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    lod0.visible = false;
    lod1.visible = true;
    lod2.visible = false;
    lod.addLevel(lod0, SUPPORT_VEHICLE_LOD_DISTANCES[0]);
    lod.addLevel(lod1, SUPPORT_VEHICLE_LOD_DISTANCES[1]);
    lod.addLevel(lod2, SUPPORT_VEHICLE_LOD_DISTANCES[2]);
    lod.autoUpdate = true;
    chopper.add(lod);
    presentation.clear();
    const swarmBatches = presentation.root.children.filter((node): node is THREE.InstancedMesh => (
      node instanceof THREE.InstancedMesh && node.userData.swarmInstancedPresentation === true
    ));
    expect(swarmBatches).not.toHaveLength(0);
    expect(swarmBatches.every((batch) => batch.count === 0)).toBe(true);
    const swarmMatricesBefore = swarmBatches.map((batch) => new Float32Array(batch.instanceMatrix.array));
    const telemetryBefore = presentation.telemetry();
    let compilePass = 0;
    const compileAndRender = vi.fn(async (root: THREE.Object3D, stagedCamera: THREE.Camera, parentScene: THREE.Scene) => {
      compilePass += 1;
      expect(root).toBe(presentation.root);
      expect(stagedCamera).toBe(camera);
      expect(parentScene).toBe(scene);
      expect(chopper.scale.toArray()).toEqual([2, 3, 4]);
      expect(chopper.frustumCulled).toBe(compilePass >= 2);
      expect(chopperChild.frustumCulled).toBe(compilePass >= 2);
      expect(swarmBatches.every((batch) => batch.count === 24)).toBe(true);
      if (compilePass === 1) {
        expect(chopper.visible).toBe(true);
        expect(chopperChild.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-swarm-drone-1')?.visible).toBe(false);
        expect(presentation.root.getObjectByName('prewarmed-swarm-drone-24')?.visible).toBe(false);
        expect(presentation.root.getObjectByName('pass65-swarm-instanced-batch-1')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('pass65-swarm-instanced-batch-12')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('pass65-impact-flash-pool-20')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('pass65-bomb-shell-pool-20')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('pass65-ember-pool-120')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('piloted-drone-hostile-sensor-16')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-support-placement-ground-x')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-support-placement-corridor')?.visible).toBe(true);
        expect(lod.autoUpdate).toBe(false);
        expect(lod0.visible).toBe(true);
        expect(lod1.visible).toBe(true);
        expect(lod2.visible).toBe(true);
        expect(camera.far).toBe(180);
        expect(chopperFuselage.visible).toBe(true);
        expect(chopperChild.layers.mask).toBe(chopperChildLayerMask);
        expect(gunnerHudMaterial.depthWrite).toBe(true);
        presentation.clear();
        expect(swarmBatches.every((batch) => batch.count === 24)).toBe(true);
        expect(chopper.visible).toBe(true);
      } else if (compilePass >= 2 && compilePass <= 4) {
        expect(chopper.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-swarm-drone-1')?.visible).toBe(false);
        expect(presentation.root.getObjectByName('prewarmed-swarm-drone-24')?.visible).toBe(false);
        expect(presentation.root.getObjectByName('pass65-swarm-instanced-batch-1')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('pass65-swarm-instanced-batch-12')?.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-care-aircraft-1')?.visible).toBe(false);
        expect(lod.autoUpdate).toBe(true);
        expect([lod0.visible, lod1.visible, lod2.visible].filter(Boolean)).toHaveLength(1);
        expect(
          [lod0, lod1, lod2][compilePass - 2]!.visible,
          `compile pass ${compilePass} selected synthetic LOD ${lod.getCurrentLevel()}`,
        ).toBe(true);
        expect(camera.far).toBeGreaterThan(SUPPORT_VEHICLE_PREWARM_DISTANCES[2]);
        expect(gunnerHudMaterial.depthWrite).toBe(true);
        expect(chopperChild.layers.mask).toBe(chopperChildLayerMask);
      } else {
        expect(compilePass).toBe(5);
        expect(chopper.visible).toBe(true);
        expect(presentation.root.getObjectByName('prewarmed-swarm-drone-24')?.visible).toBe(false);
        expect(chopperFuselage.visible).toBe(false);
        expect(chopperRearFuselage.visible).toBe(false);
        expect(chopperMainRotor.children.every((node) => !node.visible)).toBe(true);
        expect(dashboard.visible).toBe(true);
        expect(chopperChild.visible).toBe(true);
        expect(chopperChild.layers.mask & (1 << 2)).not.toBe(0);
        expect(chopperChild.layers.mask & (1 << 0)).toBe(0);
        expect(gunnerHudMaterial.depthWrite).toBe(false);
        expect(camera.far).toBe(180);
      }
    });
    await Promise.all([
      presentation.prewarm({ compileAndRender }, camera),
      presentation.prewarm({ compileAndRender }, camera),
    ]);
    await presentation.prewarm({ compileAndRender }, camera);
    expect(compileAndRender).toHaveBeenCalledTimes(5);
    expect(chopper.visible).toBe(false);
    expect(chopper.scale.toArray()).toEqual([2, 3, 4]);
    expect(chopper.frustumCulled).toBe(true);
    expect(chopperChild.visible).toBe(false);
    expect(chopperChild.frustumCulled).toBe(true);
    expect(lod.autoUpdate).toBe(true);
    expect(lod0.visible).toBe(false);
    expect(lod1.visible).toBe(true);
    expect(lod2.visible).toBe(false);
    expect(camera.far).toBe(180);
    expect(gunnerHudMaterial.depthWrite).toBe(true);
    expect(chopperChild.layers.mask).toBe(chopperChildLayerMask);
    expect(swarmBatches.every((batch) => batch.count === 0)).toBe(true);
    for (let index = 0; index < swarmBatches.length; index += 1) {
      expect(Array.from(swarmBatches[index]!.instanceMatrix.array)).toEqual(Array.from(swarmMatricesBefore[index]!));
    }
    expect(presentation.root.getObjectByName('prewarmed-support-placement-ground-x')).toBeUndefined();
    expect(presentation.root.getObjectByName('prewarmed-support-placement-corridor')).toBeUndefined();
    expect(presentation.telemetry()).toEqual(telemetryBefore);
    presentation.dispose();
  });

  it('coalesces the complete native browser support vocabulary into one fenced submission', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera();
    vi.stubGlobal('document', {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    try {
      const compileAndRender = vi.fn(async () => undefined);
      await presentation.prewarm({ compileAndRender }, camera, 12);
      // Complete vocabulary, three exact live LOD bands, possessed cockpit.
      expect(compileAndRender).toHaveBeenCalledTimes(5);
    } finally {
      vi.unstubAllGlobals();
      presentation.dispose();
    }
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
    await expect(presentation.prewarmAuthoredAssets()).rejects.toThrow('during GPU prewarm');
    releasePrewarm();
    await inFlight;

    await presentation.prewarmAuthoredAssets();
    const rebuiltRuntime = { compileAndRender: vi.fn(async () => undefined) };
    await presentation.prewarm(rebuiltRuntime, camera);
    expect(rebuiltRuntime.compileAndRender).toHaveBeenCalledTimes(5);
    presentation.dispose();
    await expect(presentation.prewarm(rebuiltRuntime, camera)).rejects.toThrow('disposed');
  }, 15_000);

  it('rewarms the scene-dependent variants exactly once for each arena generation', async () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const camera = new THREE.PerspectiveCamera();
    const compileAndRender = vi.fn(async () => undefined);
    await presentation.prewarm({ compileAndRender }, camera, 4);
    await presentation.prewarm({ compileAndRender }, camera, 4);
    expect(compileAndRender).toHaveBeenCalledTimes(5);
    await presentation.prewarm({ compileAndRender }, camera, 5);
    expect(compileAndRender).toHaveBeenCalledTimes(10);
    presentation.dispose();
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
      entityDetails: expect.arrayContaining([
        expect.objectContaining({ entityId: 'ks-1-chopper-1', poolKey: 'chopper', presentationSource: 'procedural-non-release-fallback', visible: true }),
        expect.objectContaining({ entityId: 'ks-1-care-aircraft-2', poolKey: 'care-aircraft', presentationSource: 'procedural-non-release-fallback', visible: true }),
        expect.objectContaining({ entityId: 'ks-1-care-3', poolKey: 'care-crate', presentationSource: 'procedural-non-release-fallback', visible: true }),
        expect.objectContaining({ entityId: 'ks-1-swarm-drone-4', poolKey: 'swarm-drone', presentationSource: 'procedural-non-release-fallback', visible: false }),
      ]),
      impactFlashes: 0,
      bombShells: 0,
      emberParticles: 0,
      sensorContacts: 0,
      placementMarkers: 0,
      prewarmed: 6,
      pooledEntityInstances: 29,
      pooledSwarmDrones: 24,
      swarmRenderBatches: 14,
      swarmRenderedInstances: 1,
      swarmVisibleRenderBatches: 14,
      swarmMinimumRenderedInstances: 1,
      swarmMaximumRenderedInstances: 1,
      prewarmedAuthoredSupportFamilies: [],
      chopperWeaponActionsPresented: 0,
      chopperImpactActionsPresented: 0,
      activeChopperActionNames: [],
      pooledChopperActionNames: [],
      lastChopperWeaponActions: [],
      chopperActionPlayback: [],
      firstPersonSightline: null,
      markerDetails: [],
      bounded: true,
    });
    expect(presentation.root.getObjectByName('chopper-sleek-cockpit-canopy')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-armoured-belly')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-armoured-nose')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-engine-pod-1')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-engine-pod--1')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-rocket-pod-1')).toBeDefined();
    expect(presentation.root.getObjectByName('chopper-tail-stabilizer')).toBeDefined();
    expect(presentation.root.getObjectByName('pass65-care-package-aircraft')).toBeDefined();
    expect(presentation.root.getObjectByName('care-package-parachute')).toBeDefined();
    expect(presentation.root.getObjectByName('pass65-swarm-drone')).toBeDefined();
    const chopper = presentation.root.getObjectByName('pass65-chopper-gunner') as THREE.Group;
    const drone = presentation.root.getObjectByName('pass65-swarm-drone') as THREE.Group;
    const aircraft = presentation.root.getObjectByName('pass65-care-package-aircraft') as THREE.Group;
    expect(drone.visible).toBe(false);
    expect(presentation.root.getObjectByName('pass65-swarm-instanced-batch-1')?.visible).toBe(true);
    expect(chopper.rotation.x).toBeCloseTo(0.02);
    expect(chopper.rotation.z).toBeCloseTo(-0.04);
    expect(missingSupportNodes(chopper, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.chopper.requiredNodes)).toEqual([]);
    expect(missingSupportNodes(drone, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.drone.requiredNodes)).toEqual([]);
    expect(missingSupportNodes(aircraft, SUPPORT_VEHICLE_PRESENTATION_CONTRACT.aircraft.requiredNodes)).toEqual([]);
    expect(supportForwardAlignment(chopper, 'chopper-player-gun', 'chopper-gun-muzzle-socket')).toBeCloseTo(1, 6);
    expect(supportForwardAlignment(chopper, 'chopper-fuselage', 'chopper-forward-socket')).toBeCloseTo(1, 6);
    expect(supportForwardAlignment(drone, 'drone-gun-receiver', 'drone-gun-muzzle-socket')).toBeCloseTo(1, 6);
    expect(supportForwardAlignment(aircraft, 'care-aircraft-fuselage', 'care-aircraft-forward-socket')).toBeCloseTo(1, 6);
    expect(presentation.firstPersonCameraAnchor('ks-1-chopper-1')).not.toBeNull();
    expect((chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh).visible).toBe(false);
    expect(chopper.getObjectByName('chopper-first-person-rotor')).toBeUndefined();
    const hudMaterial = (chopper.getObjectByName('chopper-cockpit-hud-glass') as THREE.Mesh)
      .material as THREE.Material;
    const cockpitHud = chopper.getObjectByName('chopper-cockpit-hud-glass') as THREE.Mesh;
    const cockpitHudBaseLayerMask = cockpitHud.layers.mask;
    const hudBaseDepthWrite = hudMaterial.depthWrite;
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    expect(chopper.visible).toBe(true);
    expect((chopper.getObjectByName('chopper-fuselage') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-rear-fuselage') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-main-rotor') as THREE.Group).children.every((node) => !node.visible)).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-display-cyan') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-display-green') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-hud-glass') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-cockpit-hud-target-ring') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-gunner-view-receiver') as THREE.Mesh).visible).toBe(true);
    expect(cockpitHud.layers.mask & (1 << 2)).not.toBe(0);
    expect(cockpitHud.layers.mask & (1 << 0)).toBe(0);
    expect(hudMaterial.depthWrite).toBe(false);
    expect(presentation.telemetry().firstPersonSightline).toMatchObject({
      entityId: 'ks-1-chopper-1',
      presentationSource: 'procedural-non-release-fallback',
      visibleOutsideCockpit: [],
      dashboardVisible: true,
      displaysVisible: true,
      hudVisible: false,
      centreSightlineClear: true,
      weaponVisible: true,
      overlayLayerExclusive: true,
    });
    const redundantPossessionTraverse = vi.spyOn(chopper, 'traverse');
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    expect(redundantPossessionTraverse).not.toHaveBeenCalled();
    redundantPossessionTraverse.mockRestore();
    const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.8, 0, 'YXZ'));
    const cameraPosition = new THREE.Vector3(6, 8, -3);
    const cockpit = chopper.getObjectByName('chopper-first-person-cockpit')!;
    const cameraSocket = chopper.getObjectByName('chopper-first-person-camera-socket')!;
    const authoredCameraPivot = cockpit.worldToLocal(cameraSocket.getWorldPosition(new THREE.Vector3()));
    presentation.alignFirstPersonCockpit('ks-1-chopper-1', cameraPosition, cameraQuaternion);
    const cockpitWorldQuaternion = chopper.getObjectByName('chopper-first-person-cockpit')!
      .getWorldQuaternion(new THREE.Quaternion());
    expect(cockpitWorldQuaternion.angleTo(cameraQuaternion)).toBeLessThan(1e-6);
    // Owner 2026-08-29: the cockpit viewmodel rides LIFTED in camera space so
    // the canopy glass frame sits high on the screen (regression guard for
    // the mid-screen glass issue). The pivot must land exactly on the lifted
    // target - neither at the raw camera (no lift = regression) nor anywhere
    // else (misalignment).
    const liftedTarget = cameraPosition.clone()
      .addScaledVector(
        new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion),
        FIRST_PERSON_COCKPIT_VIEW_LIFT_M,
      )
      .addScaledVector(
        new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion),
        -FIRST_PERSON_COCKPIT_VIEW_PULL_M,
      );
    expect(FIRST_PERSON_COCKPIT_VIEW_LIFT_M).toBeGreaterThan(0.05);
    expect(FIRST_PERSON_COCKPIT_VIEW_PULL_M).toBeGreaterThan(0.05);
    expect(cockpit.localToWorld(authoredCameraPivot).distanceTo(liftedTarget)).toBeLessThan(1e-6);
    presentation.setFirstPersonEntity(null);
    expect(chopper.visible).toBe(true);
    expect((chopper.getObjectByName('chopper-fuselage') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-rear-fuselage') as THREE.Mesh).visible).toBe(true);
    expect((chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-cockpit-hud-glass') as THREE.Mesh).visible).toBe(false);
    expect((chopper.getObjectByName('chopper-gunner-view-receiver') as THREE.Mesh).visible).toBe(false);
    expect(cockpitHud.layers.mask).toBe(cockpitHudBaseLayerMask);
    expect(hudMaterial.depthWrite).toBe(hudBaseDepthWrite);
    const carePackage = presentation.root.getObjectByName('pass65-care-package') as THREE.Group;
    expect(carePackage.userData).toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    expect(carePackage.getObjectByName('care-package-crate')!.userData)
      .toMatchObject({ interactable: true, interactionPrompt: 'F TO COLLECT KILLSTREAK' });
    presentation.sync(snapshot(0), 1_100);
    expect(presentation.telemetry().entities).toBe(0);
    presentation.dispose();
    expect(scene.getObjectByName('pass65-killstreak-presentations')).toBeUndefined();
  });

  it('smoothly interpolates attitude between sparse snapshots and snaps deterministic resets', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const initial = snapshot(1);
    presentation.sync(initial, 1_000);
    const chopper = presentation.entityRoot('ks-1-chopper-1')!;
    const initialQuaternion = chopper.quaternion.clone();
    const changedAttitude = [0.18, -0.7, 0.12] as const;
    const changed = {
      ...initial,
      revision: 2,
      entities: initial.entities.map((entity) => ({ ...entity, attitude: changedAttitude, revision: 2 })),
    };
    const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...changedAttitude, 'YXZ'));

    presentation.sync(changed, 1_016);
    const firstAngle = chopper.quaternion.angleTo(targetQuaternion);
    expect(chopper.quaternion.angleTo(initialQuaternion)).toBeGreaterThan(0);
    expect(firstAngle).toBeGreaterThan(0);
    presentation.sync(changed, 1_032);
    expect(chopper.quaternion.angleTo(targetQuaternion)).toBeLessThan(firstAngle);

    const phaseReset = {
      ...changed,
      revision: 3,
      entities: changed.entities.map((entity) => ({ ...entity, phase: 'outbound' as const, revision: 3 })),
    };
    presentation.sync(phaseReset, 1_048);
    expect(chopper.quaternion.angleTo(targetQuaternion)).toBeLessThan(1e-8);

    const teleportedAttitude = [-0.1, 0.35, -0.08] as const;
    const teleportedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...teleportedAttitude, 'YXZ'));
    presentation.sync({
      ...phaseReset,
      revision: 4,
      entities: phaseReset.entities.map((entity) => ({
        ...entity,
        position: [24, 8, -20] as const,
        attitude: teleportedAttitude,
        revision: 4,
      })),
    }, 1_064);
    expect(chopper.position.toArray()).toEqual([24, 8, -20]);
    expect(chopper.quaternion.angleTo(teleportedQuaternion)).toBeLessThan(1e-8);
    presentation.dispose();
  });

  it('never interpolates the possessed chopper pose that anchors its camera and HUD', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    const initial = snapshot(1);
    presentation.sync(initial, 1_000);
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    const movedAttitude = [0.11, -0.62, 0.08] as const;
    const movedPosition = [3, 5.5, -2] as const;
    presentation.sync({
      ...initial,
      revision: 2,
      entities: initial.entities.map((entity) => ({
        ...entity,
        position: movedPosition,
        attitude: movedAttitude,
        revision: 2,
      })),
    }, 1_016);
    const chopper = presentation.entityRoot('ks-1-chopper-1')!;
    expect(chopper.position.toArray()).toEqual(movedPosition);
    expect(chopper.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(...movedAttitude, 'YXZ'))))
      .toBeLessThan(1e-8);
    presentation.setFirstPersonEntity(null);
    presentation.dispose();
  });

  it('applies a retained first-person entity ID when that entity arrives later', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.setFirstPersonEntity('ks-1-chopper-1');
    presentation.sync(snapshot(1), 1_000);
    const chopper = presentation.entityRoot('ks-1-chopper-1')!;
    const fuselage = chopper.getObjectByName('chopper-fuselage') as THREE.Mesh;
    const dashboard = chopper.getObjectByName('chopper-cockpit-dashboard-3d') as THREE.Mesh;
    const gunnerHud = chopper.getObjectByName('chopper-cockpit-hud-glass') as THREE.Mesh;
    const gunnerHudMaterial = gunnerHud.material as THREE.Material;
    expect(fuselage.visible).toBe(false);
    expect(dashboard.visible).toBe(true);
    expect(gunnerHud.visible).toBe(false);
    expect(gunnerHudMaterial.depthWrite).toBe(false);
    presentation.setFirstPersonEntity(null);
    expect(fuselage.visible).toBe(true);
    expect(gunnerHud.visible).toBe(false);
    expect(gunnerHudMaterial.depthWrite).toBe(true);
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

  it('uses one visual family with distinct authoritative gun variants', () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    const swarmSnapshot = snapshot(4);
    const droneEntity = swarmSnapshot.entities[3]!;
    presentation.sync({
      ...swarmSnapshot,
      entities: [{ ...droneEntity, id: 'standalone', mode: 'piloted', gunProfileId: PILOTED_DRONE_GUN_PROFILE_ID }],
    }, 1_000);
    const standalone = presentation.root.getObjectByName('pass65-piloted-drone') as THREE.Group;
    expect(standalone.userData).toMatchObject({
      presentationFamilyId: 'hunter-drone-visual-family-v1',
      gunProfileId: PILOTED_DRONE_GUN_PROFILE_ID,
    });
    expect(standalone.getObjectByName('drone-mounted-gun')).toBeDefined();
    presentation.sync({ ...swarmSnapshot, entities: [{ ...droneEntity, id: 'swarm', mode: 'swarm' }] }, 1_016);
    const swarm = presentation.root.getObjectByName('pass65-swarm-drone') as THREE.Group;
    expect(swarm.userData.presentationFamilyId).toBe(standalone.userData.presentationFamilyId);
    expect(swarm.userData.gunProfileId).toBe(DRONE_SWARM_GUN_PROFILE_ID);
    expect(swarm.getObjectByName('drone-mounted-gun')).toBeDefined();
    expect(swarm.userData.pass70DroneSwarmBodyLogo).toBe('drone-body-black-field-white-hollow-ring-open-chevron-v1');
    expect(swarm.getObjectByName('pass70-drone-swarm-body-logo-top')).toBeDefined();
    expect(swarm.getObjectByName('pass70-drone-swarm-body-logo-bottom')).toBeDefined();
    const logoBatchMaterials = presentation.root.children
      .filter((node): node is THREE.InstancedMesh => node instanceof THREE.InstancedMesh)
      .flatMap((node) => Array.isArray(node.material) ? node.material : [node.material])
      .map((entry) => entry.name);
    expect(logoBatchMaterials).toEqual(expect.arrayContaining([
      'MAT_Pass70_DroneSwarmLogo_BlackField',
      'MAT_Pass70_DroneSwarmLogo_WhiteMark',
    ]));
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
    expect(startY).toBe(20);
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
    const corridorCentre = presentation.root.getObjectByName('carpet-bomber-flight-centreline') as THREE.Mesh;
    const corridorLeft = presentation.root.getObjectByName('carpet-bomber-flight-corridor-left-edge') as THREE.Mesh;
    const corridorRight = presentation.root.getObjectByName('carpet-bomber-flight-corridor-right-edge') as THREE.Mesh;
    expect((corridorFill.material as THREE.MeshBasicMaterial).opacity).toBe(0.1);
    expect((corridorFill.material as THREE.MeshBasicMaterial).depthTest).toBe(true);
    expect((corridorFill.material as THREE.MeshBasicMaterial).depthWrite).toBe(false);
    expect(presentation.root.getObjectByName('carpet-bomber-flight-corridor-left-edge')).toBeDefined();
    expect(presentation.root.getObjectByName('carpet-bomber-flight-corridor-right-edge')).toBeDefined();
    expect(corridorCentre.geometry).toBe(corridorFill.geometry);
    expect(corridorLeft.geometry).toBe(corridorFill.geometry);
    expect(corridorRight.geometry).toBe(corridorFill.geometry);
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
