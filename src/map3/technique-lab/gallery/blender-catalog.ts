/**
 * src/map3/technique-lab/gallery/blender-catalog.ts — tolerant reader for the
 * per-lane Blender catalogs (public/assets/world-studio/blender/<lane>/catalog.json)
 * plus the two assets that already ship at 6e9b2caf (hero bus, hero truck).
 *
 * Rules:
 * - Every optional field may be missing; a row needs only id + assetUrl.
 * - Thumbnails are never invented: a missing thumbnailUrl renders as a text tile.
 * - Ordering is curator `qualityRank` (higher first), then lane, then id. The
 *   UI must label this as curated order, never as measured quality.
 * - URLs are deploy-base-relative (`assets/...`); absolute file paths are rejected.
 */

import { maxDate } from './sorting';

export interface BlenderAsset {
  key: string;
  lane: string;
  id: string;
  title: string;
  assetUrl: string;
  thumbnailUrl: string | null;
  category: string | null;
  qualityRank: number | null;
  qualityReason: string | null;
  revision: string | null;
  authoredBy: { harness: string | null; model: string | null; effort: string | null } | null;
  sourceUrls: string[];
  license: string | null;
  method: string | null;
  limitations: string[];
  metrics: { triangles: number | null; materials: number | null; textureBytes: number | null } | null;
  sha256: string | null;
  /**
   * Optional recorded dates supplied by the lane catalog. Any or all may be
   * absent; a missing date is unknown, never guessed from revision or order.
   */
  createdAt: string | null;
  updatedAt: string | null;
  generatedAsOf: string | null;
}

export interface CatalogReadResult {
  assets: BlenderAsset[];
  /** Human-readable reasons for dropped rows/files. */
  ignored: string[];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Deploy-base-relative asset path: no scheme, no drive letter, no leading slash escape. */
export function isRelativeAssetUrl(value: string): boolean {
  return /^assets\/[\w\-./%]+$/.test(value) && !value.includes('..');
}

export function parseBlenderCatalog(lane: string, data: unknown): CatalogReadResult {
  const out: CatalogReadResult = { assets: [], ignored: [] };
  const normalized =
    typeof data === 'object' && data !== null && 'default' in data ? (data as { default: unknown }).default : data;
  if (typeof normalized !== 'object' || normalized === null) {
    out.ignored.push(`${lane}: catalog is not an object`);
    return out;
  }
  const root = normalized as Record<string, unknown>;
  if (root.schemaVersion !== undefined && root.schemaVersion !== 1) {
    out.ignored.push(`${lane}: schemaVersion ${String(root.schemaVersion)} not understood (expected 1); read tolerantly`);
  }
  if (!Array.isArray(root.assets)) {
    out.ignored.push(`${lane}: no assets[] array`);
    return out;
  }
  const seen = new Set<string>();
  root.assets.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null) {
      out.ignored.push(`${lane}: assets[${index}] is not an object`);
      return;
    }
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const assetUrl = str(r.assetUrl);
    if (!id || !assetUrl) {
      out.ignored.push(`${lane}: assets[${index}] lacks id or assetUrl`);
      return;
    }
    if (!isRelativeAssetUrl(assetUrl)) {
      out.ignored.push(`${lane}: ${id} assetUrl is not deploy-base-relative (assets/...); skipped`);
      return;
    }
    if (seen.has(id)) {
      out.ignored.push(`${lane}: duplicate asset id ${id}; first kept`);
      return;
    }
    seen.add(id);
    const thumb = str(r.thumbnailUrl);
    const authored = typeof r.authoredBy === 'object' && r.authoredBy !== null ? (r.authoredBy as Record<string, unknown>) : null;
    const metrics = typeof r.metrics === 'object' && r.metrics !== null ? (r.metrics as Record<string, unknown>) : null;
    out.assets.push({
      key: `${lane}/${id}`,
      lane,
      id,
      title: str(r.title) ?? id,
      assetUrl,
      thumbnailUrl: thumb && isRelativeAssetUrl(thumb) ? thumb : null,
      category: str(r.category),
      qualityRank: num(r.qualityRank),
      qualityReason: str(r.qualityReason),
      revision: num(r.revision) !== null ? String(r.revision) : str(r.revision),
      authoredBy: authored
        ? { harness: str(authored.harness), model: str(authored.model), effort: str(authored.effort) }
        : null,
      sourceUrls: Array.isArray(r.sourceUrls) ? r.sourceUrls.filter((u): u is string => typeof u === 'string') : [],
      license: str(r.license),
      method: str(r.method),
      limitations: Array.isArray(r.limitations) ? r.limitations.filter((l): l is string => typeof l === 'string') : [],
      metrics: metrics
        ? { triangles: num(metrics.triangles), materials: Array.isArray(metrics.materials) ? metrics.materials.length : num(metrics.materials), textureBytes: num(metrics.textureBytes) }
        : null,
      sha256: str(r.sha256),
      createdAt: str(r.createdAt),
      updatedAt: str(r.updatedAt),
      generatedAsOf: str(r.generatedAsOf),
    });
  });
  return out;
}

/**
 * Assets verified present at 6e9b2caf (paths and digests from
 * docs/world-studio-blender-assets.md; sizes 1,339,668 and 1,554,816 bytes).
 * No render thumbnails exist for them yet, so none are listed.
 */
export const BUILTIN_BLENDER_ASSETS: BlenderAsset[] = [
  {
    key: 'shipped/hero-bus',
    lane: 'shipped',
    id: 'hero-bus',
    title: 'Hero school bus (Blender, shipped)',
    assetUrl: 'assets/world-studio/blender/hero-bus.glb',
    thumbnailUrl: null,
    category: 'vehicle',
    qualityRank: 50,
    qualityReason: 'Curator placement: already shipping in the arena; not a measured score.',
    revision: '6e9b2cafd318ca2b2f67f9eedcf8d624fee30453',
    authoredBy: { harness: 'claude', model: 'opus', effort: null },
    sourceUrls: [],
    license: 'Original project asset (scripts/blender/world-studio/build_hero_bus.py)',
    method: 'Blender Python build script, glTF export with embedded PBR textures',
    limitations: ['No render thumbnail in this tree yet'],
    metrics: null,
    sha256: 'a7059b50bdd41281377a54cb65f51c51b06d67c4ca2ae03d7e0ee9982a6b0ff5',
    createdAt: null,
    updatedAt: null,
    generatedAsOf: null,
  },
  {
    key: 'shipped/hero-truck',
    lane: 'shipped',
    id: 'hero-truck',
    title: 'Hero truck and box trailer (Blender, shipped)',
    assetUrl: 'assets/world-studio/blender/hero-truck.glb',
    thumbnailUrl: null,
    category: 'vehicle',
    qualityRank: 50,
    qualityReason: 'Curator placement: already shipping in the arena; not a measured score.',
    revision: '6e9b2cafd318ca2b2f67f9eedcf8d624fee30453',
    authoredBy: { harness: 'claude', model: 'opus', effort: null },
    sourceUrls: [],
    license: 'Original project asset (scripts/blender/world-studio/build_hero_truck.py)',
    method: 'Blender Python build script, glTF export with embedded PBR textures',
    limitations: ['No render thumbnail in this tree yet'],
    metrics: null,
    sha256: 'b602d3037c5d6c23d174e17006a9b5ae6abb9de4835fba5d23fee377fdd74199',
    createdAt: null,
    updatedAt: null,
    generatedAsOf: null,
  },
];

/**
 * Latest recorded date for an asset, or null when the lane recorded none.
 * Only the three explicit date fields count; revision hashes, load order and
 * curated rank are never treated as dates.
 */
export function blenderAssetDate(
  asset: Pick<BlenderAsset, 'createdAt' | 'updatedAt' | 'generatedAsOf'>,
): string | null {
  return maxDate([asset.createdAt, asset.updatedAt, asset.generatedAsOf]);
}

/** Curated order: qualityRank desc (unranked last), then lane, then id. Stable. */
export function sortCurated(assets: BlenderAsset[]): BlenderAsset[] {
  return [...assets].sort((a, b) => {
    const ra = a.qualityRank ?? Number.NEGATIVE_INFINITY;
    const rb = b.qualityRank ?? Number.NEGATIVE_INFINITY;
    if (ra !== rb) return rb - ra;
    if (a.lane !== b.lane) return a.lane < b.lane ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Merge lanes; a later lane may not silently replace an earlier assetUrl. */
export function mergeAssets(groups: BlenderAsset[][]): CatalogReadResult {
  const byUrl = new Map<string, BlenderAsset>();
  const ignored: string[] = [];
  for (const group of groups) {
    for (const asset of group) {
      const prior = byUrl.get(asset.assetUrl);
      if (prior) {
        ignored.push(`${asset.key} repeats assetUrl of ${prior.key}; kept the first`);
        continue;
      }
      byUrl.set(asset.assetUrl, asset);
    }
  }
  return { assets: sortCurated([...byUrl.values()]), ignored };
}

/** Lane id from a Vite glob key like "/public/assets/world-studio/blender/<lane>/catalog.json". */
export function laneFromCatalogKey(key: string): string {
  const match = key.match(/blender\/([^/]+)\/catalog\.json$/);
  return match ? match[1] : key;
}
