import { describe, expect, it, vi } from 'vitest';
import {
  MatchAdmissionCoordinator,
  MatchAdmissionSupersededError,
  matchAdmissionResult,
  sameMatchAdmissionAuthority,
  type MatchAdmissionIdentity,
} from './match-admission-transaction';

const identity = (overrides: Partial<MatchAdmissionIdentity> = {}): MatchAdmissionIdentity => ({
  mode: 'client',
  role: 'client',
  arenaId: 'atomic-acres',
  roomCode: 'room-1',
  connectionEpoch: 'connection-1',
  lobbyRevision: 4,
  lobbyPhase: 'countdown',
  activeAtHostTimeMs: 8_000,
  activeAtEpochMs: 1_800_000_008_000,
  ...overrides,
});

describe('match admission transaction', () => {
  it('coalesces exact and telemetry-only newer live-start identities without restarting preparation', () => {
    const coordinator = new MatchAdmissionCoordinator();
    const first = coordinator.begin(identity());
    const duplicate = coordinator.begin(identity());
    expect(first.started).toBe(true);
    expect(duplicate).toMatchObject({ started: false, token: first.token });

    const telemetryRevision = coordinator.begin(identity({ lobbyRevision: 5 }));
    const activePhase = coordinator.begin(identity({ lobbyRevision: 6, lobbyPhase: 'active' }));
    expect(telemetryRevision).toMatchObject({ started: false, token: first.token });
    expect(activePhase).toMatchObject({ started: false, token: first.token });
    expect(first.token.signal.aborted).toBe(false);
  });

  it('supersedes live preparation for waiting or ended authority even at a newer revision', () => {
    for (const changed of [
      identity({ lobbyRevision: 5, lobbyPhase: 'waiting', activeAtHostTimeMs: null, activeAtEpochMs: null }),
      identity({ lobbyRevision: 5, lobbyPhase: 'ended' }),
    ]) {
      const coordinator = new MatchAdmissionCoordinator();
      const first = coordinator.begin(identity());
      const successor = coordinator.begin(changed);

      expect(successor).toMatchObject({ started: true, replacedGeneration: first.token.generation });
      expect(first.token.signal.aborted).toBe(true);
      expect(() => coordinator.assertCurrent(first.token)).toThrow(MatchAdmissionSupersededError);
      expect(coordinator.owns(successor.token)).toBe(true);
    }
  });

  it('treats live revision and countdown-to-active changes as equivalent only when stable authority and clocks match', () => {
    const base = identity();
    expect(sameMatchAdmissionAuthority(base, identity({ lobbyRevision: 99 }))).toBe(true);
    expect(sameMatchAdmissionAuthority(base, identity({ lobbyRevision: 99, lobbyPhase: 'active' }))).toBe(true);
    expect(sameMatchAdmissionAuthority(base, identity({ lobbyRevision: 99, arenaId: 'rustworks-1v1' }))).toBe(false);
    expect(sameMatchAdmissionAuthority(base, identity({ lobbyRevision: 99, activeAtHostTimeMs: 8_001 }))).toBe(false);
    expect(sameMatchAdmissionAuthority(base, identity({ lobbyRevision: 99, role: 'offline' }))).toBe(false);
  });

  it('accepts observed telemetry revisions but invalidates observed waiting authority', () => {
    const coordinator = new MatchAdmissionCoordinator();
    const admission = coordinator.begin(identity());

    expect(() => coordinator.assertCurrent(admission.token, identity({
      lobbyRevision: 5,
      lobbyPhase: 'active',
    }))).not.toThrow();
    expect(coordinator.owns(admission.token)).toBe(true);

    expect(() => coordinator.assertCurrent(admission.token, identity({
      lobbyRevision: 6,
      lobbyPhase: 'waiting',
      activeAtHostTimeMs: null,
      activeAtEpochMs: null,
    }))).toThrow(MatchAdmissionSupersededError);
    expect(admission.token.signal.aborted).toBe(true);
  });

  it('supersedes the exact lobby identity for a newer authoritative field', () => {
    const coordinator = new MatchAdmissionCoordinator();
    const first = coordinator.begin(identity());
    const successor = coordinator.begin(identity({ lobbyRevision: 5, activeAtHostTimeMs: 8_001 }));
    expect(successor).toMatchObject({ started: true, replacedGeneration: first.token.generation });
    expect(first.token.signal.aborted).toBe(true);
    expect(() => coordinator.assertCurrent(first.token)).toThrow(MatchAdmissionSupersededError);
    expect(coordinator.owns(successor.token)).toBe(true);
  });

  it('invalidates an in-flight guest immediately when observed role, room, connection or clocks drift', () => {
    for (const changed of [
      identity({ role: 'offline' }),
      identity({ roomCode: 'room-2' }),
      identity({ connectionEpoch: 'connection-2' }),
      identity({ activeAtHostTimeMs: 8_001 }),
      identity({ activeAtEpochMs: 1_800_000_008_001 }),
      identity({ arenaId: 'rustworks-1v1' }),
    ]) {
      const coordinator = new MatchAdmissionCoordinator();
      const attempt = coordinator.begin(identity());
      expect(() => coordinator.assertCurrent(attempt.token, changed)).toThrow(MatchAdmissionSupersededError);
      expect(attempt.token.signal.aborted).toBe(true);
      expect(coordinator.token()).toBeNull();
    }
  });

  it('never lets a stale attempt invalidate or complete its committed successor', () => {
    const coordinator = new MatchAdmissionCoordinator();
    const stale = coordinator.begin(identity());
    const successor = coordinator.begin(identity({ lobbyRevision: 5, lobbyPhase: 'active', arenaId: 'rustworks-1v1' }));

    expect(() => coordinator.assertCurrent(stale.token, identity())).toThrow(MatchAdmissionSupersededError);
    expect(coordinator.complete(stale.token)).toBe(false);
    expect(coordinator.owns(successor.token)).toBe(true);
    expect(coordinator.complete(successor.token)).toBe(true);
    expect(coordinator.token()).toBeNull();
  });

  it('fences a guest publish when a higher-revision waiting snapshot arrives during an await', async () => {
    const coordinator = new MatchAdmissionCoordinator();
    const admission = coordinator.begin(identity());
    let releasePreparation!: () => void;
    const preparation = new Promise<void>((resolve) => { releasePreparation = resolve; });
    const publish = vi.fn();
    const pending = (async () => {
      await preparation;
      coordinator.assertCurrent(admission.token, identity());
      publish();
    })();

    expect(() => coordinator.assertCurrent(admission.token, identity({
      lobbyRevision: 5,
      lobbyPhase: 'waiting',
      activeAtHostTimeMs: null,
      activeAtEpochMs: null,
    }))).toThrow(MatchAdmissionSupersededError);
    releasePreparation();

    await expect(pending).rejects.toThrow(MatchAdmissionSupersededError);
    expect(publish).not.toHaveBeenCalled();
    expect(coordinator.token()).toBeNull();
  });

  it('cancels host and guest countdown generations from the same higher-revision abort authority', () => {
    const host = new MatchAdmissionCoordinator();
    const guest = new MatchAdmissionCoordinator();
    const countdown = identity({ mode: 'host', role: 'host' });
    const hostAdmission = host.begin(countdown);
    const guestAdmission = guest.begin(identity());
    const waiting = identity({
      lobbyRevision: 5,
      lobbyPhase: 'waiting',
      activeAtHostTimeMs: null,
      activeAtEpochMs: null,
    });

    host.invalidate('Owned host preparation failed after countdown broadcast');
    expect(() => guest.assertCurrent(guestAdmission.token, waiting)).toThrow(MatchAdmissionSupersededError);

    expect(hostAdmission.token.signal.aborted).toBe(true);
    expect(guestAdmission.token.signal.aborted).toBe(true);
    expect(host.token()).toBeNull();
    expect(guest.token()).toBeNull();
  });

  it('returns explicit admitted, superseded and failed outcomes', () => {
    const token = new MatchAdmissionCoordinator().begin(identity()).token;
    expect(matchAdmissionResult(token, 'admitted')).toEqual({ status: 'admitted', generation: 1 });
    expect(matchAdmissionResult(token, 'superseded', 'host returned to lobby')).toEqual({
      status: 'superseded', generation: 1, reason: 'host returned to lobby',
    });
    const failure = new Error('renderer failed');
    expect(matchAdmissionResult(token, 'failed', failure)).toEqual({ status: 'failed', generation: 1, error: failure });
  });
});
