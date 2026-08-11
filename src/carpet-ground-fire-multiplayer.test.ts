import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE,
  FLAMETHROWER_GROUND_FIRE_DURATION_MS,
  FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
  FlamethrowerGroundFirePool,
} from './flamethrower-stream-system';
import {
  CARPET_GROUND_FIRE_AUTHORITY_CAPACITY,
  CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
  MAX_CONCURRENT_CARPET_BOMBER_ACTIVATIONS,
  CarpetGroundFireGuestPresentationAdmission,
  carpetGroundFireStateChunks,
} from './carpet-ground-fire-multiplayer';
import {
  CARPET_BOMBER_IMPACT_COUNT,
  MAX_ACTIVE_SUPPORT_ENTITIES,
  HostKillstreakRuntime,
  type KillstreakImpactEvent,
  type KillstreakTarget,
} from './killstreak-runtime';
import { isKillstreakProtocolMessage } from './killstreak-protocol';
import { applyAuthoritativeRemoteDamage, createRemoteHealthAuthorityState } from './remote-health-authority';

const impact = (overrides: Partial<KillstreakImpactEvent> = {}): KillstreakImpactEvent => {
  const base: KillstreakImpactEvent = {
    activationId: 'ks-activation-73-1',
    source: 'carpet-bomber',
    ordinal: 4,
    phase: 'impact',
    position: [2, 0, 3],
    impactAtMs: 1_000,
    atMs: 1_000,
  };
  return Object.freeze({ ...base, ...overrides }) as KillstreakImpactEvent;
};

describe('Pass 70 hosted Carpet Bomber residual fire', () => {
  it('applies exactly 10 DPS for five seconds to an in-radius hosted human through canonical receipts', () => {
    const runtime = new HostKillstreakRuntime(73);
    runtime.registerActor('guest-owner', 1, 2, parseKillstreakLoadout({
      schemaVersion: 1,
      slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
    }));
    const targets: KillstreakTarget[] = [
      { id: 'outside-guest', kind: 'player', team: 0, lifeId: 8, alive: true, position: [4, 0, 3] },
      { id: 'inside-bot', kind: 'bot', team: 0, lifeId: 3, alive: true, position: [2, 0, 3] },
      { id: 'hosted-guest', kind: 'player', team: 1, lifeId: 5, alive: true, position: [2.5, 0, 3] },
      { id: 'dead-guest', kind: 'player', team: 0, lifeId: 6, alive: false, position: [2, 0, 3] },
    ];
    let health = createRemoteHealthAuthorityState(true, 1_000);
    const events = [];
    for (let pulseIndex = 0; pulseIndex < 10; pulseIndex += 1) {
      const atMs = 1_000 + pulseIndex * FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS;
      const [event] = runtime.carpetGroundFireDamageEvents({
        activationId: 'ks-activation-73-1',
        ownerId: 'guest-owner',
        point: [2, 0, 3],
        radiusM: 1.8,
        damage: FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE,
        atMs,
      }, targets);
      expect(event).toMatchObject({
        resultId: `ks-result-73-${pulseIndex + 1}`,
        source: 'carpet-bomber',
        ownerId: 'guest-owner',
        targetId: 'hosted-guest',
        targetLifeId: 5,
        damage: 5,
        atMs,
      });
      const applied = applyAuthoritativeRemoteDamage(health, event!.damage, event!.atMs);
      expect(applied.applied).toBe(true);
      health = applied.state;
      events.push(event!);
    }
    expect(events).toHaveLength(10);
    expect(events.reduce((total, event) => total + event.damage, 0)).toBe(50);
    expect(health.hp).toBe(50);
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-damage-result',
      by: 'host',
      matchEpoch: 73,
      revision: 1,
      events,
      impacts: [],
      nonce: 99,
    })).toBe(true);
  });

  it('admits one guest visual per host impact while never admitting drops or replay extensions', () => {
    const admission = new CarpetGroundFireGuestPresentationAdmission(2);
    expect(admission.admit(73, impact())).toBe(true);
    expect(admission.admit(73, impact())).toBe(false);
    expect(admission.admit(73, impact({ phase: 'drop', atMs: 580 }))).toBe(false);
    expect(admission.admit(73, impact({ ordinal: 5 }))).toBe(true);
    expect(admission.admit(74, impact())).toBe(true);
    expect(admission.admit(73, impact())).toBe(true);
    admission.clear();
    expect(admission.admit(73, impact())).toBe(true);
  });

  it('reserves independent authority for every admitted Carpet impact even when Flamethrower is saturated', () => {
    expect(MAX_CONCURRENT_CARPET_BOMBER_ACTIVATIONS).toBe(MAX_ACTIVE_SUPPORT_ENTITIES);
    expect(CARPET_GROUND_FIRE_AUTHORITY_CAPACITY).toBe(
      MAX_ACTIVE_SUPPORT_ENTITIES * CARPET_BOMBER_IMPACT_COUNT,
    );
    const flamethrowerPool = new FlamethrowerGroundFirePool(24);
    const carpetPool = new FlamethrowerGroundFirePool(CARPET_GROUND_FIRE_AUTHORITY_CAPACITY);
    for (let index = 0; index < 24; index += 1) {
      expect(flamethrowerPool.ignite({
        ownerId: 'flame-owner', ownerTeam: 0, point: new THREE.Vector3(index, 0, 0),
        actionNonce: index + 1, now: 1_000,
        durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
        pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
      })).toBe('created');
    }
    expect(flamethrowerPool.ignite({
      ownerId: 'flame-owner', ownerTeam: 0, point: new THREE.Vector3(99, 0, 0),
      actionNonce: 25, now: 1_000,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
    })).toBe('exhausted');

    for (let activation = 0; activation < 2; activation += 1) {
      for (let ordinal = 0; ordinal < CARPET_BOMBER_IMPACT_COUNT; ordinal += 1) {
        expect(carpetPool.ignite({
          ownerId: `carpet-owner-${activation}`, ownerTeam: activation as 0 | 1,
          point: new THREE.Vector3(ordinal, 0, activation * 4),
          actionNonce: activation * CARPET_BOMBER_IMPACT_COUNT + ordinal + 1,
          now: 1_000,
          durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
          pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
          damageSource: 'carpet-bomber',
          activationId: `ks-capacity-${activation}`,
          impactOrdinal: ordinal,
        })).toBe('created');
      }
    }
    expect(flamethrowerPool.activeCount()).toBe(24);
    expect(carpetPool.activeCount()).toBe(40);

    for (let activation = 2; activation < MAX_CONCURRENT_CARPET_BOMBER_ACTIVATIONS; activation += 1) {
      for (let ordinal = 0; ordinal < CARPET_BOMBER_IMPACT_COUNT; ordinal += 1) {
        expect(carpetPool.ignite({
          ownerId: `carpet-owner-${activation}`, ownerTeam: activation % 2 as 0 | 1,
          point: new THREE.Vector3(ordinal, 0, activation * 4),
          actionNonce: activation * CARPET_BOMBER_IMPACT_COUNT + ordinal + 1,
          now: 1_000,
          durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
          pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
          damageSource: 'carpet-bomber',
          activationId: `ks-capacity-${activation}`,
          impactOrdinal: ordinal,
        })).toBe('created');
      }
    }
    expect(carpetPool.activeCount()).toBe(CARPET_GROUND_FIRE_AUTHORITY_CAPACITY);
    expect(carpetPool.ignite({
      ownerId: 'overflow-owner', ownerTeam: 0, point: new THREE.Vector3(),
      actionNonce: CARPET_GROUND_FIRE_AUTHORITY_CAPACITY + 1, now: 1_000,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
      damageSource: 'carpet-bomber', activationId: 'ks-overflow-activation', impactOrdinal: 0,
    })).toBe('exhausted');
  });

  it('deduplicates Carpet authority identity so a replay cannot double the ten damage pulses', () => {
    const pool = new FlamethrowerGroundFirePool(1);
    const ignition = {
      ownerId: 'guest-owner', ownerTeam: 1 as const, point: new THREE.Vector3(2, 0, 3),
      actionNonce: 17, now: 1_000,
      durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
      pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
      damageSource: 'carpet-bomber' as const,
      activationId: 'ks-replay-activation', impactOrdinal: 4,
    };
    expect(pool.ignite(ignition)).toBe('created');
    expect(pool.ignite({ ...ignition, actionNonce: 18 })).toBe('duplicate');
    let pulses = 0;
    for (let now = 1_000; now <= 5_500; now += FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS) {
      pool.update(now, FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS, () => { pulses += 1; });
    }
    expect(pulses).toBe(10);
  });

  it('chunks active rejoin state at 64 and admits exact remaining visual lifetime once', () => {
    const pool = new FlamethrowerGroundFirePool(130);
    for (let ordinal = 0; ordinal < 130; ordinal += 1) {
      expect(pool.ignite({
        ownerId: 'guest-owner', ownerTeam: 1, point: new THREE.Vector3(ordinal, 0, 3),
        actionNonce: ordinal + 1, now: 1_000,
        durationMs: FLAMETHROWER_GROUND_FIRE_DURATION_MS,
        pulseIntervalMs: FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
        damageSource: 'carpet-bomber', activationId: `ks-rejoin-${Math.floor(ordinal / 20)}`,
        impactOrdinal: ordinal % CARPET_BOMBER_IMPACT_COUNT,
      })).toBe('created');
    }
    const snapshots = pool.carpetPresentationSnapshots(2_500);
    const chunks = carpetGroundFireStateChunks(91, snapshots);
    expect(chunks.map((chunk) => chunk.fires.length)).toEqual([64, 64, 2]);
    expect(chunks.every((chunk) => chunk.fires.length <= CARPET_GROUND_FIRE_STATE_CHUNK_SIZE)).toBe(true);
    for (const chunk of chunks) {
      expect(isKillstreakProtocolMessage({
        type: 'killstreak-carpet-fire-state', by: 'host-player', forPlayerId: 'guest-owner',
        matchEpoch: 73, ...chunk, nonce: chunk.chunkIndex + 1,
      })).toBe(true);
    }
    const firstMessage = {
      type: 'killstreak-carpet-fire-state' as const,
      by: 'host-player', forPlayerId: 'guest-owner', matchEpoch: 73,
      ...chunks[0]!, nonce: 1,
    };
    expect(isKillstreakProtocolMessage({
      ...firstMessage,
      fires: [...firstMessage.fires, firstMessage.fires[0]],
    })).toBe(false);
    expect(isKillstreakProtocolMessage({ ...firstMessage, chunkCount: 4 })).toBe(false);
    const [emptyChunk] = carpetGroundFireStateChunks(92, []);
    expect(emptyChunk).toMatchObject({ chunkIndex: 0, chunkCount: 1, totalFires: 0, fires: [] });
    expect(isKillstreakProtocolMessage({
      type: 'killstreak-carpet-fire-state', by: 'host-player', forPlayerId: 'guest-owner',
      matchEpoch: 73, ...emptyChunk!, nonce: 4,
    })).toBe(true);

    const admission = new CarpetGroundFireGuestPresentationAdmission();
    expect(admission.admitSnapshot(73, snapshots[0]!, 2_500)).toBe(3_500);
    expect(admission.admitSnapshot(73, snapshots[0]!, 2_500)).toBeNull();
    expect(admission.admit(73, impact({
      activationId: snapshots[0]!.activationId,
      ordinal: snapshots[0]!.impactOrdinal,
    }))).toBe(false);
    const nearExpiry = new CarpetGroundFireGuestPresentationAdmission();
    expect(nearExpiry.admitSnapshot(73, snapshots[0]!, 5_999)).toBe(1);
    expect(new CarpetGroundFireGuestPresentationAdmission()
      .admitSnapshot(73, snapshots[0]!, 6_000)).toBeNull();
    expect(pool.carpetPresentationSnapshots(6_000)).toEqual([]);
  });

  it('wires host-only remote authority and guest-only presentation without touching local/bot lanes', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const pulseStart = main.indexOf('function applyFlamethrowerGroundFirePulse(');
    const pulseEnd = main.indexOf('\nfunction updateFlamethrowerGroundFires(', pulseStart);
    const pulse = main.slice(pulseStart, pulseEnd);
    expect(pulse).toContain("network.role === 'host' && fire.damageSource === 'carpet-bomber'");
    expect(pulse).toContain('killstreakRuntime.carpetGroundFireDamageEvents(');
    expect(pulse).toContain('applyKillstreakDamageEvent(event)');
    expect(pulse).toContain('pendingCarpetGroundFireDamageEvents.push(applied)');
    expect(pulse).toContain('applyDamage(FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE');
    expect(pulse).toContain('applyBotDamage(bot, FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE');

    const resultStart = main.indexOf("if (message.type === 'killstreak-damage-result') {");
    const resultEnd = main.indexOf("\n  if (message.type === 'railgun-state')", resultStart);
    const result = main.slice(resultStart, resultEnd);
    expect(result).toContain('carpetGroundFireGuestPresentation.admit(message.matchEpoch, impact)');
    expect(result).toContain('flamethrowerStreamPresentation.igniteGround(point, presentedAt)');
    expect(result).not.toContain('flamethrowerGroundFires.ignite(');

    const stateStart = main.indexOf("if (message.type === 'killstreak-carpet-fire-state') {");
    const stateEnd = main.indexOf("\n  if (message.type === 'killstreak-damage-result')", stateStart);
    const state = main.slice(stateStart, stateEnd);
    expect(state).toContain('carpetGroundFireGuestPresentation.admitSnapshot(');
    expect(state).toContain('flamethrowerStreamPresentation.igniteGround(');
    expect(state).not.toContain('carpetGroundFires.ignite(');
    expect(state).not.toContain('applyKillstreakDamageEvent(');

    const impactAuthorityStart = main.indexOf("if (impact.source === 'carpet-bomber') {");
    const impactAuthorityEnd = main.indexOf('\n      } else {', impactAuthorityStart);
    const impactAuthority = main.slice(impactAuthorityStart, impactAuthorityEnd);
    expect(impactAuthority).toContain('carpetGroundFires.ignite({');
    expect(impactAuthority).not.toContain('flamethrowerGroundFires.ignite({');
    expect(impactAuthority).toContain("recordMatchDiagnostic('carpet-ground-fire-authority', 'rejected'");

    const resumeStart = main.indexOf('function sendGuestResumeAuthority(');
    const resumeEnd = main.indexOf('\nfunction acceptGuestResumeAck(', resumeStart);
    expect(main.slice(resumeStart, resumeEnd)).toContain('sendCarpetGroundFirePresentationSnapshot(playerId');
    expect(main).toContain('Active support entities deliberately terminate across host replacement');
  });
});
