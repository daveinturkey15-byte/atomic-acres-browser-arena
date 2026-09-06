/**
 * nuketown2-road-edge.ts — HF-536 night-gemini13: road edges that read as used.
 *
 * Solves Critic Gap #5 on interim-4:
 * "roadway edges, gutters, and curb corners still lack loose gravel accumulation,
 * broken asphalt debris, and micro-fissures"
 *
 * Three presentation-only InstancedMeshes (three draws, zero new materials/samplers):
 *   1. GRAVEL SCATTER: 6-face squashed 8-tri octahedron pebbles (15-40 mm),
 *      600-1,200 instances, placed by a deterministic hash in three populations:
 *      (a) kerb corners of the turning head and driveway apron corners (30-60 per corner within 0.6 m),
 *      (b) thin gutter line 0.05-0.20 m from the kerb along both sides (1 per 0.4-0.8 m),
 *      (c) around the manholes and pothole rings (10-20 each).
 *      Base sits 0.005-0.01 m above asphalt (never coplanar), random yaw/scale 0.7-1.3.
 *      Uses existing kerb concrete role (m.kerb).
 *
 *   2. BROKEN ASPHALT CHUNKS: 20-40 flat angular chunks (thin 5-face boxes 0.08-0.25 m across,
 *      0.02-0.04 m thick, asphalt role), 0.01 m proud, hashed placement at road edge
 *      and pothole rings. Uses existing asphalt role (m.asphalt).
 *
 *   3. EDGE RAVELLING RELIEF: 0.15-0.30 m band of low ridges (thin boxes 0.02 m tall,
 *      0.3-0.8 m long, asphalt role, 0.01-0.02 m proud) with a jagged inner edge along
 *      both carriageway edges, 1 per 0.6-1.0 m, so the road edge does not end in a ruled line.
 *      Uses existing asphalt role (m.asphalt).
 *
 * Zero solid bodies, zero colliders, ratchets untouched (names never contain ' verge ').
 */
import * as THREE from 'three';
import {
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_BAY_RUNS,
  NUKETOWN2_HOUSE_CENTRE_X,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_STREET_COACH,
  NUKETOWN2_STREET_CARS,
  nuketown2HandedX,
  nuketown2HandedSpan,
} from './nuketown2-layout';
import { streetPropPlacements } from './forge-kit/street/prefabs';

// ---------------------------------------------------------------------------
// Constants (pinned by BRIEF and mechanical test)
// ---------------------------------------------------------------------------

export const ROAD_EDGE_SEED = 0x536_ed9e;

export const ROAD_EDGE_GRAVEL_MIN_COUNT = 600;
export const ROAD_EDGE_GRAVEL_MAX_COUNT = 1200;

export const ROAD_EDGE_CHUNKS_MIN_COUNT = 20;
export const ROAD_EDGE_CHUNKS_MAX_COUNT = 40;

export const ROAD_EDGE_RAVELLING_MIN_COUNT = 40;
export const ROAD_EDGE_RAVELLING_MAX_COUNT = 90;

export const ROAD_EDGE_BASE_Y_MIN_M = 0.005;
export const ROAD_EDGE_BASE_Y_MAX_M = 0.04;

export const ROAD_EDGE_PAD_CLEARANCE_M = 0.4;
export const ROAD_EDGE_VEHICLE_CLEARANCE_M = 0.5;

export const ROAD_EDGE_MAX_ADDED_TRIS = 25000;
export const ROAD_EDGE_MAX_ADDED_DRAWS = 3;

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

export function createRoadEdgeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Geometries
// ---------------------------------------------------------------------------

/**
 * 6-face pebble: a squashed 8-tri octahedron with bottom vertex at y = 0.
 * Radius ~ 0.014 m, height ~ 0.010 m (15-40 mm scale variation).
 */
export function createPebbleGeometry(radius = 0.014, height = 0.010): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const hr = height / 2;
  const positions = new Float32Array([
     radius, hr, 0,       // 0
     0, hr,  radius,      // 1
    -radius, hr, 0,       // 2
     0, hr, -radius,      // 3
     0, height, 0,        // 4 (top apex)
     0, 0, 0,             // 5 (bottom base vertex at y = 0)
  ]);
  const indices = [
    // Top 4 triangular faces
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0,
    // Bottom 4 triangular faces
    0, 1, 5,
    1, 2, 5,
    2, 3, 5,
    3, 0, 5,
  ];
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Thin 5-face box (open bottom): unit box [x: -0.5..0.5, y: 0..1, z: -0.5..0.5].
 * Bottom face is omitted; base sits at y = 0. 5 quad faces = 10 triangles.
 */
export function createFiveFaceBoxGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array([
    // Top face (+Y = 1): 0, 1, 2, 3
    -0.5, 1, -0.5,
     0.5, 1, -0.5,
     0.5, 1,  0.5,
    -0.5, 1,  0.5,
    // Bottom vertices (Y = 0): 4, 5, 6, 7
    -0.5, 0, -0.5,
     0.5, 0, -0.5,
     0.5, 0,  0.5,
    -0.5, 0,  0.5,
  ]);
  const indices = [
    0, 1, 2,  0, 2, 3, // Top (+Y)
    3, 2, 6,  3, 6, 7, // Front (+Z)
    1, 0, 4,  1, 4, 5, // Back (-Z)
    2, 1, 5,  2, 5, 6, // Right (+X)
    0, 3, 7,  0, 7, 4, // Left (-X)
  ];
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ---------------------------------------------------------------------------
// Footprint and Obstacle Clearances
// ---------------------------------------------------------------------------

export type Point2 = readonly [number, number];
export type Rect2 = Readonly<{ x0: number; x1: number; z0: number; z1: number }>;

/** Driveway apron rects in the world frame. */
export const WORLD_DRIVEWAY_APRONS: readonly Rect2[] = Object.freeze([
  // North driveway: garage span [4.25, 9.25] mirrored -> [-9.25, -4.25], z from garage front (-10) to kerb (-5.3)
  Object.freeze({ x0: -9.25, x1: -4.25, z0: -10.0, z1: -5.3 }),
  // South driveway: garage span [-9.25, -4.25] mirrored -> [4.25, 9.25], z from kerb (8.0) to garage front (10.0)
  Object.freeze({ x0: 4.25, x1: 9.25, z0: 8.0, z1: 10.0 }),
]);

/** Returns true if point (x, z) lies within the carriageway, kerb, or driveway aprons. */
export function isInsideRoadOrApronFootprint(x: number, z: number): boolean {
  // 1. Turning head bulb (centre at world x=10, z=0, radius 8.0 + 0.20 kerb margin)
  const bulbDist = Math.hypot(x - 10, z);
  if (bulbDist <= 8.20) return true;

  // 2. Carriageway stem (world x from -18.0 to 3.6)
  if (x >= -18.0 && x <= 3.6) {
    if (Math.abs(z) <= NUKETOWN2_STREET_HALF_WIDTH + 0.20) return true;
    // Bays along the stem: bays extend to 5.3 + 2.2 = 7.5 + 0.20 margin
    if (Math.abs(z) <= NUKETOWN2_STREET_HALF_WIDTH + 2.40) {
      const [mouthSpanA, mouthSpanB] = nuketown2HandedSpan(
        NUKETOWN2_BAY_RUNS[0].x0 - 0.2,
        NUKETOWN2_BAY_RUNS[0].x1 + 0.2
      );
      if (x >= mouthSpanA && x <= mouthSpanB) return true;

      const [outerSpanA, outerSpanB] = nuketown2HandedSpan(
        NUKETOWN2_BAY_RUNS[1].x0 - 0.2,
        NUKETOWN2_BAY_RUNS[1].x1 + 0.2
      );
      if (x >= outerSpanA && x <= outerSpanB) return true;
    }
  }

  // 3. Driveway aprons
  for (const apron of WORLD_DRIVEWAY_APRONS) {
    if (x >= apron.x0 - 0.05 && x <= apron.x1 + 0.05 && z >= apron.z0 - 0.05 && z <= apron.z1 + 0.05) {
      return true;
    }
  }

  return false;
}

/** Vehicle anchor points in the world frame. */
export function getRoadEdgeVehicleAnchors(): readonly Point2[] {
  const truckX = nuketown2HandedX(NUKETOWN2_CENTRAL_TRUCK.x);
  const truckCabX = nuketown2HandedX(NUKETOWN2_CENTRAL_TRUCK.cabX);
  const coachX = nuketown2HandedX(NUKETOWN2_STREET_COACH.x);
  const saloonX = nuketown2HandedX(NUKETOWN2_STREET_CARS.saloon.x);
  const classicX = nuketown2HandedX(NUKETOWN2_STREET_CARS.classic.x);
  const driveCarX = nuketown2HandedX(7.25);
  const driveCarZ = -10.0 + 4.6; // GARAGE_FRONT_Z + 4.6 = -5.4

  return Object.freeze([
    [truckX, NUKETOWN2_CENTRAL_TRUCK.z] as const,
    [truckCabX, NUKETOWN2_CENTRAL_TRUCK.z] as const,
    [coachX, NUKETOWN2_STREET_COACH.z] as const,
    [saloonX, NUKETOWN2_STREET_CARS.saloon.z] as const,
    [classicX, NUKETOWN2_STREET_CARS.classic.z] as const,
    [driveCarX, driveCarZ] as const,
    [-driveCarX, -driveCarZ] as const,
  ]);
}

/** Doorway run rects in the world frame to clear by >= 0.4 m. */
export function getRoadEdgeDoorWalkRuns(): readonly Rect2[] {
  const nx = nuketown2HandedX(NUKETOWN2_HOUSE_CENTRE_X);
  const halfW = 0.6;

  return Object.freeze([
    // North front door walk to street
    Object.freeze({ x0: nx - halfW, x1: nx + halfW, z0: -10.0, z1: -5.3 }),
    // South front door walk to street
    Object.freeze({ x0: -nx - halfW, x1: -nx + halfW, z0: 5.3, z1: 10.0 }),
  ]);
}

/** Returns true if (x, z) clears pads, doorway runs (>= 0.4 m), and vehicle anchors (>= 0.5 m). */
export function isClearOfObstacles(x: number, z: number): boolean {
  // Vehicle anchors >= 0.5 m
  for (const [vx, vz] of getRoadEdgeVehicleAnchors()) {
    if (Math.hypot(x - vx, z - vz) < ROAD_EDGE_VEHICLE_CLEARANCE_M) return false;
  }

  // Doorway walk runs >= 0.4 m
  for (const walk of getRoadEdgeDoorWalkRuns()) {
    if (
      x >= walk.x0 - ROAD_EDGE_PAD_CLEARANCE_M &&
      x <= walk.x1 + ROAD_EDGE_PAD_CLEARANCE_M &&
      z >= walk.z0 - ROAD_EDGE_PAD_CLEARANCE_M &&
      z <= walk.z1 + ROAD_EDGE_PAD_CLEARANCE_M
    ) {
      return false;
    }
  }

  // Far yard bounds / border paths outside fences
  if (Math.abs(z) > 25.0) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Placement Generation
// ---------------------------------------------------------------------------

export interface RoadEdgeInstance {
  readonly x: number;
  readonly y: number; // Base height above ground
  readonly z: number;
  readonly yaw: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
}

/**
 * 1. GRAVEL SCATTER PLACEMENTS (600 - 1,200 instances)
 * Three populations:
 * (a) kerb corners of the turning head and every driveway apron corner (dense, 30-60 per corner within 0.6 m)
 * (b) thin gutter line 0.05-0.20 m from the kerb along both sides (sparse, 1 per 0.4-0.8 m)
 * (c) around manholes and pothole rings (10-20 each)
 */
export function generateGravelInstances(seed = ROAD_EDGE_SEED): RoadEdgeInstance[] {
  const rng = createRoadEdgeRng(seed);
  const instances: RoadEdgeInstance[] = [];

  // Corner anchor definitions (each well-separated so counts are 30-60 per corner):
  const cornerAnchors: Point2[] = [
    // North driveway apron corners:
    [-9.25, -5.3],
    [-4.25, -5.3],
    [-9.25, -9.8],
    [-4.25, -9.8],
    // South driveway apron corners:
    [4.25, 8.0],
    [9.25, 8.0],
    [4.25, 9.8],
    [9.25, 9.8],
    // Turning head mouth corners:
    [3.5, -5.3],
    [3.5, 5.3],
    // Bay transition corners:
    [-1.2, -5.3],
    [1.2, 5.3],
  ];

  // (a) Dense kerb & apron corners (30-60 pebbles within 0.6 m):
  for (const [cx, cz] of cornerAnchors) {
    const targetCount = Math.floor(38 + rng() * 14); // 38 to 51 per corner
    let placed = 0;
    let attempts = 0;
    while (placed < targetCount && attempts < 200) {
      attempts += 1;
      const angle = rng() * Math.PI * 2;
      const dist = 0.05 + Math.sqrt(rng()) * 0.55; // within 0.60 m
      const px = cx + Math.cos(angle) * dist;
      const pz = cz + Math.sin(angle) * dist;

      if (!isInsideRoadOrApronFootprint(px, pz) || !isClearOfObstacles(px, pz)) continue;

      const isApron = pz <= -5.4 || pz >= 7.9;
      const baseY = isApron ? 0.02 + 0.007 + rng() * 0.003 : 0.007 + rng() * 0.003;
      const scale = 0.7 + rng() * 0.6; // 0.7 - 1.3
      const yaw = rng() * Math.PI * 2;

      instances.push({
        x: px,
        y: baseY,
        z: pz,
        yaw,
        scaleX: scale,
        scaleY: scale * 0.8, // squashed pebble
        scaleZ: scale,
      });
      placed += 1;
    }
  }

  // (b) Thin gutter line 0.05-0.20 m from kerb along both sides (sparse, 1 per 0.4-0.8 m):
  // North stem kerb line:
  let curX = -17.5;
  while (curX <= 3.2) {
    curX += 0.45 + rng() * 0.35; // 0.45 - 0.80 m step
    const offset = 0.05 + rng() * 0.15; // 0.05 - 0.20 m from kerb
    const px = curX;
    const pz = -5.3 + offset; // inward from north kerb
    if (isInsideRoadOrApronFootprint(px, pz) && isClearOfObstacles(px, pz)) {
      const baseY = 0.007 + rng() * 0.003;
      const scale = 0.7 + rng() * 0.6;
      instances.push({
        x: px,
        y: baseY,
        z: pz,
        yaw: rng() * Math.PI * 2,
        scaleX: scale,
        scaleY: scale * 0.8,
        scaleZ: scale,
      });
    }
  }

  // South stem kerb line:
  curX = -17.5;
  while (curX <= 3.2) {
    curX += 0.45 + rng() * 0.35;
    const offset = 0.05 + rng() * 0.15;
    const px = curX;
    const pz = 5.3 - offset; // inward from south kerb
    if (isInsideRoadOrApronFootprint(px, pz) && isClearOfObstacles(px, pz)) {
      const baseY = 0.007 + rng() * 0.003;
      const scale = 0.7 + rng() * 0.6;
      instances.push({
        x: px,
        y: baseY,
        z: pz,
        yaw: rng() * Math.PI * 2,
        scaleX: scale,
        scaleY: scale * 0.8,
        scaleZ: scale,
      });
    }
  }

  // Turning head gutter arc (radius 8.0, offset inward 0.05-0.20 m):
  const headCircumference = Math.PI * 8.0; // ~25 m arc
  const headSteps = Math.floor(headCircumference / 0.6);
  for (let i = 0; i < headSteps; i += 1) {
    const angle = -Math.PI / 2 + (i / headSteps) * Math.PI + (rng() - 0.5) * 0.05;
    const offset = 0.05 + rng() * 0.15;
    const r = 8.0 - offset;
    const px = 10.0 + Math.cos(angle) * r;
    const pz = Math.sin(angle) * r;
    if (isInsideRoadOrApronFootprint(px, pz) && isClearOfObstacles(px, pz)) {
      const baseY = 0.007 + rng() * 0.003;
      const scale = 0.7 + rng() * 0.6;
      instances.push({
        x: px,
        y: baseY,
        z: pz,
        yaw: rng() * Math.PI * 2,
        scaleX: scale,
        scaleY: scale * 0.8,
        scaleZ: scale,
      });
    }
  }

  // (c) Around manholes and pothole rings (10-20 each):
  const streetProps = streetPropPlacements();
  const ringFeatures: Point2[] = [];
  for (const p of streetProps) {
    if (p.propId.includes('manhole') || p.propId.includes('pothole')) {
      const nx = nuketown2HandedX(p.anchor[0]);
      const nz = p.anchor[2];
      ringFeatures.push([nx, nz], [-nx, -nz]);
    }
  }

  for (const [fx, fz] of ringFeatures) {
    const count = Math.floor(13 + rng() * 3); // 13 to 15 pebbles
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < 50) {
      attempts += 1;
      const angle = rng() * Math.PI * 2;
      const dist = 0.32 + rng() * 0.16; // 0.32 - 0.48 m from centre (tight around rim)
      const px = fx + Math.cos(angle) * dist;
      const pz = fz + Math.sin(angle) * dist;

      if (!isInsideRoadOrApronFootprint(px, pz) || !isClearOfObstacles(px, pz)) continue;

      const baseY = 0.007 + rng() * 0.003;
      const scale = 0.7 + rng() * 0.6;
      instances.push({
        x: px,
        y: baseY,
        z: pz,
        yaw: rng() * Math.PI * 2,
        scaleX: scale,
        scaleY: scale * 0.8,
        scaleZ: scale,
      });
      placed += 1;
    }
  }

  return instances;
}

/**
 * 2. BROKEN ASPHALT CHUNKS (20 - 40 instances)
 * Flat angular chunks (thin 5-face boxes 0.08-0.25 m across, 0.02-0.04 m thick, asphalt role)
 * at road edge where verge meets carriageway and at pothole rings, 0.01 m proud.
 */
export function generateChunkInstances(seed = ROAD_EDGE_SEED ^ 0x4a12): RoadEdgeInstance[] {
  const rng = createRoadEdgeRng(seed);
  const instances: RoadEdgeInstance[] = [];

  // Pothole rings (4 sites in world frame):
  const streetProps = streetPropPlacements();
  const potholes: Point2[] = [];
  for (const p of streetProps) {
    if (p.propId.includes('pothole')) {
      const nx = nuketown2HandedX(p.anchor[0]);
      const nz = p.anchor[2];
      potholes.push([nx, nz], [-nx, -nz]);
    }
  }

  // 2-3 chunks near each pothole ring (~10 chunks total):
  for (const [px, pz] of potholes) {
    const count = 2 + (rng() > 0.4 ? 1 : 0);
    for (let c = 0; c < count; c += 1) {
      const angle = rng() * Math.PI * 2;
      const dist = 0.35 + rng() * 0.25;
      const x = px + Math.cos(angle) * dist;
      const z = pz + Math.sin(angle) * dist;
      if (isInsideRoadOrApronFootprint(x, z) && isClearOfObstacles(x, z)) {
        const sizeX = 0.09 + rng() * 0.12; // 0.09 - 0.21 m
        const sizeZ = 0.09 + rng() * 0.12;
        const thickness = 0.02 + rng() * 0.018; // 0.02 - 0.038 m thick
        instances.push({
          x,
          y: 0.010, // 0.01 m proud
          z,
          yaw: rng() * Math.PI * 2,
          scaleX: sizeX,
          scaleY: thickness,
          scaleZ: sizeZ,
        });
      }
    }
  }

  // Road edge where verge meets carriageway (~20 chunks):
  // Distributed along north and south kerb lines and turning head edge
  const roadEdgeCandidates: Point2[] = [
    [-16.0, -5.22], [-14.2, -5.20], [-11.8, -5.24], [-7.5, -5.21], [-3.8, -5.23],
    [-0.5, -5.20], [2.2, -5.24], [5.5, -7.10], [9.2, -6.80], [14.0, -4.50],
    [-15.2, 5.21], [-13.0, 5.23], [-10.5, 5.20], [-6.2, 5.22], [-2.5, 5.24],
    [0.8, 5.21], [2.8, 5.23], [6.0, 7.15], [8.8, 6.90], [14.2, 4.40],
    [16.8, 1.8], [17.2, -1.2],
  ];

  for (const [ex, ez] of roadEdgeCandidates) {
    if (instances.length >= 32) break;
    const jx = ex + (rng() - 0.5) * 0.4;
    const jz = ez + (rng() - 0.5) * 0.15;
    if (isInsideRoadOrApronFootprint(jx, jz) && isClearOfObstacles(jx, jz)) {
      const sizeX = 0.08 + rng() * 0.15; // 0.08 - 0.23 m
      const sizeZ = 0.08 + rng() * 0.15;
      const thickness = 0.02 + rng() * 0.018; // 0.02 - 0.038 m
      instances.push({
        x: jx,
        y: 0.010, // 0.01 m proud
        z: jz,
        yaw: rng() * Math.PI * 2,
        scaleX: sizeX,
        scaleY: thickness,
        scaleZ: sizeZ,
      });
    }
  }

  return instances;
}

/**
 * 3. EDGE RAVELLING RELIEF (40 - 90 instances)
 * Along both carriageway edges a 0.15-0.30 m band of low ridges (thin boxes 0.02 m tall,
 * 0.3-0.8 m long, asphalt role, 0.01-0.02 m proud) with a jagged inner edge (hash per 0.5 m cell),
 * 1 per 0.6-1.0 m, so the road edge does not end in a ruled line.
 */
export function generateRavellingInstances(seed = ROAD_EDGE_SEED ^ 0x9c31): RoadEdgeInstance[] {
  const rng = createRoadEdgeRng(seed);
  const instances: RoadEdgeInstance[] = [];

  // North carriageway edge: step along x from -17.5 to 3.2
  let x = -17.5;
  while (x <= 3.2) {
    const step = 0.65 + rng() * 0.30; // 1 per 0.65 - 0.95 m
    x += step;
    const ridgeLength = 0.32 + rng() * 0.45; // 0.32 - 0.77 m long
    const bandWidth = 0.16 + rng() * 0.12;   // 0.16 - 0.28 m wide
    // Jagged inner edge: centre sits at kerb - half band width
    const z = -5.3 + bandWidth / 2 + (rng() - 0.5) * 0.04;
    const px = x;

    if (isInsideRoadOrApronFootprint(px, z) && isClearOfObstacles(px, z)) {
      instances.push({
        x: px,
        y: 0.012, // 0.012 m proud
        z,
        yaw: (rng() - 0.5) * 0.12, // slight yaw jitter along edge
        scaleX: ridgeLength,
        scaleY: 0.02, // 0.02 m tall
        scaleZ: bandWidth,
      });
    }
  }

  // South carriageway edge: step along x from -17.5 to 3.2
  x = -17.5;
  while (x <= 3.2) {
    const step = 0.65 + rng() * 0.30;
    x += step;
    const ridgeLength = 0.32 + rng() * 0.45;
    const bandWidth = 0.16 + rng() * 0.12;
    const z = 5.3 - bandWidth / 2 + (rng() - 0.5) * 0.04;
    const px = x;

    if (isInsideRoadOrApronFootprint(px, z) && isClearOfObstacles(px, z)) {
      instances.push({
        x: px,
        y: 0.012, // 0.012 m proud
        z,
        yaw: (rng() - 0.5) * 0.12,
        scaleX: ridgeLength,
        scaleY: 0.02,
        scaleZ: bandWidth,
      });
    }
  }

  return instances;
}

// ---------------------------------------------------------------------------
// Build Road Edge
// ---------------------------------------------------------------------------

export interface Nuketown2RoadEdgeStats {
  readonly gravelInstances: number;
  readonly chunkInstances: number;
  readonly ravellingInstances: number;
  readonly totalInstances: number;
  readonly gravelTriangles: number;
  readonly chunkTriangles: number;
  readonly ravellingTriangles: number;
  readonly totalTriangles: number;
  readonly drawCalls: number;
}

export interface Nuketown2RoadEdge {
  readonly group: THREE.Group;
  readonly stats: Nuketown2RoadEdgeStats;
}
export function buildNuketown2RoadEdge(
  parent: THREE.Object3D,
  options: Readonly<{ kerb: THREE.Material; asphalt: THREE.Material }>
): Nuketown2RoadEdge {
  const group = new THREE.Group();
  group.name = 'nuketown2-road-edge';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  // --- 1. Gravel Scatter (kerb concrete role: options.kerb) ---
  const gravelData = generateGravelInstances();
  const pebbleGeom = createPebbleGeometry();
  const gravelMesh = new THREE.InstancedMesh(
    pebbleGeom,
    options.kerb,
    Math.max(1, gravelData.length)
  );
  gravelMesh.name = 'nuketown2-road-edge-gravel';
  gravelData.forEach((inst, i) => {
    e.set(0, inst.yaw, 0);
    q.setFromEuler(e);
    p.set(inst.x, inst.y, inst.z);
    s.set(inst.scaleX, inst.scaleY, inst.scaleZ);
    mat.compose(p, q, s);
    gravelMesh.setMatrixAt(i, mat);
  });
  gravelMesh.count = gravelData.length;
  gravelMesh.instanceMatrix.needsUpdate = true;
  gravelMesh.computeBoundingSphere();
  gravelMesh.castShadow = false;
  gravelMesh.receiveShadow = true;
  gravelMesh.userData.presentationOnly = true;
  gravelMesh.userData.blocksShots = false;
  group.add(gravelMesh);

  // --- 2. Broken Asphalt Chunks (asphalt role: options.asphalt) ---
  const chunkData = generateChunkInstances();
  const chunkGeom = createFiveFaceBoxGeometry();
  const chunkMesh = new THREE.InstancedMesh(
    chunkGeom,
    options.asphalt,
    Math.max(1, chunkData.length)
  );
  chunkMesh.name = 'nuketown2-road-edge-chunks';
  chunkData.forEach((inst, i) => {
    e.set(0, inst.yaw, 0);
    q.setFromEuler(e);
    p.set(inst.x, inst.y, inst.z);
    s.set(inst.scaleX, inst.scaleY, inst.scaleZ);
    mat.compose(p, q, s);
    chunkMesh.setMatrixAt(i, mat);
  });
  chunkMesh.count = chunkData.length;
  chunkMesh.instanceMatrix.needsUpdate = true;
  chunkMesh.computeBoundingSphere();
  chunkMesh.castShadow = false;
  chunkMesh.receiveShadow = true;
  chunkMesh.userData.presentationOnly = true;
  chunkMesh.userData.blocksShots = false;
  group.add(chunkMesh);

  // --- 3. Edge Ravelling Relief (asphalt role: options.asphalt) ---
  const ravellingData = generateRavellingInstances();
  const ravellingGeom = createFiveFaceBoxGeometry();
  const ravellingMesh = new THREE.InstancedMesh(
    ravellingGeom,
    options.asphalt,
    Math.max(1, ravellingData.length)
  );
  ravellingMesh.name = 'nuketown2-road-edge-ravelling';
  ravellingData.forEach((inst, i) => {
    e.set(0, inst.yaw, 0);
    q.setFromEuler(e);
    p.set(inst.x, inst.y, inst.z);
    s.set(inst.scaleX, inst.scaleY, inst.scaleZ);
    mat.compose(p, q, s);
    ravellingMesh.setMatrixAt(i, mat);
  });
  ravellingMesh.count = ravellingData.length;
  ravellingMesh.instanceMatrix.needsUpdate = true;
  ravellingMesh.computeBoundingSphere();
  ravellingMesh.castShadow = false;
  ravellingMesh.receiveShadow = true;
  ravellingMesh.userData.presentationOnly = true;
  ravellingMesh.userData.blocksShots = false;
  group.add(ravellingMesh);

  parent.add(group);

  const gravelTris = gravelData.length * 8;
  const chunkTris = chunkData.length * 10;
  const ravellingTris = ravellingData.length * 10;
  const totalTriangles = gravelTris + chunkTris + ravellingTris;

  const stats: Nuketown2RoadEdgeStats = {
    gravelInstances: gravelData.length,
    chunkInstances: chunkData.length,
    ravellingInstances: ravellingData.length,
    totalInstances: gravelData.length + chunkData.length + ravellingData.length,
    gravelTriangles: gravelTris,
    chunkTriangles: chunkTris,
    ravellingTriangles: ravellingTris,
    totalTriangles,
    drawCalls: 3,
  };

  return { group, stats };
}
