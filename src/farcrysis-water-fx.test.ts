/**
 * HF-394 "the water needs to look better" — presentation contracts for the
 * reworked Farcrysis water stack. These pin NEW behaviour at equal or greater
 * strictness than anything previously pinned (no water visual behaviour was
 * pinned before this file):
 *
 *   (a) every animated surface field is a PURE deterministic function — the
 *       old wave layer was also pure, but radiated rings from the map centre;
 *       the new swell travels in fixed directions and stays bounded so the
 *       additive chop can never detach from the flat authored waterline;
 *   (b) foam rings conform to the single terrain authority instead of
 *       floating at a fixed y — no vertex may sit below the shoreline
 *       max(water level + lift, terrain + lift);
 *   (c) the ripple normal-map scroll registry is bounded (arena rebuilds must
 *       not accumulate entries without limit).
 *
 * Presentation only — nothing here touches OCEAN_BANDS parity or the
 * host-authoritative level/swimmable/amplitudeScale semantics.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SWELL_MAX_AMPLITUDE,
  waveSurfaceDisplacement,
  buildWaterFX,
  animateWaterFX,
} from './farcrysis-water-fx';
import {
  WATER_RIPPLE_BANDS,
  rippleHeight,
  rippleNormalDerivative,
  registerScrollingWaterTexture,
  scrollingWaterTextureCount,
} from './farcrysis-water-ripples';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';

describe('HF-394 farcrysis water presentation', () => {
  it('swell field is deterministic, directional and amplitude-bounded', () => {
    // Deterministic: identical inputs give bit-identical outputs.
    expect(waveSurfaceDisplacement(12.5, -7.25, 4.5))
      .toBe(waveSurfaceDisplacement(12.5, -7.25, 4.5));

    // Bounded: never exceeds the summed band amplitudes, so the additive chop
    // layer cannot drift away from the flat lagoon plane it shades.
    for (let x = -38; x <= 38; x += 7.6) {
      for (let z = -38; z <= 38; z += 7.6) {
        for (let t = 0; t <= 30; t += 3.3) {
          const y = waveSurfaceDisplacement(x, z, t);
          expect(Math.abs(y)).toBeLessThanOrEqual(SWELL_MAX_AMPLITUDE + 1e-12);
        }
      }
    }
    expect(SWELL_MAX_AMPLITUDE).toBeLessThan(0.1);

    // Directional, not centre-radiating: two points on the SAME circle around
    // the origin generally displace differently (the old sin(dist - t) field
    // gave them identical heights).
    const r = 20;
    const sameCircleA = waveSurfaceDisplacement(r, 0, 2);
    const sameCircleB = waveSurfaceDisplacement(0, r, 2);
    expect(sameCircleA).not.toBeCloseTo(sameCircleB, 3);

    // It actually moves over time.
    expect(waveSurfaceDisplacement(5, 5, 0)).not.toBeCloseTo(waveSurfaceDisplacement(5, 5, 2), 6);
  });

  it('ripple height field is seamless-tileable and its derivative matches', () => {
    // Integer cycles per band ⇒ the tile wraps without a seam.
    for (const [u, v] of [[0, 0.37], [0.61, 0], [0.23, 0.81]] as const) {
      expect(rippleHeight(0, v)).toBeCloseTo(rippleHeight(1, v), 12);
      expect(rippleHeight(u, 0)).toBeCloseTo(rippleHeight(u, 1), 12);
    }
    // Deterministic (no clock, no RNG anywhere in the field).
    expect(rippleHeight(0.3, 0.7)).toBe(rippleHeight(0.3, 0.7));
    // Analytic derivative agrees with a central finite difference.
    const eps = 1e-5;
    for (const [u, v] of [[0.1, 0.4], [0.55, 0.9]] as const) {
      const { du, dv } = rippleNormalDerivative(u, v);
      const fdU = (rippleHeight(u + eps, v) - rippleHeight(u - eps, v)) / (2 * eps);
      const fdV = (rippleHeight(u, v + eps) - rippleHeight(u, v - eps)) / (2 * eps);
      expect(du).toBeCloseTo(fdU, 4);
      expect(dv).toBeCloseTo(fdV, 4);
    }
    // The band table actually crosses directions (not a uniform sine grid).
    expect(WATER_RIPPLE_BANDS.length).toBeGreaterThanOrEqual(3);
  });

  it('foam rings conform to the terrain authority instead of floating', () => {
    const scene = new THREE.Scene();
    buildWaterFX(scene);
    const group = scene.getObjectByName('farcrysis-water-fx-foam-ring');
    expect(group).toBeInstanceOf(THREE.Group);

    // Per-ring lifts mirror buildShorelineFoamRing exactly.
    const lifts: Record<string, { waterLift: number; landLift: number }> = {
      'farcrysis-water-fx-foam-ring-main': { waterLift: 0.1, landLift: 0.05 },
      'farcrysis-water-fx-foam-ring-outer': { waterLift: 0.09, landLift: 0.06 },
      'farcrysis-water-fx-foam-ring-inner': { waterLift: 0.11, landLift: 0.04 },
    };

    let checkedVertices = 0;
    for (const child of group!.children) {
      const mesh = child as THREE.Mesh;
      if (!(mesh instanceof THREE.Mesh)) continue;
      const lift = lifts[mesh.name];
      if (!lift) throw new Error(`unpinned foam ring ${mesh.name}`);
      const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const y = posAttr.getY(i) + mesh.position.y;
        const floorY = Math.max(
          FARCRYSIS_WATER_LEVEL + lift.waterLift,
          farcrysisTerrainHeight(x, z) + lift.landLift,
        );
        expect(y).toBeGreaterThanOrEqual(floorY - 1e-6);
        checkedVertices++;
      }
    }
    // All three rings really contributed vertices to the assertion.
    expect(checkedVertices).toBeGreaterThan(1000);

    // And the conformance is not vacuous: somewhere on the ring the beach
    // terrain is above the waterline, so at least one vertex rides terrain.
    let terrainDominated = 0;
    const main = group!.children[0] as THREE.Mesh;
    const posAttr = main.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      if (posAttr.getY(i) > FARCRYSIS_WATER_LEVEL + 0.100000001) terrainDominated++;
    }
    expect(terrainDominated).toBeGreaterThan(0);
  });

  it('wave surface animation writes the swell field and stays near the waterline', () => {
    const scene = new THREE.Scene();
    buildWaterFX(scene);
    const mesh = scene.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh;
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;

    animateWaterFX(1.75);
    // Geometry positions are float32; compare at float32 resolution.
    for (let i = 0; i < posAttr.count; i += 17) {
      expect(posAttr.getY(i)).toBeCloseTo(waveSurfaceDisplacement(posAttr.getX(i), posAttr.getZ(i), 1.75), 5);
    }

    animateWaterFX(5.5);
    for (let i = 0; i < posAttr.count; i += 23) {
      expect(posAttr.getY(i)).toBeCloseTo(waveSurfaceDisplacement(posAttr.getX(i), posAttr.getZ(i), 5.5), 5);
    }
  });

  it('scrolling ripple registry is bounded across repeated registrations', () => {
    const makeTexture = () => new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    for (let i = 0; i < 64; i++) registerScrollingWaterTexture(makeTexture(), 0.01, 0.01);
    // Duplicates are ignored and the registry caps instead of growing forever.
    const tex = makeTexture();
    registerScrollingWaterTexture(tex, 0.01, 0.01);
    registerScrollingWaterTexture(tex, 0.02, 0.02);
    expect(scrollingWaterTextureCount()).toBeLessThanOrEqual(32);
  });
});
