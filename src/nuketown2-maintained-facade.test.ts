import { describe, expect, it } from 'vitest';
import { lapSidingParts, type FacadeFacing } from './forge-kit/facade';
import { createNuketown2MaterialRegistry } from './nuketown2-materials';
import { albedoWearStep } from './nuketown2-materials/spec';

describe('maintained residential facade', () => {
  it('keeps the siding envelope while expressing joints as seams rather than black bands', () => {
    for (const facing of ['x+', 'x-', 'z+', 'z-'] as FacadeFacing[]) {
      for (const height of [0.3, 0.9, 1.25, 2.9, 3.2]) {
        const parts = lapSidingParts({ run: 3.7, height, facing });
        const boards = parts.filter((part) => part.role === 'siding');
        const outerAxis = facing.startsWith('x') ? 0 : 2;
        for (const board of boards) {
          expect(board.offset[1] - board.size[1] / 2).toBeGreaterThanOrEqual(-1e-8);
          expect(board.offset[1] + board.size[1] / 2).toBeLessThanOrEqual(height + 1e-8);
          expect(Math.abs(board.offset[outerAxis]) + board.size[outerAxis] / 2).toBeLessThanOrEqual(0.05 + 1e-8);
        }
        for (let index = 1; index < boards.length; index += 1) {
          const lower = boards[index - 1]!;
          const upper = boards[index]!;
          const gap = upper.offset[1] - upper.size[1] / 2 - lower.offset[1] - lower.size[1] / 2;
          expect(gap).toBeGreaterThan(0.001);
          // Compare with the complete lower course; the final upper board may
          // be cropped by the storey head, so centre spacing is not its pitch.
          expect(gap / (lower.size[1] + gap)).toBeLessThan(0.03);
        }
      }
    }
  });

  it('uses one maintained paint graph for both house identities without dropping texture resources', () => {
    const registry = createNuketown2MaterialRegistry();
    expect(registry.sidingA.color.equals(registry.sidingB.color)).toBe(false);
    expect(registry.sidingA.colorNode).toBe(registry.sidingB.colorNode);
    expect(registry.sidingA.normalNode).toBe(registry.sidingB.normalNode);
    for (const material of [registry.sidingA, registry.sidingB]) {
      expect(material.userData.nuketown2SidingCourseAuthority).toBe('geometry');
      expect(material.userData.nuketown2TextureSamplerFamilies).toEqual(['lapSiding']);
      const spec = material.userData.nuketown2Spec;
      expect(albedoWearStep(spec)).toBeGreaterThanOrEqual(0.1);
      expect(spec.soil).toBeLessThanOrEqual(0.005);
      expect(spec.traffic.albedo).toBeLessThanOrEqual(0.02);
    }
    for (const material of Object.values(registry)) material.dispose();
    registry.sidingA.userData.nuketown2TextureBridge.dispose();
  });
});
