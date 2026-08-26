import type { GameMessage, PlayerSnapshot, Team, TeamPingMessage } from './protocol';

export const TEAM_PING_COOLDOWN_MS = 1_000;
export const TEAM_PING_LIFETIME_MS = 5_000;
export const MAX_ACTIVE_TEAM_PINGS = 8;

export type TeamPingAdmissionState = {
  nextAllowedAt: number;
  recentNonces: readonly number[];
};

export const createTeamPingAdmissionState = (): TeamPingAdmissionState => ({ nextAllowedAt: 0, recentNonces: [] });

export const pingMatchesBoundTeam = (message: TeamPingMessage, boundTeam: Team | undefined): boolean => message.team === boundTeam;

export const shouldRelayMessageToTeam = (message: GameMessage, recipientTeam: Team | undefined): boolean => (
  message.type !== 'ping' || message.team === recipientTeam
);

export function admitTeamPing(
  message: TeamPingMessage,
  sender: PlayerSnapshot | undefined,
  now: number,
  state: TeamPingAdmissionState,
): { accepted: boolean; nextState: TeamPingAdmissionState } {
  if (!sender || message.by !== sender.id || message.team !== sender.team) return { accepted: false, nextState: state };
  if (!Number.isFinite(now) || now < state.nextAllowedAt || state.recentNonces.includes(message.nonce)) {
    return { accepted: false, nextState: state };
  }
  const recentNonces = [...state.recentNonces, message.nonce].slice(-32);
  return {
    accepted: true,
    nextState: { nextAllowedAt: now + TEAM_PING_COOLDOWN_MS, recentNonces },
  };
}
