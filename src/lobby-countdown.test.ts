/**
 * feat(lobby): all-players READY gate with a shared 5-4-3-2-1 countdown.
 *
 * State machine (ready set, 60 s timeout, tick timestamps), guest-can-never-
 * start, late-join same-timestamp, HUD strings, and the legacy-main wiring
 * that keeps the solo path unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
  LOBBY_COUNTDOWN_SECONDS,
  LOBBY_COUNTDOWN_TICK_MS,
  LOBBY_READY_TIMEOUT_MS,
  countdownSecondsRemaining,
  countdownTickDue,
  decideLobbyCountdownStart,
  lateJoinReceivesTimestamp,
  notReadyMemberNames,
  readyTimeoutExpired,
  readyTimeoutRemainingMs,
  shouldAutoSendLoaded,
  waitingRoomGuidance,
} from './lobby-countdown';
import {
  DEFAULT_PRIVATE_MATCH_CONFIG,
  type LobbyMember,
  type LobbySnapshot,
} from './private-match';

const NOW = 1_000_000;

const members: LobbyMember[] = [
  { id: 'host', name: 'Host', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
  { id: 'b', name: 'Bravo', team: 1, ready: true, connected: true, pingMs: 30, dhv: 8 },
  { id: 'c', name: 'Charlie', team: 1, ready: true, connected: true, pingMs: 45, dhv: 6 },
];

const snapshot = (changes: Partial<LobbySnapshot> = {}): LobbySnapshot => ({
  revision: 1,
  hostId: 'host',
  phase: 'waiting',
  config: DEFAULT_PRIVATE_MATCH_CONFIG,
  members,
  scores: [],
  snapshotHostTimeMs: 500,
  activeAtHostTimeMs: null,
  activeAtEpochMs: null,
  matchClock: null,
  testBayDoor: null,
  ...changes,
});

const startArgs = (changes: Partial<Parameters<typeof decideLobbyCountdownStart>[0]> = {}) => ({
  role: 'host' as const,
  snapshot: snapshot(),
  hasPendingGuests: false,
  waitingSinceEpochMs: NOW - 1_000,
  nowEpochMs: NOW,
  ...changes,
});

describe('lobby countdown ready set', () => {
  it('starts when every connected peer reports ready', () => {
    const decision = decideLobbyCountdownStart(startArgs());
    expect(decision.ok).toBe(true);
    expect(decision.reason).toBe('ok-all-ready');
    expect(decision.notReady).toEqual([]);
  });

  it('holds the start and names who is not ready', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false } : member),
    });
    expect(notReadyMemberNames(waiting.members)).toEqual(['Charlie']);
    const decision = decideLobbyCountdownStart(startArgs({ snapshot: waiting }));
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('not-ready');
    expect(decision.notReady).toEqual(['Charlie']);
  });

  it('ignores disconnected members in the not-ready set', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false, connected: false } : member),
    });
    const decision = decideLobbyCountdownStart(startArgs({ snapshot: waiting }));
    expect(decision.ok).toBe(true);
    expect(decision.reason).toBe('ok-all-ready');
  });

  it('holds while a guest admission is in flight, even past the timeout', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false } : member),
    });
    const decision = decideLobbyCountdownStart(startArgs({
      snapshot: waiting,
      hasPendingGuests: true,
      waitingSinceEpochMs: NOW - LOBBY_READY_TIMEOUT_MS - 1,
    }));
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('pending-guest');
  });

  it('refuses an empty or over-capacity room even past the timeout', () => {
    const empty = decideLobbyCountdownStart(startArgs({
      snapshot: snapshot({ members: [] }),
      waitingSinceEpochMs: NOW - LOBBY_READY_TIMEOUT_MS - 1,
    }));
    expect(empty.ok).toBe(false);
    expect(empty.reason).toBe('no-members');
    const overCapacity = snapshot({
      members: Array.from({ length: DEFAULT_PRIVATE_MATCH_CONFIG.capacity + 1 }, (_, index) => ({
        id: `p${index}`, name: `P${index}`, team: 0 as const, ready: false, connected: true, pingMs: null, dhv: 10 as const,
      })),
    });
    const crowded = decideLobbyCountdownStart(startArgs({
      snapshot: overCapacity,
      waitingSinceEpochMs: NOW - LOBBY_READY_TIMEOUT_MS - 1,
    }));
    expect(crowded.ok).toBe(false);
    expect(crowded.reason).toBe('not-ready');
  });
});

describe('lobby countdown 60 s host timeout', () => {
  it('measures the remaining wait and expires exactly at 60 s', () => {
    expect(LOBBY_READY_TIMEOUT_MS).toBe(60_000);
    expect(readyTimeoutRemainingMs(NOW - 1_000, NOW)).toBe(59_000);
    expect(readyTimeoutRemainingMs(null, NOW)).toBeNull();
    expect(readyTimeoutExpired(NOW - 59_999, NOW)).toBe(false);
    expect(readyTimeoutExpired(NOW - 60_000, NOW)).toBe(true);
    expect(readyTimeoutExpired(null, NOW)).toBe(false);
  });

  it('lets the host force-start past the timeout and names the holdouts', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false } : member),
    });
    const before = decideLobbyCountdownStart(startArgs({ snapshot: waiting, waitingSinceEpochMs: NOW - 59_000 }));
    expect(before.ok).toBe(false);
    expect(before.reason).toBe('not-ready');
    const after = decideLobbyCountdownStart(startArgs({ snapshot: waiting, waitingSinceEpochMs: NOW - 60_001 }));
    expect(after.ok).toBe(true);
    expect(after.reason).toBe('ok-timeout');
    expect(after.notReady).toEqual(['Charlie']);
  });

  it('still requires the waiting phase after the timeout', () => {
    const active = snapshot({ phase: 'active' });
    const decision = decideLobbyCountdownStart(startArgs({
      snapshot: active,
      waitingSinceEpochMs: NOW - LOBBY_READY_TIMEOUT_MS - 1,
    }));
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('wrong-phase');
  });
});

describe('lobby countdown shared timestamp', () => {
  it('renders 5-4-3-2-1 from the shared epoch, never a local timer', () => {
    expect(LOBBY_COUNTDOWN_SECONDS).toBe(5);
    expect(countdownSecondsRemaining(NOW + 5_000, NOW)).toBe(5);
    expect(countdownSecondsRemaining(NOW + 4_001, NOW)).toBe(5);
    expect(countdownSecondsRemaining(NOW + 4_000, NOW)).toBe(4);
    expect(countdownSecondsRemaining(NOW + 1_000, NOW)).toBe(1);
    expect(countdownSecondsRemaining(NOW, NOW)).toBe(1);
    expect(countdownSecondsRemaining(NOW - 9_000, NOW)).toBe(1);
    expect(countdownSecondsRemaining(null, NOW)).toBeNull();
    expect(countdownSecondsRemaining(NOW + 2_500, NOW)).toBe(3);
    expect(countdownSecondsRemaining(NOW - 1, NOW)).toBe(1);
  });

  it('ticks the shared timestamp about once a second', () => {
    expect(LOBBY_COUNTDOWN_TICK_MS).toBe(1_000);
    expect(countdownTickDue(null, 10_000)).toBe(true);
    expect(countdownTickDue(9_000, 10_000)).toBe(true);
    expect(countdownTickDue(9_500, 10_000)).toBe(false);
    expect(countdownTickDue(9_000, Number.NaN)).toBe(false);
  });

  it('admits a late countdown join only with the same timestamp', () => {
    expect(lateJoinReceivesTimestamp(1000, NOW + 5_000)).toBe(true);
    expect(lateJoinReceivesTimestamp(null, NOW + 5_000)).toBe(false);
    expect(lateJoinReceivesTimestamp(1000, null)).toBe(false);
  });
});

describe('lobby countdown guest authority', () => {
  it('a guest can never start the countdown, even with everyone ready', () => {
    for (const role of ['client', 'offline'] as const) {
      const decision = decideLobbyCountdownStart(startArgs({ role }));
      expect(decision.ok).toBe(false);
      expect(decision.reason).toBe('not-host');
    }
  });

  it('wires the host-only start and the late-join timestamp in legacy-main', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const startMatch = source.slice(source.indexOf('function hostStartPrivateMatch'), source.indexOf('function returnPrivateMatchToLobby'));
    expect(startMatch).toContain("if (network.role !== 'host') return;");
    expect(startMatch).toContain('decideLobbyCountdownStart');
    const admission = source.slice(source.indexOf('async function admitLobbyJoin'), source.indexOf('function updateHostReady'));
    expect(admission).toContain("type: 'lobby-start'");
    expect(admission).toContain('activeAtHostTimeMs: privateMatchActiveAtHostTimeMs');
    expect(admission).toContain('activeAtEpochMs: privateMatchActiveAtEpochMs');
  });

  it('keeps lobby-start host-authoritative on the network layer', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./protocol.ts', import.meta.url), 'utf8');
    const authority = source.slice(source.indexOf('export function isHostAuthorityMessage'));
    expect(authority).toContain('lobby-start');
  });
});

describe('lobby countdown HUD', () => {
  const guidance = (changes: Partial<Parameters<typeof waitingRoomGuidance>[0]> = {}) => waitingRoomGuidance({
    role: 'host',
    phase: 'waiting',
    members,
    arenaSynchronized: true,
    hasPendingGuest: false,
    waitingSinceEpochMs: NOW - 1_000,
    nowEpochMs: NOW,
    ...changes,
  });

  it('names who is not ready and shows the force-start wait', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false } : member),
    });
    const hostLine = guidance({ members: waiting.members });
    expect(hostLine).toContain('Charlie');
    expect(hostLine).toContain('force-start in 59s');
    const guestLine = guidance({ role: 'client', members: waiting.members });
    expect(guestLine).toContain('Charlie');
    expect(guestLine).toContain('the host starts when everyone is ready');
  });

  it('announces the timeout unlock and the all-ready state', () => {
    const waiting = snapshot({
      members: members.map((member) => member.id === 'c' ? { ...member, ready: false } : member),
    });
    expect(guidance({ members: waiting.members, waitingSinceEpochMs: NOW - 61_000 })).toContain('force-start available');
    expect(guidance({})).toContain('Everyone is READY');
    expect(guidance({ role: 'client' })).toContain('waiting for the host to start');
  });

  it('yields the line to arena sync and active-match surfaces', () => {
    expect(guidance({ arenaSynchronized: false })).toBeNull();
    expect(guidance({ phase: 'active' })).toBeNull();
    expect(guidance({ phase: 'countdown' })).toBeNull();
  });

  it('renders the shared countdown from the timestamp in legacy-main', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const renderStart = source.indexOf('function renderPrivateLobby');
    const renderLobby = source.slice(renderStart, source.indexOf('function trackLobbyArenaSyncDeadline', renderStart));
    expect(renderLobby).toContain('countdownSecondsRemaining(');
    expect(renderLobby).toContain('waitingRoomGuidance(');
    expect(renderLobby).toContain('maybeAutoSendLobbyLoadedReady(');
  });
});

describe('lobby countdown loaded signal', () => {
  it('sends the explicit loaded message once the arena has booted', () => {
    const loaded = { role: 'client' as const, phase: 'waiting' as const, localReady: false, localConnected: true, arenaSynchronized: true };
    expect(shouldAutoSendLoaded(loaded)).toBe(true);
    expect(shouldAutoSendLoaded({ ...loaded, role: 'host' })).toBe(true);
    expect(shouldAutoSendLoaded({ ...loaded, arenaSynchronized: false })).toBe(false);
    expect(shouldAutoSendLoaded({ ...loaded, localReady: true })).toBe(false);
    expect(shouldAutoSendLoaded({ ...loaded, localConnected: false })).toBe(false);
    expect(shouldAutoSendLoaded({ ...loaded, phase: 'countdown' })).toBe(false);
  });

  it('never sends on the solo path', () => {
    expect(shouldAutoSendLoaded({
      role: 'offline', phase: 'waiting', localReady: false, localConnected: true, arenaSynchronized: true,
    })).toBe(false);
  });
});
