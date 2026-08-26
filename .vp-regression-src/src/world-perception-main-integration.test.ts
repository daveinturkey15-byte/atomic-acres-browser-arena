import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const glassSource = readFileSync(new URL('./glass-authority.ts', import.meta.url), 'utf8');

describe('world and perception runtime integration', () => {
  it('makes the crossbow sweep consult glass authority before targets or world boxes', () => {
    expect(source).toContain('const glassCollision = crossbowGlassCollision(start, delta);');
    expect(source).toContain('targetFraction <= glassFraction');
    expect(glassSource).toContain("'same-tick-admitted-breach'");
    expect(source).toMatch(/admitCrossbowThroughGlass\(state,[\s\S]*observedRevision: state\.revision/);
    expect(source).toContain('...activeGlassDynamicColliders(activeArena).map((entry) => entry.bounds)');
    expect(source).toContain('...activeGlassDynamicColliders(),');
    expect(source).toMatch(/window\.glassState = result\.state;[\s\S]*syncInteractiveWorldPhysics\(\);/);
  });

  it('routes knife, explosion and railgun through the same authoritative glass lifecycle', () => {
    const raycastStart = source.indexOf('function activeRaycastMeshes(');
    const raycastEnd = source.indexOf('\nfunction traceWeaponPath(', raycastStart);
    const raycastBlock = source.slice(raycastStart, raycastEnd);
    expect(raycastBlock).toContain('...activeArena.breakableWindows.map((pane) => pane.mesh)');
    expect(raycastBlock).toContain('const candidates = [...new Set([');

    const meleeStart = source.indexOf('function melee()');
    const meleeEnd = source.indexOf('\nconst explosiveBoltTargetBuffer', meleeStart);
    expect(source.slice(meleeStart, meleeEnd)).toContain("'knife',");

    const blastStart = source.indexOf('function breakWindowsInGrenadeBlast(');
    const blastEnd = source.indexOf('\nfunction synchronizeSmokePresentation(', blastStart);
    const blastBlock = source.slice(blastStart, blastEnd);
    expect(blastBlock).toContain('for (const pane of arena.breakableWindows)');
    expect(blastBlock).toContain("breakHouseWindow(pane.id, centre, normal, replicate, point, 'explosive', actionNonce)");

    const railStart = source.indexOf('function breakWindowsAlongBallisticTrace(');
    const railEnd = source.indexOf('\nfunction canonicalHostWindowBreak(', railStart);
    const railBlock = source.slice(railStart, railEnd);
    expect(railBlock).toContain('impact.surface.breakableWindowId');
    expect(railBlock).toContain('visited.has(windowId)');
    expect(source.match(/breakWindowsAlongBallisticTrace\(railgunTrace,/g)).toHaveLength(2);
    expect(glassSource).toContain('knife: 1_000');
    expect(glassSource).toContain('explosion: 2_000');
  });

  it('feeds semantic smoke and admitted flash state into live bot fire decisions', () => {
    expect(source).toContain('smokeDensity: smokeDensityAlongRay(origin, target, smokeVolumes, nowHostTimeMs)');
    expect(source).toContain('fireSuppressed: !bot.perceptionCanFire');
    expect(source).toContain('bot.perception = admission.state;');
    expect(source).toContain('bot.burstShots = 0;');
    expect(source).toContain('const botLook = flashLookDirection(bot.root.rotation.y, 0);');
    expect(source).not.toContain('const botLook = new THREE.Vector3(Math.sin(bot.root.rotation.y), 0, -Math.cos(bot.root.rotation.y));');
  });

  it('routes grenade and Carpet Bomber impacts through structural blast classes', () => {
    expect(source).toContain("'grenade-major-collapse'");
    expect(source).toContain("if (impact.source === 'carpet-bomber') {");
    expect(source).toContain("shedBlastClass: 'carpet-bomber-obliteration'");
    expect(source).toContain('applyInteractiveWorldExplosions(carpetWorldImpacts);');
  });
});
