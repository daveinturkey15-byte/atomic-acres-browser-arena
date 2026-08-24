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
  swellDepthFactor,
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
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';

describe('HF-394 farcrysis water presentation', () => {
  it('swell field is deterministic, directional and amplitude-bounded', () => {
    // Deterministic: identical inputs give bit-identical outputs.
    expect(waveSurfaceDisplacement(12.5, -7.25, 4.5))
      .toBe(waveSurfaceDisplacement(12.5, -7.25, 4.5));

    // Bounded: never exceeds the summed band amplitudes, so the additive chop
    // layer cannot drift away from the flat lagoon plane it shades. Sampled
    // across the whole 140 m FX plane; HF-396 doubled the island (half 64),
    // so most of this plane is dry land where the depth factor holds the
    // field at exactly zero — the bound must hold there trivially too.
    for (let x = -70; x <= 70; x += 14) {
      for (let z = -70; z <= 70; z += 14) {
        for (let t = 0; t <= 30; t += 3.3) {
          const y = waveSurfaceDisplacement(x, z, t);
          expect(Math.abs(y)).toBeLessThanOrEqual(SWELL_MAX_AMPLITUDE + 1e-12);
        }
      }
    }
    expect(SWELL_MAX_AMPLITUDE).toBeLessThan(0.1);

    // Directional, not centre-radiating: two points equidistant from the
    // origin generally displace differently (the old sin(dist - t) field gave
    // them identical heights). Probes sit OFFSHORE (chebyshev > island half)
    // because inland points are held at zero by the depth response.
    const sameCircleA = waveSurfaceDisplacement(66, 10, 2);
    const sameCircleB = waveSurfaceDisplacement(10, 66, 2);
    expect(sameCircleA).not.toBeCloseTo(sameCircleB, 3);

    // It actually moves over time — again offshore, for the same reason.
    expect(waveSurfaceDisplacement(68, -14, 0)).not.toBeCloseTo(waveSurfaceDisplacement(68, -14, 2), 6);
  });

  it('swell energy responds to depth: exactly calm ashore, building offshore', () => {
    const half = FARCRYSIS_BOUNDS.maxX;
    const columnDepth = (x: number, z: number) => FARCRYSIS_WATER_LEVEL - farcrysisTerrainHeight(x, z);
    // Walk the +z ray seaward and pick probes by WATER COLUMN, not by fixed
    // coordinates, so the pin survives future shore-profile tuning.
    const firstPointWithColumnAtLeast = (target: number) => {
      for (let z = half - 16; z <= half + 20; z += 0.1) {
        if (columnDepth(0, z) >= target) return z;
      }
      throw new Error(`no point with column >= ${target}`);
    };

    // (1) Dry land above the waterline is EXACTLY calm — no wave energy on
    //     sand, so the additive chop cannot wash across the beach.
    let dryZ: number | null = null;
    for (let z = half - 16; z <= half; z += 0.1) {
      if (columnDepth(0, z) <= 0) {
        dryZ = z;
        break;
      }
    }
    expect(dryZ, 'no dry probe found on the ray').not.toBeNull();
    for (let t = 0; t <= 10; t += 1.7) {
      expect(waveSurfaceDisplacement(0, dryZ!, t)).toBe(0);
    }

    // (2) Energy grows monotonically with water column: ankle-deep < waist
    //     deep < open water (RMS over a full swell cycle, phase-independent).
    const rmsAt = (x: number, z: number) => {
      let sum = 0;
      let n = 0;
      for (let t = 0; t <= 20; t += 0.5) {
        const y = waveSurfaceDisplacement(x, z, t);
        sum += y * y;
        n += 1;
      }
      return Math.sqrt(sum / n);
    };
    const shallowZ = firstPointWithColumnAtLeast(0.4);
    const midZ = firstPointWithColumnAtLeast(1.2);
    const deepZ = firstPointWithColumnAtLeast(3);
    const shallowRms = rmsAt(0, shallowZ);
    const midRms = rmsAt(0, midZ);
    const deepRms = rmsAt(0, deepZ);
    expect(shallowRms).toBeGreaterThan(0);
    expect(midRms).toBeGreaterThan(shallowRms * 1.3);
    expect(deepRms).toBeGreaterThanOrEqual(midRms * 0.95); // saturation plateau

    // (3) The depth factor itself: zero ashore, saturated offshore.
    expect(swellDepthFactor(0, dryZ!)).toBe(0);
    expect(swellDepthFactor(0, deepZ)).toBe(1);
    expect(swellDepthFactor(0, midZ)).toBeGreaterThan(swellDepthFactor(0, shallowZ));
  });

  it('wave surface brightness fades with depth so shore water blends, not stops', () => {
    const scene = new THREE.Scene();
    buildWaterFX(scene);
    const mesh = scene.getObjectByName('farcrysis-water-fx-wave-surface') as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.vertexColors).toBe(true);
    animateWaterFX(2.25);
    const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = mesh.geometry.attributes.color as THREE.BufferAttribute;
    expect(colAttr).toBeTruthy();
    let checked = 0;
    for (let i = 0; i < posAttr.count; i += 13) {
      const expected = swellDepthFactor(posAttr.getX(i), posAttr.getZ(i));
      expect(colAttr.getX(i)).toBeCloseTo(expected, 4);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('foam rings carry a deterministic travelling wash, not uniform opacity', () => {
    const scene = new THREE.Scene();
    buildWaterFX(scene);
    const group = scene.getObjectByName('farcrysis-water-fx-foam-ring') as THREE.Group;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshBasicMaterial;
      expect(material.vertexColors, `${mesh.name} must use vertex colours`).toBe(true);
      const colAttr = mesh.geometry.attributes.color as THREE.BufferAttribute;
      expect(colAttr, `${mesh.name} missing colour attribute`).toBeTruthy();
    }
    const main = group.children[0] as THREE.Mesh;
    const colAttr = main.geometry.attributes.color as THREE.BufferAttribute;
    animateWaterFX(3.1);
    const snapshot: number[] = [];
    for (let i = 0; i < Math.min(colAttr.count, 400); i++) snapshot.push(colAttr.getX(i));
    // The wash varies around the ring...
    const min = Math.min(...snapshot);
    const max = Math.max(...snapshot);
    expect(max - min).toBeGreaterThan(0.05);
    // ...it travels (different time, different pattern)...
    animateWaterFX(4.6);
    let differs = 0;
    for (let i = 0; i < snapshot.length; i++) {
      if (Math.abs(snapshot[i] - colAttr.getX(i)) > 1e-4) differs += 1;
    }
    expect(differs).toBeGreaterThan(40);
    // ...and it is deterministic.
    animateWaterFX(3.1);
    for (let i = 0; i < snapshot.length; i++) {
      expect(colAttr.getX(i)).toBeCloseTo(snapshot[i], 5);
    }
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
