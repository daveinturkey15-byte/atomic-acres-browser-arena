// HF-328 (Pass 74 owner requirement): Team Deathmatch teams are PRESCRIBED by
// the host, never picked by players. Squad identity is the canonical
// colour-name pair for the assigned team (AQUA / CORAL) — no free names and no
// colour picker. Players may request to SWAP SIDES afterwards; the swap is
// host-authoritative and legal only while the lobby is waiting and the
// resulting connected-team sizes stay within one player of each other.
//
// This module is the single authority for prescribed assignment, swap
// legality, and roster-change rebalancing. It wraps the Pass 72
// `balanceLobbyTeams` ordering (host-first, then stable id order, alternating
// onto the smaller team) so prescription stays deterministic across peers.
import type { Team } from './protocol';
import { balanceLobbyTeams, type LobbyMember, type LobbyPhase, type MatchMode } from './private-match';
import { defaultSquadPresentation } from './squad-presentation';

export type SquadIdentity = Readonly<{ name: string; color: string }>;

/** Canonical colour-name pair table lookup: team 0 → AQUA, team 1 → CORAL. */
export function canonicalSquadIdentity(team: Team): SquadIdentity {
  return defaultSquadPresentation(team);
}

/**
 * Stamp the canonical colour-name identity derived from the member's team.
 * HF-328: identity is a pure function of team, so replication can never
 * diverge pre-match or mid-match.
 */
export function withPrescribedIdentity(member: LobbyMember): LobbyMember {
  const identity = canonicalSquadIdentity(member.team);
  if (member.squadName === identity.name && member.squadColor === identity.color) return member;
  return { ...member, squadName: identity.name, squadColor: identity.color };
}

/**
 * Deterministic prescribed assignment for TDM entry and explicit host
 * re-prescription: host-first (members[0] is the host by lobby construction),
 * then stable id order, alternating onto the smaller team. Disconnected
 * members keep their team. Canonical identities are stamped from the
 * resulting teams. Call sites own readiness resets.
 */
export function prescribeTeams(members: readonly LobbyMember[]): LobbyMember[] {
  return balanceLobbyTeams(members).map(withPrescribedIdentity);
}

function connectedTeamCounts(members: readonly LobbyMember[]): [aqua: number, coral: number] {
  let aqua = 0;
  let coral = 0;
  for (const member of members) {
    if (!member.connected) continue;
    if (member.team === 0) aqua += 1;
    else coral += 1;
  }
  return [aqua, coral];
}

/**
 * The team a newly admitted member is prescribed onto: the smaller connected
 * team, ties going to AQUA — the same fill rule as `balanceLobbyTeams`.
 * HF-328: joiners no longer carry a honoured team pick.
 */
export function prescribedTeamForJoin(existingMembers: readonly LobbyMember[]): Team {
  const [aqua, coral] = connectedTeamCounts(existingMembers);
  return aqua <= coral ? 0 : 1;
}

export type TeamSwapRefusalReason =
  | 'not-tdm'
  | 'not-waiting'
  | 'unknown-member'
  | 'not-connected'
  | 'no-change'
  | 'imbalance';

export type TeamSwapResult =
  | Readonly<{ accepted: true; members: readonly LobbyMember[] }>
  | Readonly<{ accepted: false; reason: TeamSwapRefusalReason }>;

/**
 * Shared SWAP SIDES legality check; returns null when the swap is legal.
 * HF-328: the lobby UI must mirror this exact check to disable the SWAP SIDES
 * button, so players never see silently refused swaps. A swap is legal only in
 * the waiting phase of a TDM lobby when the post-swap connected-team size
 * difference stays at most one.
 */
export function teamSwapRefusal(
  members: readonly LobbyMember[],
  byId: string,
  requestedTeam: Team,
  phase: LobbyPhase,
  mode: MatchMode,
): TeamSwapRefusalReason | null {
  if (mode !== 'tdm') return 'not-tdm';
  if (phase !== 'waiting') return 'not-waiting';
  const member = members.find((entry) => entry.id === byId);
  if (!member) return 'unknown-member';
  if (!member.connected) return 'not-connected';
  if (member.team === requestedTeam) return 'no-change';
  const [aqua, coral] = connectedTeamCounts(members);
  const nextAqua = requestedTeam === 0 ? aqua + 1 : aqua - 1;
  const nextCoral = requestedTeam === 1 ? coral + 1 : coral - 1;
  if (Math.abs(nextAqua - nextCoral) > 1) return 'imbalance';
  return null;
}

/**
 * Host-authoritative SWAP SIDES. On acceptance the swapped member changes
 * team, has the canonical identity re-stamped, and drops readiness (their
 * combat side changed); every other member keeps their team untouched — a
 * swap must stick instead of being overwritten by a full rebalance (HF-328).
 */
export function applyTeamSwap(
  members: readonly LobbyMember[],
  byId: string,
  requestedTeam: Team,
  phase: LobbyPhase,
  mode: MatchMode,
): TeamSwapResult {
  const refusal = teamSwapRefusal(members, byId, requestedTeam, phase, mode);
  if (refusal !== null) return Object.freeze({ accepted: false as const, reason: refusal });
  return Object.freeze({
    accepted: true as const,
    members: members.map((member) => member.id === byId
      ? withPrescribedIdentity({ ...member, team: requestedTeam, ready: false })
      : withPrescribedIdentity(member)),
  });
}

/**
 * Minimal-move stable rebalance after a roster change (join, leave, or
 * disconnect expiry): every prior legal team is preserved — so an accepted
 * swap survives later roster churn — and members are moved only while the
 * connected-team size difference exceeds one. Movers are chosen from the
 * larger team in reverse prescription priority (last stable id first; the
 * host, members[0], is the last member ever moved). Moved members drop
 * readiness; untouched members keep theirs. Canonical identities are stamped
 * throughout.
 */
export function rebalanceOnRosterChange(members: readonly LobbyMember[]): LobbyMember[] {
  const next = members.map(withPrescribedIdentity);
  let [aqua, coral] = connectedTeamCounts(next);
  const hostId = members[0]?.id;
  const priority = next.filter((member) => member.connected)
    .sort((a, b) => Number(b.id === hostId) - Number(a.id === hostId) || a.id.localeCompare(b.id));
  for (let index = priority.length - 1; index >= 0 && Math.abs(aqua - coral) > 1; index -= 1) {
    const candidate = priority[index]!;
    const larger: Team = aqua > coral ? 0 : 1;
    if (candidate.team !== larger) continue;
    const position = next.findIndex((member) => member.id === candidate.id);
    next[position] = withPrescribedIdentity({ ...next[position]!, team: larger === 0 ? 1 : 0, ready: false });
    if (larger === 0) {
      aqua -= 1;
      coral += 1;
    } else {
      coral -= 1;
      aqua += 1;
    }
  }
  return next;
}
