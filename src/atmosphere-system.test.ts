import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AtmosphereSystem, atmosphereBypassReason } from './atmosphere-system';

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
});
