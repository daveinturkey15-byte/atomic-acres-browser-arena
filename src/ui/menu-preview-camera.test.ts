import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from '../map-selection';
import { menuPreviewDefinition, menuPreviewPose } from './menu-preview-camera';

describe('menu map preview camera', () => {
  it('defines a bounded presentation pose for every selectable arena', () => {
    for (const arena of ARENA_SELECTIONS) {
      const pose = menuPreviewPose(arena.id, 1_234);
      expect([...pose.position, ...pose.target, pose.fov, pose.phase].every(Number.isFinite)).toBe(true);
      expect(pose.fov).toBeGreaterThanOrEqual(50);
      expect(pose.fov).toBeLessThanOrEqual(75);
      expect(pose.label).toContain(arena.selectorLabel);
    }
  });

  it('uses helicopter framing for arenas and first-person cat framing for the range', () => {
    expect(menuPreviewDefinition('atomic-acres').frame).toBe('helicopter');
    expect(menuPreviewDefinition('skyline-terminal').frame).toBe('helicopter');
    expect(menuPreviewDefinition('rustworks-1v1').frame).toBe('helicopter');
    expect(menuPreviewDefinition('gun-range').frame).toBe('cat');
  });

  it('animates normal previews while reduced motion stays deterministic', () => {
    expect(menuPreviewPose('atomic-acres', 0).position).not.toEqual(menuPreviewPose('atomic-acres', 2_000).position);
    expect(menuPreviewPose('gun-range', 0).position).not.toEqual(menuPreviewPose('gun-range', 900).position);
    expect(menuPreviewPose('atomic-acres', 0, true)).toEqual(menuPreviewPose('atomic-acres', 8_000, true));
    expect(menuPreviewPose('gun-range', 0, true)).toEqual(menuPreviewPose('gun-range', 8_000, true));
  });
});
