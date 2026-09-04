/**
 * skyline-terminal-look.test.ts — the terminal look pass, measured rather than
 * asserted (HF-481 lane LOOK, 2026-09-04).
 *
 * Four claims, each with a number:
 *  1. albedo drift on the largest flat surfaces runs at one uniform strength;
 *  2. the two hero signs carry emissive crowns in the gate-sign idiom;
 *  3. the shipped aerial-perspective tuning stays inside its combat ceiling at
 *     the terminal's horizon distance and visible above its floor;
 *  4. the noise table behind (1) is deterministic and tiles.
 *
 * No new render pipeline: nothing here builds a material graph, a stage, or a
 * target, and the pipeline-count pins elsewhere in the suite are untouched.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildSkylineTerminal } from './additional-maps';
import {
  AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER,
  AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER,
  AERIAL_PERSPECTIVE_TIERS,
  aerialPerspectiveInscatter,
  resolveAerialPerspectiveTuning,
} from './rendering/atmosphere/aerial-perspective';
import {
  TERMINAL_ALBEDO_VARIATION_STRENGTH,
  generateTerminalAlbedoLutData,
  resetTerminalAlbedoLutForTests,
  sampleTerminalAlbedo,
  terminalAlbedoLut,
  terminalAlbedoMultiplier,
} from './terminal-albedo-lut';

/**
 * The terminal's horizon distance, in metres. Derived, not chosen: the tarmac
 * apron is a 76 x 76 m plane, so its diagonal (the longest sightline the
 * arena stages) is ~107.5 m, rounded up. Inside the arena fog far (156 m), so
 * the fog curve never fully saturates in-bounds and the aerial stage is what
 * carries the far field.
 */
export const SKYLINE_TERMINAL_HORIZON_DISTANCE_M = 120;

const WHITE: readonly [number, number, number] = [1, 1, 1];
const REPRESENTATIVE_SKY: readonly [number, number, number] = [0.55, 0.62, 0.72];
const REPRESENTATIVE_SUN: readonly [number, number, number] = [1, 0.94, 0.81];

describe('terminal albedo drift runs at one uniform strength', () => {
  it('pins a single small strength every large flat surface shares', () => {
    // Visible against a flat swatch, far from any hiding place: the full swing
    // is 2x strength peak-to-peak on surfaces players never fight inside of.
    expect(TERMINAL_ALBEDO_VARIATION_STRENGTH).toBeGreaterThan(0);
    expect(TERMINAL_ALBEDO_VARIATION_STRENGTH).toBeLessThanOrEqual(0.1);
  });

  it('centres the multiplier on 1 and bounds it by the strength', () => {
    expect(terminalAlbedoMultiplier(0.5)).toBeCloseTo(1, 12);
    for (const noise of [0, 0.25, 0.5, 0.75, 1]) {
      const multiplier = terminalAlbedoMultiplier(noise);
      expect(Math.abs(multiplier - 1)).toBeLessThanOrEqual(
        TERMINAL_ALBEDO_VARIATION_STRENGTH + 1e-12,
      );
    }
    expect(terminalAlbedoMultiplier(0)).toBeCloseTo(1 - TERMINAL_ALBEDO_VARIATION_STRENGTH, 12);
    expect(terminalAlbedoMultiplier(1)).toBeCloseTo(1 + TERMINAL_ALBEDO_VARIATION_STRENGTH, 12);
  });

  it('carries the same strength on the tarmac, the concourse floor and the walls', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    for (const name of [
      'skyline-tarmac-apron',
      'skyline-concourse-floor',
      'skyline-terminal-backwall',
      'skyline-terminal-leftwall',
      'skyline-terminal-rightwall',
    ]) {
      const mesh = map.root.getObjectByName(name);
      expect(mesh).toBeTruthy();
      const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(material.userData.terminalAlbedoVariation).toBe(TERMINAL_ALBEDO_VARIATION_STRENGTH);
    }
  });
});

describe('terminal hero signage reads as light sources', () => {
  it('crowns both hero boards with an emissive bar in the gate-sign idiom', () => {
    const map = buildSkylineTerminal(new THREE.Scene());
    for (const name of ['skyline-terminal-main-sign-crown', 'skyline-flight-display-crown']) {
      const crown = map.root.getObjectByName(name);
      expect(crown).toBeTruthy();
      expect(crown?.userData.skylineCluster).toBe('terminal-story');
      const material = (crown as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(material.emissiveIntensity).toBeGreaterThanOrEqual(1.4);
    }
  });

  it('keeps both hero boards in the performance profile', () => {
    // The crowns ride detailBox's default ('performance'), the same as the
    // overhead gate-sign crowns — visible on every profile, counted in the
    // same draw budget the arena tests already pin.
    const map = buildSkylineTerminal(new THREE.Scene());
    expect(map.root.getObjectByName('skyline-terminal-main-sign')).toBeTruthy();
    expect(map.root.getObjectByName('skyline-flight-display-board')).toBeTruthy();
  });
});

describe('aerial perspective holds at the terminal horizon', () => {
  it('never exceeds the combat ceiling at the horizon, in any tier', () => {
    // Worst case: white sky, white sun, view straight down the sun vector —
    // the per-channel clamp in the shipped expression is the mechanism this
    // far out, and this proves it rather than trusting the comment.
    for (const tier of AERIAL_PERSPECTIVE_TIERS) {
      const tuning = resolveAerialPerspectiveTuning(tier);
      const inscatter = aerialPerspectiveInscatter(
        SKYLINE_TERMINAL_HORIZON_DISTANCE_M, 0, 1, WHITE, WHITE, tuning,
      );
      for (const channel of inscatter) {
        expect(channel).toBeLessThanOrEqual(AERIAL_PERSPECTIVE_MAXIMUM_INSCATTER);
      }
    }
  });

  it('stays visible above the floor at the horizon, in every tier', () => {
    // Representative case across the sun: a far field the effect cannot be
    // seen in is the exact regression the module's first cut shipped.
    for (const tier of AERIAL_PERSPECTIVE_TIERS) {
      const tuning = resolveAerialPerspectiveTuning(tier);
      const inscatter = aerialPerspectiveInscatter(
        SKYLINE_TERMINAL_HORIZON_DISTANCE_M, 0, 0,
        REPRESENTATIVE_SKY, REPRESENTATIVE_SUN, tuning,
      );
      expect(inscatter[2]).toBeGreaterThanOrEqual(AERIAL_PERSPECTIVE_MINIMUM_FAR_INSCATTER);
    }
  });
});

describe('terminal albedo noise table', () => {
  it('generates deterministically', () => {
    resetTerminalAlbedoLutForTests();
    const first = Array.from(generateTerminalAlbedoLutData());
    const second = Array.from(generateTerminalAlbedoLutData());
    expect(first).toEqual(second);
    expect(terminalAlbedoLut()).toBe(terminalAlbedoLut());
  });

  it('tiles under repeat and stays inside [0, 1]', () => {
    resetTerminalAlbedoLutForTests();
    expect(sampleTerminalAlbedo(0, 0)).toBe(sampleTerminalAlbedo(1, 1));
    expect(sampleTerminalAlbedo(0.25, 0.75)).toBe(sampleTerminalAlbedo(1.25, 1.75));
    for (const [u, v] of [[0, 0], [0.13, 0.71], [0.5, 0.5], [0.99, 0.01]] as const) {
      const sample = sampleTerminalAlbedo(u, v);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });
});
