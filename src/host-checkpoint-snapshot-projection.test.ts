import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { checkpointGuestAuthority } from './host-match-checkpoint';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import type { PlayerSnapshot } from './protocol';

/**
 * HF-325 close-out: the authority mirror starved silently because
 * canonicalRetainedGuestSnapshot blind-spread its source snapshot, and
 * HF-358's optional `swimming` flag rode along. The checkpoint validator's
 * exact-key contract then refused EVERY guest entry, so no host checkpoint was
 * ever produced, shipAuthorityMirror never fired, and host succession could not
 * promote in any real match — while every fixture-based unit test stayed green
 * because the fixtures predate the `swimming` field.
 *
 * These tests pin BOTH halves at equal-or-greater strictness:
 *  1. the live projection in legacy-main must enumerate the bounded field set
 *     explicitly and never spread its source into a wire document;
 *  2. the documented failure must stay reproducible: a spread snapshot carrying
 *     `swimming` MUST be refused by checkpointGuestAuthority, and the explicit
 *     projection MUST be accepted — if the validator ever loosens, the second
 *     clause is the canary that this projection discipline is what keeps the
 *     mirror shipping.
 */

const LEGACY_MAIN_PATH = resolve(import.meta.dirname, 'legacy-main.ts');

// The exact bounded field set the checkpoint validator demands.
const CHECKPOINT_SNAPSHOT_KEYS = [
  'id', 'name', 'team', 'x', 'y', 'z', 'yaw', 'pitch', 'hp', 'kills', 'deaths',
  'primary', 'secondary', 'grenade', 'weapon', 'stance', 'seq',
] as const;

describe('host checkpoint guest snapshot projection', () => {
  it('never spreads the source snapshot into the checkpoint document', () => {
    const source = readFileSync(LEGACY_MAIN_PATH, 'utf8');
    const start = source.indexOf('function canonicalRetainedGuestSnapshot(');
    expect(start, 'canonicalRetainedGuestSnapshot must exist in legacy-main.ts').toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\nfunction ', start + 10);
    const fn = source.slice(start, end);
    expect(fn).not.toMatch(/\.\.\.\s*source\b/);
    for (const key of CHECKPOINT_SNAPSHOT_KEYS) {
      // `weapon` is projected shorthand (`weapon,`); the rest are `key: value`.
      const enumerated = fn.includes(`${key}:`) || new RegExp(`\\b${key},`).test(fn);
      expect(enumerated, `projection must enumerate ${key} explicitly`).toBe(true);
    }
  });

  it('refuses a spread snapshot that carried the optional swimming flag', () => {
    const spreadSnapshot = {
      id: 'guest-1',
      name: 'Guest',
      team: 1,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      primary: 'm4a1',
      secondary: 'pistol',
      grenade: 'frag',
      weapon: 'm4a1',
      stance: 'stand',
      seq: 1,
      // HF-358 drift: rides a blind spread, breaks the exact-key contract.
      swimming: false,
    } as unknown as PlayerSnapshot;
    expect(checkpointGuestAuthority(spreadSnapshot, 1, aliveHealth(), createGuestCombatInventory('m4a1', 'pistol'), 1_000)).toBeNull();
  });

  it('accepts the explicitly projected field set for the same guest', () => {
    const projected: PlayerSnapshot = {
      id: 'guest-1',
      name: 'Guest',
      team: 1,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      kills: 0,
      deaths: 0,
      primary: 'm4a1',
      secondary: 'pistol',
      grenade: 'frag',
      weapon: 'm4a1',
      stance: 'stand',
      seq: 1,
    };
    expect(checkpointGuestAuthority(projected, 1, aliveHealth(), createGuestCombatInventory('m4a1', 'pistol'), 1_000)).not.toBeNull();
  });
});

function aliveHealth() {
  return {
    hp: 100,
    alive: true,
    respawnEligibleAt: 0,
    diedAtHostTimeMs: null,
    lastDamageAtHostTimeMs: 0,
    lastAdvancedAtHostTimeMs: 0,
  };
}
