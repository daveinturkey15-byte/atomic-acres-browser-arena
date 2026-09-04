/**
 * nuketown2-grime-decals.ts — PASS 94 lane TECHNIQUES: tyre scuff, oil, slab
 * cracking, court paint and wall grime, as a TIERED decal set.
 *
 * WHY GRIME. Register row 47 (the GTA-style city-art bar) is explicit about
 * where the look actually lives in a street scene, in order of screen area:
 * "heavily detailed ROAD SURFACE (aggregate, cold-patch repairs, tar seams,
 * crack networks, worn lane paint), paving-slab pavements and split kerbs,
 * facade bays ... street furniture". The Rebuild's ground surfaces are
 * procedurally materialled but otherwise UNWORN: nothing records that a car
 * has ever turned onto the driveway or that anyone has ever walked the yard.
 * Row 48's dark-interior row makes the same point from the opposite direction
 * - decal grime is most of what buys a "high graphics" read for no lighting
 * technology at all.
 *
 * THE DEPTH-TIER RULES, and the one thing this module may NOT do.
 * `scripts/qa/find-coplanar-pairs.ts` must stay at 0/0/0, and it classifies a
 * pair of overlapping top faces within 0.03 m in three different ways:
 *   - inside a BUILDING footprint  -> HOUSE-INTERIOR-FINDING, offsets IGNORED;
 *   - inside a CARRIAGEWAY footprint -> STREET-FINDING, offsets IGNORED;
 *   - anywhere else -> FENCED if either body carries `polygonOffsetFactor < 0`.
 *
 * So a decal is admissible OUTSIDE the carriageway and outside the houses, and
 * it is fenced by its offset tier. INSIDE the carriageway it is not, at any
 * offset: the only route the gate leaves open there is HF-463's geometric one
 * (a marking raised more than 0.03 m clear of the road, as the centre dashes
 * are), and a 40 mm proud plinth is the wrong shape for a skid mark over
 * several square metres. **Carriageway tyre marks are therefore NOT built
 * here, and that is recorded as OPEN in the pass report rather than solved by
 * quietly rotating the geometry so the audit skips it.** Everything below is
 * on a driveway apron, a border path, a yard lawn or a vertical wall face.
 *
 * TIERS. The arena already uses two ground decal tiers: `driveDecal` at
 * factor -1 and `lawn` at -2 (see `street()` in `nuketown2-arena.ts`). This
 * module adds ONE tier below both, factor -3, so every piece here draws on top
 * of whatever surface it is written on, deterministically, at every range and
 * on both the WebGPU and WebGL2 backends.
 *
 * PATTERNS ARE WORLD-SPACE, NOT PER-DECAL. Each decal FAMILY is one material
 * whose alpha comes from a procedural field evaluated at world position; the
 * box only bounds where that field is allowed to show. That is what lets the
 * arena's `batchPresentationOnlyBoxes` merge every member of a family into one
 * draw call without the pattern smearing, and it is why this module returns a
 * table rather than building meshes.
 *
 * PRESENTATION ONLY. Every entry is `solid: false, shots: false, cast: false`.
 * No collider, no shot surface, no gameplay authority, and nothing here varies
 * by render profile.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { nuketown2InteriorJunctionDecals } from './nuketown2-interior-look';

const {
  abs,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  positionWorld,
  smoothstep,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

/**
 * The decal tier this module owns. Strictly below `lawn` (-2) and `driveDecal`
 * (-1), so grime is always the thing that draws on top.
 */
export const NUKETOWN2_GRIME_OFFSET_FACTOR = -3;

/**
 * Top of the ground-dressing plates this module writes on. `street()` emits
 * every dressing piece centred at y = -0.05 with height 0.14, so the plate top
 * is exactly 0.02. Grime sits 3 mm above it: inside the 0.03 m window on
 * purpose, so the pair is SEEN by the coplanar instrument and FENCED by the
 * offset tier, rather than hidden from it by a floating lip.
 */
export const GROUND_PLATE_TOP_Y = 0.02;
const GRIME_LIFT = 0.003;
const GRIME_THICKNESS = 0.006;
/** Centre y for a ground grime slab, so its top lands at plate + 3 mm. */
const GRIME_Y = GROUND_PLATE_TOP_Y + GRIME_LIFT - GRIME_THICKNESS / 2;

/**
 * MUSE FINDING 1 (PASS 94 techniques review): ground families stack on the same
 * rect - drive tyre scuff and drive slab cracking are the identical 4.8x7.8
 * footprint, border tyre and border cracking the identical 35.6x5.6 - and a
 * shared depth with a shared offset tier leaves those transparent layers
 * fighting each other, which the coplanar instrument cannot see because both
 * are FENCED. 1 mm per family separates them. The deepest family still lands
 * 7 mm above the plate, inside the deliberate 0.03 m window above, so every
 * pair stays SEEN-and-FENCED rather than floating out of the audit.
 */
export type Nuketown2Decal = Readonly<{
  name: string;
  family: 'tyre' | 'oil' | 'crack' | 'court' | 'stones' | 'wall-grime';
  /** AUTHORED position - the arena's `pair()` applies the handedness mirror. */
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  material: THREE.Material;
}>;

/**
 * Separate overlapping ground families by 1 mm. The shared -3 polygon-offset
 * tier fences each family against the surface below, but it cannot order two
 * transparent films that occupy the same plane. The lifts stay inside the
 * existing 0.03 m audit window and are presentation-only.
 */
const GRIME_FAMILY_LIFT_M: Readonly<Record<Nuketown2Decal['family'], number>> = Object.freeze({
  tyre: 0,
  oil: 0.001,
  crack: 0.002,
  court: 0.003,
  stones: 0.004,
  'wall-grime': 0,
});

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function decalMaterial(name: string, roughness: number): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ roughness, metalness: 0.02 });
  mat.name = name;
  // WebGLRenderer fallback safety, the rule the donor grass field records.
  mat.type = 'MeshStandardMaterial';
  mat.transparent = true;
  // A decal must not write depth: it is a film on a surface, and a decal that
  // writes depth sorts against the thing it is painted on.
  mat.depthWrite = false;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = NUKETOWN2_GRIME_OFFSET_FACTOR;
  mat.polygonOffsetUnits = NUKETOWN2_GRIME_OFFSET_FACTOR;
  return mat;
}

/** Cheap deterministic hash, world-space, no texture. */
function hash(x: unknown): unknown {
  return fract((x as { sin(): { mul(v: number): unknown } }).sin().mul(43758.5453));
}

/**
 * TYRE SCUFF. Two parallel bands at a car's track width (1.52 m), running
 * along z, with the rubber laid down heaviest where the wheel turns. The bands
 * are world-space and periodic in x at the track pitch, so a family of decal
 * boxes anywhere on a driveway or a path picks up the same set of tracks.
 */
function createTyreMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-grime-tyre', 0.94);
  const p = positionWorld;
  const TRACK_HALF = 0.76;
  // Distance to the nearer of the two wheel tracks, allowing the pair to be
  // centred on either the driveway or its 180-degree partner.
  const centred = min(abs(p.x), abs(abs(p.x).sub(float(9.25 - 4.25))));
  const track = abs(centred.sub(float(TRACK_HALF)));
  // A tyre lays a ~0.19 m contact patch with soft shoulders.
  const band = float(1).sub(smoothstep(0.06, 0.115, track));
  // Tread modulation along the direction of travel, plus a slow fade so a
  // track starts and stops instead of running the full slab.
  const tread = fract(p.z.mul(3.7)).mul(0.35).add(0.65);
  const along = smoothstep(0.0, 1.4, abs(p.z.mul(0.11).sin()).mul(2.4));
  mat.colorNode = vec3(0.055, 0.052, 0.050);
  mat.opacityNode = band.mul(tread).mul(along).mul(0.72).clamp(0, 0.78);
  return mat;
}

/**
 * OIL. A few soft blobs with an iridescent rim - the rim is what makes an oil
 * stain read as oil rather than as a dark patch. Placed by a world-space cell
 * hash so blobs do not line up.
 */
function createOilMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-grime-oil', 0.24);
  const p = positionWorld;
  const cell = vec2(floor(p.x.div(float(0.9))), floor(p.z.div(float(0.9))));
  const jitterX = hash(cell.x.mul(12.9898).add(cell.y.mul(78.233))) as { sub(v: number): unknown };
  const jitterZ = hash(cell.x.mul(39.3468).add(cell.y.mul(11.135))) as { sub(v: number): unknown };
  const local = vec2(
    fract(p.x.div(float(0.9))).sub(0.5).add((jitterX as any).sub(0.5).mul(0.42)),
    fract(p.z.div(float(0.9))).sub(0.5).add((jitterZ as any).sub(0.5).mul(0.42)),
  );
  const r = local.length();
  const present = hash(cell.x.mul(4.1).add(cell.y.mul(7.7))) as any;
  // Only about a third of cells carry a stain.
  const gate = smoothstep(0.62, 0.70, present);
  const core = float(1).sub(smoothstep(0.06, 0.20, r));
  const rim = smoothstep(0.16, 0.20, r).mul(float(1).sub(smoothstep(0.20, 0.245, r)));
  // The iridescent film: a thin-film-like hue sweep across the rim. Cheap, and
  // it is the only reason this is not a grey blob.
  const sheen = vec3(0.22, 0.34, 0.16).mul(fract(r.mul(9.3)).add(0.35));
  mat.colorNode = mix(vec3(0.038, 0.034, 0.030), sheen, rim);
  mat.opacityNode = max(core.mul(0.82), rim.mul(0.55)).mul(gate);
  mat.roughnessNode = mix(float(0.18), float(0.42), rim);
  return mat;
}

/**
 * SLAB CRACKING. A crack network from the ridges of two offset cell fields -
 * a crack is where a cell boundary is, so the network branches and terminates
 * the way settlement cracking does rather than looking like scratched lines.
 */
function createCrackMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-grime-crack', 0.97);
  const p = positionWorld;
  const ridge = (scale: number, warp: number) => {
    const u = p.x.mul(scale).add(p.z.mul(scale * 0.37).sin().mul(warp));
    const v = p.z.mul(scale).add(p.x.mul(scale * 0.29).sin().mul(warp));
    // Distance to the nearest cell boundary in a jittered lattice.
    const du = abs(fract(u).sub(0.5)).mul(2.0);
    const dv = abs(fract(v).sub(0.5)).mul(2.0);
    return float(1).sub(min(du, dv));
  };
  const network = max(ridge(0.62, 0.55), ridge(1.31, 0.31).mul(0.72));
  const crack = smoothstep(0.955, 0.995, network);
  // Cracks are dark in the fissure and pale at the spalled lip.
  const lip = smoothstep(0.90, 0.955, network).mul(float(1).sub(crack));
  mat.colorNode = mix(vec3(0.30, 0.30, 0.29), vec3(0.10, 0.10, 0.10), crack);
  mat.opacityNode = crack.mul(0.78).add(lip.mul(0.22)).clamp(0, 0.8);
  return mat;
}

/**
 * SHUFFLEBOARD COURT PAINT. The reference's white house yard carries a
 * shuffleboard court (FINDINGS Q4, VERIFIED from the BO2-2025 aerial). Worn
 * white line paint with a scoring triangle at each end.
 */
function createCourtMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-court-paint', 0.86);
  const p = positionWorld;
  // Court-local coordinates, symmetric about the origin so one material serves
  // both 180-degree partners.
  const lx = abs(p.x).sub(float(NUKETOWN2_SHUFFLEBOARD.absX));
  const lz = abs(p.z).sub(float(NUKETOWN2_SHUFFLEBOARD.absZ));
  const halfW = NUKETOWN2_SHUFFLEBOARD.width / 2;
  const halfD = NUKETOWN2_SHUFFLEBOARD.depth / 2;
  // Perimeter line.
  const edge = min(float(halfW).sub(abs(lx)), float(halfD).sub(abs(lz)));
  const border = float(1).sub(smoothstep(0.03, 0.075, edge));
  // The two scoring triangles: |lz| beyond a threshold, narrowing with |lx|.
  const apex = float(halfD).sub(abs(lz)).div(float(halfD * 0.42)).clamp(0, 1);
  const wedge = smoothstep(0.02, 0.055, abs(abs(lx).sub(apex.oneMinus().mul(halfW * 0.8))))
    .oneMinus()
    .mul(smoothstep(halfD * 0.5, halfD * 0.56, abs(lz)));
  // Wear: paint is thinnest where players stand.
  const wear = fract(p.x.mul(5.3).add(p.z.mul(3.1)).sin().mul(937.13)).mul(0.34).add(0.66);
  mat.colorNode = vec3(0.90, 0.90, 0.87);
  mat.opacityNode = max(border, wedge).mul(wear).mul(0.86);
  return mat;
}

/**
 * STEPPING STONES. Round pale slabs on a 0.62 m pitch - the aerial shows them
 * crossing both back yards from the deck to the yard props.
 */
function createStoneMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-stepping-stones', 0.93);
  const p = positionWorld;
  const cell = vec2(floor(p.x.div(float(0.62))), floor(p.z.div(float(0.62))));
  const wobble = hash(cell.x.mul(21.7).add(cell.y.mul(13.3))) as any;
  const local = vec2(fract(p.x.div(float(0.62))).sub(0.5), fract(p.z.div(float(0.62))).sub(0.5));
  const r = local.length().mul(0.62);
  const radius = float(0.19).add((wobble as any).mul(0.04));
  const stone = float(1).sub(smoothstep(radius.sub(0.018), radius, r));
  const grain = fract(p.x.mul(61.3).add(p.z.mul(43.9)).sin().mul(1237.7)).sub(0.5).mul(0.12);
  mat.colorNode = vec3(0.70, 0.69, 0.65).add(vec3(1, 1, 1).mul(grain));
  mat.opacityNode = stone.mul(0.95);
  return mat;
}

/**
 * WALL GRIME. Rain-driven streaking off the top of a wall plus a splash-back
 * band at its foot. Vertical, so it never enters the top-face coplanar audit
 * at all - the audit compares +y planes, and this surface has none that
 * overlaps anything.
 */
function createWallGrimeMaterial(): MeshStandardNodeMaterial {
  const mat = decalMaterial('nuketown2-wall-grime', 0.95);
  const p = positionWorld;
  // Streaks: vertical, irregular in width, denser near the top where the
  // run-off starts.
  const streakSeed = fract(p.x.mul(7.31).sin().mul(219.7));
  const streak = smoothstep(0.55, 0.92, streakSeed as any)
    .mul(fract(p.x.mul(1.9)).mul(0.5).add(0.5));
  const fromTop = smoothstep(0.4, 2.4, p.y).oneMinus();
  // Splash-back: the dirt a wall picks up from the ground in the first 0.35 m.
  const splash = float(1).sub(smoothstep(0.05, 0.42, p.y));
  const mould = fract(p.x.mul(0.41).add(p.y.mul(0.9)).sin().mul(97.3)).mul(0.5).add(0.5);
  mat.colorNode = mix(vec3(0.20, 0.20, 0.18), vec3(0.24, 0.26, 0.20), mould);
  mat.opacityNode = max(streak.mul(fromTop).mul(0.34), splash.mul(0.42)).clamp(0, 0.5);
  return mat;
}

export interface Nuketown2GrimeMaterials {
  tyre: MeshStandardNodeMaterial;
  oil: MeshStandardNodeMaterial;
  crack: MeshStandardNodeMaterial;
  court: MeshStandardNodeMaterial;
  stones: MeshStandardNodeMaterial;
  wallGrime: MeshStandardNodeMaterial;
  dispose(): void;
}

export function createNuketown2GrimeMaterials(): Nuketown2GrimeMaterials {
  const tyre = createTyreMaterial();
  const oil = createOilMaterial();
  const crack = createCrackMaterial();
  const court = createCourtMaterial();
  const stones = createStoneMaterial();
  const wallGrime = createWallGrimeMaterial();
  const all = [tyre, oil, crack, court, stones, wallGrime];
  return {
    tyre, oil, crack, court, stones, wallGrime,
    dispose: () => { for (const material of all) material.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** The shuffleboard court, in the AUTHORED frame. */
export const NUKETOWN2_SHUFFLEBOARD = Object.freeze({
  absX: 12.0, absZ: 31.6, width: 2.0, depth: 5.4,
});

/**
 * Every decal this module contributes, in the arena's own `pair()` argument
 * shape. Ordered by family so the batcher's per-material grouping produces one
 * merged draw per family.
 *
 * ALL of these are outside the carriageway and outside both building
 * footprints, which is what makes the offset tier effective (see the header).
 */
export function nuketown2GrimeDecals(m: Nuketown2GrimeMaterials): readonly Nuketown2Decal[] {
  const out: Nuketown2Decal[] = [];
  const ground = (
    name: string, family: Nuketown2Decal['family'],
    x: number, z: number, w: number, d: number, material: THREE.Material,
  ): void => {
    out.push(Object.freeze({
      name, family,
      position: [x, GRIME_Y + GRIME_FAMILY_LIFT_M[family], z] as const,
      size: [w, GRIME_THICKNESS, d] as const,
      material,
    }));
  };

  // ---- the driveway apron ------------------------------------------------
  // `street lawn` dressing gives the drive as x [4.25, 9.25], z [-16, -8]. The
  // decal stops 0.1 m inside that on every edge, and its z1 = -8.1 keeps it
  // clear of the turning head's z0 = -8 by 0.1 m - so it can never overlap the
  // carriageway, where the offset tier would not fence it.
  ground('drive tyre scuff', 'tyre', 6.75, -12.1, 4.8, 7.8, m.tyre);
  ground('drive oil stain', 'oil', 6.75, -13.4, 4.4, 4.6, m.oil);
  ground('drive slab cracking', 'crack', 6.75, -12.1, 4.8, 7.8, m.crack);

  // ---- the border path (the flank route behind each yard fence) -----------
  // `border path` is x [-18, 18], z [-42, -36]. Inset 0.2 m at each end.
  ground('border path tyre track', 'tyre', 0, -39.0, 35.6, 5.6, m.tyre);
  ground('border path cracking', 'crack', 0, -39.0, 35.6, 5.6, m.crack);

  // ---- the yard ----------------------------------------------------------
  // `yard lawn` is x [-18, 18], z [-36, -23].
  ground('yard shuffleboard court', 'court',
    NUKETOWN2_SHUFFLEBOARD.absX, -NUKETOWN2_SHUFFLEBOARD.absZ,
    NUKETOWN2_SHUFFLEBOARD.width, NUKETOWN2_SHUFFLEBOARD.depth, m.court);
  ground('yard stepping stones', 'stones', -1.0, -29.0, 9.0, 4.4, m.stones);

  // ---- vertical wall grime ----------------------------------------------
  // On the inner face of each perimeter wall run. The wall long run is at
  // z = NUKETOWN2_BOUNDS.minZ + 0.2 = -41.8, 0.4 m thick, so its inner face is
  // at -41.6; the grime film sits 12 mm proud of it. Its top (1.9 m) is 1.3 m
  // clear of the wall's own top (3.2 m), so no top-face pair exists.
  out.push(Object.freeze({
    name: 'perimeter wall grime long',
    family: 'wall-grime' as const,
    position: [0, 0.95, -41.588] as const,
    size: [33.0, 1.9, 0.024] as const,
    material: m.wallGrime,
  }));
  out.push(Object.freeze({
    name: 'perimeter wall grime end',
    family: 'wall-grime' as const,
    position: [-17.588, 0.95, 0] as const,
    size: [0.024, 1.9, 76.0] as const,
    material: m.wallGrime,
  }));
  // ---- PASS 96 interior look: skirting films at the floor/wall junctions --
  // Ground rooms only (upper strips would break the wall-grime top rule the
  // gate pins). Wall-grime family, so the ground-footprint tests skip them
  // and the one-material-per-family contract holds with zero new materials.
  for (const junction of nuketown2InteriorJunctionDecals(m.wallGrime)) {
    out.push(junction);
  }

  return Object.freeze(out);
}
