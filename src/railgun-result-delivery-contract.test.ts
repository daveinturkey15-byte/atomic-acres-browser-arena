import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('railgun result delivery contract', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('deduplicates host results before health or hit feedback is applied', () => {
    const acceptance = main.slice(main.indexOf('function acceptRailgunShotResult('), main.indexOf('function tryFireRailgun('));
    const duplicateGuard = acceptance.indexOf('processedRailgunShotResults.has(resultKey)');
    const beamPresentation = acceptance.indexOf('presentAuthoritativeRailgunResult(message');
    const healthApply = acceptance.indexOf('reconcileLocalAuthoritativeHealth(');
    const hitPresentation = acceptance.indexOf('presentLocalRailgunFeedback(message.outcomes)');
    expect(acceptance).toContain('`${message.by}:${message.forPlayerId}:${message.generation}:${message.shotId}`');
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(beamPresentation).toBeGreaterThan(duplicateGuard);
    expect(healthApply).toBeGreaterThan(duplicateGuard);
    expect(hitPresentation).toBeGreaterThan(duplicateGuard);
    expect(acceptance).toContain('while (processedRailgunShotResults.size > 512)');
  });

  it('never creates a speculative client beam and routes every accepted host path through the result hook', () => {
    const presentationHook = main.slice(main.indexOf('function presentAuthoritativeRailgunResult('), main.indexOf('function railgunResult('));
    expect(presentationHook).toContain("local ? 'shooter' : 'peer'");
    const firing = main.slice(main.indexOf('function tryFireRailgun('), main.indexOf('function railgunThermalContacts('));
    const clientPath = firing.slice(0, firing.indexOf('const fired = fireRailgun('));
    expect(clientPath).toContain('presentLocalRailgunTrigger()');
    expect(clientPath).not.toContain('railgunPresentation.');
    expect(clientPath).not.toContain('presentAuthoritativeRailgunResult(');
    expect(firing).toContain('const result = railgunResult(');
    expect(firing).toContain('presentAuthoritativeRailgunResult(result, true)');

    const remoteResolution = main.slice(main.indexOf('function resolveRailgunShot('), main.indexOf('function acceptRailgunShotResult('));
    expect(remoteResolution.match(/railgunResult\([^;]+\[\], null\)/g)).toHaveLength(3);
    expect(remoteResolution).toContain('createRailgunBeamAuthority(');
    expect(remoteResolution).toContain('admission.targets.flatMap(');
    expect(remoteResolution).toContain('network.send(result)');
    expect(remoteResolution).toContain('presentAuthoritativeRailgunResult(result, false)');
    expect(main).not.toContain('railgunPresentation.presentBeam(');
  });

  it('applies every ordered admission at canonical 50 requested damage and keeps result feedback presentation-only', () => {
    const selection = main.slice(main.indexOf('function selectRailgunTargets('), main.indexOf('function applyAuthoritativeRailgunDamage('));
    expect(selection).toContain('admitRailgunTargets(');
    expect(selection).toContain('alive: target.alive');
    expect(selection).toContain('hostile: target.hostile');

    const damage = main.slice(main.indexOf('function applyAuthoritativeRailgunDamage('), main.indexOf('function presentLocalRailgunFeedback('));
    expect(damage.match(/damageRequested: RAILGUN_DAMAGE/g)).toHaveLength(3);
    expect(damage).toContain('damageApplied: damage');
    expect(damage).toContain('damageApplied: applied.damageApplied');
    expect(damage).toContain("applyBotDamage(\n      bot,\n      RAILGUN_DAMAGE,\n      'body'");
    expect(damage).not.toContain('outgoingDamage(');
    expect(damage).not.toContain('overdriveDamageMultiplier(');
    expect(damage).not.toContain('handicapOutgoingDamage(');

    const feedback = main.slice(main.indexOf('function presentLocalRailgunFeedback('), main.indexOf('function presentLocalRailgunTrigger('));
    expect(feedback).toContain('outcome.damageApplied');
    expect(feedback).not.toContain('processDeath(');
    expect(feedback).not.toContain('audio.kill(');
    expect(feedback).not.toContain('player.kills');
  });

  it('records durable Railgun death attribution at the exact user-facing elimination feed boundary', () => {
    const death = main.slice(main.indexOf('function processDeath('), main.indexOf('function removeRemote('));
    const railgunAudit = death.indexOf("message.cause.kind === 'gun' && message.cause.weapon === 'railgun'");
    const feed = death.indexOf('addFeed(eliminationFeedText');
    expect(railgunAudit).toBeGreaterThan(-1);
    expect(feed).toBeGreaterThan(railgunAudit);
    expect(death).toContain('killerId: message.killer, victimId: message.victim, text: eliminationFeedText');
  });

  it('resets client result history at both match initialization and full mode reset', () => {
    expect(main.match(/processedRailgunShotResults\.clear\(\)/g)).toHaveLength(3);
  });
});
