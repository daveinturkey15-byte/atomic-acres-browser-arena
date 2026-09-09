import { describe, expect, it } from 'vitest';
import { FIELD_SHED_DEFINITION } from './destructible-shed-definition';
import {
  SHED_MAX_MAJOR_CHUNKS,
  shedSurfaceNormal,
  validateDestructibleShedDefinition,
  type SheetSurfaceDefinition,
} from './destructible-world';

const EAVES_Y = 2.4;
const RIDGE_Y = 3.44;
const HALF_WIDTH = 1.8;
/** Cross-section roof line: 3.44 m over the ridge falling to 2.40 m at both eaves. */
const ROOF_SLOPE = (RIDGE_Y - EAVES_Y) / HALF_WIDTH;

/** Axis-aligned end panels: vertical v, horizontal u, lying in the z = centre.z plane. */
function endElevationPanels(z: number): readonly SheetSurfaceDefinition[] {
  return FIELD_SHED_DEFINITION.surfaces.filter((surface) => (
    Math.abs(surface.frame.centre.z - z) < 1e-9
    && surface.frame.vAxis.y === 1
    && surface.frame.uAxis.y === 0
    && surface.frame.uAxis.z === 0
  ));
}

/**
 * Fraction of one end cross-section that no authored surface skins. The probe
 * walks the real gable outline (under the roof line, above the floor) rather
 * than a bounding box, so a rectangular wall that stops at the eaves cannot
 * score as full coverage.
 */
function unskinnedFraction(z: number): number {
  const panels = endElevationPanels(z);
  const step = 0.01;
  let inside = 0;
  let open = 0;
  for (let x = -HALF_WIDTH + step / 2; x < HALF_WIDTH; x += step) {
    const ceiling = RIDGE_Y - Math.abs(x) * ROOF_SLOPE;
    for (let y = step / 2; y < ceiling; y += step) {
      inside += 1;
      const covered = panels.some((panel) => (
        Math.abs(x - panel.frame.centre.x) <= panel.frame.halfU + 1e-9
        && Math.abs(y - panel.frame.centre.y) <= panel.frame.halfV + 1e-9
      ));
      if (!covered) open += 1;
    }
  }
  return open / inside;
}

describe('field shed authored envelope', () => {
  it('skins both gable ends so the intact shed is never see-through', () => {
    // Pass 79 owner report: before the gable closures this probe scored 18720
    // of 105120 samples open on each end - 17.8%, 1.872 m^2 of air between the
    // 2.40 m eaves line and the 3.44 m ridge. The door counts as skin here; a
    // player opening it is the intended way to see inside.
    expect(unskinnedFraction(-2.1), 'north elevation').toBe(0);
    expect(unskinnedFraction(2.1), 'south elevation').toBe(0);
  });

  it('lands both gable closures between the eaves line and the ridge with outward normals', () => {
    for (const [surfaceId, outwardZ] of [['gable-north', -1], ['gable-south', 1]] as const) {
      const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === surfaceId)!;
      expect(surface.frame.centre.y - surface.frame.halfV, `${surfaceId}:eaves`).toBeCloseTo(EAVES_Y, 6);
      expect(surface.frame.centre.y + surface.frame.halfV, `${surfaceId}:ridge`).toBeCloseTo(RIDGE_Y, 6);
      expect(surface.frame.halfU, `${surfaceId}:half-width`).toBe(HALF_WIDTH);
      expect(Math.sign(shedSurfaceNormal(surface.frame).z), `${surfaceId}:outward`).toBe(outwardZ);
    }
    expect(validateDestructibleShedDefinition(FIELD_SHED_DEFINITION)).toEqual([]);
  });

  it('closes the envelope without spending a pre-authored major chunk', () => {
    for (const surfaceId of ['gable-north', 'gable-south']) {
      const surface = FIELD_SHED_DEFINITION.surfaces.find((candidate) => candidate.id === surfaceId)!;
      expect(surface.detachableChunkId, `${surfaceId}:fixed`).toBeNull();
    }
    expect(FIELD_SHED_DEFINITION.preauthoredChunkIds).toHaveLength(SHED_MAX_MAJOR_CHUNKS);
  });
});
