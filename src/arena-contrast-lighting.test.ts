import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ArenaContrastLighting } from './arena-contrast-lighting';

describe('Pass 62 arena contrast lighting', () => {
  it('provides bounded real-time keys only where the arena lacks enough authored practical light', () => {
    const scene = new THREE.Scene();
    const rig = new ArenaContrastLighting(scene, 'blender');
    for (const arenaId of ['atomic-acres', 'skyline-terminal'] as const) {
      rig.setArena(arenaId);
      expect(rig.telemetry()).toMatchObject({
        arenaId,
        activeLights: 2,
        shadowCastingLights: 2,
        occlusion: { activeLocalLights: 2, shadowedLocalLights: 2, violations: [] },
      });
      const visibleRoots = scene.children.filter((node) => node.name.includes('contrast-lighting') && node.visible);
      expect(visibleRoots).toHaveLength(1);
    }
    for (const arenaId of ['rustworks-1v1', 'gun-range'] as const) {
      rig.setArena(arenaId);
      expect(rig.telemetry()).toMatchObject({ arenaId, activeLights: 0, shadowCastingLights: 0 });
    }
  });

  it('keeps unshadowed Performance and Compatibility free of the contrast-light volume', () => {
    const performance = new ArenaContrastLighting(new THREE.Scene(), 'performance');
    const compat = new ArenaContrastLighting(new THREE.Scene(), 'compat');
    performance.setArena('atomic-acres');
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0, occlusion: { violations: [] } });
    performance.setArena('rustworks-1v1');
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
    expect(compat.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });

  it('bypasses the extra rig on software WebGL', () => {
    const rig = new ArenaContrastLighting(new THREE.Scene(), 'blender', true);
    expect(rig.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });
});
