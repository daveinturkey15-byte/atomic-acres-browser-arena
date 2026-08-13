import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import { WEAPON_GLASS_BREAK_CATALOG } from './weapon-glass-break-policy';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('catalog-wide projectile glass integration', () => {
  it('keeps every canonical weapon in an explicit glass-break route', () => {
    expect(WEAPON_GLASS_BREAK_CATALOG.map(({ weapon }) => weapon))
      .toEqual(WEAPON_CATALOG.map(({ id }) => id));
    expect(WEAPON_GLASS_BREAK_CATALOG.filter(({ timing }) => timing === 'detonation').map(({ weapon }) => weapon))
      .toEqual(['explosive-crossbow']);
    expect(WEAPON_GLASS_BREAK_CATALOG.filter(({ timing }) => timing === 'impact').map(({ weapon }) => weapon))
      .toHaveLength(WEAPON_CATALOG.length - 1);
    const fire = block('function tryFire(', '\nfunction castShot(');
    expect(fire).toContain('const glassBreakPolicy = weaponGlassBreakPolicy(player.weapon);');
    expect(fire).toContain('invalid projectile glass-break timing');
    const hostShot = block('function resolveAuthoritativeShot(', '\nfunction acceptAuthoritativeShotResult(');
    expect(hostShot).toContain('weaponGlassBreakPolicy(request.weapon);');
    const remoteShot = block('function renderRemoteShot(', '\nfunction acceptRemotePickup(');
    expect(remoteShot).toContain('weaponGlassBreakPolicy(message.weapon);');
  });

  it('carries the exact flare pane from collision to authoritative impact breach', () => {
    const activeGlass = block('function activeGlassDynamicColliders(', '\nfunction activeWorldColliders(');
    expect(activeGlass).toContain('activeGlassColliderWindowIds.set(colliderBounds, pane.id);');
    expect(activeGlass).toContain('bounds: colliderBounds,');

    const collision = block('const flareProjectileCallbacks:', '\nfunction updateFlareProjectiles(');
    expect(collision).toContain('activeGlassColliderWindowIds.get(worldHit.box)');
    expect(collision).toContain('resolveIdentifiedGlassSweepImpact(worldHit, glass, worldGlassWindowId)');
    expect(collision).not.toContain('radiusFraction');
    expect(collision).not.toContain('worldHit.normal');

    const impact = block('function handleFlareImpact(', '\nfunction handleFlareBurnPulse(');
    expect(impact).toContain("weaponGlassBreakPolicy('flare-gun')");
    expect(impact).toContain('admitProjectileSimulationGlassMutation(impact.authority)');
    expect(impact).toContain('impact.breakableWindowId');
    expect(impact).toContain("'flare-gun',");
    expect(impact).not.toContain("network.role === 'client' && impact.ownerId === player.id");
    expect(impact.indexOf('breakHouseWindow(')).toBeLessThan(impact.indexOf('igniteGround('));
  });

  it('breaches crossbow blast glass at detonation before presentation disposal', () => {
    const detonation = block('function detonateExplosiveBoltEntity(', '\nconst crossbowGlassRay');
    expect(detonation).toContain("weaponGlassBreakPolicy('explosive-crossbow')");
    expect(detonation).toContain('admitProjectileSimulationGlassMutation(bolt.authority)');
    expect(detonation).toContain('breakWindowsInWeaponBlast(');
    expect(detonation).not.toContain("network.role === 'client' && bolt.ownerId === player.id");
    expect(detonation.indexOf('breakWindowsInWeaponBlast(')).toBeLessThan(detonation.indexOf('disposeExplosiveBolt('));
    expect(detonation.indexOf('breakWindowsInWeaponBlast(')).toBeLessThan(detonation.indexOf('if (!bolt.authority) return;'));

    const blast = block('function breakWindowsInWeaponBlast(', '\nfunction synchronizeSmokePresentation(');
    expect(blast).toContain('for (const pane of arena.breakableWindows)');
    expect(blast).toContain("'shot',");
    expect(blast).toContain('weapon,');
  });

  it('admits only host-canonical projectile breaks tied to the exact live action and pane', () => {
    const remote = block('function acceptRemoteWindowBreak(', '\nfunction resetBreakableWindows(');
    expect(remote).toContain("const localCanonicalProjectile = network.role === 'client'");
    expect(remote).toContain('admitProjectileGlassBreak({');
    expect(remote).toContain("const paneActionKey = `glass:${message.windowId}`;");
    expect(remote).toContain('actionNonceObserved: remoteAction?.message.nonce ?? hostedBotAction?.actionNonce ?? null');
    expect(remote).toContain("hostAuthorityValid: network.role === 'client'");
    expect(remote).toContain('eventReplay,');
    expect(remote).toContain('paneAlreadyAdmittedForAction: remoteAction?.targets.has(paneActionKey)');
    const projectileAdmissionGate = remote.indexOf('if (!admission.accepted || !remoteAction && !hostedBotAction) return;');
    const projectileBreak = remote.indexOf('breakHouseWindow(', projectileAdmissionGate);
    expect(projectileAdmissionGate).toBeGreaterThan(-1);
    expect(projectileBreak).toBeGreaterThan(projectileAdmissionGate);
    expect(remote.indexOf('if (!remote) return;')).toBeGreaterThan(projectileBreak);
    const paneMutation = block('function breakHouseWindow(', '\nfunction breakWindowsAlongBallisticTrace(');
    expect(paneMutation).toContain('spawnPersistentWindowDebris(window, normal);');
    expect(paneMutation).toContain("spawnImpactFlash(point, 'glass', normal);");
    expect(paneMutation).toContain("audio.impact('glass', point.distanceTo(camera.position));");
  });

  it('retains the guest local projectile action until its late canonical pane event', () => {
    const fire = block('function tryFire(', '\nfunction castShot(');
    const projectile = block('if (projectileShot) {', "\n  if (network.role === 'client') {");
    expect(projectile).toContain('actions.set(shot.nonce');
    expect(projectile).toContain('admittedRemoteShots.set(player.id, actions);');
    expect(projectile).not.toContain("if (network.role !== 'client')");
    expect(fire.indexOf('actions.set(shot.nonce'))
      .toBeLessThan(fire.indexOf("if (player.weapon === 'flare-gun')"));
    const result = block('function acceptAuthoritativeShotResult(', '\nfunction renderRemoteShot(');
    expect(result).toContain('pendingLocalProjectileGlassShots.get(message.shotId)');
    expect(result).toContain("if (message.status === 'rejected'");
    expect(result).toContain('localActions?.delete(pendingProjectileGlass.actionNonce);');
  });

  it('keeps an admitted projectile action through transport loss without retaining ordinary shots', () => {
    const removal = block('function removeRemote(', '\nfunction activeSpawnMode(');
    expect(removal).toContain('retainDisconnectedProjectileGlassActions(id);');
    expect(removal).not.toContain('admittedRemoteShots.delete(id);');
    const replacement = block('function resetAuthenticatedGuestReplacement(', '\nfunction safeGuestResumeFallbackSnapshot(');
    expect(replacement).toContain('retainDisconnectedProjectileGlassActions(playerId, now);');
    expect(replacement).not.toContain('admittedRemoteShots.delete(playerId);');
    const retention = block(
      'function retainDisconnectedProjectileGlassActions(',
      '\nconst createRailgunClaimAudit',
    );
    expect(retention).toContain('retainInFlightProjectileGlassActions(');
    expect(retention).toContain('interactiveWorldMatchEpoch');
  });

  it('retains authenticated hosted-bot flare actions without requiring a human remote pose', () => {
    const presentation = block(
      'function acceptHostedBotWeaponPresentation(',
      '\nfunction botElevationAt(',
    );
    expect(presentation).toContain('hostedBotWeaponPresentationReplay.admit(message');
    expect(presentation).toContain('hostedBotProjectileGlassActions.recordHostLaunch(admitted');
    expect(presentation.indexOf('hostedBotWeaponPresentationReplay.admit(message'))
      .toBeLessThan(presentation.indexOf('hostedBotProjectileGlassActions.recordHostLaunch(admitted'));

    const remote = block('function acceptRemoteWindowBreak(', '\nfunction resetBreakableWindows(');
    expect(remote).toContain("message.weapon === 'flare-gun'");
    expect(remote).toContain('hostedBotProjectileGlassActions.current(');
    expect(remote.indexOf('hostedBotProjectileGlassActions.current('))
      .toBeLessThan(remote.indexOf('if (!remote) return;'));
  });
});
