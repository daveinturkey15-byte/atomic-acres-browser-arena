/**
 * World-studio house presentation substitution.
 *
 * Wires the two audited Blender house shells (`src/world-studio/houses`) into the arena as
 * presentation-only art. This module owns exactly one decision: after a house's load has
 * resolved AND its semantic audit has passed, which procedural presentation nodes may be set
 * invisible. It creates, derives and modifies no collider, shot surface, spawn, route, ramp,
 * breakable-window registration or navigation record. Physics is never rebuilt from meshes.
 *
 * WHAT IS HIDDEN. `proceduralPartitionNodes(architectureRoot, houseId)` names every merged
 * mesh `world-studio-<houseId>-*`, which is the whole procedural house: exterior, interior
 * partitions and stair. It is hidden together (`visible = false`, never removed or disposed) so
 * a rollback costs one boolean. The furniture root `world-studio-interiors-*` is a different
 * partition, is not reproduced in the shells, and is never touched here.
 *
 * WHAT IS NOT HIDDEN — the glazing decision. The procedural glass panes are also named
 * `world-studio-<houseId>-glass:<solid-id>` (one mesh per pane, `build.ts:211`) and they ARE the
 * dynamic breakable-window presentation: `arena.ts` registers each one in `breakableWindows`,
 * and the game toggles `pane.mesh.visible` on break and repair. Each GLB carries 22 pane
 * *markers* with exact `atomic_window_id`s but only ONE glass mesh for all 22 panes, so no
 * per-pane break can be projected onto it. The runtime therefore cannot prove a safe per-pane
 * binding. Decision: every procedural breakable pane stays visible and authoritative, and the
 * GLB glass mesh is set invisible. No opaque duplicate, no superposed second pane, no second
 * window authority. The marker ids are still reconciled against the arena's registry and the
 * result is reported, so a later lane can revisit the decision with evidence.
 *
 * RAYCASTS. `legacy-main.ts:activeRaycastMeshes` drops invisible meshes, so the hidden
 * procedural house would leave knife/world raycasts. The visible opaque GLB meshes join
 * `raycastMeshes` exactly as the hero vehicles do in `arena.ts`; the hidden GLB glass does not.
 * Ballistic shot authority is `shotSurfaces`/`physicsColliders` and is untouched.
 *
 * PENDING ROOT. `createStudioHouseShells` attaches each GLB as its own load resolves, before
 * the aggregate `ready` settles, so a partially loaded root would overlap the procedural houses
 * (teal GLB over teal procedural while yellow is still pending or about to reject). The root is
 * therefore `visible = false` from creation and is revealed only after the aggregate decision,
 * and only when at least one house passed. A failed audit detaches its scene; a rejected
 * aggregate releases the loader; the procedural art stays visible in both cases.
 *
 * OWNERSHIP. The loader owns every scene it attached or receives late, and its `dispose()` is
 * the only thing that releases geometry/materials/textures, each exactly once. This module
 * never disposes a resource: it detaches, hides and toggles booleans. `releaseShells()` calls
 * the loader's `dispose()` at most once per generation (aggregate rejection or handle dispose).
 *
 * GENERATIONS. `attach()` returns a handle. `dispose()` on that handle retires its generation:
 * a load that resolves afterwards is released by the loader rather than attached, and can never
 * hide a procedural house. Disposal is idempotent and restores anything this generation hid.
 */

import * as THREE from 'three';
import type { BreakableWindow } from '../../map';
import {
  HOUSE_SHELLS,
  createStudioHouseShells,
  proceduralPartitionNodes,
  type HouseShellAudit,
  type HouseVariant,
  type StudioHouseShellOptions,
  type StudioHouseShells,
} from '../houses';

export { HOUSE_SHELLS, TEAL_HOUSE_SHELL_PATH, YELLOW_HOUSE_SHELL_PATH } from '../houses';

export type HousePresentationStatus = 'loading' | 'ready' | 'disposed' | `failed: ${string}`;

export interface HouseGlassBinding {
  /** Marker ids present in the GLB and registered in the arena's breakable-window registry. */
  readonly matched: readonly string[];
  /** Marker ids in the GLB with no arena registration. */
  readonly unregistered: readonly string[];
  /** Arena registrations for this house that no GLB marker names. */
  readonly unmarked: readonly string[];
  /** Number of independently identifiable glass meshes in the GLB. */
  readonly glassMeshes: number;
  /**
   * Always `'procedural-dynamic-glass'` in this lane: the GLB glass is hidden and the arena's
   * breakable panes stay visible. A future per-pane binding must change this value explicitly.
   */
  readonly authority: 'procedural-dynamic-glass';
}

export interface HousePresentationOutcome {
  readonly variant: HouseVariant;
  readonly houseId: string;
  /** True only when the load resolved, the audit passed and the procedural art was hidden. */
  readonly substituted: boolean;
  readonly audit: HouseShellAudit | null;
  readonly glass: HouseGlassBinding | null;
  /** Names of the procedural nodes hidden for this house; empty unless `substituted`. */
  readonly hiddenNodes: readonly string[];
  /** Names of the procedural nodes deliberately kept visible (the dynamic glass panes). */
  readonly retainedNodes: readonly string[];
  readonly reason: string;
}

export interface HousePresentationOptions extends StudioHouseShellOptions {
  /** Test seam: a factory returning a loader-shaped object. Defaults to the real shell loader. */
  createShells?: (options: StudioHouseShellOptions) => StudioHouseShells;
}

export interface HousePresentationContext {
  /** The procedural architecture root whose `world-studio-<houseId>-*` descendants may hide. */
  architectureRoot: THREE.Object3D;
  /** The arena's dynamic glass registry. Read only; never mutated. */
  breakableWindows: readonly BreakableWindow[];
  /** Arena raycast list. Visible opaque GLB meshes are appended, mirroring the hero loader. */
  raycastMeshes: THREE.Object3D[];
}

export interface HousePresentation {
  /**
   * Parent this immediately. Shells appear inside it as they load, but it stays `visible = false`
   * until every house has been decided and is revealed only when at least one house passed.
   */
  readonly root: THREE.Group;
  /** Resolves after every house has been decided. Never rejects: a failure is an outcome. */
  readonly ready: Promise<ReadonlyMap<HouseVariant, HousePresentationOutcome>>;
  readonly outcomes: ReadonlyMap<HouseVariant, HousePresentationOutcome>;
  status(): HousePresentationStatus;
  /** Idempotent. Restores hidden procedural art, releases GLB resources, retires this generation. */
  dispose(): void;
}

/** Procedural pane meshes carry `world-studio-<houseId>-glass:` as their merged-bucket name. */
export function isProceduralGlassNode(node: THREE.Object3D, houseId: string): boolean {
  return node.name.startsWith(`world-studio-${houseId}-glass:`) || node.userData.breakableWindowId !== undefined;
}

/** A GLB mesh whose glTF extras or material mark it as glazing. */
export function isShellGlassMesh(node: THREE.Object3D): boolean {
  const mesh = node as Partial<THREE.Mesh>;
  if (!mesh.isMesh || !mesh.material) return false;
  const data = node.userData as Record<string, unknown>;
  const nested = data.extras && typeof data.extras === 'object' ? (data.extras as Record<string, unknown>) : {};
  if (data.atomic_material_slot === 'glass' || nested.atomic_material_slot === 'glass') return true;
  if (/-glass$/.test(node.name)) return true;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((material) => material.transparent === true && material.depthWrite === false);
}

function reconcileGlass(scene: THREE.Object3D, audit: HouseShellAudit, houseId: string, registry: readonly BreakableWindow[]): HouseGlassBinding {
  const registered = new Set(registry.map((pane) => pane.id).filter((id) => id.startsWith(`world-studio-window:${houseId}-`)));
  const markers = new Set(audit.windowIds);
  let glassMeshes = 0;
  scene.traverse((node) => { if (isShellGlassMesh(node)) glassMeshes += 1; });
  return Object.freeze({
    matched: [...markers].filter((id) => registered.has(id)).sort(),
    unregistered: [...markers].filter((id) => !registered.has(id)).sort(),
    unmarked: [...registered].filter((id) => !markers.has(id)).sort(),
    glassMeshes,
    authority: 'procedural-dynamic-glass',
  });
}

function failedOutcome(variant: HouseVariant, houseId: string, audit: HouseShellAudit | null, reason: string): HousePresentationOutcome {
  return Object.freeze({ variant, houseId, substituted: false, audit, glass: null, hiddenNodes: [], retainedNodes: [], reason });
}

/**
 * Attaches the house presentation to `context`. The returned root must be parented by the
 * caller immediately; it stays invisible until every house has been decided, and substitution
 * happens only after `ready`, per house, and only on a pass.
 */
export function attachHousePresentation(context: HousePresentationContext, options: HousePresentationOptions = {}): HousePresentation {
  const { createShells = createStudioHouseShells, ...loaderOptions } = options;
  const shells = createShells(loaderOptions);
  const root = shells.root;
  root.name = 'world-studio-house-presentation';
  root.userData.presentationOnly = true;
  // Pending-root rule: the loader attaches shells as they land; none may show before the decision.
  root.visible = false;

  const wanted = loaderOptions.variants
    ? HOUSE_SHELLS.filter((spec) => loaderOptions.variants!.includes(spec.variant))
    : HOUSE_SHELLS;
  const outcomes = new Map<HouseVariant, HousePresentationOutcome>();
  const hidden: THREE.Object3D[] = [];
  const attachedRaycastMeshes: THREE.Object3D[] = [];
  let status: HousePresentationStatus = 'loading';
  let disposed = false;
  let shellsReleased = false;

  /** The loader is the sole resource disposer; it is asked exactly once per generation. */
  const releaseShells = (): void => {
    if (shellsReleased) return;
    shellsReleased = true;
    shells.dispose();
  };

  const substitute = (variant: HouseVariant, houseId: string, audit: HouseShellAudit): HousePresentationOutcome => {
    const scene = root.getObjectByName(audit.partition);
    if (!scene) return failedOutcome(variant, houseId, audit, 'audit passed but the shell is not attached');
    const glass = reconcileGlass(scene, audit, houseId, context.breakableWindows);
    // Glazing: the GLB's single glass mesh cannot follow 22 independent break states.
    scene.traverse((node) => { if (isShellGlassMesh(node)) node.visible = false; });
    const hiddenNodes: string[] = [];
    const retainedNodes: string[] = [];
    for (const node of proceduralPartitionNodes(context.architectureRoot, houseId)) {
      if (isProceduralGlassNode(node, houseId)) { retainedNodes.push(node.name); continue; }
      if (node.visible) { node.visible = false; hidden.push(node); }
      hiddenNodes.push(node.name);
    }
    scene.traverse((node) => {
      if (!(node as Partial<THREE.Mesh>).isMesh || !node.visible) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (!context.raycastMeshes.includes(node)) { context.raycastMeshes.push(node); attachedRaycastMeshes.push(node); }
    });
    return Object.freeze({
      variant, houseId, substituted: true, audit, glass, hiddenNodes, retainedNodes,
      reason: `audit passed; ${hiddenNodes.length} procedural node(s) hidden, ${retainedNodes.length} dynamic pane(s) retained, `
        + `GLB glass hidden (${glass.matched.length} marker(s) bound, ${glass.unregistered.length} unregistered pane marker(s))`,
    });
  };

  const restore = (): void => {
    for (const node of hidden) node.visible = true;
    hidden.length = 0;
    for (const mesh of attachedRaycastMeshes) {
      const index = context.raycastMeshes.indexOf(mesh);
      if (index >= 0) context.raycastMeshes.splice(index, 1);
    }
    attachedRaycastMeshes.length = 0;
  };

  const ready = shells.ready.then(
    () => {
      if (disposed) return;
      let passed = 0;
      for (const spec of wanted) {
        const audit = shells.audits.get(spec.variant) ?? null;
        if (!audit) {
          outcomes.set(spec.variant, failedOutcome(spec.variant, spec.houseId, null, 'load resolved without an audit'));
        } else if (!audit.passed) {
          outcomes.set(spec.variant, failedOutcome(spec.variant, spec.houseId, audit, `audit failed: ${audit.failures.join('; ')}`));
          // Detach only. The scene stays in the loader's `loaded[]`; its dispose() releases it once.
          const scene = root.getObjectByName(audit.partition);
          if (scene) { scene.visible = false; root.remove(scene); }
        } else {
          const outcome = substitute(spec.variant, spec.houseId, audit);
          outcomes.set(spec.variant, outcome);
          if (outcome.substituted) passed += 1;
        }
      }
      // The aggregate decision is complete: reveal the root only for surviving passed shells.
      root.visible = passed > 0;
      status = 'ready';
    },
    (error: unknown) => {
      if (disposed) return;
      const reason = `load failed: ${String(error)}`;
      for (const spec of wanted) outcomes.set(spec.variant, failedOutcome(spec.variant, spec.houseId, null, reason));
      // Promise.all rejected on the first failed load. Release whatever already attached, and
      // make the loader release any completion that lands later instead of attaching it.
      releaseShells();
      status = `failed: ${String(error)}`;
    },
  ).then(() => outcomes as ReadonlyMap<HouseVariant, HousePresentationOutcome>);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    status = 'disposed';
    root.visible = false;
    restore();
    releaseShells();
    for (const spec of wanted) {
      const previous = outcomes.get(spec.variant);
      outcomes.set(spec.variant, failedOutcome(spec.variant, spec.houseId, previous?.audit ?? null, 'disposed'));
    }
  };

  return { root, ready, outcomes, status: () => status, dispose };
}
