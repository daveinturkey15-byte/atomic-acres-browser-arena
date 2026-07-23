import { describe, expect, it } from 'vitest';
import {
  DHV_VALUES,
  applyDhvIncomingDamage,
  applyDhvOutgoingDamage,
  applyDhvWeaponOutgoingDamage,
  dhvIncomingMultiplier,
  dhvOutgoingMultiplier,
  isDhv,
} from './handicap';

describe('DHV handicap contract', () => {
  it('admits only the six lobby values', () => {
    expect(DHV_VALUES).toEqual([10, 8, 6, 4, 2, 'X']);
    for (const value of DHV_VALUES) expect(isDhv(value)).toBe(true);
    for (const value of [0, 1, 9, '10', 'x', null]) expect(isDhv(value)).toBe(false);
  });

  it('scales outgoing and incoming damage symmetrically around standard', () => {
    expect(DHV_VALUES.map(dhvOutgoingMultiplier)).toEqual([1, 0.8, 0.6, 0.4, 0.2, 0.2]);
    expect(DHV_VALUES.slice(0, 5).map(dhvIncomingMultiplier)).toEqual([1, 1.2, 1.4, 1.6, 1.8]);
    expect(applyDhvOutgoingDamage(50, 8)).toBe(40);
    expect(applyDhvIncomingDamage(50, 100, 8)).toBe(60);
  });

  it('makes any positive admitted hit lethal in X without inventing damage from zero', () => {
    expect(applyDhvIncomingDamage(1, 73, 'X')).toBe(73);
    expect(applyDhvIncomingDamage(0, 73, 'X')).toBe(0);
    expect(applyDhvOutgoingDamage(50, 'X')).toBe(10);
    expect(applyDhvWeaponOutgoingDamage(100, 'X', true)).toBe(100);
    expect(applyDhvWeaponOutgoingDamage(45, 'X', true)).toBe(9);
    expect(applyDhvWeaponOutgoingDamage(100, 2, true)).toBe(20);
  });
});
