import { describe, expect, it } from 'vitest';
import { stableStringify } from './canonical-state';
import { isGameMessage, isHostAuthorityMessage, isStateTrafficMessage } from './protocol';
import { createTimedMapWeaponAuthority } from './timed-map-weapon-authority';
import {
  TIMED_MAP_WEAPON_SCHEMA_VERSION,
  MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES,
  isTimedMapWeaponClaimRequestMessage,
  isTimedMapWeaponProtocolMessage,
  isTimedMapWeaponStateMessage,
} from './timed-map-weapon-protocol';

const states = Object.freeze({
  flamethrower: createTimedMapWeaponAuthority('flamethrower', 'rustworks-1v1', 0, 300_000, 4),
  'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, 300_000, 4),
});

describe('timed map weapon protocol', () => {
  it('admits the repository monotonic nonce domain after long-lived tabs exceed uint32 milliseconds', () => {
    expect(isTimedMapWeaponClaimRequestMessage({
      type: 'timed-map-weapon-claim-request', schemaVersion: 1, by: 'player-a',
      weaponId: 'flamethrower', generation: 1, position: [0, 0, 0], nonce: 5_000_000_000,
    })).toBe(true);
  });
  it('admits a strict bounded claim request', () => {
    const message = {
      type: 'timed-map-weapon-claim-request',
      schemaVersion: TIMED_MAP_WEAPON_SCHEMA_VERSION,
      by: 'player-a',
      weaponId: 'flamethrower',
      generation: 4,
      position: [0.4, 8.64, 0.2],
      nonce: 1,
    } as const;
    expect(isTimedMapWeaponClaimRequestMessage(message)).toBe(true);
    expect(isTimedMapWeaponProtocolMessage(message)).toBe(true);
    expect(isGameMessage(message)).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(false);
    expect(isTimedMapWeaponClaimRequestMessage({ ...message, weaponId: 'railgun' })).toBe(false);
    expect(isTimedMapWeaponClaimRequestMessage({ ...message, injected: true })).toBe(false);
  });

  it('requires exactly one state for each timed weapon with matching keyed identity', () => {
    const message = {
      type: 'timed-map-weapon-state',
      schemaVersion: TIMED_MAP_WEAPON_SCHEMA_VERSION,
      by: 'host-a',
      states,
      nonce: 2,
    } as const;
    expect(isTimedMapWeaponStateMessage(message)).toBe(true);
    expect(isTimedMapWeaponProtocolMessage(message)).toBe(true);
    expect(isGameMessage(message)).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(true);
    expect(isStateTrafficMessage(message)).toBe(true);
    expect(isTimedMapWeaponStateMessage({
      ...message,
      states: { flamethrower: states.flamethrower },
    })).toBe(false);
    expect(isTimedMapWeaponStateMessage({
      ...message,
      states: { flamethrower: states['flare-gun'], 'flare-gun': states.flamethrower },
    })).toBe(false);
  });

  it('keeps the strict worst-case retained-shot state inside the reliable wire budget', () => {
    const retainedIds = (prefix: string) => Array.from({ length: 32 }, (_, index) => (
      `${prefix}-${String(index).padStart(2, '0')}-${'x'.repeat(96)}`.slice(0, 96)
    ));
    const message = {
      type: 'timed-map-weapon-state',
      schemaVersion: TIMED_MAP_WEAPON_SCHEMA_VERSION,
      by: 'host-a',
      states: {
        flamethrower: { ...states.flamethrower, processedShotIds: retainedIds('flame') },
        'flare-gun': { ...states['flare-gun'], processedShotIds: retainedIds('flare') },
      },
      nonce: Number.MAX_SAFE_INTEGER,
    } as const;
    const encodedBytes = new TextEncoder().encode(stableStringify(message)).byteLength;
    expect(isTimedMapWeaponStateMessage(message)).toBe(true);
    expect(encodedBytes).toBeLessThanOrEqual(MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES);
  });

  it('rejects prototype/key smuggling and malformed nested authority', () => {
    expect(isTimedMapWeaponStateMessage({
      type: 'timed-map-weapon-state', schemaVersion: 1, by: 'host-a', nonce: 3,
      states: { ...states, extra: states.flamethrower },
    })).toBe(false);
    expect(isTimedMapWeaponStateMessage({
      type: 'timed-map-weapon-state', schemaVersion: 1, by: 'host-a', nonce: 3,
      states: { ...states, flamethrower: { ...states.flamethrower, shotsRemaining: 999_999 } },
    })).toBe(false);
  });
});
