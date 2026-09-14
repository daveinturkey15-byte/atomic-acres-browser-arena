/**
 * Anchor fit for the interior set: what each asset is allowed to occupy, what it measures, and the
 * two corrections that can be applied to the shipped bytes without a re-export.
 *
 * Wave 3 recorded the overruns as *span* differences (measured span minus declared span). That
 * hid one of them: `interior-prop-credenza` is 0.482 m deep inside a 0.500 m footprint and still
 * pokes 12 mm out of it, because it is offset, not oversized. This module measures the four X/Z
 * faces separately, which is the number that decides whether furniture crosses a wall line.
 *
 * Two corrections are real and applied at load time:
 *
 *  1. **The sofa plinth rotation** (ADAPTER M1). `sofa-frame` carries the anchor yaw twice, so a
 *     2.20 x 0.88 m walnut plinth lies crosswise under a sofa whose body runs along Z and sticks
 *     0.65 m out of the footprint at each end. `repairInteriorScene` re-sets that one node to the
 *     yaw its fifteen siblings carry, which is a rigid rotation of a node whose mesh is centred on
 *     its own origin: X overrun 0.650 -> 0.002 m. It is conditional on measuring the defect, so a
 *     future re-export that fixes it in Blender is left alone rather than rotated a third time.
 *  2. **A bounded fit nudge.** Where an asset *fits* its footprint but sits proud of it, the
 *     smallest translation that brings it inside is applied, capped at `FIT_NUDGE_LIMIT_M`. It can
 *     never rotate, scale or deform, it is refused if the asset is larger than its footprint, and
 *     it is derived from the measured bounds rather than spelled as a magic offset. Today exactly
 *     one asset qualifies: the credenza, by 12 mm.
 *
 * What is NOT corrected here, because no transform can: an asset whose *span* exceeds its
 * footprint is too big, and shrinking it is a Blender edit. Those are listed in `ACCEPTED_OVERRUNS`
 * with the measured amount and the reason, and `assertInteriorFitPolicy` fails if any of them grows
 * or a new one appears. Accepting a measured overrun is not the same as relaxing a check.
 *
 * Presentation only, like the rest of this folder: a footprint here is a dressing envelope, never
 * a collider. The procedural kit keeps ballistic authority — see ADAPTER M3.
 */

import { INTERIOR_ASSETS, INTERIOR_HERO_ID, getInteriorAsset } from './catalog';
import type { InteriorAssetBounds, InteriorAssetEntry } from './catalog';

/**
 * The `house.ts` ground-floor anchors this set dresses, copied from the published config so an
 * integrator can assert runtime anchors and exported geometry still agree. `yaw` is radians about
 * +Y; `footprint` is `[width, depth]` before the yaw. Pinned against the built architecture by
 * `catalog.test.ts`.
 */
export const INTERIOR_ANCHOR_REFERENCE = {
  sofa: { lx: 5.4, lz: -4.4, yaw: -Math.PI / 2, footprint: [2.2, 0.9] },
  'coffee-table': { lx: 3.6, lz: -4.4, yaw: 0, footprint: [1.2, 0.6] },
  'tv-unit': { lx: 1, lz: -4.4, yaw: Math.PI / 2, footprint: [1.6, 0.5] },
  'dining-table': { lx: -3.4, lz: -3.4, yaw: 0, footprint: [1.6, 1] },
  'kitchen-run': { lx: -6.2, lz: 5.2, yaw: Math.PI / 2, footprint: [4.4, 0.65] },
} as const;

export type InteriorAnchorId = keyof typeof INTERIOR_ANCHOR_REFERENCE;

/** Catalog bounds are published to 4 decimals, so anything under a millimetre is rounding. */
export const FIT_EPSILON_M = 0.0015;

/** A nudge above this is a placement error someone should look at, not a fit correction. */
export const FIT_NUDGE_LIMIT_M = 0.025;

/** Outward overrun on each X/Z face, metres. Negative is clearance inside the footprint. */
export interface InteriorFitOverrun {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** The largest of the four: `<= 0` means the asset is inside its footprint on every face. */
  readonly worst: number;
}

export interface InteriorFitResult {
  readonly id: string;
  readonly anchorId: InteriorAnchorId | null;
  /** Footprint box in the house-local X/Z plane, anchor yaw applied. `null` when unanchored. */
  readonly declared: { readonly min: readonly [number, number]; readonly max: readonly [number, number] } | null;
  readonly measured: InteriorAssetBounds;
  readonly overrun: InteriorFitOverrun | null;
  /** Translation `[dx, 0, dz]` the loader applies, or `null`. */
  readonly nudge: readonly [number, number, number] | null;
  /** Overrun after every correction this module can apply to the shipped bytes. */
  readonly overrunAfter: InteriorFitOverrun | null;
  readonly status: 'unanchored' | 'fits' | 'fits-after-correction' | 'accepted-overrun' | 'unaccepted-overrun';
}

/** The footprint as a house-local X/Z box, with the anchor yaw applied to the extents. */
export function declaredAnchorBox(anchorId: InteriorAnchorId): {
  min: readonly [number, number];
  max: readonly [number, number];
} {
  const anchor = INTERIOR_ANCHOR_REFERENCE[anchorId];
  const [width, depth] = anchor.footprint;
  const turned = Math.abs(Math.abs(anchor.yaw) - Math.PI / 2) < 1e-9;
  const [spanX, spanZ] = turned ? [depth, width] : [width, depth];
  return {
    min: [anchor.lx - spanX / 2, anchor.lz - spanZ / 2],
    max: [anchor.lx + spanX / 2, anchor.lz + spanZ / 2],
  };
}

/** Per-face outward overrun of `bounds` against an anchor footprint. */
export function measureOverrun(bounds: InteriorAssetBounds, anchorId: InteriorAnchorId): InteriorFitOverrun {
  const declared = declaredAnchorBox(anchorId);
  const minX = declared.min[0] - bounds.min[0];
  const maxX = bounds.max[0] - declared.max[0];
  const minZ = declared.min[1] - bounds.min[2];
  const maxZ = bounds.max[2] - declared.max[1];
  return { minX, maxX, minZ, maxZ, worst: Math.max(minX, maxX, minZ, maxZ) };
}

/**
 * Smallest `[dx, 0, dz]` that brings `bounds` inside its footprint, or `null` if no translation
 * can: an asset wider than its footprint on an axis is refused outright on that axis, and a shift
 * over `FIT_NUDGE_LIMIT_M` is refused as too large to be a fit correction.
 */
export function fitNudgeFor(bounds: InteriorAssetBounds, anchorId: InteriorAnchorId): readonly [number, number, number] | null {
  const declared = declaredAnchorBox(anchorId);
  const axis = (lo: number, hi: number, dlo: number, dhi: number): number | null => {
    if (hi - lo > dhi - dlo + FIT_EPSILON_M) return null; // too big to fit however it is moved
    if (lo < dlo - FIT_EPSILON_M) return dlo - lo;
    if (hi > dhi + FIT_EPSILON_M) return dhi - hi;
    return 0;
  };
  const dx = axis(bounds.min[0], bounds.max[0], declared.min[0], declared.max[0]);
  const dz = axis(bounds.min[2], bounds.max[2], declared.min[1], declared.max[1]);
  if (dx === null && dz === null) return null;
  const shift: [number, number, number] = [dx ?? 0, 0, dz ?? 0];
  if (shift[0] === 0 && shift[2] === 0) return null;
  if (Math.hypot(shift[0], shift[2]) > FIT_NUDGE_LIMIT_M) return null;
  return shift;
}

/**
 * Overruns that survive every correction available without Blender, with the measured worst face.
 *
 * These are pins, not permissions: `assertInteriorFitPolicy` throws if one grows past its recorded
 * value or if an asset not listed here overruns at all. The procedural containment check in
 * `src/world-studio/interiors` is untouched and must stay untouched — it governs different
 * geometry and is the reason those pieces are filtered out rather than made to agree.
 */
export const ACCEPTED_OVERRUNS: Readonly<Record<string, { readonly worst: number; readonly why: string }>> =
  Object.freeze({
    'interior-prop-sofa': {
      worst: 0.155,
      why: 'Arms and their walnut caps run 0.155 m past each end of the 2.20 m footprint. Real ' +
        'furniture: the anchor length is the seating span. The 0.650 m plinth overrun that used to ' +
        'dominate this asset is repaired at load time.',
    },
    'interior-prop-coffee-table': {
      worst: 0.07,
      why: 'The surfboard top is authored 1.34 m long inside a 1.20 m footprint, 0.07 m proud at ' +
        'each end. Corrected in build_interiors.py for the next export; the shipped bytes still ' +
        'measure 1.34.',
    },
    'interior-prop-kitchen-run': {
      worst: 0.02,
      why: 'Two separate millimetre-scale reasons, measured rather than assumed: the chrome door ' +
        'pulls stood 0.014 m proud of the 0.65 m depth, and the worktop, splash lip and ' +
        'backsplash were authored at `length + 0.04`, overhanging the 4.40 m run by 0.020 m at ' +
        'each end. Wave 5 declined to re-author either; wave 6 did both at source - base depth ' +
        '0.62 -> 0.60 m with the assembly biased 0.007 m back so the pulls keep their standoff ' +
        'inside the footprint, and the three `length + 0.04` spans trimmed to `length`, the ' +
        'bullnose staying on the front edge where it belongs. The shipped bytes still measure ' +
        '0.664 x 4.440 and no runtime transform can shrink geometry, so this stays accepted at ' +
        'its measured 0.020 m until Blender is run.',
    },
    'interior-prop-dinette': {
      worst: 0.5554,
      why: 'The four chairs stand outside the table they surround, which is what the 1.6 x 1.0 m ' +
        '`dining-table` footprint describes. Not a defect and deliberately not "corrected": ' +
        'shrinking a dinette to hide its chairs would be vandalism. Root should treat this ' +
        "asset's occupancy as its measured bounds, not its anchor box.",
    },
  });

/** Evaluates fit for one asset from its catalog bounds. */
export function evaluateInteriorFit(asset: InteriorAssetEntry): InteriorFitResult {
  if (asset.anchorId === null) {
    return {
      id: asset.id,
      anchorId: null,
      declared: null,
      measured: asset.bounds,
      overrun: null,
      nudge: null,
      overrunAfter: null,
      status: 'unanchored',
    };
  }
  const anchorId = asset.anchorId as InteriorAnchorId;
  const overrun = measureOverrun(asset.bounds, anchorId);
  const repaired = repairedBoundsFor(asset.id) ?? asset.bounds;
  const nudge = fitNudgeFor(repaired, anchorId);
  const shifted: InteriorAssetBounds = nudge
    ? {
        min: [repaired.min[0] + nudge[0], repaired.min[1], repaired.min[2] + nudge[2]],
        max: [repaired.max[0] + nudge[0], repaired.max[1], repaired.max[2] + nudge[2]],
      }
    : repaired;
  const overrunAfter = measureOverrun(shifted, anchorId);
  const accepted = ACCEPTED_OVERRUNS[asset.id];
  let status: InteriorFitResult['status'];
  if (overrunAfter.worst <= FIT_EPSILON_M) {
    status = overrun.worst <= FIT_EPSILON_M ? 'fits' : 'fits-after-correction';
  } else if (accepted && overrunAfter.worst <= accepted.worst + FIT_EPSILON_M) {
    status = 'accepted-overrun';
  } else {
    status = 'unaccepted-overrun';
  }
  return { id: asset.id, anchorId, declared: declaredAnchorBox(anchorId), measured: asset.bounds, overrun, nudge, overrunAfter, status };
}

/** Fit for every catalog asset, in catalog order. */
export function evaluateInteriorFits(): readonly InteriorFitResult[] {
  return INTERIOR_ASSETS.map(evaluateInteriorFit);
}

/**
 * Throws if any anchored asset overruns its footprint by more than this module has measured and
 * recorded. A re-export that moves furniture out of its anchor fails here instead of in a frame.
 */
export function assertInteriorFitPolicy(): void {
  const failures = evaluateInteriorFits()
    .filter((fit) => fit.status === 'unaccepted-overrun')
    .map((fit) => `${fit.id} overruns ${fit.anchorId} by ${fit.overrunAfter!.worst.toFixed(4)} m after correction`);
  if (failures.length > 0) {
    throw new Error(`Interior assets exceed their anchor footprints: ${failures.join('; ')}`);
  }
}

/**
 * The one node-level defect repair, ADAPTER M1.
 *
 * `build_interiors.py` applied the anchor yaw to `sofa-frame` twice. Both the hero composition and
 * the sofa prop carry the affected node, under the same name, because the prop is a slice of the
 * hero and not a separate export.
 */
export const SOFA_PLINTH_REPAIR = Object.freeze({
  nodeName: 'sofa-frame',
  /** Measured in the shipped bytes: +/-180 deg about +Y. */
  defectiveYawRadians: Math.PI,
  /** What its fifteen siblings carry, and what the `sofa` anchor asks for. */
  correctedYawRadians: -Math.PI / 2,
  /** Legs sit at +/-0.64 deg of splay, so the match must be tight enough not to catch them. */
  toleranceRadians: 0.01,
});

/**
 * Bounds an asset measures after the node repair, measured from the shipped GLB by
 * `scripts/blender/world-studio/interiors/fit_report.py` and pinned by `fit.test.ts`, which
 * recomputes them from the bytes rather than trusting these numbers.
 *
 * The hero changes too, which is worth stating because it is easy to assume it would not: the
 * crosswise plinth was the *whole set's* eastmost geometry, so the hero's published max X of 6.500
 * m was the defect. Repaired, the composition measures 5.8547 m and the set is 0.645 m narrower
 * than every document in this lane says. Y and Z are untouched by the repair in both assets.
 */
const REPAIRED_BOUNDS: Readonly<Record<string, InteriorAssetBounds>> = Object.freeze({
  'interior-prop-sofa': { min: [4.95, -0.0054, -5.655], max: [5.8547, 0.9511, -3.145] },
  [INTERIOR_HERO_ID]: { min: [-6.59, -0.0054, -7.5675], max: [5.8547, 2.5314, 7.42] },
});

export function repairedBoundsFor(id: string): InteriorAssetBounds | null {
  return REPAIRED_BOUNDS[id] ?? null;
}

/** Minimal shape of the loaded node this module needs; `THREE.Object3D` satisfies it. */
interface RepairableNode {
  name: string;
  rotation: { y: number };
  position: { x: number; z: number };
  traverse(callback: (node: RepairableNode) => void): void;
}

/**
 * Applies the corrections above to one loaded asset subtree and returns what it did, so a caller
 * can log or assert it instead of guessing. Safe to call on an already-correct payload: every
 * repair checks the defect it fixes is present first, so a future re-export is left untouched.
 */
export function repairInteriorScene(scene: RepairableNode, assetId: string | null): readonly string[] {
  const applied: string[] = [];
  const { nodeName, defectiveYawRadians, correctedYawRadians, toleranceRadians } = SOFA_PLINTH_REPAIR;
  scene.traverse((node) => {
    if (node.name !== nodeName) return;
    if (Math.abs(Math.abs(node.rotation.y) - defectiveYawRadians) > toleranceRadians) return;
    node.rotation.y = correctedYawRadians;
    applied.push(`${nodeName}: yaw 180 deg -> -90 deg (ADAPTER M1)`);
  });

  if (assetId !== null && assetId !== INTERIOR_HERO_ID) {
    const asset = getInteriorAsset(assetId);
    if (asset.anchorId !== null) {
      const anchorId = asset.anchorId as InteriorAnchorId;
      const bounds = repairedBoundsFor(assetId) ?? asset.bounds;
      const nudge = fitNudgeFor(bounds, anchorId);
      if (nudge) {
        scene.position.x += nudge[0];
        scene.position.z += nudge[2];
        applied.push(
          `${assetId}: nudged ${(Math.hypot(nudge[0], nudge[2]) * 1000).toFixed(0)} mm inside the ${anchorId} footprint`,
        );
      }
    }
  }
  return applied;
}
