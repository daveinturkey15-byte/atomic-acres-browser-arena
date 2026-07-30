import { describe, expect, it } from 'vitest';
import {
  controllableKillstreakId,
  selectControllableSupportEntity,
  type ControllableSupportEntity,
} from './killstreak-slot-possession';

const entities: ControllableSupportEntity[] = [
  { id: 'drone-z', ownerId: 'owner', expiresInMs: 20_000, kind: 'drone', mode: 'piloted' },
  { id: 'chopper-z', ownerId: 'owner', expiresInMs: 20_000, kind: 'chopper' },
  { id: 'drone-a', ownerId: 'owner', expiresInMs: 10_000, kind: 'drone', mode: 'piloted' },
  { id: 'drone-swarm', ownerId: 'owner', expiresInMs: 20_000, kind: 'drone', mode: 'swarm' },
  { id: 'chopper-other', ownerId: 'other', expiresInMs: 20_000, kind: 'chopper' },
  { id: 'chopper-expired', ownerId: 'owner', expiresInMs: 0, kind: 'chopper' },
];

describe('HF-187 slot-key possession target selection', () => {
  it('recognises only the two slot-controlled support platforms', () => {
    expect(controllableKillstreakId('piloted-drone')).toBe(true);
    expect(controllableKillstreakId('chopper')).toBe(true);
    expect(controllableKillstreakId('drone-swarm')).toBe(false);
    expect(controllableKillstreakId('care-package')).toBe(false);
  });

  it('selects a deterministic live owned platform regardless of snapshot order', () => {
    expect(selectControllableSupportEntity('piloted-drone', 'owner', entities)?.id).toBe('drone-a');
    expect(selectControllableSupportEntity('piloted-drone', 'owner', [...entities].reverse())?.id).toBe('drone-a');
    expect(selectControllableSupportEntity('chopper', 'owner', entities)?.id).toBe('chopper-z');
  });

  it('never confuses swarm, expired, or another actor platform with the slot target', () => {
    expect(selectControllableSupportEntity('piloted-drone', 'missing', entities)).toBeNull();
    expect(selectControllableSupportEntity('chopper', 'missing', entities)).toBeNull();
  });
});
