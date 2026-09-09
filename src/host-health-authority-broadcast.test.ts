import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  admitHealthAuthority,
  clampAdmittedHpToHealthAuthority,
  classifyRemoteRespawn,
  evaluateHealthAuthorityPublication,
  mintHealthAuthoritySeed,
  type PublishedHealthAuthority,
} from './host-health-authority-broadcast';
import { isGameMessage, isHostAuthorityMessage, isStateTrafficMessage, type HealthAuthorityMessage, type PlayerSnapshot } from './protocol';
import { admitRemoteSnapshot, shouldApplyStaleSelfHealthRepair } from './remote-snapshot-reconciliation';

/**
 * HF-535 falsifier. Every assertion here fails at 212223ad: the module, the
 * message type and the two legacy-main call sites do not exist there, and the
 * one thing that DOES exist at that head — the canonical re-broadcast being
 * rejected by the observer's sequence fence — is asserted below as the defect
 * it is, so this file cannot be made green by deleting the fix.
 *
 * Measured defect being closed (mp-repair REPORT §7.2, day-mp-fix-bundle.json):
 * MP-SOAK-REJOIN-DAMAGE fails on exactly one conjunct, firstSeenMs.guestA ===
 * null. Host 0 ms, guestB 225 ms, guestA never inside the 120 ms bound.
 */

const HOST_ID = 'host-1';
const VICTIM_ID = 'guest-b';

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: VICTIM_ID, name: 'Guest B', team: 0, x: 1, y: 1.7, z: 2, yaw: 0, pitch: 0,
    hp: 100, weapon: 'm4a1', primary: 'm4a1', secondary: 'pistol', grenade: 'frag',
    seq: 400, kills: 0, deaths: 0,
    ...overrides,
  } as PlayerSnapshot;
}

function message(overrides: Partial<HealthAuthorityMessage> = {}): HealthAuthorityMessage {
  return {
    type: 'health-authority', by: HOST_ID, playerId: VICTIM_ID,
    hp: 80, alive: true, continuity: 3, matchEpoch: 7, revision: 0,
    hostTimeMs: 12_345, nonce: 99,
    ...overrides,
  };
}

const observing = {
  role: 'client' as const,
  expectedHostId: HOST_ID,
  matchEpoch: 7,
  subjectContinuity: 3,
  lastRevision: -1,
};

describe('HF-535 the defect the health authority exists to close', () => {
  it('the canonical re-broadcast IS rejected by an observer that already applied the victim seq', () => {
    // This is the measured mechanism, restated as an executable fact. The host
    // re-broadcasts remote.snapshot after applying damage; that snapshot still
    // carries seq 400, which guestA applied a tick ago. Movement admission
    // therefore drops it and the hp 80 inside it is never seen.
    const applied = snapshot({ hp: 100, seq: 400 });
    const rebroadcast = admitRemoteSnapshot(applied, 3, 5_000, {
      kind: 'state', snapshot: snapshot({ hp: 80, seq: 400 }), continuity: 3, hostTimeMs: 5_000,
    });
    expect(rebroadcast.accepted).toBe(false);
    expect(rebroadcast.reason).toBe('older-sequence');
    expect(rebroadcast.state.snapshot.hp).toBe(100);
  });

  it('the same host fact on its own revision IS admissible at that exact moment', () => {
    const admission = admitHealthAuthority({ message: message({ revision: 0 }), ...observing });
    expect(admission.accepted).toBe(true);
    expect(admission.hp).toBe(80);
    expect(admission.alive).toBe(true);
  });
});

describe('HF-535 observer admission is fail-closed', () => {
  it('rejects a forged guest-authored health advance', () => {
    const forged = message({ by: 'guest-a', revision: 5 });
    expect(admitHealthAuthority({ message: forged, ...observing }).reason).toBe('forged-author');
    // Second, independent fence: the transport drops it on a guest connection.
    expect(isHostAuthorityMessage(forged)).toBe(true);
  });

  it('rejects a host-authored fact when the receiver does not know the host id yet', () => {
    expect(admitHealthAuthority({ message: message(), ...observing, expectedHostId: null }).reason)
      .toBe('forged-author');
  });

  it('rejects a stale match epoch', () => {
    expect(admitHealthAuthority({ message: message({ matchEpoch: 6 }), ...observing }).reason).toBe('stale-epoch');
    expect(admitHealthAuthority({ message: message({ matchEpoch: 8 }), ...observing }).reason).toBe('stale-epoch');
  });

  it('rejects a fact about a life older than the one being presented', () => {
    expect(admitHealthAuthority({ message: message({ continuity: 2 }), ...observing }).reason).toBe('stale-life');
  });

  it('holds a fact about a newer life instead of presenting a corpse as alive', () => {
    // DAY-MP-DAMAGE-FIXES fix 5: admitting a life N+1 fact on an observer
    // still presenting life N turned the corpse visible at its death position.
    // The fact is held (and burns no revision) until the local continuity
    // advances; the state lane delivers the new life's hp in the meantime.
    const held = admitHealthAuthority({
      message: message({ continuity: 4, hp: 100, alive: true, revision: 2 }), ...observing,
    });
    expect(held.accepted).toBe(false);
    expect(held.reason).toBe('newer-life-held');
    expect(held.revision).toBe(-1);
  });

  it('rejects an unknown subject rather than inventing a presentation for it', () => {
    expect(admitHealthAuthority({ message: message(), ...observing, subjectContinuity: null }).reason)
      .toBe('unknown-subject');
  });

  it('rejects a duplicate or reordered revision inside the same life', () => {
    expect(admitHealthAuthority({ message: message({ revision: 4 }), ...observing, lastRevision: 4 }).reason)
      .toBe('stale-revision');
    expect(admitHealthAuthority({ message: message({ revision: 3 }), ...observing, lastRevision: 4 }).reason)
      .toBe('stale-revision');
    expect(admitHealthAuthority({ message: message({ revision: 5 }), ...observing, lastRevision: 4 }).accepted)
      .toBe(true);
  });

  it('never applies on the author or on an offline peer', () => {
    expect(admitHealthAuthority({ message: message(), ...observing, role: 'host' }).reason).toBe('not-observer');
    expect(admitHealthAuthority({ message: message(), ...observing, role: 'offline' }).reason).toBe('not-observer');
  });

  it('derives alive from hp so a forged live-corpse cannot resurrect anybody', () => {
    const admission = admitHealthAuthority({ message: message({ hp: 0, alive: true }), ...observing });
    expect(admission.accepted).toBe(true);
    expect(admission.alive).toBe(false);
  });
});

describe('HF-535 host publication ordering', () => {
  const base = {
    playerId: VICTIM_ID, hostPlayerId: HOST_ID, matchEpoch: 7,
    hostTimeMs: 1_000, nonce: 42, continuity: 3, nowMs: 0,
  };

  it('publishes the first fact about a player and then only on a drop or life change', () => {
    const first = evaluateHealthAuthorityPublication({ ...base, hp: 100, alive: true, published: undefined });
    expect(first.reason).toBe('published');
    expect(first.message?.revision).toBe(0);

    const unchanged = evaluateHealthAuthorityPublication({ ...base, hp: 100, alive: true, published: first.published });
    expect(unchanged.reason).toBe('unchanged');
    expect(unchanged.message).toBeNull();

    const damaged = evaluateHealthAuthorityPublication({ ...base, hp: 80, alive: true, published: unchanged.published });
    expect(damaged.reason).toBe('published');
    expect(damaged.message?.hp).toBe(80);
    expect(damaged.message?.revision).toBe(1);
  });

  it('refreshes the ledger on a silent regeneration so the next real drop still publishes', () => {
    // The regression this guards: if the unchanged branch kept the old low
    // watermark, a player who fell to 80 and regenerated to 100 would never
    // publish the NEXT fall to 80 - the drop would look like no change.
    let published: PublishedHealthAuthority | undefined;
    let nowMs = 0;
    for (const hp of [100, 80, 90, 100]) {
      // Step past the three-copy emission window each time, so the watermark is
      // tracking live hp rather than holding a fact that is still in flight.
      for (let step = 0; step < 4; step += 1) {
        nowMs += 40;
        published = evaluateHealthAuthorityPublication({ ...base, nowMs, hp, alive: true, published }).published;
      }
    }
    expect(published?.hp).toBe(100);
    nowMs += 40;
    const again = evaluateHealthAuthorityPublication({ ...base, nowMs, hp: 80, alive: true, published });
    expect(again.reason).toBe('published');
    expect(again.message?.hp).toBe(80);
  });

  it('publishes a death and a new life, and never mints a live corpse', () => {
    const alive = evaluateHealthAuthorityPublication({ ...base, hp: 100, alive: true, published: undefined });
    const dead = evaluateHealthAuthorityPublication({ ...base, nowMs: 10, hp: 0, alive: true, published: alive.published });
    expect(dead.reason).toBe('published');
    expect(dead.message?.alive).toBe(false);
    const respawn = evaluateHealthAuthorityPublication({
      ...base, nowMs: 20, continuity: 4, hp: 100, alive: true, published: dead.published,
    });
    expect(respawn.reason).toBe('published');
    expect(respawn.message?.continuity).toBe(4);
    expect(respawn.message?.revision).toBe(2);
  });

  it('mints nothing malformed and never authors a fact about the host itself', () => {
    expect(evaluateHealthAuthorityPublication({ ...base, playerId: HOST_ID, hp: 80, alive: true, published: undefined }).reason)
      .toBe('malformed');
    expect(evaluateHealthAuthorityPublication({ ...base, hp: Number.NaN, alive: true, published: undefined }).reason)
      .toBe('malformed');
    expect(evaluateHealthAuthorityPublication({ ...base, continuity: -1, hp: 80, alive: true, published: undefined }).reason)
      .toBe('malformed');
  });

  it('emits three idempotent copies of one fact, then stops', () => {
    // The gate impairs the reliable lane with 1% seeded loss, so a single-shot
    // fact can simply vanish for one observer. The copies carry the SAME
    // revision, which the observer rejects as stale, and they carry the same
    // payload even if hp moved between them.
    const first = evaluateHealthAuthorityPublication({ ...base, hp: 80, alive: true, published: undefined });
    expect(first.reason).toBe('published');
    const tooSoon = evaluateHealthAuthorityPublication({ ...base, nowMs: 10, hp: 80, alive: true, published: first.published });
    expect(tooSoon.reason).toBe('unchanged');
    const second = evaluateHealthAuthorityPublication({ ...base, nowMs: 40, hp: 90, alive: true, published: tooSoon.published });
    expect(second.reason).toBe('resent');
    expect(second.message?.hp, 'a copy must not disagree with the fact it repeats').toBe(80);
    expect(second.message?.revision).toBe(first.message?.revision);
    const third = evaluateHealthAuthorityPublication({ ...base, nowMs: 80, hp: 90, alive: true, published: second.published });
    expect(third.reason).toBe('resent');
    expect(third.message?.hp).toBe(80);
    const fourth = evaluateHealthAuthorityPublication({ ...base, nowMs: 200, hp: 90, alive: true, published: third.published });
    expect(fourth.reason).toBe('unchanged');
    expect(fourth.published?.hp, 'the watermark resumes tracking live hp once the fact is fully emitted').toBe(90);
  });

  it('forces a publish on a path that knows the stored authority moved', () => {
    // The damage paths pass force, so no ledger disagreement can swallow the
    // one fact an observer is owed.
    const first = evaluateHealthAuthorityPublication({ ...base, hp: 80, alive: true, published: undefined });
    let published = first.published;
    for (const nowMs of [40, 80, 200]) {
      published = evaluateHealthAuthorityPublication({ ...base, nowMs, hp: 80, alive: true, published }).published;
    }
    const unchanged = evaluateHealthAuthorityPublication({ ...base, nowMs: 240, hp: 80, alive: true, published });
    expect(unchanged.reason).toBe('unchanged');
    const forced = evaluateHealthAuthorityPublication({ ...base, nowMs: 240, hp: 80, alive: true, force: true, published: unchanged.published });
    expect(forced.reason).toBe('published');
    expect(forced.message?.revision).toBe((first.message?.revision ?? 0) + 1);
    expect(evaluateHealthAuthorityPublication({ ...base, hp: Number.NaN, alive: true, force: true, published: undefined }).reason)
      .toBe('malformed');
  });

  it('every message it mints parses on the wire and rides the reliable event lane', () => {
    const minted = evaluateHealthAuthorityPublication({ ...base, hp: 0, alive: true, published: undefined }).message;
    expect(minted).not.toBeNull();
    expect(isGameMessage(minted)).toBe(true);
    expect(isHostAuthorityMessage(minted!)).toBe(true);
    // NOT state traffic: state traffic takes the lossy lane and would be
    // re-ordered against the very sequence fence this message exists to bypass.
    expect(isStateTrafficMessage(minted!)).toBe(false);
  });
});

describe('HF-535 wire predicate', () => {
  it('rejects an inconsistent alive flag, an out-of-range hp and a self-addressed fact', () => {
    expect(isGameMessage(message({ hp: 0, alive: true }))).toBe(false);
    expect(isGameMessage(message({ hp: 101 }))).toBe(false);
    expect(isGameMessage(message({ hp: -1, alive: false }))).toBe(false);
    expect(isGameMessage(message({ playerId: HOST_ID }))).toBe(false);
    expect(isGameMessage(message({ revision: 1.5 }))).toBe(false);
    expect(isGameMessage(message({ continuity: -1 }))).toBe(false);
    expect(isGameMessage(message())).toBe(true);
  });
});

describe('HF-535 the subject applies it through the existing self repair', () => {
  it('admits a same-life decrease and refuses a heal or a stale life', () => {
    const carrier = { messageType: 'health-authority', localContinuity: 3, currentHp: 100 };
    expect(shouldApplyStaleSelfHealthRepair({ ...carrier, continuity: 3, incomingHp: 80 })).toBe(true);
    expect(shouldApplyStaleSelfHealthRepair({ ...carrier, continuity: 3, incomingHp: 100 })).toBe(false);
    expect(shouldApplyStaleSelfHealthRepair({ ...carrier, continuity: 2, incomingHp: 80 })).toBe(false);
    // The widening is additive: nothing else became admissible.
    expect(shouldApplyStaleSelfHealthRepair({ ...carrier, messageType: 'join', continuity: 3, incomingHp: 80 })).toBe(false);
  });
});

describe('HF-535 legacy-main wiring', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('publishes from the host tick, which covers every real damage path at one site', () => {
    expect(main).toContain('function publishRemoteHealthAuthority(');
    const tick = main.slice(main.indexOf('for (const [id, remote] of remotes) { if (network.role === \'host\')'));
    expect(tick.slice(0, tick.indexOf('\n'))).toContain('publishRemoteHealthAuthority(id);');
  });

  it('publishes from the QA damage hook beside the canonical state, not instead of it', () => {
    const start = main.indexOf('damageRemoteAuthoritatively: (amount: number, playerId) => {');
    const hook = main.slice(start, main.indexOf('\n  earnSupport:', start));
    expect(hook).toContain('createCanonicalRemoteState(remote.snapshot');
    expect(hook).toContain('publishRemoteHealthAuthority(targetId, true);');
    expect(
      hook.indexOf('publishRemoteHealthAuthority(targetId, true);'),
      'the health fact leads: the canonical state behind it is the one an observer rejects',
    ).toBeLessThan(hook.indexOf('createCanonicalRemoteState(remote.snapshot'));
  });

  it('applies it on the observer and clears both ledgers with the health authority', () => {
    expect(main).toContain("if (message.type === 'health-authority') { applyHealthAuthorityMessage(message); return; }");
    expect(main).toContain('function applyHealthAuthorityMessage(');
    expect(main).toContain('expectedHostId: privateLobbySnapshot?.hostId ?? null');
    expect(main).toContain('matchEpoch: killstreakMatchEpoch');
    expect(main).toContain('shouldApplyStaleSelfHealthRepair({ messageType: message.type');
    expect(main).toContain('publishedHealthAuthorities.clear(); appliedHealthAuthorityRevisions.clear();');
    expect(main).toContain('publishedHealthAuthorities.delete(playerId); appliedHealthAuthorityRevisions.delete(playerId);');
    // A forced publish that still declines is a lost fact, so it is counted.
    expect(main).toContain('function recordHealthAuthorityPublishDecline(');
  });
});

describe('DAY-MP-DAMAGE-FIXES fix 1: the applied revision is scoped to the match epoch', () => {
  it('accepts revision 1 of epoch B after revision 6 was applied in epoch A', () => {
    const appliedInA = admitHealthAuthority({
      message: message({ revision: 6, matchEpoch: 7 }),
      ...observing, matchEpoch: 7, lastRevision: -1, lastRevisionEpoch: null,
    });
    expect(appliedInA.accepted).toBe(true);
    const firstOfB = admitHealthAuthority({
      message: message({ revision: 1, matchEpoch: 8 }),
      ...observing, matchEpoch: 8, lastRevision: appliedInA.revision, lastRevisionEpoch: 7,
    });
    expect(firstOfB.accepted).toBe(true);
    expect(firstOfB.reason).toBe('accepted');
  });

  it('still rejects a duplicate revision inside the same epoch', () => {
    expect(admitHealthAuthority({
      message: message({ revision: 6 }), ...observing, lastRevision: 6, lastRevisionEpoch: 7,
    }).reason).toBe('stale-revision');
  });
});

describe('DAY-MP-DAMAGE-FIXES fix 5: a newer-life fact is held, never presented', () => {
  it('applies the fact once the local continuity has advanced to its life', () => {
    const admission = admitHealthAuthority({
      message: message({ continuity: 4, hp: 100, alive: true, revision: 2 }),
      ...observing, subjectContinuity: 4, lastRevision: -1,
    });
    expect(admission.accepted).toBe(true);
  });

  it('no longer claims a newer-life fact cannot resurrect anybody', () => {
    const moduleSrc = readFileSync(new URL('./host-health-authority-broadcast.ts', import.meta.url), 'utf8');
    expect(moduleSrc).not.toContain('so it can never resurrect anybody');
  });
});

describe('DAY-MP-DAMAGE-FIXES fix 2: a (re)joining observer is seeded with the current authority', () => {
  it('re-mints the current published fact for the joiner, idempotent by revision', () => {
    const first = evaluateHealthAuthorityPublication({
      playerId: VICTIM_ID, hostPlayerId: HOST_ID, matchEpoch: 7,
      hostTimeMs: 1_000, nonce: 42, continuity: 3, nowMs: 0, hp: 80, alive: true, published: undefined,
    });
    const seed = mintHealthAuthoritySeed({
      playerId: VICTIM_ID, hostPlayerId: HOST_ID, matchEpoch: 7,
      hostTimeMs: 2_000, nonce: 77, published: first.published,
    });
    expect(seed).not.toBeNull();
    expect(seed?.revision).toBe(first.message?.revision);
    expect(seed?.hp).toBe(80);
    expect(seed?.continuity).toBe(3);
    expect(seed?.by).toBe(HOST_ID);
    expect(isGameMessage(seed!)).toBe(true);
    // Idempotent: the joiner that already applied it rejects the seed as stale.
    const replay = admitHealthAuthority({
      message: seed!, role: 'client', expectedHostId: HOST_ID, matchEpoch: 7,
      subjectContinuity: 3, lastRevision: seed!.revision, lastRevisionEpoch: 7,
    });
    expect(replay.reason).toBe('stale-revision');
  });

  it('mints nothing when the host never published for the subject', () => {
    expect(mintHealthAuthoritySeed({
      playerId: VICTIM_ID, hostPlayerId: HOST_ID, matchEpoch: 7,
      hostTimeMs: 2_000, nonce: 77, published: undefined,
    })).toBeNull();
  });
});

describe('DAY-MP-DAMAGE-FIXES fix 3: respawn classification needs a continuity advance', () => {
  it('does not classify a lethal fact plus a same-life pre-death state as a respawn', () => {
    // The ordering hazard: a lethal health fact applied on the observer ahead
    // of an in-flight pre-death canonical state. The state carries hp 100
    // while the snapshot shows 0, but its continuity did not advance.
    expect(classifyRemoteRespawn({
      snapshotHp: 0, incomingHp: 100, remoteContinuity: 4, incomingContinuity: 4, redeployed: false,
    })).toBe(false);
  });

  it('still classifies a genuine new-life respawn', () => {
    expect(classifyRemoteRespawn({
      snapshotHp: 0, incomingHp: 100, remoteContinuity: 4, incomingContinuity: 5, redeployed: false,
    })).toBe(true);
  });

  it('keeps the redeployed clause', () => {
    expect(classifyRemoteRespawn({
      snapshotHp: 100, incomingHp: 100, remoteContinuity: 4, incomingContinuity: 4, redeployed: true,
    })).toBe(true);
  });

  it('never classifies a continuous live move as a respawn', () => {
    expect(classifyRemoteRespawn({
      snapshotHp: 80, incomingHp: 90, remoteContinuity: 4, incomingContinuity: 4, redeployed: false,
    })).toBe(false);
  });
});

describe('DAY-MP-DAMAGE-FIXES fix 4: an admitted state cannot revert a held authority', () => {
  const held = { heldHp: 0, heldContinuity: 4, subjectContinuity: 4, incomingContinuity: 4 };

  it('clamps a stale-high state to the held authority inside the same life', () => {
    expect(clampAdmittedHpToHealthAuthority({ ...held, admittedHp: 100 })).toBe(0);
  });

  it('leaves further damage and consistent states alone', () => {
    expect(clampAdmittedHpToHealthAuthority({ ...held, heldHp: 80, admittedHp: 70 })).toBe(70);
    expect(clampAdmittedHpToHealthAuthority({ ...held, heldHp: 80, admittedHp: 80 })).toBe(80);
  });

  it('releases the clamp when the state carries a newer life', () => {
    expect(clampAdmittedHpToHealthAuthority({ ...held, admittedHp: 100, incomingContinuity: 5 })).toBe(100);
  });

  it('does nothing with no held authority', () => {
    expect(clampAdmittedHpToHealthAuthority({
      admittedHp: 100, heldHp: undefined, heldContinuity: undefined,
      subjectContinuity: 4, incomingContinuity: 4,
    })).toBe(100);
  });
});

describe('DAY-MP-DAMAGE-FIXES fixes 2/3/4/6: legacy-main wiring', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('fix 2: seeds a (re)joining observer beside the repair snapshots', () => {
    expect(main).toContain('mintHealthAuthoritySeed({ playerId: candidate.snapshot.id');
    expect(main).toContain('mintHealthAuthoritySeed({ playerId: incoming.id');
    expect(main).toContain('network.sendToPlayer(incoming.id, healthSeed);');
  });

  it('fix 3: gates the respawn classification on a continuity advance', () => {
    expect(main).toContain('classifyRemoteRespawn({ snapshotHp: remote.snapshot.hp');
  });

  it('fix 4: clamps an admitted state to the held authority inside the same life', () => {
    expect(main).toContain('clampAdmittedHpToHealthAuthority({ admittedHp: admittedIncoming.hp');
  });

  it('fix 6: records the applied revision only on a path that actually applied', () => {
    const start = main.indexOf('function applyHealthAuthorityMessage(');
    const applyFn = main.slice(start, start + 8000);
    expect(applyFn).toContain('health-authority-self-non-damage');
    expect(applyFn.indexOf('health-authority-self-non-damage')).toBeLessThan(
      applyFn.indexOf('appliedHealthAuthorityRevisions.set('),
    );
  });
});
