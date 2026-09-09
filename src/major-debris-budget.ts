export const MAX_MAJOR_DEBRIS_BODIES = 18;
export const MAX_PREWARMED_MAJOR_DEBRIS_BODIES = 64;

export type MajorDebrisSource = 'shed' | 'house' | 'window';

/**
 * Frozen shared admission budget. New major bodies are rejected in canonical
 * source order once a partition is full; authoritative bodies are never
 * evicted or hidden to make room for later cosmetic work.
 */
export const SHARED_MAJOR_DEBRIS_BUDGET = Object.freeze({
  total: MAX_MAJOR_DEBRIS_BODIES,
  shed: 12,
  house: 4,
  window: 2,
  policy: 'reject-newest-no-eviction' as const,
  order: Object.freeze(['shed', 'house', 'window'] as const),
});

export type MajorDebrisCounts = Readonly<Record<MajorDebrisSource, number>>;

export function validMajorDebrisCounts(counts: MajorDebrisCounts): boolean {
  return (Object.keys(counts) as MajorDebrisSource[]).length === 3
    && (['shed', 'house', 'window'] as const).every((source) => (
      Number.isSafeInteger(counts[source])
      && counts[source] >= 0
      && counts[source] <= SHARED_MAJOR_DEBRIS_BUDGET[source]
    ))
    && counts.shed + counts.house + counts.window <= SHARED_MAJOR_DEBRIS_BUDGET.total;
}

export function canAdmitMajorDebris(counts: MajorDebrisCounts, source: MajorDebrisSource): boolean {
  if (!validMajorDebrisCounts(counts)) return false;
  return counts[source] < SHARED_MAJOR_DEBRIS_BUDGET[source]
    && counts.shed + counts.house + counts.window < SHARED_MAJOR_DEBRIS_BUDGET.total;
}
