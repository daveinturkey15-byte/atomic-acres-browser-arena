import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createStudioGround } from './ground';
import { studioRoadHalfWidth } from './layout';
import { segmentIntersectsBox, sweepSphereAgainstBoxes } from '../collision';

const ground = createStudioGround();
const kerbMeshes = ground.root.children.filter(child => child.name.startsWith('street-kerb-')) as THREE.Mesh[];
const kerbSolids = ground.solids.filter(solid => solid.id.startsWith('kerb-'));
const kerbSide = (name: string) => (name.startsWith('street-kerb--1') ? -1 : 1);
function vertexOf(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): THREE.Vector3 {
  return new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
}

function pointInTriangleXZ(px: number, pz: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean {
  const s1 = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
  const s2 = (c.x - b.x) * (pz - b.z) - (c.z - b.z) * (px - b.x);
  const s3 = (a.x - c.x) * (pz - c.z) - (a.z - c.z) * (px - c.x);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

describe('world-studio ground repair', () => {
  it('lawns use a dedicated grass surface with a neutral material base, not tinted soil', () => {
    const lawn = ground.root.getObjectByName('supported-playable-ground') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const grass = lawn.material;
    expect(grass.userData.worldStudioSurface).toBe('grass');
    // No dark-green colour multiplier over the albedo (the old 0x5b683b × soil.map double tint).
    expect(grass.color.getHex()).toBe(0xffffff);
    expect(grass.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(grass.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(grass.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    // Distinct textures from the soil apron, and an own green data texture.
    const apron = ground.root.getObjectByName('terrain-ring-apron') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(grass.map).not.toBe(apron.material.map);
    expect(grass.normalMap).not.toBe(apron.material.normalMap);
    // DataTexture.image is typed any; it always wraps { data, width, height }.
    const imageData = grass.map!.image as { data: Uint8Array };
    const pixels = imageData.data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]!; g += pixels[i + 1]!; b += pixels[i + 2]!; }
    const count = pixels.length / 4;
    r /= count; g /= count; b /= count;
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
    // Old soil.map × 0x5b683b measured a ~35 mean channel; the lawn must read bright.
    expect((r + g + b) / 3).toBeGreaterThan(90);
    // The weather consumer tints whatever createStudioGround returns.
    expect(ground.surfaces).toContain(grass);
  });

  it('lawns tile at real-world scale with fine fibre, not giant aggregate', () => {
    const lawn = ground.root.getObjectByName('supported-playable-ground') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const uv = lawn.geometry.getAttribute('uv');
    let maxU = 0, maxV = 0;
    for (let i = 0; i < uv.count; i += 1) { maxU = Math.max(maxU, uv.getX(i)); maxV = Math.max(maxV, uv.getY(i)); }
    // box() bakes world/2 UVs: the 80 m × 68 m plate spans 40 × 34 tiles (2 m each).
    expect(maxU).toBeCloseTo(40, 6);
    expect(maxV).toBeCloseTo(34, 6);
    // The grass kind repeats twice more: 1 m per 256-px tile ≈ 4 mm fibre pitch.
    expect(lawn.material.map!.repeat.x).toBe(2);
    expect(lawn.material.map!.repeat.y).toBe(2);
    expect(lawn.material.normalMap!.repeat.x).toBe(2);
  });

  it('kerbs are two continuous merged surfaces spanning the full road curve', () => {
    expect(kerbMeshes.map(mesh => mesh.name).sort()).toEqual(['street-kerb--1', 'street-kerb-1']);
    for (const mesh of kerbMeshes) {
      const position = mesh.geometry.getAttribute('position');
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < position.count; i += 1) { minZ = Math.min(minZ, position.getZ(i)); maxZ = Math.max(maxZ, position.getZ(i)); }
      expect(minZ).toBeCloseTo(-34, 6);
      expect(maxZ).toBeCloseTo(34, 6);
      // Dense mid-tread sampling over the indexed triangles: every station along
      // the curve must be covered by a raised top-surface triangle (joint dips
      // bottom out at 0.091).
      const index = mesh.geometry.getIndex()!;
      const triangles: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3]> = [];
      for (let t = 0; t < index.count; t += 3) {
        triangles.push([vertexOf(position, index.getX(t)), vertexOf(position, index.getX(t + 1)), vertexOf(position, index.getX(t + 2))]);
      }
      for (let z = -33.7; z <= 33.7; z += 0.37) {
        const x = kerbSide(mesh.name) * (studioRoadHalfWidth(z) + 0.09);
        const covered = triangles.some(([a, b, c]) =>
          Math.max(a.y, b.y, c.y) > 0.085 && pointInTriangleXZ(x, z, a, b, c));
        expect(covered, `kerb ${mesh.name} gap at z=${z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('kerb tops keep the 0.10 m step height and normals stay finite and outward', () => {
    for (const mesh of kerbMeshes) {
      const side = kerbSide(mesh.name);
      const position = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      expect(normal.count).toBe(position.count);
      let maxY = -Infinity;
      for (let i = 0; i < position.count; i += 1) {
        maxY = Math.max(maxY, position.getY(i));
        expect(Number.isFinite(normal.getX(i))).toBe(true);
        expect(Number.isFinite(normal.getY(i))).toBe(true);
        expect(Number.isFinite(normal.getZ(i))).toBe(true);
      }
      expect(maxY).toBeCloseTo(0.10, 6);
      const index = mesh.geometry.getIndex()!;
      const off = (v: THREE.Vector3) => Math.abs(v.x) - studioRoadHalfWidth(v.z);
      for (let t = 0; t < index.count; t += 3) {
        const verts = [vertexOf(position, index.getX(t)), vertexOf(position, index.getX(t + 1)), vertexOf(position, index.getX(t + 2))];
        const faceNormal = new THREE.Vector3().subVectors(verts[1], verts[0])
          .cross(new THREE.Vector3().subVectors(verts[2], verts[0])).normalize();
        const flatTop = verts.every(v => v.y > 0.088 && off(v) > 0.05);
        if (flatTop) expect(faceNormal.y, `kerb ${mesh.name} top at z=${verts[0].z.toFixed(1)}`).toBeGreaterThan(0.7);
        const roadFace = verts.every(v => v.y < 0.06 && off(v) < 0.005);
        if (roadFace) expect(faceNormal.x * side, `kerb ${mesh.name} road face at z=${verts[0].z.toFixed(1)}`).toBeLessThan(-0.7);
        // The chamfer is a real arris: its faces tilt up and toward the road.
        const chamfer = verts.every(v => v.y > 0.05 && off(v) < 0.046) && verts.some(v => v.y > 0.056);
        if (chamfer) {
          // Plain 45-degree arris; joint-transition faces tilt toward the groove.
          const plainArris = verts.every(v => Math.abs(v.y - 0.055) < 0.001 || Math.abs(v.y - 0.10) < 0.0012);
          expect(faceNormal.y, `kerb ${mesh.name} chamfer up at z=${verts[0].z.toFixed(1)}`)
            .toBeGreaterThan(plainArris ? 0.6 : 0.3);
          expect(faceNormal.x * side, `kerb ${mesh.name} chamfer tilt at z=${verts[0].z.toFixed(1)}`)
            .toBeLessThan(plainArris ? -0.6 : -0.3);
        }
      }
    }
  });

  it('every kerb stone keeps truthful oriented bounds on the visible mesh, never a road-filling box', () => {
    expect(kerbSolids.length).toBe(150);
    for (const solid of kerbSolids) {
      const side = solid.id.startsWith('kerb--1-') ? -1 : 1;
      const b = solid.bounds;
      expect(b.minY).toBe(0);
      expect(b.maxY).toBeCloseTo(0.10, 6);
      expect(b.rotation).toBeDefined();
      // Thin slab: a ≤1.21 m × 0.18 m stone, never a broad box over the carriageway.
      expect(b.maxX - b.minX).toBeLessThanOrEqual(1.3);
      expect(b.maxZ - b.minZ).toBeLessThanOrEqual(0.18 + 1e-9);
      // The referenced mesh is the actual visible kerb, not a detached witness.
      expect(ground.root.getObjectByName(`street-kerb-${side}`)).toBe(solid.mesh);
      // Reconstructed world corners sit on the visible tread band (± half tread).
      const yaw = b.rotation![1];
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2;
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
        const x = cx + (Math.cos(yaw) * hx * sx + Math.sin(yaw) * hz * sz);
        const z = cz + (-Math.sin(yaw) * hx * sx + Math.cos(yaw) * hz * sz);
        const offset = Math.abs(x) - studioRoadHalfWidth(Math.max(-34, Math.min(34, z)));
        // Each corner lands on a face of the visible stone: inner road edge (0)
        // or outer kerb edge (0.18) — never mid-air or out in the road.
        const onInnerFace = Math.abs(offset) < 0.03;
        const onOuterFace = Math.abs(offset - 0.18) < 0.03;
        expect(onInnerFace || onOuterFace, `${solid.id} corner z=${z.toFixed(2)} off=${offset.toFixed(3)}`).toBe(true);
      }
    }
  });

  it('kerbs stay walk-over for a standing capsule yet still stop ankle-height shots', () => {
    const bounds = ground.solids.map(solid => solid.bounds);
    // Standing capsule (sphere bottom 0.48 m) crosses the kerb line unimpeded.
    expect(sweepSphereAgainstBoxes({ x: 0, y: 0.9, z: -10 }, { x: 24, y: 0, z: 0 }, bounds, 0.42)).toBeNull();
    expect(sweepSphereAgainstBoxes({ x: 0, y: 0.9, z: -15 }, { x: -24, y: 0, z: 0 }, bounds, 0.42)).toBeNull();
    // Ankle-height sphere and LOS are stopped by the kerb (low cover preserved).
    expect(sweepSphereAgainstBoxes({ x: 8.5, y: 0.17, z: -10 }, { x: 4, y: 0, z: 0 }, bounds, 0.17)).not.toBeNull();
    const w = studioRoadHalfWidth(-10);
    const stone = kerbSolids.find(solid => solid.id.startsWith('kerb-1-stone-')
      && Math.abs((solid.bounds.minZ + solid.bounds.maxZ) / 2 + 10) < 0.5)!;
    expect(segmentIntersectsBox({ x: w - 2, y: 0.05, z: -10 }, { x: w + 2, y: 0.05, z: -10 }, stone.bounds)).toBe(true);
  });

  it('keeps the kerb presentation at two shared-material draw groups and records the cost', () => {
    expect(kerbMeshes.length).toBe(2);
    expect(new Set(kerbMeshes.map(mesh => mesh.material)).size).toBe(1);
    let meshes = 0, triangles = 0, kerbTriangles = 0;
    ground.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes += 1;
      const count = (object.geometry.index ? object.geometry.index.count : object.geometry.getAttribute('position').count) / 3;
      triangles += count;
      if (object.name.startsWith('street-kerb-')) kerbTriangles += count;
    });
    expect(kerbTriangles).toBeLessThan(12000);
    console.info(`[world-studio ground] meshes=${meshes} triangles=${triangles} kerbTriangles=${kerbTriangles} kerbSolids=${kerbSolids.length}`);
  });
});
