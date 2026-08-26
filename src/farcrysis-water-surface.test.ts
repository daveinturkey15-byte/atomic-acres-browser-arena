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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bakeFarcrysisWaterDepth,
  createFarcrysisSeaSurfaceMaterial,
  FARCRYSIS_WATER_DEPTH_ATTRIBUTE,
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
    expect((material as unknown as { colorNode: unknown }).colorNode).not.toBeNull();
    expect((material as unknown as { opacityNode: unknown }).opacityNode).not.toBeNull();
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
