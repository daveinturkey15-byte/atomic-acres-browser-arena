import { describe, expect, it } from 'vitest';
import { DEFAULT_KILLSTREAK_LOADOUT } from './killstreak-loadout';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import {
  admitGuestResumeAck,
  admitGuestResumeAuthority,
  admitGuestResumeNack,
  guestResumeRetryAllowed,
  guestResumeProjection,
  guestResumeWorldRevisionReady,
} from './guest-resume-authority';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  isGameMessage,
  isHostAuthorityMessage,
  messageBelongsToPlayer,
  type GuestResumeAckMessage,
  type GuestResumeAuthorityMessage,
  type GuestResumeNackMessage,
} from './protocol';

const authority: GuestResumeAuthorityMessage = {
  type: 'guest-resume-authority',
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  by: 'host-1',
  forPlayerId: 'guest-1',
  connectionEpoch: 'connection_epoch_002',
  matchEpoch: 41,
  worldRevision: 17,
  attempt: 0,
  placementReason: 'retained',
  combatInventory: createGuestCombatInventory('m14-ebr', 'machine-pistol', 0),
  combatInventoryRevision: 23,
  player: {
    id: 'guest-1', name: 'Guest', team: 1,
    x: -8, y: 1.7, z: 4, yaw: -0.35, pitch: 0.08,
    hp: 7.5, kills: 3, deaths: 1,
    primary: 'm14-ebr', secondary: 'machine-pistol', grenade: 'semtex',
    weapon: 'railgun', stance: 'prone', seq: 313,
  },
  continuity: 9,
  respawnRemainingMs: 0,
  loadout: DEFAULT_KILLSTREAK_LOADOUT,
  nonce: 712,
};

describe('authenticated guest resume authority', () => {
  it('validates a bounded host-only envelope and rejects coupled-field mutations', () => {
    expect(isGameMessage(authority)).toBe(true);
    expect(isHostAuthorityMessage(authority)).toBe(true);
    expect(messageBelongsToPlayer(authority, 'host-1')).toBe(true);
    expect(messageBelongsToPlayer(authority, 'guest-1')).toBe(false);
    expect(isGameMessage({ ...authority, forPlayerId: 'guest-2' })).toBe(false);
    expect(isGameMessage({ ...authority, connectionEpoch: 'short' })).toBe(false);
    expect(isGameMessage({ ...authority, continuity: -1 })).toBe(false);
    expect(isGameMessage({ ...authority, loadout: { ...authority.loadout, slots: ['nuke'] } })).toBe(false);
  });

  it('admits only the exact host, recipient, transport, match and unused authority nonce', () => {
    const context = {
      expectedHostId: 'host-1', expectedPlayerId: 'guest-1',
      expectedConnectionEpoch: 'connection_epoch_002', expectedMatchEpoch: 41,
      seenNonces: new Set<number>(),
    };
    expect(admitGuestResumeAuthority(authority, context)).toEqual({ accepted: true, reason: 'accepted' });
    expect(admitGuestResumeAuthority(authority, { ...context, expectedHostId: 'host-2' }).reason).toBe('wrong-host');
    expect(admitGuestResumeAuthority(authority, { ...context, expectedPlayerId: 'guest-2' }).reason).toBe('wrong-recipient');
    expect(admitGuestResumeAuthority(authority, { ...context, expectedConnectionEpoch: 'connection_epoch_003' }).reason).toBe('wrong-connection-epoch');
    expect(admitGuestResumeAuthority(authority, { ...context, expectedMatchEpoch: 42 }).reason).toBe('wrong-match-epoch');
    expect(admitGuestResumeAuthority(authority, { ...context, seenNonces: new Set([authority.nonce]) }).reason).toBe('replay');
    expect(admitGuestResumeAuthority({
      ...authority,
      combatInventory: {
        ...authority.combatInventory,
        ammo: { ...authority.combatInventory.ammo, sniper: 9_999 },
      },
    }, context).reason).toBe('invalid-inventory');
  });

  it('projects the complete retained pose, combat loadout, current weapon, HP and continuity', () => {
    const projection = guestResumeProjection(authority);
    expect(projection).toEqual({
      player: authority.player,
      worldRevision: 17,
      combatInventory: authority.combatInventory,
      combatInventoryRevision: 23,
      attempt: 0,
      placementReason: 'retained',
      continuity: 9,
      respawnRemainingMs: 0,
      loadout: DEFAULT_KILLSTREAK_LOADOUT,
    });
    expect(projection.player).not.toBe(authority.player);
    expect(projection.loadout).not.toBe(authority.loadout);
    expect(projection.combatInventory).not.toBe(authority.combatInventory);
  });

  it('waits through event-before-world reordering and releases on the exact repaired revision', () => {
    expect(guestResumeWorldRevisionReady(null, authority.worldRevision)).toBe(false);
    expect(guestResumeWorldRevisionReady(authority.worldRevision - 1, authority.worldRevision)).toBe(false);
    expect(guestResumeWorldRevisionReady(authority.worldRevision, authority.worldRevision)).toBe(true);
    expect(guestResumeWorldRevisionReady(authority.worldRevision + 1, authority.worldRevision)).toBe(true);
  });

  it('accepts an acknowledgement only for the exact authority and connection epoch', () => {
    const ack: GuestResumeAckMessage = {
      type: 'guest-resume-ack', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'guest-1', connectionEpoch: 'connection_epoch_002', matchEpoch: 41,
      authorityNonce: authority.nonce, nonce: 713,
    };
    const context = {
      expectedPlayerId: 'guest-1', expectedConnectionEpoch: 'connection_epoch_002',
      expectedMatchEpoch: 41, expectedAuthorityNonce: authority.nonce,
    };
    expect(isGameMessage(ack)).toBe(true);
    expect(isHostAuthorityMessage(ack)).toBe(false);
    expect(messageBelongsToPlayer(ack, 'guest-1')).toBe(true);
    expect(admitGuestResumeAck(ack, context)).toBe(true);
    expect(admitGuestResumeAck({ ...ack, connectionEpoch: 'connection_epoch_001' }, context)).toBe(false);
    expect(admitGuestResumeAck({ ...ack, authorityNonce: authority.nonce + 1 }, context)).toBe(false);
  });

  it('admits only an exact pending NACK and enforces the retry ceiling', () => {
    const nack: GuestResumeNackMessage = {
      type: 'guest-resume-nack', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'guest-1', connectionEpoch: authority.connectionEpoch, matchEpoch: authority.matchEpoch,
      worldRevision: authority.worldRevision, authorityNonce: authority.nonce,
      attempt: authority.attempt, reason: 'blocked-pose', nonce: 714,
    };
    expect(isGameMessage(nack)).toBe(true);
    expect(admitGuestResumeNack(nack, authority, 'guest-1')).toBe(true);
    expect(admitGuestResumeNack({ ...nack, authorityNonce: authority.nonce + 1 }, authority, 'guest-1')).toBe(false);
    expect(admitGuestResumeNack({ ...nack, worldRevision: authority.worldRevision + 1 }, authority, 'guest-1')).toBe(false);
    expect(guestResumeRetryAllowed(0)).toBe(true);
    expect(guestResumeRetryAllowed(1)).toBe(true);
    expect(guestResumeRetryAllowed(2)).toBe(false);
  });
});
