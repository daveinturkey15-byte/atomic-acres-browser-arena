/**
 * src/map3/technique-lab/gallery/sorting.ts — newest-first ordering helpers
 * for the Skills Lab host. No DOM, no fetch: pure functions over dates that
 * are actually recorded in source data, unit-testable on the CPU.
 *
 * Honesty rules:
 * - Only dates present in the loaded data are used (catalog evidence
 *   `inspectedAt`, Blender lane `createdAt`/`updatedAt`/`generatedAsOf`).
 *   Nothing is inferred from a URL, a file mtime, a revision hash or load
 *   order, and no date is ever invented for a record that has none.
 * - Records without a usable date keep their incoming relative order but sort
 *   AFTER every dated record, and the UI must label them with
 *   UNKNOWN_DATE_LABEL so "no date" never reads as "old".
 * - Comparison is a stable newest-first sort: valid YYYY-MM-DD strings compare
 *   lexicographically, which is chronological for this format.
 */

/** Visible label for records that carry no usable date. Never a fake date. */
export const UNKNOWN_DATE_LABEL = 'date unknown';

/** Strict calendar date: YYYY-MM-DD with plausible month/day ranges. */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalize one candidate date value to YYYY-MM-DD, or null when it is not a
 * real recorded date. Accepts a bare date or an ISO datetime (the date part
 * is kept); rejects anything else, including revision hashes and free text.
 */
export function parseRecordDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const bare = DATE_RE.exec(trimmed);
  if (bare) {
    const month = Number(bare[2]);
    const day = Number(bare[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return bare[0];
    return null;
  }
  // Strict ISO datetimes only ('T' separator). A bare space after the date
  // (e.g. the catalog-level '2026-09-12 (wave 2)' stamp) is not a record date.
  const iso = /^(\d{4})-(\d{2})-(\d{2})T/.exec(trimmed);
  if (iso) return parseRecordDate(iso[1] + '-' + iso[2] + '-' + iso[3]);
  return null;
}

/** Latest usable date in a list, or null when none is usable. */
export function maxDate(values: ReadonlyArray<unknown>): string | null {
  let best: string | null = null;
  for (const value of values) {
    const parsed = parseRecordDate(value);
    if (parsed !== null && (best === null || parsed > best)) best = parsed;
  }
  return best;
}

/**
 * Newest-first stable sort. Dated items come first (newest date first);
 * undated items keep their incoming relative order after all dated items.
 * The input array is never mutated; ties between equal dates also keep
 * incoming order, so callers control the deterministic tie-break by the order
 * they pass in (sourceId ascending, curated rank, …).
 */
export function sortNewestFirst<T>(
  items: ReadonlyArray<T>,
  dateOf: (item: T) => string | null,
): T[] {
  return items
    .map((item, index) => ({ item, index, date: dateOf(item) }))
    .sort((a, b) => {
      if (a.date !== null && b.date !== null && a.date !== b.date) {
        return a.date > b.date ? -1 : 1;
      }
      if ((a.date === null) !== (b.date === null)) {
        return a.date === null ? 1 : -1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}
