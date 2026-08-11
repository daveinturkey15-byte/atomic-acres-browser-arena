import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE,
  FLAMETHROWER_GROUND_FIRE_PULSE_INTERVAL_MS,
} from './flamethrower-stream-system';
import { CarpetGroundFireGuestPresentationAdmission } from './carpet-ground-fire-multiplayer';
import { HostKillstreakRuntime, type KillstreakImpactEvent, type KillstreakTarget } from './killstreak-runtime';
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
  });
});
