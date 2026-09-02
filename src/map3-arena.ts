/**
 * MAP3: Map 3 — the Corridor Gallery (PREVIEW).
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * `map3.html` + `src/map3/**` is a standalone technique SHOWCASE: eight
 * animated corridors around a hub, ~10k lines of TSL, its own Rapier world, its
 * own render loop. It was built as a separate Vite page on purpose (see the
 * header of `src/map3/main.ts`) so the art could be judged before any
 * registration work was spent on it.
 *
 * This file is the playable arena of the same PLACE. It is authored
 * architecture — floors, walls, piers, benches, planters — not an import of the
 * showcase's corridor modules, and that is a decision with three reasons, all
 * of them load-bearing:
 *
 *   1. COLLISION PARITY. AGENTS.md: "every substantial player-reachable visible
 *      object must have matching movement and shot authority". The showcase's
 *      corridors publish geometry and an update function and no colliders at
 *      all. Dropping them into an arena root would put a forest, a sea, a
 *      colonnade and a Jenga tower in front of the player with nothing solid
 *      behind any of it.
 *   2. NOTHING TICKS AN ARENA. `ArenaMap` has no per-frame hook and the frame
 *      loop calls none, so every corridor's `update(elapsed, dt, ...)` — which
 *      is where all eight drive their `uniform(0)` time — would never run. The
 *      showcase would arrive frozen: still water, still rain, still god rays.
 *   3. LOAD TIME. `arenaFactories` in legacy-main.ts is a STATIC import map, so
 *      the builder is in the main chunk. Importing the showcase would put ~10k
 *      lines plus `@dimforge/rapier3d-compat`'s wasm in front of every player
 *      of every arena, against a live owner priority ("faster map loads").
 *
 * So: the menu card says PREVIEW, `multiplayer` is false, and the arena is the
 * gallery's ARCHITECTURE — a courtyard, eight bays, and one authored feature
 * per bay that says what that bay is about. The showcase page stays the place
 * to look at the techniques. Wiring the animated interiors in needs an arena
 * frame hook and per-corridor collision; both are real work with owner-visible
 * consequences, and neither is something to smuggle in under a preview.
 *
 * WHY THE PLAN IS SQUARE AND NOT RADIAL.
 *
 * The showcase puts its eight corridors on 45-degree spokes. The first build of
 * this arena copied that, and the collider/visual parity gate correctly failed
 * it: `box()` records a solid as extents-plus-yaw (an ORIENTED box, which is
 * what the collision solver and Rapier both consume), while the parity audit
 * compares a collider's rectangle against each mesh's world AABB. Those two
 * agree exactly when yaw is zero and diverge badly when it is not — a
 * 0.5 x 4.6 m wall at 90 degrees measures 0.11 coverage against its OWN mesh,
 * so every diagonal wall reads as an invisible collider. Making the audit
 * orientation-aware would change the accepted rows of arenas this lane does not
 * own (Atomic Acres' ledger has two rows that exist precisely because of AABB
 * inflation on a rotated rail), so the arena moved instead: the courtyard is
 * square, the eight bays run along +/-x and +/-z, two to a side, and NOTHING in
 * this file is yawed. It also plays better. Eight radial spokes are eight
 * identical head-on lanes; two bays per side share a corner, so the corner
 * courts below are real cross-connections between neighbours.
 *
 * LAYOUT. A 38 x 38 m paved courtyard. Eight bays, each 9 m wide, leaving the
 * courtyard at +/-9.5 m either side of each edge's midpoint and running out
 * 44-56 m. Bay walls are PIERS with 1.8 m gaps every 6.4 m, not solid tubes:
 * without the gaps the map is eight one-way corridors and every fight is a
 * head-on push. The gaps open into the four corner courts, which carry planter
 * cover, so every bay can be flanked from the side.
 *
 * FAIRNESS INVOLUTION. The plan is symmetric under the 180-degree rotation
 * (x, z) -> (-x, -z): bay i maps to bay i+4, which is the same bay programme.
 * Team 0's spawns sit in bay 0 and the corner court beside it; team 1's are
 * their exact negations. Neither team owns a better half by construction.
 */
import * as THREE from 'three';
import {
  type Builder,
  batchPresentationOnlyBoxes,
  box,
  emptyTelemetry,
  spawnRecord,
  standard,
} from './additional-maps';
import type { ArenaMap } from './map';

/**
 * Playfield extent. The longest bay ends at 18 + 56 = 74 m and its end wall
 * reaches 78; 84 leaves the corner courts and the outer planters inside bounds
 * without wrapping empty scrub into the shadow volume.
 */
export const MAP3_BOUNDS = Object.freeze({ minX: -84, maxX: 84, minZ: -84, maxZ: 84 });

/** Half-extent of the paved courtyard. */
export const MAP3_COURTYARD_HALF = 19;
/** Distance from the origin at which a bay floor starts. */
const BAY_START = MAP3_COURTYARD_HALF - 1;
/** Clear width between the two pier lines. */
const BAY_WIDTH = 9;
const BAY_HALF = BAY_WIDTH / 2;
/** Offset of a bay's centre line from its edge's midpoint. */
const BAY_OFFSET = 9.5;
/** Pier line height. Clears the 1.70 m standing eye by a full storey. */
const PIER_H = 4.2;
const PIER_T = 0.5;
/** Pier module: 4.6 m of solid, then a 1.8 m gap to flank through. */
const PIER_RUN = 4.6;
const PIER_GAP = 1.8;
const PIER_PITCH = PIER_RUN + PIER_GAP;
/** Waist-high cover: breaks the standing eye-line from prone, and mountable. */
const LOW_COVER = 0.95;
/** Hard cover: clears the 1.65 m standing eye line. */
const HARD_COVER = 1.9;

/**
 * A bay's frame, as two AXIS unit vectors. `outward` is the direction the bay
 * runs; `lateral` is its right-hand side. Both are always one of the four world
 * axes, which is the whole point (see the header).
 */
type BayFrame = Readonly<{ ox: number; oz: number; lx: number; lz: number }>;

const BAY_FRAMES: readonly BayFrame[] = Object.freeze([
  Object.freeze({ ox: 0, oz: -1, lx: 1, lz: 0 }),  // north edge, runs -z
  Object.freeze({ ox: 1, oz: 0, lx: 0, lz: 1 }),   // east edge, runs +x
  Object.freeze({ ox: 0, oz: 1, lx: -1, lz: 0 }),  // south edge, runs +z
  Object.freeze({ ox: -1, oz: 0, lx: 0, lz: -1 }), // west edge, runs -x
]);

export type Map3BaySpec = Readonly<{
  index: number;
  /** Stable slug; names the showcase corridor this bay stands for. */
  id: string;
  label: string;
  /** Bay floor length in metres, outward from BAY_START. */
  lengthM: number;
  frame: BayFrame;
  /** Signed offset of the bay centre line from its edge midpoint. */
  offset: number;
}>;

/**
 * The eight bays, in the showcase's corridor order and carrying its corridor
 * lengths, so the arena and `map3.html` describe the same place at the same
 * scale. Lengths are each corridor module's own `LEN`.
 *
 * Two bays per edge at -/+ BAY_OFFSET. Because the edges are walked in order
 * and the offsets alternate, bay i and bay i+4 are exact 180-degree images of
 * one another, which is the fairness involution in the header.
 */
export const MAP3_BAYS: readonly Map3BaySpec[] = Object.freeze(([
  ['nature', 'Nature', 54],
  ['maths', 'Maths', 48],
  ['grammar', 'Grammar', 52],
  ['water', 'Water', 54],
  ['weather', 'Weather', 56],
  ['volume', 'Volume', 44],
  ['physics', 'Physics', 50],
  ['colosseum', 'Colosseum', 44],
] as const).map(([id, label, lengthM], index) => Object.freeze({
  index,
  id,
  label,
  lengthM,
  frame: BAY_FRAMES[index % 4]!,
  offset: index < 4 ? -BAY_OFFSET : BAY_OFFSET,
})));

/** World XZ of a point given in bay-local (lateral, outward) metres. */
function bayPoint(bay: Map3BaySpec, lateral: number, outward: number): [number, number] {
  const l = lateral + bay.offset;
  return [
    bay.frame.ox * outward + bay.frame.lx * l,
    bay.frame.oz * outward + bay.frame.lz * l,
  ];
}

/**
 * A box in bay-local coordinates. `size` is [width across the bay, height,
 * length along the bay]; the components are swapped, never rotated, so the
 * collider rectangle `box()` records is the mesh's true world AABB.
 */
function bayBox(
  builder: Builder,
  bay: Map3BaySpec,
  name: string,
  lateral: number,
  outward: number,
  y: number,
  size: [number, number, number],
  material: THREE.Material,
  options: Parameters<typeof box>[5] = {},
): THREE.Mesh {
  const [x, z] = bayPoint(bay, lateral, outward);
  const alongX = bay.frame.ox !== 0;
  const worldSize: [number, number, number] = alongX
    ? [size[2], size[1], size[0]]
    : [size[0], size[1], size[2]];
  return box(builder, name, [x, y, z], worldSize, material, options);
}

function makeBuilder(scene: THREE.Scene, name: string): Builder {
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  return {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    ballisticSurfaceSequence: 0,
  };
}

/**
 * Materials. Authored MeshStandardMaterials, original to this map: the
 * gallery's whole visual argument is stone value and shadow, and the shipped
 * surface set (`test-maps-art.ts`) is authored for a range and an estate.
 */
type Map3Materials = Readonly<{
  paving: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  pier: THREE.MeshStandardMaterial;
  lintel: THREE.MeshStandardMaterial;
  bench: THREE.MeshStandardMaterial;
  planter: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}>;

function map3Materials(): Map3Materials {
  return Object.freeze({
    // Value chosen from the showcase's own capture: its hub paving was re-graded
    // from 0.31 to 0.20 linear on 2026-09-02 after 0.31 measured as blown white
    // concrete under this sun.
    paving: standard(0x565853, 0.94, 0.02),
    kerb: standard(0x3e4040, 0.9, 0.02),
    pier: standard(0x6b6b70, 0.82, 0.02),
    lintel: standard(0x5a5a60, 0.86, 0.03),
    bench: standard(0x77694f, 0.88, 0.02),
    planter: standard(0x3f4a33, 0.95, 0.01),
    ground: standard(0x4a5140, 1, 0),
    // The only smooth surface on the map: the ray-traced preset needs something
    // to reflect, and the water bay is where that belongs.
    water: standard(0x2b6f74, 0.1, 0.02),
  });
}

/** Pier line down one side of a bay, split into modules with flanking gaps. */
function pierLine(builder: Builder, bay: Map3BaySpec, side: -1 | 1, material: THREE.Material): void {
  const lateral = side * (BAY_HALF + PIER_T / 2);
  const name = side > 0 ? 'right' : 'left';
  const modules = Math.max(1, Math.floor((bay.lengthM - PIER_GAP) / PIER_PITCH));
  for (let i = 0; i < modules; i += 1) {
    const start = BAY_START + i * PIER_PITCH;
    bayBox(builder, bay, `map3 ${bay.id} pier ${name} ${i}`,
      lateral, start + PIER_RUN / 2, PIER_H / 2, [PIER_T, PIER_H, PIER_RUN], material);
  }
  // The last module runs to the bay end so the far corner is never open.
  const tailStart = BAY_START + modules * PIER_PITCH;
  const tailLength = BAY_START + bay.lengthM - tailStart;
  if (tailLength > 0.4) {
    bayBox(builder, bay, `map3 ${bay.id} pier ${name} tail`,
      lateral, tailStart + tailLength / 2, PIER_H / 2, [PIER_T, PIER_H, tailLength], material);
  }
}

/** The gantry over a bay mouth — the showcase's signage frame, as architecture. */
function gantry(builder: Builder, bay: Map3BaySpec, materials: Map3Materials): void {
  for (const side of [-1, 1] as const) {
    bayBox(builder, bay, `map3 ${bay.id} gantry leg ${side}`,
      side * (BAY_HALF + 0.45), BAY_START - 0.6, 2.6, [0.6, 5.2, 0.6], materials.pier);
  }
  bayBox(builder, bay, `map3 ${bay.id} gantry beam`,
    0, BAY_START - 0.6, 5.5, [BAY_WIDTH + 1.5, 0.6, 0.6], materials.lintel);
}

/** The one authored feature that says what a bay is about. */
function bayFeature(builder: Builder, bay: Map3BaySpec, materials: Map3Materials): void {
  const mid = BAY_START + bay.lengthM / 2;
  const end = BAY_START + bay.lengthM;
  switch (bay.id) {
    case 'nature':
      // Two staggered planter beds: low cover you vault, in a lane that would
      // otherwise be a 54 m sightline.
      for (let i = 0; i < 4; i += 1) {
        bayBox(builder, bay, `map3 nature bed ${i}`,
          i % 2 === 0 ? -2.4 : 2.4, BAY_START + 8 + i * 10, LOW_COVER / 2,
          [3.4, LOW_COVER, 5.2], materials.planter);
      }
      break;
    case 'maths':
      // A lattice of square piers on a 6.5 m rhythm — the bay reads as a proof
      // and plays as a pillar fight.
      for (let i = 0; i < 6; i += 1) {
        for (const side of [-1, 1] as const) {
          bayBox(builder, bay, `map3 maths pillar ${i} ${side}`,
            side * 2.6, BAY_START + 7 + i * 6.5, PIER_H / 2, [0.9, PIER_H, 0.9], materials.pier);
        }
      }
      break;
    case 'grammar':
      // Reading benches in facing pairs: waist cover with a gap between each
      // pair, so the lane is crossable at four points.
      for (let i = 0; i < 4; i += 1) {
        for (const side of [-1, 1] as const) {
          bayBox(builder, bay, `map3 grammar bench ${i} ${side}`,
            side * 3.0, BAY_START + 9 + i * 10, LOW_COVER / 2, [1.2, LOW_COVER, 4.4], materials.bench);
        }
      }
      break;
    case 'water':
      // A sunken basin either side of a 2.2 m walkway. The basin surface sits
      // 0.3 m below the bay floor, so the walkway is the contested line and the
      // kerb beside it is the cover.
      for (const side of [-1, 1] as const) {
        bayBox(builder, bay, `map3 water basin ${side}`,
          side * 2.9, mid, -0.3, [3.4, 0.5, bay.lengthM - 14], materials.water, { cast: false });
        bayBox(builder, bay, `map3 water kerb ${side}`,
          side * 1.15, mid, 0.15, [0.3, 0.3, bay.lengthM - 14], materials.kerb);
      }
      break;
    case 'weather':
      // An open colonnade: a paired column rhythm with a lintel over each pair,
      // which is what makes the longest bay readable at range.
      for (let i = 0; i < 7; i += 1) {
        const at = BAY_START + 6 + i * 6.6;
        for (const side of [-1, 1] as const) {
          bayBox(builder, bay, `map3 weather column ${i} ${side}`,
            side * 3.1, at, 2.35, [0.7, 4.7, 0.7], materials.pier);
        }
        bayBox(builder, bay, `map3 weather lintel ${i}`,
          0, at, 5.0, [7.0, 0.6, 0.7], materials.lintel);
      }
      break;
    case 'volume': {
      // The showcase's own trick, as architecture: a solid sun-side wall pierced
      // by one tall slit per bay and a roof slab split around a clerestory slot.
      // There it is what makes a shaft read as a shaft; here it makes the hall
      // the map's one dark interior and its only overhead cover.
      const CELLS = 6;
      const pitch = (bay.lengthM - 8) / CELLS;
      for (let i = 0; i < CELLS; i += 1) {
        const at = BAY_START + 4 + i * pitch;
        for (const half of [-1, 1] as const) {
          bayBox(builder, bay, `map3 volume sunwall ${i} ${half}`,
            BAY_HALF - 0.35, at + half * (pitch / 4 + 0.22), PIER_H / 2,
            [0.4, PIER_H, pitch / 2 - 0.45], materials.pier);
          bayBox(builder, bay, `map3 volume roof ${i} ${half}`,
            0, at + half * (pitch / 4 + 0.35), PIER_H + 0.25,
            [BAY_WIDTH + 0.8, 0.5, pitch / 2 - 0.7], materials.lintel);
        }
      }
      break;
    }
    case 'physics':
      // A stepped stack: three 0.7 m rises onto a 2.1 m platform. Every rise is
      // under the measured 0.82 m jump apex, so the bay's high ground is
      // reachable without a launch pad, and the parapet keeps it from becoming
      // one.
      for (let step = 0; step < 3; step += 1) {
        const top = 0.7 * (step + 1);
        bayBox(builder, bay, `map3 physics step ${step}`,
          0, BAY_START + 12 + step * 2.2, top / 2, [6.0, top, 2.2], materials.pier);
      }
      bayBox(builder, bay, 'map3 physics platform',
        0, BAY_START + 22, 1.05, [6.0, 2.1, 8.0], materials.pier);
      for (const side of [-1, 1] as const) {
        bayBox(builder, bay, `map3 physics parapet ${side}`,
          side * 2.6, BAY_START + 22, 2.55, [0.8, 0.9, 8.0], materials.kerb);
      }
      break;
    case 'colosseum': {
      // A square end chamber, 26 m across, entered only from the bay: three
      // walls plus the two returns that frame the mouth, and a low ring of
      // seating inside it. The map's one room-scale fight.
      const half = 13;
      const centre = end + half;
      bayBox(builder, bay, 'map3 colosseum wall far',
        0, centre + half, HARD_COVER, [half * 2 + 1.2, HARD_COVER * 2, 0.6], materials.pier);
      for (const side of [-1, 1] as const) {
        bayBox(builder, bay, `map3 colosseum wall side ${side}`,
          side * half, centre, HARD_COVER, [0.6, HARD_COVER * 2, half * 2], materials.pier);
        // Return wall each side of the mouth, leaving the bay's 9 m open.
        bayBox(builder, bay, `map3 colosseum wall return ${side}`,
          side * (BAY_HALF + (half - BAY_HALF) / 2), centre - half, HARD_COVER,
          [half - BAY_HALF, HARD_COVER * 2, 0.6], materials.pier);
        bayBox(builder, bay, `map3 colosseum seating ${side}`,
          side * 8.5, centre, LOW_COVER / 2, [2.4, LOW_COVER, 14], materials.bench);
      }
      bayBox(builder, bay, 'map3 colosseum seating far',
        0, centre + 8.5, LOW_COVER / 2, [12, LOW_COVER, 2.4], materials.bench);
      break;
    }
    default:
      break;
  }
}

/**
 * Planter cover in a corner court. This is what makes the flanking gaps in the
 * pier lines worth using: without it the corner is open ground and nobody
 * crosses it. Four courts, one per corner, each the 180-degree image of the
 * one opposite.
 */
function cornerCourt(builder: Builder, corner: number, materials: Map3Materials): void {
  const sx = corner === 0 || corner === 3 ? 1 : -1;
  const sz = corner === 0 || corner === 1 ? 1 : -1;
  for (let i = 0; i < 4; i += 1) {
    const r = 26 + i * 10;
    const skew = i % 2 === 0 ? 4 : -4;
    box(builder, `map3 corner ${corner} planter ${i}`,
      [sx * (r + skew) * 0.72, LOW_COVER / 2, sz * (r - skew) * 0.72],
      [4.2, LOW_COVER, 2.4], materials.planter);
  }
  // One hard-cover block per court, so a corner is not purely a vaulting run.
  box(builder, `map3 corner ${corner} pylon`,
    [sx * 30, HARD_COVER / 2, sz * 30], [3.0, HARD_COVER, 3.0], materials.pier);
}

export function buildMap3(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Map3 arena');
  const materials = map3Materials();

  // Ground runs well past the playfield so the horizon is continuous scrub
  // rather than an 84 m slab floating in a void. One draw call either way.
  box(builder, 'map3 ground', [0, -0.7, 0], [230, 1.4, 230], materials.ground, { cast: false });

  // --- courtyard ----------------------------------------------------------
  const half = MAP3_COURTYARD_HALF;
  box(builder, 'map3 courtyard paving', [0, -0.18, 0], [half * 2, 0.36, half * 2],
    materials.paving, { cast: false });
  // Kerb runs along each edge, split around the two bay mouths on that edge, so
  // the 0.35 m step down to the scrub reads as a built edge rather than a hole.
  for (const [ex, ez] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const alongX = ex === 0;
    for (const side of [-1, 1] as const) {
      const centre = side * (BAY_OFFSET + BAY_HALF + (half - BAY_OFFSET - BAY_HALF) / 2);
      const run = half - BAY_OFFSET - BAY_HALF;
      box(builder, `map3 kerb ${ex} ${ez} ${side}`,
        [ex * (half - 0.25) + (alongX ? centre : 0), 0.1, ez * (half - 0.25) + (alongX ? 0 : centre)],
        alongX ? [run, 0.4, 0.5] : [0.5, 0.4, run], materials.kerb, { cast: false });
    }
    // The stub between the two mouths, on the edge midpoint.
    box(builder, `map3 kerb ${ex} ${ez} mid`,
      [ex * (half - 0.25), 0.1, ez * (half - 0.25)],
      alongX ? [BAY_OFFSET * 2 - BAY_WIDTH, 0.4, 0.5] : [0.5, 0.4, BAY_OFFSET * 2 - BAY_WIDTH],
      materials.kerb, { cast: false });
  }

  // Central plinth: the one piece of high ground every bay mouth can see,
  // reached by four 0.35 m steps (under the 0.42 m autostep, so no jump).
  box(builder, 'map3 plinth', [0, 0.35, 0], [7.2, 0.7, 7.2], materials.paving);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    box(builder, `map3 plinth step ${sx} ${sz}`,
      [sx * 4.4, 0.175, sz * 4.4], [sz === 0 ? 1.6 : 5.2, 0.35, sz === 0 ? 5.2 : 1.6],
      materials.paving);
  }

  // --- bays ---------------------------------------------------------------
  for (const bay of MAP3_BAYS) {
    const mid = BAY_START + bay.lengthM / 2;
    // Bay floor: a 0.3 m slab standing proud of the courtyard, which is the
    // separation the showcase settled on after three near-coplanar planes
    // produced shimmering seams.
    bayBox(builder, bay, `map3 ${bay.id} floor`, 0, mid, -0.12,
      [BAY_WIDTH + 1, 0.3, bay.lengthM], materials.paving, { cast: false });
    pierLine(builder, bay, -1, materials.pier);
    pierLine(builder, bay, 1, materials.pier);
    gantry(builder, bay, materials);
    bayFeature(builder, bay, materials);
    if (bay.id !== 'colosseum') {
      // End wall with a 3 m doorway on the centre line, so a bay is a room with
      // a back door rather than a dead end you can be trapped in.
      const leaf = (BAY_WIDTH + 1 - 3) / 2;
      for (const side of [-1, 1] as const) {
        bayBox(builder, bay, `map3 ${bay.id} end wall ${side}`,
          side * (1.5 + leaf / 2), BAY_START + bay.lengthM + 0.3, PIER_H / 2,
          [leaf, PIER_H, 0.6], materials.pier);
      }
    }
  }

  for (let corner = 0; corner < 4; corner += 1) cornerCourt(builder, corner, materials);

  batchPresentationOnlyBoxes(builder.root, 'map3-presentation');

  // Spawn sets are exact negations of one another under the 180-degree rotation
  // the layout is built on, so bay 0's mouth and bay 4's mouth are the same
  // position in each team's own frame. Six per team, spread over the bay's
  // width and its neighbouring corner court, so one grenade cannot cover a set.
  const team0: [number, number][] = [
    bayPoint(MAP3_BAYS[0]!, -3.2, 30), bayPoint(MAP3_BAYS[0]!, 0, 34), bayPoint(MAP3_BAYS[0]!, 3.2, 30),
    bayPoint(MAP3_BAYS[0]!, 0, 24), bayPoint(MAP3_BAYS[1]!, -3.2, 26), bayPoint(MAP3_BAYS[3]!, 3.2, 26),
  ];
  const team1: [number, number][] = team0.map(([x, z]) => [-x, -z] as [number, number]);

  return {
    id: 'map3',
    label: 'Map 3',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(team0, team1),
    // One point at each bay mouth, one deep in each bay, and the four corner
    // courts, so a bot patrol covers the gallery instead of circling the
    // courtyard.
    patrolPoints: [
      ...MAP3_BAYS.flatMap((bay) => [
        bayPoint(bay, 0, BAY_START + 4),
        bayPoint(bay, 0, BAY_START + bay.lengthM - 6),
      ]),
      [26, 26], [-26, 26], [26, -26], [-26, -26],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...MAP3_BOUNDS },
    physicsSafetyFloorY: -0.35,
    houseTelemetry: emptyTelemetry(),
  };
}
