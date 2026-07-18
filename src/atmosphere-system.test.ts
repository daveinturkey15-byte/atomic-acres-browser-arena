import { describe, expect, it } from 'vitest';
import { atmosphereBypassReason } from './atmosphere-system';

describe('Pass 30 atmosphere budget', () => {
  it('enables subtle mist only on hardware Blender by default', () => {
    expect(atmosphereBypassReason('blender', 'ANGLE (NVIDIA RTX)', null)).toBeNull();
    expect(atmosphereBypassReason('performance', 'ANGLE (NVIDIA RTX)', null)).toBe('performance-budget');
    expect(atmosphereBypassReason('compat', 'ANGLE (NVIDIA RTX)', 'on')).toBe('compat-profile');
  });

  it('truthfully bypasses software renderers unless explicitly forced for QA', () => {
    expect(atmosphereBypassReason('blender', 'Google SwiftShader', null)).toBe('software-renderer');
    expect(atmosphereBypassReason('blender', 'Google SwiftShader', 'on')).toBeNull();
    expect(atmosphereBypassReason('blender', 'ANGLE (NVIDIA RTX)', 'off')).toBe('query-disabled');
  });
});
