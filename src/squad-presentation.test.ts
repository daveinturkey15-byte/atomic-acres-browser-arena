import { describe, expect, it } from 'vitest';
import { isGameMessage, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { playersAreHostile } from './private-match';
import {
  defaultSquadPresentation,
  isSquadColor,
  isSquadName,
  renderSquadRosterBadge,
  sanitizeSquadPresentation,
} from './squad-presentation';

describe('Pass 72 squad presentation', () => {
  it('accepts bounded labels and six-digit colours only', () => {
    expect(isSquadName('North Wing')).toBe(true);
    expect(isSquadName('')).toBe(false);
    expect(isSquadName('x'.repeat(21))).toBe(false);
    expect(isSquadColor('#55E6FF')).toBe(true);
    expect(isSquadColor('red')).toBe(false);
    expect(sanitizeSquadPresentation('bad<script>', 'red', 1)).toEqual(defaultSquadPresentation(1));
  });

  it('replicates strict squad metadata without changing team hostility', () => {
    const message = {
      type: 'lobby-squad' as const,
      by: 'guest',
      squadName: 'North Wing',
      squadColor: '#55e6ff',
      nonce: 2,
    };
    expect(isGameMessage(message)).toBe(true);
    expect(isGameMessage({ ...message, squadColor: 'red' })).toBe(false);
    expect(playersAreHostile('tdm', { id: 'a', team: 0 }, { id: 'b', team: 0 })).toBe(false);
    expect(playersAreHostile('ffa', { id: 'a', team: 0 }, { id: 'b', team: 0 })).toBe(true);
  });

  it('keeps legacy joins valid while admitting optional squad metadata', () => {
    expect(isGameMessage({
      type: 'lobby-join', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      playerId: 'guest', connectionEpoch: 'epoch_1234', name: 'Guest', requestedTeam: 0,
      resumeToken: 'x'.repeat(24), nonce: 1,
    })).toBe(true);
    expect(isGameMessage({
      type: 'lobby-join', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      playerId: 'guest', connectionEpoch: 'epoch_1234', name: 'Guest', requestedTeam: 0,
      squadName: 'North Wing', squadColor: '#55e6ff', resumeToken: 'x'.repeat(24), nonce: 1,
    })).toBe(true);
  });

  it('renders the replicated colour as a visible, injection-safe roster swatch', () => {
    expect(renderSquadRosterBadge('North Wing', '#55E6FF', 0)).toBe(
      '<span class="lobby-squad-badge" style="--lobby-squad-color:#55e6ff"><span class="lobby-squad-swatch" aria-hidden="true"></span>North Wing</span>',
    );
    const rejected = renderSquadRosterBadge('bad<script>', 'red; background:url(evil)', 1);
    expect(rejected).toContain('--lobby-squad-color:#ff6b73');
    expect(rejected).toContain('CORAL');
    expect(rejected).not.toMatch(/<script>|url\(/);
    expect(renderSquadRosterBadge('North Wing', '#123456', 0))
      .not.toBe(renderSquadRosterBadge('North Wing', '#654321', 0));
  });
});
