import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ArenaContrastLighting } from './arena-contrast-lighting';

describe('Pass 62 arena contrast lighting', () => {
  it('provides two bounded real-time keys and one moving-caster shadow in every Quality arena', () => {
    const scene = new THREE.Scene();
    const rig = new ArenaContrastLighting(scene, 'blender');
    for (const arenaId of ['atomic-acres', 'rustworks-1v1', 'gun-range', 'skyline-terminal'] as const) {
      rig.setArena(arenaId);
      expect(rig.telemetry()).toMatchObject({ arenaId, activeLights: 2, shadowCastingLights: 1 });
      const visibleRoots = scene.children.filter((node) => node.name.includes('contrast-lighting') && node.visible);
      expect(visibleRoots).toHaveLength(1);
    }
  });

  it('keeps Performance illuminated without extra shadow maps and Compatibility free of the rig', () => {
    const performance = new ArenaContrastLighting(new THREE.Scene(), 'performance');
    const compat = new ArenaContrastLighting(new THREE.Scene(), 'compat');
    expect(performance.telemetry()).toMatchObject({ activeLights: 2, shadowCastingLights: 0 });
    expect(compat.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });

  it('bypasses the extra rig on software WebGL', () => {
    const rig = new ArenaContrastLighting(new THREE.Scene(), 'blender', true);
    expect(rig.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });
});
