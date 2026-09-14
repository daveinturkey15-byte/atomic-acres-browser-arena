/**
 * HF-347 — Gun Range training-dummy lifecycle is host-authoritative.
 *
 * Poses already replicate (pure function of host time). This locks the rest:
 *   1. one pure damage reducer shared by every authoritative writer,
 *   2. pose convergence when peers project through host time,
 *   3. lobby-snapshot replication of dummy active/health/respawn state,
 *   4. shot-result outcomes may carry dummy health (300 max) and the exact
 *      host respawn stamp — but only for test-dummy targets,
 *   5. source-level wiring: guests never self-apply dummy damage; the host
 *      resolver targets dummies; snapshots publish and guests adopt state.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  gunRangeTestBayDummyPose,
  resolveGunRangeDummyDamage,
} from './gun-range-test-bay';
import { DEFAULT_PRIVATE_MATCH_CONFIG, isLobbySnapshot, type LobbySnapshot } from './private-match';
import { isGameMessage, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

describe('HF-347 dummy damage reducer', () => {
  it('applies bounded damage and stamps the respawn only on death', () => {
    const graze = resolveGunRangeDummyDamage(300, 45.5, 10_000, 2_500);
    expect(graze).toEqual({ appliedDamage: 45.5, healthAfter: 254.5, died: false, respawnAtMs: null });

    const lethal = resolveGunRangeDummyDamage(40, 90, 10_000, 2_500);
    expect(lethal.appliedDamage).toBe(40);
    expect(lethal.healthAfter).toBe(0);
    expect(lethal.died).toBe(true);
    expect(lethal.respawnAtMs).toBe(12_500);
  });

  it('refuses NaN damage, negative health, and non-finite clocks', () => {
    expect(resolveGunRangeDummyDamage(300, Number.NaN, 5, 100).appliedDamage).toBe(0);
    expect(resolveGunRangeDummyDamage(-5, 10, 5, 100)).toMatchObject({ healthAfter: 0, died: false });
    expect(() => resolveGunRangeDummyDamage(300, 10, Number.NaN, 100)).toThrow(TypeError);
  });

  it('does not report a death for a target that was already down', () => {
    expect(resolveGunRangeDummyDamage(0, 50, 5, 100).died).toBe(false);
  });
});

describe('HF-347 pose convergence through host time', () => {
  const definition = GUN_RANGE_TEST_BAY_CONTRACT.dummies[0];

  it('two peers with clocks 800 ms apart agree once both project host time', () => {
    const hostNowMs = 90_000;
    // Guest local clock is 800 ms behind; its projection recovers host time.
    const guestLocalNowMs = hostNowMs - 800;
    const guestProjectedHostNowMs = guestLocalNowMs + 800;
    const hostPose = gunRangeTestBayDummyPose(definition, hostNowMs);
    const guestPose = gunRangeTestBayDummyPose(definition, guestProjectedHostNowMs);
    expect(guestPose.position).toEqual(hostPose.position);
    expect(guestPose.yawRadians).toBe(hostPose.yawRadians);
    // The failure mode this replaced: feeding the raw local clock diverges.
    const divergent = gunRangeTestBayDummyPose(definition, guestLocalNowMs);
    expect(divergent.position).not.toEqual(hostPose.position);
  });
});

describe('HF-347 lobby snapshot dummy replication', () => {
  const members = [
    { id: 'host', name: 'Host', team: 0 as const, ready: true, connected: true, pingMs: 0, dhv: 10 as const },
    { id: 'b', name: 'Bravo', team: 1 as const, ready: true, connected: true, pingMs: 30, dhv: 8 as const },
  ];
  const activeGunRange = (changes: Partial<LobbySnapshot> = {}): LobbySnapshot => ({
    revision: 1,
    hostId: 'host',
    phase: 'active',
    config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', mode: 'ffa', hostedBotCount: 0, autoBalance: false, durationMs: 120_000 },
    members,
    scores: [],
    snapshotHostTimeMs: 500,
    activeAtHostTimeMs: 0,
    activeAtEpochMs: 1,
    matchClock: { schemaVersion: 1, revision: 0, paused: false, remainingMs: 120_000, sampledAtHostTimeMs: 500 },
    testBayDoor: { phase: 'closed', openness: 0, updatedAtMs: 500, thumpSequence: 0 },
    ...changes,
  });
  const dummies = [
    { id: 'test-dummy-alpha', active: true, health: 300, respawnAtHostTimeMs: 0 },
    { id: 'test-dummy-bravo', active: false, health: 0, respawnAtHostTimeMs: 91_500 },
  ];

  it('accepts canonical dummy state and tolerates absence from an older host', () => {
    expect(isLobbySnapshot(activeGunRange({ testDummies: dummies }))).toBe(true);
    expect(isLobbySnapshot(activeGunRange())).toBe(true); // field absent
  });

  it('rejects malformed dummy state', () => {
    expect(isLobbySnapshot(activeGunRange({ testDummies: [{ ...dummies[0], id: 'bot-1' }] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ testDummies: [{ ...dummies[0], health: 501 }] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ testDummies: [{ ...dummies[0], health: -1 }] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ testDummies: [{ ...dummies[0], respawnAtHostTimeMs: Number.NaN }] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ testDummies: [dummies[0], dummies[0]] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ testDummies: [{ ...dummies[0], active: true, health: 0 }] }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({
      testDummies: [{ ...dummies[0], extra: 1 } as unknown as (typeof dummies)[number]],
    }))).toBe(false);
  });

  it('rejects dummy state outside an active gun-range match', () => {
    expect(isLobbySnapshot(activeGunRange({ phase: 'waiting', activeAtHostTimeMs: null, activeAtEpochMs: null, matchClock: null, testBayDoor: null, testDummies: dummies }))).toBe(false);
    expect(isLobbySnapshot(activeGunRange({ phase: 'waiting', activeAtHostTimeMs: null, activeAtEpochMs: null, matchClock: null, testBayDoor: null, testDummies: null }))).toBe(true);
  });
});

describe('HF-347 shot-result dummy outcomes', () => {
  const result = {
    type: 'shot-result' as const,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: 'host',
    forPlayerId: 'abc',
    shotId: 'shot_abc_9',
    connectionEpoch: 'connection_epoch_abc',
    lifeId: 3,
    shotSeq: 7,
    weapon: 'carbine' as const,
    status: 'accepted-hit' as const,
    reason: 'none' as const,
    fireTimeMs: 2_500,
    targetViewTimeMs: 2_420,
    receivedAtHostTimeMs: 2_520,
    resolvedAtHostTimeMs: 2_521,
    appliedRewindMs: 80,
    combatInventory: {
      revision: 8,
      primary: { weapon: 'carbine' as const, ammo: 19, reserve: 100 },
      sidearm: { weapon: 'pistol' as const, ammo: 12, reserve: 48 },
      grenades: 1 as const,
    },
    outcomes: [{
      target: 'test-dummy-alpha', pelletHits: 1, damage: 34, rawDamage: 34, resultingHealth: 266,
      died: false, hitZone: 'body' as const, wallbang: false, penetrationMultiplier: 1,
    }],
    nonce: 42,
  };

  it('admits dummy health above the 100-point combatant bound, for dummies only', () => {
    expect(isGameMessage(result)).toBe(true);
    expect(isGameMessage({
      ...result,
      outcomes: [{ ...result.outcomes[0], target: 'some-player', resultingHealth: 266 }],
    })).toBe(false);
  });

  it('admits the exact host respawn stamp on dummy deaths, for dummies only', () => {
    expect(isGameMessage({
      ...result,
      outcomes: [{ ...result.outcomes[0], resultingHealth: 0, died: true, targetRespawnAtHostTimeMs: 12_500 }],
    })).toBe(true);
    expect(isGameMessage({
      ...result,
      outcomes: [{ ...result.outcomes[0], target: 'some-player', resultingHealth: 0, died: true, targetRespawnAtHostTimeMs: 12_500 }],
    })).toBe(false);
    expect(isGameMessage({
      ...result,
      outcomes: [{ ...result.outcomes[0], targetRespawnAtHostTimeMs: Number.NaN }],
    })).toBe(false);
  });
});

describe('HF-347 legacy-main wiring', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('never lets a guest apply training-dummy damage locally in the fire path', () => {
    expect(main).toContain("network.role === 'client' && practiceTarget?.kind === 'training-dummy'");
  });

  it('resolves guest shots against host-time dummy poses in resolveAuthoritativeShot', () => {
    expect(main).toContain('gunRangeTestBayDummyPose(definition, Math.max(0, request.targetViewTimeMs))');
    expect(main).toContain("targetId.startsWith('test-dummy-')");
  });

  it('publishes dummy lifecycle state in every active gun-range lobby snapshot', () => {
    expect(main).toContain('respawnAtHostTimeMs: Math.max(0, target.respawnAt)');
  });

  it('adopts replicated dummy state on the guest snapshot path', () => {
    expect(main).toContain('applyReplicatedGunRangeDummyState(message.snapshot.testDummies)');
  });

  it('ticks gun-range target lifecycle on host-mapped time', () => {
    expect(main).toMatch(/updateTargets\(selectedArena\.id === 'gun-range'\s*\n?\s*\? debugCaptureFixedVisualTimeMs \?\? currentHostTimeMs\(\)/);
  });
});
