import { describe, expect, it } from 'vitest';
import { guestRejoinAffordance } from './guest-rejoin-affordance';

describe('guest crash-rejoin affordance', () => {
  it('makes the remembered room an explicit one-click rejoin action', () => {
    expect(guestRejoinAffordance('  room-a  ', 'room-a')).toMatchObject({
      available: true,
      label: 'REJOIN LAST MATCH',
    });
  });

  it('returns to a normal join as soon as the player chooses another room', () => {
    expect(guestRejoinAffordance('room-b', 'room-a')).toEqual({
      available: false,
      label: 'JOIN',
      title: 'Join the room code shown in this field.',
    });
    expect(guestRejoinAffordance('', 'room-a').available).toBe(false);
    expect(guestRejoinAffordance('room-a', null).available).toBe(false);
  });
});
