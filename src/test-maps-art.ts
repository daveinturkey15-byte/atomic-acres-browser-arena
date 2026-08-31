/**
 * Test1/Test2 procedural art — forged PBR surfaces plus the shared
 * environment kit.
 *
 * OWNER 2026-08-30, on playing the first pass: "test 1 and test 2 map are a
 * good start but only a small portion of the map and style, we need a deeper
 * recreation ... we need to use some of your better techniques to sort the
 * quality of trees, grass mountains etc, i seen so much better, and lighting".
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * v1 of this file painted 13 canvas textures and bound exactly one slot,
 * `material.map`. Every hardpan, plywood, cinderblock and travertine surface
 * in both maps was therefore a FLAT PAINTED PLANE: no normal, no roughness
 * variation, no AO, so nothing broke at a grazing angle, nothing caught the
 * sun, and the "lit by a constant" read the owner called out survived any
 * amount of lighting work. v1 also hand-rolled its vegetation and backdrop —
 * 140 cloned cones, 18 squashed hemispheres, and a dead-straight row of 12
 * cypress cones with 12 separate trunk draws.
 *
 * v2 replaces both halves with the two kits built for exactly this
 * (docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md):
 *
 *   - src/rendering/surface-forge.ts. ONE authored `SurfaceDescription` per
 *     surface yields albedo + a Sobel tangent NORMAL + roughness + AO, all
 *     four derived from the same height/colour function so they cannot
 *     disagree, plus a shared two-scale micro/macro detail layer pinned to a
 *     fixed physical size. Every surface in both maps now has a normal map.
 *   - src/rendering/environment-kit.ts. Deterministic instanced vegetation
 *     (Poisson with layered inter-layer clearance, position-hashed variation,
 *     two build-time LOD tiers, contact skirts) and a displaced ridgeline
 *     ring in place of the hemisphere hills.
 *
 * BAKE BUDGET (the forge measures ~105 ms per 512 px set — budget it)
 * ------------------------------------------------------------------
 * Surfaces are SHARED, not one per material. Six forged sets per arena carry
 * eleven Test1 materials and eight Test2 materials; near-identical materials
 * differ only by tint, roughness and repeat, which costs nothing.
 *
 * MEASURED end to end on dave-gaming-pc (Node 24), each arena in its OWN
 * process so the shared tiles are paid once per measurement exactly as they
 * are at boot, calling the real `test1Materials()` / `test2Materials()` against
 * a byte-accurate 2D canvas. Two runs each, 2026-08-30:
 *
 *   test1Materials()   502 / 540 ms   6 sets + both shared tiles  (~81 ms/set)
 *   test2Materials()   666 / 630 ms   6 sets + both shared tiles (~102 ms/set)
 *   shared micro tile   12 ms   shared macro tile   24 ms
 *
 * Only ONE arena is ever built, so the boot cost a player pays is ~0.52 s
 * (Test1) or ~0.65 s (Test2) — comfortably inside the ~1.2 s ceiling, with
 * room for a seventh surface later if one is ever justified. Test2 is the
 * dearer half because travertine, stucco and pool tile each run a `warp`,
 * which is three fbm stacks rather than one; that is the knob to turn first if
 * a future surface pushes the budget.
 *
 * NOTHING here is baked at 1024. `surfaceTexelBudget` says every authored band
 * already clears the 5-texel Nyquist floor at 512 (the per-surface numbers are
 * on each description), and 1024 measures 358 ms — 3.4x the cost for bands
 * that are already resolved.
 *
 * CONTRACTS (unchanged from v1, and all still enforced)
 * ----------------------------------------------------
 * - PRESENTATION ONLY. Nothing in this file adds a collider, shot surface,
 *   spawn or navigation. Every mesh is tagged `presentationOnly`, has its
 *   `raycast` replaced with a no-op, and the vegetation kit does the same.
 * - DETERMINISTIC. Seeded mulberry32 and integer position hashes only; no
 *   `Math.random`, no `Date`, no iteration-order dependence.
 * - HEADLESS-SAFE. `forgeSurface` probes for a real, readable 2D canvas and
 *   returns an all-null set when there is none, so the collider/visual parity
 *   audit and the vitest suites pay ZERO bake cost and fall back to flat
 *   colours. The environment kit is pure `three` geometry.
 * - DRESSING NEVER BECOMES GHOST COVER. Every prop below is under 0.9 m tall,
 *   thinner than 0.35 m in its widest axis, sits at or above the 2.6 m
 *   reachable ceiling, lies outside the arena bounds, or carries a name the
 *   parity audit's foliage/cloth rules exclude by construction. Anything that
 *   should stop a body or a bullet is authored in src/test-maps.ts as a real
 *   collider instead.
 */
import * as THREE from 'three';
import {
  buildEnvironment,
  type ClearancePredicate,
  type EnvironmentBuildResult,
  type PlantKind,
} from './rendering/environment-kit';
import {
  forgeSurface,
  surfaceStandardMaterial,
  type ForgedSurface,
  type SurfaceDescription,
  type SurfaceSample,
} from './rendering/surface-forge';

// ---------------------------------------------------------------------------
// Deterministic RNG (threejs-procedural-vegetation skill)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Surface authoring helpers
// ---------------------------------------------------------------------------

/**
 * One scratch sample, reused for every texel. The forge copies the returned
 * value immediately (surface-forge.ts `SurfaceDescription`), so a description
 * must NOT allocate 262 144 objects per bake.
 */
const SAMPLE_ALBEDO: [number, number, number] = [0, 0, 0];
const SAMPLE: { albedo: [number, number, number]; height: number; roughness: number; ao: number } = {
  albedo: SAMPLE_ALBEDO, height: 0, roughness: 1, ao: 1,
};

/**
 * AO IS BAKED AS sqrt(ao), NOT ao.
 *
 * `aoMap` multiplies the INDIRECT term only, and indirect is the entire
 * lighting budget of every shadowed pixel — these arenas have no
 * `scene.environment` (measured 2026-08-30: null on all eight arenas on the
 * WebGPU route), so a shadowed surface is lit by the flat ambient, the global
 * hemisphere and the 0.22 shadow-side fill and nothing else. An authored AO
 * floor of 0.28 (hedge) or 0.10 (travertine joints) therefore removes 72-90%
 * of ALL the light a crevice will ever receive, which is why the crevices
 * measured at linear luma 0.0005 while the same material's open face measured
 * 0.12 on the same frame.
 *
 * Upstream states the rule outright (UPSTREAM_TECHNIQUE_EXTRACTION, "Two-band
 * normal-gated bounce fill", citing materialpatch.js:49-58): the fill bands are
 * "occluded by sqrt(AO), never AO - a fill term that AO can drive to zero is
 * not a fill, it is another way to make a black hole". We cannot patch the
 * shader from here, but sqrt is a pointwise function of the authored value, so
 * baking sqrt(ao) into the map is exactly equivalent and costs nothing.
 *
 * It also has the right SHAPE: contact darkening at ao 0.8 is barely touched
 * (0.89) while a floor at 0.10 lifts to 0.32, so grooves keep their read and
 * stop being holes. Every `ao` expression below is authored as the real
 * occlusion; the sqrt is applied once, here.
 */
function emit(r: number, g: number, b: number, height: number, roughness: number, ao = 1): SurfaceSample {
  SAMPLE_ALBEDO[0] = r;
  SAMPLE_ALBEDO[1] = g;
  SAMPLE_ALBEDO[2] = b;
  SAMPLE.height = height;
  SAMPLE.roughness = roughness;
  SAMPLE.ao = Math.sqrt(clamp01(ao));
  return SAMPLE;
}

type Rgb = readonly [number, number, number];

/** sRGB 0..1 triple from a hex literal, so palettes stay readable as colours. */
function rgb(hex: number): Rgb {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255] as const;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Emit a two-stop colour ramp without allocating an intermediate triple. */
function emitMix(a: Rgb, b: Rgb, t: number, height: number, roughness: number, ao = 1): SurfaceSample {
  return emit(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), height, roughness, ao);
}

/**
 * Shortest distance between two coordinates on the unit circle. Every
 * authored feature uses this rather than `|a - b|` so a groove or a rut
 * placed near u = 0 stays continuous across the tile seam — the property the
 * v1 canvas painters lacked, where blobs drawn near an edge were clipped and
 * the tile showed a seam grid at high repeat counts.
 */
function wrapDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

/** 1 at the groove centre falling smoothly to 0 at `halfWidth`. Seamless. */
function groove(coord: number, centre: number, halfWidth: number): number {
  return 1 - smooth(0, halfWidth, wrapDelta(coord, centre));
}

/**
 * Seamless anisotropic streaking.
 *
 * The noise toolkit wraps x and y on the SAME integer period, so
 * `fbm(u * 3, v * 48, 48)` would tear at u = 1. A phase-modulated sinusoid
 * carries the fine direction instead: `sin(2*pi*cycles*coord + warp)` is
 * periodic for integer `cycles` whatever periodic field `warp` is, which is
 * what lets plywood grain, corrugation and plank runs be both directional and
 * seam-free.
 */
function streak(coord: number, cycles: number, warp: number): number {
  return 0.5 + 0.5 * Math.sin(coord * Math.PI * 2 * cycles + warp);
}

// ---------------------------------------------------------------------------
// Test1 surfaces
// ---------------------------------------------------------------------------

// ART PASS 2026-08-31: the three hardpan stops were 29 / 30 / 34 deg after this
// arena's near-white key - one hue at three values - and hardpan is most of
// every frame, so the map's dominant 10-degree bin was 47-58% of its whole
// chroma budget against 34-50% for the two shipped controls. The SHADOW stop is
// the one that can honestly move: caliche crust bleaches warm in the sun and
// the mineral under it reads grey-olive in shade, which is the extraction's own
// cool-shadow/warm-light separation applied to albedo instead of to lights.
// 29 -> 47 deg at linear Y 0.129 -> 0.135, i.e. the value the last pass measured
// this stop needed is unchanged; only its hue moves. 58 deg was tried first and
// measured better still, but it turned the whole hardpan field olive against
// the cooled distance - this is a dust range, and the stop is pulled back to
// where the floor still reads as mineral rather than as grass.
const HARDPAN_SHADOW = rgb(0x6f6d4e);
const HARDPAN_MID = rgb(0xb0925c);
const HARDPAN_BLEACH = rgb(0xd8c193);

/**
 * Dust hardpan with tyre ruts. tileMetres 4, 512 px = 7.8 mm/texel.
 * Finest band: the 32-cell grit Worley = 12.5 cm cells = 16 texels/cell.
 */
const hardpanSurface: SurfaceDescription = (u, v, noise) => {
  const drift = noise.fbm(u * 8, v * 8, 8, 4);
  const grit = 1 - noise.worley(u * 32, v * 32, 32);
  // Two ruts 1.65 m apart on the 4 m tile — one light-truck track width.
  const rut = Math.max(groove(u, 0.29, 0.052), groove(u, 0.71, 0.052));
  const bleach = smooth(0.52, 0.92, drift);
  const tone = clamp01(drift * 0.85 + grit * 0.3 - rut * 0.45);
  const height = 0.5 + (drift - 0.5) * 0.55 + grit * 0.22 - rut * 0.4;
  // Compacted rut floors are polished by traffic; loose dust is fully matte.
  const roughness = 0.99 - rut * 0.22 - bleach * 0.05;
  const ao = 1 - rut * 0.3 - grit * 0.12;
  return emitMix(HARDPAN_SHADOW, tone > 0.55 ? HARDPAN_BLEACH : HARDPAN_MID, tone, height, roughness, ao);
};

const PLYWOOD_DARK = rgb(0x8b6a3c);
const PLYWOOD_MID = rgb(0xbf9d64);
const PLYWOOD_PALE = rgb(0xdcc08a);

/**
 * Softwood ply sheet. tileMetres 1.2, 512 px = 2.3 mm/texel.
 * Finest band: 26 grain cycles = 19.7 texels/cycle.
 */
const plywoodSurface: SurfaceDescription = (u, v, noise) => {
  const wander = (noise.fbm(u * 6, v * 6, 6, 3) - 0.5) * 8;
  const grain = streak(v, 26, wander);
  const figure = noise.fbm(u * 4, v * 4, 4, 3);
  // Knots: the Worley feature points are the knot centres, so the rings fall
  // out of the same field rather than being scattered separately.
  const cell = noise.worley(u * 4, v * 4, 4);
  const knot = 1 - smooth(0, 0.16, cell);
  const rings = knot > 0 ? 0.5 + 0.5 * Math.sin(cell * 90) : 0;
  // Sheet seam every 0.6 m: a real 4 mm shadow gap between panels.
  const seam = groove(u, 0.5, 0.02) + groove(u, 0, 0.02);
  const tone = clamp01(0.28 + grain * 0.34 + figure * 0.34 - knot * 0.55 - seam * 0.4);
  const height = 0.62 + (grain - 0.5) * 0.1 - knot * 0.22 - rings * knot * 0.12 - seam * 0.55;
  return emitMix(PLYWOOD_DARK, tone > 0.6 ? PLYWOOD_PALE : PLYWOOD_MID, tone, height, 0.86 + knot * 0.08, 1 - seam * 0.45 - knot * 0.2);
};

// PAINT AND GALVANISING ARE A BRIGHT BASE, NOT A DARK ONE.
//
// This set is worn by three container tints and by the galvanised roofing, and
// `material.color` MULTIPLIES it and is capped at white (gotcha: three.js
// material.color cannot lighten). v2 authored the base at real *bare steel*
// values (STEEL_MID linear Y 0.257, STEEL_SHADOW 0.090), so the brightest
// possible container came out at linear Y 0.091 and the darkest at 0.025 -
// charcoal, an order of magnitude under any painted container - and the roofs
// at 0.039-0.112. What actually ships on a container yard is a coat of paint or
// a hot-dip galvanised layer, and both are BRIGHTER than the steel underneath:
// galvanising is 0.30-0.40 and container paint sits on a white-ish primer.
//
// The base is therefore authored as the painted/galvanised sheet itself
// (0.22-0.50 linear Y) and left nearly neutral, so the tint carries hue and the
// NORMAL map carries the rib shading - which is what the 22 mm relief was
// forged for. Measured before/after on the same camera: container top
// 0.0011 -> 0.079 linear Y, firing-line roof 0.0022 -> 0.21.
const STEEL_SHADOW = rgb(0x7f888e);
const STEEL_MID = rgb(0xb9c1c6);
// Oxide stays the dark accent, but lifted off the floor: at 0.110 it was below
// the crush threshold as soon as a container tint multiplied it.
const RUST = rgb(0xa8613a);

/**
 * Corrugated container steel. tileMetres 2.4, 512 px = 4.7 mm/texel.
 * Finest band: 12 corrugations = 20 cm pitch = 42.7 texels/cycle. The 22 mm
 * relief on a 2.4 m tile gives a peak slope of 19 degrees, which is what puts
 * a real sun-catch band down every rib instead of a painted gradient.
 */
const corrugatedSurface: SurfaceDescription = (u, v, noise) => {
  const rib = streak(u, 12, 0);
  // Bolt/weld rows at the container's two horizontal rails.
  const rail = Math.max(groove(v, 0.08, 0.03), groove(v, 0.92, 0.03));
  const oxide = noise.fbm(u * 6, v * 6, 6, 4);
  // Rust bleeds DOWNWARD from the rails: v is up, so the streak field is
  // sampled with a bias that only opens below a rail.
  const bleed = clamp01((noise.fbm(u * 24, v * 3, 3, 2) - 0.42) * 3.4) * smooth(0.55, 0.1, v);
  const rustMask = clamp01(rail * 0.8 + bleed * 0.75 + smooth(0.72, 0.95, oxide) * 0.6);
  const shade = clamp01(rib * 0.85 + oxide * 0.25);
  const height = 0.5 + (rib - 0.5) * 0.86 - rail * 0.22;
  const base = shade > 0.55 ? STEEL_MID : STEEL_SHADOW;
  const t = rustMask > 0.5 ? 1 : clamp01(shade + rustMask * 0.4);
  // Metalness discipline (extraction doc): bare steel stays smooth, every
  // oxide layer on top of it is matte. The material carries metalness; the
  // roughness map carries the split.
  const roughness = lerp(0.34, 0.95, rustMask) + (1 - rib) * 0.06;
  return emitMix(base, rustMask > 0.35 ? RUST : STEEL_MID, clamp01(rustMask * 1.4) * 0.85 + (rustMask > 0.35 ? 0 : t * 0.15), height, roughness, 1 - rail * 0.35 - (1 - rib) * 0.2);
};

// Hessian, not dust. The v2 stops sat at hue 43-44, inside the 35-44 degree
// band hardpan, plywood and cinder already occupied, so a sandbag line and the
// ground it stands on measured as the same colour and the map had no
// separation to read cover against. Jute is genuinely greener and greyer than
// desert dust: hue moves to 50-53 and saturation drops, which is a material
// correction rather than a repaint.
// Same move as HARDPAN_SHADOW, same reason: hessian in shade is a green-khaki,
// 41 -> 60 deg at an unchanged linear Y (0.1438 -> 0.1453).
const SANDBAG_SHADOW = rgb(0x6d7350);
const SANDBAG_MID = rgb(0xa8a173);
const SANDBAG_SUN = rgb(0xcfc9a2);

/**
 * Filled hessian sandbag courses. tileMetres 1.6, 512 px = 3.1 mm/texel.
 * 6 courses x 3 bags = 27 cm x 53 cm bags; the finest band is the 48-cycle
 * hessian weave at 10.7 texels/cycle. Relief is 60 mm: sandbags are the one
 * surface on this map whose silhouette is genuinely made of the normal map.
 */
const sandbagSurface: SurfaceDescription = (u, v, noise) => {
  const rows = 6;
  const cols = 3;
  const ry = v * rows;
  const row = Math.floor(ry);
  const fy = ry - row;
  // Even row count keeps the half-bag stagger continuous across the v seam.
  const cx = u * cols + (row % 2) * 0.5;
  const col = Math.floor(cx);
  const fx = cx - col;
  const dx = (fx - 0.5) * 2;
  const dy = (fy - 0.5) * 2;
  const inside = clamp01(1 - (dx * dx * 0.82 + dy * dy));
  const lobe = Math.sqrt(inside);
  const weave = streak(u * cols, 16, 0) * 0.5 + streak(v * rows, 16, 0) * 0.5;
  const dirt = noise.fbm(u * 10, v * 10, 10, 3);
  const tone = clamp01(lobe * 0.72 + weave * 0.14 + dirt * 0.2 - 0.06);
  const height = lobe * 0.92 + weave * 0.05;
  return emitMix(SANDBAG_SHADOW, tone > 0.62 ? SANDBAG_SUN : SANDBAG_MID, tone, height, 0.97 - lobe * 0.04, 0.35 + lobe * 0.65);
};

// THE ONE COOL NEUTRAL ON A WARM MAP.
//
// Portland-cement CMU is a cool grey; v2 authored it at hue 38-40, which is
// hardpan's own hue at a tenth of the saturation - a desaturated version of the
// ground rather than a contrast to it. On a map whose other five families all
// live between 35 and 53 degrees, the tower and the stores block were the only
// large masses that could carry a neutral, and they were spending it on more
// khaki. Moved to hue 200-207 at the same low saturation and lifted to real
// CMU reflectance (0.16-0.44 linear Y): the buildings now read cool against
// warm dust, which is the separation the shipped arenas get from teal and
// brick.
const CINDER_SHADOW = rgb(0x6e767c);
const CINDER_MID = rgb(0x9ba3a9);
const CINDER_PALE = rgb(0xc2c8cb);

/**
 * Cinderblock with struck mortar joints. tileMetres 1.6, 512 px = 3.1 mm/texel.
 * 8 courses x 4 blocks = 20 cm x 40 cm — real CMU. The 15 mm mortar joint is
 * the finest band at 4.8 texels; the joint carries a smooth shoulder so it
 * reads as a recess rather than a one-texel line at mip 0.
 */
const cinderSurface: SurfaceDescription = (u, v, noise) => {
  const rows = 8;
  const cols = 4;
  const ry = v * rows;
  const row = Math.floor(ry);
  const fy = ry - row;
  const cx = u * cols + (row % 2) * 0.5;
  const fx = cx - Math.floor(cx);
  const joint = clamp01(
    (1 - smooth(0.0, 0.06, Math.min(fy, 1 - fy)))
    + (1 - smooth(0.0, 0.03, Math.min(fx, 1 - fx))),
  );
  const aggregate = 1 - noise.worley(u * 40, v * 40, 40);
  const stain = noise.fbm(u * 5, v * 5, 5, 4);
  const tone = clamp01(0.34 + stain * 0.5 + aggregate * 0.24 - joint * 0.5);
  const height = 0.72 + aggregate * 0.16 + (stain - 0.5) * 0.08 - joint * 0.7;
  return emitMix(CINDER_SHADOW, tone > 0.58 ? CINDER_PALE : CINDER_MID, tone, height, 0.93 + aggregate * 0.06, 1 - joint * 0.5 - aggregate * 0.1);
};

// Olive-drab proofed canvas measures 0.12-0.18 linear Y in shade; the v2 dark
// stop was 0.085, so every awning and camo net crushed the moment it fell out
// of the sun - and awnings are the one large horizontal that never catches an
// 18-degree key.
const TARP_SHADOW = rgb(0x5e6b45);
const TARP_MID = rgb(0x7d8a5b);
const TARP_SUN = rgb(0xa5ae80);

/**
 * Olive-drab canvas awning/camo net. tileMetres 2.0, 512 px = 3.9 mm/texel.
 * Finest band: the 40-cycle weave at 12.8 texels/cycle.
 */
const tarpSurface: SurfaceDescription = (u, v, noise) => {
  const warpThread = streak(u, 40, 0);
  const weftThread = streak(v, 40, 0);
  const weave = Math.max(warpThread, weftThread) * 0.5 + warpThread * weftThread * 0.5;
  // Slack folds: a low-frequency warp field, so the sheet sags between poles.
  const fold = noise.warp(u * 4, v * 4, 4, 1.4);
  const fade = noise.fbm(u * 3, v * 3, 3, 2);
  const tone = clamp01(0.24 + weave * 0.2 + fold * 0.42 + fade * 0.24);
  const height = 0.42 + (weave - 0.5) * 0.18 + (fold - 0.5) * 0.8;
  return emitMix(TARP_SHADOW, tone > 0.6 ? TARP_SUN : TARP_MID, tone, height, 0.95 - weave * 0.06, 0.72 + weave * 0.28);
};

// ---------------------------------------------------------------------------
// Test2 surfaces
// ---------------------------------------------------------------------------

// ART PASS 2026-08-31: a golden key of (1.000, 0.624, 0.287) puts EVERY neutral
// or warm albedo at 26-35 deg - there is no albedo that reads cool under it - so
// the terrace could not be given a second family, only a second material. The
// joint is grey mortar, not more travertine: 26 -> 32 deg at an identical
// luminance (linear Y 0.1960 -> 0.1963), which is a real material distinction
// the eye reads as a joint rather than two shades of the same stone.
const TRAVERTINE_JOINT = rgb(0x8f9490);
const TRAVERTINE_MID = rgb(0xd6c9b0);
const TRAVERTINE_PALE = rgb(0xece2cd);

/**
 * Travertine pavers. tileMetres 2.4, 512 px = 4.7 mm/texel.
 * 3 x 3 pavers = 80 cm. Finest band: the 25 mm joint groove at 5.3 texels,
 * and the 24-cell pitting Worley at 21 texels/cell.
 */
const travertineSurface: SurfaceDescription = (u, v, noise) => {
  const cells = 3;
  const fx = u * cells - Math.floor(u * cells);
  const fy = v * cells - Math.floor(v * cells);
  const joint = clamp01(
    (1 - smooth(0, 0.012, Math.min(fx, 1 - fx)))
    + (1 - smooth(0, 0.012, Math.min(fy, 1 - fy))),
  );
  // Bedding-plane veining: fbm sampled through an fbm-displaced coordinate,
  // which is what makes the veins wander instead of running straight.
  const vein = noise.warp(u * 6, v * 6, 6, 1.8);
  const banding = smooth(0.44, 0.56, vein);
  const pit = 1 - noise.worley(u * 24, v * 24, 24);
  const pitting = smooth(0.72, 1, pit);
  const tone = clamp01(0.46 + vein * 0.42 - pitting * 0.3 - joint * 0.6);
  const height = 0.78 - pitting * 0.5 - joint * 0.78 - banding * 0.05;
  // Honed stone is smooth; the open pores and the joints are not.
  const roughness = 0.42 + pitting * 0.45 + joint * 0.4;
  // A 25 mm joint between two pavers is a shallow groove, not a light trap:
  // 0.55 + 0.35 could drive the corner of a paver to 0.10 occlusion, the
  // deepest authored value in either map, and the terrace is the arena's
  // largest single surface. 0.40/0.24 keeps the joint reading (0.36 at a
  // corner, 0.60 after the sqrt bake) without making it a hole.
  return emitMix(TRAVERTINE_JOINT, tone > 0.62 ? TRAVERTINE_PALE : TRAVERTINE_MID, tone, height, roughness, 1 - joint * 0.4 - pitting * 0.24);
};

const STUCCO_SHADE = rgb(0xcfc4ae);
const STUCCO_MID = rgb(0xe9e0cf);
const STUCCO_SUN = rgb(0xf6efe0);

/**
 * Warm white villa stucco. tileMetres 2.4, 512 px = 4.7 mm/texel.
 * Finest band: the 36-cell trowel-grain Worley at 14.2 texels/cell.
 */
const stuccoSurface: SurfaceDescription = (u, v, noise) => {
  const trowel = noise.warp(u * 5, v * 5, 5, 2.2);
  const grain = 1 - noise.worley(u * 36, v * 36, 36);
  // A weathering wash that only opens toward the bottom of the wall (v up),
  // so the rendered facade darkens at the plinth the way real render does.
  const wash = smooth(0.34, 0, v) * smooth(0.4, 0.75, noise.fbm(u * 7, v * 7, 7, 3));
  const tone = clamp01(0.38 + trowel * 0.44 + grain * 0.18 - wash * 0.36);
  const height = 0.6 + (trowel - 0.5) * 0.34 + grain * 0.24;
  return emitMix(STUCCO_SHADE, tone > 0.62 ? STUCCO_SUN : STUCCO_MID, tone, height, 0.82 + grain * 0.14 + wash * 0.06, 1 - grain * 0.16 - wash * 0.14);
};

// Box foliage in shade is 0.05-0.07 linear Y, not 0.033. Combined with this
// surface's 0.28 AO floor the deep stop resolved under 0.01 in any shadow,
// which is what turned the clipped hedges - the arena's only large green mass -
// into black blocks in the flyover.
//
// ART PASS 2026-08-31 - AND THEN THEY WERE NOT GREEN, THEY WERE OLIVE. The
// cause is arithmetic, not taste. Diffuse is albedo * light in LINEAR, and this
// arena's key 0xffcf92 is linear (1.000, 0.624, 0.287), so a surface only comes
// out of the multiply reading green if its own linear green beats its linear
// red by more than 1/0.624 = 1.60x. The stop that carries the hedge's weight is
// the LIT one, and HEDGE_LIT 0x74924b sat at 1.65 - a hair over the line, and
// it landed at hue 62 deg, i.e. in the yellow-olive band the travertine and the
// hillside already own rather than in a green one. MID was 78 deg, DEEP 81 deg.
// The map measured 2 live hue bins against 5 and 7 for the shipped controls,
// and its "only large green mass" was contributing to the dominant bin.
//
// Re-authored well clear of the line - 3.24 / 3.81 / 3.67 against 1.60 - which
// puts the three stops at 93 / 98 / 100 deg. Tone spacing is deliberately kept:
// lit-stop linear Y moves 0.167 -> 0.191 and the deep stop 0.0336 -> 0.0332, so
// the clipped face still separates from the crevice by exactly the value the
// last pass measured it needed. Only the hue the key leaves behind changes.
const HEDGE_DEEP = rgb(0x24482a);
const HEDGE_MID = rgb(0x3d7536);
const HEDGE_LIT = rgb(0x5fa444);

/**
 * Clipped box hedge. tileMetres 1.0, 512 px = 2.0 mm/texel.
 * Finest band: the 40-cell leaf-clump Worley at 12.8 texels/cell. 30 mm of
 * relief on a 1 m tile is what turns a flat green box into a surface whose
 * clipped face catches the sun and holds shadow between the clumps.
 */
const hedgeSurface: SurfaceDescription = (u, v, noise) => {
  const clump = 1 - noise.worley(u * 40, v * 40, 40);
  const mass = noise.fbm(u * 8, v * 8, 8, 4);
  const sprig = noise.fbm(u * 20, v * 20, 20, 2);
  const depth = clamp01(clump * 0.62 + sprig * 0.38);
  const tone = clamp01(depth * 0.72 + mass * 0.34 - 0.1);
  const height = depth * 0.86 + mass * 0.14;
  // Waxy on the sunlit clipped face, matte in the crevices: a constant here
  // measured as a flat 240 across the whole map and read as painted plastic.
  const roughness = 0.99 - depth * 0.22;
  // 0.28 -> 0.4: a clipped hedge face is open foliage, not a closed cavity, and
  // the deepest crevice still sees a good part of the sky.
  return emitMix(HEDGE_DEEP, tone > 0.58 ? HEDGE_LIT : HEDGE_MID, tone, height, roughness, 0.4 + depth * 0.6);
};

// The same key-multiply arithmetic as the hedge above, one axis over. To come
// out of a (1.000, 0.624, 0.287) key reading CYAN a tile needs its linear blue
// to beat its linear green by 0.624/0.287 = 2.17x. 0x76bfcb was 1.15x, so the
// basin resolved at hue 116 deg - green, not cyan - and the brief's headline
// element read as another shade of the garden. 1.68x puts it at 158 deg and the
// grout at 166 deg. Luminance is held on purpose: a first attempt at 0x4dafe4
// reached 166 deg but cost the tile 0.283 -> 0.223 linear Y and dropped the
// shaded half of the basin back through the 0.02 crush floor the last pass had
// just cleared. 0.269 / 0.136 against the authored 0.283 / 0.109 keeps it.
const POOL_GROUT = rgb(0x3a8cb6);
const POOL_TILE = rgb(0x63bced);
// The glint stays a near-white highlight, but a pale one is dominated by the
// key's own spectrum: 0xbfe9ee measured out at 57 deg, i.e. the pool's
// BRIGHTEST stop - the one carrying most of its weight - was feeding the yellow
// bins. 87 deg at linear Y 0.429 against the authored 0.492: blue enough to
// leave the warm side, bright enough to still read as a highlight.
const POOL_GLINT = rgb(0xa5dffa);

/**
 * Glazed pool tile with a baked caustic web. tileMetres 1.2, 512 px =
 * 2.3 mm/texel. 4 x 4 tiles = 30 cm; the 12 mm grout line is the finest band
 * at 5.1 texels.
 */
const poolTileSurface: SurfaceDescription = (u, v, noise) => {
  const cells = 4;
  const fx = u * cells - Math.floor(u * cells);
  const fy = v * cells - Math.floor(v * cells);
  const grout = clamp01(
    (1 - smooth(0, 0.02, Math.min(fx, 1 - fx)))
    + (1 - smooth(0, 0.02, Math.min(fy, 1 - fy))),
  );
  // Caustics: the ridged inverse of a warped field. Baked into ALBEDO only —
  // the tile itself is flat, so caustic light must not tilt its normal.
  const web = noise.warp(u * 7, v * 7, 7, 2.6);
  const caustic = Math.pow(1 - Math.abs(web - 0.5) * 2, 4);
  const glaze = noise.fbm(u * 12, v * 12, 12, 2);
  const tone = clamp01(0.4 + glaze * 0.24 + caustic * 0.62 - grout * 0.7);
  const height = 0.82 - grout * 0.85;
  return emitMix(POOL_GROUT, tone > 0.6 ? POOL_GLINT : POOL_TILE, tone, height, 0.14 + grout * 0.62, 1 - grout * 0.4);
};

// Painted acrylic topcoat, not bare clay. The v2 stops were a desaturated
// brown at hue 14-15, one bin away from the timber decking (27-34) and two from
// the travertine (39-41), so the sunken court - the map's centre objective -
// had no colour of its own from the air. Kept terracotta (the brief's
// Mediterranean estate, not a repaint) but taken to a real painted chroma and
// lifted off the crush floor: 0.073 -> 0.11 linear Y on the shaded stop.
const COURT_SHADOW = rgb(0x8a4436);
const COURT_MID = rgb(0xb05a44);
const COURT_SUN = rgb(0xc9775c);

/**
 * Acrylic sport-court topcoat. tileMetres 3.0, 512 px = 5.9 mm/texel.
 * Finest band: the 44-cell silica-grain Worley at 11.6 texels/cell. The court
 * MARKINGS are deliberately geometry, not texture — at this mapping a 5 cm
 * line would be 8.5 texels across a whole 12 m court and would blur to a
 * smear by mip 2, so `applyTest2Dressing` lays them as flush painted quads.
 */
const courtSurface: SurfaceDescription = (u, v, noise) => {
  const silica = 1 - noise.worley(u * 44, v * 44, 44);
  const rollMark = noise.fbm(u * 4, v * 4, 4, 3);
  const wear = smooth(0.55, 0.95, noise.fbm(u * 9, v * 9, 9, 2));
  const tone = clamp01(0.4 + rollMark * 0.36 + silica * 0.22 + wear * 0.12);
  const height = 0.55 + silica * 0.34 + (rollMark - 0.5) * 0.12;
  return emitMix(COURT_SHADOW, tone > 0.6 ? COURT_SUN : COURT_MID, tone, height, 0.62 + silica * 0.24 - wear * 0.08, 1 - silica * 0.14);
};

// Oiled hardwood in shade is ~0.09 linear Y; 0.061 put the lounger decking
// under the crush floor on the shaded half of every board.
const TIMBER_SHADOW = rgb(0x6d5136);
const TIMBER_MID = rgb(0x96714b);
const TIMBER_SUN = rgb(0xb99669);

/**
 * Oiled hardwood decking. tileMetres 1.6, 512 px = 3.1 mm/texel.
 * 8 boards = 20 cm; the 15 mm board gap is the finest band at 4.8 texels.
 */
const timberSurface: SurfaceDescription = (u, v, noise) => {
  const boards = 8;
  const by = v * boards;
  const board = Math.floor(by);
  const fy = by - board;
  const gap = 1 - smooth(0, 0.045, Math.min(fy, 1 - fy));
  // Per-board tone shift, hashed off the board index so neighbours differ.
  const boardTone = noise.hash(board, 7);
  const wander = (noise.fbm(u * 5, v * 5, 5, 3) - 0.5) * 6;
  const grain = streak(v, 30, wander);
  const weather = noise.fbm(u * 3, v * 3, 3, 3);
  const tone = clamp01(0.26 + grain * 0.3 + weather * 0.28 + boardTone * 0.22 - gap * 0.7);
  const height = 0.7 + (grain - 0.5) * 0.14 - gap * 0.8;
  return emitMix(TIMBER_SHADOW, tone > 0.6 ? TIMBER_SUN : TIMBER_MID, tone, height, 0.7 + weather * 0.22 + gap * 0.1, 1 - gap * 0.55);
};

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

type ForgedMaterialOptions = {
  color?: number;
  roughness?: number;
  metalness?: number;
  normalScale?: number;
  aoMapIntensity?: number;
  side?: THREE.Side;
  /**
   * World metres one texture tile spans on any mesh wearing this material.
   * Defaults to the surface's authored `tileMetres`; raise it to stretch the
   * same forged set over a coarser structure (the galvanised steel is the one
   * variant that wants a different density from its parent corrugation).
   */
  metresPerTile: number;
};

/**
 * A material on a forged set.
 *
 * The forged set is cached by name and its four textures are SHARED by every
 * material built from it, so no variant may write a repeat onto them. Scale is
 * carried per MESH instead, by `worldTiled` — see the note there for why the
 * old per-material repeat could not be right for more than one mesh size.
 */
function forgedMaterial(forged: ForgedSurface, name: string, options: ForgedMaterialOptions): THREE.MeshStandardMaterial {
  const material = surfaceStandardMaterial(forged, {
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.92,
    metalness: options.metalness ?? 0,
    normalScale: options.normalScale ?? 1,
    aoMapIntensity: options.aoMapIntensity ?? 1,
    side: options.side,
  });
  material.name = name;
  material.userData.metresPerTile = options.metresPerTile;
  return material;
}

/**
 * Re-scale a box's UVs so a shared material tiles at a FIXED WORLD SIZE.
 *
 * `BoxGeometry` emits 0..1 per face whatever the face measures, so a single
 * `map.repeat` can only ever be correct for one mesh size. v1 tuned each
 * repeat to whichever mesh was biggest and every other user of that material
 * came out at the wrong density — the 84 m ground slab and a 5 m shed roof
 * wearing one hardpan repeat differ by a factor of seventeen. Scaling the
 * geometry's own UVs makes the density a property of the MESH, which is what
 * it physically is, and lets eleven Test1 materials share six forged sets
 * without a single cloned texture.
 *
 * One scale pair has to serve all six faces, so the pair is chosen from the
 * face the viewer actually reads: a SLAB (thin in Y) is read from above, so
 * the pair is (width, depth); a WALL (thin in X or Z) is read on its long
 * elevation, so the pair is (long horizontal, height). Getting those right is
 * what matters — the remaining faces are the 0.3-1 m edge bands where the
 * difference is not readable.
 */
export function worldTiled<T extends THREE.Mesh>(mesh: T, size: readonly [number, number, number]): T {
  const material = mesh.material as THREE.Material | undefined;
  const metres = typeof material?.userData?.metresPerTile === 'number' ? material.userData.metresPerTile : 0;
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!(metres > 0) || !uv) return mesh;
  const [sizeX, sizeY, sizeZ] = size;
  const slab = sizeY <= Math.min(sizeX, sizeZ);
  const su = Math.max(slab ? sizeX : Math.max(sizeX, sizeZ), 0.01) / metres;
  const sv = Math.max(slab ? sizeZ : sizeY, 0.01) / metres;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * su, uv.getY(index) * sv);
  }
  uv.needsUpdate = true;
  return mesh;
}

export type Test1Materials = Readonly<{
  hardpan: THREE.MeshStandardMaterial;
  /** Compacted approach road / berm face: hardpan at a coarser world scale. */
  road: THREE.MeshStandardMaterial;
  plywood: THREE.MeshStandardMaterial;
  plywoodDark: THREE.MeshStandardMaterial;
  sandbag: THREE.MeshStandardMaterial;
  containerRed: THREE.MeshStandardMaterial;
  containerBlue: THREE.MeshStandardMaterial;
  containerGreen: THREE.MeshStandardMaterial;
  /** Galvanised structure: the corrugated set, de-rusted and tighter. */
  steel: THREE.MeshStandardMaterial;
  cinder: THREE.MeshStandardMaterial;
  tarp: THREE.MeshStandardMaterial;
}>;

/**
 * Six forged sets carrying eleven materials. The repeats below are authored in
 * WORLD terms: a BoxGeometry face is 0..1 in UV whatever its size, so a repeat
 * of R means R tiles across that face, and the numbers are picked so the
 * surface's `tileMetres` lands close to its real-world scale on the mesh the
 * material is dominantly used on.
 */
export function test1Materials(): Test1Materials {
  const hardpan = forgeSurface('test1-hardpan', hardpanSurface, {
    size: 512, seed: 0xa11a, tileMetres: 4, reliefMetres: 0.032, anisotropy: 8,
  });
  const plywood = forgeSurface('test1-plywood', plywoodSurface, {
    size: 512, seed: 0xa22b, tileMetres: 1.2, reliefMetres: 0.006,
  });
  const corrugated = forgeSurface('test1-corrugated', corrugatedSurface, {
    size: 512, seed: 0xa33c, tileMetres: 2.4, reliefMetres: 0.022,
  });
  const sandbag = forgeSurface('test1-sandbag', sandbagSurface, {
    size: 512, seed: 0xa44d, tileMetres: 1.6, reliefMetres: 0.06,
  });
  const cinder = forgeSurface('test1-cinder', cinderSurface, {
    size: 512, seed: 0xa55e, tileMetres: 1.6, reliefMetres: 0.014,
  });
  const tarp = forgeSurface('test1-tarp', tarpSurface, {
    size: 512, seed: 0xa66f, tileMetres: 2, reliefMetres: 0.01,
  });

  // Container colours are a TINT on one shared corrugation set. `map`
  // multiplies and is capped at white, so a tint can only ever darken; the hex
  // values are therefore chosen bright and the corrugation's own value range
  // carries the shading (gotcha: three.js material.color cannot lighten).
  //
  // METALNESS 0, not 0.55 (extraction doc, "Metalness discipline: bare metal is
  // 1, every oxide/paint/dirt layer on top of it is 0"). A painted container is
  // a dielectric coat over steel and never shows the steel; upstream's rule
  // says so directly. Here it is not even a stylistic call. Metalness scales
  // diffuse by (1 - metalness) and hands the energy to the specular
  // environment term - and `scene.environment` is NULL on this route (measured
  // 2026-08-30 on all eight arenas; the PMREM in arena-environment-ibl.ts is
  // not reaching the scene), so 0.55 was deleting 55% of a container's response
  // and getting nothing back. Combined with the dark v2 base that is the whole
  // reason the container yard rendered as black boxes: measured 0.0011 linear
  // Y on a container top in full sun, against 0.12 for the dust beside it.
  //
  // The authored `roughness` is deliberately omitted: `surfaceStandardMaterial`
  // forces the scalar to 1 whenever a roughnessMap exists (surface-forge.ts),
  // so passing one here only misleads the next reader - the forge's roughness
  // field is the authority, and material-compatibility.ts clamps the scalar to
  // 0.98 on top of it.
  const container = (color: number, name: string): THREE.MeshStandardMaterial =>
    forgedMaterial(corrugated, name, { color, metalness: 0, normalScale: 1.1, metresPerTile: 2.4 });

  return Object.freeze({
    hardpan: forgedMaterial(hardpan, 'test1-hardpan', { roughness: 0.99, normalScale: 0.85, metresPerTile: 4 }),
    road: forgedMaterial(hardpan, 'test1-road', { color: 0xc3b59b, roughness: 0.97, normalScale: 1.1, metresPerTile: 5 }),
    plywood: forgedMaterial(plywood, 'test1-plywood', { roughness: 0.9, metresPerTile: 1.2 }),
    // The boundary fence and the target posts. 0xa1815a took the ply's own
    // dark stop to 0.037 linear Y, so the fence - a 74 m band across the top of
    // every flyover frame - crushed on its shaded side.
    plywoodDark: forgedMaterial(plywood, 'test1-plywood-dark', { color: 0xc0a071, roughness: 0.93, metresPerTile: 1.2 }),
    sandbag: forgedMaterial(sandbag, 'test1-sandbag', { roughness: 0.99, normalScale: 1.05, metresPerTile: 1.6 }),
    containerRed: container(0xd97a62, 'test1-container-red'),
    containerBlue: container(0x6f9fc4, 'test1-container-blue'),
    // 0x8fa878 resolved at 80 deg - a yellow-green that sat with the tarps
    // rather than reading as the third container colour. 96 deg at the same
    // luminance (linear Y 0.316 -> 0.321).
    containerGreen: container(0x7fae6c, 'test1-container-green'),
    // Galvanised roofing: the corrugated set de-rusted and tighter. Hot-dip
    // zinc weathers to a chalked oxide within a season, which is a dielectric
    // (extraction: "every oxide layer on top of it is 0"), and with no
    // scene.environment the old 0.7 was subtracting 70% of the roofs' only
    // light source. These four roofs are the largest horizontals on the map and
    // measured 0.0022 linear Y - the black slabs in the flyover.
    steel: forgedMaterial(corrugated, 'test1-steel', { color: 0xd7dee2, metalness: 0.08, normalScale: 0.4, metresPerTile: 3.6 }),
    cinder: forgedMaterial(cinder, 'test1-cinder', { roughness: 0.95, normalScale: 1.15, metresPerTile: 1.6 }),
    tarp: forgedMaterial(tarp, 'test1-tarp', { roughness: 0.96, side: THREE.DoubleSide, metresPerTile: 2 }),
  });
}

export type Test2Materials = Readonly<{
  travertine: THREE.MeshStandardMaterial;
  stucco: THREE.MeshStandardMaterial;
  /** Cut ashlar (coping, balustrade, plinths): travertine at 1/10 the scale. */
  stone: THREE.MeshStandardMaterial;
  hedge: THREE.MeshStandardMaterial;
  poolTile: THREE.MeshStandardMaterial;
  court: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
}>;

export function test2Materials(): Test2Materials {
  const travertine = forgeSurface('test2-travertine', travertineSurface, {
    size: 512, seed: 0xb11a, tileMetres: 2.4, reliefMetres: 0.009, anisotropy: 8,
  });
  const stucco = forgeSurface('test2-stucco', stuccoSurface, {
    size: 512, seed: 0xb22b, tileMetres: 2.4, reliefMetres: 0.005,
  });
  const hedge = forgeSurface('test2-hedge', hedgeSurface, {
    size: 512, seed: 0xb33c, tileMetres: 1, reliefMetres: 0.03,
  });
  const poolTile = forgeSurface('test2-pool-tile', poolTileSurface, {
    size: 512, seed: 0xb44d, tileMetres: 1.2, reliefMetres: 0.004,
  });
  const court = forgeSurface('test2-court', courtSurface, {
    size: 512, seed: 0xb55e, tileMetres: 3, reliefMetres: 0.003,
  });
  const timber = forgeSurface('test2-timber', timberSurface, {
    size: 512, seed: 0xb66f, tileMetres: 1.6, reliefMetres: 0.007,
  });

  return Object.freeze({
    travertine: forgedMaterial(travertine, 'test2-travertine', { roughness: 0.86, normalScale: 0.9, metresPerTile: 2.4 }),
    stucco: forgedMaterial(stucco, 'test2-stucco', { roughness: 0.9, normalScale: 0.9, metresPerTile: 3 }),
    // Cut ashlar: the same travertine, read at a third of the scale so coping
    // and balustrade run as 0.8 m blocks rather than 2.4 m slabs.
    // Cool grey limestone, not more travertine. Under the key the two are
    // indistinguishable (27 deg against 26 deg - a golden key overwhelms a
    // neutral albedo), but this arena's fill is 0x8fb2d8 and it is the SHADED
    // faces of coping, balustrade and step nosings that a player reads, so a
    // cooler albedo is where the extraction's "cool stone against warm floor"
    // actually resolves. Luminance is HELD, and that is not cosmetic: the first
    // attempt at 0xb8bcc6 took the lit face 0.391 -> 0.338 linear Y and pushed
    // 2.3% of the flyover frame - every shaded coping and balustrade return -
    // through the 0.02 crush floor the last pass had just cleared. 0xc6cad4 is
    // 0.397, i.e. the same stone value in a cooler spectrum.
    stone: forgedMaterial(travertine, 'test2-stone', { color: 0xc6cad4, roughness: 0.88, normalScale: 1.1, metresPerTile: 0.8 }),
    hedge: forgedMaterial(hedge, 'test2-hedge', { roughness: 0.97, normalScale: 1.4, metresPerTile: 1 }),
    poolTile: forgedMaterial(poolTile, 'test2-pool-tile', { roughness: 0.3, metalness: 0.05, normalScale: 0.7, metresPerTile: 1.2 }),
    court: forgedMaterial(court, 'test2-court', { roughness: 0.72, normalScale: 0.8, metresPerTile: 3 }),
    timber: forgedMaterial(timber, 'test2-timber', { roughness: 0.8, normalScale: 1.1, metresPerTile: 1.6 }),
  });
}

// ---------------------------------------------------------------------------
// Dressing helpers
// ---------------------------------------------------------------------------

function presentationMesh(mesh: THREE.Mesh | THREE.InstancedMesh, castShadow = true): typeof mesh {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.raycast = () => undefined;
  return mesh;
}

function addBox(root: THREE.Group, name: string, position: [number, number, number], size: [number, number, number], material: THREE.Material, rotationY = 0, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  worldTiled(mesh, size);
  root.add(presentationMesh(mesh, castShadow));
  return mesh;
}

function addCylinder(root: THREE.Group, name: string, position: [number, number, number], radiusTop: number, radiusBottom: number, height: number, material: THREE.Material, segments = 10): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.name = name;
  mesh.position.set(...position);
  root.add(presentationMesh(mesh));
  return mesh;
}

/** An axis-aligned keep-out box for the vegetation clearance predicate. */
type KeepOut = readonly [minX: number, maxX: number, minZ: number, maxZ: number];

/**
 * Builds the kit's `allow` predicate from planting bands plus keep-out rects.
 *
 * THE RULE THIS ENCODES: no vegetation stands in a fighting area unless it is
 * too short to hide anyone. Vegetation is presentation-only — a round crosses
 * it without a scratch — so a canopy that blocks SIGHT while blocking no shots
 * is the worst object a map can contain, and the extraction doc's clearance
 * contract exists exactly to keep it out. Everything the player can actually
 * hide behind on these maps is an authored, collided, shot-rated mass in
 * src/test-maps.ts (hedge blocks, planters, berms, containers); the kit
 * supplies the density AROUND the fight.
 *
 * Bands are declared PER KIND, because the answer differs by height: a 0.5 m
 * dry-scrub tuft sits below the crouched eye-line and is welcome along a
 * verge, while a 1.1 m shrub or a 5 m cypress is not, and lives beyond the
 * fence or wall. Keep-outs are inflated by the plant's canopy radius at its
 * final scale, so an overhang is rejected as well as a trunk.
 */
function clearancePredicate(
  bandsByKind: Readonly<Record<PlantKind, readonly KeepOut[]>>,
  keepOuts: readonly KeepOut[],
): ClearancePredicate {
  return (x, z, radiusM, kind) => {
    let inBand = false;
    for (const [minX, maxX, minZ, maxZ] of bandsByKind[kind]) {
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) { inBand = true; break; }
    }
    if (!inBand) return false;
    for (const [minX, maxX, minZ, maxZ] of keepOuts) {
      if (x >= minX - radiusM && x <= maxX + radiusM && z >= minZ - radiusM && z <= maxZ + radiusM) return false;
    }
    return true;
  };
}

/** No planting of this kind anywhere. Keeps the per-kind band table total. */
const NO_BAND: readonly KeepOut[] = Object.freeze([]);

/** Mirror a keep-out rect through the origin (the Test2 fairness involution). */
function rotated(rect: KeepOut): KeepOut {
  return [-rect[1], -rect[0], -rect[3], -rect[2]] as const;
}

/** Mirror a keep-out rect across z = 0 (the Test1 fairness involution). */
function mirroredZ(rect: KeepOut): KeepOut {
  return [rect[0], rect[1], -rect[3], -rect[2]] as const;
}

// ---------------------------------------------------------------------------
// Test1 dressing — the range complex
// ---------------------------------------------------------------------------

/**
 * Vegetation and backdrop for Test1, plus the small props.
 *
 * Every keep-out below is authored as a `[minX, maxX, minZ, maxZ]` rect and
 * mirrored through z = 0, which is the involution that swaps the two teams on
 * this map (see the symmetry note at the top of src/test-maps.ts).
 */
export function applyTest1Dressing(root: THREE.Group, materials: Test1Materials): EnvironmentBuildResult {
  const rng = mulberry32(0x7e571);
  const dressing = new THREE.Group();
  dressing.name = 'test1-dressing';
  dressing.userData.presentationOnly = true;
  root.add(dressing);

  // Same metalness discipline as the containers above: a painted drum and a
  // rusted drum are both a dielectric layer over the steel, and with
  // scene.environment null the metal branch returns nothing to replace the
  // diffuse it removes. Only genuinely bare, polished metal keeps any.
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x5d666b, roughness: 0.6, metalness: 0.12 });
  const drumOlive = new THREE.MeshStandardMaterial({ color: 0x6d7c50, roughness: 0.7, metalness: 0 });
  const drumRust = new THREE.MeshStandardMaterial({ color: 0x955c38, roughness: 0.8, metalness: 0 });
  // Tyre carbon black bottoms out near 0.045 linear Y in life; 0x23211e is
  // 0.017, i.e. below the crush floor before a single light reaches it.
  const rubber = new THREE.MeshStandardMaterial({ color: 0x36322c, roughness: 0.95, metalness: 0 });
  const flagRed = new THREE.MeshStandardMaterial({ color: 0xc23c2c, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  const paintWhite = new THREE.MeshStandardMaterial({ color: 0xe6e0cf, roughness: 0.85, metalness: 0 });
  const paintYellow = new THREE.MeshStandardMaterial({ color: 0xd8b23c, roughness: 0.88, metalness: 0 });

  // --- perimeter berm ring + ridgeline backdrop + scrub -------------------
  // Both live OUTSIDE the fence, so nothing here can occlude a lane.
  const bermMaterial = materials.road;
  for (const [bx, bz, bw, bd] of [
    [0, -30, 74, 8], [0, 30, 74, 8], [-37, 0, 8, 60], [37, 0, 8, 60],
  ] as const) {
    addBox(dressing, 'test1-berm-ring', [bx, 1.3, bz], [bw, 2.6, bd], bermMaterial, 0, false);
  }

  // The verge INSIDE the fence takes dry-scrub only: 0.5 m tufts sit below the
  // crouched eye-line, so they can add density along a boundary without ever
  // hiding a body. Shrubs and trees are barred from the playfield entirely
  // (NO_BAND) and live in the treeline pass below.
  const test1Verge: readonly KeepOut[] = [
    [-31.4, -27.4, -22.4, 22.4], [27.4, 31.4, -22.4, 22.4],
    [-31.4, 31.4, -22.4, -18.4], [-31.4, 31.4, 18.4, 22.4],
  ];
  const test1KeepOutHalf: readonly KeepOut[] = [
    [-6.5, 6.5, -22.6, -17.0],    // spawn hut + its covered mouth
    [-27.5, -15.5, -22.6, -15.5], // approach road, apron and its barriers
    [15.5, 28.5, -20.5, -13.5],   // ammunition/stores block
    [-32, 32, -21.6, -17.4],      // the end berm line and its walking room
  ];
  const test1KeepOuts: readonly KeepOut[] = [
    ...test1KeepOutHalf, ...test1KeepOutHalf.map(mirroredZ),
  ];
  buildEnvironment(dressing, {
    name: 'test1-verge',
    vegetation: {
      seed: 0x7e5711,
      namePrefix: 'test1-foliage-verge',
      area: { minX: -31.4, maxX: 31.4, minZ: -22.4, maxZ: 22.4 },
      palette: { dryScrub: 0x9d8b58, litter: 0x9c8a60 },
      layers: [{ kind: 'dry-scrub', count: 220, spacings: [1.05] }],
      allow: clearancePredicate(
        { 'dry-scrub': test1Verge, shrub: NO_BAND, conifer: NO_BAND, broadleaf: NO_BAND },
        test1KeepOuts,
      ),
      lod: { nearBandM: 26 },
    },
  });

  // The treeline OUTSIDE the compound, between the berm ring (41 m) and the
  // ridge's 66 m inner rim: scrub trees, thorn shrub and heavy tuft cover on
  // the approach country. Nothing here is inside the fence, so no clearance
  // question arises and the layers can be as dense as the budget allows.
  const test1Treeline: readonly KeepOut[] = [
    [-52, -42, -48, 48], [42, 52, -48, 48],
    [-52, 52, -48, -35], [-52, 52, 35, 48],
  ];
  const environment = buildEnvironment(dressing, {
    name: 'test1-treeline',
    vegetation: {
      seed: 0x7e5713,
      namePrefix: 'test1-foliage-treeline',
      area: { minX: -52, maxX: 52, minZ: -48, maxZ: 48 },
      // Dry-country palette: bleached scrub over the map's own dust colour.
      palette: { dryScrub: 0x9d8b58, shrub: 0x6f7443, trunk: 0x6a5539, coniferCanopy: 0x40532f, litter: 0x9c8a60 },
      layers: [
        { kind: 'conifer', count: 34, spacings: [6.5], scaleRange: [0.7, 1.1] },
        { kind: 'shrub', count: 90, spacings: [3.2, 2.4] },
        { kind: 'dry-scrub', count: 220, spacings: [2.2, 1.4, 1.3] },
      ],
      allow: clearancePredicate(
        { conifer: test1Treeline, shrub: test1Treeline, 'dry-scrub': test1Treeline, broadleaf: NO_BAND },
        [],
      ),
      // Everything out here is beyond the fence, so the whole belt is far tier
      // and costs one merged silhouette draw per kind.
      lod: { nearBandM: 34 },
    },
    ridge: {
      seed: 0x7e5712,
      // Gameplay reaches hypot(32.4, 23.4) = 39.9 m at the fence corners; the
      // kit THROWS if the inner rim falls inside the declared clear radius, so
      // this is a checked contract rather than a hope.
      arenaClearRadiusM: 42,
      innerRadiusM: 66,
      outerRadiusM: 172,
      peakHeightM: 30,
      lobes: [3, 7, 13],
      nearColor: 0x8e7f5e,
      farColor: 0xa79a78,
      // Matched to the arena definition's fog colour (src/rendering/arenas/
      // test1.ts) so the ridge dissolves into the haze it sits in. Art pass
      // 2026-08-31: that fog is defined as "the horizon dust band", and the
      // horizon dust band in sky-backdrop.ts moved from cream to a blue-grey
      // when the flyover window was re-measured, so both follow it to 0xcdd6dd.
      // Fine airborne dust at 100 m+ scatters short wavelengths - the distance
      // in a clear mid-morning desert is blue, not cream - and on a map whose
      // every surface lands in one warm bin it is also the only cool family the
      // ridge ring can honestly carry.
      hazeColor: 0xcdd6dd,
      hazeStrength: 0.7,
      name: 'test1-ridge-ring',
    },
  });

  // --- fence rhythm -------------------------------------------------------
  // 0.22 m uprights: thinner than the parity audit's 0.35 m census floor in
  // both axes, so they are honestly dressing rather than unrated ghost cover.
  for (let post = -7; post <= 7; post += 1) {
    addBox(dressing, 'test1-fence-post-n', [post * 4.2, 1.5, -22.9], [0.22, 3, 0.22], materials.plywoodDark);
    addBox(dressing, 'test1-fence-post-s', [post * 4.2, 1.5, 22.9], [0.22, 3, 0.22], materials.plywoodDark);
  }
  for (let post = -5; post <= 5; post += 1) {
    addBox(dressing, 'test1-fence-post-w', [-31.9, 1.5, post * 4.2], [0.22, 3, 0.22], materials.plywoodDark);
    addBox(dressing, 'test1-fence-post-e', [31.9, 1.5, post * 4.2], [0.22, 3, 0.22], materials.plywoodDark);
  }
  for (const railZ of [-22.85, 22.85]) {
    addBox(dressing, 'test1-fence-rail', [0, 2.7, railZ], [64, 0.18, 0.14], materials.plywoodDark, 0, false);
  }
  for (const railX of [-31.85, 31.85]) {
    addBox(dressing, 'test1-fence-rail-end', [railX, 2.7, 0], [0.14, 0.18, 46], materials.plywoodDark, 0, false);
  }

  // --- firing line furniture ---------------------------------------------
  // Lane numbers 1..7 on the firing-point kerb. 0.42 m tall: under the 0.9 m
  // census floor, so these are dressing by measurement, not by assertion.
  for (let lane = 0; lane < 7; lane += 1) {
    const laneZ = (lane - 3) * 5;
    addBox(dressing, 'test1-lane-marker', [-15.5, 0.21, laneZ], [0.06, 0.42, 0.6], paintWhite, 0, false);
    addBox(dressing, 'test1-lane-number', [-15.46, 0.26, laneZ], [0.03, 0.26, 0.34], paintYellow, 0, false);
  }
  // Red range flags at both ends of the firing line (cloth: excluded from the
  // ballistic census by name, and correctly so - a round crosses a flag).
  for (const flagZ of [-19.5, 19.5]) {
    addCylinder(dressing, 'test1-flag-pole', [-19.5, 2.4, flagZ], 0.05, 0.07, 4.8, steelDark, 6);
    addBox(dressing, 'test1-flag-cloth', [-19.1, 4.4, flagZ + 0.45], [0.9, 0.55, 0.03], flagRed);
  }
  // Camo netting strung across the container yard, resting on the container
  // tops (2.6 m). Its underside sits at 2.92 m — above the 2.6 m reachable
  // ceiling — and 'tarp' is a cloth exclusion in the ballistic census, which
  // is right: a round crosses netting.
  for (const netZ of [-8, 8]) {
    const net = addBox(dressing, 'test1-camo-net-tarp', [21, 2.95, netZ], [9, 0.06, 6.4], materials.tarp, 0, false);
    net.rotation.z = 0.035;
  }

  // --- yard and apron clutter --------------------------------------------
  // Everything below is authored in explicit z-MIRROR PAIRS rather than
  // scattered: the props sit in the gaps between authored masses, and a random
  // scatter over a map this dense reliably drops a drum inside a container.
  // Drums are 0.85 m: visibly a drum, honestly not cover, and under the parity
  // audit's 0.9 m walk-through census floor by measurement.
  const drumSpots: ReadonlyArray<readonly [number, number]> = [
    [-6.5, 6.5], [11.2, 5.5], [19.5, 7.8], [24.5, 0], [2.5, 13.5], [-19.5, 13.5],
  ];
  for (const [dx, dz] of drumSpots) {
    for (const end of [-1, 1] as const) {
      addCylinder(dressing, 'test1-drum', [dx, 0.425, end * dz], 0.4, 0.4, 0.85, rng() > 0.5 ? drumOlive : drumRust, 12);
    }
  }
  for (const [tx, tz] of [[-11.6, 6], [12.6, 4.6], [9.6, 15.5]] as const) {
    for (const end of [-1, 1] as const) {
      for (let tyre = 0; tyre < 3; tyre += 1) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 14), rubber);
        mesh.name = 'test1-tyre';
        mesh.position.set(tx + (rng() - 0.5) * 0.2, 0.18 + tyre * 0.34, end * tz + (rng() - 0.5) * 0.2);
        mesh.rotation.x = Math.PI / 2;
        dressing.add(presentationMesh(mesh));
      }
    }
  }
  // Ammunition crates: inside the stores blocks and on the yard's open aisles.
  const crateSpots: ReadonlyArray<readonly [number, number]> = [
    [19.4, 17.2], [20.6, 16.3], [24.2, 17.4], [25.4, 16.4], [22, 18.4],
    [10.9, 1.6], [11.3, -1.8], [22.4, 7.4],
  ];
  for (const [cx, cz] of crateSpots) {
    for (const end of [-1, 1] as const) {
      addBox(dressing, 'test1-ammo-crate', [cx, 0.24, end * cz], [0.9, 0.48, 0.55], materials.plywoodDark, rng() * Math.PI);
    }
  }
  // Vehicle-park bay markings: flat paint, 40 mm proud of the apron.
  for (const parkZ of [-1, 1] as const) {
    for (let bay = 0; bay < 4; bay += 1) {
      addBox(dressing, 'test1-bay-stripe', [-26 + bay * 3.4, 0.04, parkZ * 18.5], [0.16, 0.04, 5.2], paintYellow, 0, false);
    }
  }
  // Power line down the yard, inboard of the fence and clear of the container
  // rows: 0.24 m poles, cross-arms above head height.
  for (const poleZ of [-16, -8, 0, 8, 16]) {
    addCylinder(dressing, 'test1-power-pole', [31.2, 2.8, poleZ], 0.09, 0.12, 5.6, materials.plywoodDark, 7);
    addBox(dressing, 'test1-power-cross', [31.2, 5.1, poleZ], [1.4, 0.09, 0.09], materials.plywoodDark);
  }
  // Range-control mast on the tower roof: above the deck, thin, and paired
  // with the loudspeaker drum that sells the tower as a working building.
  addCylinder(dressing, 'test1-control-mast', [1.6, 5.4, 0], 0.06, 0.09, 5.4, steelDark, 6);
  addBox(dressing, 'test1-control-speaker', [1.6, 7.6, 0.34], [0.34, 0.34, 0.3], steelDark, 0, false);

  // Contact grime: a thin dust fillet where each block meets the hardpan, so
  // walls stop reading as decals stood on a plane (extraction doc, "Contact
  // grounding"). 0.22 m tall - dressing by measurement.
  for (const [gx, gz, gw, gd] of [
    [0, 0, 20.4, 8.4],                              // tower core + both annexes
    [-13.8, 0, 6.4, 34],                            // covered firing line
    [-29.5, 0, 4, 42],                              // downrange backstop berm
    [0, -20, 10.6, 4.8], [0, 20, 10.6, 4.8],        // spawn sheds
    [22, -16.7, 11.4, 5.6], [22, 16.7, 11.4, 5.6],  // ammunition/stores blocks
  ] as const) {
    addBox(dressing, 'test1-contact-grime', [gx, 0.11, gz], [gw + 0.6, 0.22, gd + 0.6], bermMaterial, 0, false);
  }

  return environment;
}

// ---------------------------------------------------------------------------
// Test2 dressing — the estate
// ---------------------------------------------------------------------------

/**
 * Vegetation, backdrop and props for Test2.
 *
 * Every keep-out is authored once and rotated 180 degrees through the origin,
 * which is Test2's fairness involution: it maps team 0's half onto team 1's
 * and Domination zone A onto zone C.
 */
export function applyTest2Dressing(root: THREE.Group, materials: Test2Materials): EnvironmentBuildResult {
  const rng = mulberry32(0x7e572);
  const dressing = new THREE.Group();
  dressing.name = 'test2-dressing';
  dressing.userData.presentationOnly = true;
  root.add(dressing);

  const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dee2, roughness: 0.16, metalness: 0.85 });
  const canvasCream = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  // Cool river gravel on the motor court, for the same reason as `stone`: it is
  // the shaded half, lit by the 0x8fb2d8 fill, that separates it from the warm
  // travertine it abuts.
  const gravel = new THREE.MeshStandardMaterial({ color: 0x8f96a4, roughness: 1, metalness: 0 });
  const courtLine = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.7, metalness: 0 });
  const glassBlue = new THREE.MeshStandardMaterial({ color: 0x9fc8d8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.35 });

  // The dry hillside the estate is cut into. The terrace slabs stop 1.5 m
  // outside the estate wall; without this the ground simply ended there and
  // the ridge ring rose out of a void. Named 'terrain' so the parity audit's
  // walkable-surface rule excludes it explicitly rather than by a
  // footprint-share accident.
  //
  // IT IS A RING, NOT A SLAB. v2 laid one 176 x 156 m box spanning y -0.30 to
  // 0.00 across the whole map, and src/test-maps.ts decomposes the terrace into
  // ten bands around THREE cutouts precisely so the pool, the sunken parterre
  // and the sunken court are not buried ("A one-piece slab buried all three -
  // measured on the first art pass: the water sheet sat under the floor").
  // This dressing box reintroduced exactly that: it is coplanar with the
  // terrace tops so the terrace wins the depth test where they overlap, but in
  // the three cutouts nothing contests it, and it capped all three at y = 0.
  // That is what the flyover's three black rectangles were - not shadow, and
  // not the surfaces underneath. The pool basin, the water sheet at y = -0.35,
  // the court floor at -0.35 and the parterre at -0.55 were all under a lid,
  // which is why the brief's headline element ("a turquoise pool throwing
  // light") had no turquoise anywhere in frame.
  //
  // Four bands outside the terrace footprint (x +/-39.5, z +/-30.5) restore the
  // continuous ground without covering anything. Presentation-only and
  // cast:false exactly as before; three extra draws against a 420 budget.
  //
  // The SURFACE changed with it. A dry hillside was wearing a clone of the
  // clipped-box-hedge forge - 40-cell leaf clumps at a 5 m tile over an AO
  // floor of 0.28 - which is both the wrong material and, at 0.010-0.065 linear
  // Y after the tint, the darkest large surface in either arena. Stucco's
  // trowel/grain field at 5 m reads as sun-baked soil and carries a value the
  // ochre tint can actually multiply.
  const hillside = materials.stucco.clone();
  hillside.name = 'test2-hillside';
  // Grey-ochre, not orange. A saturated tint here reads as a Martian plate
  // under this arena's golden key, and this band is the largest single area in
  // any flyover frame, so its chroma dominates the whole arena's hue budget.
  //
  // ART PASS 2026-08-31: that is exactly the problem - 0x9c9a80 resolves at hue
  // 31 deg under this key, i.e. the largest area in the flyover was sitting in
  // the travertine's own bin and making it the dominant one. Taken to dry
  // hillside grass rather than bare soil, which is what a Mediterranean estate
  // is actually cut into: hue 45 deg, its own bin, and linear Y 0.219 -> 0.207
  // so the value the last pass measured for this band is unchanged. 49 deg
  // measured better still and read frankly green on the largest surface in the
  // flyover; 41 deg cost 0.74 of the frame's hue perplexity. 45 holds both.
  hillside.color.setHex(0x8c9c6c);
  hillside.roughness = 1;
  hillside.userData.metresPerTile = 5;
  // Half-extents of the terrace band decomposition in src/test-maps.ts (its
  // aprons are 79 wide and reach z = +/-30.5), and of the ground the ridge
  // ring's 78 m inner rim needs covered.
  const TERRACE_HALF_X = 39.5;
  const TERRACE_HALF_Z = 30.5;
  const GROUND_HALF_X = 88;
  const GROUND_HALF_Z = 78;
  const endBand = (GROUND_HALF_Z - TERRACE_HALF_Z) / 2;
  const sideBand = (GROUND_HALF_X - TERRACE_HALF_X) / 2;
  for (const side of [-1, 1] as const) {
    addBox(dressing, 'test2-hillside-terrain',
      [0, -0.15, side * (TERRACE_HALF_Z + endBand)], [GROUND_HALF_X * 2, 0.3, endBand * 2], hillside, 0, false);
    addBox(dressing, 'test2-hillside-terrain',
      [side * (TERRACE_HALF_X + sideBand), -0.15, 0], [sideBand * 2, 0.3, TERRACE_HALF_Z * 2], hillside, 0, false);
  }

  // --- vegetation + ridgeline --------------------------------------------
  // The estate palette: dark clipped cypress, olive broadleaf, box shrub, over
  // a pale gravel litter. Shared by both passes so the two belts read as one
  // planting scheme.
  //
  // ART PASS 2026-08-31: the canopies were failing the same key-multiply test
  // as the hedge surface (see HEDGE_DEEP). Against a linear key of (1.000,
  // 0.624, 0.287) a canopy needs linear g/r above 1.60 to read green at all;
  // broadleaf 0x5d7440 was 1.60 exactly and resolved at hue 60 deg - the same
  // yellow band as the travertine terrace it is meant to contrast with - and
  // shrub 0x47653a at 76 deg was barely out of it. Conifer was green (86 deg)
  // but at linear Y 0.033 carried no weight in any frame. Re-authored to
  // 94 / 104 / 98 deg with the conifer lifted to 0.043, which is still the
  // darkest mass on the hillside but is now a dark GREEN one. dryScrub goes the
  // other way on purpose: it is dry grass, so it stays warm, but 35 deg put it
  // inside the travertine's own bin, and 42 deg gives the hillside its own.
  const estatePalette = {
    trunk: 0x6b563c,
    broadleafCanopy: 0x4f8c3a,
    coniferCanopy: 0x27522f,
    shrub: 0x3d7434,
    dryScrub: 0x8f9a5e,
    litter: 0xa39a80,
  } as const;

  // INSIDE the estate wall: a clipped border in the 0.6..4.6 m strip behind the
  // wall, and nothing else. The three lanes carry their green as authored
  // hedge blocks and planters in src/test-maps.ts — collided, shot-rated and
  // symmetric — because a 5 m cypress standing in a lane would block sight
  // while stopping no bullet, which is the one thing presentation art must
  // never do. Cypress is admitted here (the border is behind the wall, out of
  // every lane) and broadleaf is not: its 1.6 m canopy overhangs too far.
  const test2Border: readonly KeepOut[] = [
    [-37.4, -33.4, -28.4, 28.4], [33.4, 37.4, -28.4, 28.4],
    [-37.4, 37.4, -28.4, -24.4], [-37.4, 37.4, 24.4, 28.4],
  ];
  const test2KeepOutHalf: readonly KeepOut[] = [
    [-38, -28, -14, 14],          // west motor court and its spawn fan
    [-30, 30, -27, -19.6],        // the north villa wing, veranda and its roof
    [-35.5, -24.5, -21, -11],     // the outbuildings on the west diagonal
    [24.5, 35.5, -21, -11],       // the outbuildings on the east diagonal
  ];
  const test2KeepOuts: readonly KeepOut[] = [
    ...test2KeepOutHalf, ...test2KeepOutHalf.map(rotated),
  ];
  buildEnvironment(dressing, {
    name: 'test2-border',
    vegetation: {
      seed: 0x7e5721,
      namePrefix: 'test2-foliage-border',
      area: { minX: -37.4, maxX: 37.4, minZ: -28.4, maxZ: 28.4 },
      palette: estatePalette,
      layers: [
        // Cypress sentinels first: they own the largest clearance, so every
        // later layer is spaced off them rather than the other way round.
        { kind: 'conifer', count: 26, spacings: [4.6], scaleRange: [0.95, 1.3] },
        { kind: 'shrub', count: 80, spacings: [2.4, 1.9] },
      ],
      allow: clearancePredicate(
        { conifer: test2Border, shrub: test2Border, broadleaf: NO_BAND, 'dry-scrub': NO_BAND },
        test2KeepOuts,
      ),
      lod: { nearBandM: 30 },
    },
  });

  // OUTSIDE the wall: the hillside the estate is cut into, between the wall and
  // the ridge's 78 m inner rim. Olive broadleaf, more cypress, thorn shrub and
  // dry scrub, with no clearance question to answer.
  const test2Hillside: readonly KeepOut[] = [
    [-64, -46, -56, 56], [46, 64, -56, 56],
    [-64, 64, -56, -36], [-64, 64, 36, 56],
  ];
  const environment = buildEnvironment(dressing, {
    name: 'test2-hillside',
    vegetation: {
      seed: 0x7e5723,
      namePrefix: 'test2-foliage-hillside',
      area: { minX: -64, maxX: 64, minZ: -56, maxZ: 56 },
      palette: estatePalette,
      layers: [
        { kind: 'broadleaf', count: 44, spacings: [7.5] },
        { kind: 'conifer', count: 40, spacings: [6, 5.4] },
        { kind: 'shrub', count: 120, spacings: [3.4, 2.8, 2.4] },
        { kind: 'dry-scrub', count: 200, spacings: [2.2, 1.8, 1.4, 1.3] },
      ],
      allow: clearancePredicate(
        { broadleaf: test2Hillside, conifer: test2Hillside, shrub: test2Hillside, 'dry-scrub': test2Hillside },
        [],
      ),
      lod: { nearBandM: 44 },
    },
    ridge: {
      seed: 0x7e5722,
      // Gameplay reaches hypot(38.4, 29.4) = 48.4 m at the wall corners.
      arenaClearRadiusM: 50,
      innerRadiusM: 78,
      outerRadiusM: 196,
      peakHeightM: 34,
      lobes: [2, 5, 11],
      // ART PASS 2026-08-31: the ring is the SAME hillside the terrain band is,
      // continued past the wall, and it was authored as a different and warmer
      // material - 31 and 27 deg against the terrain's 45 - so the arena's
      // largest two surfaces were both feeding the same dominant hue bin from
      // different materials. Matched to the terrain (43 / 38 deg) at unchanged
      // luminance (0.133 -> 0.136, 0.206 -> 0.210); it is one hillside, so it
      // gets one colour.
      nearColor: 0x74805a,
      farColor: 0x939a75,
      // Matched to the arena definition's fog colour (src/rendering/arenas/
      // test2.ts) so the hillsides dissolve into the haze they sit in. The
      // authored 0xe9c9a0 had drifted off that fog (0xe6cbab) and was the
      // single brightest large surface in the flyover at hue 22 deg - i.e. the
      // biggest single contributor to the dominant bin. It now tracks the fog,
      // which this pass took to the lilac a golden-hour valley haze actually is
      // when you look across it rather than into the sun.
      hazeColor: 0xdcc4cd,
      hazeStrength: 0.74,
      name: 'test2-ridge-ring',
    },
  });

  // --- pool life ----------------------------------------------------------
  // Umbrella canopies sit at 2.72 m, above the 2.6 m reachable ceiling; poles
  // are 0.1 m. Both halves are 180-degree pairs of each other.
  for (const side of [-1, 1] as const) {
    for (const along of [-1, 1] as const) {
      const ux = side * along * 11;
      const uz = side * -10.4;
      addCylinder(dressing, 'test2-umbrella-pole', [ux, 1.36, uz], 0.05, 0.05, 2.72, chrome, 8);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.8, 10), canvasCream);
      canopy.name = 'test2-umbrella-canopy';
      canopy.position.set(ux, 3.1, uz);
      dressing.add(presentationMesh(canopy));
    }
    addCylinder(dressing, 'test2-pool-ladder-a', [side * 7.1, 0.35, side * -12.2], 0.04, 0.04, 1.3, chrome, 6);
    addCylinder(dressing, 'test2-pool-ladder-b', [side * 7.1, 0.35, side * -11.6], 0.04, 0.04, 1.3, chrome, 6);
    addBox(dressing, 'test2-towel-stack', [side * -9.4, 0.62, side * -11.2], [0.6, 0.4, 0.5], canvasCream, 0.3, false);
  }

  // --- court markings -----------------------------------------------------
  // Geometry, not texture: at the court surface's 5.9 mm/texel a 50 mm line
  // is 8.5 texels across a 12 m court and blurs away by mip 2. Flush quads at
  // 30 mm proud of the sunken floor stay crisp at every distance.
  const courtY = -0.34;
  for (const edge of [-1, 1] as const) {
    addBox(dressing, 'test2-court-line-side', [edge * 6.6, courtY, 0], [0.08, 0.03, 9.4], courtLine, 0, false);
    addBox(dressing, 'test2-court-line-end', [0, courtY, edge * 4.7], [13.2, 0.03, 0.08], courtLine, 0, false);
    addBox(dressing, 'test2-court-line-key', [edge * 5.2, courtY, 0], [2.6, 0.03, 3.6], courtLine, 0, false);
  }
  addBox(dressing, 'test2-court-line-centre', [0, courtY, 0], [0.08, 0.03, 9.4], courtLine, 0, false);
  const centreCircle = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.04, 6, 36), courtLine);
  centreCircle.name = 'test2-court-line-circle';
  centreCircle.position.set(0, courtY, 0);
  centreCircle.rotation.x = Math.PI / 2;
  dressing.add(presentationMesh(centreCircle, false));
  // Hoops: 0.11 m poles, backboards above the reachable ceiling.
  for (const hoopEnd of [-1, 1] as const) {
    const hx = hoopEnd * 7.4;
    addCylinder(dressing, 'test2-hoop-pole', [hx, 1.7, 0], 0.09, 0.11, 4, chrome, 8);
    addBox(dressing, 'test2-hoop-board', [hx - hoopEnd * 0.5, 3.35, 0], [0.08, 1, 1.6], glassBlue, 0, false);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 14), new THREE.MeshStandardMaterial({ color: 0xd4622c, roughness: 0.5, metalness: 0.5 }));
    ring.name = 'test2-hoop-ring';
    ring.position.set(hx - hoopEnd * 0.85, 3.05, 0);
    ring.rotation.x = Math.PI / 2;
    dressing.add(presentationMesh(ring, false));
  }

  // --- garden dressing ----------------------------------------------------
  // Gravel beds and parterre planting inside the sunken garden, plus urns on
  // the motor courts. Everything under 0.9 m, all in 180-degree pairs.
  for (const side of [-1, 1] as const) {
    for (let bed = 0; bed < 4; bed += 1) {
      // Parterre beds sit ON the sunken garden floor (top at -0.55), so they
      // are 30 mm proud of it rather than floating at grade.
      const bx = side * (-5.2 + bed * 3.5);
      const bz = side * (11.6 + (bed % 2) * 4.6);
      addBox(dressing, 'test2-parterre-bed', [bx, -0.52, bz], [3, 0.06, 3.4], gravel, 0, false);
    }
    for (const urnAlong of [-1, 1] as const) {
      const ux = side * 30.5;
      const uz = side * urnAlong * 3.4;
      addCylinder(dressing, 'test2-urn', [ux, 0.42, uz], 0.4, 0.3, 0.84, materials.stone, 9);
      const urnShrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), materials.hedge);
      urnShrub.name = 'test2-urn-shrub';
      urnShrub.position.set(ux, 1.1, uz);
      dressing.add(presentationMesh(urnShrub));
    }
    // Villa wing detail. The wing wall runs z = side * (25.7 .. 26.3), and BOTH
    // the pilasters and the window band are set 0.12 m proud of its inner face
    // rather than standing clear of it: the ballistic census needs a quarter of
    // a mesh's footprint covered by a registered shot surface, and 0.22 m of
    // each 0.34 m pilaster (0.20 m of each 0.30 m window) lands inside the
    // wall's. Standing them off the wall - which is what v1 did against the old
    // perimeter - makes them ghost cover a round crosses silently.
    for (let bay = -3; bay <= 3; bay += 1) {
      addBox(dressing, 'test2-pilaster', [side * bay * 8.5, 2.1, side * 25.75], [0.9, 4.2, 0.34], materials.stucco);
    }
    // Window bays sit between the pilasters and clear of the authored glazed
    // doors at |x| = 14 (test-maps.ts), so no two panes fight for the same face.
    for (const windowX of [-21.25, -4.25, 4.25, 21.25]) {
      addBox(dressing, 'test2-wing-window', [side * windowX, 2.2, side * 25.75], [2.6, 1.6, 0.3], glassBlue, 0, false);
    }
    addBox(dressing, 'test2-cornice', [0, 4.35, side * 26], [56, 0.4, 0.7], materials.stone, 0, false);
    addBox(dressing, 'test2-cornice-end', [side * 38.2, 3.3, 0], [0.5, 0.35, 58], materials.stone, 0, false);
  }

  // Contact grounding under the estate's heavy masses.
  for (const [gx, gz, gw, gd] of [
    [0, -25.4, 56, 3.2], [0, 25.4, 56, 3.2],
    [-24, -19, 10, 9], [24, 19, 10, 9], [24, -19, 10, 9], [-24, 19, 10, 9],
    [-32, 0, 11, 15], [32, 0, 11, 15],
  ] as const) {
    addBox(dressing, 'test2-contact-grime', [gx, 0.05, gz], [gw + 0.6, 0.1, gd + 0.6], gravel, 0, false);
  }

  // A few scattered loungers and planters, jittered on the seeded stream so
  // the deck does not read as a grid. Height 0.4 m: dressing by measurement.
  for (const side of [-1, 1] as const) {
    for (let lounger = 0; lounger < 3; lounger += 1) {
      const lx = side * (9.4 + lounger * 2.4 + rng() * 0.3);
      addBox(dressing, 'test2-lounger', [lx, 0.3, side * -11.4], [0.8, 0.4, 2], materials.timber, side * 0.06, true);
    }
  }

  return environment;
}
