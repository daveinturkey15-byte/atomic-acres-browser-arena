/**
 * src/map3/technique-lab/gallery/url-targets.ts — same-host navigation targets
 * for URL-tab rows. No DOM, no fetch: pure resolution over the loaded sources
 * catalog, the demo manifest state and the loaded Blender assets, so every
 * rule here is unit-testable on the CPU.
 *
 * Honesty rules:
 * - Only rows the sources lane actually mapped to a skill
 *   (`skillMappings.length > 0`) may offer a target. Unmapped rows — including
 *   rows that happen to have a demo but no recorded skill mapping — resolve to
 *   null and stay visibly unmapped; a target is never guessed from a URL alone.
 * - A skill demo (same sourceId) wins when one is delivered. Otherwise the
 *   catalog mapping may identify a Blender asset: a skill mapping whose
 *   sourceReference names a loaded asset's assetUrl or key. Nothing else
 *   counts as identifying an asset.
 * - Dates come only from recorded catalog evidence (`inspectedAt`); a row
 *   without one has an unknown date, never an invented one.
 */

import type { BlenderAsset } from './blender-catalog';
import type { CatalogSource } from './sources';
import { maxDate } from './sorting';

/** Newest recorded evidence date for a catalog row, or null when unknown. */
export function latestEvidenceDate(
  catalog: CatalogSource | undefined,
): string | null {
  if (!catalog) return null;
  return maxDate(catalog.evidence.map((entry) => entry.inspectedAt));
}

/** A working same-host navigation target for a mapped URL row. */
export type UrlTarget =
  | { kind: 'demo'; sourceId: number }
  | { kind: 'blender'; assetKey: string; assetUrl: string };

/**
 * Resolve the same-host target for one URL row. `hasDemo` reports whether the
 * demo manifest delivered a factory for this sourceId; `catalog` is the
 * sources-lane row when loaded; `blenderAssets` are the currently loaded
 * Blender gallery assets. Returns null for unmapped rows and for mapped rows
 * with neither a demo nor a catalog-identified Blender asset.
 */
export function urlTarget(
  catalog: CatalogSource | undefined,
  hasDemo: boolean,
  sourceId: number,
  blenderAssets: ReadonlyArray<BlenderAsset>,
): UrlTarget | null {
  if (!catalog || catalog.skillMappings.length === 0) return null;
  if (hasDemo) return { kind: 'demo', sourceId };
  for (const mapping of catalog.skillMappings) {
    const reference = mapping.sourceReference;
    if (!reference) continue;
    const asset = blenderAssets.find(
      (candidate) =>
        reference.includes(candidate.assetUrl) ||
        reference.includes(candidate.key),
    );
    if (asset) {
      return { kind: 'blender', assetKey: asset.key, assetUrl: asset.assetUrl };
    }
  }
  return null;
}
