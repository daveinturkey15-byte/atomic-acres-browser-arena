import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLENDER_ARENA_ASSET, mirrorAtomicCollisionAuditVisuals, proceduralArenaRootVisible } from './blender-environment';

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
    const routeLandmarks = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_semantic === 'route-landmark');
    const modeledBuses = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'physical-transit-bus');
    const largeCoverAssets = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'authored-large-physical-cover');
    const housePropSets = (gltf.nodes ?? []).filter((node) => node.extras?.atomic_asset_class === 'authored-house-furnishing-set');
    expect(buffer.byteLength).toBeGreaterThan(50_000);
    expect(buffer.byteLength).toBeLessThan(7_500_000);
    expect(gltf.meshes?.length).toBe(34);
    expect(gltf.materials?.length).toBe(28);
    expect(gltf.images).toHaveLength(33);
    expect(gltf.textures).toHaveLength(60);
    expect((gltf.materials ?? []).filter((material) =>
      material.normalTexture && material.pbrMetallicRoughness?.metallicRoughnessTexture)).toHaveLength(20);
    expect(gltf.images?.every((image) => typeof image.bufferView === 'number' && image.uri === undefined)).toBe(true);
    expect(gltf.buffers?.every((bufferInfo) => !bufferInfo.uri)).toBe(true);
    expect(semanticWindows).toHaveLength(6);
    expect(new Set(semanticWindows.map((node) => node.extras?.atomic_window_id)).size).toBe(6);
    expect(routeLandmarks).toHaveLength(3);
    expect(modeledBuses).toHaveLength(2);
    expect(largeCoverAssets).toHaveLength(4);
    expect(housePropSets).toHaveLength(2);
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
        targetedCoplanarOrUnder20mmPairsBefore: number;
        targetedCoplanarOrUnder20mmPairsAfter: number;
      };
    };
    expect(provenance.title).toBe('Atomic Acres-owned Quality Graphics Arena Aesthetic Overhaul');
    expect(createHash('sha256').update(buffer).digest('hex')).toBe(provenance.runtimeGlbSha256);
    expect(buffer.byteLength).toBe(provenance.runtimeAudit.bytes);
    expect(provenance.runtimeAudit.triangles).toBe(44_812);
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
});
