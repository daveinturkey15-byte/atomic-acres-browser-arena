import { describe, expect, it } from 'vitest';
import { headingDegrees, minimapToWorld, northMarkerPosition, playerFacingGeometry, playerUpRotationRadians, shouldRevealEnemy, worldToMinimap } from './minimap';

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
    expect(playerUpRotationRadians(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    const northWhenFacingNorth = northMarkerPosition(Math.PI, 180, 180);
    expect(northWhenFacingNorth[0]).toBeCloseTo(90);
    expect(northWhenFacingNorth[1]).toBeLessThan(90);
    const northWhenFacingEast = northMarkerPosition(-Math.PI / 2, 180, 180);
    expect(northWhenFacingEast[0]).toBeLessThan(90);
    expect(northWhenFacingEast[1]).toBeCloseTo(90);
  });
});

describe('enemy reveal policy', () => {
  it('reveals close enemies and recent gunfire but not distant quiet enemies', () => {
    expect(shouldRevealEnemy(12, 10_000, 0)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 8_000)).toBe(true);
    expect(shouldRevealEnemy(40, 10_000, 2_000)).toBe(false);
  });
});
