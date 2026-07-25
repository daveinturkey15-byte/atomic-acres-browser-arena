import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ArenaContrastLighting } from './arena-contrast-lighting';
import { definition as atomicDefinition } from './rendering/arenas/atomic-acres';
import { definition as gunRangeDefinition } from './rendering/arenas/gun-range';
import { definition as rustworksDefinition } from './rendering/arenas/rustworks-1v1';
import { definition as terminalDefinition } from './rendering/arenas/skyline-terminal';

describe('Pass 62 arena contrast lighting', () => {
  it('provides bounded real-time keys only where the arena lacks enough authored practical light', () => {
    const scene = new THREE.Scene();
    const rig = new ArenaContrastLighting(scene, 'blender');
    for (const definition of [atomicDefinition, terminalDefinition]) {
      rig.applyDefinition(definition);
      expect(rig.telemetry()).toMatchObject({
        arenaId: definition.id,
        definitionId: definition.id,
        activeLights: 2,
        shadowCastingLights: 2,
        occlusion: { activeLocalLights: 2, shadowedLocalLights: 2, violations: [] },
      });
      const visibleRoots = scene.children.filter((node) => node.name.includes('definition-practicals') && node.visible);
      expect(visibleRoots).toHaveLength(1);
    }
    rig.applyDefinition(rustworksDefinition);
    expect(rig.telemetry()).toMatchObject({ arenaId: 'rustworks-1v1', activeLights: 0, shadowCastingLights: 0 });
    rig.applyDefinition(gunRangeDefinition);
    expect(rig.telemetry()).toMatchObject({ arenaId: 'gun-range', activeLights: 1, shadowCastingLights: 1 });
  });

  it('keeps unshadowed Performance and Compatibility free of the contrast-light volume', () => {
    const performance = new ArenaContrastLighting(new THREE.Scene(), 'performance');
    const compat = new ArenaContrastLighting(new THREE.Scene(), 'compat');
    performance.applyDefinition(atomicDefinition);
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0, occlusion: { violations: [] } });
    performance.applyDefinition(rustworksDefinition);
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
    expect(compat.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });

  it('bypasses the extra rig on software WebGL', () => {
    const rig = new ArenaContrastLighting(new THREE.Scene(), 'blender', true);
    expect(rig.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });
});
