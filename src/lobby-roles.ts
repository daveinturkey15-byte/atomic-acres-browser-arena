/**
 * HF-504 — lobby and room flow: explicit roles, host controls, migration notice.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * The pure half of the lobby/room overhaul the owner asked for on 2026-09-04
 * ("lobby and room flow overhaul (roles, ready state, host migration)"). It is
 * a LEAF: it imports only types from `private-match.ts`, so `protocol.ts` can
 * import it without creating the runtime cycle documented at the top of
 * `host-succession-protocol.ts`.
 *
 * It owns four things and deliberately nothing else:
 *
 *   1. SEAT ROLES. Every member of a room is exactly one of `host`, `guest` or
 *      `spectator`. `spectator` is the honest name for the state the lobby
 *      previously rendered as a peer that simply said `SETTING UP` forever: a
 *      player who is connected to a room whose match has already started
 *      (`countdown`/`active`) but has not reported READY, i.e. is still
 *      loading. It is a presentation role, NOT an authority role — a spectator
 *      is still a guest on the wire and its inputs are still validated exactly
 *      the same way. Nothing here grants anybody permission to do anything.
 *
 *   2. HOST CONTROLS. `authorizeLobbyKick` and `authorizeRoomClose` are the
 *      single decision function for "may this actor do this?", called on BOTH
 *      sides: the UI calls it to decide whether to offer the control, and the
 *      host calls it again on the message it receives. That second call is the
 *      one that matters — the first is a courtesy. A guest that fabricates a
 *      `lobby-kick` is refused twice over: `isHostAuthorityMessage` covers it,
 *      so `network.ts` drops it on a guest connection before any handler runs,
 *      and `guestShouldHonorKick` additionally refuses any kick not authored by
 *      the host id the guest currently believes in.
 *
 *   3. THE ROLLING SNAPSHOT COPY. `retainLobbySnapshot` is the guest-side
 *      rolling copy of the last host-authored `lobby-state`. It is the FALLBACK
 *      path for succession, not the primary one: the primary is the
 *      `host-authority-mirror` document (`host-authority-mirror.ts`), which is
 *      richer (positions, loadouts, resume tokens, the full ledger) and is sent
 *      to the mandate holder only, because broadcasting every guest's resume
 *      token to every guest would be a credential leak, not a feature. What
 *      every guest CAN safely retain is the snapshot it is already receiving
 *      anyway — roster, scores, config, phase — which is exactly what a
 *      successor needs to keep the room alive when the mirror never arrived
 *      (host died between roster change and mirror send). `promoteRetained`
 *      turns that copy into the successor's opening snapshot: host rewritten,
 *      departed host marked disconnected, revision advanced, everybody else
 *      re-registered untouched with their scores intact.
 *
 *   4. THE HOST-CHANGED NOTICE. One string, computed the same way on every
 *      peer, so the successor and the followers describe the same event.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not the election (`host-migration.ts` `electHostSuccessor`), not the
 * mandate (`mintSuccessionMandate`), not the term fence (`termSupersedes`), not
 * the transport re-point (`network.ts`). Those all shipped with HF-325 and this
 * module does not second-guess any of them; `promoteRetained` takes the elected
 * successor id as an INPUT and refuses to invent one.
 */
import type { LobbyMember, LobbyPhase, LobbySnapshot } from './private-match';

/** Versioned independently of MULTIPLAYER_PROTOCOL_VERSION, like every other
 * satellite protocol module. Adding a message type is purely additive: a peer
 * on an older bundle fails `isGameMessage` and drops it at the transport. */
export const LOBBY_ROLES_SCHEMA_VERSION = 1;

const MAX_ID_LENGTH = 80;
const MAX_REVISION = 1_000_000_000;

// ---------------------------------------------------------------------------
// 1. Seat roles
// ---------------------------------------------------------------------------

export type LobbySeatRole = 'host' | 'guest' | 'spectator';

/**
 * The role rule, stated once:
 *
 *   host       — this member is the room's `hostId`. Always, in every phase,
 *                even while it is itself still loading. The host owns the
 *                simulation; "loading host" is a host, not a spectator.
 *   spectator  — a connected non-host member of a room whose match is already
 *                running (`countdown` or `active`) that has not reported READY.
 *                It is in the room and will play; it is not in the match yet.
 *   guest      — everything else, including a disconnected member inside its
 *                rejoin grace. Connection state is a separate axis and is not
 *                collapsed into the role: a rejoining guest is a guest.
 */
export function resolveSeatRole(args: Readonly<{
  hostId: string;
  memberId: string;
  connected: boolean;
  ready: boolean;
  phase: LobbyPhase;
}>): LobbySeatRole {
  if (args.memberId === args.hostId) return 'host';
  if (!args.connected) return 'guest';
  if ((args.phase === 'countdown' || args.phase === 'active') && !args.ready) return 'spectator';
  return 'guest';
}

/** Roster badge text. Kept next to the rule so the two cannot drift. */
export function seatRoleLabel(role: LobbySeatRole): string {
  return role === 'host' ? 'HOST' : role === 'spectator' ? 'SPECTATOR' : 'GUEST';
}

/** Why the badge says what it says, for the row's `title`. */
export function seatRoleHint(role: LobbySeatRole): string {
  switch (role) {
    case 'host': return 'Hosts the match: owns the authoritative simulation and the room controls.';
    case 'spectator': return 'Still loading into a match already in progress — watching until deployed.';
    default: return 'Playing this match; the host validates its inputs.';
  }
}

export type LobbySeat = Readonly<{
  id: string;
  name: string;
  role: LobbySeatRole;
  ready: boolean;
  connected: boolean;
  isLocal: boolean;
}>;

/** Roster rows with their roles resolved, in host-authored roster order. */
export function lobbySeats(
  snapshot: Pick<LobbySnapshot, 'hostId' | 'phase' | 'members'>,
  localPlayerId: string,
): readonly LobbySeat[] {
  return snapshot.members.map((member) => Object.freeze({
    id: member.id,
    name: member.name.trim() === '' ? member.id : member.name,
    role: resolveSeatRole({
      hostId: snapshot.hostId,
      memberId: member.id,
      connected: member.connected,
      ready: member.ready,
      phase: snapshot.phase,
    }),
    ready: member.ready,
    connected: member.connected,
    isLocal: member.id === localPlayerId,
  }));
}

// ---------------------------------------------------------------------------
// 2. Host controls — kick and close
// ---------------------------------------------------------------------------

export type LobbyKickReason = 'host-removed' | 'room-closed';

/**
 * Host -> the room. Addressed to one peer by `targetId`; broadcast so every
 * follower can drop the seat from its roster in the same tick rather than
 * waiting for the next `lobby-state`.
 */
export type LobbyKickMessage = {
  type: 'lobby-kick';
  schemaVersion: typeof LOBBY_ROLES_SCHEMA_VERSION;
  by: string;
  targetId: string;
  reason: LobbyKickReason;
  nonce: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isParticipantId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/**
 * Envelope guard. A kick that names its own author is refused here rather than
 * argued about later: a host cannot kick itself, and a message shaped that way
 * is not a weaker kick, it is a different message.
 */
export function isLobbyKickMessage(value: unknown): value is LobbyKickMessage {
  if (!isRecord(value)) return false;
  return value.type === 'lobby-kick'
    && value.schemaVersion === LOBBY_ROLES_SCHEMA_VERSION
    && isParticipantId(value.by)
    && isParticipantId(value.targetId)
    && value.by !== value.targetId
    && (value.reason === 'host-removed' || value.reason === 'room-closed')
    && Number.isSafeInteger(value.nonce) && Number(value.nonce) >= 0;
}

export type HostControlRefusal =
  | 'not-host'
  | 'actor-not-host'
  | 'target-is-host'
  | 'unknown-target'
  | 'target-already-gone';

export type HostControlDecision = Readonly<{ ok: boolean; reason: HostControlRefusal | 'ok' }>;

const REFUSED = (reason: HostControlRefusal): HostControlDecision => Object.freeze({ ok: false, reason });
const ALLOWED: HostControlDecision = Object.freeze({ ok: true, reason: 'ok' });

/**
 * The only place that decides whether a kick may happen. Two independent
 * host checks on purpose: `role` is what THIS peer believes it is (a guest
 * calling this gets `not-host` before anything else is read), and `actorId`
 * vs `snapshot.hostId` is what the ROOM believes (a stale ex-host whose term
 * was superseded still has `role === 'host'` locally for a few frames, and
 * `actor-not-host` is what stops it kicking anybody on the way down).
 */
export function authorizeLobbyKick(args: Readonly<{
  role: 'offline' | 'host' | 'client';
  snapshot: Pick<LobbySnapshot, 'hostId' | 'members'>;
  actorId: string;
  targetId: string;
}>): HostControlDecision {
  if (args.role !== 'host') return REFUSED('not-host');
  if (args.actorId !== args.snapshot.hostId) return REFUSED('actor-not-host');
  if (args.targetId === args.snapshot.hostId) return REFUSED('target-is-host');
  const target = args.snapshot.members.find((member) => member.id === args.targetId);
  if (!target) return REFUSED('unknown-target');
  if (!target.connected) return REFUSED('target-already-gone');
  return ALLOWED;
}

export type LobbyKickPlan =
  | Readonly<{ ok: true; message: LobbyKickMessage }>
  | Readonly<{ ok: false; reason: HostControlRefusal | 'no-lobby' }>;

/**
 * Authorize and, if allowed, MINT the kick in one step, so the live call site
 * cannot authorize one thing and send another. A room with no snapshot is
 * `no-lobby` rather than an exception: there is nothing to be host of yet.
 */
export function planLobbyKick(args: Readonly<{
  role: 'offline' | 'host' | 'client';
  snapshot: Pick<LobbySnapshot, 'hostId' | 'members'> | null;
  actorId: string;
  targetId: string;
  reason: LobbyKickReason;
  nonce: number;
}>): LobbyKickPlan {
  if (!args.snapshot) return Object.freeze({ ok: false, reason: 'no-lobby' as const });
  const decision = authorizeLobbyKick({
    role: args.role, snapshot: args.snapshot, actorId: args.actorId, targetId: args.targetId,
  });
  if (!decision.ok) return Object.freeze({ ok: false, reason: decision.reason as HostControlRefusal });
  const message: LobbyKickMessage = {
    type: 'lobby-kick',
    schemaVersion: LOBBY_ROLES_SCHEMA_VERSION,
    by: args.actorId,
    targetId: args.targetId,
    reason: args.reason,
    nonce: args.nonce,
  };
  // Mint through the same guard the receiver runs: a plan that could not
  // survive isLobbyKickMessage is a bug here, not a message worth sending.
  if (!isLobbyKickMessage(message)) return Object.freeze({ ok: false, reason: 'unknown-target' as const });
  return Object.freeze({ ok: true, message });
}

/** Closing the room is the same authority question with no target. */
export function authorizeRoomClose(args: Readonly<{
  role: 'offline' | 'host' | 'client';
  actorId: string;
  hostId: string;
}>): HostControlDecision {
  if (args.role !== 'host') return REFUSED('not-host');
  if (args.actorId !== args.hostId) return REFUSED('actor-not-host');
  return ALLOWED;
}

/**
 * Guest half. A kick is honoured only when it was authored by the host this
 * guest currently believes in AND names this guest. Everything else — a kick
 * from a peer, from a superseded host, or addressed to somebody else — is
 * ignored. This is belt-and-braces behind `isHostAuthorityMessage`: the
 * transport already drops host-authority messages arriving on a guest
 * connection, and this refuses the residue.
 */
export function guestShouldHonorKick(
  message: LobbyKickMessage,
  context: Readonly<{ currentHostId: string; localPlayerId: string }>,
): boolean {
  return message.by === context.currentHostId
    && message.targetId === context.localPlayerId
    && context.localPlayerId !== context.currentHostId;
}

/** Player-facing line for a kick this peer just honoured. */
export function kickNotice(reason: LobbyKickReason): string {
  return reason === 'room-closed'
    ? 'The host closed the room.'
    : 'The host removed you from the room.';
}

// ---------------------------------------------------------------------------
// 3. The guest-side rolling snapshot copy
// ---------------------------------------------------------------------------

export type RetainedLobbySnapshot = Readonly<{
  snapshot: LobbySnapshot;
  receivedAtEpochMs: number;
}>;

/**
 * Keep the newest host-authored snapshot, by REVISION rather than by arrival
 * order. Revisions are host-minted and monotonic, so an out-of-order or
 * replayed `lobby-state` cannot walk the retained copy backwards — which is
 * the only way this cheap fallback could ever hand a successor a stale roster.
 * Equal revisions keep the copy already held: a re-send is not new information.
 */
export function retainLobbySnapshot(
  previous: RetainedLobbySnapshot | null,
  snapshot: LobbySnapshot,
  receivedAtEpochMs: number,
): RetainedLobbySnapshot | null {
  if (!Number.isFinite(receivedAtEpochMs)) return previous;
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || snapshot.revision > MAX_REVISION) {
    return previous;
  }
  if (previous && snapshot.revision <= previous.snapshot.revision) return previous;
  return Object.freeze({ snapshot, receivedAtEpochMs });
}

export type PromotionRefusalReason =
  | 'no-retained-snapshot'
  | 'successor-not-in-roster'
  | 'successor-is-host'
  | 'successor-disconnected';

export type RetainedPromotion =
  | Readonly<{ promoted: true; snapshot: LobbySnapshot }>
  | Readonly<{ promoted: false; reason: PromotionRefusalReason }>;

/**
 * Turn a guest's retained copy into the successor's opening authoritative
 * snapshot. The successor id is an INPUT — it comes from
 * `electHostSuccessor`/the mandate, and this function refuses to invent one,
 * because a module that could both elect and adopt would be a second, weaker
 * election path sitting next to the real one.
 *
 * What changes: `hostId` becomes the successor, the departed host is marked
 * disconnected (it keeps its seat and its scores for the rejoin grace, exactly
 * as any other dropped peer does), and `revision` advances by one so followers
 * treat it as newer than anything the old host had sent.
 *
 * What deliberately does NOT change: every other member row, every score, the
 * config, the phase, and both match-start clocks. Re-registering the room is
 * carrying the roster forward untouched, not rebuilding it.
 */
export function promoteRetained(
  retained: RetainedLobbySnapshot | null,
  successorId: string,
): RetainedPromotion {
  if (!retained) return Object.freeze({ promoted: false, reason: 'no-retained-snapshot' });
  const previous = retained.snapshot;
  if (successorId === previous.hostId) return Object.freeze({ promoted: false, reason: 'successor-is-host' });
  const successor = previous.members.find((member) => member.id === successorId);
  if (!successor) return Object.freeze({ promoted: false, reason: 'successor-not-in-roster' });
  if (!successor.connected) return Object.freeze({ promoted: false, reason: 'successor-disconnected' });
  const members: LobbyMember[] = previous.members.map((member) => (
    member.id === previous.hostId ? { ...member, connected: false } : member
  ));
  return Object.freeze({
    promoted: true,
    snapshot: Object.freeze({
      ...previous,
      hostId: successorId,
      revision: Math.min(previous.revision + 1, MAX_REVISION),
      members: Object.freeze(members),
    }),
  });
}

// ---------------------------------------------------------------------------
// 4. The host-changed notice
// ---------------------------------------------------------------------------

/**
 * One line, computed identically on every peer from the same two ids, so the
 * successor and its followers narrate the same event. Null when nothing
 * changed, so a caller can use it as the "should I show anything?" test.
 */
export function hostChangedNotice(args: Readonly<{
  previousHostId: string;
  newHostId: string;
  localPlayerId: string;
  members: readonly Pick<LobbyMember, 'id' | 'name'>[];
}>): string | null {
  if (args.previousHostId === args.newHostId) return null;
  if (args.newHostId === args.localPlayerId) {
    return 'HOST CHANGED — the host left, so you are hosting now. The match continues.';
  }
  const successor = args.members.find((member) => member.id === args.newHostId);
  const name = successor && successor.name.trim() !== '' ? successor.name : args.newHostId;
  return `HOST CHANGED — the host left; ${name} is hosting now. The match continues.`;
}
