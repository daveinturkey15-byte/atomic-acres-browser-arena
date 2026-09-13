/**
 * farcrysis-water-surface.test.ts — HF-394 gates.
 *
 * Pins the reflective/refractive sea surface WITHOUT weakening anything:
 *   1. WEBGPU ROUTE — the factory returns a typed TSL node material carrying
 *      both a colour (reflection+absorption) and an opacity (transmission)
 *      graph, and the reflection strength stays <= 1 so the HF-362
 *      bloom-threshold contract cannot regress.
 *   2. COMPAT ROUTE — on WebGL2 and in non-browser/test environments the
 *      factory returns today's plain MeshStandardMaterial with EXACTLY the
 *      compatOpacity the surface shipped with (byte-identical compat look).
 *   3. DEPTH BAKE — bakeFarcrysisWaterDepth writes aWaterDepth from the live
 *      CPU authority (swellDepthFactor): ~0 over dry interior ground,
 *      saturating over the offshore seabed.
 *   4. WIRING GUARD (failure mode #1) — the two live call sites are pinned by
 *      source assertion: the lagoon plane (farcrysis.ts) and the deep inline
 *      plane (farcrysis-art.ts) must both be built through this factory and
 *      have their depth baked, or a player can never see any of this.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { normalWorld, transformedNormalWorld } from 'three/tsl';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bakeFarcrysisWaterDepth,
  createFarcrysisSeaSurfaceMaterial,
  FARCRYSIS_WATER_DEPTH_ATTRIBUTE,
  RIPPLE_NORMAL_FADE_FAR_M,
  RIPPLE_NORMAL_FADE_NEAR_M,
  SEA_REFLECTION_STRENGTH,
  SKY_REFLECTION_HORIZON,
  SKY_REFLECTION_ZENITH,
} from './farcrysis-water-surface';

const PARAMS = {
  baseColor: 0x0e5e7e,
  shallowColor: 0x14606f,
  roughness: 0.24,
  metalness: 0.02,
  opacityShallow: 0.6,
  opacityDeep: 0.94,
  compatOpacity: 0.88,
} as const;

function stubDocument(renderBackend?: string): void {
  vi.stubGlobal('document', {
    documentElement: { dataset: renderBackend ? { renderBackend } : {} },
  });
}

describe('farcrysis sea surface material', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('builds a TSL node material with reflection + transmission graphs on WebGPU', () => {
    stubDocument('webgpu');
    const material = createFarcrysisSeaSurfaceMaterial(PARAMS);
    const node = material as THREE.Material & { isNodeMaterial?: boolean };
    expect(node.isNodeMaterial).toBe(true);
    // Reflection lives in the colour graph, refraction grading in opacity:
    // both graphs must exist or the feature is silently absent.
    const nodeMaterial = material as unknown as Record<string, unknown>;
    expect(nodeMaterial.colorNode).not.toBeNull();
    expect(nodeMaterial.opacityNode).not.toBeNull();
    // 2026-08-26 overview captures (real WebGPU): the ripple normal map
    // minifies into a hard checkerboard moiré across the open sea. The
    // graph must carry a distance-faded ripple normal (present near, flat
    // far) or the horizon the mountain ring created shimmers.
    // PARAMS carries no normalMap, so there is no ripple to fade here and normalNode is
    // legitimately absent. Asserting it non-null on THIS material would have been satisfied
    // by assigning the flat geometric normal - the letter of the guard with none of its
    // point. The real path is exercised below instead.
    expect(nodeMaterial.normalNode ?? null).toBeNull();
  });

  it('fades the ripple normal with distance when a normal map is supplied', () => {
    stubDocument('webgpu');
    const material = createFarcrysisSeaSurfaceMaterial({
      ...PARAMS,
      normalMap: new THREE.Texture(),
    }) as unknown as Record<string, unknown>;
    // The ripple normal map minifies into a hard checkerboard moire across the open sea -
    // measured on real WebGPU 2026-08-26. The graph must carry a ripple normal that fades
    // to flat with camera distance, so the horizon does not shimmer.
    expect(material.normalNode).not.toBeNull();
    expect(material.normalNode).toBeDefined();
    // The fade window must be a real interval, and near must precede far or smoothstep
    // silently inverts and the ripple would appear only in the distance.
    expect(RIPPLE_NORMAL_FADE_NEAR_M).toBeGreaterThan(0);
    expect(RIPPLE_NORMAL_FADE_FAR_M).toBeGreaterThan(RIPPLE_NORMAL_FADE_NEAR_M);
  });

  // -----------------------------------------------------------------------
  // HF-394 COORDINATE-SPACE GATE (Pass 81).
  //
  // The shipped fix assigned `mix(rippleVec, transformedNormalWorld, flatten)`
  // to normalNode: a VIEW-space tangent-map normal mixed with a WORLD-space
  // vertex normal, handed to NodeMaterial.setupNormal() which consumes
  // normalNode as VIEW space with no transform. Past the fade distance the far
  // sea's shading normal was world (0,1,0) reinterpreted as view, so it
  // tumbled as the player pitched - in the exact far field the block was
  // written to calm. `transformedNormalWorld` also resolves through the
  // material's OWN setupNormal(), closing a cycle through the node builder,
  // and warned as deprecated on every graph build.
  //
  // The old test could not catch any of that: it asserted normalNode was
  // non-null. This asserts the SPACE.
  // -----------------------------------------------------------------------
  it('mixes the ripple and flat normals in ONE space (view), never world', () => {
    stubDocument('webgpu');
    const material = createFarcrysisSeaSurfaceMaterial({
      ...PARAMS,
      normalMap: new THREE.Texture(),
    }) as unknown as Record<string, unknown>;

    const root = material.normalNode as object | null | undefined;
    expect(root).toBeTruthy();

    // Collect every node reachable from the normal graph.
    const seen = new Set<object>();
    const walk = (value: unknown, depth: number): void => {
      if (depth > 24 || value === null || typeof value !== 'object') return;
      if (seen.has(value as object)) return;
      seen.add(value as object);
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry, depth + 1);
        return;
      }
      for (const key of Object.keys(value as Record<string, unknown>)) {
        walk((value as Record<string, unknown>)[key], depth + 1);
      }
    };
    walk(root, 0);

    // World-space normal accessors must not appear in the normal graph: they
    // are the wrong basis for normalNode AND they route back through this
    // material's own setupNormal().
    expect(seen.has(normalWorld as unknown as object)).toBe(false);
    expect(seen.has(transformedNormalWorld as unknown as object)).toBe(false);

    // The colour graph is world space by construction (positionWorld /
    // cameraPosition), and IS allowed to use the world normal - the two
    // graphs must not be confused for each other.
    const colorSeen = new Set<object>();
    const walkColor = (value: unknown, depth: number): void => {
      if (depth > 24 || value === null || typeof value !== 'object') return;
      if (colorSeen.has(value as object)) return;
      colorSeen.add(value as object);
      if (Array.isArray(value)) {
        for (const entry of value) walkColor(entry, depth + 1);
        return;
      }
      for (const key of Object.keys(value as Record<string, unknown>)) {
        walkColor((value as Record<string, unknown>)[key], depth + 1);
      }
    };
    walkColor(material.colorNode, 0);
    expect(colorSeen.has(normalWorld as unknown as object)).toBe(true);
  });

  // Source-level half of the same gate: the flat term must be built with the
  // repo's own working precedent, and the deprecated alias (one warn() per
  // graph build) must be gone from the module entirely.
  it('builds the flat normal with transformNormalToView, as ocean-tsl does', () => {
    const surfaceSource = readFileSync(
      fileURLToPath(new URL('./farcrysis-water-surface.ts', import.meta.url)),
      'utf8',
    );
    expect(surfaceSource).toContain('const flatNormalView = transformNormalToView(normalLocal);');
    expect(surfaceSource).toContain('mat.normalNode = mix(rippleVec, flatNormalView, flatten)');
    expect(surfaceSource).not.toContain('transformedNormalWorld,');
    // The precedent this follows must itself still exist and still be in view
    // space, or the "repo's own correct pattern" claim above goes stale.
    const oceanSource = readFileSync(
      fileURLToPath(new URL('./water/ocean-tsl.ts', import.meta.url)),
      'utf8',
    );
    expect(oceanSource).toContain('material.normalNode = transformNormalToView(');
  });

  it('keeps the sky-reflection contribution bounded for the bloom contract', () => {
    expect(SEA_REFLECTION_STRENGTH).toBeGreaterThan(0);
    expect(SEA_REFLECTION_STRENGTH).toBeLessThanOrEqual(1);
  });

  // HF-394 visual audit (real-WebGPU captures 2026-08-26): the retired
  // sunset palette (warm 0xffb469 at high reflected rays) rendered grazing
  // water as yellow mud against the arena's bright DAY sky. The reflection
  // must agree with the sky a player can actually see (threejs-webgpu-water
  // skill: "sky color, fog, horizon and water palette must agree"). Pinned as
  // physical properties, not hex echoes:
  //   - zenith: BLUE-dominant day sky (b > g > r);
  //   - horizon: pale haze, LIGHTER than the zenith (fog agreement);
  //   - the retired warm zenith hex must never return.
  it('reflects the LIVE day sky, not the retired sunset palette', () => {
    const zenith = new THREE.Color(SKY_REFLECTION_ZENITH);
    const horizon = new THREE.Color(SKY_REFLECTION_HORIZON);
    expect(zenith.b).toBeGreaterThan(zenith.g);
    expect(zenith.g).toBeGreaterThan(zenith.r);
    expect(0.2126 * horizon.r + 0.7152 * horizon.g + 0.0722 * horizon.b)
      .toBeGreaterThan(0.2126 * zenith.r + 0.7152 * zenith.g + 0.0722 * zenith.b);
    // Retired golden-hour water zenith — reintroducing it regresses the
    // yellow-mud grazing look the 2026-08-26 captures recorded.
    expect(SKY_REFLECTION_ZENITH).not.toBe(0xffb469);
    expect(SKY_REFLECTION_HORIZON).not.toBe(0xffb469);
  });

  it.each([undefined, 'webgl2'] as const)(
    'keeps %s environments on the byte-identical standard material',
    (renderBackend) => {
      stubDocument(renderBackend);
      const material = createFarcrysisSeaSurfaceMaterial(PARAMS);
      expect(material.type).toBe('MeshStandardMaterial');
      const standard = material as THREE.MeshStandardMaterial & { isNodeMaterial?: boolean };
      expect(standard.isNodeMaterial).not.toBe(true);
      expect(standard.color.getHex()).toBe(PARAMS.baseColor);
      expect(standard.opacity).toBe(PARAMS.compatOpacity);
      expect(standard.transparent).toBe(true);
      expect(standard.roughness).toBe(PARAMS.roughness);
    },
  );

  it('bakes water-column depth from the live CPU authority', () => {
    stubDocument(undefined);
    const geom = new THREE.PlaneGeometry(140, 140, 8, 8);
    bakeFarcrysisWaterDepth(geom, false); // mesh-rotated convention: z = -local y
    const attr = geom.getAttribute(FARCRYSIS_WATER_DEPTH_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    expect(attr).toBeTruthy();
    // Centre of the plane sits over the dry interior pad -> no water column.
    // Corner (world x=63, z=-63... corners map to +/-70) is offshore seabed ->
    // saturated column. Assert monotonic shore->deep behaviour instead of
    // exact coordinates: deep samples must exceed dry-interior samples.
    let minSeen = Number.POSITIVE_INFINITY;
    let maxSeen = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < attr!.count; i += 1) {
      const d = attr!.getX(i);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      minSeen = Math.min(minSeen, d);
      maxSeen = Math.max(maxSeen, d);
    }
    expect(minSeen).toBeLessThan(0.05); // dry interior present
    expect(maxSeen).toBeGreaterThan(0.9); // real offshore depth present
  });
});

// ---------------------------------------------------------------------------
// Wiring guard — failure mode #1: green module imported by nothing.
// ---------------------------------------------------------------------------

const farcrysisSource = readFileSync(fileURLToPath(new URL('./farcrysis.ts', import.meta.url)), 'utf8');
const artSource = readFileSync(fileURLToPath(new URL('./farcrysis-art.ts', import.meta.url)), 'utf8');

describe('HF-394 wiring guard', () => {
  it('builds the authored lagoon waterline through the sea factory', () => {
    expect(farcrysisSource).toContain("from './farcrysis-water-surface'");
    expect(farcrysisSource).toContain('createFarcrysisSeaSurfaceMaterial({');
    // The lagoon mesh must carry the baked depth attribute or the ramp reads 0.
    expect(farcrysisSource).toMatch(/lagoonGeom[\s\S]{0,200}bakeFarcrysisWaterDepth/);
  });

  it('builds the deep inline horizon water through the sea factory', () => {
    expect(artSource).toContain("from './farcrysis-water-surface'");
    expect(artSource).toMatch(/deepGeom[\s\S]{0,120}bakeFarcrysisWaterDepth\(deepGeom, true\)/);
    expect(artSource).toContain('createFarcrysisSeaSurfaceMaterial({');
  });
  // HF-394 visual audit (real-WebGPU captures, 2026-08-26): the flat mud and
  // sand BACKSTOP plates under the sculpted terrain still spanned the full
  // 120 m (half 60), but the HF-393 waterline sits at Chebyshev ~55.18
  // (island half 55.5). From 55.2 to 60 the opaque sand plate floated ABOVE
  // the lagoon surface (-0.18 vs water -0.25), rendering a hard-edged yellow
  // floor over the open water. The plates must end at the shore-descent
  // start (edge distance 10 m -> half 54), where the sculpted terrain is
  // still above water and hides them.
  it('ends the flat backstop plates before the waterline', () => {
    expect(farcrysisSource).toContain('new THREE.PlaneGeometry(108, 108), mudMat');
    expect(farcrysisSource).toContain('new THREE.PlaneGeometry(108, 108), sandMat');
    // No flat backstop may span past the authored waterline.
    expect(farcrysisSource).not.toContain('new THREE.PlaneGeometry(120, 120)');
  });
});
