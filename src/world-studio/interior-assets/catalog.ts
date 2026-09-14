/**
 * Typed catalog for the ten interior GLBs exported by lane `interiors-night-20260912`.
 *
 * This is the narrow adapter root integrates against. It exists because the shipped
 * `public/assets/world-studio/blender/interiors/catalog.json` is a *build artefact* — generated
 * from the measured Blender run, fetched at runtime if anyone wants it, and carrying no type
 * information and no integration rules. The two facts an integrator most needs are not in it:
 *
 *  1. **The nine props are an exact partition of the hero composition, not alternatives to it.**
 *     `build_interiors.py` exports the hero from every object in the set and then exports nine
 *     disjoint subsets of *those same objects*, selected by name prefix, with `use_selection=True`
 *     and no re-origin. Object counts sum to the hero's 182, triangles to its 33184, and the union
 *     of the nine prop AABBs equals the hero AABB on all six faces. Loading the hero together with
 *     any prop therefore draws that furniture twice, coincident, at the same coordinates.
 *     `selectInteriorAssets` refuses the mix rather than leaving it to be found in a frame.
 *
 *  2. **Every GLB is authored in the house-local frame, already at its anchor.** No prop sits at
 *     its own origin: `interior-prop-kitchen-run.glb` measures X [-6.525, -5.861], Z [2.98, 7.42]
 *     straight out of the container, which is the 4.4 x 0.65 m footprint at anchor (-6.2, 5.2)
 *     under yaw PI/2. Props are placed by loading them, not by positioning them.
 *
 * Presentation only. Nothing here is a collider, spawn, patrol point or shot surface, and the
 * bounds below must not be used to derive collision — see `docs/technique-lab/interiors/ADAPTER.md`
 * for what the procedural kit still owns.
 */

/** `composition` is the whole set in one file; `prop` is a disjoint slice of that same set. */
export type InteriorAssetKind = 'composition' | 'prop';

/**
 * Axis-aligned bounds in the house-local frame, metres, `y = 0` at floor level.
 *
 * Measured from the GLB container by composing the node transforms — not copied from the Blender
 * source and not read from an accessor in isolation. Accessor `min`/`max` alone are mesh-local and
 * report about +/-2.22 m for a 14 m room; `catalog.test.ts` recomputes these from the shipped
 * bytes so a re-export that moves anything fails the test instead of drifting silently.
 */
export interface InteriorAssetBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface InteriorAssetEntry {
  /** Catalog id, identical to the `id` of the matching row in `catalog.json`. */
  readonly id: string;
  /** Deploy-base-relative path, identical to that row's `assetUrl`. */
  readonly path: string;
  readonly kind: InteriorAssetKind;
  /**
   * The *house-local* anchor id from `house.ts` this asset dresses, or `null` when the Blender
   * source placed it at a coordinate no anchor publishes.
   *
   * `house.ts` publishes anchors as `` `${houseId}-${anchorId}` ``, so this is a suffix, not a
   * published id. Use `publishedAnchorIdsFor` to get the real ones, and pass it the house `id`
   * from `STUDIO_HOUSES` — `'teal-house'`, giving `teal-house-sofa`. Not the house `side`
   * (`'teal'`): `teal-sofa` is an id nothing publishes, and filtering on it matches nothing and
   * reports no error.
   *
   * Two ids deliberately do not match their prop's name: `interior-prop-credenza` dresses the
   * `tv-unit` anchor and `interior-prop-dinette` dresses `dining-table`. A filter written against
   * prop names rather than this field silently keeps two procedural pieces.
   */
  readonly anchorId: string | null;
  readonly bounds: InteriorAssetBounds;
}

/** Directory every asset below lives in, relative to the deployment base. */
export const INTERIOR_ASSET_DIRECTORY = 'assets/world-studio/blender/interiors';

export const INTERIOR_HERO_ID = 'interior-hero-teal-living-kitchen';

const entry = (
  id: string,
  kind: InteriorAssetKind,
  anchorId: string | null,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): InteriorAssetEntry => ({
  id,
  path: `${INTERIOR_ASSET_DIRECTORY}/${id}.glb`,
  kind,
  anchorId,
  bounds: { min, max },
});

/**
 * The ten shipped assets. Order matches `catalog.json`, hero first.
 *
 * The four props with `anchorId: null` — armchair, fridge, area rug and accents — were placed by
 * `build_interiors.py` at coordinates it chose itself (armchair 3.4/-6.6 yaw 28 deg, fridge
 * -6.25/2.05 yaw PI/2, rug 3.9/-4.5, accents at four separate points). They have no procedural
 * counterpart to replace and no published anchor authority behind them, so moving one is an owner
 * decision rather than a build change.
 */
export const INTERIOR_ASSETS: readonly InteriorAssetEntry[] = Object.freeze([
  entry(INTERIOR_HERO_ID, 'composition', null, [-6.59, -0.0054, -7.5675], [6.5, 2.5314, 7.42]),
  entry('interior-prop-sofa', 'prop', 'sofa', [4.3, -0.0054, -5.655], [6.5, 0.9511, -3.145]),
  entry('interior-prop-coffee-table', 'prop', 'coffee-table', [2.93, -0.0031, -4.6137], [4.27, 0.4906, -4.1863]),
  entry('interior-prop-credenza', 'prop', 'tv-unit', [0.78, -0.002, -5.18], [1.262, 1.3, -3.62]),
  entry('interior-prop-armchair', 'prop', null, [2.9479, -0.0031, -7.0846], [3.8521, 0.9605, -6.1696]),
  entry('interior-prop-kitchen-run', 'prop', 'kitchen-run', [-6.525, 0, 2.98], [-5.861, 2.24, 7.42]),
  entry('interior-prop-fridge', 'prop', null, [-6.59, 0, 1.69], [-5.855, 1.71, 2.41]),
  entry('interior-prop-dinette', 'prop', 'dining-table', [-4.5754, 0, -4.4554], [-2.2246, 0.8647, -2.3446]),
  entry('interior-prop-area-rug', 'prop', null, [2.23, 0.001, -5.67], [5.57, 0.02, -3.33]),
  entry('interior-prop-accents', 'prop', null, [-1.712, 0, -7.5675], [5.16, 2.5314, -0.888]),
]);

const BY_ID = new Map(INTERIOR_ASSETS.map((asset) => [asset.id, asset]));

export const INTERIOR_PROP_IDS: readonly string[] = Object.freeze(
  INTERIOR_ASSETS.filter((asset) => asset.kind === 'prop').map((asset) => asset.id),
);

/** Throws on an unknown id rather than returning `undefined` for a caller to ignore. */
export function getInteriorAsset(id: string): InteriorAssetEntry {
  const asset = BY_ID.get(id);
  if (!asset) {
    throw new Error(`Unknown interior asset '${id}'. Known ids: ${[...BY_ID.keys()].join(', ')}`);
  }
  return asset;
}

/**
 * Validates a selection and returns it in catalog order.
 *
 * Refuses an empty selection, an unknown id, a duplicate, and — the case this function exists for
 * — any mix of the hero composition with a prop, because the props are slices of the hero and not
 * additions to it.
 */
export function selectInteriorAssets(ids: readonly string[]): readonly InteriorAssetEntry[] {
  if (ids.length === 0) throw new Error('Interior selection is empty; name at least one asset id.');
  const seen = new Set<string>();
  for (const id of ids) {
    getInteriorAsset(id);
    if (seen.has(id)) throw new Error(`Interior asset '${id}' selected twice.`);
    seen.add(id);
  }
  const props = ids.filter((id) => getInteriorAsset(id).kind === 'prop');
  if (seen.has(INTERIOR_HERO_ID) && props.length > 0) {
    throw new Error(
      `'${INTERIOR_HERO_ID}' already contains every prop; selecting it with ${props.join(', ')} ` +
        'would draw that furniture twice at the same coordinates. Choose the hero or a set of props.',
    );
  }
  return INTERIOR_ASSETS.filter((asset) => seen.has(asset.id));
}

/** Deploy-base-relative paths for a validated selection, ready for the loader. */
export function selectInteriorAssetPaths(ids: readonly string[]): readonly string[] {
  return selectInteriorAssets(ids).map((asset) => asset.path);
}

/**
 * Published `house.ts` anchor ids a selection dresses, for the house it is being placed on.
 *
 * This is the list root must remove from the array it passes to `createStudioInteriors(...)`, and
 * *only* that array: the lighting planner should keep the full anchor list, because the practicals
 * still belong to those rooms. Selecting the hero returns all five ground-floor anchors.
 *
 * `houseId` is `STUDIO_HOUSES[n].id` — `'teal-house'`, not the `side` `'teal'`. Passing the side
 * returns ids nothing publishes, so the filter silently removes nothing and the procedural
 * furniture stays standing inside the Blender furniture.
 *
 * Anchors are returned for one house id at a time on purpose. `house.ts` prefixes every anchor
 * with its house, so a suffix match like `endsWith('-sofa')` would also strip the yellow house's
 * sofa, which this set does not dress.
 */
export function publishedAnchorIdsFor(houseId: string, ids: readonly string[]): readonly string[] {
  const selection = selectInteriorAssets(ids);
  const local =
    selection.some((asset) => asset.id === INTERIOR_HERO_ID)
      ? INTERIOR_ASSETS.filter((asset) => asset.anchorId !== null).map((asset) => asset.anchorId as string)
      : selection.map((asset) => asset.anchorId).filter((id): id is string => id !== null);
  return local.map((anchorId) => `${houseId}-${anchorId}`);
}

/** Union of the house-local bounds of a validated selection. */
export function interiorSelectionBounds(ids: readonly string[]): InteriorAssetBounds {
  const selection = selectInteriorAssets(ids);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const asset of selection) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], asset.bounds.min[axis]);
      max[axis] = Math.max(max[axis], asset.bounds.max[axis]);
    }
  }
  return { min, max };
}
