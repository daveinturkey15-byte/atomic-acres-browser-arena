import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('./weapon-presentation.ts', import.meta.url), 'utf8');

describe('scoped optic and near-plane main integration', () => {
  it('uses one railgun thermal ownership predicate for the optic and viewmodel', () => {
    const predicateStart = main.indexOf('function railgunThermalOpticActive(): boolean {');
    const predicateEnd = main.indexOf('\nfunction updateRailgun(', predicateStart);
    const predicate = main.slice(predicateStart, predicateEnd);
    expect(predicateStart).toBeGreaterThan(0);
    expect(predicate).toContain("player.weapon === 'railgun'");
    expect(predicate).toContain('adsHeld');
    expect(predicate).toContain('weaponView.adsProgress() >= 0.45');

    const updateStart = main.indexOf('function updateRailgun(');
    const updateEnd = main.indexOf('\n/** Hostile combatants', updateStart);
    expect(main.slice(updateStart, updateEnd)).toContain('const thermalActive = railgunThermalOpticActive();');

    const visibilityStart = main.indexOf('function shouldShowWeaponViewmodel(): boolean {');
    const visibilityEnd = main.indexOf('\nfunction updatePhysics(', visibilityStart);
    expect(main.slice(visibilityStart, visibilityEnd)).toContain('&& !railgunThermalOpticActive()');
  });

  it('includes the melee knife in safety correction and recenters afterward', () => {
    const updateStart = presentation.indexOf('  update(pose: WeaponPose): WeaponActionEvent[] {');
    const update = presentation.slice(updateStart);
    const safetyCall = update.lastIndexOf('this.enforceNearPlaneClearance(activeModel, arms, this.meleeKnife);');
    const finalCenter = update.lastIndexOf('this.centerSightReference(activeModel);');
    expect(safetyCall).toBeGreaterThan(0);
    expect(finalCenter).toBeGreaterThan(safetyCall);
  });
});
