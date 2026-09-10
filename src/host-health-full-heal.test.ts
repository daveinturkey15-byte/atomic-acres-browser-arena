import { describe, expect, it } from 'vitest';
import {
  admitHealthAuthority,
  clampAdmittedHpToHealthAuthority,
  evaluateHealthAuthorityPublication,
  HEALTH_AUTHORITY_EMIT_COPIES,
  HEALTH_AUTHORITY_RESEND_INTERVAL_MS,
  type PublishedHealthAuthority,
} from './host-health-authority-broadcast';

// Actual three-peer118e soak: host/subject regenerated100, observer stayed80.
// Exercise the existing publisher -> observer admission -> state clamp path.
const base = {
  playerId: 'guest-b', hostPlayerId: 'host', continuity: 4, matchEpoch: 7,
  hostTimeMs: 1000, nowMs: 1000, nonce: 1, alive: true,
};
const observer = {
  role: 'client' as const, expectedHostId: 'host', matchEpoch: 7,
  subjectContinuity: 4, lastRevision: 8, lastRevisionEpoch: 7,
};
const prior: PublishedHealthAuthority = {
  hp: 80, alive: true, continuity: 4, revision: 8,
  emits: HEALTH_AUTHORITY_EMIT_COPIES, lastEmittedAtMs: 900,
};
const clamp = (heldHp: number) => clampAdmittedHpToHealthAuthority({
  admittedHp: 100, heldHp, heldContinuity: 4, subjectContinuity: 4, incomingContinuity: 4,
});

describe('HF-535 bounded full-heal observer checkpoint', () => {
  it('keeps partial regen quiet but releases the stale observer floor on an admitted full heal', () => {
    const partial = evaluateHealthAuthorityPublication({ ...base, hp: 95, published: prior });
    expect(partial.message).toBeNull();
    expect(partial.published?.hp).toBe(95);
    expect(clamp(80)).toBe(80); // Newer movement alone still cannot undo damage.
    const healed = evaluateHealthAuthorityPublication({ ...base, nowMs: 1100, hp: 100, published: partial.published });
    expect(healed.message).not.toBeNull();
    const admitted = admitHealthAuthority({ ...observer, message: healed.message! });
    expect(admitted).toMatchObject({ accepted: true, hp: 100, revision: 9 });
    expect(clamp(admitted.hp)).toBe(100);
  });

  it('mints a newer healed fact even while the preceding damage copies are pending', () => {
    const damage = evaluateHealthAuthorityPublication({ ...base, hp: 80, published: undefined });
    expect(damage.published?.emits).toBe(1);
    const healed = evaluateHealthAuthorityPublication({ ...base, nowMs: 1001, hp: 100, published: damage.published });
    expect(healed.message).toMatchObject({ hp: 100, revision: 1, continuity: 4 });
    expect(healed.published?.emits).toBe(1);
    const admitted = admitHealthAuthority({ ...observer, lastRevision: 0, message: healed.message! });
    expect(admitted.accepted).toBe(true);
    expect(clamp(admitted.hp)).toBe(100);
  });

  it('emits only the existing copy budget for one healed revision, then publishes subsequent damage', () => {
    let published: PublishedHealthAuthority | undefined = prior;
    const facts: Array<{ hp: number; revision: number }> = [];
    for (let tick = 0; tick < 20; tick += 1) {
      const result = evaluateHealthAuthorityPublication({
        ...base, nowMs: 1000 + tick * HEALTH_AUTHORITY_RESEND_INTERVAL_MS,
        hp: 100, published,
      });
      published = result.published;
      if (result.message) facts.push({ hp: result.message.hp, revision: result.message.revision });
    }
    expect(facts).toEqual(Array.from({ length: HEALTH_AUTHORITY_EMIT_COPIES }, () => ({ hp: 100, revision: 9 })));
    const nextDamage = evaluateHealthAuthorityPublication({ ...base, nowMs: 2000, hp: 80, published });
    expect(nextDamage.message).toMatchObject({ hp: 80, revision: 10 });
    const admitted = admitHealthAuthority({ ...observer, lastRevision: 9, message: nextDamage.message! });
    expect(admitted.accepted).toBe(true);
    expect(clamp(admitted.hp)).toBe(80);
  });

  it('retains host, life and revision fences for healed facts and rejects duplicate copies', () => {
    const healed = evaluateHealthAuthorityPublication({ ...base, hp: 100, published: prior });
    expect(healed.message).not.toBeNull();
    const fact = healed.message!;
    expect(admitHealthAuthority({ ...observer, message: { ...fact, by: 'guest-a' } }).reason).toBe('forged-author');
    expect(admitHealthAuthority({ ...observer, message: { ...fact, continuity: 3 } }).reason).toBe('stale-life');
    expect(admitHealthAuthority({ ...observer, message: { ...fact, continuity: 5 } }).reason).toBe('newer-life-held');
    expect(admitHealthAuthority({ ...observer, message: { ...fact, revision: 8 } }).reason).toBe('stale-revision');
    expect(admitHealthAuthority({ ...observer, message: { ...fact, matchEpoch: 6 } }).reason).toBe('stale-epoch');
    expect(admitHealthAuthority({ ...observer, lastRevision: 9, message: fact }).reason).toBe('stale-revision');
  });

  it('does not manufacture a live full-heal checkpoint from a dead stored authority', () => {
    const result = evaluateHealthAuthorityPublication({ ...base, hp: 100, alive: false, published: { ...prior, alive: false } });
    expect(result.message).toBeNull();
    expect(result.published?.alive).toBe(false);
  });
});
