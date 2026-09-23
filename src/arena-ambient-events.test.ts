/**
 * Pass 75 - intermittent arena ambience.
 *
 * The value of this layer is that each arena STOPS sounding like the same room
 * with a different filter. These tests pin the properties that make that true,
 * and the budget properties that stop it costing combat audio.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from './map-selection';
import {
  ARENA_AMBIENT_EVENT_IDS,
  ARENA_AMBIENT_PROFILES,
  ambientEventOffset,
  ambientWeightTotal,
  nextAmbientGapSeconds,
  selectAmbientEvent,
} from './arena-ambient-events';

const profiles = Object.values(ARENA_AMBIENT_PROFILES);

describe('arena ambient events', () => {
  it('gives every shipped arena its own event set', () => {
    for (const arena of ARENA_SELECTIONS) {
      const profile = ARENA_AMBIENT_PROFILES[arena.id];
      expect(profile, arena.id).toBeDefined();
      expect(profile.events.length, arena.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('gives each arena a DISTINCT identity - no shared event ids', () => {
    // The whole point: two arenas must not sound like each other.
    expect(new Set(ARENA_AMBIENT_EVENT_IDS).size).toBe(ARENA_AMBIENT_EVENT_IDS.length);
    for (const profile of profiles) {
      for (const entry of profile.events) {
        expect(entry.id.startsWith(`${profile.arenaId.slice(0, 2)}.`) || entry.id.includes('.'), entry.id).toBe(true);
      }
    }
    expect(new Set(profiles.map((profile) => profile.identity)).size).toBe(profiles.length);
  });

  it('stays sparse, so the layer reads as environment and never as a loop', () => {
    for (const profile of profiles) {
      const [low, high] = profile.gapSecondsRange;
      expect(low, profile.arenaId).toBeGreaterThanOrEqual(4);
      expect(high, profile.arenaId).toBeGreaterThan(low);
      // A gap ceiling beyond a minute would read as "the audio broke".
      expect(high, profile.arenaId).toBeLessThanOrEqual(30);
    }
  });

  it('keeps every event quiet and short enough to sit under combat', () => {
    for (const profile of profiles) {
      for (const entry of profile.events) {
        expect(entry.gain, entry.id).toBeGreaterThan(0);
        // Louder than this and ambience competes with weapon reports.
        expect(entry.gain, entry.id).toBeLessThanOrEqual(0.05);
        expect(entry.durationSeconds, entry.id).toBeGreaterThan(0);
        // Longer than this stops being a one-shot and becomes a second drone.
        expect(entry.durationSeconds, entry.id).toBeLessThanOrEqual(3);
        expect(entry.sweepHz[0], entry.id).toBeGreaterThan(20);
        expect(entry.sweepHz[1], entry.id).toBeGreaterThan(20);
        expect(entry.distanceM, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it('selects by weight across the whole roll range, and never returns null for a real arena', () => {
    for (const profile of profiles) {
      expect(ambientWeightTotal(profile)).toBeGreaterThan(0);
      const picked = new Set<string>();
      for (let roll = 0; roll < 1; roll += 0.02) {
        const entry = selectAmbientEvent(profile, roll);
        expect(entry, `${profile.arenaId}@${roll}`).not.toBeNull();
        picked.add(entry!.id);
      }
      // Every authored event must be reachable, or it is dead content.
      expect(picked.size, profile.arenaId).toBe(profile.events.length);
    }
  });

  it('degrades to a valid sound rather than silence on a bad random source', () => {
    const profile = ARENA_AMBIENT_PROFILES['high-seas'];
    expect(selectAmbientEvent(profile, Number.NaN)).not.toBeNull();
    expect(selectAmbientEvent(profile, -5)).not.toBeNull();
    expect(selectAmbientEvent(profile, 99)).not.toBeNull();
    expect(Number.isFinite(nextAmbientGapSeconds(profile, Number.NaN))).toBe(true);
  });

  it('keeps the gap inside the authored range for every roll', () => {
    for (const profile of profiles) {
      const [low, high] = profile.gapSecondsRange;
      for (const roll of [0, 0.25, 0.5, 0.75, 1]) {
        const gap = nextAmbientGapSeconds(profile, roll);
        expect(gap).toBeGreaterThanOrEqual(low);
        expect(gap).toBeLessThanOrEqual(high);
      }
    }
  });

  it('places events around the listener at their authored distance', () => {
    const entry = ARENA_AMBIENT_PROFILES['high-seas'].events[0]!;
    for (const bearing of [0, 0.25, 0.5, 0.75]) {
      const offset = ambientEventOffset(entry, bearing);
      const radius = Math.hypot(offset.x, offset.z);
      expect(radius).toBeCloseTo(entry.distanceM, 6);
      expect(Number.isFinite(offset.y)).toBe(true);
    }
    // Different bearings must actually differ, or every event stacks in one spot.
    expect(ambientEventOffset(entry, 0).x).not.toBeCloseTo(ambientEventOffset(entry, 0.5).x, 3);
  });

  it('puts airborne calls above ear height and ground sources near it', () => {
    const gull = ARENA_AMBIENT_PROFILES['high-seas'].events.find((entry) => entry.shape === 'call')!;
    const creak = ARENA_AMBIENT_PROFILES['high-seas'].events.find((entry) => entry.shape === 'creak')!;
    expect(ambientEventOffset(gull, 0).y).toBeGreaterThan(ambientEventOffset(creak, 0).y);
  });
});
