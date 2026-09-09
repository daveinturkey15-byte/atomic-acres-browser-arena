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

// HF-328 (Pass 74 owner requirement): squad identity is prescribed — the
// canonical AQUA/CORAL colour-name pair for the member's team. The Pass 72
// free-name/colour replication behaviour these tests previously asserted is
// superseded; wire validators stay bounded for protocol-18 compatibility.

describe('Pass 74 prescribed squad presentation', () => {
  it('keeps bounded wire validators for protocol-18 compatibility without treating them as identity', () => {
    expect(isSquadName('North Wing')).toBe(true);
    expect(isSquadName('')).toBe(false);
    expect(isSquadName('x'.repeat(21))).toBe(false);
    expect(isSquadColor('#55E6FF')).toBe(true);
    expect(isSquadColor('red')).toBe(false);
  });

  it('collapses every client-supplied name and colour to the canonical pair for the team (HF-328)', () => {
    expect(sanitizeSquadPresentation('bad<script>', 'red', 1)).toEqual(defaultSquadPresentation(1));
    expect(sanitizeSquadPresentation('North Wing', '#123456', 0)).toEqual(defaultSquadPresentation(0));
    expect(sanitizeSquadPresentation(undefined, undefined, 1)).toEqual({ name: 'CORAL', color: '#ff6b73' });
    expect(defaultSquadPresentation(0)).toEqual({ name: 'AQUA', color: '#55e6ff' });
  });

  it('still accepts the lobby-squad wire shape from stale peers without changing team hostility', () => {
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

  it('keeps legacy joins valid while tolerating (ignored) squad metadata', () => {
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

  it('renders the prescribed identity as an injection-safe roster swatch regardless of replicated values (HF-328)', () => {
    expect(renderSquadRosterBadge('North Wing', '#55E6FF', 0)).toBe(
      '<span class="lobby-squad-badge" style="--lobby-squad-color:#55e6ff"><span class="lobby-squad-swatch" aria-hidden="true"></span>AQUA</span>',
    );
    const rejected = renderSquadRosterBadge('bad<script>', 'red; background:url(evil)', 1);
    expect(rejected).toContain('--lobby-squad-color:#ff6b73');
    expect(rejected).toContain('CORAL');
    expect(rejected).not.toMatch(/<script>|url\(/);
    // Identity is a pure function of team: differing replicated colours can no
    // longer produce differing badges (pre-match and mid-match stay consistent).
    expect(renderSquadRosterBadge('North Wing', '#123456', 0))
      .toBe(renderSquadRosterBadge('Other Name', '#654321', 0));
    expect(renderSquadRosterBadge(undefined, undefined, 0))
      .not.toBe(renderSquadRosterBadge(undefined, undefined, 1));
  });
});
