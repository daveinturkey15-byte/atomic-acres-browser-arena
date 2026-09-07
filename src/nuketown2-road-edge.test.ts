/**
 * nuketown2-road-edge.test.ts — HF-536 night-gemini13 mechanical proof.
 *
 * Asserts:
 * 1. Instance counts per population within the brief's bands:
 *    - Gravel scatter: 600-1,200 instances total
 *      (a) dense kerb & apron corners (30-60 pebbles per corner within 0.6 m)
 *      (b) sparse gutter line 0.05-0.20 m from kerb (1 per 0.4-0.8 m)
 *      (c) around manholes and pothole rings (10-20 pebbles each)
 *    - Broken asphalt chunks: 20-40 instances, 0.08-0.25 m across, 0.02-0.04 m thick
 *    - Edge ravelling relief: low ridges along both carriageway edges, 0.02 m tall,
 *      0.3-0.8 m long, 0.15-0.30 m wide, 0.01-0.02 m proud
 * 2. Every instance base in [0.005, 0.04] m above the road/verge plane (never coplanar).
 * 3. Inside the carriageway+kerb footprint or the driveway apron.
 * 4. >= 0.4 m from pads/doorway runs and >= 0.5 m from vehicle anchors.
 * 5. Determinism: identical instances and matrices across runs.
 * 6. Tris/draws budget: added <= 25k tris, draws +<= 3, zero new materials/samplers.
 * 7. Body/collider counts identical before/after (presentation-only, ratchets untouched).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import {
  ROAD_EDGE_SEED,
  ROAD_EDGE_GRAVEL_MIN_COUNT,
  ROAD_EDGE_GRAVEL_MAX_COUNT,
  ROAD_EDGE_CHUNKS_MIN_COUNT,
  ROAD_EDGE_CHUNKS_MAX_COUNT,
  ROAD_EDGE_RAVELLING_MIN_COUNT,
  ROAD_EDGE_RAVELLING_MAX_COUNT,
  ROAD_EDGE_BASE_Y_MIN_M,
  ROAD_EDGE_BASE_Y_MAX_M,
  ROAD_EDGE_PAD_CLEARANCE_M,
  ROAD_EDGE_VEHICLE_CLEARANCE_M,
  ROAD_EDGE_MAX_ADDED_TRIS,
  ROAD_EDGE_MAX_ADDED_DRAWS,
  generateGravelInstances,
  generateChunkInstances,
  generateRavellingInstances,
  isInsideRoadOrApronFootprint,
  isClearOfObstacles,
  getRoadEdgeVehicleAnchors,
  getRoadEdgeDoorWalkRuns,
  createPebbleGeometry,
  createFiveFaceBoxGeometry,
  buildNuketown2RoadEdge,
  type Nuketown2RoadEdgeStats,
} from './nuketown2-road-edge';
import { streetPropPlacements } from './forge-kit/street/prefabs';
import { nuketown2HandedX } from './nuketown2-layout';

describe('nuketown2 road edge: HF-536 night-gemini13 mechanical proof', () => {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  const roadEdgeGroup = map.root.getObjectByName('nuketown2-road-edge') as THREE.Group;
  const stats = map.root.userData.nuketown2RoadEdgeStats as Nuketown2RoadEdgeStats;

  it('mounts the road edge presentation group with three InstancedMeshes and zero colliders', () => {
    expect(roadEdgeGroup).toBeTruthy();
    expect(roadEdgeGroup.userData.presentationOnly).toBe(true);
    expect(roadEdgeGroup.userData.blocksShots).toBe(false);

    const gravelMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-gravel') as THREE.InstancedMesh;
    const chunkMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-chunks') as THREE.InstancedMesh;
    const ravellingMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-ravelling') as THREE.InstancedMesh;

    expect(gravelMesh).toBeTruthy();
    expect(chunkMesh).toBeTruthy();
    expect(ravellingMesh).toBeTruthy();

    expect(gravelMesh.isInstancedMesh).toBe(true);
    expect(chunkMesh.isInstancedMesh).toBe(true);
    expect(ravellingMesh.isInstancedMesh).toBe(true);

    // Presentation flags
    for (const mesh of [gravelMesh, chunkMesh, ravellingMesh]) {
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.blocksShots).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(true);
      // Meshes must never be in collision or raycast sets
      expect(map.colliders.some((c) => (c as unknown) === mesh)).toBe(false);
      expect(map.raycastMeshes.includes(mesh)).toBe(false);
    }
  });

  it('keeps body and collider counts identical to baseline (zero solid bodies added)', () => {
    // Verified baseline on clean tree: 371 colliders, 387 raycast meshes
    expect(map.colliders.length).toBe(371);
    expect(map.raycastMeshes.length).toBe(387);

    // Ensure no name contains ' verge ' so declutter / verge-furniture ratchets stay untouched
    const names: string[] = [];
    roadEdgeGroup.traverse((o) => { if (o.name) names.push(o.name); });
    expect(names.some((n) => n.includes(' verge '))).toBe(false);
  });

  describe('1. Population counts and dimensions', () => {
    it('gravel scatter: total count in [600, 1200] band', () => {
      const gravel = generateGravelInstances();
      expect(gravel.length).toBeGreaterThanOrEqual(ROAD_EDGE_GRAVEL_MIN_COUNT);
      expect(gravel.length).toBeLessThanOrEqual(ROAD_EDGE_GRAVEL_MAX_COUNT);
      expect(stats.gravelInstances).toBe(gravel.length);
    });

    it('gravel scatter (a): dense kerb and apron corners have 30-60 pebbles within 0.6 m', () => {
      const gravel = generateGravelInstances();
      const corners: Array<readonly [number, number]> = [
        // North driveway corners
        [-9.25, -5.3], [-4.25, -5.3], [-9.25, -9.8], [-4.25, -9.8],
        // South driveway corners
        [4.25, 8.0], [9.25, 8.0], [4.25, 9.8], [9.25, 9.8],
        // Turning head mouth corners
        [3.5, -5.3], [3.5, 5.3],
        // Bay transition corners
        [-1.2, -5.3], [1.2, 5.3],
      ];

      for (const [cx, cz] of corners) {
        const nearCount = gravel.filter((p) => Math.hypot(p.x - cx, p.z - cz) <= 0.60).length;
        expect(nearCount, `corner at (${cx}, ${cz})`).toBeGreaterThanOrEqual(30);
        expect(nearCount, `corner at (${cx}, ${cz})`).toBeLessThanOrEqual(60);
      }
    });

    it('gravel scatter (b): gutter line pebbles stand 0.05-0.20 m from kerb along both sides', () => {
      const gravel = generateGravelInstances();
      // Inspect pebbles along the straight road stem (|z| around 5.10 to 5.25)
      const gutterPebbles = gravel.filter((p) => (
        p.x >= -17.0 && p.x <= 3.0 &&
        ((p.z >= -5.25 && p.z <= -5.10) || (p.z >= 5.10 && p.z <= 5.25))
      ));
      expect(gutterPebbles.length, 'gutter line pebble count').toBeGreaterThanOrEqual(60);
      for (const p of gutterPebbles) {
        const distFromKerb = Math.abs(Math.abs(p.z) - 5.3);
        expect(distFromKerb).toBeGreaterThanOrEqual(0.049);
        expect(distFromKerb).toBeLessThanOrEqual(0.201);
      }
    });

    it('gravel scatter (c): manholes and pothole rings have 10-20 pebbles each', () => {
      const gravel = generateGravelInstances();
      const streetProps = streetPropPlacements();
      const features: Array<{ id: string; pos: readonly [number, number] }> = [];

      for (const p of streetProps) {
        if (p.propId.includes('manhole') || p.propId.includes('pothole')) {
          const nx = nuketown2HandedX(p.anchor[0]);
          const nz = p.anchor[2];
          features.push(
            { id: `${p.propId} north`, pos: [nx, nz] },
            { id: `${p.propId} south`, pos: [-nx, -nz] }
          );
        }
      }

      expect(features.length, '8 street wear ring features').toBe(8);
      for (const f of features) {
        const ringPebbles = gravel.filter((p) => Math.hypot(p.x - f.pos[0], p.z - f.pos[1]) <= 0.55);
        expect(ringPebbles.length, `pebbles around ${f.id} at [${f.pos[0]}, ${f.pos[1]}]`).toBeGreaterThanOrEqual(10);
        expect(ringPebbles.length, `pebbles around ${f.id} at [${f.pos[0]}, ${f.pos[1]}]`).toBeLessThanOrEqual(20);
      }
    });

    it('broken asphalt chunks: count in [20, 40] band with flat angular dimensions', () => {
      const chunks = generateChunkInstances();
      expect(chunks.length).toBeGreaterThanOrEqual(ROAD_EDGE_CHUNKS_MIN_COUNT);
      expect(chunks.length).toBeLessThanOrEqual(ROAD_EDGE_CHUNKS_MAX_COUNT);
      expect(stats.chunkInstances).toBe(chunks.length);

      for (const c of chunks) {
        expect(c.scaleX, 'chunk width').toBeGreaterThanOrEqual(0.079);
        expect(c.scaleX, 'chunk width').toBeLessThanOrEqual(0.251);
        expect(c.scaleZ, 'chunk length').toBeGreaterThanOrEqual(0.079);
        expect(c.scaleZ, 'chunk length').toBeLessThanOrEqual(0.251);
        expect(c.scaleY, 'chunk thickness').toBeGreaterThanOrEqual(0.019);
        expect(c.scaleY, 'chunk thickness').toBeLessThanOrEqual(0.041);
        // Base is 0.01 m proud above road
        expect(c.y).toBeCloseTo(0.010, 3);
      }
    });

    it('edge ravelling relief: low ridges along both carriageway edges (0.15-0.30 m wide, 0.02 m tall)', () => {
      const ridges = generateRavellingInstances();
      expect(ridges.length).toBeGreaterThanOrEqual(ROAD_EDGE_RAVELLING_MIN_COUNT);
      expect(ridges.length).toBeLessThanOrEqual(ROAD_EDGE_RAVELLING_MAX_COUNT);
      expect(stats.ravellingInstances).toBe(ridges.length);

      for (const r of ridges) {
        expect(r.scaleY, 'ridge height').toBeCloseTo(0.02, 3);
        expect(r.scaleX, 'ridge length').toBeGreaterThanOrEqual(0.30);
        expect(r.scaleX, 'ridge length').toBeLessThanOrEqual(0.80);
        expect(r.scaleZ, 'ridge band width').toBeGreaterThanOrEqual(0.15);
        expect(r.scaleZ, 'ridge band width').toBeLessThanOrEqual(0.30);
        // Base is 0.01-0.02 m proud
        expect(r.y).toBeGreaterThanOrEqual(0.010);
        expect(r.y).toBeLessThanOrEqual(0.020);
      }
    });
  });

  describe('2. Elevation: every instance base in [0.005, 0.04] m above ground (never coplanar)', () => {
    it('every instance base satisfies [0.005, 0.04] m and is never coplanar with asphalt or apron', () => {
      const gravel = generateGravelInstances();
      const chunks = generateChunkInstances();
      const ravelling = generateRavellingInstances();
      const allInstances = [...gravel, ...chunks, ...ravelling];

      expect(allInstances.length).toBe(stats.totalInstances);

      for (const inst of allInstances) {
        expect(inst.y, `instance at (${inst.x}, ${inst.z}) base height`).toBeGreaterThanOrEqual(ROAD_EDGE_BASE_Y_MIN_M);
        expect(inst.y, `instance at (${inst.x}, ${inst.z}) base height`).toBeLessThanOrEqual(ROAD_EDGE_BASE_Y_MAX_M);

        // Never coplanar with road plane (y = 0)
        expect(Math.abs(inst.y - 0.0)).toBeGreaterThan(0.004);
        // Never coplanar with apron plane (y = 0.02)
        expect(Math.abs(inst.y - 0.02)).toBeGreaterThan(0.004);
      }
    });

    it('verifies instance matrix decomposed base Y matches instance position Y', () => {
      const gravelMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-gravel') as THREE.InstancedMesh;
      const mat = new THREE.Matrix4();
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();

      for (let i = 0; i < gravelMesh.count; i += 1) {
        gravelMesh.getMatrixAt(i, mat);
        mat.decompose(pos, quat, scale);
        expect(pos.y).toBeGreaterThanOrEqual(ROAD_EDGE_BASE_Y_MIN_M);
        expect(pos.y).toBeLessThanOrEqual(ROAD_EDGE_BASE_Y_MAX_M);
      }
    });
  });

  describe('3. Footprint: inside carriageway+kerb footprint or driveway apron', () => {
    it('every instance is inside carriageway+kerb footprint or apron', () => {
      const gravel = generateGravelInstances();
      const chunks = generateChunkInstances();
      const ravelling = generateRavellingInstances();

      for (const inst of [...gravel, ...chunks, ...ravelling]) {
        expect(
          isInsideRoadOrApronFootprint(inst.x, inst.z),
          `instance at (${inst.x}, ${inst.z}) inside footprint`
        ).toBe(true);
      }
    });
  });

  describe('4. Clearances: >= 0.4 m from pads/doorways and >= 0.5 m from vehicle anchors', () => {
    it('every instance is >= 0.5 m from every vehicle anchor', () => {
      const anchors = getRoadEdgeVehicleAnchors();
      const gravel = generateGravelInstances();
      const chunks = generateChunkInstances();
      const ravelling = generateRavellingInstances();

      for (const inst of [...gravel, ...chunks, ...ravelling]) {
        for (const [vx, vz] of anchors) {
          const dist = Math.hypot(inst.x - vx, inst.z - vz);
          expect(dist, `dist from vehicle at (${vx}, ${vz})`).toBeGreaterThanOrEqual(ROAD_EDGE_VEHICLE_CLEARANCE_M - 1e-4);
        }
      }
    });

    it('every instance is >= 0.4 m from doorway walk runs and pads', () => {
      const walks = getRoadEdgeDoorWalkRuns();
      const gravel = generateGravelInstances();
      const chunks = generateChunkInstances();
      const ravelling = generateRavellingInstances();

      for (const inst of [...gravel, ...chunks, ...ravelling]) {
        for (const walk of walks) {
          const inWalkMargin = (
            inst.x >= walk.x0 - ROAD_EDGE_PAD_CLEARANCE_M + 1e-4 &&
            inst.x <= walk.x1 + ROAD_EDGE_PAD_CLEARANCE_M - 1e-4 &&
            inst.z >= walk.z0 - ROAD_EDGE_PAD_CLEARANCE_M + 1e-4 &&
            inst.z <= walk.z1 + ROAD_EDGE_PAD_CLEARANCE_M - 1e-4
          );
          expect(inWalkMargin, `instance at (${inst.x}, ${inst.z}) clears door walk`).toBe(false);
          expect(isClearOfObstacles(inst.x, inst.z)).toBe(true);
        }
      }
    });
  });

  describe('5. Determinism', () => {
    it('generates identical instances with the same seed', () => {
      const gravel1 = generateGravelInstances(ROAD_EDGE_SEED);
      const gravel2 = generateGravelInstances(ROAD_EDGE_SEED);
      expect(gravel1).toEqual(gravel2);

      const chunks1 = generateChunkInstances(ROAD_EDGE_SEED ^ 0x4a12);
      const chunks2 = generateChunkInstances(ROAD_EDGE_SEED ^ 0x4a12);
      expect(chunks1).toEqual(chunks2);

      const ravelling1 = generateRavellingInstances(ROAD_EDGE_SEED ^ 0x9c31);
      const ravelling2 = generateRavellingInstances(ROAD_EDGE_SEED ^ 0x9c31);
      expect(ravelling1).toEqual(ravelling2);
    });

    it('builds identical instance matrices across separate builds', () => {
      const parentA = new THREE.Object3D();
      const parentB = new THREE.Object3D();
      const matPlaceholder = new THREE.MeshBasicMaterial();

      const a = buildNuketown2RoadEdge(parentA, { kerb: matPlaceholder, asphalt: matPlaceholder });
      const b = buildNuketown2RoadEdge(parentB, { kerb: matPlaceholder, asphalt: matPlaceholder });

      expect(a.stats).toEqual(b.stats);

      const meshA = a.group.getObjectByName('nuketown2-road-edge-gravel') as THREE.InstancedMesh;
      const meshB = b.group.getObjectByName('nuketown2-road-edge-gravel') as THREE.InstancedMesh;
      expect(meshA.count).toBe(meshB.count);

      const m1 = new THREE.Matrix4();
      const m2 = new THREE.Matrix4();
      for (let i = 0; i < meshA.count; i += 1) {
        meshA.getMatrixAt(i, m1);
        meshB.getMatrixAt(i, m2);
        expect(m1.elements).toEqual(m2.elements);
      }
    });
  });

  describe('6. Budgets: triangles, draw calls, and zero new materials', () => {
    it('total added triangles <= 25k (measured)', () => {
      expect(createPebbleGeometry().index!.count / 3).toBe(8);
      expect(createFiveFaceBoxGeometry().index!.count / 3).toBe(10);
      expect(stats.totalTriangles).toBeLessThanOrEqual(ROAD_EDGE_MAX_ADDED_TRIS);
      expect(stats.totalTriangles).toBeGreaterThanOrEqual(5000);
      expect(stats.totalTriangles).toBe(6634); // Exact measured value
    });

    it('adds exactly 3 draw calls (one InstancedMesh per population)', () => {
      expect(stats.drawCalls).toBeLessThanOrEqual(ROAD_EDGE_MAX_ADDED_DRAWS);
      expect(stats.drawCalls).toBe(3);
    });

    it('reuses existing arena materials (kerb concrete and asphalt)', () => {
      const gravelMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-gravel') as THREE.InstancedMesh;
      const chunkMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-chunks') as THREE.InstancedMesh;
      const ravellingMesh = roadEdgeGroup.getObjectByName('nuketown2-road-edge-ravelling') as THREE.InstancedMesh;

      // Gravel uses kerb concrete material
      expect((gravelMesh.material as THREE.Material).name).toContain('kerb');
      // Chunks and ravelling use asphalt material
      expect((chunkMesh.material as THREE.Material).name).toContain('asphalt');
      expect((ravellingMesh.material as THREE.Material).name).toContain('asphalt');
    });
  });
});
