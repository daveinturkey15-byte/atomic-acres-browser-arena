/**
 * map3/foliage-material.ts — the four shading terms that separate a leaf from
 * a green triangle.
 *
 * Repo contract: no ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 * Everything here is a `three/webgpu` MeshStandardNodeMaterial node graph.
 *
 * WHY THERE IS NO `Fn()` IN THIS FILE.
 *
 * The first version wrapped every `colorNode` in `Fn(() => { ... })()`. That
 * compiles under the WebGL2/GLSL backend and renders correctly, and on real
 * WebGPU every mesh using it silently vanishes — the scene dropped to 8 draw
 * calls and 96 triangles with nothing logged on screen. The production TSL in
 * this repository never does that: it assigns built node EXPRESSIONS to
 * `colorNode` directly (`src/farcrysis-tsl-foliage.ts:215`,
 * `src/farcrysis-water-surface.ts:207`, `src/rendering/pass64-tsl-scene.ts:506`)
 * and reserves `Fn` for the one case that genuinely needs statement scope, with
 * explicitly typed parameters.
 *
 * A node graph is built at JavaScript time either way, so a plain JS helper
 * that returns a node does everything `Fn` was being used for here, with none
 * of the risk. `Fn` now appears only where a loop needs its own scope.
 *
 * The terms, in the order they matter:
 *
 *  1. TRANSLUCENCY. A leaf is thin, so light hitting its far side comes
 *     THROUGH it. Without this a canopy with the sun behind it renders as a
 *     black cutout — the single most artificial thing a rendered tree can do.
 *  2. ABAXIAL (underside) SHADING. Half the leaves in any frame show you their
 *     back, and a real underside is paler, matter and less translucent.
 *  3. SENESCENCE. A canopy where every leaf is the same green reads as
 *     plastic. One per-leaf scalar ramps green -> ochre -> tan.
 *  4. EDGE AND SPAN VARIATION, carried from the geometry by `aSpan`/`aSide`.
 *
 * There is deliberately NO texture. The variation is positional and per-leaf:
 * cheaper than an atlas, no mip or alpha-coverage failure at distance, and not
 * an imported asset by any definition.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { fbm2, warpedFbm2, ridgedFbm2, xz } from './noise';

/**
 * One cast boundary. TSL is a runtime DSL whose TypeScript definitions do not
 * model operator chaining or its polymorphic overloads; the repo's own node
 * code works around this with `as unknown as Node<'vec3'>` at every assignment.
 * Collapsing it here keeps the graphs below readable.
 */
const {
  abs, attribute, cameraPosition, clamp, cos, dot, float, frontFacing, mix,
  normalWorld, normalize, positionLocal, positionWorld, pow, select, sin,
  smoothstep, sub, uniform, vec3,
} = TSL as unknown as Record<string, any>;

export interface FoliageUniforms {
  sunDirection: ReturnType<typeof uniform>;
  sunColor: ReturnType<typeof uniform>;
  transmissionStrength: ReturnType<typeof uniform>;
  time: ReturnType<typeof uniform>;
  /** 0 = every enhancement off (the "before" state), 1 = full. */
  enhance: ReturnType<typeof uniform>;
  /** Wind speed in m/s. Drives sway amplitude and gust rate together. */
  windSpeed: ReturnType<typeof uniform>;
  /** Wind bearing as a unit XZ direction. */
  windDirection: ReturnType<typeof uniform>;
}

export function createFoliageUniforms(): FoliageUniforms {
  return {
    sunDirection: uniform(new THREE.Vector3(0.42, 0.55, -0.72).normalize()),
    sunColor: uniform(new THREE.Color(1.0, 0.94, 0.78)),
    transmissionStrength: uniform(1.0),
    time: uniform(0),
    enhance: uniform(1),
    windSpeed: uniform(1.4),
    windDirection: uniform(new THREE.Vector3(0.82, 0, 0.57).normalize()),
  };
}

/**
 * Colour literal -> TSL vec3.
 *
 * NOT `vec3(color.toArray())`: TSL's vec3() takes scalar components or a node,
 * and handing it a JS array silently produces a broken node rather than an
 * error — the material compiles, renders black, and looks exactly like a
 * lighting bug.
 *
 * THREE.Color stores linear-working-space components under colour management,
 * which is what an albedo node wants.
 */
export function rgb(hex: THREE.ColorRepresentation, scale = 1) {
  const c = new THREE.Color(hex);
  return vec3(c.r * scale, c.g * scale, c.b * scale);
}

export interface FoliagePalette {
  /** Top surface of a healthy leaf. */
  top: THREE.ColorRepresentation;
  /** Underside — paler and slightly desaturated. */
  under: THREE.ColorRepresentation;
  /** Fully senescent. */
  dead: THREE.ColorRepresentation;
  /** Deep shade tint mixed in at the petiole end. */
  shade: THREE.ColorRepresentation;
}

export const SUMMER_PALETTE: FoliagePalette = {
  top: 0x4c7a2e, under: 0x8fae72, dead: 0xa8813f, shade: 0x24401d,
};
export const AUTUMN_PALETTE: FoliagePalette = {
  top: 0xa86a22, under: 0xc9a061, dead: 0x8a5326, shade: 0x4d3312,
};
export const SPRING_PALETTE: FoliagePalette = {
  top: 0x6da33a, under: 0xa9c882, dead: 0xa8813f, shade: 0x2f5223,
};
export const WINTER_PALETTE: FoliagePalette = {
  top: 0x6b6a4e, under: 0x8d8b70, dead: 0x6f5a34, shade: 0x33321f,
};

/**
 * Build the foliage material.
 *
 * `uniforms` is shared across every call so the whole scene animates and
 * re-tunes from one place — and so the WebGPU backend can reuse one pipeline
 * per palette rather than one per plant. Node identity is what three hashes
 * into the pipeline cache key, so two structurally identical graphs built from
 * two separate calls do NOT share a pipeline.
 */
export function createFoliageMaterial(
  uniforms: FoliageUniforms,
  palette: FoliagePalette = SUMMER_PALETTE,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;
  mat.roughness = 0.82;
  mat.metalness = 0.0;

  const cTop = rgb(palette.top);
  const cUnder = rgb(palette.under);
  const cDead = rgb(palette.dead);
  const cShade = rgb(palette.shade);

  const span = attribute('aSpan', 'float');
  const side = attribute('aSide', 'float');
  const dead = attribute('aDead', 'float');

  // --- base albedo -------------------------------------------------------
  // Darker and bluer toward the petiole; the underside is a different colour
  // rather than a darker top; edges thin and pale; senescence overrides all.
  const base = mix(cShade, cTop, smoothstep(float(0.0), float(0.55), span));
  const withFace = select(frontFacing, base, mix(base, cUnder, float(0.75)));
  const edge = smoothstep(float(0.55), float(1.0), abs(side));
  const withEdge = mix(withFace, mix(withFace, cUnder, float(0.35)), edge.mul(0.5));
  const albedo = mix(withEdge, cDead, dead);

  mat.colorNode = albedo;

  // --- wind ---------------------------------------------------------------
  //
  // Sway scales with HEIGHT ABOVE GROUND, because that is what makes a canopy
  // move like a tree rather than like a flag: a trunk base is rigid, a branch
  // tip is not. Two incommensurate frequencies (1.7 and 0.43) keep the motion
  // from settling into a visible pulse - harmonically related ones march in
  // lockstep within seconds of standing still, which is the single cheapest
  // way to make a scene read as fake.
  //
  // The phase also varies with world XZ, so neighbouring plants are never in
  // step with each other and a gust visibly travels across the stand.
  {
    const t = uniforms.time;
    const w = uniforms.windSpeed;
    const dir = uniforms.windDirection;
    const p = positionWorld;

    const height = clamp(p.y.mul(0.34), float(0), float(1.6));
    const phase = p.x.mul(0.21).add(p.z.mul(0.17)).add(t.mul(1.7));
    const gust = sin(t.mul(0.43).add(p.x.mul(0.06))).mul(0.5).add(0.85);
    const sway = sin(phase).mul(0.055).add(cos(phase.mul(1.9)).mul(0.022));

    const amount = sway.mul(height).mul(w).mul(gust).mul(uniforms.enhance);
    mat.positionNode = positionLocal.add(vec3(dir.x.mul(amount), float(0), dir.z.mul(amount)));
  }

  // --- roughness ---------------------------------------------------------
  // A dead leaf is dry and matte; an underside is matte; a young tip is waxy.
  const roughBase = mix(float(0.62), float(0.86), span);
  const roughFace = select(frontFacing, roughBase, roughBase.add(0.1));
  mat.roughnessNode = clamp(mix(roughFace, float(0.95), dead), float(0.0), float(1.0));

  // --- translucency (the term that does the work) ------------------------
  //
  // Emission is the honest place for this in a standard PBR graph: energy
  // leaving the surface that did not come from a reflection lobe. The lobe is
  // taken against the view vector using a light direction BENT by the surface
  // normal, which makes the glow follow the leaf's curvature instead of
  // appearing uniformly wherever the sun happens to be behind it. Because the
  // geometry is cupped and twisted per leaf, that bend differs for every leaf
  // in a clump — which is why the curvature in leaf-geometry.ts and this term
  // only pay off together.
  const V = normalize(sub(cameraPosition, positionWorld));
  const L = normalize(uniforms.sunDirection);
  const bent = normalize(sub(L.negate(), normalWorld.mul(float(0.45))));
  const lobe = pow(clamp(dot(V, bent), float(0.0), float(1.0)), float(3.5));

  // Thin at the tip and the margins, thick at the petiole and the midrib.
  const thin = mix(float(0.35), float(1.0), span).mul(
    mix(float(0.6), float(1.0), smoothstep(float(0.2), float(1.0), abs(side))),
  );
  // The back of a leaf transmits LESS: it is the waxy lit side that scatters.
  const faceScale = select(frontFacing, float(1.0), float(0.55));
  const alive = sub(float(1.0), dead).mul(0.85).add(0.15);

  const amount = lobe
    .mul(thin)
    .mul(faceScale)
    .mul(alive)
    .mul(uniforms.transmissionStrength)
    .mul(uniforms.enhance);

  // Glow the leaf's own colour lit by the sun, never the sun's colour alone.
  mat.emissiveNode = albedo.mul(uniforms.sunColor).mul(amount).mul(float(1.35));

  return mat;
}

/**
 * The deliberately unenhanced material for a side-by-side plate: same
 * geometry, same palette, same triangle count — flat green, no transmission,
 * no face differentiation. This exists so a corridor can PROVE the difference
 * rather than assert it.
 */
export function createFlatFoliageMaterial(
  palette: FoliagePalette = SUMMER_PALETTE,
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.side = THREE.DoubleSide;
  mat.roughness = 0.82;
  mat.metalness = 0;
  mat.colorNode = rgb(palette.top);
  return mat;
}

/**
 * Bark. Also textureless: the variation is a cheap positional stripe plus a
 * vertical darkening, which at trunk scale reads better than a tiled texture
 * because it never repeats visibly.
 */
export function createBarkMaterial(tint = 0x6a5a44): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.95;
  mat.metalness = 0;

  const p = positionWorld;
  // Two incommensurate frequencies so the fissures never tile. Harmonically
  // related ones would march together and read as stripes.
  const a = p.x.mul(11.3).add(p.z.mul(9.1)).sin();
  const b = p.x.mul(4.7).sub(p.z.mul(5.3)).sin();
  const fissure = a.mul(0.6).add(b.mul(0.4)).mul(0.5).add(0.5);
  // Damp toward the ground: bark is darker and wetter at the base.
  const ground = smoothstep(float(0.0), float(3.0), p.y);
  mat.colorNode = mix(
    rgb(tint, 0.45),
    rgb(tint),
    clamp(fissure.mul(ground.mul(0.6).add(0.4)), float(0), float(1)),
  );
  return mat;
}

/**
 * Ground. A forest floor is not one colour — it is soil showing through a
 * broken layer of fallen material. Two noise octaves and a moss term give that
 * without a texture; the actual litter is real geometry on top.
 */
export function createForestFloorMaterial(
  zones?: { z1: number; z2: number },
): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.98;
  mat.metalness = 0;

  const p = positionWorld;

  // Real value-noise fBM, not products of sines.
  //
  // The previous version multiplied sin(x*a) by cos(z*b), which is a GRID by
  // construction and rendered as a visible checkerboard on the floor. See
  // noise.ts for why no number of octaves of that shape can fix it: they are
  // all aligned to the same two axes. These octaves are hashed and rotated.
  //
  // Three scales, each doing a different job: a large warped blotch for where
  // soil shows through, a medium break-up, and a fine grain for close-up.
  const blotch = warpedFbm2(xz(p, 0.055), 0.7, 4);
  const breakup = fbm2(xz(p, 0.42), 3);
  const grainN = fbm2(xz(p, 3.1), 2);
  const f = blotch.mul(0.6).add(breakup.mul(0.3)).add(grainN.mul(0.1));

  // Ridged noise for the dry cracks that show through thin litter. Sparse, so
  // it reads as a detail rather than a pattern.
  const cracks = ridgedFbm2(xz(p, 0.9), 3);
  const crackMask = smoothstep(float(0.72), float(0.95), cracks).mul(0.35);

  const grain = grainN.sub(0.5).mul(0.06);
  const mossy = smoothstep(float(0.58), float(0.9), blotch);

  // Per-zone floors. Broadleaf duff, then a rust-brown needle bed under the
  // conifers, then heavy ochre leaf litter in the autumn grove. Without this
  // the ground is one colour down the whole corridor and visually flattens
  // three distinct zones into one.
  const broadleaf = mix(mix(rgb(0x3a2c1e), rgb(0x5c4526), f), rgb(0x3f5326), mossy.mul(0.6));
  const needle = mix(mix(rgb(0x2e2318), rgb(0x5a3d22), f), rgb(0x36452a), mossy.mul(0.35));
  const autumnBed = mix(mix(rgb(0x4a3418), rgb(0x7d5a24), f), rgb(0x8a6a2c), mossy.mul(0.25));

  let base = broadleaf;
  if (zones) {
    // Blend across the boundary over ~4 m rather than switching, so the zones
    // meet in a gradient instead of a ruled line on the floor.
    const toNeedle = smoothstep(float(zones.z1 + 2), float(zones.z1 - 2), p.z);
    const toAutumn = smoothstep(float(zones.z2 + 2), float(zones.z2 - 2), p.z);
    base = mix(mix(broadleaf, needle, toNeedle), autumnBed, toAutumn);
  }

  mat.colorNode = mix(base, rgb(0x241a10), crackMask).add(vec3(grain, grain, grain));
  // Damp soil is rougher than dry litter; tie roughness to the same field so
  // the specular break-up lines up with the colour break-up instead of
  // fighting it.
  mat.roughnessNode = mix(float(0.99), float(0.86), f);
  return mat;
}

/** Advance shared animation time. One call per frame drives every material. */
export function updateFoliageTime(uniforms: FoliageUniforms, elapsed: number): void {
  (uniforms.time as unknown as { value: number }).value = elapsed;
}

/** Point the sun. Season and time-of-day both write here. */
export function setSun(
  uniforms: FoliageUniforms,
  direction: THREE.Vector3,
  color: THREE.Color,
): void {
  (uniforms.sunDirection as unknown as { value: THREE.Vector3 }).value
    .copy(direction.clone().normalize());
  (uniforms.sunColor as unknown as { value: THREE.Color }).value.copy(color);
}

/** Drive the wind. Weather writes here. */
export function setWind(
  uniforms: FoliageUniforms,
  speed: number,
  bearingRadians: number,
): void {
  (uniforms.windSpeed as unknown as { value: number }).value = speed;
  (uniforms.windDirection as unknown as { value: THREE.Vector3 }).value
    .set(Math.sin(bearingRadians), 0, Math.cos(bearingRadians));
}

/** Fade every enhancement for the corridor's before/after lever. */
export function setEnhance(uniforms: FoliageUniforms, amount: number): void {
  (uniforms.enhance as unknown as { value: number }).value = Math.max(0, Math.min(1, amount));
}
