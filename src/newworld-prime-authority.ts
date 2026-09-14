import * as THREE from 'three';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { classifyImpactSurface, type ImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';
import type { Team } from './protocol';
import {
  NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES,
  NEWWORLD_PRIME_PRIVACY_FENCE_RUNS,
  NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES,
  NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT,
  NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES,
  NEWWORLD_PRIME_SEMI_CAB_LENGTH_METRES,
  NEWWORLD_PRIME_SEMI_TRAILER_HEIGHT_METRES,
  NEWWORLD_PRIME_SEMI_TRAILER_LENGTH_METRES,
  NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT,
  NEWWORLD_PRIME_SEMI_WIDTH_METRES,
  NEWWORLD_PRIME_SHED_DEPTH_METRES,
  NEWWORLD_PRIME_SHED_PLACEMENTS,
  NEWWORLD_PRIME_SHED_WIDTH_METRES,
} from './newworld-prime-props';
import {
  NEWWORLD_PRIME_BED_IN_MM,
  NEWWORLD_PRIME_EAST_YELLOW_D_M,
  NEWWORLD_PRIME_EAST_YELLOW_W_M,
  NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M,
  NEWWORLD_PRIME_ROOF_RISE_M,
  NEWWORLD_PRIME_STOREY_HEIGHT_M,
  NEWWORLD_PRIME_WEST_TEAL_D_M,
  NEWWORLD_PRIME_WEST_TEAL_W_M,
} from './newworld-prime-structures';

/**
 * newworld-prime Day-2 gameplay authority (movement + shot).
 *
 * Presentation lives in newworld-prime-arena.ts (deliberately authority-free);
 * this module is the ONLY place that emits colliders, ballistic surfaces,
 * physical cover and live spawns for the arena, following the src/map.ts
 * `box()` emit conventions: one bounds object shared by colliders,
 * physicsColliders and the ballistic surface, plus an invisible proxy mesh
 * carrying impactSurface/ballisticSurfaceId userData for the raycast path.
 * Every proxy is presentation-silent (visible=false, no shadow flags).
 *
 * Solid (movement + shot authority, both profiles):
 * - LAYOUT_CONTRACT fact 2: west teal + east yellow street houses
 * - LAYOUT_CONTRACT fact 4: school bus + semi cab + semi trailer (center pair)
 * - LAYOUT_CONTRACT fact 5: 2 field sheds (northwest + southeast)
 * - LAYOUT_CONTRACT fact 6: 3 lot-division privacy fence runs
 *
 * Deliberately non-solid (dressing / flat / reserved — no authority):
 * - LAYOUT_CONTRACT fact 7: concrete pads (150 mm slabs, walkable),
 *   street lamps (pole dressing), hedge rows (shrub dressing)
 * - LAYOUT_CONTRACT fact 9: welcome sign + rusty car (showcase dressing),
 *   jeep + sandbag reservations (footprints kept clear, built later)
 */

// House ground-centre origins, restated (not imported) so this authority
// module never cycles back into newworld-prime-arena.ts, which the
// orchestrator wires this bundle into. Values equal
// NEWWORLD_PRIME_WEST_TEAL_ORIGIN (-13.5, 1.5) and
// NEWWORLD_PRIME_EAST_YELLOW_ORIGIN (13.5, -1.5).
const WEST_TEAL_ORIGIN = Object.freeze({ x: -13.5, z: 1.5 });
const EAST_YELLOW_ORIGIN = Object.freeze({ x: 13.5, z: -1.5 });

// Two full storeys (STOREY_HEIGHT_M 2.7 x2, upper sill owned) over a 0.45 m
// foundation stem wall, capped by the 1.6 m gable rise.
const HOUSE_MAX_Y_M =
  NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M + 2 * NEWWORLD_PRIME_STOREY_HEIGHT_M + NEWWORLD_PRIME_ROOF_RISE_M;
const HOUSE_MIN_Y_M = -(NEWWORLD_PRIME_BED_IN_MM / 1000);

// Bus glass band tops out at the 3.28 m roof slab + 0.12 m half-thickness.
const BUS_MAX_Y_M = 3.4;
// Semi fairing crown (3.7 m cab box + 0.5 m fairing centred at 3.7 m).
const SEMI_CAB_MAX_Y_M = 3.95;
const SEMI_TRAILER_MAX_Y_M = 2.05 + NEWWORLD_PRIME_SEMI_TRAILER_HEIGHT_METRES / 2;
// Shed wall head (2.5 m) plus the shallow gable slabs seated at 2.72 m.
const SHED_MAX_Y_M = 2.9;
// Fence posts stand 2.0 m; panels run 1.8 m.
const FENCE_MAX_Y_M = 2.0;

export type NewworldPrimeAuthority = {
  colliders: Box2[];
  physicsColliders: Box2[];
  shotSurfaces: BallisticSurface[];
  physicalCover: ArenaMap['physicalCover'];
  spawns: Record<Team, THREE.Vector3[]>;
  proxyMeshes: THREE.Object3D[];
};

type SolidSpec = Readonly<{
  id: string;
  /** Authority box centre in arena space. */
  x: number;
  z: number;
  /** World-axis full extents (already yaw-expanded where rotated). */
  sizeX: number;
  sizeZ: number;
  minY: number;
  maxY: number;
  yaw?: number;
  ballisticMaterial: BallisticMaterialId;
}>;

/** World-axis extents of a yawed w(x) by d(z) footprint. */
function yawedExtents(w: number, d: number, yaw: number): readonly [number, number] {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return [w * c + d * s, w * s + d * c] as const;
}

/** Local (lx, lz) offset rotated to arena space for a placement yaw. */
function yawedOffset(lx: number, lz: number, yaw: number): readonly [number, number] {
  return [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)] as const;
}

function solidSpecs(): SolidSpec[] {
  const specs: SolidSpec[] = [
    // Fact 2: street houses — full structural footprints, both profiles.
    {
      id: 'newworld-prime-house-west-teal',
      x: WEST_TEAL_ORIGIN.x, z: WEST_TEAL_ORIGIN.z,
      sizeX: NEWWORLD_PRIME_WEST_TEAL_W_M, sizeZ: NEWWORLD_PRIME_WEST_TEAL_D_M,
      minY: HOUSE_MIN_Y_M, maxY: HOUSE_MAX_Y_M,
      ballisticMaterial: 'interior-wall',
    },
    {
      id: 'newworld-prime-house-east-yellow',
      x: EAST_YELLOW_ORIGIN.x, z: EAST_YELLOW_ORIGIN.z,
      sizeX: NEWWORLD_PRIME_EAST_YELLOW_W_M, sizeZ: NEWWORLD_PRIME_EAST_YELLOW_D_M,
      minY: HOUSE_MIN_Y_M, maxY: HOUSE_MAX_Y_M,
      ballisticMaterial: 'interior-wall',
    },
  ];

  // Fact 4: school bus — 11.2 m hull yawed ~90 deg, long axis along world x.
  {
    const p = NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT;
    const [sizeX, sizeZ] = yawedExtents(
      NEWWORLD_PRIME_SCHOOL_BUS_WIDTH_METRES,
      NEWWORLD_PRIME_SCHOOL_BUS_LENGTH_METRES,
      p.rotationY,
    );
    specs.push({
      id: 'newworld-prime-school-bus-center',
      x: p.x, z: p.z, sizeX, sizeZ,
      minY: 0, maxY: BUS_MAX_Y_M,
      yaw: p.rotationY,
      ballisticMaterial: 'vehicle',
    });
  }

  // Fact 4: semi cab + trailer as separate authority boxes (staggered pair,
  // nose north). Local offsets from SEMI_TRUCK_PARTS: cab (0, 2.0, -5.9),
  // trailer (0, 2.05, 1.4).
  {
    const p = NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT;
    const [cabX, cabZ] = yawedOffset(0, -5.9, p.rotationY);
    const [trailerX, trailerZ] = yawedOffset(0, 1.4, p.rotationY);
    const [cabSizeX, cabSizeZ] = yawedExtents(
      NEWWORLD_PRIME_SEMI_WIDTH_METRES, NEWWORLD_PRIME_SEMI_CAB_LENGTH_METRES, p.rotationY,
    );
    const [trailerSizeX, trailerSizeZ] = yawedExtents(
      NEWWORLD_PRIME_SEMI_WIDTH_METRES, NEWWORLD_PRIME_SEMI_TRAILER_LENGTH_METRES, p.rotationY,
    );
    specs.push({
      id: 'newworld-prime-semi-cab-center',
      x: p.x + cabX, z: p.z + cabZ, sizeX: cabSizeX, sizeZ: cabSizeZ,
      minY: 0, maxY: SEMI_CAB_MAX_Y_M,
      yaw: p.rotationY,
      ballisticMaterial: 'vehicle',
    });
    specs.push({
      id: 'newworld-prime-semi-trailer-center',
      x: p.x + trailerX, z: p.z + trailerZ, sizeX: trailerSizeX, sizeZ: trailerSizeZ,
      minY: 0, maxY: SEMI_TRAILER_MAX_Y_M,
      yaw: p.rotationY,
      ballisticMaterial: 'container',
    });
  }

  // Fact 5: field sheds — 3.6 m x 4.2 m timber boxes at both placements.
  for (const p of NEWWORLD_PRIME_SHED_PLACEMENTS) {
    const [sizeX, sizeZ] = yawedExtents(
      NEWWORLD_PRIME_SHED_WIDTH_METRES, NEWWORLD_PRIME_SHED_DEPTH_METRES, p.rotationY,
    );
    specs.push({
      id: p.id,
      x: p.x, z: p.z, sizeX, sizeZ,
      minY: 0, maxY: SHED_MAX_Y_M,
      yaw: p.rotationY,
      ballisticMaterial: 'wood',
    });
  }

  // Fact 6: lot-division privacy fence runs. Bays repeat along local +x from
  // the placement origin, so the authority box centres on the run midpoint.
  for (const run of NEWWORLD_PRIME_PRIVACY_FENCE_RUNS) {
    const length = run.bays * NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES;
    const [midX, midZ] = yawedOffset(length / 2, 0, run.rotationY);
    const [sizeX, sizeZ] = yawedExtents(length, 0.3, run.rotationY);
    specs.push({
      id: run.id,
      x: run.x + midX, z: run.z + midZ, sizeX, sizeZ,
      minY: 0, maxY: FENCE_MAX_Y_M,
      yaw: run.rotationY,
      ballisticMaterial: 'fence',
    });
  }

  return specs;
}

// Live spawns: 2 teams x 3. Teal (0) holds the west backs, yellow (1) the
// east backs — symmetric about the centre loop, each point on walkable y=0
// ground (eye height 1.7 per SPAWN_LAYOUT convention), ≥6 m clear of every
// solid above (west fence line x=-26, sheds, houses) and of the fact-9
// jeep (13.5,-21) / sandbag (0,8.5) reservations. In-team spacing is 8 m+
// (FFA_MINIMUM_SPAWN_SEPARATION 8); cross-team separation is 60 m+
// (atomic-acres MAP_TRAP_RADIUS 9 pattern — no trap exposure at these ranges).
const TEAL_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [-32, -8], [-33, 0], [-32, 8],
];
const YELLOW_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [32, -8], [33, 0], [32, 8],
];

/**
 * Day-2 gameplay authority for New World Prime. Emits invisible proxy meshes
 * into `scene` (raycast path) and returns movement + shot authority plus live
 * spawns. Deterministic: no Math.random anywhere on this path.
 */
export function newworldPrimeAuthority(scene: THREE.Scene): NewworldPrimeAuthority {
  const colliders: Box2[] = [];
  const physicsColliders: Box2[] = [];
  const shotSurfaces: BallisticSurface[] = [];
  const physicalCover: ArenaMap['physicalCover'] = [];
  const proxyMeshes: THREE.Object3D[] = [];
  const proxyMaterial = new THREE.MeshBasicMaterial();
  let sequence = 0;

  for (const spec of solidSpecs()) {
    const cy = (spec.minY + spec.maxY) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spec.sizeX, spec.maxY - spec.minY, spec.sizeZ),
      proxyMaterial,
    );
    mesh.name = spec.id;
    mesh.position.set(spec.x, cy, spec.z);
    if (spec.yaw !== undefined) mesh.rotation.y = spec.yaw;
    // Authority-only: never renders, never shadows, never presents.
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.collisionProxy = true;
    mesh.userData.authoredCollisionAuthority = true;
    mesh.userData.impactSurface = classifyImpactSurface({ name: spec.id });
    scene.add(mesh);
    proxyMeshes.push(mesh);

    const bounds: Box2 = {
      minX: spec.x - spec.sizeX / 2,
      maxX: spec.x + spec.sizeX / 2,
      minZ: spec.z - spec.sizeZ / 2,
      maxZ: spec.z + spec.sizeZ / 2,
      minY: spec.minY,
      maxY: spec.maxY,
      ...(spec.yaw !== undefined ? { rotation: [0, spec.yaw, 0] as [number, number, number] } : {}),
    };
    const surface = createBallisticSurface(
      `newworld-prime:${sequence}:${spec.id}`,
      spec.id,
      bounds,
      {
        impactSurface: mesh.userData.impactSurface as ImpactSurface,
        material: spec.ballisticMaterial,
      },
    );
    sequence += 1;
    shotSurfaces.push(surface);
    mesh.userData.ballisticSurfaceId = surface.id;
    mesh.userData.ballisticMaterial = surface.material;

    // Movement authority in BOTH profiles: planar + physics share the box.
    colliders.push(bounds);
    physicsColliders.push(bounds);
    physicalCover.push({ id: spec.id, bounds, blocksMovement: true, blocksShots: true });
  }

  const spawns: Record<Team, THREE.Vector3[]> = {
    0: TEAL_SPAWNS.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
    1: YELLOW_SPAWNS.map(([x, z]) => new THREE.Vector3(x, 1.7, z)),
  };

  return { colliders, physicsColliders, shotSurfaces, physicalCover, spawns, proxyMeshes };
}
