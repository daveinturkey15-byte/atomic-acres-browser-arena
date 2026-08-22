import { describe, it, expect } from 'vitest';
import {
  stanceEyeHeight,
  isTimedCombatMessage,
  verifiedStickyAttachment,
  majorDebrisDefinitionFromSnapshot,
  recoveryRemainingMs,
} from './legacy-pure-helpers-2';

describe('legacy-pure-helpers-2 (moved from legacy-main.ts)', () => {
  describe('stanceEyeHeight', () => {
    it('returns 0.61 for prone', () => {
      expect(stanceEyeHeight('prone')).toBeCloseTo(0.61);
    });
    it('returns 1.16 for crouch', () => {
      expect(stanceEyeHeight('crouch')).toBeCloseTo(1.16);
    });
    it('returns 1.7 for stand', () => {
      expect(stanceEyeHeight('stand')).toBeCloseTo(1.7);
    });
  });

  describe('isTimedCombatMessage', () => {
    it('returns true for shot', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'shot' })).toBe(true);
    });
    it('returns true for melee', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'melee' })).toBe(true);
    });
    it('returns true for grenade-throw', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'grenade-throw' })).toBe(true);
    });
    it('returns true for hit', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'hit' })).toBe(true);
    });
    it('returns true for support-activate', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'support-activate' })).toBe(true);
    });
    it('returns true for killstreak-activate-intent', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'killstreak-activate-intent' })).toBe(true);
    });
    it('returns false for other types', () => {
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'chat' })).toBe(false);
      // @ts-ignore: insufficient type
      expect(isTimedCombatMessage({ type: 'spawn' })).toBe(false);
    });
  });

  describe('verifiedStickyAttachment', () => {
    it('returns frozen object with targetId and targetLifeId', () => {
      const record = { targetId: 'target123', targetLifeId: 'life456' };
      const result = verifiedStickyAttachment(record as any);
      expect(result).toEqual({
        targetId: 'target123',
        targetLifeId: 'life456',
      });
      // Object.freeze should prevent modifications
      expect(() => {
        // @ts-ignore: attempting to modify frozen object
        result.targetId = 'changed';
      }).toThrow();
    });
  });


  describe('majorDebrisDefinitionFromSnapshot', () => {
    it('returns a frozen object with definition properties overridden by snapshot', () => {
      const definition = {
        id: 'def1',
        type: 'rock',
        position: { x: 0, y: 0, z: 0 }, // will be overridden
        rotation: { x: 0, y: 0, z: 0 }, // will be overridden
      };
      const snapshot = {
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0.1, y: 0.2, z: 0.3 },
        linearVelocity: { x: 0.01, y: 0.02, z: 0.03 },
        angularVelocity: { x: 0.001, y: 0.002, z: 0.003 },
        sleeping: true,
      };
      const result = majorDebrisDefinitionFromSnapshot(definition as any, snapshot as any);
      expect(result).toEqual({
        id: 'def1',
        type: 'rock',
        position: { x: 1, y: 2, z: 3 },
        rotation: { x: 0.1, y: 0.2, z: 0.3 },
        linearVelocity: { x: 0.01, y: 0.02, z: 0.03 },
        angularVelocity: { x: 0.001, y: 0.002, z: 0.003 },
        sleeping: true,
      });
      // Check that it's frozen
      expect(() => {
        // @ts-ignore: attempting to modify frozen object
        result.id = 'changed';
      }).toThrow();
    });
  });

  describe('recoveryRemainingMs', () => {
    it('returns 0 when value is less than elapsed time', () => {
      const value = 1000;
      const checkpoint = { savedAtEpochMs: 0 };
      const nowEpochMs = 2000; // 2000 ms elapsed
      // @ts-ignore: insufficient type
      expect(recoveryRemainingMs(value, checkpoint, nowEpochMs)).toBe(0);
    });
    it('returns positive when value is greater than elapsed time', () => {
      const value = 5000;
      const checkpoint = { savedAtEpochMs: 1000 };
      const nowEpochMs = 2000; // elapsed = 1000 ms
      // @ts-ignore: insufficient type
      expect(recoveryRemainingMs(value, checkpoint, nowEpochMs)).toBe(4000); // 5000 - 1000
    });
    it('returns value when elapsed is negative (checkpoint in future)', () => {
      const value = 3000;
      const checkpoint = { savedAtEpochMs: 5000 }; // future
      const nowEpochMs = 2000; // elapsed = -3000 -> Math.max(0, -3000) = 0
      // @ts-ignore: insufficient type
      expect(recoveryRemainingMs(value, checkpoint, nowEpochMs)).toBe(value); // 3000 - 0
    });
    it('uses default nowEpochMs (Date.now()) if not provided', () => {
      // This test is tricky because Date.now() changes.
      // We'll just call it with two arguments and ensure it doesn't throw.
      const value = 1000;
      const checkpoint = { savedAtEpochMs: Date.now() - 500 };
      // The expected recovery is at least 500 (if nowEpochMs is the time of the call)
      // We'll just check that the result is non-negative.
      // @ts-ignore: insufficient type
      const result = recoveryRemainingMs(value, checkpoint);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('isTimedCombatMessage covers every timed type', () => {
  // The move initially DROPPED two types from the runtime check while the type
  // predicate still named them - the compiler cannot catch that, because a type
  // predicate is an assertion, not an implication. The original test missed it
  // too, because it never probed those two types. This pins all eight, plus a
  // negative, so the runtime check and the predicate cannot drift apart again.
  const timed = ['shot', 'melee', 'grenade-throw', 'hit', 'support-activate',
    'killstreak-activate-intent', 'killstreak-control-intent', 'killstreak-care-capture-intent'];
  for (const type of timed) {
    it(`admits ${type}`, () => {
      expect(isTimedCombatMessage({ type } as never)).toBe(true);
    });
  }
  it('rejects a non-combat message', () => {
    expect(isTimedCombatMessage({ type: 'state' } as never)).toBe(false);
  });
});
