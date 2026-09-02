/**
 * Per-arena registration of what the ray-traced preset's proxy scene treats as
 * water, plus the single extraction-option set the light node extracts with.
 *
 * WHY THIS EXISTS. Measured on the pass79 tree, the ray-traced preset spawned
 * reflections on 3/0/0/0/0/0 meshes across the six arenas. Two causes:
 *
 *   1. The mirror-roughness ceiling (REFLECTIVE_ROUGHNESS_CEILING, 0.22) is
 *      combat-tuned and MUST NOT move — but several surfaces whose art intent
 *      IS "smooth" sat just above it or carry their gloss in a TSL node graph
 *      where `material.roughness` does not describe the surface at all.
 *   2. Water — the one surface class that is reflective BY DESIGN on an ocean
 *      arena — had no registration path at all.
 *
 * The split of responsibilities this module enforces:
 *
 *   - ART-SUPPORTED MATERIAL EDITS (chrome, polished terrazzo, gelcoat hull)
 *     are made in the arena builders themselves, on the real authored
 *     material, so every renderer agrees the surface is smooth. They are NOT
 *     done here; this module never rewrites what a surface looks like.
 *   - WATER REGISTRATION is done here, because the sea planes' raster look is
 *     owned by other lanes (the compat-route sea material, the shared ocean
 *     TSL factory) and must stay byte-for-byte. Registration changes only
 *     what the TRACER sees: an analytic +Y plane proxy with roughness clamped
 *     to REFLECTIVE_ROUGHNESS_CEILING and metalness to
 *     WATER_PROXY_MAXIMUM_METALNESS.
 *
 * Bounds are untouched: maximumShapes and minimumFootprintM2 are restated
 * from DEFAULT_PROXY_EXTRACTION so `RAY_TRACED_MAXIMUM_SHAPES` remains the
 * authoritative shader-cost budget and nothing here can widen it.
 */

import { DEFAULT_PROXY_EXTRACTION, type ProxyExtractionOptions } from './analytic-proxy-scene';

/**
 * The registered water surfaces, by SOURCE MESH name. The list is explicit —
 * no broad /water|ocean|sea/ sweep — so adding a mesh named e.g.
 * "drainage-water-pipe" can never silently become a mirror. Each entry
 * carries its art justification.
 */
export const ARENA_WATER_SURFACES: readonly Readonly<{ namePattern: RegExp; reason: string }>[] = Object.freeze([
  {
    // HF-394 lagoon: the island's ONE authored waterline (farcrysis.ts), drawn
    // through createFarcrysisSeaSurfaceMaterial. Fresnel sky reflection is
    // literally in that material's contract on the WebGPU route.
    namePattern: /farcrysis-lagoon-water/,
    reason: 'authored island waterline — Fresnel sea by design',
  },
  {
    // Compat-route presentation seas around the flooded island (art pass).
    namePattern: /farcrysis-water-inline/,
    reason: 'compat-route inline sea plane — water reflects by design',
  },
  {
    namePattern: /farcrysis-water-shallow/,
    reason: 'shallow shelf sea plane — water reflects by design',
  },
  {
    // Horizon ocean ring beyond the island bounds.
    namePattern: /farcrysis-vista-ocean/,
    reason: 'horizon vista sea — open water to the sky',
  },
  {
    // MAP3 (HF-409): the showcase shoreline's Gerstner sea (corridor-water.ts).
    // Same class as the shared ocean below and registered for the same reason:
    // its gloss is a TSL Fresnel/specular chain over a displaced surface, so
    // `material.roughness` sees none of it and the extractor would classify a
    // 41 x 54 m sea as matte stone. It is the one genuinely mirror-like
    // surface Map 3 has.
    namePattern: /map3-shoreline-water-surface/,
    reason: 'showcase Gerstner shoreline sea - Fresnel water by design',
  },
  {
    // The SHARED ocean (water-authoring registry, presentationOwner
    // 'shared-ocean'): High Seas' surrounding sea AND RustRig's -19.5 m
    // rig sea. Built by pass64-tsl-scene.makeWater / ocean-tsl, whose slope-
    // modulated gloss lives in TSL nodes, invisible to material.roughness —
    // exactly the surface class this registration exists for.
    namePattern: /Pass 64 TSL perimeter water/,
    reason: 'shared-ocean body (high-seas, rustworks-1v1) — Gerstner sea, reflective by design',
  },
]);

/**
 * THE extraction option set the ray-traced light node runs. Identical bounds
 * to the defaults; only the water registration is added.
 */
export const ARENA_PROXY_EXTRACTION: ProxyExtractionOptions = Object.freeze({
  maximumShapes: DEFAULT_PROXY_EXTRACTION.maximumShapes,
  minimumFootprintM2: DEFAULT_PROXY_EXTRACTION.minimumFootprintM2,
  waterSurfaces: ARENA_WATER_SURFACES.map(({ namePattern }) => ({ namePattern })),
});
