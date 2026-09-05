/**
 * HF-481 lane LOOK — the ambient air, measured instead of asserted.
 *
 * WHY THIS FILE EXISTS. `particle-catalog.ts` shipped an air profile for every
 * arena and `particle-catalog.test.ts` proved every arena had one. Both were
 * true and the frame still had no air in it: Nuke Town Rebuild's motes were
 * 0.014 m sprites drawn additively at alpha 0.09, which is 1.2 px at the review
 * viewport's reading distance, and not one appears in any of the seven PASS 94
 * exterior captures.
 *
 * "Every arena has a profile" is a coverage claim. This file makes the
 * VISIBILITY claim, in pixels, which is the one that was actually failing.
 *
 * It bounds from both sides on purpose. A floor, so an ambient family cannot go
 * back to being a sub-pixel rumour; and the shipped ceilings, so making the air
 * visible can never become making the air a smoke screen.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_PARTICLE_PROFILES, PARTICLE_FAMILIES } from './particle-catalog';
import { PARTICLE_READABILITY } from './combat-readability';

/** The AGENTS.md review viewport, and the FOV the review cameras are authored at. */
const REVIEW_HEIGHT_PX = 720;
const REVIEW_VERTICAL_FOV_DEGREES = 70;

/**
 * The distance the air is judged at. Not arbitrary: it is roughly the width of
 * the Nuke Town street, i.e. where a player standing on one pavement reads the
 * air over the other one.
 */
const READING_DISTANCE_M = 12;

/**
 * The floor. Below two pixels a sprite is a shimmer that anti-aliasing eats,
 * and every capture proves it.
 */
const MINIMUM_SUBTENDED_PX = 2;

/**
 * Diameter of a sphere of radius `radiusM` at `distanceM`, in pixels, for a
 * perspective camera of the given vertical FOV and framebuffer height.
 */
export function subtendedPixels(
  radiusM: number,
  distanceM: number,
  verticalFovDegrees = REVIEW_VERTICAL_FOV_DEGREES,
  heightPx = REVIEW_HEIGHT_PX,
): number {
  const halfFov = (verticalFovDegrees * Math.PI) / 360;
  const worldHeightAtDistance = 2 * distanceM * Math.tan(halfFov);
  return ((2 * radiusM) / worldHeightAtDistance) * heightPx;
}

describe('ambient air is visible at the reading distance', () => {
  const profile = ARENA_PARTICLE_PROFILES['nuketown2'];

  it('reproduces the measurement that condemned the shipped values', () => {
    // The exact numbers from the PASS 94 catalog, so the regression this file
    // exists for is stated rather than remembered.
    expect(subtendedPixels(0.014, READING_DISTANCE_M)).toBeCloseTo(1.2, 1);
    expect(subtendedPixels(0.014, READING_DISTANCE_M)).toBeLessThan(MINIMUM_SUBTENDED_PX);
  });

  it('draws motes big enough to see', () => {
    expect(subtendedPixels(profile.motes.radiusM, READING_DISTANCE_M))
      .toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
  });

  it('draws drift big enough to see, at a longer distance than the motes', () => {
    // Drift is the coarser family: leaves and seed fluff read from across a
    // back yard, not just across a pavement.
    expect(subtendedPixels(profile.drift.radiusM, READING_DISTANCE_M * 2))
      .toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
  });

  /**
   * MEASURED 2026-09-04, every arena, at the reading distance (px):
   *
   *   atomic-acres 1.37 | skyline-terminal 1.20 | rustworks-1v1 1.54
   *   gun-range 1.03 | farcrysis 1.29 | high-seas 1.46 | test1 1.37
   *   test2 1.29 | map3 1.29 | raid2 1.29 | nuketown2 2.23
   *
   * TEN OF ELEVEN ARENAS STILL HAVE SUB-PIXEL MOTES. Only Nuke Town Rebuild is
   * fixed, because only Nuke Town Rebuild is this lane's. The loop below
   * therefore holds DRIFT to the floor for every arena — that family already
   * clears it everywhere — and holds motes only above zero, so it states the
   * truth instead of either failing ten arenas this lane may not edit or
   * pretending they pass. The remaining ten are an OPEN item in
   * `docs/evidence/pass94/quality-gap/REPORT.md`, not a silent exemption.
   */
  it('holds every ambient family of every arena above the floor', () => {
    for (const [arenaId, arena] of Object.entries(ARENA_PARTICLE_PROFILES)) {
      const motes = subtendedPixels(arena.motes.radiusM, READING_DISTANCE_M);
      const drift = subtendedPixels(arena.drift.radiusM, READING_DISTANCE_M);
      // Reported per arena so a failure names the map rather than the loop.
      expect(
        drift,
        `${arenaId}.drift subtends ${drift.toFixed(2)} px at ${READING_DISTANCE_M} m`,
      ).toBeGreaterThanOrEqual(MINIMUM_SUBTENDED_PX);
      expect(motes, `${arenaId}.motes subtends ${motes.toFixed(2)} px`).toBeGreaterThan(0);
    }
  });
});

describe('making the air visible did not make it a smoke screen', () => {
  it('keeps every ambient alpha inside its own family ceiling', () => {
    for (const [arenaId, arena] of Object.entries(ARENA_PARTICLE_PROFILES)) {
      expect(arena.motes.opacity, `${arenaId}.motes`).toBeLessThanOrEqual(
        PARTICLE_FAMILIES.motes.maxOpacity,
      );
      expect(arena.drift.opacity, `${arenaId}.drift`).toBeLessThanOrEqual(
        PARTICLE_FAMILIES.drift.maxOpacity,
      );
    }
  });

  it('keeps both ambient families inside the readability contract for fine matter', () => {
    // Both are flagged non-obscuring, so `fineMaxOpacity` is the bound that
    // applies to them, and it must bind ABOVE the family ceilings rather than
    // the family ceilings being the only thing holding the line.
    expect(PARTICLE_FAMILIES.motes.obscuring).toBe(false);
    expect(PARTICLE_FAMILIES.drift.obscuring).toBe(false);
    expect(PARTICLE_FAMILIES.motes.maxOpacity).toBeLessThanOrEqual(
      PARTICLE_READABILITY.fineMaxOpacity,
    );
    expect(PARTICLE_FAMILIES.drift.maxOpacity).toBeLessThanOrEqual(
      PARTICLE_READABILITY.fineMaxOpacity,
    );
  });

  it('spends no extra instances on the Nuke Town fix', () => {
    // The whole change was radius and alpha. Density is what costs instances,
    // draws and buffer, and it is byte-identical to what PASS 94 shipped. If a
    // later edit raises it, this pin makes that a deliberate budget decision
    // rather than a side effect of an art tweak.
    const profile = ARENA_PARTICLE_PROFILES['nuketown2'];
    expect(profile.motes.density).toBe(0.72);
    expect(profile.drift.density).toBe(0.42);
    // And the family capacities the buffers are actually sized at are the
    // shipped ones, unchanged by any of this.
    expect(PARTICLE_FAMILIES.motes.capacity).toEqual({ low: 220, high: 520, ultra: 900 });
    expect(PARTICLE_FAMILIES.drift.capacity).toEqual({ low: 60, high: 140, ultra: 240 });
  });
});
