export type FootstepAccumulator = { distance: number; side: 0 | 1 };

export function strideLength(stance: 'stand' | 'crouch' | 'prone', sprinting: boolean): number {
  if (stance === 'prone') return 0.82;
  if (stance === 'crouch') return 1.18;
  return sprinting ? 2.05 : 1.62;
}

export function advanceFootsteps(
  state: FootstepAccumulator,
  appliedHorizontalDistance: number,
  stride: number,
): { state: FootstepAccumulator; emitted: number } {
  const safeDistance = Number.isFinite(appliedHorizontalDistance) ? Math.max(0, appliedHorizontalDistance) : 0;
  const safeStride = Number.isFinite(stride) ? Math.max(0.2, stride) : 1.6;
  const total = state.distance + safeDistance;
  const emitted = Math.min(4, Math.floor(total / safeStride));
  return {
    emitted,
    state: {
      distance: emitted > 0 ? total % safeStride : total,
      side: ((state.side + emitted) % 2) as 0 | 1,
    },
  };
}
