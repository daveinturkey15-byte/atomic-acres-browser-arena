import { describe, expect, it } from 'vitest';
import { configureRuntimeRandom } from './runtime-random';
import { LEADERBOARD_SEASON } from '../shared/leaderboard-season';
import { MULTIPLAYER_PROTOCOL_VERSION, isGameMessage, isHostAuthorityMessage, isPlayerSnapshot, isStateTrafficMessage, messageBelongsToPlayer, sanitizeName, type ChatHistoryMessage, type ChatMessage, type ChatSubmitMessage, type GrenadeResultMessage, type GrenadeThrowMessage, type LeaderboardSyncMessage, type RedeployCommitMessage, type RedeployRequestMessage, type SupportActivateMessage, type TriggerStateMessage } from './protocol';
import { advanceRailgunAuthority, createRailgunAuthorityState, RAILGUN_SPAWN_DELAY_MS } from './railgun-authority';
import { shedPlacementsForArena } from './destructible-shed-registry';
import { InteractiveWorldRuntime } from './interactive-world-runtime';
import { BOT_WEAPON_PRESENTATION_SCHEMA_VERSION } from './bot-weapon-presentation';

const player = {
  id: 'abc', name: 'Tester', team: 0 as const,
  x: 0, y: 1.7, z: 2, yaw: 0, pitch: 0,
  hp: 100, kills: 2, deaths: 1, primary: 'carbine' as const, secondary: 'pistol' as const,
  grenade: 'frag' as const, weapon: 'carbine' as const, seq: 4,
};
const state = (snapshot: any = player) => ({ type: 'state' as const, player: snapshot, hostTimeMs: 1_000, continuity: 1, rateHz: 40 as const });

describe('network protocol guards', () => {
  it('accepts a bounded valid player snapshot and known stance', () => {
    expect(isPlayerSnapshot(player)).toBe(true);
    expect(isGameMessage(state({ ...player, stance: 'prone' as const }))).toBe(true);
  });

  it('accepts only a compact inventory projection bound to the state sequence', () => {
    const combatInventory = {
      revision: player.seq,
      primary: { weapon: 'carbine', ammo: 19, reserve: 100 },
      sidearm: { weapon: 'pistol', ammo: 11, reserve: 48 },
      grenades: 0,
    } as const;
    expect(isGameMessage({ ...state(), combatInventory })).toBe(true);
    expect(isGameMessage({ ...state(), combatInventory: { ...combatInventory, revision: player.seq - 1 } })).toBe(false);
    expect(isGameMessage({
      ...state(),
      combatInventory: { ...combatInventory, primary: { ...combatInventory.primary, weapon: 'smg' } },
    })).toBe(false);
    expect(isGameMessage({
      ...state(),
      combatInventory: { ...combatInventory, ammo: { carbine: 19 } },
    })).toBe(false);
  });

  it('admits equipped pickup-only specials without admitting them into loadout slots', () => {
    expect(isPlayerSnapshot({ ...player, weapon: 'flamethrower' })).toBe(true);
    expect(isPlayerSnapshot({ ...player, weapon: 'flare-gun' })).toBe(true);
    expect(isPlayerSnapshot({ ...player, primary: 'flamethrower', weapon: 'flamethrower' })).toBe(false);
    expect(isPlayerSnapshot({ ...player, secondary: 'flare-gun', weapon: 'flare-gun' })).toBe(false);
  });

  it('rejects malformed or unbounded messages', () => {
    expect(isGameMessage(state({ ...player, x: Infinity }))).toBe(false);
    expect(isGameMessage(state({ ...player, stance: 'burrowed' as never }))).toBe(false);
    expect(isGameMessage(state({ ...player, hp: 101 }))).toBe(false);
    expect(isGameMessage(state({ ...player, hp: -1 }))).toBe(false);
    expect(isGameMessage(state({ ...player, pitch: 2 }))).toBe(false);
    expect(isGameMessage(state({ ...player, kills: -1 }))).toBe(false);
    expect(isGameMessage(state({ ...player, seq: 4.5 }))).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 999, nonce: 1 })).toBe(false);
    expect(isGameMessage({ type: 'chat', by: 'a', text: 'unbounded text transport' })).toBe(false);
    expect(isGameMessage({ type: 'ping', by: 'a', team: 0, kind: 'link', position: [0, 1, 0], nonce: 1 })).toBe(false);
    expect(isGameMessage({ type: 'script', body: 'alert(1)' })).toBe(false);
  });

  it('rejects protocol-owned participant ids while retaining ordinary lobby joins', () => {
    const join = {
      type: 'lobby-join' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      playerId: '35bff532-7307-41ca-a869-4fc8482c73c4',
      connectionEpoch: 'connection_epoch_player_1',
      name: 'Player 1',
      requestedTeam: 0 as const,
      resumeToken: '12345678-1234-1234-1234-123456789abc',
      nonce: 1,
    };
    expect(isGameMessage(join)).toBe(true);
    expect(isGameMessage({ ...join, playerId: 'map:carpet-bomber' })).toBe(false);
    expect(isGameMessage({ ...join, playerId: 'host-bot-0' })).toBe(false);
  });

  it('validates shot vectors and known weapon ids', () => {
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'sniper', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'machine-pistol', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 5 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'laser', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(false);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(false);
  });

  it('validates versioned authoritative firearm requests and idempotent results', () => {
    const request = {
      type: 'shot-request' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc',
      shotId: 'session:abc:7',
      connectionEpoch: 'connection_epoch_abc',
      lifeId: 3,
      shotSeq: 7,
      weaponSequence: 11,
      weapon: 'carbine' as const,
      fireTimeMs: 2_500,
      triggerStartedAtMs: 2_500,
      targetViewTimeMs: 2_420,
      origin: [0, 1.6, 2] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number],
      pelletDirections: [[0, 0, -1]] as [number, number, number][],
      nonce: 41,
    } as const;
    const result = {
      type: 'shot-result' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host',
      forPlayerId: 'abc',
      shotId: request.shotId,
      connectionEpoch: request.connectionEpoch,
      lifeId: request.lifeId,
      shotSeq: request.shotSeq,
      weapon: request.weapon,
      status: 'accepted-hit' as const,
      reason: 'none' as const,
      fireTimeMs: request.fireTimeMs,
      targetViewTimeMs: request.targetViewTimeMs,
      receivedAtHostTimeMs: 2_520,
      resolvedAtHostTimeMs: 2_521,
      appliedRewindMs: 80,
      combatInventory: {
        revision: 8,
        primary: { weapon: 'carbine' as const, ammo: 19, reserve: 100 },
        sidearm: { weapon: 'pistol' as const, ammo: 12, reserve: 48 },
        grenades: 1 as const,
      },
      outcomes: [{
        target: 'host', pelletHits: 1, damage: 31.4, rawDamage: 31.4, resultingHealth: 68.6,
        died: false, hitZone: 'body' as const, wallbang: false, penetrationMultiplier: 1,
      }],
      nonce: 42,
    } as const;
    expect(isGameMessage(request)).toBe(true);
    expect(isGameMessage(result)).toBe(true);
    expect(isGameMessage({ ...request, protocolVersion: 1 })).toBe(false);
    expect(isGameMessage({ ...request, targetViewTimeMs: request.fireTimeMs + 1 })).toBe(false);
    expect(isGameMessage({ ...request, direction: [0, 0, -0.5] })).toBe(false);
    expect(isGameMessage({ ...result, combatInventory: null })).toBe(false);
    expect(isGameMessage({ ...result, connectionEpoch: 'wrong' })).toBe(false);
    expect(isGameMessage({ ...result, outcomes: [{ ...result.outcomes[0], damage: 401 }] })).toBe(false);
    expect(isGameMessage({ ...result, outcomes: [{ ...result.outcomes[0], rawDamage: 30 }] })).toBe(false);
  });

  it('strictly validates reliable trigger edges without trusting a client timestamp', () => {
    const trigger = {
      type: 'trigger-state' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc',
      connectionEpoch: 'connection_epoch_abc',
      lifeId: 3,
      actionSequence: 7,
      weapon: 'minigun' as const,
      pressed: true,
      nonce: 43,
    } satisfies TriggerStateMessage;
    expect(isGameMessage(trigger)).toBe(true);
    expect(messageBelongsToPlayer(trigger, 'abc')).toBe(true);
    expect(isHostAuthorityMessage(trigger)).toBe(false);
    expect(isGameMessage({ ...trigger, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
    expect(isGameMessage({ ...trigger, actionSequence: -1 })).toBe(false);
    expect(isGameMessage({ ...trigger, actionSequence: 1_000_000_001 })).toBe(false);
    expect(isGameMessage({ ...trigger, pressed: 'yes' })).toBe(false);
  });

  it('requires action-correlated typed hit authority and earned support metadata', () => {
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', actionNonce: 3, nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', nonce: 4 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 100, kind: 'melee', actionNonce: 3, nonce: 5 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', actionNonce: 3, nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'tri-pass', origin: [1, 0, 2], actionNonce: 3, supportNonce: 2, nonce: 6 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'tri-pass', origin: [1, 0, 2], actionNonce: 3, nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 60, kind: 'explosive', explosiveSource: 'explosive-crossbow', origin: [1, 0, 2], actionNonce: 3, nonce: 6 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'magic', origin: [1, 0, 2], actionNonce: 3, supportNonce: 2, nonce: 6 })).toBe(false);
    const activation: SupportActivateMessage = {
      type: 'support-activate', by: 'a', source: 'nuke', activationRequestId: 'activation-nuke-1',
      activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8,
    };
    expect(isGameMessage(activation)).toBe(true);
    expect(messageBelongsToPlayer(activation, 'a')).toBe(true);
    const grenadeThrow: GrenadeThrowMessage = {
      type: 'grenade-throw', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'a', connectionEpoch: 'connection_epoch_a', grenade: 'frag', lifeId: 2, actionSequence: 0,
      origin: [0, 1.7, 0], velocity: [0, 5.2, -13], actionNonce: 9, nonce: 10,
    };
    expect(isGameMessage(grenadeThrow)).toBe(true);
    expect(messageBelongsToPlayer(grenadeThrow, 'a')).toBe(true);
    const grenadeResult: GrenadeResultMessage = {
      type: 'grenade-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'a', connectionEpoch: 'connection_epoch_a', lifeId: 2,
      actionSequence: 0, actionNonce: 9, status: 'accepted', shotSequenceWatermark: 7,
      combatInventory: {
        revision: 8,
        primary: { weapon: 'carbine', ammo: 29, reserve: 120 },
        sidearm: { weapon: 'pistol', ammo: 15, reserve: 60 },
        grenades: 0,
      },
      nonce: 11,
    };
    expect(isGameMessage(grenadeResult)).toBe(true);
    expect(isHostAuthorityMessage(grenadeResult)).toBe(true);
    expect(isGameMessage({ ...grenadeResult, connectionEpoch: 'short' })).toBe(false);
    expect(isGameMessage({ ...grenadeResult, shotSequenceWatermark: -2 })).toBe(false);
  });

  it('treats canonical sticky hit and window envelopes as host-only authority', () => {
    const stickyAttachment = { targetId: 'guest-b', targetLifeId: 9 } as const;
    const hit = {
      type: 'hit' as const, by: 'guest-a', target: 'guest-b', damage: 100, kind: 'explosive' as const,
      explosiveSource: 'grenade' as const, origin: [1, 2, 3] as [number, number, number], actionNonce: 41,
      stuck: true as const,
      hostAuthority: { hostId: 'host', targetLifeId: 9, appliedDamage: 64, resultingHealth: 36, stickyAttachment }, nonce: 78,
    };
    const windowBreak = {
      type: 'window-break' as const, by: 'guest-a', windowId: 'aqua-house:ground-window-glass',
      origin: [1, 2, 3] as [number, number, number], kind: 'explosive' as const, actionNonce: 41,
      hostAuthority: { hostId: 'host', stickyAttachment }, nonce: 79,
    };
    expect(isGameMessage(hit)).toBe(true);
    expect(isGameMessage(windowBreak)).toBe(true);
    expect(isHostAuthorityMessage(hit)).toBe(true);
    expect(isHostAuthorityMessage(windowBreak)).toBe(true);
    expect(messageBelongsToPlayer(hit, 'guest-a')).toBe(true);
    expect(isGameMessage({ ...hit, hostAuthority: { ...hit.hostAuthority, targetLifeId: 1.5 } })).toBe(false);
    expect(isGameMessage({ ...hit, hostAuthority: { ...hit.hostAuthority, appliedDamage: 101 } })).toBe(false);
    expect(isGameMessage({ ...hit, hostAuthority: { ...hit.hostAuthority, resultingHealth: -1 } })).toBe(false);
    expect(isGameMessage({ ...hit, hostAuthority: { ...hit.hostAuthority, stickyAttachment: { ...stickyAttachment, targetId: 'other' } } })).toBe(false);
    expect(isGameMessage({ ...hit, stuck: undefined })).toBe(false);
    expect(isGameMessage({ ...hit, hostAuthority: { ...hit.hostAuthority, stickyAttachment: null } })).toBe(false);
    expect(isGameMessage({ ...windowBreak, hostAuthority: { hostId: '', stickyAttachment } })).toBe(false);
  });

  it('validates combat timing and bounded host-bot authority messages', () => {
    const timing = { eventSeq: 7, sentAtHostTimeMs: 1_700 };
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'carbine', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], timing, nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'carbine', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], timing: { ...timing, eventSeq: -1 }, nonce: 3 })).toBe(false);
    const bot = { id: 'host-bot-0', name: 'Hosted Rival 1', team: 1 as const, weapon: 'lmg' as const, x: 1, y: 0, z: 2, yaw: 0, stance: 'stand' as const, hp: 100, kills: 0, deaths: 0, alive: true, seq: 2 };
    const botState = { type: 'bot-state' as const, by: 'host', seq: 2, bots: [bot], nonce: 20 };
    const botDamage = { type: 'bot-damage' as const, by: 'host', botId: bot.id, target: 'abc', weapon: bot.weapon, origin: [1, 1.4, 2] as [number, number, number], direction: [0, 0, -1] as [number, number, number], damageApplied: 14, healthBefore: 100, healthAfter: 86, nonce: 21 };
    expect(isGameMessage(botState)).toBe(true);
    expect(isHostAuthorityMessage(botState)).toBe(true);
    expect(isStateTrafficMessage(botState)).toBe(true);
    expect(isGameMessage(botDamage)).toBe(true);
    expect(isGameMessage({ ...botDamage, weapon: 'flare-gun', presentation: 'signal-flare-projectile' })).toBe(true);
    expect(isGameMessage({ ...botDamage, presentation: 'fake-projectile' })).toBe(false);
    expect(isGameMessage({ ...botDamage, weapon: 'flare-gun' })).toBe(false);
    expect(isGameMessage({ ...botDamage, presentation: 'signal-flare-projectile' })).toBe(false);
    expect(isGameMessage({ ...botDamage, weapon: 'flamethrower', presentation: 'flamethrower-stream' })).toBe(true);
    expect(isGameMessage({ ...botDamage, weapon: 'flamethrower' })).toBe(true);
    expect(isGameMessage({ ...botDamage, weapon: 'flamethrower', presentation: 'signal-flare-projectile' })).toBe(false);
    expect(isGameMessage({ ...botState, bots: [{ ...bot, weapon: 'pistol' }] })).toBe(true);
    expect(isGameMessage({ ...botDamage, weapon: 'pistol' })).toBe(true);
    expect(isGameMessage({ ...botState, bots: [{ ...bot, weapon: 'minigun' }] })).toBe(false);
    expect(isHostAuthorityMessage(botDamage)).toBe(true);
    expect(isGameMessage({ ...botDamage, healthAfter: 85 })).toBe(false);
    expect(isGameMessage({ ...botState, bots: [bot, bot] })).toBe(false);

    const botFlamePresentation = {
      type: 'bot-weapon-presentation' as const,
      schemaVersion: BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
      by: 'host',
      matchEpoch: 7,
      botId: bot.id,
      weapon: 'flamethrower' as const,
      presentation: 'flamethrower-stream' as const,
      origin: [1, 1.4, 2] as const,
      end: [1, 1.4, -8] as const,
      actionNonce: 31,
      nonce: 32,
    };
    const botFlarePresentation = {
      type: 'bot-weapon-presentation' as const,
      schemaVersion: BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
      by: 'host',
      matchEpoch: 7,
      botId: bot.id,
      weapon: 'flare-gun' as const,
      presentation: 'signal-flare-launch' as const,
      origin: [1, 1.4, 2] as const,
      actionNonce: 33,
      nonce: 34,
    };
    expect(isGameMessage(botFlamePresentation)).toBe(true);
    expect(isGameMessage(botFlarePresentation)).toBe(true);
    expect(isHostAuthorityMessage(botFlamePresentation)).toBe(true);
    expect(isStateTrafficMessage(botFlamePresentation)).toBe(false);
    expect(messageBelongsToPlayer(botFlamePresentation, 'host')).toBe(true);
    expect(isGameMessage({ ...botFlamePresentation, damage: 1 })).toBe(false);
    expect(isGameMessage({ ...botFlarePresentation, presentation: 'signal-flare-projectile' })).toBe(false);
  });

  it('admits score snapshots for the maximum six-player/four-bot lobby', () => {
    const score = (id: string) => ({ id, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 });
    const scores = Array.from({ length: 10 }, (_, index) => score(`player-${index}`));
    expect(isGameMessage({ type: 'match-score', by: 'host', scores, nonce: 22 })).toBe(true);
    expect(isGameMessage({ type: 'match-score', by: 'host', scores: [...scores, score('overflow')], nonce: 23 })).toBe(false);
  });

  it('validates bounded real-time Gun Range score claims', () => {
    const claim = { type: 'range-score-claim' as const, by: 'abc', score: 1_250, hits: 7, shots: 12, nonce: 24 };
    expect(isGameMessage(claim)).toBe(true);
    expect(messageBelongsToPlayer(claim, 'abc')).toBe(true);
    expect(isHostAuthorityMessage(claim)).toBe(false);
    expect(isGameMessage({ ...claim, score: -1 })).toBe(false);
    expect(isGameMessage({ ...claim, shots: 100_001 })).toBe(false);
  });

  it('validates replicated pickup and breakable-window messages', () => {
    const pickup = {
      type: 'pickup', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: 'abc', dropId: 'death-77',
      weapon: 'sniper', mode: 'weapon', selectedGrenade: 'frag', grenadeGranted: 0,
      position: [1, 1.7, 2] as [number, number, number], nonce: 77,
    } as const;
    const brokenWindow = { type: 'window-break', by: 'abc', windowId: 'aqua-house:ground-window-glass', origin: [1, 1.7, 2] as [number, number, number], nonce: 78 } as const;
    expect(isGameMessage(pickup)).toBe(true);
    expect(isGameMessage({ ...pickup, mode: 'scavenge' })).toBe(true);
    expect(isGameMessage({ ...pickup, mode: 'scavenge', weapon: 'pistol' })).toBe(true);
    expect(isGameMessage(brokenWindow)).toBe(true);
    expect(isGameMessage({ ...brokenWindow, kind: 'explosive' })).toBe(false);
    expect(isGameMessage({
      ...brokenWindow,
      kind: 'shot',
      weapon: 'explosive-crossbow',
      crossbowPhase: 'impact',
      actionNonce: 91,
    })).toBe(true);
    expect(isGameMessage({
      ...brokenWindow,
      kind: 'explosive',
      weapon: 'explosive-crossbow',
      crossbowPhase: 'explosion',
      crossbowBlastRadiusM: 3.5,
      actionNonce: 91,
    })).toBe(true);
    expect(isGameMessage({
      ...brokenWindow,
      kind: 'shot',
      weapon: 'explosive-crossbow',
      crossbowPhase: 'explosion',
      crossbowBlastRadiusM: 3.5,
      actionNonce: 91,
    })).toBe(false);
    expect(isGameMessage({
      ...brokenWindow,
      kind: 'explosive',
      weapon: 'explosive-crossbow',
      crossbowPhase: 'explosion',
      crossbowBlastRadiusM: 4,
      actionNonce: 91,
    })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, kind: 'explosive', actionNonce: 55 })).toBe(true);
    expect(isGameMessage({ ...brokenWindow, kind: 'shot', actionNonce: 55 })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, kind: 'magic' })).toBe(false);
    expect(messageBelongsToPlayer(pickup, 'abc')).toBe(true);
    expect(messageBelongsToPlayer(brokenWindow, 'abc')).toBe(true);
    expect(isGameMessage({ ...pickup, dropId: '<script>'.repeat(30) })).toBe(false);
    expect(isGameMessage({ ...pickup, weapon: 'laser' })).toBe(false);
    expect(isGameMessage({ ...pickup, mode: 'duplicate' })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, origin: [Infinity, 1.7, 2] })).toBe(false);
    expect(messageBelongsToPlayer({ ...brokenWindow, by: 'spoof' }, 'abc')).toBe(false);
  });

  // HF-315(a): the host answers every pickup request so an optimistic guest
  // swap is confirmed against canonical authority or reverted, never diverged.
  it('validates canonical host pickup results with an echoed request nonce', () => {
    const drop = {
      weapon: 'carbine' as const, ammo: 12, reserve: 40,
      position: [1, 0.2, 2] as [number, number, number], expiresAt: 31_000,
    };
    const result = {
      type: 'pickup-result' as const, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'abc', dropId: 'death-77',
      status: 'accepted' as const, reason: 'accepted' as const,
      combatInventory: {
        revision: 9,
        primary: { weapon: 'sniper' as const, ammo: 5, reserve: 0 },
        sidearm: { weapon: 'pistol' as const, ammo: 12, reserve: 48 },
        grenades: 1 as const,
      },
      drop,
      nonce: 77,
    } as const;
    expect(isGameMessage(result)).toBe(true);
    expect(isHostAuthorityMessage(result)).toBe(true);
    expect(messageBelongsToPlayer(result, 'host')).toBe(true);
    expect(messageBelongsToPlayer(result, 'abc')).toBe(false);
    expect(isGameMessage({ ...result, drop: 'removed' })).toBe(true);
    expect(isGameMessage({ ...result, status: 'rejected' as const, reason: 'expired' as const })).toBe(true);
    // Accepted results carry exactly 'accepted'; rejections must name a guard.
    expect(isGameMessage({ ...result, status: 'rejected' })).toBe(false);
    expect(isGameMessage({ ...result, reason: 'expired' })).toBe(false);
    expect(isGameMessage({ ...result, status: 'rejected', reason: 'because' })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, ammo: -1 } })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, reserve: 10_001 } })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, weapon: 'laser' } })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, expiresAt: Number.NaN } })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, position: [1, Infinity, 2] } })).toBe(false);
    expect(isGameMessage({ ...result, drop: { ...drop, extra: 1 } })).toBe(false);
    expect(isGameMessage({ ...result, dropId: '' })).toBe(false);
    expect(isGameMessage({ ...result, combatInventory: { ...result.combatInventory, revision: -1 } })).toBe(false);
    expect(isGameMessage({ ...result, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
  });

  // HF-326 residual polish: the intentional-reset farewell is host authority
  // and can never be forged or replayed on behalf of a guest.
  it('validates the terminal host lobby-closed farewell as unforgeable host authority', () => {
    const farewell = { type: 'lobby-closed' as const, reason: 'host-reset' as const, nonce: 9 };
    expect(isGameMessage(farewell)).toBe(true);
    expect(isHostAuthorityMessage(farewell)).toBe(true);
    expect(messageBelongsToPlayer(farewell, 'abc')).toBe(false);
    expect(messageBelongsToPlayer(farewell, 'host')).toBe(false);
    expect(isGameMessage({ ...farewell, reason: 'rage-quit' })).toBe(false);
    expect(isGameMessage({ ...farewell, nonce: Number.NaN })).toBe(false);
  });

  it('validates bounded host-authoritative Overdrive claims and state', () => {
    const claim = { type: 'overdrive-claim' as const, by: 'abc', position: [0, 1.7, 0] as [number, number, number], generation: 2, nonce: 90 };
    const state = { type: 'overdrive-state' as const, by: 'host', holderId: 'abc', available: false, generation: 3, position: [0, 0.82, 0] as [number, number, number], activeRemainingMs: 30_000, nextSpawnInMs: 120_000, nonce: 91 };
    expect(isGameMessage(claim)).toBe(true);
    expect(isGameMessage(state)).toBe(true);
    expect(messageBelongsToPlayer(claim, 'abc')).toBe(true);
    expect(isGameMessage({ ...claim, position: [Infinity, 1.7, 0] })).toBe(false);
    expect(isGameMessage({ ...state, activeRemainingMs: 30_001 })).toBe(false);
    expect(isGameMessage({ ...state, nextSpawnInMs: 120_001 })).toBe(false);
    expect(isGameMessage({ ...state, position: [0, Number.NaN, 0] })).toBe(false);
    const redeploy: RedeployRequestMessage = {
      type: 'redeploy-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: 'abc',
      primary: 'smg', secondary: 'pistol', grenade: 'flash', nonce: 92,
    };
    expect(isGameMessage(redeploy)).toBe(true);
    expect(messageBelongsToPlayer(redeploy, 'abc')).toBe(true);
    const redeployCommit: RedeployCommitMessage = {
      type: 'redeploy-commit', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', target: 'abc', primary: 'smg', secondary: 'pistol', grenade: 'flash', hostTimeMs: 1_500, nonce: 93,
    };
    expect(isGameMessage(redeployCommit)).toBe(true);
    expect(isHostAuthorityMessage(redeployCommit)).toBe(true);
    expect(isGameMessage({ ...redeploy, primary: 'laser' })).toBe(false);
    expect(isGameMessage({ ...redeploy, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
  });

  it('validates authenticated reload intents and canonical host results', () => {
    const intent = {
      type: 'reload-intent' as const, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc', connectionEpoch: 'connection_epoch_abc', lifeId: 3,
      actionSequence: 4, requestId: 'reload-request-start-4', weapon: 'carbine' as const, action: 'start' as const, nonce: 194,
    } as const;
    const result = {
      type: 'reload-result' as const, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host', forPlayerId: 'abc', connectionEpoch: intent.connectionEpoch, lifeId: intent.lifeId,
      actionSequence: intent.actionSequence, requestId: intent.requestId, weapon: intent.weapon, status: 'started' as const,
      reason: 'accepted' as const, completesAtHostTimeMs: 4_200, shotSequenceWatermark: 2,
      combatInventory: {
        revision: 11,
        primary: { weapon: 'carbine' as const, ammo: 7, reserve: 100 },
        sidearm: { weapon: 'pistol' as const, ammo: 12, reserve: 48 },
        grenades: 1 as const,
      },
      nonce: 195,
    } as const;
    expect(isGameMessage(intent)).toBe(true);
    expect(messageBelongsToPlayer(intent, 'abc')).toBe(true);
    expect(isHostAuthorityMessage(intent)).toBe(false);
    expect(isGameMessage(result)).toBe(true);
    expect(isHostAuthorityMessage(result)).toBe(true);
    expect(isGameMessage({ ...intent, requestId: undefined })).toBe(false);
    expect(isGameMessage({ ...result, requestId: undefined })).toBe(false);
    expect(isGameMessage({ ...intent, actionSequence: -1 })).toBe(false);
    expect(isGameMessage({ ...intent, weapon: 'railgun' })).toBe(false);
    expect(isGameMessage({ ...result, combatInventory: { ...result.combatInventory, revision: -1 } })).toBe(false);
  });

  it('admits versioned railgun requests and host state only on the reliable authority lane', () => {
    const claim = {
      type: 'railgun-claim-request' as const, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc', generation: 1, position: [0, 4.18, 0] as [number, number, number], nonce: 94,
    };
    const shot = {
      type: 'railgun-shot-request' as const, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc', generation: 1, shotId: 'rail-shot-1', origin: [0, 4.18, 0] as [number, number, number],
      direction: [0, 0, -1] as [number, number, number], fireTimeMs: 2_000, nonce: 95,
    };
    expect(isGameMessage(claim)).toBe(true);
    expect(isGameMessage(shot)).toBe(true);
    expect(messageBelongsToPlayer(claim, 'abc')).toBe(true);
    expect(messageBelongsToPlayer(shot, 'abc')).toBe(true);
    expect(isHostAuthorityMessage(claim)).toBe(false);
    expect(isHostAuthorityMessage(shot)).toBe(false);
    expect(isGameMessage({ ...shot, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
  });

  it('admits only the explicitly selected sidearm in snapshots', () => {
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', secondary: 'machine-pistol', weapon: 'machine-pistol' })).toBe(true);
    expect(isPlayerSnapshot({ ...player, primary: 'carbine', secondary: 'pistol', weapon: 'machine-pistol' })).toBe(false);
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', secondary: 'machine-pistol', weapon: 'pistol' })).toBe(false);
  });

  it('binds persistent-score replication to the established player id and bounded schema', () => {
    const entry = {
      id: 'score:abc:one', name: 'Tester', kills: 12, deaths: 3,
      bestStreak: 8, won: true, recordedAt: Date.now(),
    };
    const score = { type: 'high-score', by: 'abc', season: LEADERBOARD_SEASON, entry } as const;
    const sync: LeaderboardSyncMessage = { type: 'leaderboard-sync', by: 'abc', season: LEADERBOARD_SEASON, entries: [entry] };
    expect(isGameMessage(score)).toBe(true);
    expect(isGameMessage(sync)).toBe(true);
    expect(isGameMessage({ ...score, season: 'legacy' })).toBe(false);
    expect(messageBelongsToPlayer(score, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ ...score, by: 'spoof' }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer(sync, 'abc')).toBe(true);
    expect(isGameMessage({ ...score, entry: { ...entry, kills: 1_000, bestStreak: 1_000 } })).toBe(true);
    expect(isGameMessage({ ...score, entry: { ...entry, kills: 10_000 } })).toBe(false);
    expect(isGameMessage({ ...score, entry: { ...entry, bestStreak: 10_000 } })).toBe(false);
    expect(isGameMessage({ ...sync, entries: Array.from({ length: 21 }, () => entry) })).toBe(false);
  });

  it('binds relayed guest claims to the established player id', () => {
    expect(messageBelongsToPlayer(state(), 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'abc', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 1 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'spoof', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 1 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'abc', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'spoof', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'abc', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'spoof', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(false);
  });

  it('keeps death transitions host-authored even when the victim id matches a guest', () => {
    const death = {
      type: 'death' as const,
      killer: 'enemy',
      victim: 'abc',
      cause: { kind: 'gun' as const, weapon: 'carbine' as const },
      nonce: 2,
    };
    expect(isGameMessage(death)).toBe(true);
    expect(messageBelongsToPlayer(death, 'abc')).toBe(true);
    expect(isHostAuthorityMessage(death)).toBe(true);
    expect(messageBelongsToPlayer({ ...death, killer: 'abc', victim: 'other' }, 'abc')).toBe(false);
  });

  it('binds chat submissions to the guest and accepts only bounded host-authoritative history', () => {
    const entry = {
      id: 41,
      senderId: 'abc',
      senderName: 'Tester',
      text: 'Ready for the next round?',
      sentAtHostTimeMs: 2_500,
    };
    const submit: ChatSubmitMessage = {
      type: 'chat-submit' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'abc',
      text: entry.text,
      nonce: 40,
    };
    const message: ChatMessage = {
      type: 'chat-message' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host',
      entry,
      nonce: entry.id,
    };
    const history: ChatHistoryMessage = {
      type: 'chat-history' as const,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host',
      forPlayerId: 'abc',
      entries: [entry],
      nonce: 42,
    };

    expect(isGameMessage(submit)).toBe(true);
    expect(messageBelongsToPlayer(submit, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ ...submit, by: 'spoof' }, 'abc')).toBe(false);
    expect(isGameMessage({ ...submit, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
    expect(isGameMessage({ ...submit, text: ' trailing ' })).toBe(false);
    expect(isGameMessage(message)).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(true);
    expect(isGameMessage(history)).toBe(true);
    expect(isHostAuthorityMessage(history)).toBe(true);
    expect(isGameMessage({ ...history, entries: [entry, entry] })).toBe(false);
    expect(isGameMessage({ ...history, forPlayerId: '' })).toBe(false);
  });

  it('validates bounded lobby control traffic and identifies host authority', () => {
    const join = { type: 'lobby-join', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, playerId: 'abc', connectionEpoch: 'connection_epoch_abc', name: 'Tester', requestedTeam: 0, resumeToken: '12345678-1234-1234-1234-123456789abc', nonce: 1 } as const;
    const lobbyState = {
      type: 'lobby-state' as const,
      by: 'host',
      snapshot: {
        revision: 2,
        hostId: 'host',
        phase: 'waiting' as const,
        config: { mode: 'tdm' as const, capacity: 4 as const, hostedBotCount: 0 as const, autoBalance: true, arenaId: 'atomic-acres' as const, durationMs: 300_000, scoreLimit: null },
        members: [{ id: 'host', name: 'Host', team: 0 as const, ready: true, connected: true, pingMs: 0, dhv: 10 as const }],
        scores: [{ id: 'host', kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 }],
        snapshotHostTimeMs: 1_000,
        activeAtHostTimeMs: null,
        activeAtEpochMs: null,
        matchClock: null,
        testBayDoor: null,
      },
      nonce: 2,
    };
    expect(isGameMessage(join)).toBe(true);
    expect(isGameMessage({ ...join, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION - 1 })).toBe(false);
    expect(messageBelongsToPlayer(join, 'abc')).toBe(true);
    expect(isGameMessage({ ...join, resumeToken: 'short' })).toBe(false);
    expect(isGameMessage(lobbyState)).toBe(true);
    expect(isGameMessage({ type: 'lobby-start', by: 'host', activeAtHostTimeMs: 4_000, activeAtEpochMs: 1_700_000_004_000, hostSentTimeMs: 1_000, revision: 3, nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'lobby-start', by: 'host', activeAtHostTimeMs: -25_000, activeAtEpochMs: 1_700_000_004_000, hostSentTimeMs: 1_000, revision: 3, nonce: 5 })).toBe(true);
    expect(isGameMessage({
      ...lobbyState,
      snapshot: { ...lobbyState.snapshot, phase: 'active', activeAtHostTimeMs: -25_000, activeAtEpochMs: 1_700_000_004_000 },
    })).toBe(true);
    expect(isGameMessage({ type: 'lobby-start', by: 'host', activeAtHostTimeMs: -900_001, activeAtEpochMs: 1_700_000_004_000, hostSentTimeMs: 1_000, revision: 3, nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'lobby-start', by: 'host', activeAtHostTimeMs: 11_001, activeAtEpochMs: 1_700_000_004_000, hostSentTimeMs: 1_000, revision: 3, nonce: 7 })).toBe(false);
    expect(isGameMessage({
      ...lobbyState,
      snapshot: { ...lobbyState.snapshot, phase: 'countdown', activeAtHostTimeMs: 11_001, activeAtEpochMs: 1_700_000_004_000 },
    })).toBe(false);
    expect(isGameMessage({ type: 'lobby-handicap', by: 'host', dhv: 'X', nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'lobby-handicap', by: 'host', dhv: 9, nonce: 3 })).toBe(false);
    expect(isHostAuthorityMessage(lobbyState)).toBe(true);
    expect(isStateTrafficMessage(state())).toBe(true);
    expect(isStateTrafficMessage({
      type: 'railgun-state',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: 'host',
      state: advanceRailgunAuthority(createRailgunAuthorityState('atomic-acres', 0, 0), RAILGUN_SPAWN_DELAY_MS).state,
      nonce: 5,
    })).toBe(true);
    expect(isStateTrafficMessage(lobbyState)).toBe(false);
    expect(isGameMessage({ ...lobbyState, snapshot: { ...lobbyState.snapshot, config: { ...lobbyState.snapshot.config, capacity: 5 } } })).toBe(false);
  });

  it('routes strict interactive-world intents and snapshots through protocol v7', () => {
    const runtime = new InteractiveWorldRuntime(
      'atomic-acres',
      9,
      [shedPlacementsForArena('atomic-acres')[0]!],
      true,
    );
    const intent = {
      type: 'shed-interact-request', schemaVersion: 1, by: 'guest-a', arenaId: 'atomic-acres',
      placementId: 'atomic-shed-west', matchEpoch: 9, lifeId: 2, actionSequence: 1, nonce: 22,
    } as const;
    const snapshot = {
      type: 'interactive-world-snapshot', schemaVersion: 1, by: 'host-a',
      envelope: runtime.stateEnvelope(), nonce: 23,
    } as const;
    expect(isGameMessage(intent)).toBe(true);
    expect(messageBelongsToPlayer(intent, 'guest-a')).toBe(true);
    expect(isHostAuthorityMessage(intent)).toBe(false);
    expect(isGameMessage(snapshot)).toBe(true);
    expect(isHostAuthorityMessage(snapshot)).toBe(true);
    expect(isStateTrafficMessage(snapshot)).toBe(true);
    expect(isGameMessage({ ...intent, clientAngleQ: 4_000 })).toBe(false);
    expect(isGameMessage({ ...snapshot, envelope: { ...snapshot.envelope, hash: '0'.repeat(64) } })).toBe(false);
    runtime.dispose();
  });
});

describe('callsign sanitizing', () => {
  it('removes markup and trims to 16 characters', () => {
    expect(sanitizeName('<b>Dave</b>_Operator_123')).toBe('bDaveb_Operator_');
  });

  it('creates a safe fallback when nothing remains', () => {
    configureRuntimeRandom('callsign-test');
    const first = sanitizeName('🔥🔥');
    configureRuntimeRandom('callsign-test');
    expect(sanitizeName('🔥🔥')).toBe(first);
    expect(first).toMatch(/^Player[1-9][0-9]{2}$/);
  });
});
