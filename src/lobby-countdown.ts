/**
 * feat(lobby): all-players READY gate with a shared 5-4-3-2-1 countdown.
 *
 * Host-authoritative lobby countdown state machine (pure logic, no DOM, no
 * network). `src/legacy-main.ts` stays under its size ratchet by delegating
 * here; the wiring there is a thin call-site only.
 *
 * Owner ask (memory 'atomic-acres-lobby-and-load-goals'): the lobby waits
 * until every joined player reports READY/loaded, then runs a shared
 * 5-4-3-2-1 countdown before the match starts. Rules owned here:
 *
 * - every peer sends an explicit `lobby-ready` once its arena has booted
 *   (`shouldAutoSendLoaded`; the READY button stays as the manual toggle);
 * - the host starts the countdown only when all peers are ready, or after a
 *   host-side 60 s READY timeout that the HUD shows (`decideLobbyCountdownStart`);
 * - countdown ticks rebroadcast the SAME shared match-start timestamp
 *   (`countdownTickDue`); every client renders 5-4-3-2-1 from that timestamp,
 *   never from a local timer (`countdownSecondsRemaining` feeds the pinned
 *   `DEPLOYING IN ${countdownRemainS}` title in `renderPrivateLobby`);
 * - late joiners admitted during the countdown receive the same timestamp
 *   (`lateJoinReceivesTimestamp`; the send site stays in `admitLobbyJoin`);
 * - the HUD names who is not ready (`notReadyMemberNames`,
 *   `waitingRoomGuidance`).
 *
 * The solo path (`network.role === 'offline'`) never touches this module:
 * every entry point returns its inert value for it.
 */
import { canHostCommitStart, type LobbyMember, type LobbySnapshot } from './private-match';

/** Host-side wait for every peer to report READY before force-start unlocks. */
export const LOBBY_READY_TIMEOUT_MS = 60_000;
/** Host rebroadcast cadence for the shared match-start timestamp mid-countdown. */
export const LOBBY_COUNTDOWN_TICK_MS = 1_000;
/** Visible countdown length in whole seconds (5-4-3-2-1). */
export const LOBBY_COUNTDOWN_SECONDS = 5;

export type LobbyCountdownRole = 'offline' | 'host' | 'client';

export type LobbyCountdownStartReason =
  | 'ok-all-ready'
  | 'ok-timeout'
  | 'not-host'
  | 'wrong-phase'
  | 'pending-guest'
  | 'no-members'
  | 'not-ready';

export type LobbyCountdownStartDecision = Readonly<{
  ok: boolean;
  reason: LobbyCountdownStartReason;
  /** Connected members still reporting not-ready, roster order. */
  notReady: readonly string[];
  /** Ms until force-start unlocks; null when no wait is armed. */
  timeoutRemainingMs: number | null;
}>;

function displayMemberName(member: Pick<LobbyMember, 'id' | 'name'>): string {
  const name = member.name.trim();
  return name === '' ? member.id : name;
}

/** Connected members still reporting not-ready, in roster order. */
export function notReadyMemberNames(members: readonly LobbyMember[]): string[] {
  return members
    .filter((member) => member.connected && !member.ready)
    .map(displayMemberName);
}

/**
 * Whole seconds left on the shared countdown, from the host's authoritative
 * match-start epoch. Null when no shared timestamp exists. Clamped to
 * 1..LOBBY_COUNTDOWN_SECONDS so every client renders the same 5-4-3-2-1 from
 * one instant instead of timing it locally.
 */
export function countdownSecondsRemaining(
  activeAtEpochMs: number | null,
  nowEpochMs: number,
): number | null {
  if (activeAtEpochMs === null || !Number.isFinite(activeAtEpochMs) || !Number.isFinite(nowEpochMs)) {
    return null;
  }
  return Math.max(1, Math.min(LOBBY_COUNTDOWN_SECONDS, Math.ceil((activeAtEpochMs - nowEpochMs) / 1000)));
}

/** Ms until the host-side READY wait becomes a force-start; null when unarmed. */
export function readyTimeoutRemainingMs(
  waitingSinceEpochMs: number | null,
  nowEpochMs: number,
): number | null {
  if (waitingSinceEpochMs === null || !Number.isFinite(waitingSinceEpochMs) || !Number.isFinite(nowEpochMs)) {
    return null;
  }
  return Math.max(0, waitingSinceEpochMs + LOBBY_READY_TIMEOUT_MS - nowEpochMs);
}

/** True once the host has waited out the full READY window. */
export function readyTimeoutExpired(
  waitingSinceEpochMs: number | null,
  nowEpochMs: number,
): boolean {
  const remaining = readyTimeoutRemainingMs(waitingSinceEpochMs, nowEpochMs);
  return remaining !== null && remaining <= 0;
}

/**
 * Host start gate. A guest can NEVER start the countdown (`not-host`), even
 * with every member ready — `hostStartPrivateMatch` and the network layer's
 * host-authority check enforce the same rule on the live path. The 60 s
 * timeout unlocks a host force-start but never overrides a pending guest
 * admission (HF-323 hold) and never starts an empty or over-capacity room.
 */
export function decideLobbyCountdownStart(args: Readonly<{
  role: LobbyCountdownRole;
  snapshot: LobbySnapshot;
  hasPendingGuests: boolean;
  waitingSinceEpochMs: number | null;
  nowEpochMs: number;
}>): LobbyCountdownStartDecision {
  const notReady = notReadyMemberNames(args.snapshot.members);
  const timeoutRemainingMs = readyTimeoutRemainingMs(args.waitingSinceEpochMs, args.nowEpochMs);
  if (args.role !== 'host') {
    return { ok: false, reason: 'not-host', notReady, timeoutRemainingMs };
  }
  if (args.snapshot.phase !== 'waiting') {
    return { ok: false, reason: 'wrong-phase', notReady, timeoutRemainingMs };
  }
  if (canHostCommitStart(args.snapshot, args.hasPendingGuests)) {
    return { ok: true, reason: 'ok-all-ready', notReady, timeoutRemainingMs };
  }
  if (args.hasPendingGuests) {
    return { ok: false, reason: 'pending-guest', notReady, timeoutRemainingMs };
  }
  const connected = args.snapshot.members.filter((member) => member.connected);
  if (connected.length === 0 || connected.length > args.snapshot.config.capacity) {
    return { ok: false, reason: connected.length === 0 ? 'no-members' : 'not-ready', notReady, timeoutRemainingMs };
  }
  if (readyTimeoutExpired(args.waitingSinceEpochMs, args.nowEpochMs)) {
    return { ok: true, reason: 'ok-timeout', notReady, timeoutRemainingMs };
  }
  return { ok: false, reason: 'not-ready', notReady, timeoutRemainingMs };
}

/**
 * Whether this peer should emit its explicit loaded/ready message now: its
 * arena has booted (synchronized), it is connected in a waiting lobby, and it
 * has not reported ready yet. Solo (`offline`) never sends. The manual READY
 * toggle stays: this fires once, when boot completes, and the player can still
 * un-ready afterwards.
 */
export function shouldAutoSendLoaded(args: Readonly<{
  role: LobbyCountdownRole;
  phase: LobbySnapshot['phase'];
  localReady: boolean;
  localConnected: boolean;
  arenaSynchronized: boolean;
}>): boolean {
  return args.role !== 'offline'
    && args.phase === 'waiting'
    && !args.localReady
    && args.localConnected
    && args.arenaSynchronized;
}

/** True when the host owes the room another shared-timestamp tick. */
export function countdownTickDue(lastTickHostTimeMs: number | null, nowHostTimeMs: number): boolean {
  if (!Number.isFinite(nowHostTimeMs)) return false;
  if (lastTickHostTimeMs === null || !Number.isFinite(lastTickHostTimeMs)) return true;
  return nowHostTimeMs - lastTickHostTimeMs >= LOBBY_COUNTDOWN_TICK_MS;
}

/**
 * Late join admitted mid-countdown must receive the SAME shared timestamp the
 * room is counting from — never a fresh one. Both clocks form one lobby-start
 * identity; a join missing either is not a countdown join.
 */
export function lateJoinReceivesTimestamp(
  activeAtHostTimeMs: number | null,
  activeAtEpochMs: number | null,
): boolean {
  return activeAtHostTimeMs !== null
    && activeAtEpochMs !== null
    && Number.isFinite(activeAtHostTimeMs)
    && Number.isFinite(activeAtEpochMs);
}

/**
 * Waiting-room HUD line. Names who is not ready and shows the host-side 60 s
 * force-start wait. Null when another surface owns the line (match active,
 * arena still syncing, or no lobby snapshot) so existing guidance keeps
 * precedence there.
 */
export function waitingRoomGuidance(args: Readonly<{
  role: LobbyCountdownRole;
  phase: LobbySnapshot['phase'];
  members: readonly LobbyMember[];
  arenaSynchronized: boolean;
  hasPendingGuest: boolean;
  waitingSinceEpochMs: number | null;
  nowEpochMs: number;
}>): string | null {
  if (args.phase !== 'waiting' || !args.arenaSynchronized) return null;
  const notReady = notReadyMemberNames(args.members);
  const pendingSuffix = args.hasPendingGuest ? ' (a player is joining…)' : '';
  if (notReady.length === 0) {
    return args.role === 'host'
      ? `Everyone is READY — press START to deploy.${pendingSuffix}`
      : 'Everyone is READY — waiting for the host to start.';
  }
  const names = notReady.join(', ');
  if (args.role !== 'host') {
    return `Waiting for READY: ${names} — the host starts when everyone is ready.`;
  }
  const remaining = readyTimeoutRemainingMs(args.waitingSinceEpochMs, args.nowEpochMs);
  const timeoutSuffix = remaining === null
    ? ''
    : remaining <= 0
      ? ' (force-start available)'
      : ` (force-start in ${Math.ceil(remaining / 1000)}s)`;
  return `Waiting for READY: ${names}${timeoutSuffix}.${pendingSuffix}`;
}
