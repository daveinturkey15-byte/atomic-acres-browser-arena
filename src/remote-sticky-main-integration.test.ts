import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const network = readFileSync(new URL('./network.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = main.indexOf(startMarker);
  const end = main.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('host-canonical sticky authority integration', () => {
  it('never uses the sender stuck bit as damage/radius authority', () => {
    const incomingHit = block("if (message.type === 'hit'", "if (message.type === 'death'",);
    expect(incomingHit).not.toContain('remoteExplosiveHitMaximumDistance(source, !!message.stuck)');
    expect(incomingHit).not.toContain('maximumRemoteExplosiveBaseDamage(source, distance, targetStance, grenade, !!message.stuck)');
    expect(incomingHit).toContain('const canonicalOriginTuple = hostVerifiedRecord?.detonationOrigin ?? originTuple;');
    expect(incomingHit).toContain('remoteExplosiveHitMaximumDistance(source, verifiedStuck)');
    expect(incomingHit).toContain('maximumRemoteExplosiveBaseDamage(source, distance, targetStance, grenade, verifiedStuck)');
    expect(incomingHit).toContain('explosionOrigin: canonicalOriginTuple');
    expect(incomingHit).toContain('const canonicalBaseDamage = hostVerifiedRecord ? maximumBaseDamage : message.damage;');
  });

  it('requires a host envelope on clients and strips/rebuilds untrusted authority before forwarding', () => {
    const incomingHit = block("if (message.type === 'hit'", "if (message.type === 'death'",);
    expect(incomingHit).toContain("if (network.role === 'client')");
    expect(incomingHit).toContain('admitHostCanonicalHitResult(message.hostAuthority');
    expect(incomingHit).toContain('reconcileLocalAuthoritativeHealth(');
    expect(incomingHit.indexOf('reconcileLocalAuthoritativeHealth(')).toBeLessThan(incomingHit.indexOf('const rewoundPose = rewindCombatantPose('));

    const send = block('function sendAuthoritativeHit(', '\nfunction makeShotResult(');
    expect(send).toContain('const { hostAuthority: _untrustedHostAuthority, stuck: _untrustedStuck, ...untrustedMessage } = message;');
    expect(send).toContain('hostAuthority: {');
    expect(send).toContain('targetLifeId: remote.continuity');
    expect(send).toContain('appliedDamage: result.damageApplied');
    expect(send).toContain('resultingHealth: result.healthAfter');
    expect(send).toContain('stickyAttachment: attachment ? verifiedStickyAttachment(attachment) : null');
  });

  it('retains one sealed target life for all splash victims and preserves posthumous owner actions', () => {
    const verification = block('function hostStickyVerificationForAction(', '\nfunction hostStickyVerification(');
    expect(verification).toContain('stickyAttachmentRecordForAction(');
    expect(verification).not.toContain('player.alive');
    expect(verification).not.toContain('remote.snapshot.hp');
    const explosion = block('function explodeGrenade(', '\nfunction grenadeDetonatesOnFirstImpact(');
    expect(explosion).toContain('liveAttachedTargetFound = explosiveBoltTargetBuffer.findIndex(attachedTargetId, attachedTargetLifeId) >= 0;');
    expect(explosion).toContain('currentAttachmentTarget: { id: attachedTargetId!, lifeId: attachedTargetLifeId! }');
    const death = block('function processDeath(', '\nfunction removeRemote(');
    expect(death).toContain('recordRemoteGrenadeDeath(victimGrenadeAuthority)');
    expect(main).toContain('recordRemoteGrenadeRespawn(');
  });

  it('queues reordered Semtex claims after timing admission and replays only after receiver seal', () => {
    expect(main).toMatch(/stickyTimingAlreadyAdmitted[\s\S]+admitIncomingCombatTiming\(message\)[\s\S]+queuePendingHostStickyHit/);
    const seal = block('function sealReceiverStickyDetonation(', '\nfunction interactiveWorldLineOfSight(');
    expect(seal).toContain('flushPendingStickyHits(');
    expect(main).toContain("if (result.source === 'explosive-crossbow') return false;");
    expect(main).toContain("if (network.role === 'host') return;");
  });

  it('keeps the duplicate-delivery QA proof on one target life', () => {
    const qaSticky = block('function authorStickyEffectForQa(', '\nfunction replayStickyEffectForQa(');
    expect(qaSticky).toContain('const qaDamage = Math.min(35, stuckDamage);');
    expect(qaSticky).toContain('damage: qaDamage');
    expect(qaSticky).toContain('lastDamageAtHostTimeMs: now + 300_000');
  });

  it('does not auto-relay guest window claims and emits only canonical host window authority', () => {
    expect(network).toContain("payload.type === 'overdrive-claim' || payload.type === 'hit' || payload.type === 'window-break'");
    const windows = block('function acceptRemoteWindowBreak(', '\nfunction resetBreakableWindows(');
    expect(windows).toContain("message.hostAuthority.hostId !== privateLobbySnapshot?.hostId");
    expect(windows).toContain('const canonicalOriginTuple = hostVerifiedRecord?.detonationOrigin ?? message.origin;');
    expect(windows).toContain('semtexBlastRadiusM(verifiedStuck)');
    expect(windows).toContain('network.send(canonicalHostWindowBreak(');
  });
});
