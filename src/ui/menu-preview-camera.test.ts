import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS } from '../map-selection';
import {
  MENU_PREVIEW_VISIT_SEED_SLOTS,
  menuPreviewDefinition,
  menuPreviewPose,
  menuPreviewVisitSeed,
} from './menu-preview-camera';

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

  it('keeps helicopter corrections subtle, smooth, seeded, and exactly reviewable', () => {
    for (const arenaId of ['atomic-acres', 'skyline-terminal', 'rustworks-1v1'] as const) {
      const definition = menuPreviewDefinition(arenaId);
      expect(definition.frame).toBe('helicopter');
      if (definition.frame !== 'helicopter') throw new Error('unreachable definition');
      expect(definition.cockpitAssetId).toBe('pass65-sleek-cockpit-v1');
      const seed = `review-${arenaId}`;
      let previous = menuPreviewPose(arenaId, 0, false, seed);
      for (let timeMs = 16; timeMs <= definition.durationMs * 4; timeMs += 16) {
        const pose = menuPreviewPose(arenaId, timeMs, false, seed);
        expect(Math.abs(pose.variance.pitchDegrees)).toBeLessThanOrEqual(0.9);
        expect(Math.abs(pose.variance.yawDegrees)).toBeLessThanOrEqual(1.4);
        expect(Math.abs(pose.variance.bankDegrees)).toBeLessThanOrEqual(2.3);
        expect(Math.abs(pose.variance.altitudeM)).toBeLessThanOrEqual(0.85);
        expect(Math.abs(pose.variance.directionBiasDegrees)).toBeLessThanOrEqual(0.81);
        expect(pose.variance.speedScale).toBeGreaterThanOrEqual(0.92);
        expect(pose.variance.speedScale).toBeLessThanOrEqual(1.08);
        expect(distance(previous.position, pose.position)).toBeLessThan(0.42);
        expect(angleBetween(
          viewDirection(previous.position, previous.target),
          viewDirection(pose.position, pose.target),
        )).toBeLessThan(0.035);
        previous = pose;
      }
      const start = menuPreviewPose(arenaId, 0, false, seed);
      const seam = menuPreviewPose(arenaId, definition.durationMs * 4, false, seed);
      expect(distance(start.position, seam.position)).toBeLessThan(0.000_001);
      expect(distance(start.target, seam.target)).toBeLessThan(0.000_001);
      expect(seam.variance.pitchDegrees).toBeCloseTo(start.variance.pitchDegrees, 10);
      expect(seam.variance.yawDegrees).toBeCloseTo(start.variance.yawDegrees, 10);
      expect(seam.variance.bankDegrees).toBeCloseTo(start.variance.bankDegrees, 10);
      expect(seam.variance.altitudeM).toBeCloseTo(start.variance.altitudeM, 10);
      expect(seam.variance.directionBiasDegrees).toBeCloseTo(start.variance.directionBiasDegrees, 10);
      expect(seam.variance.speedScale).toBeCloseTo(start.variance.speedScale, 6);
      expect(menuPreviewPose(arenaId, 7_500, false, 'seed-a').variance)
        .not.toEqual(menuPreviewPose(arenaId, 7_500, false, 'seed-b').variance);
      expect(menuPreviewPose(arenaId, 7_500, false, seed)).toEqual(menuPreviewPose(arenaId, 7_500, false, seed));
    }
  });

  it('gives cat-cam a bounded authored moment path with a clean comfortable loop', () => {
    const definition = menuPreviewDefinition('gun-range');
    expect(definition.frame).toBe('cat');
    if (definition.frame !== 'cat') throw new Error('unreachable definition');
    expect(definition.durationMs).toBe(24_000);
    expect(new Set(definition.momentLabels).size).toBe(definition.momentLabels.length);
    const seenMoments = new Set<string>();
    let previous = menuPreviewPose('gun-range', 0);
    let previousAngularVelocity = 0;
    for (let timeMs = 16; timeMs <= definition.durationMs; timeMs += 16) {
      const pose = menuPreviewPose('gun-range', timeMs);
      expect(pose.position[0]).toBeGreaterThanOrEqual(-8.5);
      expect(pose.position[0]).toBeLessThanOrEqual(8.8);
      expect(pose.position[1]).toBeGreaterThanOrEqual(1.05);
      expect(pose.position[1]).toBeLessThanOrEqual(1.35);
      expect(pose.position[2]).toBeGreaterThanOrEqual(13.4);
      expect(pose.position[2]).toBeLessThanOrEqual(17.3);
      expect(distance(previous.position, pose.position)).toBeLessThan(0.09);
      const angularVelocity = angleBetween(
        viewDirection(previous.position, previous.target),
        viewDirection(pose.position, pose.target),
      ) / 0.016;
      expect(angularVelocity).toBeLessThanOrEqual(1.75);
      if (timeMs > 16) {
        expect(Math.abs(angularVelocity - previousAngularVelocity) / 0.016).toBeLessThanOrEqual(3);
      }
      previousAngularVelocity = angularVelocity;
      seenMoments.add(pose.momentLabel);
      previous = pose;
    }
    expect(seenMoments).toEqual(new Set(definition.momentLabels));
    const start = menuPreviewPose('gun-range', 0);
    const seam = menuPreviewPose('gun-range', definition.durationMs);
    expect(distance(start.position, seam.position)).toBeLessThan(0.000_001);
    expect(distance(start.target, seam.target)).toBeLessThan(0.000_001);
    expect(seam.bankRadians).toBeCloseTo(start.bankRadians, 10);
  });

  it('derives deterministic but distinct correction tracks for each menu visit', () => {
    const first = menuPreviewVisitSeed('capture-seed', 1);
    const revisit = menuPreviewVisitSeed('capture-seed', 2);
    expect(first).toBe(menuPreviewVisitSeed('capture-seed', 1));
    expect(revisit).not.toBe(first);
    expect(menuPreviewPose('atomic-acres', 2_500, false, revisit).variance)
      .not.toEqual(menuPreviewPose('atomic-acres', 2_500, false, first).variance);
    expect(menuPreviewVisitSeed('capture-seed', Number.NaN)).toBe(menuPreviewVisitSeed('capture-seed', 0));
    expect(menuPreviewVisitSeed('capture-seed', MENU_PREVIEW_VISIT_SEED_SLOTS))
      .toBe(menuPreviewVisitSeed('capture-seed', 0));
  });
});
