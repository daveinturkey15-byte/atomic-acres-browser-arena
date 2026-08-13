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
    const collision = block('const flareProjectileCallbacks:', '\nfunction updateFlareProjectiles(');
    expect(collision).toContain('breakableWindowId: glass.windowId');
    expect(collision).toContain('radiusFraction');

    const impact = block('function handleFlareImpact(', '\nfunction handleFlareBurnPulse(');
    expect(impact).toContain("weaponGlassBreakPolicy('flare-gun')");
    expect(impact).toContain('impact.breakableWindowId');
    expect(impact).toContain("'flare-gun',");
    expect(impact.indexOf('breakHouseWindow(')).toBeLessThan(impact.indexOf('igniteGround('));
  });

  it('breaches crossbow blast glass at detonation before presentation disposal', () => {
    const detonation = block('function detonateExplosiveBoltEntity(', '\nconst crossbowGlassRay');
    expect(detonation).toContain("weaponGlassBreakPolicy('explosive-crossbow')");
    expect(detonation).toContain('breakWindowsInWeaponBlast(');
    expect(detonation.indexOf('breakWindowsInWeaponBlast(')).toBeLessThan(detonation.indexOf('disposeExplosiveBolt('));
    expect(detonation.indexOf('breakWindowsInWeaponBlast(')).toBeLessThan(detonation.indexOf('if (!bolt.authority) return;'));

    const blast = block('function breakWindowsInWeaponBlast(', '\nfunction synchronizeSmokePresentation(');
    expect(blast).toContain('for (const pane of arena.breakableWindows)');
    expect(blast).toContain("'shot',");
    expect(blast).toContain('weapon,');
  });

  it('admits only host-canonical projectile breaks tied to the exact live action and pane', () => {
    const remote = block('function acceptRemoteWindowBreak(', '\nfunction resetBreakableWindows(');
    expect(remote).toContain('admitProjectileGlassBreak({');
    expect(remote).toContain("const paneActionKey = `glass:${message.windowId}`;");
    expect(remote).toContain('actionNonceObserved: action?.message.nonce ?? null');
    expect(remote).toContain("hostAuthorityValid: network.role === 'client'");
    expect(remote).toContain('eventReplay,');
    expect(remote).toContain('paneAlreadyAdmittedForAction: action?.targets.has(paneActionKey) ?? false');
    expect(remote.indexOf('if (!admission.accepted || !action) return;'))
      .toBeLessThan(remote.indexOf('breakHouseWindow('));
  });
});
