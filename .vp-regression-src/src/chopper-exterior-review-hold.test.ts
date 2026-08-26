import { describe, expect, it } from 'vitest';
import {
  chopperExteriorReviewHoldActive,
  type ChopperExteriorReviewHoldContext,
} from './chopper-exterior-review-hold';

const activeOfflineGunRange = Object.freeze({
  arenaId: 'gun-range',
  gameMode: 'solo',
  networkRole: 'offline',
  gameStarted: true,
  matchPhase: 'active',
  menuSurface: 'hidden',
}) satisfies ChopperExteriorReviewHoldContext;

describe('Chopper exterior review hold', () => {
  it('is admitted only during an active offline solo Gun Range match', () => {
    expect(chopperExteriorReviewHoldActive(true, activeOfflineGunRange)).toBe(true);
    expect(chopperExteriorReviewHoldActive(false, activeOfflineGunRange)).toBe(false);
  });

  it.each([
    ['arena transition', { arenaId: 'nuke-town' }],
    ['host transition', { gameMode: 'host', networkRole: 'host' }],
    ['guest transition', { gameMode: 'client', networkRole: 'client' }],
    ['stopped match', { gameStarted: false }],
    ['countdown', { matchPhase: 'countdown' }],
    ['ended match', { matchPhase: 'ended' }],
    ['pause menu', { menuSurface: 'paused-match' }],
    ['pre-match menu', { menuSurface: 'pre-match' }],
    ['error menu', { menuSurface: 'error' }],
  ])('fails closed after an aborted capture %s', (_name, override) => {
    expect(chopperExteriorReviewHoldActive(true, {
      ...activeOfflineGunRange,
      ...override,
    })).toBe(false);
  });
});
