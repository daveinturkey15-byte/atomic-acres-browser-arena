/**
 * The retained minimap structure layer, shared by EVERY arena.
 *
 * HF-510 (owner): the minimap must show "mainly where the walls are, not all
 * the tiny components within, like cover". This module is the single place the
 * structural silhouettes are rasterised, so the HUD look - line weight, fill,
 * contrast - is identical on Nuke Town, Terminal, RustRig, the Gun Range and
 * every other catalog arena. `src/minimap.ts` owns WHICH elements exist;
 * this module owns HOW they are drawn.
 *
 * WHAT IT COSTS WITHOUT A CACHE. HF-399 pre-rendered atomic-acres' road and
 * houses into an offscreen layer and left every other arena repainting, at the
 * 30 Hz minimap rate, one `fillRect` + one `strokeRect` per world collider and
 * one landmark path per physical cover. Measured on the PASS 94 HITL 5 head
 * (headless installed Chrome, real WebGPU device, 2560x1440, HIGH, Solo,
 * nuketown2, CDP CPU profile in
 * `docs/evidence/pass94/perf-hitl5/bisect/lane4-pre-*-nuketown2.json`),
 * `updateMinimap` held **0.87 ms of SELF time per rendered frame at the spawn
 * pose and 0.65 ms at the street pose** - the largest single application
 * function in both profiles. After the layer cache it is absent from the
 * top-25 self-time list at both poses.
 *
 * WHY A CACHE IS CORRECT. Neither input is per-frame data:
 *
 *   - `arena.houses` and the authored surface list are built by the arena
 *     factory and never mutated at runtime.
 *   - the world collider list IS dynamic (glass breaks, doors move, houses
 *     collapse), but `activeWorldColliders()` is revision-keyed and returns a
 *     STABLE ARRAY IDENTITY while nothing has changed, so a break, a door or a
 *     collapse repaints the layer exactly once.
 *
 * The layer repaints into its own retained canvas instead of allocating a new
 * one, so the worst case - an arena whose collider array identity changes on
 * every call, e.g. the gun range's patrolling dummies - costs what it costs
 * today plus one `drawImage`, and never a per-frame canvas allocation.
 */
import {
  buildMinimapStructuralElements,
  minimapLandmarkFootprint,
  type MinimapBounds,
  type MinimapElement,
  type MinimapHouseDescriptor,
  type MinimapSurfaceDescriptor,
} from './minimap';

type CachedCanvas = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D };

/**
 * ONE palette for every arena (HF-510 asked for a consistent, readable map).
 * Values are read against the minimap's own `rgba(7, 15, 18, .86)` ground:
 * the road reads as a dim slab, structure as a bright outline over a faint
 * fill. Nothing here is per-arena, so no map can drift into its own look.
 */
export const MINIMAP_STRUCTURE_STYLE = Object.freeze({
  road: Object.freeze({ fill: 'rgba(126, 137, 132, .30)', stroke: 'rgba(126, 137, 132, .30)', lineWidth: 0 }),
  building: Object.freeze({ fill: 'rgba(226, 240, 244, .16)', stroke: 'rgba(238, 248, 252, .95)', lineWidth: 2.5 }),
  wall: Object.freeze({ fill: 'rgba(226, 240, 244, .12)', stroke: 'rgba(226, 240, 244, .88)', lineWidth: 2 }),
});

export type MinimapStructureRecord = { id: string; kind: string; label: string };

export type MinimapStructureLayer = Readonly<{
  canvas: HTMLCanvasElement;
  elements: readonly MinimapElement[];
  /** Diagnostics projection: one row per drawn element, no cover landmarks. */
  records: readonly MinimapStructureRecord[];
}>;

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

type StructureLayerCache = {
  arena: object;
  colliders: readonly MinimapBounds[];
  coverCount: number;
  houseCount: number;
  surfaceCount: number;
  width: number;
  height: number;
  cached: CachedCanvas;
  layer: MinimapStructureLayer;
};
let structureLayer: StructureLayerCache | null = null;

/** Test/teardown hook: forget the retained layer so a new arena cannot inherit it. */
export function resetMinimapStructureLayer(): void {
  structureLayer = null;
}

/**
 * The structural silhouettes for the active arena, repainted only when the
 * arena, its collider revision, its authored lists or the canvas size change.
 */
export function activeMinimapStructureLayer(request: Readonly<{
  arena: object;
  bounds: MinimapBounds;
  width: number;
  height: number;
  colliders: readonly MinimapBounds[];
  cover: readonly MinimapBounds[];
  houses: readonly MinimapHouseDescriptor[];
  surfaces: readonly MinimapSurfaceDescriptor[];
}>): MinimapStructureLayer {
  const previous = structureLayer;
  if (
    previous
    && previous.arena === request.arena
    && previous.colliders === request.colliders
    && previous.coverCount === request.cover.length
    && previous.houseCount === request.houses.length
    && previous.surfaceCount === request.surfaces.length
    && previous.width === request.width
    && previous.height === request.height
  ) return previous.layer;

  const cached = layerCanvas(previous?.cached ?? null, request.width, request.height);
  const context = cached.context;
  const elements = buildMinimapStructuralElements({
    bounds: request.bounds,
    width: request.width,
    height: request.height,
    colliders: request.colliders,
    cover: request.cover,
    houses: request.houses,
    surfaces: request.surfaces,
  });
  for (const element of elements) {
    const style = MINIMAP_STRUCTURE_STYLE[element.className];
    const footprint = minimapLandmarkFootprint(element.bounds, request.bounds, request.width, request.height);
    context.fillStyle = style.fill;
    context.fillRect(footprint.x, footprint.y, footprint.width, footprint.height);
    if (style.lineWidth <= 0) continue;
    context.lineWidth = style.lineWidth;
    context.strokeStyle = style.stroke;
    context.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);
  }
  const layer: MinimapStructureLayer = Object.freeze({
    canvas: cached.canvas,
    elements,
    records: Object.freeze(elements.map((element) => ({
      id: element.id,
      kind: element.className,
      label: element.className.toUpperCase(),
    }))),
  });
  structureLayer = {
    arena: request.arena,
    colliders: request.colliders,
    coverCount: request.cover.length,
    houseCount: request.houses.length,
    surfaceCount: request.surfaces.length,
    width: request.width,
    height: request.height,
    cached,
    layer,
  };
  return layer;
}
