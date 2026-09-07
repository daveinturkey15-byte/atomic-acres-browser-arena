import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, type ArenaId } from '../map-selection';
import { menuPreviewDefinition, menuPreviewPose } from './menu-preview-camera';

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(...left.map((value, index) => value - (right[index] ?? 0)));
}

function viewDirection(position: readonly number[], target: readonly number[]): readonly [number, number, number] {
  const direction = target.map((value, index) => value - (position[index] ?? 0));
  const length = Math.max(0.000_001, Math.hypot(...direction));
  return [direction[0]! / length, direction[1]! / length, direction[2]! / length];
}

function angleBetween(left: readonly number[], right: readonly number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function expectInsideSafeVolume(arenaId: ArenaId, position: readonly number[]): void {
  const bounds = menuPreviewDefinition(arenaId).safeVolume;
  expect(position[0]).toBeGreaterThanOrEqual(bounds.x[0]);
  expect(position[0]).toBeLessThanOrEqual(bounds.x[1]);
  expect(position[1]).toBeGreaterThanOrEqual(bounds.y[0]);
  expect(position[1]).toBeLessThanOrEqual(bounds.y[1]);
  expect(position[2]).toBeGreaterThanOrEqual(bounds.z[0]);
  expect(position[2]).toBeLessThanOrEqual(bounds.z[1]);
}

describe('canonical prerecorded menu preview choreography', () => {
  it('defines the same eight-second authored recipe for every selectable arena', () => {
    for (const arena of ARENA_SELECTIONS) {
      const definition = menuPreviewDefinition(arena.id);
      expect(definition.recipeId).toBe(arena.id === 'high-seas'
        ? 'pass75-high-seas-menu-preview-v1'
        : 'pass66-authoritative-runtime-menu-preview-v2');
      expect(definition.durationMs).toBe(8_000);
      expect(definition.reviewFrames).toEqual([1, 60, 120, 180, 240]);
      expect(definition.label).toContain(arena.selectorLabel);
      expect(definition.fovDegrees).toBeGreaterThanOrEqual(60);
      expect(definition.fovDegrees).toBeLessThanOrEqual(70);
    }
  });

  it('uses authored LOD0 helicopter framing and a dedicated cat POV for the range', () => {
    // owner 2026-08-30: Test1/Test2 arenas added — both fly the helicopter recipe.
    // MAP3 (2026-09-02, HF-405): Map 3 flies the same helicopter recipe from its own
    // authored choreography, so it is asserted here rather than left off the roster.
    for (const arenaId of ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'high-seas', 'test1', 'test2', 'map3'] as const) {
      const definition = menuPreviewDefinition(arenaId);
      expect(definition.kind).toBe('helicopter');
      if (definition.kind !== 'helicopter') throw new Error('unreachable definition');
      expect(definition.cockpitAssetId).toBe('pass66-compact-cockpit-overlay-v1');
    }
    expect(menuPreviewDefinition('gun-range').kind).toBe('cat');
  });

  it('holds occasional helicopter trim values and blends bounded seeded corrections', () => {
    // owner 2026-08-30: Test1/Test2 arenas added — same bounded-trim contract.
    // MAP3 (2026-09-02, HF-405): Map 3 enters the 240-frame safe-volume and variance
    // sweep on the same terms; a hardcoded roster had been hiding it from this test.
    for (const arenaId of ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'high-seas', 'test1', 'test2', 'map3'] as const) {
      const definition = menuPreviewDefinition(arenaId);
      const unique = new Set<string>();
      let heldFramePairs = 0;
      let previous = menuPreviewPose(arenaId, 0);
      for (let frame = 1; frame <= 240; frame += 1) {
        const timeMs = (frame - 1) / 239 * definition.durationMs;
        const pose = menuPreviewPose(arenaId, timeMs);
        expectInsideSafeVolume(arenaId, pose.position);
        expect(Math.abs(pose.variance.pitchDegrees)).toBeLessThanOrEqual(0.8);
        expect(Math.abs(pose.variance.yawDegrees)).toBeLessThanOrEqual(1.2);
        expect(Math.abs(pose.variance.bankDegrees)).toBeLessThanOrEqual(2.2);
        expect(Math.abs(pose.variance.altitudeM)).toBeLessThanOrEqual(0.75);
        expect(Math.abs(pose.variance.directionBiasDegrees)).toBeLessThanOrEqual(0.6);
        expect(Math.abs(pose.variance.radiusScaleDelta)).toBeLessThanOrEqual(0.018);
        expect(pose.variance.speedScale).toBeGreaterThanOrEqual(0.92);
        expect(pose.variance.speedScale).toBeLessThanOrEqual(1.08);
        const signature = JSON.stringify(pose.variance);
        unique.add(signature);
        if (frame > 1 && signature === JSON.stringify(previous.variance)) heldFramePairs += 1;
        expect(distance(previous.position, pose.position)).toBeLessThan(1.8);
        previous = pose;
      }
      expect(unique.size).toBeGreaterThan(20);
      expect(heldFramePairs).toBeGreaterThan(40);
      const start = menuPreviewPose(arenaId, 0);
      const seam = menuPreviewPose(arenaId, definition.durationMs);
      expect(distance(start.position, seam.position)).toBeLessThan(0.000_001);
      expect(distance(start.target, seam.target)).toBeLessThan(0.000_001);
      expect(seam.variance).toEqual(start.variance);
    }
  });

  it('keeps the cat path compact, smooth, varied, and exactly looped', () => {
    const definition = menuPreviewDefinition('gun-range');
    expect(definition.kind).toBe('cat');
    if (definition.kind !== 'cat') throw new Error('unreachable definition');
    expect(new Set(definition.momentLabels).size).toBe(8);
    const deltaSeconds = definition.durationMs / 1_000 / 239;
    const seenMoments = new Set<string>();
    let previous = menuPreviewPose('gun-range', 0);
    let previousVelocity = 0;
    let previousAngularVelocity = 0;
    for (let frame = 2; frame <= 239; frame += 1) {
      const timeMs = (frame - 1) / 239 * definition.durationMs;
      const pose = menuPreviewPose('gun-range', timeMs);
      expectInsideSafeVolume('gun-range', pose.position);
      const velocity = distance(previous.position, pose.position) / deltaSeconds;
      const angularVelocity = angleBetween(
        viewDirection(previous.position, previous.target),
        viewDirection(pose.position, pose.target),
      ) / deltaSeconds;
      expect(velocity).toBeLessThanOrEqual(definition.motionBounds.maximumLinearSpeedMps);
      expect(angularVelocity).toBeLessThanOrEqual(definition.motionBounds.maximumAngularVelocityRadPerSecond);
      if (frame > 2) {
        expect(Math.abs(velocity - previousVelocity) / deltaSeconds)
          .toBeLessThanOrEqual(definition.motionBounds.maximumLinearAccelerationMps2);
        expect(Math.abs(angularVelocity - previousAngularVelocity) / deltaSeconds)
          .toBeLessThanOrEqual(definition.motionBounds.maximumAngularAccelerationRadPerSecond2);
      }
      previousVelocity = velocity;
      previousAngularVelocity = angularVelocity;
      seenMoments.add(pose.momentLabel);
      previous = pose;
    }
    expect(seenMoments).toEqual(new Set(definition.momentLabels));
    const start = menuPreviewPose('gun-range', 0);
    const seam = menuPreviewPose('gun-range', definition.durationMs);
    expect(distance(start.position, seam.position)).toBeLessThan(0.000_001);
    expect(distance(start.target, seam.target)).toBeLessThan(0.000_001);
    expect(seam.bankRadians).toBeCloseTo(start.bankRadians, 12);
  });

  it('uses the authored poster pose as the deterministic reduced-motion fallback', () => {
    for (const arena of ARENA_SELECTIONS) {
      const first = menuPreviewPose(arena.id, 0, true);
      expect(menuPreviewPose(arena.id, 7_999, true)).toEqual(first);
      expect(first.momentLabel).toBe('STATIC POSTER');
      expect(first.variance.speedScale).toBe(1);
    }
  });
});
