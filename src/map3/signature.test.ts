/**
 * map3/signature.test.ts — M3.SIGNATURE.1a/2a/3a contract.
 *
 * Pins BEHAVIOUR, not values: the walk grades bright-to-dark without lifting
 * exposure, the live sun reaches local space normalised and above the slit
 * floor, storms clear the high veil through palettes, the tint/fog seam is
 * consumed from shared weather state (never duplicated here), and thresholds
 * frame the walk without standing in it. A retune of any constant keeps these
 * green; a rewritten model fails them.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { volumeAxialGrade, worldSunToLocal } from './corridor-volume';
import {
  DAY_SKY, GOLDEN_SKY, OVERCAST_SKY, applySkyPalette, createSkyUniforms,
} from './sky';
import {
  THRESHOLD_HALF, createSignatureThreshold,
} from './signature-thresholds';

describe('M3.SIGNATURE.2a axial grade', () => {
  // NIGHT-MAP3-LOOK: wall target softened 0.45 -> 0.65. The deeper grade was
  // measured 19% below base on the floor band and read as murk (owner: floor
  // still wrong); 0.65 keeps the mouth-to-wall falloff without crushing it.
  it('is bright at the mouth and graded at the end wall', () => {
    expect(volumeAxialGrade(0)).toBe(1);
    expect(volumeAxialGrade(-44)).toBeCloseTo(0.65, 10);
  });

  it('decreases monotonically along the walk', () => {
    let prev = Infinity;
    for (let z = 0; z >= -44; z -= 2) {
      const g = volumeAxialGrade(z);
      expect(g).toBeLessThanOrEqual(prev);
      prev = g;
    }
  });

  it('clamps outside the hall instead of extrapolating', () => {
    expect(volumeAxialGrade(5)).toBe(1);
    expect(volumeAxialGrade(-100)).toBeCloseTo(0.65, 10);
  });

  it('is a multiplier below one everywhere past the mouth', () => {
    for (let z = -1; z >= -44; z -= 3) {
      const g = volumeAxialGrade(z);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});

describe('M3.SIGNATURE.2a live sun', () => {
  it('passes an overhead sun through unchanged (normalised)', () => {
    const out = new THREE.Vector3();
    worldSunToLocal(out, new THREE.Vector3(0, 2, 0), new THREE.Matrix4());
    expect(out.length()).toBeCloseTo(1, 10);
    expect(out.y).toBeCloseTo(1, 10);
  });

  it('rotates with the corridor: a 180-degree yaw flips x and z', () => {
    const out = new THREE.Vector3();
    const yaw180 = new THREE.Matrix4().makeRotationY(Math.PI);
    // World-to-local for a corridor facing the opposite way.
    worldSunToLocal(out, new THREE.Vector3(0.78, 0.58, -0.22).normalize(), yaw180);
    expect(out.x).toBeCloseTo(-0.78 / new THREE.Vector3(0.78, 0.58, -0.22).length(), 5);
    expect(out.length()).toBeCloseTo(1, 10);
  });

  it('floors a below-horizon sun to the slit-visible minimum', () => {
    const out = new THREE.Vector3();
    worldSunToLocal(out, new THREE.Vector3(0, -1, 0.1).normalize(), new THREE.Matrix4());
    expect(out.y).toBeGreaterThan(0);
    expect(out.length()).toBeCloseTo(1, 10);
  });
});

describe('M3.SIGNATURE.1a cirrus palette', () => {
  const num = (u: unknown): number => (u as { value: number }).value;

  it('day carries a high veil, overcast clears it', () => {
    const u = createSkyUniforms();
    applySkyPalette(u, DAY_SKY);
    const day = num(u.cirrusDensity);
    applySkyPalette(u, OVERCAST_SKY);
    expect(num(u.cirrusDensity)).toBe(0);
    expect(day).toBeGreaterThan(0);
  });

  it('golden hour thickens the veil rather than clearing it', () => {
    const u = createSkyUniforms();
    applySkyPalette(u, GOLDEN_SKY);
    const golden = num(u.cirrusDensity);
    applySkyPalette(u, DAY_SKY);
    expect(golden).toBeGreaterThan(num(u.cirrusDensity));
  });

  it('does not duplicate the weather seam: no local tint or fog scale', () => {
    const u = createSkyUniforms();
    expect('skyTint' in u).toBe(false);
    expect('fogDensityScale' in u).toBe(false);
    expect('cirrusDensity' in u).toBe(true);
  });
});

describe('M3.SIGNATURE.3a thresholds', () => {
  it('builds the full moment: pylons, lintel, glow', () => {
    const t = createSignatureThreshold(0xffc873);
    expect(t.group.children.length).toBe(3);
    const names = t.group.children.map((c) => c.name).sort();
    expect(names).toEqual([
      'map3-signature-threshold-glow',
      'map3-signature-threshold-lintel',
      'map3-signature-threshold-pylons',
    ]);
    t.dispose();
  });

  it('frames the walk without standing in it', () => {
    const t = createSignatureThreshold(0xffc873);
    const pylons = t.group.getObjectByName('map3-signature-threshold-pylons') as THREE.Mesh;
    const lintel = t.group.getObjectByName('map3-signature-threshold-lintel') as THREE.Mesh;
    const geo = pylons.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox as THREE.Box3;
    // Pylon inner faces stay outside a 2.5 m half-walk; nothing at head height
    // except the lintel, which clears the 1.7 m nailed eye by metres.
    expect(Math.min(Math.abs(box.min.x), Math.abs(box.max.x))).toBeGreaterThanOrEqual(2.5);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
    expect(lintel.position.y).toBeGreaterThan(3.5);
    expect(THRESHOLD_HALF).toBeLessThanOrEqual(2.6);
    t.dispose();
  });

  it('disposes without throwing', () => {
    const t = createSignatureThreshold(0x9fd4ff);
    expect(() => t.dispose()).not.toThrow();
  });
});
