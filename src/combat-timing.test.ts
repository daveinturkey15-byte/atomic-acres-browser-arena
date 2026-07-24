import { describe, expect, it } from 'vitest';
import { nextShotDeadline } from './combat-timing';
import { WEAPONS } from './gameplay';

describe('weapon cadence', () => {
  it('schedules every admitted shot from its actual fire time', () => {
    const interval = 600;
    expect(nextShotDeadline(1_000, interval)).toBe(1_600);
    expect(nextShotDeadline(1_590, interval)).toBe(2_190);
  });

  it('cannot repay a late frame with a rapid second sniper shot', () => {
    const sniperInterval = 60_000 / WEAPONS.sniper.rpm;
    const lateShotAt = 2_350;
    expect(nextShotDeadline(lateShotAt, sniperInterval) - lateShotAt).toBe(sniperInterval);
  });
});
