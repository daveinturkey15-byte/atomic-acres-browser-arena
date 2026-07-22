import { describe, expect, it } from 'vitest';
import { headingDegrees, minimapLandmarkFootprint, minimapLandmarkLabel, minimapToWorld, northMarkerPosition, physicalCoverMinimapKind, playerFacingGeometry, playerRelativeMinimapOffset, playerUpRotationRadians, playerUpScaleX, shouldRevealEnemy, worldToMinimap } from './minimap';

const bounds = { minX: -40, maxX: 40, minZ: -50, maxZ: 50 };

describe('worldToMinimap', () => {
  it('maps arena corners and centre with north up', () => {
    expect(worldToMinimap(-40, -50, bounds, 180, 180)).toEqual([0, 180]);
    expect(worldToMinimap(40, 50, bounds, 180, 180)).toEqual([180, 0]);
    expect(worldToMinimap(0, 0, bounds, 180, 180)).toEqual([90, 90]);
  });

  it('clamps out-of-bounds positions to the map frame', () => {
    expect(worldToMinimap(100, -100, bounds, 180, 180)).toEqual([180, 180]);
  });

  it('round-trips map clicks back into bounded world positions', () => {
    expect(minimapToWorld(180, 0, bounds, 360, 360)).toEqual({ x: 0, z: 50 });
    expect(minimapToWorld(-50, 900, bounds, 360, 360)).toEqual({ x: -40, z: -50 });
  });
});

describe('player facing marker', () => {
  it('uses a long unambiguous nose and tail in the camera-forward direction', () => {
    const north = playerFacingGeometry(180, 180, Math.PI);
    expect(north.nose[1]).toBeLessThan(180);
    expect(north.tail[1]).toBeGreaterThan(180);
    expect(Math.hypot(north.nose[0] - 180, north.nose[1] - 180)).toBeGreaterThan(16);
    const east = playerFacingGeometry(180, 180, -Math.PI / 2);
    expect(east.nose[0]).toBeGreaterThan(180);
    const west = playerFacingGeometry(180, 180, Math.PI / 2);
    expect(west.nose[0]).toBeLessThan(180);
  });

  it('reports stable compass headings', () => {
    expect(headingDegrees(Math.PI)).toBe(0);
    expect(headingDegrees(-Math.PI / 2)).toBe(90);
    expect(headingDegrees(Math.PI / 2)).toBe(270);
    expect(headingDegrees(0)).toBe(180);
  });

  it('rotates a player-centred minimap so camera-forward stays up and north moves around the rim', () => {
    expect(playerUpRotationRadians(Math.PI)).toBeCloseTo(0);
    expect(playerUpRotationRadians(-Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(playerUpScaleX()).toBe(-1);
    const northWhenFacingNorth = northMarkerPosition(Math.PI, 180, 180);
    expect(northWhenFacingNorth[0]).toBeCloseTo(90);
    expect(northWhenFacingNorth[1]).toBeLessThan(90);
    const northWhenFacingEast = northMarkerPosition(-Math.PI / 2, 180, 180);
    expect(northWhenFacingEast[0]).toBeGreaterThan(90);
    expect(northWhenFacingEast[1]).toBeCloseTo(90);
  });

  it('preserves camera left/right instead of horizontally mirroring world markers', () => {
    // At yaw 0, camera-forward is -Z and camera-right is +X.
    expect(playerRelativeMinimapOffset(0, -8, 0)).toEqual([0, -8]);
    expect(playerRelativeMinimapOffset(8, 0, 0)[0]).toBeCloseTo(8);
    expect(playerRelativeMinimapOffset(-8, 0, 0)[0]).toBeCloseTo(-8);
    // At yaw PI, camera-forward is +Z and camera-right is -X.
    const northFacingRight = playerRelativeMinimapOffset(-8, 0, Math.PI);
    const northFacingLeft = playerRelativeMinimapOffset(8, 0, Math.PI);
    expect(northFacingRight[0]).toBeCloseTo(8);
    expect(northFacingLeft[0]).toBeCloseTo(-8);
  });

  it('rotates continuously for sub-degree camera movement instead of snapping to integer headings', () => {
    const start = playerUpRotationRadians(0);
    const quarterDegree = playerUpRotationRadians(Math.PI / 720);
    expect(quarterDegree).not.toBe(start);
    expect(Math.abs(quarterDegree - start)).toBeCloseTo(Math.PI / 720, 8);
    const northStart = northMarkerPosition(0, 180, 180);
    const northQuarterDegree = northMarkerPosition(Math.PI / 720, 180, 180);
    expect(northQuarterDegree[0]).not.toBe(northStart[0]);
  });
});

describe('enemy reveal policy', () => {
  it('reveals close enemies and recent gunfire but not distant quiet enemies', () => {
    expect(shouldRevealEnemy(12, 10_000, 0)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 8_000)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 2_000)).toBe(false);
  });
});

describe('meaningful physical-cover landmarks', () => {
  it('assigns a minimap identity to both buses and all four semantic cover families', () => {
    expect([
      physicalCoverMinimapKind('north-tour-bus'),
      physicalCoverMinimapKind('south-shuttle-bus'),
      physicalCoverMinimapKind('north-cargo-stack', 'cargo-stack'),
      physicalCoverMinimapKind('south-pipe-stack', 'pipe-stack'),
      physicalCoverMinimapKind('west-service-skip', 'service-skip'),
      physicalCoverMinimapKind('east-generator-trailer', 'generator-trailer'),
    ]).toEqual(['bus', 'bus', 'cargo-stack', 'pipe-stack', 'service-skip', 'generator-trailer']);
  });

  it('provides a compact label for every semantic silhouette', () => {
    expect([
      minimapLandmarkLabel('bus'),
      minimapLandmarkLabel('cargo-stack'),
      minimapLandmarkLabel('pipe-stack'),
      minimapLandmarkLabel('service-skip'),
      minimapLandmarkLabel('generator-trailer'),
    ]).toEqual(['BUS', 'CRGO', 'PIPE', 'SKIP', 'GEN']);
  });

  it('maps a landmark to its authoritative world-space footprint', () => {
    const footprint = minimapLandmarkFootprint(
      { minX: -10, maxX: 10, minZ: -5, maxZ: 5 },
      bounds,
      160,
      200,
    );
    expect(footprint.x).toBeCloseTo(60);
    expect(footprint.y).toBeCloseTo(90);
    expect(footprint.width).toBeCloseTo(40);
    expect(footprint.height).toBeCloseTo(20);
  });
});
