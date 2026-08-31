/**
 * map3/corridor-colosseum.ts — corridor 7: the overlook.
 *
 * A processional way opens onto a terrace on the rim of a Roman amphitheatre
 * that has been excavated below the plain. You look DOWN into the bowl: eleven
 * courses of stepped seating, the podium wall, the sand deck, and the hypogeum
 * standing open where the deck has gone. Two great pyramids sit on the horizon
 * beyond the far arcade with the sky's own sun sweeping the gap between them,
 * and light falls through the arcade openings as distinct shafts rather than a
 * wash.
 *
 * ---------------------------------------------------------------------------
 * THE TWO FACTS THAT DECIDED THE WHOLE LAYOUT. Both are properties of main.ts,
 * not choices, and any future overlook in this map has to solve them again.
 *
 * 1. THE PLAYER'S EYE IS NAILED TO 1.7 m. main.ts:433 clamps `camera.position.y`
 *    to EYE every frame, so there is no walking up anything. A viewing platform
 *    cannot be raised; the thing being viewed has to be lowered.
 *
 * 2. THE SHARED GROUND IS AN OPAQUE LID AT y = -0.35 (main.ts:264, a 600 m
 *    plane). Anything dug below it is invisible, and not subtly: a ray from a
 *    1.7 m eye toward an arena floor 17 m down crosses y = -0.35 about EIGHT
 *    METRES in front of the player, so the entire excavation hides behind flat
 *    ground. A hole cannot be cut in a plane this module is not allowed to edit.
 *
 * The resolution is ONE object: the cavity eraser, step 1 of the assembly. It
 * is the closed shell of the excavation, drawn with `colorWrite:false,
 * depthTest:false` at renderOrder 1 — it paints nothing and writes the FAR
 * depth of the hole over whatever the shared ground left in the depth buffer.
 * Everything after it, including this corridor's own near ruins, depth-tests
 * normally and sorts correctly. One weird object; the other nine are ordinary.
 *
 * The desert apron then repairs the daylight side of the same problem: a single
 * ShapeGeometry with an elliptical HOLE at the bowl mouth, laid 41 cm above the
 * shared ground so the excavation has a lip to sit in and the pyramids have a
 * floor to stand on. It is a keyhole, not a disc, and its half-width is
 * tabulated so it never reaches the neighbouring corridors — see APRON_PROFILE.
 * ---------------------------------------------------------------------------
 *
 * Repo contract: no ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 * Every graph here is a three/webgpu NodeMaterial built as a node EXPRESSION
 * and assigned directly. `Fn` appears exactly once, for the volumetric march,
 * because `Loop()` genuinely needs statement scope.
 *
 * Everything is procedural: no imported mesh, no image, no font.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  Fn, Loop, abs, atan, cameraPosition, clamp, cos, dot, exp, float, fract,
  length, max, min, mix, normalize, positionLocal, positionWorld, sin,
  smoothstep, sqrt, uniform, vec3, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { hash11 } from './leaf-geometry';
import { rgb } from './foliage-material';

/* ================================================================== */
/* The dimension table                                                 */
/*                                                                     */
/* Every number the geometry AND the light shafts use comes from here. */
/* The beam gate is derived from BAYS and FAC_A/FAC_B rather than hand */
/* tuned, which is the shoreline-foam lesson applied to light: a gate  */
/* built from a constant drifts out of reach of the thing it gates.    */
/* ================================================================== */

/** Bowl centre on the corridor's own -z axis. */
const CZ = -122;

/** Cavea top rim — the mouth of the excavation. */
const RIM_A = 62;
const RIM_B = 54;

const TIERS = 11;
const TIER_RISE = 1.2;
const TIER_RUN = 2.1;

/** Top of the podium wall = bottom of the seating. */
const PODIUM_TOP = -TIERS * TIER_RISE;                 // -13.2
/** Arena ellipse, i.e. the rim inset by the whole rake. */
const ARENA_A = RIM_A - TIERS * TIER_RUN;              // 38.9
const ARENA_B = RIM_B - TIERS * TIER_RUN;              // 30.9
/** Hypogeum floor — the lowest thing in the map. */
const ARENA_Y = -17.0;
/** Sand deck: the surviving half of the arena floor, 1.6 m above the cellars. */
const DECK_Y = -15.4;

/** Outer facade footprint — the arcade wall standing on the rim. */
const FAC_A = 68;
const FAC_B = 60;
const BAYS = 48;

/**
 * Storeys of the facade: base height, storey height, radial inset.
 *
 * The upper storey steps back, which is both true of the original and the
 * cheapest way to stop a tall repeated wall reading as one extruded rectangle.
 */
const STOREYS: Array<{ base: number; height: number; inset: number }> = [
  { base: 0, height: 10.0, inset: 0 },
  { base: 10.0, height: 8.6, inset: 1.7 },
  { base: 18.6, height: 2.9, inset: 3.1 },
];

/**
 * The arcade module, and the ONE place its dimensions live.
 *
 * buildFacade places its piers and voussoirs from these, and the light-shaft
 * gate in createShaftMaterial reconstructs the openings from the same five
 * numbers. That is the point: a beam pattern hand-tuned to "look about right"
 * against an arcade drifts the moment either is retuned, and the failure is
 * silent — the shafts simply stop landing in the holes.
 */
const BAY_ARC = (Math.PI * (FAC_A + FAC_B)) / BAYS;    // ~8.38 m
const PIER_W = 3.2;
const OPEN_W = BAY_ARC - PIER_W;                       // ~5.18 m
/** Extrados radius of the voussoir ring. */
const ARCH_R = OPEN_W / 2 + 0.45;
const FAC_DEPTH = 3.4;
const VOUSSOIRS = 9;
/** Springing height of each arcaded storey. The attic has no arch. */
const SPRING = [
  STOREYS[0].base + STOREYS[0].height * 0.46,          // 4.60
  STOREYS[1].base + STOREYS[1].height * 0.44,          // 13.78
];
/** Floor of each arcaded storey — below this the opening is walled. */
const STOREY_FLOOR = [0.35, STOREYS[1].base + 0.2];
/** Top of the whole facade; above it a ray met nothing at all. */
const FAC_TOP = STOREYS[2].base + STOREYS[2].height;   // 21.5

/**
 * Terrace lip — and why it is AT the rim with nothing standing on it.
 *
 * Work the sight lines from a 1.7 m eye and the answer is forced. An occluder
 * of height k at distance d hides every depression angle steeper than
 * (1.7 - k) / d. A 1.05 m parapet four metres back hides everything below 7.6
 * degrees; the arena floor sits between 12 and 36 degrees down. Even a 35 cm
 * kerb at that distance hides more than half the bowl, and a waist-high rail
 * lays a five-degree bar straight across it.
 *
 * So the deck runs to the excavation, there is no kerb on the rim, and the
 * balustrade is on the SIDES only, where it is at 80 degrees of azimuth and out
 * of frame. The lip is unguarded — which is what the edge of a ruin is.
 */
const TERRACE_Z = -67.5;

/**
 * The shot.
 *
 * Corridor-local: stand here, look straight down the axis, and the frame is the
 * arena floor in the lower third, the intact far arcade across the middle, the
 * two pyramids rising either side of it and the sun's gap between them. Every
 * dimension below was chosen against this one viewpoint. A QA harness can drive
 * `__MAP3.setPose` to the world transform of this point with yaw = the pivot
 * angle + pi; the eye height is not negotiable, main.ts pins it to 1.7.
 */
export const COLOSSEUM_VIEWPOINT = Object.freeze({ x: 0, y: 1.7, z: -66.5 });

/** Corridor walk length; the hub uses it only to place the far sign. */
const LEN = 44;

/**
 * Desert apron half-width against z. A keyhole, not a disc.
 *
 * The apron has to cover the shared ground everywhere the eye can see the bowl,
 * and must not touch the neighbouring corridors, which fan out at ~51 deg from
 * this axis and reach 75 m from the hub centre (the hub centre is at local
 * z = +18). Every row below stays inside 41 deg of the axis, and every row
 * beyond z = -60 is further out than any corridor reaches.
 */
const APRON_PROFILE: Array<[number, number]> = [
  [-18, 14], [-30, 20], [-44, 30], [-60, 50], [-80, 84],
  [-105, 120], [-140, 158], [-180, 192], [-235, 218], [-302, 226],
];

/* ================================================================== */
/* Geometry helpers                                                    */
/* ================================================================== */

/** Point on the rim/facade ellipse family at angle t. */
function ellipseX(a: number, t: number): number { return a * Math.cos(t); }
function ellipseZ(b: number, t: number): number { return CZ + b * Math.sin(t); }

/**
 * Outward yaw at ellipse angle t.
 *
 * The outward normal of an ellipse is NOT the radial direction — it is
 * (cos t / a, sin t / b) normalised. Using the radial direction is the classic
 * way an arcade ends up visibly skewed at the ends of the long axis.
 */
function ellipseYaw(a: number, b: number, t: number): number {
  return Math.atan2(Math.cos(t) / a, Math.sin(t) / b);
}

/** A box placed by position + yaw, in one call, with no scratch objects leaked. */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  yaw = 0, roll = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  _e.set(0, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Merge for geometries carrying only position/normal/uv, as corridors.ts does. */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []; const nor: number[] = []; const uvs: number[] = [];
  const idx: number[] = []; let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position'); const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count * 3; i++) pos.push(p.array[i] as number);
    for (let i = 0; i < p.count * 3; i++) nor.push(n ? (n.array[i] as number) : 0);
    for (let i = 0; i < p.count * 2; i++) uvs.push(u ? (u.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}

/**
 * A quad-strip builder for the surfaces of revolution.
 *
 * The cavea is 22 concentric annuli and the arena is a fan; emitting them as
 * boxes would cost 1400 draws' worth of geometry to say something a strip says
 * in a few thousand triangles. Vertices are NEVER shared between quads, so
 * computeVertexNormals gives every face its own normal and the steps stay
 * crisp instead of smoothing into a ramp.
 */
class Strip {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private n = 0;

  quad(
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number],
  ): void {
    this.pos.push(...a, ...b, ...c, ...d);
    this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    const i = this.n;
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.n += 4;
  }

  tri(
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number],
  ): void {
    this.pos.push(...a, ...b, ...c);
    this.uv.push(0, 0, 1, 0, 1, 1);
    const i = this.n;
    this.idx.push(i, i + 1, i + 2);
    this.n += 3;
  }

  /**
   * Ring of quads between two ellipse rings, each with its own radii, height
   * and centre.
   *
   * Vertex order is out@t -> in@t -> in@u -> out@u, which puts the face normal
   * UP for a tread (same height, shrinking radius) and INWARD for a riser (same
   * radius, dropping height). Both are the faces a spectator in the bowl can
   * see, and getting the order backwards renders a bowl that is invisible from
   * inside and solid from outside.
   */
  ring(
    seg: number,
    a0: number, b0: number, y0: number,
    a1: number, b1: number, y1: number,
    cz = CZ,
  ): void {
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const u = ((i + 1) / seg) * Math.PI * 2;
      this.quad(
        [a0 * Math.cos(t), y0, cz + b0 * Math.sin(t)],
        [a1 * Math.cos(t), y1, cz + b1 * Math.sin(t)],
        [a1 * Math.cos(u), y1, cz + b1 * Math.sin(u)],
        [a0 * Math.cos(u), y0, cz + b0 * Math.sin(u)],
      );
    }
  }

  /** Solid elliptical cap, normal +Y. */
  cap(seg: number, a: number, b: number, y: number, cz = CZ): void {
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      const u = ((i + 1) / seg) * Math.PI * 2;
      this.tri(
        [0, y, cz],
        [a * Math.cos(u), y, cz + b * Math.sin(u)],
        [a * Math.cos(t), y, cz + b * Math.sin(t)],
      );
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/* ================================================================== */
/* Materials                                                           */
/*                                                                     */
/* All positional shading reads `positionLocal`, never `positionWorld`.*/
/* The hub rotates each corridor onto its own spoke, so a world-space  */
/* gradient down "the corridor axis" would point somewhere else for    */
/* every pivot angle. Local space is the corridor's own frame and the  */
/* only frame these constants mean anything in.                        */
/* ================================================================== */

/**
 * Travertine.
 *
 * Three terms and no texture: the horizontal COURSE line at exactly the tier
 * rise, so the stonework and the seating agree; a two-frequency fissure that
 * never tiles; and a grime ramp that darkens the bottom two metres of anything,
 * because rain runs down a wall and dirt collects where it stops.
 */
function createTravertine(tint = 0xbfae8e, grime = 0x6b5f4a): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.92;
  mat.metalness = 0;

  const p = positionLocal;
  const course = sin(p.y.mul((Math.PI * 2) / TIER_RISE)).mul(0.5).add(0.5);
  const f1 = p.x.mul(0.83).add(p.z.mul(0.71)).sin();
  const f2 = p.x.mul(0.29).sub(p.z.mul(0.34)).sin();
  const fissure = f1.mul(0.55).add(f2.mul(0.45)).mul(0.5).add(0.5);
  const grain = clamp(fissure.mul(0.72).add(course.mul(0.28)), float(0), float(1));

  // Everything below ARENA_Y + 2 is in the cellars and never dries out.
  const damp = float(1).sub(smoothstep(float(ARENA_Y), float(ARENA_Y + 6), p.y));
  const base = mix(rgb(tint, 0.72), rgb(tint), grain);
  mat.colorNode = mix(base, rgb(grime), damp.mul(0.55));
  mat.roughnessNode = clamp(mix(float(0.86), float(0.98), fissure), float(0), float(1));
  return mat;
}

/** Arena sand: fine grain, high roughness, warmed toward the deck edges. */
function createSandMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.97;
  mat.metalness = 0;
  const p = positionLocal;
  const grain = sin(p.x.mul(4.7)).mul(sin(p.z.mul(5.3))).mul(0.5).add(0.5);
  const drift = sin(p.x.mul(0.31).add(p.z.mul(0.27))).mul(0.5).add(0.5);
  mat.colorNode = mix(rgb(0xc8ab74), rgb(0xa1885a), drift.mul(0.7).add(grain.mul(0.3)));
  return mat;
}

/**
 * The apron.
 *
 * Blends to main.ts's own ground colour (0.23, 0.26, 0.2) across its near edge,
 * so the 38 cm step where it starts is a colour transition rather than a line.
 * Without this the desert arrives as a hard arc across the plain.
 */
function createApronMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 1;
  mat.metalness = 0;
  const p = positionLocal;
  const blend = smoothstep(float(-52), float(-26), p.z);
  const dunes = sin(p.x.mul(0.07)).mul(cos(p.z.mul(0.061))).mul(0.5).add(0.5);
  const grit = sin(p.x.mul(1.9)).mul(sin(p.z.mul(2.3))).mul(0.5).add(0.5);
  const desert = mix(rgb(0xb59a6d), rgb(0xd0b98c), dunes.mul(0.75).add(grit.mul(0.25)));
  mat.colorNode = mix(desert, vec3(0.23, 0.26, 0.2), blend);
  return mat;
}

/**
 * Pyramid casing.
 *
 * Course banding at a scale that only makes sense at this size — 4.5 m courses
 * on an 86 m face — plus the polished cap the originals still carry at the
 * apex. The cap is what tells the eye how big the thing is: it gives the
 * silhouette a second, much smaller feature to measure the whole against.
 */
function createPyramidMaterial(height: number): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.88;
  mat.metalness = 0;
  const p = positionLocal;
  const course = sin(p.y.mul((Math.PI * 2) / 4.5)).mul(0.5).add(0.5);
  const weather = sin(p.x.mul(0.043).add(p.z.mul(0.037))).mul(0.5).add(0.5);
  const body = mix(rgb(0xb59b72), rgb(0xd6c49c), course.mul(0.45).add(weather.mul(0.55)));
  const capMask = smoothstep(float(height * 0.79), float(height * 0.90), p.y);
  mat.colorNode = mix(body, rgb(0xefe4c8), capMask);
  mat.roughnessNode = mix(float(0.90), float(0.48), capMask);
  return mat;
}

/* ================================================================== */
/* The grammar                                                         */
/* ================================================================== */

/**
 * The cavea: eleven courses of stepped seating, the podium wall and the kerb.
 *
 * One quad strip, one draw. Building this out of blocks the way buildRuin does
 * would be 11 x 96 x 2 boxes for a surface nobody walks on — the block budget
 * is spent where it reads instead, on the rim and the facade.
 */
function buildCavea(strip: Strip, seg = 96): void {
  // NO KERB. See the note on TERRACE_Z: a 55 cm ring at the rim, seen from six
  // metres back at eye height 1.7, hides every depression angle past 10 degrees
  // — which is the whole bowl. The apron laps 50 cm over the top tread instead,
  // 6 cm clear of it, and that is the entire transition.
  for (let i = 0; i < TIERS; i++) {
    const aOut = RIM_A - i * TIER_RUN;
    const bOut = RIM_B - i * TIER_RUN;
    const aIn = aOut - TIER_RUN;
    const bIn = bOut - TIER_RUN;
    const y = -i * TIER_RISE;
    strip.ring(seg, aOut, bOut, y, aIn, bIn, y);                 // tread
    strip.ring(seg, aIn, bIn, y, aIn, bIn, y - TIER_RISE);       // riser
  }
  // Podium: the barrier between the lowest seats and the arena.
  strip.ring(seg, ARENA_A, ARENA_B, PODIUM_TOP, ARENA_A, ARENA_B, ARENA_Y);
}

/**
 * The hypogeum.
 *
 * The detail that makes this read as the real ruin rather than a stadium: the
 * arena floor is gone over the near half, so you are looking down into the
 * cellars — one spine wall down the long axis and transverse chambers off it,
 * standing 1.6 m proud of the cellar floor where the deck used to bear on them.
 */
function buildHypogeum(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = DECK_Y - ARENA_Y;                 // 1.6
  const y = ARENA_Y + h / 2;
  const T = 0.55;

  // Spine, down the long (x) axis.
  parts.push(box(ARENA_A * 1.82, h, T * 1.6, 0, y, CZ));

  // Transverse chambers, at the same rhythm as the seating rake.
  const N = 13;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const x = (f * 2 - 1) * ARENA_A * 0.9;
    // Chamber length follows the ellipse, so the cellars fill the floor plan.
    const k = Math.max(0, 1 - (x / (ARENA_A * 0.96)) ** 2);
    const span = ARENA_B * 0.92 * Math.sqrt(k);
    if (span < 2) continue;
    const gap = 0.55 + hash11(seed * 3.1 + i * 7.7) * 0.5;
    parts.push(box(T, h, span * gap, x, y, CZ - span * (1 - gap) * 0.5));
    parts.push(box(T, h, span * gap * 0.7, x, y, CZ + span * 0.5));
  }
  // Short chords across the grid. A pure grid reads as a car park; a broken
  // one reads as a substructure.
  for (let i = 0; i < 26; i++) {
    const t = (i / 26) * Math.PI * 2;
    const r = 0.55 + hash11(seed * 5.3 + i * 2.9) * 0.28;
    parts.push(box(
      3.6, h, T,
      ARENA_A * r * Math.cos(t), y, CZ + ARENA_B * r * Math.sin(t),
      -t,
    ));
  }
  return parts;
}

/**
 * The facade: stacked arcades, and the subtractive rule that ruins them.
 *
 * The additive half is a repeated module — pier, voussoir ring, spandrel,
 * cornice — placed at equal ANGLE around the ellipse. Equal angle rather than
 * equal arc length is deliberate: the light-shaft gate in the volumetric
 * material indexes bays as `theta * BAYS / 2pi`, so spacing the geometry the
 * same way means the beams land in the openings BY CONSTRUCTION and cannot
 * drift out of register with them.
 *
 * The subtractive half is buildRuin's survival test with one extra term: the
 * probability also falls off toward the player, so the collapse always faces
 * the terrace and the view into the bowl is open. A storey can only stand if
 * the storey beneath it survived, which is what makes the ruin fall in
 * plausible vertical runs instead of leaving arches floating in the air.
 */
function buildFacade(seed: number): THREE.BufferGeometry[] {
  const blocks: THREE.BufferGeometry[] = [];
  const bayArc = BAY_ARC;
  const OW = OPEN_W;
  const DEPTH = FAC_DEPTH;

  for (let i = 0; i < BAYS; i++) {
    const tPier = (i / BAYS) * Math.PI * 2;
    const tArch = ((i + 0.5) / BAYS) * Math.PI * 2;

    // How much this bay faces the player. The near apex of the ellipse is at
    // sin t = +1; nzHat is the z component of the true outward normal there.
    const nx = Math.cos(tPier) / FAC_A;
    const nz = Math.sin(tPier) / FAC_B;
    const nl = Math.hypot(nx, nz);
    const nearGate = Math.max(0, Math.min(1, (nz / nl - 0.08) / 0.55));

    let standing = true;
    for (let k = 0; k < STOREYS.length; k++) {
      const st = STOREYS[k];
      const a = FAC_A - st.inset;
      const b = FAC_B - st.inset;
      const survival = (1 - 0.13 * k) * (1 - 0.97 * nearGate ** 1.35);
      const alive = standing && hash11(seed * 7.3 + k * 29.1 + i * 3.7) < survival;

      const px = ellipseX(a, tPier);
      const pz = ellipseZ(b, tPier);
      const pyaw = ellipseYaw(a, b, tPier);

      if (!alive) {
        // Terminal rule for a failed bay: a broken pier stub on the storey
        // where the collapse started, and nothing above it.
        if (standing) {
          const stub = (0.18 + hash11(seed * 11.9 + i * 5.1) * 0.55) * st.height;
          blocks.push(box(PIER_W, stub, DEPTH, px, st.base + stub / 2, pz, pyaw));
          // Rubble spills OUTWARD onto the apron, which is where a wall falls.
          for (let r = 0; r < 3; r++) {
            const hr = hash11(seed * 17.3 + i * 9.7 + r * 2.3);
            const d = 4 + hr * 13;
            blocks.push(box(
              1.5 + hr, 0.7 + hr * 0.6, 1.2 + hr * 0.9,
              px + (nx / nl) * d, 0.4 + hr * 0.5, pz + (nz / nl) * d,
              pyaw + hr * 2.4, (hr - 0.5) * 0.5,
            ));
          }
        }
        standing = false;
        continue;
      }

      if (k === STOREYS.length - 1) {
        // Attic: a solid band with a pilaster, not an arcade. The grammar's
        // terminal rule, and never the same as a storey.
        blocks.push(box(bayArc * 1.02, st.height, DEPTH - 0.9,
          px, st.base + st.height / 2, pz, pyaw));
        blocks.push(box(1.2, st.height * 0.92, DEPTH + 0.3,
          px, st.base + st.height * 0.46, pz, pyaw));
        continue;
      }

      // Pier, full storey height.
      blocks.push(box(PIER_W, st.height, DEPTH, px, st.base + st.height / 2, pz, pyaw));

      // Arch, centred between this pier and the next. Built in the bay's own
      // tangent/up plane: the box() roll rotates about the outward normal, so
      // a voussoir stays in the plane of the wall however the ellipse turns.
      const ax = ellipseX(a, tArch);
      const az = ellipseZ(b, tArch);
      const ayaw = ellipseYaw(a, b, tArch);
      const tanX = Math.cos(ayaw);
      const tanZ = -Math.sin(ayaw);
      const Rm = ARCH_R;
      const spring = SPRING[k];
      const chord = 2 * Rm * Math.sin(Math.PI / (2 * VOUSSOIRS)) * 1.12;

      for (let v = 0; v < VOUSSOIRS; v++) {
        const ang = (Math.PI * (v + 0.5)) / VOUSSOIRS;
        const lx = Rm * Math.cos(ang);
        const ly = spring + Rm * Math.sin(ang);
        blocks.push(box(
          chord, 0.9, DEPTH,
          ax + tanX * lx, ly, az + tanZ * lx,
          ayaw, ang + Math.PI / 2,
        ));
      }
      // Spandrel above the arch, then the cornice that caps the storey.
      const crown = spring + Rm + 0.45;
      const cornice = st.base + st.height - 0.55;
      if (cornice - crown > 0.35) {
        blocks.push(box(OW + 0.8, cornice - crown, DEPTH,
          ax, (cornice + crown) / 2, az, ayaw));
      }
      blocks.push(box(bayArc * 1.03, 0.55, DEPTH + 0.55, px, cornice + 0.28, pz, pyaw));
      blocks.push(box(bayArc * 1.03, 0.55, DEPTH + 0.55, ax, cornice + 0.28, az, ayaw));
    }
  }
  return blocks;
}

/**
 * Rim blocks and vomitoria.
 *
 * The rim is where the eye actually reads the ruin from the terrace, so it gets
 * real blocks with the same survival test the facade uses. The vomitoria are
 * the stair runs that break the concentric rings — without them the cavea is a
 * contour map, and no amphitheatre ever looked like one.
 */
function buildRimAndStairs(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < BAYS * 2; i++) {
    const t = (i / (BAYS * 2)) * Math.PI * 2;
    const nz = Math.sin(t) / RIM_B;
    const nl = Math.hypot(Math.cos(t) / RIM_A, nz);
    const nearGate = Math.max(0, Math.min(1, (nz / nl - 0.05) / 0.6));
    for (let c = 0; c < 3; c++) {
      if (hash11(seed * 2.7 + i * 5.9 + c * 13.3) > (1 - c * 0.22) * (1 - 0.9 * nearGate)) continue;
      const jitter = (hash11(seed + i * 3 + c * 7) - 0.5) * 0.18;
      const yaw = ellipseYaw(RIM_A, RIM_B, t);
      parts.push(box(
        2.4, 0.5, 1.5,
        ellipseX(RIM_A + 1.2, t), 0.55 + 0.5 * c + 0.25, ellipseZ(RIM_B + 1.2, t),
        yaw + jitter, jitter * 0.5,
      ));
    }
  }

  // Eight stair runs, radial, stepping down with the tiers they cut.
  for (let s = 0; s < 8; s++) {
    const t = ((s + 0.5) / 8) * Math.PI * 2;
    const yaw = ellipseYaw(RIM_A, RIM_B, t);
    for (let i = 0; i < TIERS; i++) {
      const a = RIM_A - i * TIER_RUN - TIER_RUN * 0.5;
      const b = RIM_B - i * TIER_RUN - TIER_RUN * 0.5;
      const y = -i * TIER_RISE;
      for (let h = 0; h < 3; h++) {
        parts.push(box(
          3.0, TIER_RISE * 0.34, TIER_RUN * 0.36,
          ellipseX(a + (h - 1) * 0.7, t),
          y - TIER_RISE * (h + 0.5) * 0.33 + TIER_RISE * 0.17,
          ellipseZ(b + (h - 1) * 0.7, t),
          yaw,
        ));
      }
    }
  }
  return parts;
}

/** The processional way and the terrace, as one tapered ribbon of quads. */
const DECK_PROFILE: Array<[number, number]> = [
  [2, 7.0], [-16, 7.4], [-32, 8.6], [-48, 11.4], [-58, 14.6], [TERRACE_Z, 15.8],
];

function buildTerraceDeck(strip: Strip): void {
  for (let i = 0; i < DECK_PROFILE.length - 1; i++) {
    const [z0, w0] = DECK_PROFILE[i];
    const [z1, w1] = DECK_PROFILE[i + 1];
    strip.quad([-w0, 0.13, z0], [-w1, 0.13, z1], [w1, 0.13, z1], [w0, 0.13, z0]);
  }
}

/**
 * Colonnade, parapet and markers.
 *
 * The approach exists to do one job: hold the view closed until the terrace, so
 * the bowl arrives all at once. The columns narrow the frame, the parapet gives
 * the eye a near edge to measure the 17 m drop against, and the two markers
 * flanking the lip put something of known human size at the rim's distance.
 */
function buildApproach(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];

  for (let i = 0; i < 12; i++) {
    const z = -8 - i * 3.4;
    for (const side of [-1, 1]) {
      const x = side * 8.6;
      const h0 = hash11(seed * 4.7 + i * 3.3 + (side + 1) * 11);
      // Nearer the terrace the colonnade is progressively more ruined, so the
      // approach itself tells you what you are walking toward.
      const ruin = Math.max(0, (i - 4) / 9);
      const broken = h0 < ruin * 0.75;
      const h = broken ? 1.4 + h0 * 3.4 : 6.4;
      parts.push(box(1.5, 0.45, 1.5, x, 0.32, z));
      const shaft = new THREE.CylinderGeometry(0.40, 0.46, h, 12, 1, false);
      shaft.translate(x, 0.55 + h / 2, z);
      parts.push(shaft);
      if (!broken) {
        parts.push(box(1.25, 0.42, 1.25, x, 0.55 + h + 0.21, z));
        // Architrave between the pairs, so the colonnade reads as a structure.
        if (i < 11) parts.push(box(1.0, 0.6, 3.4, x, 7.7, z - 1.7));
      }
    }
  }

  // Balustrade down the SIDES of the terrace only — at 80 degrees of azimuth
  // from the standing point, so it frames without occluding. Nothing crosses
  // the lip.
  for (const side of [-1, 1]) {
    parts.push(box(0.8, 1.05, 13.0, side * 15.4, 0.66, TERRACE_Z + 7.2));
    // Marker: plinth and obelisk. Something of known human size at the rim's
    // own distance, which is what lets the eye scale the 17 m drop beyond it.
    parts.push(box(2.4, 1.2, 2.4, side * 12.4, 0.72, TERRACE_Z + 2.4));
    const ob = new THREE.ConeGeometry(1.1, 6.6, 4, 1, false);
    ob.translate(side * 12.4, 1.32 + 3.3, TERRACE_Z + 2.4);
    parts.push(ob);
  }
  return parts;
}

/**
 * The volumetric light shafts.
 *
 * The volume corridor's shafts read as a flat wash because its gate is a single
 * `smoothstep` on `abs(sin(z))`, which never closes: even at a column the
 * medium still contributes, so every ray accumulates roughly the same amount
 * and the result is fog with a slight ripple. Four things fix that here.
 *
 *  1. A SHARP ANGULAR GATE. Each sample is projected BACKWARD along the sun to
 *     the height of the arcade openings and asked which bay it lands in. The
 *     bay index is `theta * BAYS / 2pi` — the same expression buildFacade
 *     places its piers with — so the dark bands are the piers themselves and
 *     the gate closes to zero behind them instead of dimming.
 *  2. THREE OUTCOMES, NOT TWO. A back-projected ray that lands INSIDE the ring
 *     never met the facade at all: it came over the top, and gets full light.
 *     One that lands on the ring is cut by the bay pattern. One that lands
 *     outside it was stopped by the wall below the arcade and gets nothing.
 *     That third case is what actually produces a beam EDGE.
 *  3. INTERNAL STRUCTURE. A drifting three-axis product breaks the beams up so
 *     they have dust in them rather than being solid wedges.
 *  4. AXIAL FALLOFF. Density fades with perpendicular distance from the line
 *     the light travels along, so beams thin out at their edges the way real
 *     ones do instead of ending at the proxy's wall.
 *
 * `Fn` is used here, and only here, because `Loop()` needs statement scope.
 */
function createShaftMaterial(
  invWorld: any, sunLocal: any, tint: any, strength: any, clock: any,
): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.side = THREE.BackSide;
  mat.blending = THREE.AdditiveBlending;
  mat.fog = false;

  const STEPS = 26;

  mat.colorNode = Fn(() => {
    const ro = invWorld.mul(vec4(cameraPosition, 1)).xyz.toVar();
    const exit = invWorld.mul(vec4(positionWorld, 1)).xyz;
    const seg = exit.sub(ro);
    const dist = min(length(seg), float(320));
    const rd = normalize(seg).toVar();
    const S = normalize(sunLocal).toVar();
    const stepLen = dist.div(float(STEPS));

    const acc = float(0).toVar();
    const t = stepLen.mul(0.5).toVar();

    Loop(STEPS, () => {
      const p = ro.add(rd.mul(t));

      // --- the medium: height fog, confined to the bowl -----------------
      const ex = p.x.div(float(RIM_A * 1.06));
      const ez = p.z.sub(float(CZ)).div(float(RIM_B * 1.06));
      const e = sqrt(ex.mul(ex).add(ez.mul(ez)));
      const inBowl = float(1).sub(smoothstep(float(0.80), float(1.03), e));
      // 0.030 per metre, not the volume corridor's 0.09. Its rays cross about
      // 20 m of medium; these cross a hundred, and at 0.09 the integral hits
      // the clamp before a ray has left the bowl — every beam the same flat
      // white, which is a wash by another route. shaftStrength is the knob.
      const dens = exp(p.y.sub(float(ARENA_Y)).mul(-0.085)).mul(inBowl).mul(0.030);

      // --- the gate: where does the ray back to the sun leave the ring? --
      //
      // Not a fixed sampling height. The first version projected back to the
      // middle of the storey-1 openings and asked whether the result was
      // inside the ring, and at the sky's real sun elevation (16-55 deg) the
      // answer was "inside" for every sample in the bowl — the ray actually
      // leaves through storey TWO. That gate reported open sky everywhere and
      // produced exactly the flat wash this corridor exists to beat.
      //
      // So solve it properly: intersect the backward ray with the facade's
      // elliptical cylinder. It is one quadratic, the exit root is unique
      // because the sample is inside the ring, and it gives both the angle
      // (which bay) and the height (which storey, and how far up the arch).
      const ox = p.x.div(float(FAC_A));
      const oz = p.z.sub(float(CZ)).div(float(FAC_B));
      const dx = S.x.div(float(FAC_A));
      const dz = S.z.div(float(FAC_B));
      const qa = max(dx.mul(dx).add(dz.mul(dz)), float(1e-7));
      const qb = ox.mul(dx).add(oz.mul(dz)).mul(2);
      const qc = ox.mul(ox).add(oz.mul(oz)).sub(1);
      const disc = sqrt(max(qb.mul(qb).sub(qa.mul(qc).mul(4)), float(0)));
      const hit = disc.sub(qb).div(qa.mul(2));

      const wx = ox.add(dx.mul(hit));
      const wz = oz.add(dz.mul(hit));
      const yh = p.y.add(S.y.mul(hit));

      // Which bay. atan(y, x) is atan2, and on the unit-normalised ellipse it
      // returns the very parametric angle buildFacade placed its piers at, so
      // an integer bay index IS a pier and a half-integer IS an opening.
      const d = abs(fract(atan(wz, wx).mul(float(BAYS / (Math.PI * 2)))).sub(float(0.5)));

      // Which storey, and the clear half-width of the opening at that height:
      // full below the springing, then the arch closing it down to nothing at
      // the crown. This is what gives a beam its ROUNDED top instead of a
      // rectangular one, and it comes out of ARCH_R for free.
      const upper = smoothstep(float(STOREYS[1].base - 1.0), float(STOREYS[1].base + 1.0), yh);
      const spring = mix(float(SPRING[0]), float(SPRING[1]), upper);
      const sill = mix(float(STOREY_FLOOR[0]), float(STOREY_FLOOR[1]), upper);
      const dyp = max(yh.sub(spring), float(0));
      const halfW = min(
        float(OPEN_W / 2),
        sqrt(max(float(ARCH_R * ARCH_R).sub(dyp.mul(dyp)), float(0))),
      );
      const hw = max(halfW.div(float(BAY_ARC)), float(0.006));
      const slot = float(1).sub(smoothstep(hw.mul(0.55), hw.mul(1.02), d));

      const above = smoothstep(sill.sub(float(0.4)), sill.add(float(0.4)), yh);
      const overTop = smoothstep(float(FAC_TOP - 0.7), float(FAC_TOP + 0.9), yh);
      const through = above.mul(slot).mul(float(1).sub(overTop));
      const gate = clamp(overTop.add(through), float(0), float(1));

      // --- axial falloff -------------------------------------------------
      const w = p.sub(vec3(0, ARENA_Y, CZ));
      const perp = w.sub(S.mul(dot(w, S)));
      const axial = float(1).sub(smoothstep(float(46), float(92), length(perp)));

      // --- internal structure -------------------------------------------
      const n1 = sin(p.x.mul(0.51).add(clock.mul(0.13)));
      const n2 = cos(p.z.mul(0.43).sub(clock.mul(0.09)));
      const n3 = sin(p.y.mul(0.73).add(clock.mul(0.17)));
      const dust = float(0.64).add(n1.mul(n2).mul(n3).mul(0.36));

      acc.addAssign(dens.mul(gate).mul(axial).mul(dust).mul(stepLen));
      t.addAssign(stepLen);
    });

    return tint.mul(clamp(acc.mul(strength), float(0), float(1.2)));
  })();

  return mat;
}

/* ================================================================== */
/* The corridor                                                        */
/* ================================================================== */

export interface ColosseumOptions {
  seed?: number;
  /**
   * The live world-space sun direction — pass `sky.sunDirection` from main.ts
   * and the shafts, the shadow-casting key light and the horizon glow all track
   * the visible sun forever, because it is the same mutated object.
   *
   * Omitted, the corridor uses a fixed low sun down its own axis, which is what
   * the composition below was framed against.
   */
  sunDirection?: THREE.Vector3;
  /** Live sun tint; same story. */
  sunColor?: THREE.Color;
}

export function createColosseumCorridor(options: ColosseumOptions = {}): Corridor {
  const seed = options.seed ?? 91;
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  /* --- uniforms ------------------------------------------------------- */
  const clock = uniform(0);
  // World -> corridor-local. The march has to happen in world space because
  // cameraPosition and positionWorld are world space, but every constant in the
  // dimension table is corridor-local, so each sample is brought home first.
  const invWorld = uniform(new THREE.Matrix4());
  const sunLocal = uniform(new THREE.Vector3(0.20, 0.34, -0.92).normalize());
  const shaftTint = uniform(new THREE.Color(1.0, 0.80, 0.52));
  const shaftStrength = uniform(1.0);
  const hazeGlow = uniform(0.62);

  /* --- materials ------------------------------------------------------ */
  const stoneMat = createTravertine(0xc3b193, 0x6d6150);
  const caveaMat = createTravertine(0xb1a184, 0x5f5647);
  const cellarMat = createTravertine(0x8e836c, 0x453f34);
  const sandMat = createSandMaterial();
  const apronMat = createApronMaterial();
  // ShapeGeometry's winding is normalised by three, not by us, so the apron is
  // double sided rather than a coin flip on whether the ground faces up.
  apronMat.side = THREE.DoubleSide;
  const pyramidMat = createPyramidMaterial(86);
  disposables.push(stoneMat, caveaMat, cellarMat, sandMat, apronMat, pyramidMat);

  const add = (
    geo: THREE.BufferGeometry, mat: THREE.Material,
    order: number, cast: boolean, receive: boolean,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.renderOrder = order;
    group.add(mesh);
    disposables.push(geo);
    return mesh;
  };

  /* --- 1. the cavity eraser ------------------------------------------- */
  //
  // renderOrder 1, after the shared ground and before everything of ours.
  // colorWrite off, depthTest off: it paints nothing and stamps the FAR depth
  // of the excavation over the ground's. FrontSide with the strip's inward
  // normals renders exactly the far wall and the floor of the cavity, so each
  // ray writes the depth at which it LEAVES the hole and everything inside then
  // passes an ordinary depth test. Without this the whole bowl is hidden behind
  // main.ts's 600 m ground plane and the corridor is a flat field.
  {
    const s = new Strip();
    const floorY = ARENA_Y - 2.5;
    // A metre wider than the apron's hole and starting 10 cm BELOW the apron,
    // so it is coplanar with nothing. Coplanar with the kerb it would stamp an
    // equal depth there and the equality would fail the Less test, taking a
    // band out of the near rim.
    s.ring(96, RIM_A + 1.9, RIM_B + 1.9, -0.10, RIM_A + 1.9, RIM_B + 1.9, floorY);
    s.cap(96, RIM_A + 1.9, RIM_B + 1.9, floorY);
    const eraserMat = new MeshBasicNodeMaterial();
    eraserMat.colorWrite = false;
    eraserMat.depthTest = false;
    eraserMat.depthWrite = true;
    eraserMat.side = THREE.FrontSide;
    eraserMat.fog = false;
    disposables.push(eraserMat);
    const mesh = add(s.build(), eraserMat, 1, false, false);
    mesh.frustumCulled = false;
  }

  /* --- 2. the bowl ----------------------------------------------------- */
  {
    const s = new Strip();
    buildCavea(s);
    add(s.build(), caveaMat, 2, false, true);
  }
  {
    // Arena floor (the cellar floor) plus the surviving sand deck over the far
    // half, with a skirt so the deck has a visible thickness where it has been
    // broken away. The exposed half is the whole point of the hypogeum.
    const s = new Strip();
    s.cap(80, ARENA_A, ARENA_B, ARENA_Y);
    const DA = ARENA_A * 0.66;
    const DB = ARENA_B * 0.62;
    const DZ = CZ - 10.5;
    s.cap(64, DA, DB, DECK_Y, DZ);
    // Low ring first so the broken edge of the deck faces OUT, at the player.
    s.ring(64, DA, DB, DECK_Y - 0.55, DA, DB, DECK_Y, DZ);
    add(s.build(), sandMat, 2, false, true);
  }
  {
    const parts = buildHypogeum(seed);
    const geo = mergeSimple(parts);
    parts.forEach((g) => g.dispose());
    add(geo, cellarMat, 2, true, true);
  }

  /* --- 3. the apron ---------------------------------------------------- */
  //
  // One ShapeGeometry with an elliptical hole at the bowl mouth. The hole is
  // why the eraser's overdraw never leaks onto the plain: everything outside
  // the excavation is repainted by this, at normal depth, after the bowl.
  {
    const shape = new THREE.Shape();
    const pts: THREE.Vector2[] = [];
    APRON_PROFILE.forEach(([z, hw]) => pts.push(new THREE.Vector2(hw, -z)));
    for (let i = APRON_PROFILE.length - 1; i >= 0; i--) {
      pts.push(new THREE.Vector2(-APRON_PROFILE[i][1], -APRON_PROFILE[i][0]));
    }
    shape.setFromPoints(pts);
    // The hole is 50 cm INSIDE the rim, so the apron laps over the cavea's top
    // tread rather than butting it. Butted, the two edges are coincident in
    // plan and 6 cm apart in height, which is a hairline you can see the void
    // through from a shallow angle.
    const hole = new THREE.Path();
    hole.absellipse(0, -CZ, RIM_A - 0.5, RIM_B - 0.5, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 80);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.06, 0);
    add(geo, apronMat, 3, false, true);
  }

  /* --- 4. the structure ------------------------------------------------ */
  {
    const parts = [
      ...buildFacade(seed),
      ...buildRimAndStairs(seed),
      ...buildApproach(seed),
    ];
    const geo = mergeSimple(parts);
    parts.forEach((g) => g.dispose());
    add(geo, stoneMat, 3, true, true);
  }
  {
    const s = new Strip();
    buildTerraceDeck(s);
    add(s.build(), stoneMat, 3, false, true);
  }

  /* --- 5. the pyramids -------------------------------------------------- */
  //
  // Placed and scaled deliberately: 86 m tall, 136 m across the base, 188 m
  // from the terrace. That subtends 24 degrees of elevation against an arcade
  // that subtends 9, so the silhouette says "enormous, and much further away"
  // before any shading does. main.ts's linear fog reaches 320 m, which puts
  // them at about half haze — the aerial perspective is doing the distance
  // work, so they must NOT be pushed past 265 m where the sky dome ends.
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const g = new THREE.ConeGeometry(96, 86, 4, 1, false);
      g.translate(side * 122, 43, -198);
      parts.push(g);
    }
    const geo = mergeSimple(parts);
    parts.forEach((g) => g.dispose());
    add(geo, pyramidMat, 3, false, false);
  }

  /* --- 6. the horizon glow --------------------------------------------- */
  //
  // The gap between the pyramids is the composition's vanishing point, so it
  // gets a light of its own: an additive wash, unfogged, behind the pyramids
  // and in front of the dome. It brightens as the sky's sun swings onto this
  // corridor's axis, which is what makes the sweep read as a sunset arriving
  // rather than a light source teleporting.
  {
    const hazeMat = new MeshBasicNodeMaterial();
    hazeMat.transparent = true;
    hazeMat.depthWrite = false;
    hazeMat.blending = THREE.AdditiveBlending;
    hazeMat.fog = false;
    hazeMat.side = THREE.DoubleSide;
    {
      const p = positionLocal;
      const dx = p.x.div(float(118));
      const dy = p.y.add(float(30)).div(float(74));
      const r = sqrt(dx.mul(dx).add(dy.mul(dy)));
      const core = float(1).sub(smoothstep(float(0), float(1), r));
      const body = core.mul(core);
      hazeMat.colorNode = mix(rgb(0xff9a45), rgb(0xfff0cc), body.mul(body))
        .mul(body)
        .mul(hazeGlow)
        .mul(0.6);
    }
    disposables.push(hazeMat);
    // 263 m from the world origin: inside sky.ts's 265 m dome, and well inside
    // main.ts's 400 m far plane even from the far end of another corridor.
    const geo = new THREE.PlaneGeometry(430, 210);
    geo.translate(0, 52, -240);
    const mesh = add(geo, hazeMat, -700, false, false);
    mesh.frustumCulled = false;
  }

  /* --- 7. the light shafts --------------------------------------------- */
  //
  // The proxy is a cone that FITS INSIDE the excavation rather than a box that
  // contains it. A BackSide box big enough to hold the bowl has its back faces
  // buried in the cavea, so they depth-fail and the beams vanish exactly where
  // they matter. This cone's far wall sits about two metres in front of the
  // seating at every height, so it is always visible, and its floor sits 60 cm
  // above the cellar floor.
  const shaftMat = createShaftMaterial(invWorld, sunLocal, shaftTint, shaftStrength, clock);
  disposables.push(shaftMat);
  {
    const H = 24 - (ARENA_Y + 0.6);
    const geo = new THREE.CylinderGeometry(1, 0.55, H, 48, 1, false);
    geo.scale(60, 1, 52);
    geo.translate(0, (24 + ARENA_Y + 0.6) / 2, CZ);
    const mesh = add(geo, shaftMat, 6, false, false);
    mesh.frustumCulled = false;
  }

  /* --- 8. the key light ------------------------------------------------- */
  //
  // A SpotLight, not a second DirectionalLight: a directional light is global
  // and would relight all six other corridors from this one's sun. A spot's
  // cone contains the amphitheatre and nothing else, and with decay 0 it does
  // not fall off across the 130 m bowl. It exists so the arcade throws REAL
  // shadow bars onto the cavea in the same places the marched beams land —
  // the shafts and the shadows are then two views of one arcade, which is the
  // whole difference between light in a scene and light on top of one.
  const key = new THREE.SpotLight(0xffd9a8, 4.4, 420, 0.40, 0.42, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  key.shadow.camera.near = 120;
  key.shadow.camera.far = 380;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.08;
  key.target.position.set(0, ARENA_Y, CZ);
  group.add(key);
  group.add(key.target);

  /* --- update ----------------------------------------------------------- */
  const _inv = new THREE.Matrix4();
  const _sunL = new THREE.Vector3();
  const _sunW = new THREE.Vector3();
  const DEFAULT_SUN_LOCAL = new THREE.Vector3(0.20, 0.34, -0.92).normalize();

  return {
    group,
    length: LEN,
    title: 'Colosseum overlook — arcade grammar and volumetric light',
    skill: 'webgpu-tsl-arena-forging',

    update(elapsed) {
      (clock as unknown as { value: number }).value = elapsed;

      group.updateWorldMatrix(true, false);
      _inv.copy(group.matrixWorld).invert();
      (invWorld as unknown as { value: THREE.Matrix4 }).value.copy(_inv);

      // The sun arrives in world space and every constant here is local, so it
      // is rotated home. transformDirection uses the upper 3x3 and normalises,
      // which is exactly right for a direction and wrong for a point.
      if (options.sunDirection) {
        _sunL.copy(options.sunDirection).transformDirection(_inv);
      } else {
        _sunL.copy(DEFAULT_SUN_LOCAL);
      }
      if (_sunL.y < 0.12) _sunL.y = 0.12;
      _sunL.normalize();
      (sunLocal as unknown as { value: THREE.Vector3 }).value.copy(_sunL);

      // Alignment: 1 when the sun's azimuth is straight down the corridor and
      // behind the amphitheatre, 0 when it is behind the player. Both the beam
      // strength and the horizon glow key off this one number, so they can
      // never disagree about where the light is coming from.
      const azi = Math.hypot(_sunL.x, _sunL.z) || 1e-3;
      const align = Math.max(0, -_sunL.z / azi);
      const low = 1 - Math.min(1, _sunL.y / 0.85);
      // Strongest with a LOW sun behind the arcade, which is the only geometry
      // that makes shafts at all. At 55 degrees every back-projected ray leaves
      // the ring above the facade, the gate opens everywhere and the medium
      // would be a flat wash — so it drops to a faint haze instead, which is
      // both physically right and the failure this corridor exists to avoid.
      (shaftStrength as unknown as { value: number }).value =
        0.26 + 1.35 * align * align * Math.pow(low, 0.7);
      (hazeGlow as unknown as { value: number }).value = 0.22 + 0.78 * align * align;

      // Park the key light on the sun's own ray, 260 m out, aimed at the arena.
      _sunW.copy(_sunL).multiplyScalar(260);
      key.position.set(_sunW.x, _sunW.y + ARENA_Y, _sunW.z + CZ);
      if (options.sunColor) {
        key.color.copy(options.sunColor);
        (shaftTint as unknown as { value: THREE.Color }).value
          .copy(options.sunColor).lerp(new THREE.Color(1.0, 0.72, 0.42), 0.45);
      }
    },

    dispose() {
      key.dispose();
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
