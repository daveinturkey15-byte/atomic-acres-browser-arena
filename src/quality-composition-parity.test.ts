import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { readFile } from 'node:fs/promises';
import { buildArena } from './map';
import { addNeighbourhoodLife } from './environment-assets';

/**
 * QUALITY-COMPOSITION PARITY GATE — born from a real owner walk, 2026-08-29:
 * "i walked forward and literally hit invisible geometry first thing."
 *
 * The Quality profile HIDES the whole procedural arena root behind the
 * Blender GLB, so a collider whose only visual lives in the procedural layer
 * is an INVISIBLE WALL for every Quality player. The long-standing
 * collider/visual parity gate audits the procedural composition only, which
 * is exactly the blindness that shipped the spawn-garden dividers as unseen
 * geometry. This gate audits the composition Quality players actually see:
 *
 *   visible set = shipped GLB meshes + the environment-assets sibling group
 *                 (street life, lawns, backdrop - it renders on EVERY
 *                 profile) + procedural meshes explicitly retained in
 *                 Quality (the collision-audit mirrors).
 *
 * Every substantial movement collider must overlap at least one visible mesh
 * AABB in THAT set, with a small inflation for dressing that wraps rather
 * than fills. Boundary fences are audited like everything else.
 */

type Bounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; name?: string };

const INFLATE_M = 0.35;
/** Colliders thinner/shorter than this are kerb-height dressing the ground read explains. */
const SUBSTANTIAL_MIN_HEIGHT_M = 0.5;

function collectTriangleSources(object: THREE.Object3D): Array<{ bounds: Bounds; positions: Float32Array; matrix: THREE.Matrix4 }> {
  const sources: Array<{ bounds: Bounds; positions: Float32Array; matrix: THREE.Matrix4 }> = [];
  object.updateWorldMatrix(true, true);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false) return;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const attribute = geometry?.getAttribute('position');
    if (!attribute) return;
    // Meshopt ships quantized (normalized int) positions; a raw array copy
    // bypasses dequantization and reads garbage. The accessor API applies it.
    const sourceAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = new Float32Array(sourceAttribute.count * 3);
    for (let index = 0; index < sourceAttribute.count; index += 1) {
      positions[index * 3] = sourceAttribute.getX(index);
      positions[index * 3 + 1] = sourceAttribute.getY(index);
      positions[index * 3 + 2] = sourceAttribute.getZ(index);
    }
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    if (!Number.isFinite(box.min.x)) return;
    sources.push({
      bounds: { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z, name: mesh.name },
      positions,
      matrix: mesh.matrixWorld.clone(),
    });
  });
  return sources;
}

/**
 * A collider is EXPLAINED when visible triangles actually stand inside it -
 * a vertex inside the collider's inflated box, within its upper height band.
 * (The first cut used AABB overlap and its own red proof failed it: ground
 * plates and region-scale merged/instanced meshes overlap everything. A
 * triangle-presence test survives material batching - the GLB merges whole
 * material families into arena-spanning meshes - while staying blind to
 * nothing: an invisible wall has NO triangles anywhere in its volume.)
 */
function explained(collider: Bounds, sources: ReturnType<typeof collectTriangleSources>): boolean {
  const minY = collider.minY + (collider.maxY - collider.minY) * 0.25;
  const minX = collider.minX - INFLATE_M;
  const maxX = collider.maxX + INFLATE_M;
  const minZ = collider.minZ - INFLATE_M;
  const maxZ = collider.maxZ + INFLATE_M;
  const maxY = collider.maxY + INFLATE_M;
  const vertex = new THREE.Vector3();
  for (const source of sources) {
    if (source.bounds.minX > maxX || source.bounds.maxX < minX
      || source.bounds.minZ > maxZ || source.bounds.maxZ < minZ
      || source.bounds.minY > maxY || source.bounds.maxY < minY) continue;
    const positions = source.positions;
    for (let index = 0; index < positions.length; index += 3) {
      vertex.set(positions[index], positions[index + 1], positions[index + 2]).applyMatrix4(source.matrix);
      if (vertex.x >= minX && vertex.x <= maxX && vertex.z >= minZ && vertex.z <= maxZ
        && vertex.y >= minY && vertex.y <= maxY) {
        return true;
      }
    }
  }
  return false;
}

describe('Quality composition parity (atomic-acres)', () => {
  it('explains every substantial movement collider with a mesh a Quality player can SEE', async () => {
    const scene = new THREE.Scene();
    const arena = buildArena(scene);

    // The environment-assets group is a sibling of the arena root and renders
    // on every profile, exactly as legacy-main composes it.
    const environmentRoot = new THREE.Group();
    addNeighbourhoodLife(environmentRoot, false);

    // Node has no browser image stack; stub what the WebP texture path needs
    // (same recipe as the pass73 shipped-GLB audit).
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('ProgressEvent', class ProgressEvent {
      readonly type: string;
      constructor(type: string) { this.type = type; }
    });
    vi.stubGlobal('createImageBitmap', async () => ({
      width: 1,
      height: 1,
      close: () => undefined,
    }) as unknown as ImageBitmap);
    const bytes = await readFile('public/assets/original/models/atomic-acres-blender-arena.glb');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise<GLTF>((resolveAsset, rejectAsset) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(arrayBuffer, '', resolveAsset, rejectAsset);
    });

    const sources = [
      ...collectTriangleSources(gltf.scene),
      ...collectTriangleSources(environmentRoot),
    ];
    // Quality retains the collision-audit mirrors (mounds) from the
    // procedural layer; everything else procedural is hidden.
    const proceduralWorld = scene.getObjectByName('Atomic Acres arena');
    expect(proceduralWorld).toBeDefined();
    proceduralWorld!.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && /terrain-mound-/.test(mesh.name) && !/collider/.test(mesh.name)) {
        sources.push(...collectTriangleSources(mesh));
      }
    });

    const unexplained: string[] = [];
    for (const collider of arena.physicsColliders as Bounds[]) {
      const height = (collider.maxY ?? 0) - (collider.minY ?? 0);
      if (height < SUBSTANTIAL_MIN_HEIGHT_M) continue;
      if (!explained(collider, sources)) {
        unexplained.push(`${(collider as { name?: string }).name ?? '(unnamed collider)'}`
          + ` x[${collider.minX.toFixed(1)},${collider.maxX.toFixed(1)}]`
          + ` z[${collider.minZ.toFixed(1)},${collider.maxZ.toFixed(1)}]`
          + ` h=${height.toFixed(2)}`);
      }
    }
    expect(unexplained, 'INVISIBLE GEOMETRY in the Quality composition - a player will walk into these').toEqual([]);

    // RED PROOF: the exact class that shipped - a collider with no visual in
    // the Quality set (the spawn-garden dividers) - must be flagged by this
    // mechanism. A synthetic divider-shaped box in empty air proves the gate
    // fires rather than vacuously passing.
    const syntheticDivider: Bounds = { minX: -34, maxX: -30, minY: 0, maxY: 2.2, minZ: 13.4, maxZ: 13.65, name: 'synthetic-invisible-divider' };
    expect(explained(syntheticDivider, sources)).toBe(false);
  }, 120_000);
});
