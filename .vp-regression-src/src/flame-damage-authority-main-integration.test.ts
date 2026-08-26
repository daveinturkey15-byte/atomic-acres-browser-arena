import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  FLAMETHROWER_GROUND_FIRE_DURATION_MS,
} from './flamethrower-stream-system';
import {
  CARPET_BOMBER_MAX_DAMAGE,
} from './killstreak-runtime';
import { FLARE_PROJECTILE_EFFECT } from './special-weapon-effects';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function slice(startNeedle: string, endNeedle: string): string {
  const start = main.indexOf(startNeedle);
  const end = main.indexOf(endNeedle, start + startNeedle.length);
  expect(start, `missing ${startNeedle}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endNeedle}`).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('HF-279 flame authority integration', () => {
  it('does not drift direct Flare, Flamethrower stream or Carpet blast damage', () => {
    expect(FLARE_PROJECTILE_EFFECT.directDamage).toBe(42);
    expect(WEAPON_CATALOG.find(({ id }) => id === 'flamethrower')?.damage.base).toBe(81);
    expect(CARPET_BOMBER_MAX_DAMAGE).toBe(240);
  });

  it('keeps Flare direct impact hostile-only while admitting self, friendly and enemy burn targets', () => {
    const targetView = slice('function flareTargetView(', '\nfunction clearFlareTargetSnapshots(');
    expect(targetView).toContain("targetPolicy === 'hostile-direct' && entry.target.id === ownerId");
    expect(targetView).toContain("targetPolicy === 'hostile-direct'\n      ? areCombatantsHostile(");
    expect(targetView).toContain(": flameDamageAllowsTarget('flare-gun-burn'");
    expect(targetView).toContain('flareTargetView(flareDirectTargetViews, ownerId, ownerTeam, \'hostile-direct\')');
    expect(targetView).toContain('flareTargetView(flareBurnTargetViews, ownerId, ownerTeam, \'all-burn\')');

    const callbacks = slice('const flareProjectileCallbacks:', '\nfunction updateFlareProjectiles(');
    expect(callbacks).toContain('directHitTargets: flareDirectHitTargets');
    expect(callbacks).toContain('burnTargets: flareBurnTargets');
  });

  it('makes ground-fire HP host/offline-owned and keeps guests presentation-only', () => {
    const pulse = slice('function applyFlamethrowerGroundFirePulse(', '\nfunction updateFlamethrowerGroundFires(');
    const guestGuard = pulse.indexOf("if (network.role === 'client') return;");
    expect(guestGuard).toBeGreaterThan(0);
    for (const authorityMutation of [
      'applyDamage(FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE',
      'applyBotDamage(bot, FLAMETHROWER_GROUND_FIRE_DAMAGE_PER_PULSE',
      'killstreakRuntime.carpetGroundFireDamageEvents(',
      'sendAuthoritativeHit({',
    ]) {
      expect(pulse.indexOf(authorityMutation)).toBeGreaterThan(guestGuard);
    }
    expect(pulse).toContain("'flamethrower-ground-fire',\n          fire.ownerId");
    expect(pulse).toContain("network.role === 'host' && fire.damageSource === 'carpet-bomber'");
    expect(pulse).toContain("network.role === 'host' && fire.damageSource === 'flamethrower'");
    expect(pulse).toContain("ownerKind: ownerBot ? 'hosted-bot' : 'human'");
    expect(pulse).toContain("authority.route === 'hosted-bot-result'");
    expect(pulse).toContain('applyHostedBotDamageToRemote(');
    expect(pulse).toContain("'flamethrower-stream',\n            'flamethrower'");

    const localFire = slice('function tryFire(now: number): void {', '\nfunction throwGrenade(): void {');
    expect(localFire).toContain('flamethrowerStreamPresentation.igniteGround(authoritativeEnd, now)');
    expect(localFire).toContain("if (network.role !== 'client') {\n        flamethrowerGroundFires.ignite({");
    expect(localFire).toContain("if (player.weapon === 'flamethrower'");
    expect(localFire).toContain('matchEpoch: interactiveWorldMatchEpoch');

    const remoteFire = slice('function resolveAuthoritativeShot(request:', '\nfunction acceptAuthoritativeShotResult(');
    const consumed = remoteFire.indexOf("const consumption = consumeTimedMapWeaponShot(timedMapWeaponStates.flamethrower");
    const ignited = remoteFire.indexOf('flamethrowerGroundFires.ignite({', consumed);
    expect(consumed).toBeGreaterThan(0);
    expect(ignited).toBeGreaterThan(consumed);
  });

  it('retains the admitted residual action through the last pulse without target-deduping canonical receipts', () => {
    const lifetime = slice('function admittedShotActionLifetimeMs(', '\nconst createRailgunClaimAudit');
    expect(lifetime).toContain("weapon === 'flamethrower'");
    expect(lifetime).toContain('FLAMETHROWER_GROUND_FIRE_DURATION_MS + 1_000');
    expect(FLAMETHROWER_GROUND_FIRE_DURATION_MS + 1_000).toBe(6_000);
    expect(lifetime).toContain('action.matchEpoch !== interactiveWorldMatchEpoch');

    const incomingHit = slice("if (message.type === 'hit'", "\n  if (message.type === 'death'");
    const clientStart = incomingHit.indexOf("if (network.role === 'client') {");
    const clientEnd = incomingHit.indexOf("} else if (message.hostAuthority !== undefined)", clientStart);
    const canonicalClient = incomingHit.slice(clientStart, clientEnd);
    expect(canonicalClient).toContain('admitHostCanonicalHitResult(message.hostAuthority');
    expect(canonicalClient).toContain('processedNonces.add(message.nonce)');
    expect(canonicalClient).not.toContain('action.targets');
    expect(canonicalClient).not.toContain('message.actionNonce) return');
  });
});
