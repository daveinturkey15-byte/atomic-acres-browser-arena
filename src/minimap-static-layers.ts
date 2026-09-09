/**
 * HF-491 (perf lane 4): the retained minimap layers for every arena that does
 * NOT take the atomic-acres branch - Nuke Town Rebuild included.
 *
 * WHAT IT COSTS WITHOUT THIS. HF-399 pre-rendered atomic-acres' road, houses
 * and cover landmarks into an offscreen layer and left every other arena
 * repainting, at the 30 Hz minimap rate, one `fillRect` + one `strokeRect` per
 * world collider and one `drawMinimapLandmark` + label mapping per physical
 * cover. Measured on the PASS 94 HITL 5 head (headless installed Chrome, real
 * WebGPU device, 2560x1440, HIGH, Solo, nuketown2, CDP CPU profile in
 * `docs/evidence/pass94/perf-hitl5/bisect/lane4-pre-*-nuketown2.json`),
 * `updateMinimap` held **0.87 ms of SELF time per rendered frame at the spawn
 * pose and 0.65 ms at the street pose** - the largest single application
 * function in both profiles, about half the renderer's own full-scene matrix
 * walk. After this module it is absent from the top-25 self-time list at both
 * poses.
 *
 * WHY A CACHE IS CORRECT. Neither list is per-frame data:
 *
 *   - `arena.physicalCover` is authored by the arena builder and never mutated
 *     at runtime (every `physicalCover` push in `src/` is build-time). The
 *     cover layer is keyed on arena identity plus a cover-count tripwire, the
 *     same invariant the existing atomic-acres layer documents.
 *   - the world collider list IS dynamic (glass breaks, doors move, houses
 *     collapse), but `activeWorldColliders()` is revision-keyed and returns a
 *     STABLE ARRAY IDENTITY while nothing has changed. The collider layer is
 *     keyed on that identity, so a break, a door or a collapse repaints it
 *     exactly once.
 *
 * Both layers repaint into their own retained canvas instead of allocating a
 * new one, so the worst case - an arena whose collider array identity changes
 * on every call, e.g. the gun range's patrolling dummies - costs what it costs
 * today plus one `drawImage`, and never a per-frame canvas allocation.
 *
 * DRAW ORDER IS LOAD-BEARING, which is why this is two layers and not one:
 * colliders, then the live Domination zones, then the cover landmarks, then
 * the live targets.
 */
import {
  minimapLandmarkFootprint,
  minimapLandmarkLabel,
  physicalCoverMinimapKind,
  type MinimapBounds,
  type MinimapLandmarkFootprint,
  type MinimapLandmarkKind,
} from './minimap';

type CachedCanvas = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };

/** A physical cover entry, as far as the minimap is concerned. */
export type MinimapCoverSource = Readonly<{
  id: string;
  bounds: MinimapBounds;
  performanceVisualKind?: Exclude<MinimapLandmarkKind, 'bus'>;
}>;

export type MinimapLandmarkRecord = { id: string; kind: MinimapLandmarkKind; label: string };

export type MinimapLabelAnchor = Readonly<{ label: string; x: number; y: number }>;

/** Reuse the retained canvas when its backing size still matches. */
function layerCanvas(cached: CachedCanvas | null, width: number, height: number): CachedCanvas {
  if (cached && cached.canvas.width === width && cached.canvas.height === height) {
    cached.context.clearRect(0, 0, width, height);
    return cached;
  }
  const canvas = cached?.canvas ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas2D minimap layer is unavailable');
  return { canvas, context };
}

type ColliderLayer = {
  arena: object;
  colliders: readonly MinimapBounds[];
  width: number;
  height: number;
  fillStyle: string;
  strokeStyle: string;
  cached: CachedCanvas;
};
let colliderLayer: ColliderLayer | null = null;

/** The world-collider footprints, repainted only when the collider revision changes. */
export function activeMinimapColliderLayer(request: Readonly<{
  arena: object;
  colliders: readonly MinimapBounds[];
  bounds: MinimapBounds;
  width: number;
  height: number;
  fillStyle: string;
  strokeStyle: string;
}>): HTMLCanvasElement {
  const previous = colliderLayer;
  if (
    previous
    && previous.arena === request.arena
    && previous.colliders === request.colliders
    && previous.width === request.width
    && previous.height === request.height
    && previous.fillStyle === request.fillStyle
    && previous.strokeStyle === request.strokeStyle
  ) return previous.cached.canvas;
  const cached = layerCanvas(previous?.cached ?? null, request.width, request.height);
  const context = cached.context;
  context.lineWidth = 1.5;
  context.fillStyle = request.fillStyle;
  context.strokeStyle = request.strokeStyle;
  for (const collider of request.colliders) {
    const footprint = minimapLandmarkFootprint(collider, request.bounds, request.width, request.height);
    context.fillRect(footprint.x, footprint.y, footprint.width, footprint.height);
    context.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);
  }
  colliderLayer = { ...request, cached };
  return cached.canvas;
}

export type MinimapCoverLayer = Readonly<{
  canvas: HTMLCanvasElement;
  /** Landmark label anchors in minimap pixel space, before the player transform. */
  labelAnchors: readonly MinimapLabelAnchor[];
  landmarks: MinimapLandmarkRecord[];
}>;

type CoverLayerCache = {
  arena: object;
  coverCount: number;
  width: number;
  height: number;
  cached: CachedCanvas;
  layer: MinimapCoverLayer;
};
let coverLayer: CoverLayerCache | null = null;

/** The authored cover landmarks, repainted only when the arena or its cover list changes. */
export function activeMinimapCoverLayer(request: Readonly<{
  arena: object;
  cover: readonly MinimapCoverSource[];
  bounds: MinimapBounds;
  width: number;
  height: number;
  draw: (
    context: CanvasRenderingContext2D,
    id: string,
    kind: MinimapLandmarkKind,
    footprint: MinimapLandmarkFootprint,
  ) => void;
}>): MinimapCoverLayer {
  const previous = coverLayer;
  if (
    previous
    && previous.arena === request.arena
    && previous.coverCount === request.cover.length
    && previous.width === request.width
    && previous.height === request.height
  ) return previous.layer;
  const cached = layerCanvas(previous?.cached ?? null, request.width, request.height);
  const labelAnchors: MinimapLabelAnchor[] = [];
  const landmarks: MinimapLandmarkRecord[] = [];
  for (const cover of request.cover) {
    const kind = physicalCoverMinimapKind(cover.id, cover.performanceVisualKind);
    if (!kind) continue;
    const footprint = minimapLandmarkFootprint(cover.bounds, request.bounds, request.width, request.height);
    request.draw(cached.context, cover.id, kind, footprint);
    const label = minimapLandmarkLabel(kind);
    labelAnchors.push({ label, x: footprint.x + footprint.width / 2, y: footprint.y + footprint.height / 2 });
    landmarks.push({ id: cover.id, kind, label });
  }
  const layer: MinimapCoverLayer = Object.freeze({
    canvas: cached.canvas,
    labelAnchors: Object.freeze(labelAnchors),
    landmarks,
  });
  coverLayer = {
    arena: request.arena,
    coverCount: request.cover.length,
    width: request.width,
    height: request.height,
    cached,
    layer,
  };
  return layer;
}
