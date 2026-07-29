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

  it('feeds semantic smoke and admitted flash state into live bot fire decisions', () => {
    expect(source).toContain('smokeDensity: smokeDensityAlongRay(origin, target, smokeVolumes, nowHostTimeMs)');
    expect(source).toContain('fireSuppressed: !bot.perceptionCanFire');
    expect(source).toContain('bot.perception = admission.state;');
    expect(source).toContain('bot.burstShots = 0;');
  });

  it('routes grenade and Carpet Bomber impacts through structural blast classes', () => {
    expect(source).toContain("'grenade-major-collapse'");
    expect(source).toContain("impact.source === 'carpet-bomber' ? 'carpet-bomber-obliteration' : undefined");
  });
});
