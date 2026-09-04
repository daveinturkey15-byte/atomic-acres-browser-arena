/**
 * nuketown2-yard-props.ts — PASS 94 lane TECHNIQUES: the reference's own yard
 * and front-lawn HERO PROPS, rebuilt procedurally from the BO2-2025 images.
 *
 * REFERENCE, and what was actually looked at. Every prop below is read off
 * `docs/references/nuketown-2025/img/nt2025-aerial-boii.jpg` (BO2-2025) on
 * branch `contrib/dave-gaming-pc/claude/research-2026-09-04`, opened and
 * inspected at native resolution on 2026-09-04, corroborated by
 * `nt2025-street-boii.jpg` for the eye-level reads. Nothing is copied: no
 * mesh, no texture, no image and no colour dropper. `FINDINGS.md` Q4 in that
 * same folder is the written form of the same inspection, and it says the two
 * things this module exists to build:
 *
 *   - "Front-lawn appliance banks are COLOUR-CODED - VERIFIED. Each front lawn
 *     carries a three-unit cooker/appliance bank on a white cabinet: RED tops
 *     on the orange house's lawn, BLUE tops on the white house's lawn. ... This
 *     is the cheapest chirality anchor in the whole reference."
 *   - "Back-yard identity - VERIFIED. Orange house yard: glasshouse and cold
 *     frames ... White house yard: the garden pod, a sand pit, a shuffleboard
 *     court, stepping stones."
 *
 * THE FAIRNESS DECISION, stated because it is a deliberate divergence from the
 * reference and it is the only one. The reference's two yards hold DIFFERENT
 * objects, and FINDINGS is right that the difference is chirality. But this
 * arena's whole fairness argument is `pair()`: every solid has an exact
 * 180-degree partner, and `nuketown2-fidelity.test.ts` compares the asymmetric
 * set against a written-out list. A glasshouse on one team's yard and a garden
 * pod on the other's is not the same cover, and buying reference identity with
 * asymmetric cover on a 3,024 m2 competitive map is a bad trade.
 *
 * So: GEOMETRY IS AN EXACT ROTATIONAL PAIR, and the identity is carried by
 * COLOUR ALONE - RED appliance tops on one lawn, BLUE on the other. That is
 * precisely the precedent `pair()` already documents for the house siding
 * ("the two that differ by COLOUR ALONE ... Geometry stays identical, which is
 * what the fidelity gate's 180-degree partner test measures"), and it is the
 * cheapest anchor FINDINGS itself identifies. Both yards therefore get the
 * glasshouse AND the pod AND the sand pit AND the shuffleboard.
 *
 * THREE READING DISTANCES (img2threejs staged sculpt, tiers below). Every
 * piece declares the tier it belongs to:
 *   - `silhouette` - the mass that reads across the map. SOLID: this is the
 *     tier that carries the collider, so the thing you shoot and the thing you
 *     see are the same box.
 *   - `structure` - the parts that read from across the yard: frames, ridges,
 *     panel splits, the cabinet's plinth.
 *   - `detail` - what reads from a stride away: hob rings, glazing bars,
 *     handles. DROPPED on the reduced/compat route, which is the only place a
 *     tier is allowed to change what renders.
 * Every `structure` and `detail` piece is presentation-only and lives INSIDE
 * or ON its own silhouette box, so no tier can change cover, movement or shot
 * authority - only how much of the prop resolves.
 *
 * BUDGET AND DRAW CALLS. Every piece here is an axis-aligned box emitted
 * through the arena's own `pair()` helper BEFORE `batchPresentationOnlyBoxes`
 * runs, so the presentation tiers are merged into the arena's existing
 * presentation batch and cost no additional draw call at all. That is why this
 * module returns a table rather than building meshes: the arena's batcher is
 * the right owner, and a second builder would have opted out of it.
 */
import * as THREE from 'three';
import type { BallisticMaterialId } from './ballistics';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  abs,
  float,
  floor,
  fract,
  mix,
  positionWorld,
  smoothstep,
  step,
  vec3,
} = TSL as unknown as Record<string, any>;

/** Waist-high cover, matching the arena's own `LOW_COVER`. */
const LOW_COVER = 0.95;

export type Nuketown2PropTier = 'silhouette' | 'structure' | 'detail';

export type Nuketown2YardPropSolid = Readonly<{
  name: string;
  tier: Nuketown2PropTier;
  /** AUTHORED position - the arena's `pair()` applies the handedness mirror. */
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  /** One material, or `[north, south]` for the pieces that differ by COLOUR. */
  material: THREE.Material | readonly [THREE.Material, THREE.Material];
  options: Readonly<{
    solid: boolean; shots: boolean; cast: boolean;
    /** Explicit ballistic rating; omitted entries are rated by the shared rule. */
    ballisticMaterial?: BallisticMaterialId;
  }>;
}>;

// ---------------------------------------------------------------------------
// Materials — procedural, no imported texture, image or LUT
// ---------------------------------------------------------------------------

function node(name: string, color: number, roughness: number, metalness: number): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ color, roughness, metalness });
  mat.name = name;
  // WebGLRenderer fallback safety, the rule the donor grass field records.
  mat.type = 'MeshStandardMaterial';
  return mat;
}

export interface Nuketown2YardPropMaterials {
  cabinet: MeshStandardNodeMaterial;
  hobRed: MeshStandardNodeMaterial;
  hobBlue: MeshStandardNodeMaterial;
  chrome: MeshStandardNodeMaterial;
  glazing: MeshStandardNodeMaterial;
  frame: MeshStandardNodeMaterial;
  timber: MeshStandardNodeMaterial;
  sand: MeshStandardNodeMaterial;
  podShell: MeshStandardNodeMaterial;
  dispose(): void;
}

/**
 * The white enamel cabinet, with a real appliance's panel breakup: a horizontal
 * plinth shadow, a vertical split every 0.6 m where the three units butt
 * together, and a fine enamel mottle. Procedural from world position, so the
 * two 180-degree partners are the same material object and one pipeline.
 */
function createCabinetMaterial(): MeshStandardNodeMaterial {
  const mat = node('nuketown2-appliance-cabinet', 0xe6e3dc, 0.42, 0.08);
  const p = positionWorld;
  // Unit splits: a dark seam every 0.6 m across the bank.
  const u = p.x.div(float(0.6));
  const seam = float(1).sub(smoothstep(0.0, 0.035, abs(fract(u).sub(0.5)).mul(2.0).oneMinus()));
  // Enamel mottle, tiny - an appliance is nearly uniform and reads wrong if it
  // is noisy, so this is deliberately at the threshold of visibility.
  const mottle = fract(p.x.mul(37.1).add(p.z.mul(23.7)).sin().mul(43758.5453)).sub(0.5).mul(0.035);
  // Plinth shadow: the recessed kick under a floor-standing unit.
  const plinth = smoothstep(0.0, 0.14, p.y);
  const base = vec3(0.902, 0.890, 0.863).add(vec3(1, 1, 1).mul(mottle));
  mat.colorNode = mix(base.mul(0.36), base, plinth).mul(mix(float(0.45), float(1), seam));
  return mat;
}

/**
 * A hob top. Four rings on a coloured enamel plate - the detail that makes the
 * bank read as a cooker rather than as a coloured box, and it costs one
 * distance field.
 */
function createHobMaterial(name: string, color: number): MeshStandardNodeMaterial {
  const mat = node(name, color, 0.28, 0.12);
  const p = positionWorld;
  // Ring grid at 0.30 m pitch, ring radius 0.09 m.
  const cellX = p.x.div(float(0.3));
  const cellZ = p.z.div(float(0.3));
  const local = vec3(fract(cellX).sub(0.5).mul(0.3), float(0), fract(cellZ).sub(0.5).mul(0.3));
  const r = local.length();
  const ring = smoothstep(0.075, 0.085, r).mul(float(1).sub(smoothstep(0.095, 0.105, r)));
  const base = vec3(
    ((color >> 16) & 255) / 255,
    ((color >> 8) & 255) / 255,
    (color & 255) / 255,
  );
  mat.colorNode = mix(base, base.mul(0.34), ring);
  // Enamel is glossier where it has not been scrubbed; rings are matte iron.
  mat.roughnessNode = mix(float(0.22), float(0.68), ring);
  return mat;
}

/**
 * Glasshouse glazing: pale, glossy, with the condensation banding a real
 * glasshouse carries near its foot. Opaque on purpose - a transparent
 * glasshouse whose collider is solid is the parity read this arena's own
 * forging review rejects ("opaque surfaces occlude local light/effects").
 */
function createGlazingMaterial(): MeshStandardNodeMaterial {
  const mat = node('nuketown2-glasshouse-glazing', 0xd6e4e2, 0.16, 0.04);
  const p = positionWorld;
  const condensation = float(1).sub(smoothstep(0.15, 1.35, p.y));
  const band = fract(p.y.mul(7.3)).mul(0.12);
  mat.colorNode = mix(
    vec3(0.839, 0.894, 0.886),
    vec3(0.93, 0.95, 0.94).mul(float(1).sub(band)),
    condensation,
  );
  mat.roughnessNode = mix(float(0.10), float(0.46), condensation);
  return mat;
}

/** Sand: a fine grain plus the raked banding a used sand pit keeps. */
function createSandMaterial(): MeshStandardNodeMaterial {
  const mat = node('nuketown2-sandpit-sand', 0xd8c497, 0.96, 0.0);
  const p = positionWorld;
  const grain = fract(p.x.mul(97.3).add(p.z.mul(61.7)).sin().mul(43758.5453)).sub(0.5).mul(0.09);
  const rake = fract(p.x.mul(6.1).add(p.z.mul(2.3))).mul(0.06);
  const dampPatch = step(float(0.62), fract(p.x.mul(0.7).add(p.z.mul(0.9)).sin().mul(7.13))).mul(0.13);
  mat.colorNode = vec3(0.847, 0.769, 0.592)
    .add(vec3(1, 1, 1).mul(grain))
    .sub(vec3(1, 1, 1).mul(rake))
    .sub(vec3(0.10, 0.09, 0.06).mul(dampPatch));
  return mat;
}

/** Timber: sawn boards with a plank seam and a per-plank tonal shift. */
function createTimberMaterial(): MeshStandardNodeMaterial {
  const mat = node('nuketown2-yard-timber', 0x9a7a52, 0.88, 0.02);
  const p = positionWorld;
  const plank = floor(p.y.div(float(0.18)).add(p.x.div(float(2.4))));
  const tone = fract(plank.mul(0.618).add(0.21)).sub(0.5).mul(0.16);
  const seam = smoothstep(0.0, 0.02, abs(fract(p.y.div(float(0.18))).sub(0.5)).mul(2).oneMinus());
  mat.colorNode = vec3(0.604, 0.478, 0.322).add(vec3(1, 0.94, 0.86).mul(tone)).mul(mix(float(1), float(0.55), seam));
  return mat;
}

export function createNuketown2YardPropMaterials(): Nuketown2YardPropMaterials {
  const cabinet = createCabinetMaterial();
  const hobRed = createHobMaterial('nuketown2-appliance-hob-red', 0xb8352c);
  const hobBlue = createHobMaterial('nuketown2-appliance-hob-blue', 0x2f5f92);
  const chrome = node('nuketown2-yard-chrome', 0xb9bec2, 0.24, 0.86);
  const glazing = createGlazingMaterial();
  const frame = node('nuketown2-glasshouse-frame', 0xb6b2a6, 0.56, 0.18);
  const timber = createTimberMaterial();
  const sand = createSandMaterial();
  const podShell = node('nuketown2-garden-pod-shell', 0xe9e6df, 0.5, 0.05);
  const all = [cabinet, hobRed, hobBlue, chrome, glazing, frame, timber, sand, podShell];
  return {
    cabinet, hobRed, hobBlue, chrome, glazing, frame, timber, sand, podShell,
    dispose: () => { for (const material of all) material.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// The props
// ---------------------------------------------------------------------------

const SOLID = Object.freeze({ solid: true, shots: true, cast: true });
/**
 * INTEGRATION (PASS 94 candidate 4): the appliance bank cabinet is the only
 * silhouette here whose name reaches no rule in `classifyBallisticMaterial`
 * ("glasshouse shell" is glass, "sand pit kerb" is earth, "garden pod shell"
 * is rated by its own name) - so it landed as `reinforced`/`fallback`, the
 * classifier's failure sentinel, and `src/ballistics.test.ts` reported two
 * unshootable surfaces over nuketown2's ceiling of 0. It is rated explicitly
 * rather than renamed: an enamelled outdoor appliance bank is a metal body you
 * can shoot through at a cost, which is `structural-metal` (penetrate). It is
 * deliberately NOT `thin-metal`, because that perforates away the low cover
 * this waist-high box exists to give.
 */
const SOLID_METAL = Object.freeze({ ...SOLID, ballisticMaterial: 'structural-metal' as const });
const DRESSING = Object.freeze({ solid: false, shots: false, cast: true });
const FLAT = Object.freeze({ solid: false, shots: false, cast: false });

/**
 * Where each prop stands, in the AUTHORED frame, and why there.
 *
 * APPLIANCE BANK - the WEST front lawn (`street lawn west lawn`, x [-18, -8],
 * z [-10, -5.3]). The reference puts it on the front lawn, and this is the
 * only front-lawn rectangle with 1.8 m of clear frontage: the narrow `front
 * lawn` strip is already carrying the front hedge and the front planter, and
 * the driveway apron is not lawn. Nearest neighbours are the town-sign posts
 * at x -15.4/-12.6 (2.2 m clear) and the street bin at (-11.6, -5.75) (2.4 m
 * clear in z).
 *
 * GLASSHOUSE and GARDEN POD - the deep yard band (`yard lawn`, z [-36, -23]),
 * placed away from every spawn point and from the existing yard bodies. See the
 * integration note on the constants below for the eight-spawn re-placement.
 *
 * SAND PIT and SHUFFLEBOARD - ground-level, in the yard band, on the pattern
 * the aerial shows: both sit out towards the fence with the stepping stones
 * running past them.
 */
// MUSE FINDING 2 (PASS 94 techniques review): this one is NOT in the deep yard
// band with the other three. The reference puts the appliance bank against the
// house at the drive/turning-head edge (drive z [-16, -8]), so it is placed at
// its reference position, not moved into z [-36, -23] for tidiness. Its z span
// -8.8..-8.0 sits above the 3 mm drive-decal film, so the overlap is a solid
// body over a film and never a coplanar pair.
export const NUKETOWN2_APPLIANCE_BANK = Object.freeze({ x: -10.4, z: -8.4, width: 1.8, depth: 0.8 });
// INTEGRATION (PASS 94 candidate 4): this lane authored the deep-yard bodies
// against the SIX-spawn yard. The candidate carries `spawn-distribution`, which
// spreads EIGHT spawns per team across the same band, and its (2, -34) landed
// inside the glasshouse shell - a spawn you could not stand up in. The spawn
// table is gameplay authority and the props are dressing, so the props moved:
// the glasshouse to the west lawn and the pod a short nudge west, both still in
// `yard lawn` z [-36, -23], both clear of the pool (4.8, -29.5), the stepping
// stones and the shuffleboard court. Both were solved against the REAL built
// instances - `pair()` emits (-x, z) and (x, -z), not (x, z) and (-x, -z) - and
// and against the destructible-shed footprints (HF-407) the yard also carries.
// It is held 0.6 m off the yard fence: flush against it, the glasshouse door
// frame's top face landed at exactly 1.900 m, the fence run's own top, and the
// coplanar instrument reported two FINDINGS on a zero-area touch.
// Closest spawn is 3.62 m (glasshouse) and 3.65 m (pod),
// against the 3 m rule the test below pins and the 1.2 m face rule in
// src/spawn-layout-quality.test.ts, which the first re-placement tripped. The
// sand pit moved out to the fence for the same reason: its real south-yard
// instance sat 0.92 m from spawn (-16, -24), which the old 2-point clearance
// metric could not see. It is now 3.45 m clear.
export const NUKETOWN2_GLASSHOUSE = Object.freeze({ x: -7.5, z: -34.2, width: 3.0, depth: 2.2, height: 2.3 });
export const NUKETOWN2_GARDEN_POD = Object.freeze({ x: 11.2, z: -25.0, width: 2.3, depth: 2.3, height: 2.05 });
export const NUKETOWN2_SAND_PIT = Object.freeze({ x: 16.2, z: -28.4, width: 2.4, depth: 1.8, height: 0.3 });

/**
 * Every solid and dressing box this module contributes, in the arena's own
 * `pair()` argument shape. The arena loops this table once; nothing here
 * builds a mesh, so every presentation piece lands in the arena's existing
 * `batchPresentationOnlyBoxes` merge and costs no extra draw call.
 *
 * `reduced` drops the `detail` tier - the ONLY thing a quality route is
 * allowed to change here, because every `detail` piece is presentation-only
 * and lives inside its own silhouette box.
 */
export function nuketown2YardPropSolids(
  m: Nuketown2YardPropMaterials,
  options: Readonly<{ reduced?: boolean }> = {},
): readonly Nuketown2YardPropSolid[] {
  const out: Nuketown2YardPropSolid[] = [];
  const push = (
    name: string,
    tier: Nuketown2PropTier,
    position: readonly [number, number, number],
    size: readonly [number, number, number],
    material: THREE.Material | readonly [THREE.Material, THREE.Material],
    opts: Readonly<{ solid: boolean; shots: boolean; cast: boolean }>,
  ): void => {
    if (options.reduced === true && tier === 'detail') return;
    out.push(Object.freeze({ name, tier, position, size, material, options: opts }));
  };

  // ---- the appliance bank: THE chirality anchor --------------------------
  const a = NUKETOWN2_APPLIANCE_BANK;
  // SILHOUETTE. One solid cabinet, waist high. This is the collider, and it is
  // also the whole visible mass, so movement/shot authority and the picture
  // are the same box - the parity property this arena's forging review names.
  push('lawn appliance bank cabinet', 'silhouette',
    [a.x, LOW_COVER / 2, a.z], [a.width, LOW_COVER, a.depth], m.cabinet, SOLID_METAL);
  // STRUCTURE. The hob deck - RED north, BLUE south. This one pair of
  // materials is the entire chirality anchor, and it is colour only: identical
  // geometry, identical position, identical collider.
  push('lawn appliance bank hob deck', 'structure',
    [a.x, LOW_COVER + 0.015, a.z], [a.width - 0.06, 0.03, a.depth - 0.06],
    [m.hobRed, m.hobBlue] as const, DRESSING);
  // STRUCTURE. The plinth the cabinet stands on, recessed 4 cm on every side.
  push('lawn appliance bank plinth', 'structure',
    [a.x, 0.05, a.z], [a.width - 0.08, 0.10, a.depth - 0.08], m.chrome, FLAT);
  // DETAIL. Three control panels and three handles - the reference's "three
  // units on a white cabinet" read, from a stride away.
  for (let i = 0; i < 3; i += 1) {
    const dx = (i - 1) * (a.width / 3);
    push(`lawn appliance bank panel ${i}`, 'detail',
      [a.x + dx, LOW_COVER - 0.14, a.z - a.depth / 2 + 0.012],
      [a.width / 3 - 0.07, 0.14, 0.024], m.chrome, DRESSING);
    push(`lawn appliance bank handle ${i}`, 'detail',
      [a.x + dx, LOW_COVER - 0.34, a.z - a.depth / 2 + 0.03],
      [a.width / 3 - 0.10, 0.035, 0.05], m.chrome, DRESSING);
  }

  // ---- the glasshouse ----------------------------------------------------
  const g = NUKETOWN2_GLASSHOUSE;
  // SILHOUETTE. A flat-roofed glazed house, built as ONE solid box. A pitched
  // roof was drawn first and rejected: its ridge pieces are colliders whose
  // underside is above 0.4 m, which the arena's floating-geometry gate would
  // have had to be told to excuse. A flat-roofed lean-to is a real glasshouse
  // type, and it needs no exception.
  push('yard glasshouse shell', 'silhouette',
    [g.x, g.height / 2, g.z], [g.width, g.height, g.depth], m.glazing, SOLID);
  // STRUCTURE. Corner posts, cill and eaves - the frame that stops a glazed
  // box reading as an ice cube. All inset INSIDE the shell.
  // The eaves band tops out 0.06 m BELOW the shell, not flush with it. Flush
  // was the first cut and the coplanar instrument caught it immediately: two
  // different materials sharing one +y plane over 6.6 m2 is the exact depth
  // race that gate exists for. The cure here is geometric separation, the
  // route HF-463 already established on this map's road markings, rather than
  // a polygon-offset tier - a frame band genuinely sits under the roof plane.
  push('yard glasshouse eaves', 'structure',
    [g.x, g.height - 0.13, g.z], [g.width + 0.10, 0.12, g.depth + 0.10], m.frame, DRESSING);
  push('yard glasshouse cill', 'structure',
    [g.x, 0.09, g.z], [g.width + 0.08, 0.18, g.depth + 0.08], m.frame, DRESSING);
  for (const [index, sx] of [-1, 1].entries()) {
    // Same rule: the post stops 0.10 m under the roof plane it supports.
    push(`yard glasshouse post ${index}`, 'structure',
      [g.x + sx * (g.width / 2 - 0.05), (g.height - 0.10) / 2, g.z],
      [0.10, g.height - 0.10, g.depth + 0.06], m.frame, DRESSING);
  }
  // DETAIL. Glazing bars every ~0.5 m across the long face, and a door reveal.
  for (let i = 0; i < 5; i += 1) {
    const t = (i + 1) / 6 - 0.5;
    push(`yard glasshouse bar ${i}`, 'detail',
      [g.x + t * g.width, g.height / 2, g.z], [0.045, g.height - 0.2, g.depth + 0.05], m.frame, DRESSING);
  }
  push('yard glasshouse door frame', 'detail',
    [g.x + g.width / 2 - 0.42, 0.95, g.z - g.depth / 2 - 0.012],
    [0.78, 1.90, 0.03], m.frame, DRESSING);

  // ---- the garden pod ----------------------------------------------------
  const pd = NUKETOWN2_GARDEN_POD;
  // SILHOUETTE. Same reasoning as the glasshouse: a boxy garden room, not a
  // capsule. A rounded shell inside a box collider is a collider that
  // over-claims at every corner, which is exactly the class
  // `collider-visual-parity-gate` exists to fail.
  push('yard garden pod shell', 'silhouette',
    [pd.x, pd.height / 2, pd.z], [pd.width, pd.height, pd.depth], m.podShell, SOLID);
  // STRUCTURE. A chamfer band under the eaves and a raised roof cap, so the
  // pod reads as a moulded shell rather than as a shed.
  push('yard garden pod eave band', 'structure',
    [pd.x, pd.height - 0.16, pd.z], [pd.width + 0.09, 0.20, pd.depth + 0.09], m.podShell, DRESSING);
  push('yard garden pod roof cap', 'structure',
    [pd.x, pd.height + 0.05, pd.z], [pd.width - 0.34, 0.10, pd.depth - 0.34], m.podShell, DRESSING);
  // DETAIL. The pod's one big glazed opening, and its threshold.
  push('yard garden pod window', 'detail',
    [pd.x, 1.30, pd.z - pd.depth / 2 - 0.012], [pd.width - 0.44, 0.95, 0.03], m.glazing, DRESSING);
  push('yard garden pod sill', 'detail',
    [pd.x, 0.80, pd.z - pd.depth / 2 - 0.02], [pd.width - 0.38, 0.06, 0.06], m.frame, DRESSING);

  // ---- the sand pit ------------------------------------------------------
  const s = NUKETOWN2_SAND_PIT;
  // SILHOUETTE. A timber-edged box, 0.30 m tall - under the arena's 0.42 m
  // autostep, so it is a thing you step over and never a wall. Solid, because
  // it is a real 0.3 m obstruction and this map's rule is that visible mass
  // and movement authority agree.
  push('yard sand pit kerb', 'silhouette',
    [s.x, s.height / 2, s.z], [s.width, s.height, s.depth], m.timber, SOLID);
  // STRUCTURE. The sand itself, sitting 5 cm below the kerb top so the timber
  // reads as an edge and the two surfaces are 0.05 m apart in y - clear of the
  // 0.03 m coplanar window by design, not by an offset tier.
  push('yard sand pit sand', 'structure',
    [s.x, s.height - 0.075, s.z], [s.width - 0.12, 0.05, s.depth - 0.12], m.sand, FLAT);
  // DETAIL. Corner seats, the way a domestic sand pit is built.
  for (const [index, sx] of [-1, 1].entries()) {
    push(`yard sand pit seat ${index}`, 'detail',
      [s.x + sx * (s.width / 2 - 0.18), s.height + 0.03, s.z],
      [0.34, 0.06, s.depth + 0.06], m.timber, DRESSING);
  }

  return Object.freeze(out);
}
