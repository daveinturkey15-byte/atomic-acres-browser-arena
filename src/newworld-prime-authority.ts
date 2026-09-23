import * as THREE from 'three';
import { createBallisticSurface, type BallisticMaterialId, type BallisticSurface } from './ballistics';
import { classifyImpactSurface, type ImpactSurface } from './combat-feedback';
import type { Box2 } from './collision';
import type { ArenaMap } from './map';
import type { Team } from './protocol';
import {
  NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES,
  NEWWORLD_PRIME_PRIVACY_FENCE_RUNS,
  NEWWORLD_PRIME_RUSTY_CAR_LENGTH_METRES,
  NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT,
  NEWWORLD_PRIME_RUSTY_CAR_WIDTH_METRES,
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
  NEWWORLD_PRIME_SIGN_BOARD_HEIGHT_METRES,
  NEWWORLD_PRIME_SIGN_BOARD_WIDTH_METRES,
  NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT,
} from './newworld-prime-props';
import {
  NEWWORLD_PRIME_EAST_YELLOW_D_M,
  NEWWORLD_PRIME_EAST_YELLOW_W_M,
  NEWWORLD_PRIME_ROOF_OVERHANG_M,
  NEWWORLD_PRIME_ROOF_RISE_M,
  NEWWORLD_PRIME_ROOF_SLAB_THICKNESS_MM,
  NEWWORLD_PRIME_STOREY_HEIGHT_M,
  NEWWORLD_PRIME_WEST_TEAL_D_M,
  NEWWORLD_PRIME_WEST_TEAL_W_M,
} from './newworld-prime-structures';
import { NEWWORLD_PRIME_SCALE_READ_FENCE_CLOSURES } from './newworld-prime-scale-read';
import { newworldPrimeHouseShellSolids, newworldPrimeInteriorWallSolids } from './newworld-prime-interiors';

// House ground-centre origins, restated (not imported) so this module never
// cycles back into newworld-prime-arena.ts. Values equal
// NEWWORLD_PRIME_WEST_TEAL_ORIGIN (-13.5, 1.5) and
// NEWWORLD_PRIME_EAST_YELLOW_ORIGIN (13.5, -1.5); both rotation 0.
const WEST_TEAL_ORIGIN = Object.freeze({ x: -13.5, z: 1.5 });
const EAST_YELLOW_ORIGIN = Object.freeze({ x: 13.5, z: -1.5 });

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
 * - INTERIORS PILOT: ground-floor partitions inside both houses (6 walls each,
 *   data-owned by newworld-prime-interiors) plus the carved shell boxes above:
 *   full-height perimeter walls with a 1.0 m front-door portal per house and a
 *   shot-only door-leaf box across each portal (bullets stop, players pass).
 *
 * Deliberately non-solid (dressing / flat / reserved — no authority):
 * - LAYOUT_CONTRACT fact 7: concrete pads (150 mm slabs, walkable),
 *   street lamps (pole dressing), hedge rows (shrub dressing)
 * - LAYOUT_CONTRACT fact 9: welcome sign + rusty car (showcase dressing),
 *   jeep + sandbag reservations (footprints kept clear, built later)
 */

// Two full storeys (STOREY_HEIGHT_M 2.7 x2, upper sill owned) over a 0.45 m
// foundation stem wall, capped by the 1.6 m gable rise. (Shell-carve heights
// are derived identically in newworld-prime-interiors; these consts serve the
// non-house solids below.)

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
  /** False for shot-only boxes (door leaves): no movement, no cover. */
  movement?: boolean;
  ballisticMaterial: BallisticMaterialId;
}>;

/** World-axis extents of a yawed w(x) by d(z) footprint: the AABB every
 *  authority consumer reads (authority boxes are deliberately rotation-free). */
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
    // Fact 2: street houses — full-height perimeter walls with a carved
    // front-door portal (porch-to-living, 1.0 m at local x=0), plus a
    // shot-only door-leaf box across each portal. Data-owned by
    // newworld-prime-interiors; side/rear walls stay solid.
    ...newworldPrimeHouseShellSolids().map((shell) => ({
      id: shell.id,
      x: shell.x, z: shell.z, sizeX: shell.sizeX, sizeZ: shell.sizeZ,
      minY: shell.minY, maxY: shell.maxY,
      ...(shell.movement ? {} : { movement: false as const }),
      ballisticMaterial: 'interior-wall' as const,
    })),
  ];

  // Fact 4: school bus — 11.2 m hull yawed ~90 deg, long axis along world x.
  // Authority bounds are WORLD-AABB and rotation-free: every consumer (Rapier,
  // the lightweight collision queries, ballistics.surfaceInterval, and the
  // parity audit's collider explanation) reads min/max as-is, so a yaw field
  // on a pre-expanded box double-rotates (the Day-4 bug that parked a
  // perpendicular phantom slab over every fence line), while local dims +
  // rotation leave the audit's collider explanation blind to rotated boxes.
  // Axis-aligned world AABBs are the one shape every consumer agrees on.
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
      ballisticMaterial: 'vehicle',
    });
    specs.push({
      id: 'newworld-prime-semi-trailer-center',
      x: p.x + trailerX, z: p.z + trailerZ, sizeX: trailerSizeX, sizeZ: trailerSizeZ,
      minY: 0, maxY: SEMI_TRAILER_MAX_Y_M,
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
      ballisticMaterial: 'wood',
    });
  }

  // Fact 6: lot-division privacy fence runs, plus the Day-4 scale-read lot
  // closures. One authority box per bay, centred on the bay origin exactly
  // like the visual panel (the panel spans +/-1.2 m about the bay origin; the
  // closing post stands on the +1.2 m boundary inside the same box). A
  // run-level box fails the parity audit: 14.4 m of collider explained by
  // 2.4 m of mesh each (coverage 0.17). Quarter-turn runs are axis-aligned
  // after yawing, so the world AABB IS the fence line (0.12 m deep: the
  // 0.06 m panel plus the closing post; 0.3 m drops planar coverage to 0.2
  // under the 0.35 explanation bar, 0.12 m holds 0.5+).
  for (const run of [...NEWWORLD_PRIME_PRIVACY_FENCE_RUNS, ...NEWWORLD_PRIME_SCALE_READ_FENCE_CLOSURES]) {
    for (let bay = 0; bay < run.bays; bay += 1) {
      const [cx, cz] = yawedOffset(bay * NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES, 0, run.rotationY);
      const [sizeX, sizeZ] = yawedExtents(NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES, 0.12, run.rotationY);
      specs.push({
        id: `${run.id}-bay-${bay}`,
        x: run.x + cx, z: run.z + cz, sizeX, sizeZ,
        minY: 0, maxY: FENCE_MAX_Y_M,
        ballisticMaterial: 'fence',
      });
    }
  }

  // Fact 8 (east): the yellow-house stone chimney is a real 0.8 m obstruction
  // against the east wall. Solid in both profiles so the stack stops movement
  // and shots; the parity audit flagged it walk-through without this box.
  specs.push({
    id: 'newworld-prime-east-yellow-chimney-stack',
    x: 17.55, z: -1.5, sizeX: 0.8, sizeZ: 0.8,
    minY: 0, maxY: 5.45,
    ballisticMaterial: 'brick',
  });

  // Fact 2 details + fact 9: dressing that carries mass — driveway sedan,
  // rusty-car showcase, welcome-sign board. Their parts live in
  // newworld-prime-props; until these boxes existed the vehicles' whole top
  // faces were fall-through (the walkable gate's sedan/rusty-car rows) and
  // the sign board was an unrated ghost shot surface. Bodies start at their
  // wheel-line so the boxes read as the car mass; cabins stack on the body.
  specs.push({
    id: 'newworld-prime-sedan-body',
    x: -13.5, z: 7.0, sizeX: 1.8, sizeZ: 4.4,
    minY: 0, maxY: 0.825,
    ballisticMaterial: 'vehicle',
  });
  specs.push({
    id: 'newworld-prime-sedan-cabin',
    x: -13.5, z: 6.8, sizeX: 1.6, sizeZ: 2.2,
    minY: 0.825, maxY: 1.35,
    ballisticMaterial: 'vehicle',
  });
  {
    const p = NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT;
    const [cabX, cabZ] = yawedOffset(0, 0.2, p.rotationY);
    const [bodySizeX, bodySizeZ] = yawedExtents(NEWWORLD_PRIME_RUSTY_CAR_WIDTH_METRES, NEWWORLD_PRIME_RUSTY_CAR_LENGTH_METRES, p.rotationY);
    const [cabSizeX, cabSizeZ] = yawedExtents(1.6, 2.2, p.rotationY);
    specs.push({
      id: 'newworld-prime-rusty-car-body',
      x: p.x, z: p.z, sizeX: bodySizeX, sizeZ: bodySizeZ,
      minY: 0, maxY: 1.075,
      ballisticMaterial: 'vehicle',
    });
    specs.push({
      id: 'newworld-prime-rusty-car-cabin',
      x: p.x + cabX, z: p.z + cabZ, sizeX: cabSizeX, sizeZ: cabSizeZ,
      minY: 1.075, maxY: 1.575,
      ballisticMaterial: 'vehicle',
    });
  }
  {
    const p = NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT;
    const [sizeX, sizeZ] = yawedExtents(NEWWORLD_PRIME_SIGN_BOARD_WIDTH_METRES, 0.12, p.rotationY);
    specs.push({
      id: 'newworld-prime-welcome-sign-board',
      x: p.x, z: p.z, sizeX, sizeZ,
      minY: 1.9, maxY: 1.9 + NEWWORLD_PRIME_SIGN_BOARD_HEIGHT_METRES,
      ballisticMaterial: 'wood',
    });
  }

  // Day-4 gable roofs: one slab box per slope, footprint-matched to the
  // emitted slab AABBs (shingleRoofParts). The box base sits on the wall head
  // (not the slab underside) so the collider's rise is measured with slack
  // against the float32 mesh bounds - a 0.12 m slab collinear with the mesh
  // top fails the audit's rise check by float epsilon. Standby has no route
  // above the second storey, but the walkable census reads each slab's flat
  // top face and the ballistic census reads its 0.12 m sheet - both need
  // authority beneath them. Unreachable masses: the boxes change no route,
  // they only give the roofs real cover and real support.
  for (const house of [
    { id: 'newworld-west-teal', origin: WEST_TEAL_ORIGIN, w: NEWWORLD_PRIME_WEST_TEAL_W_M, d: NEWWORLD_PRIME_WEST_TEAL_D_M },
    { id: 'newworld-east-yellow', origin: EAST_YELLOW_ORIGIN, w: NEWWORLD_PRIME_EAST_YELLOW_W_M, d: NEWWORLD_PRIME_EAST_YELLOW_D_M },
  ] as const) {
    const slabT = NEWWORLD_PRIME_ROOF_SLAB_THICKNESS_MM / 1000;
    const wallTop = NEWWORLD_PRIME_STOREY_HEIGHT_M * 2;
    const slopeLen = Math.sqrt((house.d / 2 + NEWWORLD_PRIME_ROOF_OVERHANG_M) ** 2 + NEWWORLD_PRIME_ROOF_RISE_M ** 2);
    const midY = wallTop + NEWWORLD_PRIME_ROOF_RISE_M / 2;
    const zOff = house.d / 4 + NEWWORLD_PRIME_ROOF_OVERHANG_M / 2;
    for (const [side, zc] of [['south', zOff], ['north', -zOff]] as const) {
      specs.push({
        id: `newworld-prime-${house.id}-roof-${side}`,
        x: house.origin.x, z: house.origin.z + zc,
        sizeX: house.w + NEWWORLD_PRIME_ROOF_OVERHANG_M * 2, sizeZ: slopeLen,
        minY: wallTop, maxY: midY + slabT / 2,
        ballisticMaterial: 'wood',
      });
    }
  }

  // Day-4 ground-storey south lap-siding skins: the shell walls behind them
  // are registered but carved (door portal + window reveals), so the census's
  // single-surface footprint rule tops out near the 0.25 bar against the
  // biggest segment. Shot-only skins exactly on the panel bounds (the
  // door-leaf precedent: shots stop at the skin, movement stays with the
  // shell) rate the panels for real.
  specs.push({
    id: 'newworld-prime-newworld-west-teal-siding-south-skin',
    x: WEST_TEAL_ORIGIN.x, z: WEST_TEAL_ORIGIN.z + NEWWORLD_PRIME_WEST_TEAL_D_M / 2 + 0.008,
    sizeX: NEWWORLD_PRIME_WEST_TEAL_W_M, sizeZ: 0.14,
    minY: 0, maxY: NEWWORLD_PRIME_STOREY_HEIGHT_M,
    movement: false,
    ballisticMaterial: 'interior-wall',
  });
  specs.push({
    id: 'newworld-prime-newworld-east-yellow-siding-south-skin',
    x: EAST_YELLOW_ORIGIN.x, z: EAST_YELLOW_ORIGIN.z + NEWWORLD_PRIME_EAST_YELLOW_D_M / 2 + 0.008,
    sizeX: NEWWORLD_PRIME_EAST_YELLOW_W_M, sizeZ: 0.14,
    minY: 0, maxY: NEWWORLD_PRIME_STOREY_HEIGHT_M,
    movement: false,
    ballisticMaterial: 'interior-wall',
  });

  // INTERIORS PILOT: ground-floor partition walls, both houses (data-owned by
  // newworld-prime-interiors, emitted here in this module's pattern: one
  // bounds object shared by colliders, physicsColliders and the ballistic
  // surface plus an invisible proxy mesh).
  for (const wall of newworldPrimeInteriorWallSolids()) {
    specs.push({
      id: wall.id,
      x: wall.x, z: wall.z, sizeX: wall.sizeX, sizeZ: wall.sizeZ,
      minY: wall.minY, maxY: wall.maxY,
      ballisticMaterial: 'interior-wall',
    });
  }

  return specs;
}

// Live spawns: 2 teams x 6. Teal (0) holds the west backs along the west
// fence corridor plus house/shed cover; yellow (1) the east backs along the
// east fence corridor plus house cover — each point on walkable y=0 ground
// (eye height 1.7 per SPAWN_LAYOUT convention), within 6 m of hard cover,
// pairwise 3 m+ apart (grenade rule), team span 25 m of the 92 m z-axis
// (spread rule), and clear of the fact-9 jeep (13.5,-21) / sandbag (0,8.5)
// reservations. Cross-team pairs keep 40 m+ with the centre solids (bus,
// semi, houses) breaking eye-height lines; the sight gate is the arbiter.
// (-27.6, 10) is (-27, 10) nudged 0.6 m west: the lot-west outer-north fence
// line (x -26.06, 2.0 m tall) measured 0.94 m off the old point - inside the
// 1.2 m wall-in-the-face bar once the fence carried real authority.
// (-23.5, -15.2) is (-22.5, -16) moved off the lot-west-south closure: its
// bay at x -22.4..-20.0, z -16.26..-16.14 stood 0.17 m from the old point
// (inside the 0.44 m spawn capsule - not standable) and 1.53 m of face.
// (-23.5, -14.3) then clears the same 2.0 m fence LINE (z -16.26, running the
// lot's whole south edge) by 1.84 m - the 1.53 m placement above still sat
// inside the wall-in-the-face bar measured north-south off the run.
const TEAL_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [-31, -8], [-30, -1], [-29, 5], [-27.6, 10], [-23.5, -14.3], [-21, -3],
];
const YELLOW_SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [31, -8], [30, -14], [29, -20], [27, -25], [21, -6], [21, 0],
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
    // Shot-only boxes (door leaves) skip movement and cover: bullets stop at
    // the closed-leaf read, players walk the portal.
    if (spec.movement === false) continue;
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
