import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem, atmosphereBypassReason, atmosphereFogRange } from './atmosphere-system';

describe('Pass 30 atmosphere budget', () => {
  it('enables restrained atmosphere on hardware Performance and Blender by default', () => {
    expect(atmosphereBypassReason('blender', 'ANGLE (NVIDIA RTX)', null)).toBeNull();
    expect(atmosphereBypassReason('performance', 'ANGLE (NVIDIA RTX)', null)).toBeNull();
    expect(atmosphereBypassReason('compat', 'ANGLE (NVIDIA RTX)', 'on')).toBe('compat-profile');
  });

  it('truthfully bypasses software renderers unless explicitly forced for QA', () => {
    expect(atmosphereBypassReason('blender', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(atmosphereBypassReason('performance', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(atmosphereBypassReason('blender', 'Google SwiftShader', 'on')).toBeNull();
    expect(atmosphereBypassReason('blender', 'ANGLE (NVIDIA RTX)', 'off')).toBe('query-disabled');
  });

  it('uses a bounded shader mist, smoke and low-altitude dust budget', () => {
    const system = new AtmosphereSystem(new THREE.Scene(), 'blender', 'ANGLE (NVIDIA RTX)', null);
    system.update(1.25);
    expect(system.telemetry()).toMatchObject({
      enabled: true,
      arenaId: 'atomic-acres',
      mistCards: 10,
      smokeCards: 5,
      dustMotes: 96,
      triangles: 30,
      textureSamples: 0,
      volumetricRayMarching: false,
      perFrameAllocations: 0,
      time: 1.25,
    });
  });

  it('reuses one bounded pool with map-specific visible layouts across every arena', () => {
    const system = new AtmosphereSystem(new THREE.Scene(), 'performance', 'ANGLE (NVIDIA RTX)', null);
    expect(system.telemetry()).toMatchObject({ arenaId: 'atomic-acres', mistCards: 10, smokeCards: 5, dustMotes: 64, triangles: 30 });
    system.setArena('rustworks-1v1');
    expect(system.telemetry()).toMatchObject({ arenaId: 'rustworks-1v1', mistCards: 10, smokeCards: 5, dustMotes: 40, triangles: 30, perFrameAllocations: 0 });
    system.setArena('gun-range');
    expect(system.telemetry()).toMatchObject({ arenaId: 'gun-range', mistCards: 4, smokeCards: 2, dustMotes: 24, triangles: 12, perFrameAllocations: 0 });
  });

  it('brings restrained distance fog into the playable depth of every non-compat arena', () => {
    expect(atmosphereFogRange('performance', 'atomic-acres')).toEqual({ near: 36, far: 112 });
    expect(atmosphereFogRange('performance', 'rustworks-1v1')).toEqual({ near: 30, far: 94 });
    expect(atmosphereFogRange('performance', 'gun-range')).toEqual({ near: 42, far: 105 });
    expect(atmosphereFogRange('compat', 'atomic-acres')).toEqual({ near: 56, far: 140 });
  });
});
