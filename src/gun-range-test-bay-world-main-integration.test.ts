import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function functionBlock(name: string, next: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`\nfunction ${next}`, start);
  expect(start, `${name}:start`).toBeGreaterThanOrEqual(0);
  expect(end, `${name}:end`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Pass 70 Gun Range test-bay runtime integration', () => {
  it('merges the moving secure leaf into hitscan ballistics as well as player/projectile collision', () => {
    const ballistics = functionBlock('activeBallisticSurfaces(', 'activeRaycastMeshes(');
    expect(ballistics).toContain("selectedArena.id === 'gun-range'");
    expect(ballistics).toContain('gunRangeTestBayDoorBallisticSurfaces');
    expect(ballistics.indexOf('...doorSurfaces')).toBeLessThan(ballistics.indexOf('...interactiveWorldRuntime.collisions().ballisticSurfaces'));

    const updateStart = source.indexOf("} else if (selectedArena.id === 'gun-range') {");
    const updateEnd = source.indexOf('\n    waterSystem.update(', updateStart);
    const update = source.slice(updateStart, updateEnd);
    expect(update).toContain('gunRangeTestBayDoorColliders = doorFrame.dynamicColliders;');
    expect(update).toContain('gunRangeTestBayDoorBallisticSurfaces = doorFrame.dynamicBallisticSurfaces;');
    expect(update).toContain('syncInteractiveWorldPhysics();');
  });

  it('projects live moving training dummies into the crossbow target buffer and damage path', () => {
    const fill = functionBlock('fillExplosiveBoltTargets(', 'explosiveBoltTargetDistance(');
    expect(fill).toContain("selectedArena.id === 'gun-range'");
    expect(fill).toContain("target.kind !== 'training-dummy'");
    expect(fill).toContain("'practice-target'");
    expect(fill).toContain('target.root.getWorldPosition(explosiveBoltPracticeTargetPositionScratch);');

    const damage = functionBlock('applyExplosiveBoltTargetDamage(', 'detonateExplosiveBoltEntity(');
    expect(damage).toContain("targetKind === 'practice-target'");
    expect(damage).toContain("candidate.kind === 'training-dummy'");
    expect(damage).toContain("weaponOrEffect: 'explosive-crossbow'");
    expect(damage).toContain("hitPracticeTarget(practiceTarget.id, boundedDamage, 'body'");
  });
});
