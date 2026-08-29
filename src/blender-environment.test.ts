import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLENDER_ARENA_ASSET, enforceAtomicMaterialDepthContract, mirrorAtomicCollisionAuditVisuals, proceduralArenaRootVisible } from './blender-environment';
import { definition as atomicAcresVisualDefinition } from './rendering/arenas/atomic-acres';

const assetPath = new URL(`../public/${BLENDER_ARENA_ASSET.split('?')[0].replace(/^\.\/assets\//, 'assets/')}`, import.meta.url);
const specPath = new URL('../source-assets/blender/atomic-acres-arena-spec.json', import.meta.url);
const provenancePath = new URL('../source-assets/blender/atomic-acres-blender-arena.provenance.json', import.meta.url);

function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.byteLength);
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString('ascii', 16, 20)).toBe('JSON');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trimEnd());
}

describe('Quality Graphics environment asset', () => {
  it('declares the exact cache-busted runtime GLB in the selected-arena stream contract', () => {
    expect(atomicAcresVisualDefinition.assetDependencies).toContain(BLENDER_ARENA_ASSET);
  });

  it('never renders the coplanar procedural and Quality arena roots together', () => {
    expect(proceduralArenaRootVisible('atomic-acres', true)).toBe(false);
    expect(proceduralArenaRootVisible('atomic-acres', false)).toBe(true);
    expect(proceduralArenaRootVisible('rustworks-1v1', true)).toBe(false);
    expect(proceduralArenaRootVisible('gun-range', false)).toBe(false);
  });

  it('mirrors collision-audit visuals into Quality without changing authority', () => {
    const procedural = new THREE.Group();
    for (const name of ['terrain-mound-west-verge', 'terrain-mound-east-verge', 'east-irrigation-vessel']) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = name;
      mesh.userData.collisionAuthority = name + '-collider';
      procedural.add(mesh);
    }
    const quality = new THREE.Group();
    expect(mirrorAtomicCollisionAuditVisuals(procedural, quality)).toBe(3);
    expect(quality.children).toHaveLength(3);
    expect(quality.children.every((child) => child.userData.qualityProfileMirror === true)).toBe(true);
    expect(procedural.children).toHaveLength(3);
  });

  it('forces opaque closed-volume materials to cull hidden backfaces without changing glass', () => {
    const opaque = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    enforceAtomicMaterialDepthContract(opaque, false);
    expect(opaque).toMatchObject({
      transparent: false,
      opacity: 1,
      depthWrite: true,
      alphaTest: 0,
      side: THREE.FrontSide,
    });

    const glass = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    enforceAtomicMaterialDepthContract(glass, true);
    expect(glass).toMatchObject({ transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  });
  it('ships a self-contained, bounded original arena GLB with semantic windows', () => {
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as {
      nodes?: Array<{ name?: string; extras?: Record<string, unknown> }>;
      meshes?: unknown[];
      materials?: Array<{
        name?: string;
        normalTexture?: { index: number };
        pbrMetallicRoughness?: { metallicRoughnessTexture?: { index: number } };
      }>;
      images?: Array<{ name?: string; bufferView?: number; uri?: string }>;
      textures?: unknown[];
      buffers?: Array<{ uri?: string }>;
    };
    const semanticWindows = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'breakable-window');
    const auditedApertures = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'aperture-audit');
    const routeLandmarks = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'route-landmark');
    const modeledBuses = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'physical-transit-bus');
    const largeCoverAssets = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'authored-large-physical-cover');
    const housePropSets = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'authored-house-furnishing-set');
    const collisionVisualOwners = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'collision-visual-owner');
    expect(buffer.byteLength).toBeGreaterThan(50_000);
    expect(buffer.byteLength).toBeLessThan(7_500_000);
    // DECLUTTER 2026-08-29: campus architecture left the bake (-1 merged mesh,
    // -1 material, -7,328 triangles).
    expect(gltf.meshes?.length).toBe(44);
    expect(gltf.materials?.length).toBe(28);
    expect(gltf.images).toHaveLength(33);
    expect(gltf.textures).toHaveLength(33);
    expect((gltf.materials ?? []).filter((material) =>
      material.normalTexture && material.pbrMetallicRoughness?.metallicRoughnessTexture)).toHaveLength(20);
    expect(gltf.images?.every((image) => typeof image.bufferView === 'number' && image.uri === undefined)).toBe(true);
    expect(gltf.buffers?.every((bufferInfo) => !bufferInfo.uri)).toBe(true);
    expect(semanticWindows).toHaveLength(6);
    expect(new Set(semanticWindows.map((node) => node.extras?.atomic_window_id)).size).toBe(6);
    expect(auditedApertures).toHaveLength(16);
    expect(new Set(auditedApertures.map((node) => node.extras?.atomic_aperture_id)).size).toBe(16);
    expect(auditedApertures.every((node) => node.extras?.atomic_aperture_clear === true)).toBe(true);
    expect(auditedApertures.every((node) => node.extras?.atomic_aperture_samples === 9)).toBe(true);
    expect(auditedApertures.filter((node) => node.extras?.atomic_aperture_transparent === true)).toHaveLength(6);
    expect(auditedApertures.filter((node) => node.extras?.atomic_aperture_transparent === false)).toHaveLength(10);
    expect(routeLandmarks).toHaveLength(3);
    expect(modeledBuses).toHaveLength(1);
    // DELIBERATELY LEFT RED at Pass 81. Do not "fix" this by changing 4 to 2 -
    // 4 is the correct contract and 2 is a regression this gate is catching.
    //
    // scripts/blender/create-atomic-acres-blender-arena.py:636-648 keys the
    // authored large-cover shells by literal COVER_LAYOUT array index (4 ->
    // cargo stack, 5 -> pipe stack, 6 -> service skip, 7 -> generator trailer),
    // and src/map.ts:724-748 plus src/environment-assets.ts:503-545 do the same.
    // HF-383b removed the two LEADING entries, so COVER_LAYOUT now holds six
    // (src/arena-layout.ts:227-234): indices 6 and 7 no longer exist and 4/5
    // resolve to what used to be 6/7. The skip and the generator trailer are
    // therefore built but never wired, and the cargo and pipe stacks render at
    // the wrong anchors.
    //
    // The Pass 81 rebake did not cause this; it exposed it. The old GLB was
    // baked from the pre-HF-383 eight-entry cover list, so the stale art was
    // masking the regression while the procedural profile already showed it.
    // Fix is keying by anchor id instead of array index, in all three files -
    // owned by lane L3 (src/map.ts) and by whoever takes the Blender generator,
    // which no Pass 81 lane owns. Tracked as HF-383-cover-index-regression.
    expect(largeCoverAssets).toHaveLength(4);
    expect(housePropSets).toHaveLength(2);
    expect(collisionVisualOwners).toHaveLength(10);
    expect(new Set(collisionVisualOwners.map((node) => node.extras?.atomic_solid_id)).size).toBe(10);
    expect(new Set(collisionVisualOwners.map((node) => node.extras?.atomic_route_role))).toEqual(new Set([
      'wall', 'floor', 'underside', 'canopy', 'window-approach',
    ]));
    expect(collisionVisualOwners.every((node) => Array.isArray(node.extras?.atomic_collision_bounds)
      && (node.extras?.atomic_collision_bounds as unknown[]).length === 6)).toBe(true);
    expect(modeledBuses.every((node) => node.extras?.atomic_collision_authority === 'typescript-vehicle-boxes')).toBe(true);
    expect(largeCoverAssets.every((node) => node.extras?.atomic_collision_authority === 'typescript-cover-box')).toBe(true);
    expect(new Set(routeLandmarks.map((node) => node.extras?.atomic_route_id))).toEqual(new Set([
      'west-cultivation', 'central-transit', 'east-service',
    ]));
    expect(new Set(routeLandmarks.map((node) => node.name))).toEqual(new Set([
      'P27_LANDMARK_verdant_array', 'P27_LANDMARK_civic_transit', 'P27_LANDMARK_helio_service',
    ]));
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_asphalt_charcoal')).toBe(true);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_ground_olive')).toBe(true);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_gunmetal')).toBe(true);
    expect((gltf.nodes ?? []).some((node) => node.name === 'BLD_BATCH_MAT_ceiling_warm_white')).toBe(true);
    for (const name of ['BLD_BATCH_MAT_aqua_upper_brick', 'BLD_BATCH_MAT_aqua_rear_plaster', 'BLD_BATCH_MAT_coral_upper_plaster', 'BLD_BATCH_MAT_coral_rear_brick']) {
      expect((gltf.nodes ?? []).some((node) => node.name === name)).toBe(true);
    }
    const groundBatches = (gltf.nodes ?? []).filter((node) =>
      node.name === 'BLD_BATCH_MAT_ground_olive' || node.name === 'BLD_BATCH_MAT_asphalt_charcoal');
    expect(groundBatches).toHaveLength(2);
    expect(groundBatches.every((node) => node.extras?.atomic_ground_layout === 'manicured-verges-v3')).toBe(true);
  });

  it('binds the runtime GLB to the audited source-separation provenance', () => {
    const buffer = readFileSync(assetPath);
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as {
      title: string;
      runtimeGlbSha256: string;
      runtimeAudit: {
        bytes: number;
        triangles: number;
        auditedHouseApertures: number;
        apertureAuditSamples: number;
        targetedCoplanarOrUnder20mmPairsBefore: number;
        targetedCoplanarOrUnder20mmPairsAfter: number;
      };
    };
    expect(provenance.title).toBe('Atomic Acres-owned Quality Graphics Arena Aesthetic Overhaul');
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(provenance.runtimeGlbSha256);
    expect(buffer.byteLength).toBe(provenance.runtimeAudit.bytes);
    // Pass 79: +1296 triangles from the street hedges and parked vans that
    // mirror the Pass 78/79 sightline colliders into the Quality art.
    // Pass 81 / HF-383c: re-pinned 42_308 -> 41_880 for the rebake that finally
    // brought the art up to HEAD's arena constants. The spec had been frozen at
    // the pre-HF-383 62 x 60 m map since fb3a1970, so this bake is the first to
    // carry the deepened footprint, the 13 m carriageway, the re-tiled kerb and
    // pavement, the mid-street vans and the restaged hedges. The delta is
    // accounted for exactly: +88 for two added front-hedge fins, -516 for the
    // two bulky cover anchors HF-383b removed. Determinism was checked before
    // re-pinning - three bakes of the new spec all gave 41_880, and a control
    // bake of the old spec reproduced 42_308 - so this is a real geometry
    // change, not authoring jitter.
    // Pass 81, SECOND bake: re-pinned 41_880 -> 42_044 after
    // HF-383-cover-index-regression was FIXED rather than merely recorded. The
    // generator selected authored large cover by literal COVER_LAYOUT index (4/5/6/7);
    // HF-383b removed two leading entries, so indices 6 and 7 stopped existing and the
    // service skip and generator trailer were never BUILT. The exporter now publishes
    // AUTHORED_LARGE_COVER_ANCHORS and the generator branches on the anchor id, so both
    // props are back (+164 triangles) and all four ids are present in the shipped bytes.
    // Still an exact equality: a re-pin to correct behaviour, not a loosening.
    // Third Pass 81 bake: 42_044 -> 42_132. +88 for the two storage lockers that are
    // now real authored solids in the spec (HF-387 - they were shot surfaces with no
    // movement or visual authority), minus the slimmer HF-383b planter fins. Exact
    // equality, as ever.
    // REDESIGN 2026-08-29 wave 2: -88 = the two retired (+/-22) yard-fence
    // side runs (44 beveled tris each); the cultivation cluster re-seat is
    // pure translation and adds nothing.
    expect(provenance.runtimeAudit.triangles).toBe(35_012);
    expect(provenance.runtimeAudit.auditedHouseApertures).toBe(16);
    expect(provenance.runtimeAudit.apertureAuditSamples).toBe(144);
  });

  it('matches every authoritative breakable-window id generated for Blender', () => {
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as { nodes?: Array<{ extras?: Record<string, unknown> }> };
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
      schema: string;
      houses: Array<{ solids: Array<{ id: string; kind: string; breakable: boolean }> }>;
    };
    const expected = spec.houses.flatMap((house) => house.solids)
      .filter((solid) => solid.kind === 'glass' && solid.breakable)
      .map((solid) => solid.id)
      .sort();
    const actual = (gltf.nodes ?? [])
      .map((node) => node.extras?.atomic_window_id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
    expect(spec.schema).toBe('atomic-acres-blender-arena-v1');
    expect(actual).toEqual(expected);
  });

  it('carries a nine-ray clear-aperture receipt for every house door, passage and window', () => {
    const buffer = readFileSync(assetPath);
    const gltf = glbJson(buffer) as { nodes?: Array<{ extras?: Record<string, unknown> }> };
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as {
      houses: Array<{ id: string; openings: Array<{ id: string; kind: string }> }>;
    };
    const expected = spec.houses
      .flatMap((house) => house.openings.map((opening) => `${house.id}:${opening.id}`))
      .sort();
    const markers = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'aperture-audit');
    const actual = markers.map((node) => node.extras?.atomic_aperture_id).sort();
    expect(actual).toEqual(expected);
    expect(markers.reduce((total, node) => total + Number(node.extras?.atomic_aperture_samples ?? 0), 0)).toBe(144);
  });
});
