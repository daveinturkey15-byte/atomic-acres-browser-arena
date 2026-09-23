import * as THREE from 'three';
import type { ArenaMap } from './map';
import type { Box2 } from './collision';
import { DeterministicRng } from './deterministic-rng';
import {
  NEWWORLD_PRIME_PRACTICAL_ROLE_IDS,
  NEWWORLD_PRIME_TSL_PIPELINE_ROLES,
  newworldPrimeLightingFor,
  type NewworldPrimeLightingVariant,
} from './newworld-prime-lighting';
import {
  NEWWORLD_PRIME_EAST_YELLOW_PART_BUDGET,
  NEWWORLD_PRIME_WEST_TEAL_PART_BUDGET,
  eastYellowHousePARTS,
  newworldPrimeStructuresPARTS,
  westTealHousePARTS,
  type NewworldPrimeStructureOrigin,
  type NewworldPrimeStructurePart,
} from './newworld-prime-structures';
import {
  NEWWORLD_PRIME_CONCRETE_PAD_PARTS,
  NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS,
  NEWWORLD_PRIME_HEDGE_RUNS,
  NEWWORLD_PRIME_JEEP_RESERVATION,
  NEWWORLD_PRIME_PRIVACY_FENCE_RUNS,
  NEWWORLD_PRIME_RUSTY_CAR_PARTS,
  NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT,
  NEWWORLD_PRIME_SANDBAG_RESERVATION,
  NEWWORLD_PRIME_SCHOOL_BUS_PARTS,
  NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT,
  NEWWORLD_PRIME_SEMI_TRUCK_PARTS,
  NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT,
  NEWWORLD_PRIME_SHED_PARTS,
  NEWWORLD_PRIME_SHED_PLACEMENTS,
  NEWWORLD_PRIME_STREET_LAMP_PARTS,
  NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS,
  NEWWORLD_PRIME_WELCOME_SIGN_PARTS,
  NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT,
  newworldPrimeHedgeRowParts,
  newworldPrimePrivacyFenceRunParts,
  newworldPrimePropTriangleTotal,
  validateNewworldPrimePropBudgets,
  type NewworldPrimePropPart,
  type NewworldPrimePropPlacement,
} from './newworld-prime-props';
import {
  NEWWORLD_PRIME_SCALE_READ_DEFAULT,
  NEWWORLD_PRIME_SCALE_READ_DOORWAYS,
  NEWWORLD_PRIME_SCALE_READ_EDGING,
  NEWWORLD_PRIME_SCALE_READ_FENCE_CLOSURES,
  NEWWORLD_PRIME_SCALE_READ_GROUND_RING,
  NEWWORLD_PRIME_SCALE_READ_WINDOW_GLOW,
  newworldPrimeScaleReadGlowIntensity,
  type NewworldPrimeScaleReadBox,
  type NewworldPrimeScaleReadFlags,
} from './newworld-prime-scale-read';
import { newworldPrimeInteriorParts } from './newworld-prime-interiors';
import { newworldPrimeAuthority } from './newworld-prime-authority';

/**
 * newworld-prime Day-1 layout blockout assembler (presentation-only).
 *
 * Layout authority: `atomic-acres-catalog/LAYOUT_CONTRACT.md` facts 1-10
 * (read in place — never copied into the repo):
 *  1. high-desert surround (lawns ONLY inside the two fenced lots)
 *  2. west TEAL + east YELLOW two-storey houses, gray shingle roofs, porches
 *  3. central horseshoe/loop asphalt road (arena spine, enters north/exits south)
 *  4. center-loop cover: yellow school bus + red-cab semi/white trailer, nose-to-nose
 *  5. north entrance: rusty car + wooden welcome sign
 *  6. south exit: jeep + sandbag emplacement (reservations only this wave)
 *  7. four concrete pads in the front yards (+shed/entrance pads per props data)
 *  8. back yards: sheds, clotheslines + laundry, hedges, deck furniture
 *  9. wooden privacy fences, street lamps, low road-edge hedges
 * 10. teal-vs-yellow team identity, everything else neutral
 *
 * Visual bar (251-plate catalog, batch-2-layout):
 *  - batch-2-layout/map__layout-topdown.png (authoritative plan view)
 *  - batch-2-layout/map__layout-angle.png (authoritative aerial read)
 *  - batch-2-layout/map__center-loop.png (center-loop cover staging)
 *
 * Rules: presentation geometry NEVER derives collision/authority (colliders,
 * shot surfaces, spawns/nav stay empty or standby until Shell wires them);
 * TSL-registry materials only (local standard-material stand-ins keyed by
 * sibling material ids — Shell swaps in the real TSL inventory); deterministic
 * seeded PRNG throughout, never Math.random; no ShaderMaterial/GLSL; original
 * art only. Sibling PARTS are imported by name, never duplicated. Every
 * sibling array passes through `orEmpty`, so a not-yet-landed (or regressed)
 * sibling degrades to local reservation massing instead of breaking the load.
 */

// ---------------------------------------------------------------------------
// Arena identity + arena-local axes (+z = north/entry side, per sibling
// placements: welcome sign at z=+34.5, jeep reservation at z=-21).
// ---------------------------------------------------------------------------

/** Deterministic seed for every blockout-local scatter value. Never Math.random. */
export const NEWWORLD_PRIME_BLOCKOUT_SEED = 0x5052494d;

/** Arena route/display contract owned by Shell (selectable false Day-1). */
export const NEWWORLD_PRIME_ARENA_ID = 'newworld-prime';
export const NEWWORLD_PRIME_ARENA_ROUTE = 'new-world-prime';
export const NEWWORLD_PRIME_ARENA_DISPLAY_NAME = 'New World Prime';

/** Playable bounds in metres (authority-owned; Shell may re-freeze). */
export const NEWWORLD_PRIME_ARENA_BOUNDS: Readonly<Box2> = Object.freeze({
  minX: -40, maxX: 40, minZ: -46, maxZ: 46,
});

/** Catalog plates grounding this blockout (paths only — images stay out). */
export const NEWWORLD_PRIME_BLOCKOUT_PLATES = Object.freeze([
  'batch-2-layout/map__layout-topdown.png',
  'batch-2-layout/map__layout-angle.png',
  'batch-2-layout/map__center-loop.png',
] as const);

// Own 60k-class budget lane (world-studio 59,472/60,000 lane never touched).
/** Hard mesh-count fence for the assembled blockout. */
export const NEWWORLD_PRIME_ASSEMBLY_MESH_FENCE = 1024;
/** Hard triangle-estimate fence for the assembled blockout. */
export const NEWWORLD_PRIME_ASSEMBLY_TRIANGLE_FENCE = 60_000;

// House origins in arena space (structures module applies them; the parts
// this assembler receives are already world-space — never re-apply).
/** West teal house ground-centre origin, metres. */
export const NEWWORLD_PRIME_WEST_TEAL_ORIGIN: Readonly<NewworldPrimeStructureOrigin> = Object.freeze({
  xMetres: -13.5, zMetres: 1.5, rotationYDeg: 0,
});
/** East yellow house ground-centre origin, metres. */
export const NEWWORLD_PRIME_EAST_YELLOW_ORIGIN: Readonly<NewworldPrimeStructureOrigin> = Object.freeze({
  xMetres: 13.5, zMetres: -1.5, rotationYDeg: 0,
});

// Horseshoe loop spine dimensions, metres (contract fact 3).
/** Asphalt running width. */
export const NEWWORLD_PRIME_LOOP_WIDTH_M = 4;
/** Loop arm centrelines (east/west straights). */
export const NEWWORLD_PRIME_LOOP_ARM_X_M = 7.5;
/** Loop cross-street centrelines (north/south straights). */
export const NEWWORLD_PRIME_LOOP_CROSS_Z_M = 13;

// Desert scatter caps, counts only (positions are seeded at build).
/** Scrub clump instances. */
export const NEWWORLD_PRIME_SCRUB_COUNT = 44;
/** Rock instances. */
export const NEWWORLD_PRIME_ROCK_COUNT = 14;

// ---------------------------------------------------------------------------
// Blockout PARTS descriptor (offsets/sizes/role) for the Shell inventory.
// ---------------------------------------------------------------------------

/** One placed blockout part: world offset, full extents, presentation role. */
export type NewworldPrimeBlockoutPart = Readonly<{
  id: string;
  role: string;
  /** World-space centre offset in metres [x, y, z]. */
  offset: readonly [number, number, number];
  /** Full extents in metres [w, h, d]. */
  size: readonly [number, number, number];
  /** Which generator authored the source descriptor. */
  source: 'arena-blockout' | 'structures' | 'props';
}>;

type BlockoutContext = {
  root: THREE.Group;
  materials: Map<string, THREE.Material>;
  parts: NewworldPrimeBlockoutPart[];
  meshes: number;
  triangles: number;
};

type LocalEmplacement = {
  offset: readonly [number, number, number];
  size: readonly [number, number, number];
  rotationY?: number;
};

// Stand-in palette keyed by sibling TSL material id. Day-1 blockout only:
// Shell resolves every id through the TSL registry for the real materials.
const STANDIN_COLORS: Readonly<Record<string, number>> = Object.freeze({
  'newworld-prime-sand-v1': 0xc2a06b,
  'newworld-prime-lawn-v1': 0x5d8a4a,
  'newworld-prime-asphalt-v1': 0x3d3d40,
  'newworld-prime-scrub-v1': 0x6f7a4a,
  'newworld-prime-rock-v1': 0x8d8578,
  'newworld-prime-pole-timber-v1': 0x5a4632,
  'newworld-prime-laundry-white-v1': 0xe8e4da,
  'newworld-prime-umbrella-red-v1': 0xb03a2e,
  'newworld-prime-bbq-black-v1': 0x232323,
  'newworld-prime-sedan-silver-v1': 0xb9bec4,
  'newworld-prime-vehicle-glass-v1': 0x9fc4d4,
  'newworld-prime-bus-yellow-v1': 0xd7a021,
  'newworld-prime-cream-v1': 0xe6ddc4,
  'newworld-prime-rubber-v1': 0x1e1e20,
  'newworld-prime-steel-v1': 0x8a8f94,
  'newworld-prime-headlight-v1': 0xf5ead0,
  'newworld-prime-truck-cab-red-v1': 0xa32e22,
  'newworld-prime-trailer-white-v1': 0xdfe0da,
  'newworld-prime-shed-timber-v1': 0x7a6248,
  'newworld-prime-shed-roof-felt-v1': 0x3a3a3c,
  'newworld-prime-shed-floor-v1': 0x6b6b6b,
  'newworld-prime-fence-timber-v1': 0x8a6f4d,
  'newworld-prime-lamp-steel-v1': 0x3c4147,
  'newworld-prime-lamp-lens-v1': 0xf2e6c4,
  'newworld-prime-hedge-leaf-v1': 0x4a7038,
  'newworld-prime-concrete-pad-v1': 0x9d9d98,
  'newworld-prime-planter-concrete-v1': 0x8f8f8a,
  'newworld-prime-sign-timber-v1': 0x6b4f33,
  'newworld-prime-sign-face-v1': 0xd8cfb8,
  'newworld-prime-rusty-car-red-v1': 0x7a3b28,
  'newworld-prime-rust-patch-v1': 0x4e2c1c,
  'newworld-teal-siding': 0x2e8f8a,
  'newworld-yellow-siding': 0xd9a91f,
  'newworld-trim-white': 0xe9e6dc,
  'newworld-glass': 0x9fc4d4,
  'newworld-door-teal': 0x1f6f6a,
  'newworld-door-red': 0x8e2f24,
  'newworld-brick': 0x8a4a3a,
  'newworld-stone': 0x9a958a,
  'newworld-shingle-grey': 0x5d6066,
  'newworld-shingle-brown': 0x6e5741,
  'newworld-wood-porch': 0x7a6248,
  'newworld-concrete': 0x9d9d98,
  'newworld-foundation': 0x7c7c78,
});

const STANDIN_FALLBACK_COLOR = 0xb0a890;

/**
 * Day-3 graphics: per-role MeshStandardMaterial finish (roughness/metalness).
 * Uniform 0.9/0.02 flattened every surface in graphics-before: glass read as
 * paint and dark rubber/doorway insets crushed to void black on shadow sides.
 * Hues (STANDIN_COLORS) untouched; only specular response varies, so no hue
 * or linear-contrast change lands on any dark identity. Roles absent here
 * keep the matte default.
 */
const STANDIN_FINISHES: Readonly<Record<string, Readonly<{ roughness: number; metalness: number }>>> = Object.freeze({
  // Reflection sources: vehicle glass, house glazing, lamp lenses, headlights.
  'newworld-prime-vehicle-glass-v1': Object.freeze({ roughness: 0.22, metalness: 0.12 }),
  'newworld-glass': Object.freeze({ roughness: 0.22, metalness: 0.12 }),
  'newworld-prime-lamp-lens-v1': Object.freeze({ roughness: 0.38, metalness: 0.05 }),
  'newworld-prime-headlight-v1': Object.freeze({ roughness: 0.3, metalness: 0.2 }),
  // Painted metal / steel trim: bus, sedan, lamp posts, poles hardware.
  // Day-4: bus yellow + truck cab red are authored as real polished car paint
  // (0.20/0.62, nuketown2 precedent) — vehicle paint really is polished and
  // metallic, and the ray-traced reflection preset had nothing to reflect on
  // this arena (0 reflective meshes). Sedan silver stays a matte showcase
  // read; lamp steel stays galvanised, not mirror.
  'newworld-prime-steel-v1': Object.freeze({ roughness: 0.45, metalness: 0.6 }),
  'newworld-prime-lamp-steel-v1': Object.freeze({ roughness: 0.5, metalness: 0.55 }),
  'newworld-prime-sedan-silver-v1': Object.freeze({ roughness: 0.42, metalness: 0.5 }),
  'newworld-prime-bus-yellow-v1': Object.freeze({ roughness: 0.2, metalness: 0.62 }),
  'newworld-prime-truck-cab-red-v1': Object.freeze({ roughness: 0.2, metalness: 0.62 }),
  // Dark rubber reads (tires, doorway insets): a touch of specular so the
  // surface edge survives shade instead of flattening to exact black.
  'newworld-prime-rubber-v1': Object.freeze({ roughness: 0.68, metalness: 0.0 }),
});

function standinMaterial(ctx: BlockoutContext, materialId: string): THREE.Material {
  const cached = ctx.materials.get(materialId);
  if (cached) return cached;
  const finish = STANDIN_FINISHES[materialId] ?? { roughness: 0.9, metalness: 0.02 };
  const material = new THREE.MeshStandardMaterial({
    color: STANDIN_COLORS[materialId] ?? STANDIN_FALLBACK_COLOR,
    roughness: finish.roughness,
    metalness: finish.metalness,
  });
  ctx.materials.set(materialId, material);
  return material;
}

/** Graceful fallback: a missing/not-yet-landed sibling reads as "no parts". */
function orEmpty<T>(value: readonly T[] | undefined | null): readonly T[] {
  return value ?? [];
}

function triangleForPrimitive(primitive: string): number {
  switch (primitive) {
    case 'cylinder': return 40;
    case 'plane': return 2;
    case 'icosahedron': return 20;
    default: return 12;
  }
}

function emitBox(
  ctx: BlockoutContext,
  id: string,
  role: string,
  source: NewworldPrimeBlockoutPart['source'],
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  materialId: string,
  geometry: THREE.BufferGeometry,
  rotationY = 0,
  triangles = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, standinMaterial(ctx, materialId));
  mesh.name = id;
  mesh.position.set(offset[0], offset[1], offset[2]);
  if (rotationY !== 0) mesh.rotation.y = rotationY;
  // Presentation-only: no shadow casting authority, never a shot/collision
  // surface, invisible to gameplay raycasts.
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.userData.solid = false;
  mesh.userData.shots = false;
  mesh.raycast = () => undefined;
  ctx.root.add(mesh);
  ctx.parts.push(Object.freeze({ id, role, offset, size, source }));
  ctx.meshes += 1;
  ctx.triangles += triangles;
  return mesh;
}

function emitLocal(
  ctx: BlockoutContext,
  id: string,
  role: string,
  offset: readonly [number, number, number],
  size: readonly [number, number, number],
  materialId: string,
  rotationY = 0,
): THREE.Mesh {
  return emitBox(
    ctx, id, role, 'arena-blockout', offset, size, materialId,
    new THREE.BoxGeometry(size[0], size[1], size[2]), rotationY, 12,
  );
}

/**
 * Local adapter stub for the arena emit facade (mirrors the nuketown2
 * facadePair convention: `{ solid: false, shots: false, cast: false,
 * presentationOnly: true }`). Emits a mirrored twin-pair (west/east twins
 * across the loop spine). Presentation geometry never derives collision.
 */
function pair(
  ctx: BlockoutContext,
  id: string,
  role: string,
  a: LocalEmplacement,
  b: LocalEmplacement,
  materialId: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.solid = false;
  group.userData.shots = false;
  ctx.root.add(group);
  for (const [index, half] of [a, b].entries()) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half.size[0], half.size[1], half.size[2]),
      standinMaterial(ctx, materialId),
    );
    mesh.name = `${id}-${index === 0 ? 'west' : 'east'}`;
    mesh.position.set(half.offset[0], half.offset[1], half.offset[2]);
    if (half.rotationY) mesh.rotation.y = half.rotationY;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.solid = false;
    mesh.userData.shots = false;
    mesh.raycast = () => undefined;
    group.add(mesh);
    ctx.parts.push(Object.freeze({
      id: mesh.name, role, offset: half.offset, size: half.size, source: 'arena-blockout',
    }));
    ctx.meshes += 1;
    ctx.triangles += 12;
  }
  return group;
}

/**
 * Local adapter stub for centred placement: one presentation box centred on
 * (cx, cz) at height y. Same forced presentation flags as pair().
 */
function centred(
  ctx: BlockoutContext,
  id: string,
  role: string,
  cx: number,
  cz: number,
  y: number,
  size: readonly [number, number, number],
  materialId: string,
): THREE.Mesh {
  return emitLocal(ctx, id, role, [cx, y, cz], size, materialId);
}

// THREE yaw: local (x, z) with rotation.y = t maps to world
// (x*cos t + z*sin t, -x*sin t + z*cos t).
function yawOffset(x: number, z: number, yaw: number): readonly [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [x * c + z * s, -x * s + z * c] as const;
}

function emitStructurePart(ctx: BlockoutContext, part: NewworldPrimeStructurePart): void {
  // Already world-space: westTealHousePARTS/eastYellowHousePARTS apply the
  // origin internally. Emit verbatim, never re-apply.
  const [w, h, d] = part.sizeMetres;
  emitBox(
    ctx, `newworld-prime-${part.id}`, part.role, 'structures',
    part.offsetMetres, part.sizeMetres, part.material,
    new THREE.BoxGeometry(w, h, d), 0, 12,
  );
}

function emitPropPart(
  ctx: BlockoutContext,
  part: NewworldPrimePropPart,
  placement: NewworldPrimePropPlacement,
): void {
  const [px, pz] = yawOffset(part.offset[0], part.offset[2], placement.rotationY);
  const offset: readonly [number, number, number] = [
    placement.x + px, part.offset[1], placement.z + pz,
  ];
  const geometry = part.primitive === 'cylinder'
    ? new THREE.CylinderGeometry(part.size[0] / 2, part.size[2] / 2, part.size[1], 10)
    : part.primitive === 'plane'
      ? new THREE.PlaneGeometry(part.size[0], part.size[1])
      : part.primitive === 'icosahedron'
        ? new THREE.IcosahedronGeometry(part.size[0], 0)
        : new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
  const mesh = emitBox(
    ctx, `newworld-prime-${placement.id}-${part.id}`, part.role, 'props',
    offset, part.size, part.materialId, geometry,
    part.rotationY + placement.rotationY,
    part.triangleEstimate || triangleForPrimitive(part.primitive),
  );
  if (part.primitive === 'plane') mesh.rotation.x = -Math.PI / 2;
}

function emitPropSet(
  ctx: BlockoutContext,
  parts: readonly NewworldPrimePropPart[] | undefined | null,
  placement: NewworldPrimePropPlacement,
  fallbackSlab: LocalEmplacement | null,
  fallbackMaterial: string,
): void {
  const list = orEmpty(parts);
  if (list.length === 0) {
    // Sibling not yet landed (or regressed): keep the reservation readable
    // with a flat local slab instead of breaking the load.
    if (fallbackSlab) {
      const [fx, fz] = yawOffset(fallbackSlab.offset[0], fallbackSlab.offset[2], placement.rotationY);
      emitLocal(
        ctx, `newworld-prime-${placement.id}-reservation-slab`, 'reservation-slab',
        [placement.x + fx, fallbackSlab.offset[1], placement.z + fz],
        fallbackSlab.size, fallbackMaterial, placement.rotationY,
      );
    }
    return;
  }
  for (const part of list) emitPropPart(ctx, part, placement);
}

// ---------------------------------------------------------------------------
// Section builders (one per LAYOUT_CONTRACT fact group).
// ---------------------------------------------------------------------------

/** Fact 1: high-desert surround — sand ground, seeded scrub + rocks, poles. */
function buildDesertSurround(ctx: BlockoutContext, rng: DeterministicRng): void {
  centred(ctx, 'newworld-prime-desert-ground', 'desert-ground', 0, 0, -0.06, [96, 0.12, 112], 'newworld-prime-sand-v1');

  // Two fenced residential lots: the ONLY green inside the arena.
  centred(ctx, 'newworld-prime-lot-west-lawn', 'lot-lawn', -16.25, -2, 0.03, [13.5, 0.06, 28], 'newworld-prime-lawn-v1');
  centred(ctx, 'newworld-prime-lot-east-lawn', 'lot-lawn', 16.25, 2, 0.03, [13.5, 0.06, 28], 'newworld-prime-lawn-v1');

  const inWestLot = (x: number, z: number): boolean =>
    x > -24 && x < -8.5 && z > -17 && z < 13;
  const inEastLot = (x: number, z: number): boolean =>
    x > 8.5 && x < 24 && z > -13 && z < 17;
  const onRoad = (x: number, z: number): boolean =>
    (Math.abs(x) < 14 && Math.abs(z) < 17) || (Math.abs(x) < 4.5 && Math.abs(z) < 36);

  let placed = 0;
  for (let attempt = 0; attempt < 400 && placed < NEWWORLD_PRIME_SCRUB_COUNT; attempt += 1) {
    const x = (rng.next() * 2 - 1) * 46;
    const z = (rng.next() * 2 - 1) * 52;
    if (inWestLot(x, z) || inEastLot(x, z) || onRoad(x, z)) continue;
    const s = 0.5 + rng.next() * 0.4;
    emitLocal(
      ctx, `newworld-prime-scrub-${placed}`, 'desert-scrub',
      [x, s / 2, z], [s, s, s], 'newworld-prime-scrub-v1', rng.next() * Math.PI,
    );
    placed += 1;
  }
  placed = 0;
  for (let attempt = 0; attempt < 200 && placed < NEWWORLD_PRIME_ROCK_COUNT; attempt += 1) {
    const x = (rng.next() * 2 - 1) * 44;
    const z = (rng.next() * 2 - 1) * 50;
    if (inWestLot(x, z) || inEastLot(x, z) || onRoad(x, z)) continue;
    const s = 0.4 + rng.next() * 0.7;
    emitLocal(
      ctx, `newworld-prime-rock-${placed}`, 'desert-rock',
      [x, s * 0.3, z], [s, s * 0.6, s * 0.8], 'newworld-prime-rock-v1', rng.next() * Math.PI,
    );
    placed += 1;
  }

  // Utility poles marching the surround, mirrored across the spine.
  for (const [index, z] of [-28, -4, 20].entries()) {
    pair(
      ctx, `newworld-prime-utility-pole-${index}`, 'utility-pole',
      { offset: [-30, 3.5, z], size: [0.25, 7, 0.25] },
      { offset: [30, 3.5, z], size: [0.25, 7, 0.25] },
      'newworld-prime-pole-timber-v1',
    );
    centred(ctx, `newworld-prime-utility-crossarm-west-${index}`, 'utility-crossarm', -30, z, 6.2, [0.15, 0.15, 1.6], 'newworld-prime-pole-timber-v1');
    centred(ctx, `newworld-prime-utility-crossarm-east-${index}`, 'utility-crossarm', 30, z, 6.2, [0.15, 0.15, 1.6], 'newworld-prime-pole-timber-v1');
  }
}

/** Fact 3: horseshoe loop asphalt spine (north entry stub, south exit stub). */
function buildLoopSpine(ctx: BlockoutContext): void {
  const t = 0.08;
  const y = 0.04;
  const asphalt = 'newworld-prime-asphalt-v1';
  const ax = NEWWORLD_PRIME_LOOP_ARM_X_M;
  const cz = NEWWORLD_PRIME_LOOP_CROSS_Z_M;
  centred(ctx, 'newworld-prime-loop-north', 'loop-asphalt', 0, cz, y, [11, t, NEWWORLD_PRIME_LOOP_WIDTH_M], asphalt);
  centred(ctx, 'newworld-prime-loop-south', 'loop-asphalt', 0, -cz, y, [11, t, NEWWORLD_PRIME_LOOP_WIDTH_M], asphalt);
  centred(ctx, 'newworld-prime-loop-west', 'loop-asphalt', -ax, 0, y, [NEWWORLD_PRIME_LOOP_WIDTH_M, t, 22], asphalt);
  centred(ctx, 'newworld-prime-loop-east', 'loop-asphalt', ax, 0, y, [NEWWORLD_PRIME_LOOP_WIDTH_M, t, 22], asphalt);
  for (const [qx, qz] of [[-ax, cz], [ax, cz], [-ax, -cz], [ax, -cz]] as const) {
    centred(
      ctx, `newworld-prime-loop-corner-${qx < 0 ? 'w' : 'e'}-${qz > 0 ? 'n' : 's'}`, 'loop-asphalt',
      qx, qz, y, [NEWWORLD_PRIME_LOOP_WIDTH_M, t, NEWWORLD_PRIME_LOOP_WIDTH_M], asphalt,
    );
  }
  centred(ctx, 'newworld-prime-loop-entry-stub', 'loop-asphalt', 0, 24, y, [NEWWORLD_PRIME_LOOP_WIDTH_M, t, 18], asphalt);
  centred(ctx, 'newworld-prime-loop-exit-stub', 'loop-asphalt', 0, -24, y, [NEWWORLD_PRIME_LOOP_WIDTH_M, t, 18], asphalt);
}

/** Fact 2: street houses from StructuresForge PARTS (teal west, yellow east). */
function buildStreetHouses(ctx: BlockoutContext): { west: number; east: number; combined: number } {
  const west = orEmpty(westTealHousePARTS(NEWWORLD_PRIME_WEST_TEAL_ORIGIN));
  const east = orEmpty(eastYellowHousePARTS(NEWWORLD_PRIME_EAST_YELLOW_ORIGIN));
  if (west.length === 0) {
    // Local massing fallback: keep the teal identity readable.
    emitLocal(ctx, 'newworld-prime-west-house-massing', 'house-massing', [-13.5, 2.7, 1.5], [7.2, 5.4, 6], 'newworld-teal-siding');
  } else {
    for (const part of west) emitStructurePart(ctx, part);
  }
  if (east.length === 0) {
    emitLocal(ctx, 'newworld-prime-east-house-massing', 'house-massing', [13.5, 2.7, -1.5], [7.8, 5.4, 6.4], 'newworld-yellow-siding');
  } else {
    for (const part of east) emitStructurePart(ctx, part);
  }
  const combined = orEmpty(newworldPrimeStructuresPARTS({
    westTeal: NEWWORLD_PRIME_WEST_TEAL_ORIGIN,
    eastYellow: NEWWORLD_PRIME_EAST_YELLOW_ORIGIN,
  }));
  return { west: west.length, east: east.length, combined: combined.length };
}

/**
 * Fact 2 details owned by the blockout this wave: silver sedan at the teal
 * driveway, red umbrella + BBQ at the yellow back patio (local massing until
 * the props wave claims them).
 */
function buildHouseDressing(ctx: BlockoutContext): void {
  centred(ctx, 'newworld-prime-sedan-body', 'sedan-body', -13.5, 7, 0.55, [1.8, 0.55, 4.4], 'newworld-prime-sedan-silver-v1');
  centred(ctx, 'newworld-prime-sedan-cabin', 'sedan-cabin', -13.5, 6.8, 1.1, [1.6, 0.5, 2.2], 'newworld-prime-vehicle-glass-v1');
  centred(ctx, 'newworld-prime-umbrella-pole', 'patio-umbrella-pole', 13.5, -7.5, 1.1, [0.08, 2.2, 0.08], 'newworld-prime-pole-timber-v1');
  centred(ctx, 'newworld-prime-umbrella-canopy', 'patio-umbrella-canopy', 13.5, -7.5, 2.2, [2, 0.08, 2], 'newworld-prime-umbrella-red-v1');
  centred(ctx, 'newworld-prime-bbq', 'patio-bbq', 15.5, -7, 0.45, [0.6, 0.9, 0.5], 'newworld-prime-bbq-black-v1');
}

/** Fact 4: center-loop cover — bus + semi nose-to-nose inside the loop. */
function buildCenterCover(ctx: BlockoutContext): void {
  emitPropSet(
    ctx, NEWWORLD_PRIME_SCHOOL_BUS_PARTS, NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT,
    { offset: [0, 0.05, 0], size: [2.5, 0.1, 11.2] }, 'newworld-prime-bus-yellow-v1',
  );
  emitPropSet(
    ctx, NEWWORLD_PRIME_SEMI_TRUCK_PARTS, NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT,
    { offset: [0, 0.05, 0], size: [2.55, 0.1, 12.4] }, 'newworld-prime-truck-cab-red-v1',
  );
}

/** Fact 5: north entrance — rusty car showcase + welcome sign. */
function buildNorthEntrance(ctx: BlockoutContext): void {
  emitPropSet(
    ctx, NEWWORLD_PRIME_RUSTY_CAR_PARTS, NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT,
    { offset: [0, 0.05, 0], size: [1.8, 0.1, 4.4] }, 'newworld-prime-rusty-car-red-v1',
  );
  emitPropSet(
    ctx, NEWWORLD_PRIME_WELCOME_SIGN_PARTS, NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT,
    { offset: [0, 0.05, 0], size: [3.6, 0.1, 0.6] }, 'newworld-prime-sign-timber-v1',
  );
}

/**
 * Facts 7/8/9: sheds, concrete pads, lamps (geometry only — no live lights;
 * LightingAtmos owns light authority), fences, hedges from PropsForge.
 */
function buildYardsAndStreet(ctx: BlockoutContext): void {
  for (const placement of orEmpty(NEWWORLD_PRIME_SHED_PLACEMENTS)) {
    emitPropSet(
      ctx, NEWWORLD_PRIME_SHED_PARTS, placement,
      { offset: [0, 0.05, 0], size: [3.6, 0.1, 4.2] }, 'newworld-prime-shed-timber-v1',
    );
  }
  for (const placement of orEmpty(NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS)) {
    emitPropSet(
      ctx, NEWWORLD_PRIME_CONCRETE_PAD_PARTS, placement,
      { offset: [0, 0.04, 0], size: [4.2, 0.08, 4.8] }, 'newworld-prime-concrete-pad-v1',
    );
  }
  for (const placement of orEmpty(NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS)) {
    emitPropSet(
      ctx, NEWWORLD_PRIME_STREET_LAMP_PARTS, placement,
      { offset: [0, 0.05, 0], size: [0.4, 0.1, 0.4] }, 'newworld-prime-lamp-steel-v1',
    );
  }
  for (const run of orEmpty(NEWWORLD_PRIME_PRIVACY_FENCE_RUNS)) {
    const parts = newworldPrimePrivacyFenceRunParts(run.bays, NEWWORLD_PRIME_BLOCKOUT_SEED);
    for (const part of parts) emitPropPart(ctx, part, run);
  }
  for (const run of orEmpty(NEWWORLD_PRIME_HEDGE_RUNS)) {
    const parts = newworldPrimeHedgeRowParts(run.blobs, NEWWORLD_PRIME_BLOCKOUT_SEED);
    for (const part of parts) emitPropPart(ctx, part, run);
  }
}

/** Fact 8: backyard clotheslines with white laundry (local massing). */
function buildClotheslines(ctx: BlockoutContext): void {
  const yards = [
    { id: 'northwest', x: -15, z: -11 },
    { id: 'southeast', x: 15, z: 12 },
  ] as const;
  for (const yard of yards) {
    pair(
      ctx, `newworld-prime-clothesline-poles-${yard.id}`, 'clothesline-pole',
      { offset: [yard.x - 1.5, 1.1, yard.z], size: [0.09, 2.2, 0.09] },
      { offset: [yard.x + 1.5, 1.1, yard.z], size: [0.09, 2.2, 0.09] },
      'newworld-prime-pole-timber-v1',
    );
    centred(ctx, `newworld-prime-clothesline-${yard.id}`, 'clothesline', yard.x, yard.z, 2.0, [3.1, 0.03, 0.03], 'newworld-prime-pole-timber-v1');
    for (const [index, dx] of [-1, 0, 1].entries()) {
      centred(
        ctx, `newworld-prime-laundry-${yard.id}-${index}`, 'laundry',
        yard.x + dx, yard.z, 1.65, [0.5, 0.6, 0.03], 'newworld-prime-laundry-white-v1',
      );
    }
  }
}

/**
 * Scale-read dressing (2026-09-14 owner wave): closed lot perimeters, doorway
 * depth cues, lawn edging + sand ring, dusk window glow. Presentation-only —
 * same forced flags as every other emitter here — and fully reversible
 * through the flags (mirrors the NEWWORLD_PRIME_GLB_DRESSING_DEFAULT pattern).
 * Authority/colliders/spawns/nav untouched.
 */
function buildScaleReadDressing(
  ctx: BlockoutContext,
  flags: NewworldPrimeScaleReadFlags,
  variant: NewworldPrimeLightingVariant,
): void {
  if (flags.lotFences) {
    for (const run of NEWWORLD_PRIME_SCALE_READ_FENCE_CLOSURES) {
      const parts = newworldPrimePrivacyFenceRunParts(run.bays, NEWWORLD_PRIME_BLOCKOUT_SEED);
      for (const part of parts) emitPropPart(ctx, part, run);
    }
  }
  const boxes: NewworldPrimeScaleReadBox[] = [];
  if (flags.doorways) boxes.push(...NEWWORLD_PRIME_SCALE_READ_DOORWAYS);
  if (flags.groundVariation) boxes.push(...NEWWORLD_PRIME_SCALE_READ_EDGING, ...NEWWORLD_PRIME_SCALE_READ_GROUND_RING);
  if (flags.windowGlow) boxes.push(...NEWWORLD_PRIME_SCALE_READ_WINDOW_GLOW);
  for (const item of boxes) {
    emitLocal(ctx, item.id, item.role, item.offset, item.size, item.materialId, item.rotationY ?? 0);
  }
  if (flags.windowGlow) {
    // One shared lamp-lens role: cards + street-lamp lenses lift together at
    // dusk and sit dark at noon (late-morning/overcast read intensity 0).
    const lens = ctx.materials.get('newworld-prime-lamp-lens-v1') as THREE.MeshStandardMaterial | undefined;
    if (lens && lens.emissive) {
      lens.emissive.setHex(0xffc37a);
      lens.emissiveIntensity = newworldPrimeScaleReadGlowIntensity(variant);
    }
  }
}

/**
 * INTERIORS PILOT: ground-floor partition walls + floor slabs, both houses.
 * Data-owned by newworld-prime-interiors (room/wall/doorway truth); emitted
 * here through the shared structure-part path so the meshes count against the
 * 1024 assembly lane. Authority for the walls lands in newworld-prime-authority.
 */
function buildInteriors(ctx: BlockoutContext): number {
  const parts = orEmpty(newworldPrimeInteriorParts());
  for (const part of parts) emitStructurePart(ctx, part);
  return parts.length;
}


// Day-2: live spawns come from newworld-prime-authority (standby set retired).

// ---------------------------------------------------------------------------
// Arena entry (Shell imports this by name for arenaFactories + visual-stream).
// ---------------------------------------------------------------------------

/**
 * Day-2 playable New World Prime. Presentation blockout plus gameplay
 * authority from newworld-prime-authority (movement + shot + live spawns).
 *
 * Bar: batch-2-layout/map__layout-topdown.png +
 * batch-2-layout/map__layout-angle.png + batch-2-layout/map__center-loop.png.
 */
export function buildNewworldPrime(
  scene: THREE.Scene,
  opts?: {
    readonly scaleRead?: Partial<NewworldPrimeScaleReadFlags>;
    readonly lightingVariant?: NewworldPrimeLightingVariant;
  },
): ArenaMap {
  const root = new THREE.Group();
  root.name = 'New World Prime arena (blockout)';
  scene.add(root);

  const ctx: BlockoutContext = {
    root, materials: new Map(), parts: [], meshes: 0, triangles: 0,
  };
  const rng = new DeterministicRng(NEWWORLD_PRIME_BLOCKOUT_SEED);
  const scaleRead: NewworldPrimeScaleReadFlags = Object.freeze({
    ...NEWWORLD_PRIME_SCALE_READ_DEFAULT,
    ...opts?.scaleRead,
  });

  // LAYOUT_CONTRACT facts 1..10, in order (fact 6 reservations stay data-only).
  buildDesertSurround(ctx, rng); // fact 1
  const houseCounts = buildStreetHouses(ctx); // fact 2 (structures PARTS)
  buildHouseDressing(ctx); // fact 2 details (local massing)
  buildLoopSpine(ctx); // fact 3
  buildCenterCover(ctx); // fact 4
  buildNorthEntrance(ctx); // fact 5
  buildYardsAndStreet(ctx); // facts 7/8/9 (props PARTS)
  buildClotheslines(ctx); // fact 8 (local massing)
  const lighting = newworldPrimeLightingFor(opts?.lightingVariant ?? 'late-morning');
  buildScaleReadDressing(ctx, scaleRead, lighting.variant); // scale-read wave
  buildInteriors(ctx); // interiors pilot (ground-floor outlines, both houses)


  const propBudgetErrors = validateNewworldPrimePropBudgets();
  const propTriangles = newworldPrimePropTriangleTotal([
    ...orEmpty(NEWWORLD_PRIME_SCHOOL_BUS_PARTS),
    ...orEmpty(NEWWORLD_PRIME_SEMI_TRUCK_PARTS),
    ...orEmpty(NEWWORLD_PRIME_SHED_PARTS),
    ...orEmpty(NEWWORLD_PRIME_RUSTY_CAR_PARTS),
  ]);

  root.userData.newworldPrime = Object.freeze({
    arenaId: NEWWORLD_PRIME_ARENA_ID,
    route: NEWWORLD_PRIME_ARENA_ROUTE,
    displayName: NEWWORLD_PRIME_ARENA_DISPLAY_NAME,
    selectable: false,
    standbyPreview: true,
    layoutContract: 'atomic-acres-catalog/LAYOUT_CONTRACT.md facts 1-10',
    plates: NEWWORLD_PRIME_BLOCKOUT_PLATES,
    lighting: Object.freeze({
      variant: lighting.variant,
      sunColor: lighting.sunColor,
      sunIntensity: lighting.sunIntensity,
      tslPipelineRoles: NEWWORLD_PRIME_TSL_PIPELINE_ROLES,
      practicalRoleIds: NEWWORLD_PRIME_PRACTICAL_ROLE_IDS,
    }),
    budgets: Object.freeze({
      meshFence: NEWWORLD_PRIME_ASSEMBLY_MESH_FENCE,
      meshesObserved: ctx.meshes,
      triangleFence: NEWWORLD_PRIME_ASSEMBLY_TRIANGLE_FENCE,
      trianglesEstimated: ctx.triangles,
      propFamilyTrianglesObserved: propTriangles,
      propBudgetErrors,
      structureWestBudget: NEWWORLD_PRIME_WEST_TEAL_PART_BUDGET,
      structureWestObserved: houseCounts.west,
      structureEastBudget: NEWWORLD_PRIME_EAST_YELLOW_PART_BUDGET,
      structureEastObserved: houseCounts.east,
      structureCombinedObserved: houseCounts.combined,
    }),
    // Fact 6: jeep + sandbag footprints are reserved footprints only this
    // wave — kept clear, built later. Nothing is emitted for them.
    reservations: Object.freeze({
      jeep: NEWWORLD_PRIME_JEEP_RESERVATION,
      sandbag: NEWWORLD_PRIME_SANDBAG_RESERVATION,
    }),
    scaleRead: scaleRead,
    spawnsStandby: false,
    blockoutParts: Object.freeze([...ctx.parts]),
  });

  // Day-2: gameplay authority from the authority module (same boxes the
  // presentation reads, emitted once through map.ts conventions).
  const authority = newworldPrimeAuthority(scene);

  return {
    // Shell widens the ArenaMap id union to admit 'newworld-prime'.
    id: NEWWORLD_PRIME_ARENA_ID as unknown as ArenaMap['id'],
    label: NEWWORLD_PRIME_ARENA_DISPLAY_NAME,
    root,
    colliders: authority.colliders,
    physicsColliders: authority.physicsColliders,
    raycastMeshes: authority.proxyMeshes,
    shotSurfaces: authority.shotSurfaces,
    spawns: authority.spawns,
    patrolPoints: [
      [0, 20], [-7.5, 8], [7.5, 8], [0, 0], [-7.5, -8], [7.5, -8], [0, -20],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: authority.physicalCover,
    bounds: { ...NEWWORLD_PRIME_ARENA_BOUNDS },
    houseTelemetry: {
      houses: 0, groundRooms: 0, upperRooms: 0, doors: 0, windows: 0, ramps: 0,
      wallMaterialVariants: 0, pbrMaterialFamilies: 0,
    },
  };
}

/**
 * Read back the frozen blockout PARTS (offsets/sizes/role) for the Shell
 * inventory after a build. Returns empty until buildNewworldPrime runs.
 */
export function newworldPrimeBlockoutPartsOf(root: THREE.Group): readonly NewworldPrimeBlockoutPart[] {
  const audit = (root.userData.newworldPrime as { blockoutParts?: readonly NewworldPrimeBlockoutPart[] } | undefined);
  return audit?.blockoutParts ?? [];
}
