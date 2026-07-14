import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot, TeamPingMessage } from './protocol';
import { admitTeamPing, createTeamPingAdmissionState, pingMatchesBoundTeam, shouldRelayMessageToTeam, TEAM_PING_COOLDOWN_MS } from './social-ping';

const sender: PlayerSnapshot = {
  id: 'aqua-1', name: 'Aqua', team: 0, x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0, primary: 'carbine', weapon: 'carbine', seq: 1,
};
const ping = (overrides: Partial<TeamPingMessage> = {}): TeamPingMessage => ({
  type: 'ping', by: sender.id, team: sender.team, kind: 'enemy', position: [2, 1.7, -3], nonce: 10, ...overrides,
});

describe('team ping admission', () => {
  it('accepts one identity-bound same-team ping and rate limits the next', () => {
    const first = admitTeamPing(ping(), sender, 1_000, createTeamPingAdmissionState());
    expect(first.accepted).toBe(true);
    expect(first.nextState.nextAllowedAt).toBe(1_000 + TEAM_PING_COOLDOWN_MS);
    expect(admitTeamPing(ping({ nonce: 11 }), sender, 1_999, first.nextState).accepted).toBe(false);
    expect(admitTeamPing(ping({ nonce: 11 }), sender, 2_000, first.nextState).accepted).toBe(true);
  });

  it('rejects spoofed identity, team claims and replayed nonces', () => {
    const initial = createTeamPingAdmissionState();
    expect(admitTeamPing(ping({ by: 'spoof' }), sender, 1_000, initial).accepted).toBe(false);
    expect(admitTeamPing(ping({ team: 1 }), sender, 1_000, initial).accepted).toBe(false);
    const first = admitTeamPing(ping(), sender, 1_000, initial);
    expect(admitTeamPing(ping(), sender, 5_000, first.nextState).accepted).toBe(false);
  });

  it('keeps a bounded replay window', () => {
    let state = createTeamPingAdmissionState();
    for (let index = 0; index < 40; index += 1) {
      const result = admitTeamPing(ping({ nonce: index }), sender, index * TEAM_PING_COOLDOWN_MS, state);
      expect(result.accepted).toBe(true);
      state = result.nextState;
    }
    expect(state.recentNonces).toHaveLength(32);
  });

  it('binds ping claims and relays to the matching team only', () => {
    expect(pingMatchesBoundTeam(ping(), 0)).toBe(true);
    expect(pingMatchesBoundTeam(ping(), 1)).toBe(false);
    expect(shouldRelayMessageToTeam(ping(), 0)).toBe(true);
    expect(shouldRelayMessageToTeam(ping(), 1)).toBe(false);
    expect(shouldRelayMessageToTeam({ type: 'leave', playerId: 'aqua-1' }, 1)).toBe(true);
  });
});
