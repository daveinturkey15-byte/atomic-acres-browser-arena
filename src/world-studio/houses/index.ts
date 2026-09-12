/**
 * World-studio Blender house shells: an additive, audited, presentation-only loader.
 *
 * This module loads the two Blender-authored exterior shells and — only after a load has both
 * resolved AND passed its semantic audit — reports that the matching procedural architecture
 * partition is safe to hide. It never hides anything itself and never touches the arena.
 *
 * AUTHORITY. Presentation only, without exception. No collider, shot surface, breakable-window
 * registration, spawn, navigation route, ramp or platform is created, derived or modified here.
 * Movement and shot authority remain exactly where `src/world-studio/architecture` put them and
 * `src/world-studio/arena.ts` published them. The `atomic_window_id` extras carried by the GLB
 * are **audit markers that name existing registrations**; they do not create new ones.
 *
 * LIFECYCLE. Mirrors the proven contract in `src/world-studio/blender-assets/index.ts`:
 *   - `root` is a real `THREE.Group` the caller may parent immediately.
 *   - `ready` resolves only after every shell has loaded, been audited and been attached. A
 *     failed load rejects visibly; it never resolves early and never resolves on a swallow.
 *   - `dispose()` is idempotent and safe while a load is in flight: a payload that arrives
 *     after disposal is released rather than attached, so the loader cannot outlive teardown.
 *   - A stale generation is tolerated: `dispose()` invalidates the in-flight generation token.
 *
 * INTEGRATION RECIPE (root owns every step; none of it happens in this file):
 *   1. Build the procedural arena exactly as today. It stays visible and authoritative.
 *   2. `const houses = createStudioHouseShells(); arenaRoot.add(houses.root);`
 *   3. `await houses.ready;` then read `houses.audits`.
 *   4. For each audit where `passed === true`, hide the matching procedural partition by
 *      setting `visible = false` on the architecture descendants named
 *      `world-studio-<houseId>-*` (see `build.ts:309-332` for the naming). Do **not** remove
 *      or dispose them: an audit is presentation acceptance, not a collision decision, and a
 *      later rollback must be free.
 *   5. Where `passed === false`, leave that house's procedural presentation visible and dispose
 *      only that shell. A half-hidden house is a doubled-wall regression; hide per partition,
 *      never globally, and never on `ready` alone.
 *   6. Never hide a partition while `ready` is still pending — that is exactly the doubled/
 *      missing-wall window this protocol exists to close.
 *
 * WHY STEP 4 IS NOW SAFE (wave 3). It was not safe in wave 2. `build.ts:310-334` merges the
 * procedural house into one mesh per `(group, material)` pair, so `world-studio-<houseId>-*` is
 * the whole house — exterior, interior partitions and stair together — and there is no way to
 * hide the walls while keeping the stair. Until the GLB carried an interior, hiding it deleted
 * the interior. The shell now carries the seven partitions, their nine cased openings and the
 * contracted 16-tread flight, and `auditShell` fails the house if any of them is missing or
 * blocked. The procedural *furniture* root (`world-studio-interiors-*`) is separate, is not
 * reproduced here, and must stay visible.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Deploy-base-relative asset paths. Never absolute, never a file path. */
export const TEAL_HOUSE_SHELL_PATH = 'assets/world-studio/blender/houses/house-teal-shell.glb';
export const YELLOW_HOUSE_SHELL_PATH = 'assets/world-studio/blender/houses/house-yellow-shell.glb';

export type HouseVariant = 'teal' | 'yellow';

export interface HouseShellSpec {
  readonly variant: HouseVariant;
  /** Matches the TypeScript house roster in `architecture/index.ts:49-68`. */
  readonly houseId: string;
  readonly partition: string;
  readonly path: string;
  /**
   * World placement. The yellow mirror is baked into the mesh, so neither house takes a runtime
   * rotation: a 180-degree yaw would also flip the garage/backyard Z relationship.
   */
  readonly position: readonly [number, number, number];
}

export const HOUSE_SHELLS: readonly HouseShellSpec[] = [
  {
    variant: 'teal',
    houseId: 'teal-house',
    partition: 'world-studio.house.teal.shell',
    path: TEAL_HOUSE_SHELL_PATH,
    position: [-20, 0, 0],
  },
  {
    variant: 'yellow',
    houseId: 'yellow-house',
    partition: 'world-studio.house.yellow.shell',
    path: YELLOW_HOUSE_SHELL_PATH,
    position: [20, 0, 0],
  },
];

/**
 * Local-frame envelope the shell must stay inside, from the visual contract. The rear balcony
 * and roof overhang legitimately exceed the 14x18 m main block, so the bound is the lot, not
 * the block; `ROAD_CLEARANCE_LOCAL_X` is the one that protects the road corridor.
 */
export const SHELL_LOCAL_BOUNDS = {
  min: [-9.6, -0.6, -10.4] as const,
  max: [9.6, 9.6, 21.0] as const,
};
export const ROAD_CLEARANCE_LOCAL_X = 9.5;

/**
 * The interior contract the wave-3 shells carry, transcribed from `architecture/house.ts:51-63`
 * and `:502-700`. These are the numbers that decide whether the GLB can stand in for the
 * procedural presentation, so the loader checks them rather than trusting the exporter.
 *
 * `build.ts:310-334` merges the whole procedural house into one mesh per `(group, material)`
 * pair, so a root that hides `world-studio-<houseId>-*` hides the interior walls and the stair
 * along with the exterior. There is no partial hide. That is why the tread count and the
 * partition count are audit failures and not warnings.
 */
export const INTERIOR_CONTRACT = {
  stairTreads: 16,
  groundFloorY: 0.08,
  upperFloorY: 3.3,
  /** (3.30 - 0.08) / 16 */
  stairRise: (3.3 - 0.08) / 16,
  stairGoing: 0.28125,
  partitions: 7,
  interiorApertures: 9,
  /** Largest step a player may be asked to climb, `studio-architecture.test.ts:153`. */
  maxTreadRise: 0.5,
} as const;

export interface HouseShellAudit {
  readonly variant: HouseVariant;
  readonly houseId: string;
  readonly partition: string;
  /** True only when every check below holds. The procedural partition may be hidden only then. */
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly windowIds: readonly string[];
  readonly apertureIds: readonly string[];
  readonly blockedApertureIds: readonly string[];
  readonly routeIds: readonly string[];
  /** `<house-id>:<partition-key>:<opening-id>` for each cased interior opening. */
  readonly interiorApertureIds: readonly string[];
  readonly blockedInteriorApertureIds: readonly string[];
  /** `<house-id>:<partition-key>` for each interior partition leaf. */
  readonly partitionIds: readonly string[];
  /** Measured tread tops in local metres, ascending. Length is the tread count. */
  readonly stairTreadTops: readonly number[];
  readonly triangles: number;
  readonly drawGroups: number;
  readonly localBounds: { min: readonly number[]; max: readonly number[] } | null;
}

export interface StudioHouseShells {
  root: THREE.Group;
  ready: Promise<void>;
  /** Populated as each shell resolves; complete once `ready` has resolved. */
  audits: ReadonlyMap<HouseVariant, HouseShellAudit>;
  dispose: () => void;
}

export interface StudioHouseShellOptions {
  baseUrl?: string;
  /** Restrict the load to one variant. Used by focused tests and by a partial rollback. */
  variants?: readonly HouseVariant[];
}

function resolveBaseUrl(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

function joinUrl(base: string, path: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

/** Exported so base-awareness is assertable without a network fetch. */
export function resolveHouseShellUrl(variant: HouseVariant, baseUrl?: string): string {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant);
  if (!spec) throw new Error(`world-studio houses: unknown variant '${variant}'`);
  return joinUrl(resolveBaseUrl(baseUrl), spec.path);
}

function disposeSubtree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry as THREE.BufferGeometry);
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      materials.add(entry);
      for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  // GLTFLoader's own docs warn that decoded image bitmaps are not collected for us.
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function extras(node: THREE.Object3D): Record<string, unknown> {
  const data = node.userData as Record<string, unknown>;
  // The Blender exporter writes custom properties into glTF `extras`; three.js surfaces them
  // either flattened onto userData or nested under `userData.extras` depending on version, so
  // read both rather than assuming one shape.
  const nested = data.extras;
  return nested && typeof nested === 'object' ? { ...data, ...(nested as Record<string, unknown>) } : data;
}

/**
 * Tags the subtree presentation-only and applies the glazing contract: a pane stays transparent,
 * two-sided and depth-write disabled so it never occludes the cross-street duel line, while every
 * opaque surface is restored to `FrontSide` (the exporter writes materials double-sided).
 */
function applyPresentationContract(scene: THREE.Object3D, spec: HouseShellSpec): void {
  scene.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.worldStudioPartition = spec.partition;
    node.userData.worldStudioHouseId = spec.houseId;
    const props = extras(node);
    const mesh = node as Partial<THREE.Mesh>;
    const material = mesh.material;
    if (!material) return;
    const isGlass = props.atomic_material_slot === 'glass';
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (isGlass || entry.transparent === true || entry.opacity < 1) {
        entry.transparent = true;
        entry.depthWrite = false;
        entry.side = THREE.DoubleSide;
        entry.needsUpdate = true;
        continue;
      }
      entry.side = THREE.FrontSide;
      entry.needsUpdate = true;
    }
  });
}

/**
 * Finds the authored semantic root from glTF extras, rather than from the display name.
 *
 * GLTFLoader exposes the glTF scene as a wrapper (`Scene`) and sanitizes dotted node names for
 * animation bindings. Neither is a reliable identity for the Blender-authored contract. The
 * partition extra is the identity, and exactly one node must carry it.
 */
function contractRoots(scene: THREE.Object3D, spec: HouseShellSpec): THREE.Object3D[] {
  const matches: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (extras(node).atomic_presentation_partition === spec.partition) matches.push(node);
  });
  return matches;
}

export function auditStudioHouseShell(scene: THREE.Object3D, spec: HouseShellSpec): HouseShellAudit {
  const failures: string[] = [];
  const windowIds: string[] = [];
  const apertureIds: string[] = [];
  const blockedApertureIds: string[] = [];
  const routeIds: string[] = [];
  const interiorApertureIds: string[] = [];
  const blockedInteriorApertureIds: string[] = [];
  const partitionIds: string[] = [];
  const stairTreadTops: number[] = [];
  let triangles = 0;
  let drawGroups = 0;

  const box = new THREE.Box3();
  let hasBounds = false;

  scene.traverse((node) => {
    const props = extras(node);
    const semantic = props.atomic_semantic;
    if (semantic === 'breakable-window' && typeof props.atomic_window_id === 'string') {
      windowIds.push(props.atomic_window_id);
    }
    if (semantic === 'aperture-audit' && typeof props.atomic_aperture_id === 'string') {
      apertureIds.push(props.atomic_aperture_id);
      if (props.atomic_aperture_clear !== true) blockedApertureIds.push(props.atomic_aperture_id);
    }
    if (semantic === 'route-landmark' && typeof props.atomic_route_id === 'string') {
      routeIds.push(props.atomic_route_id);
    }
    if (semantic === 'interior-aperture-audit' && typeof props.atomic_interior_aperture_id === 'string') {
      interiorApertureIds.push(props.atomic_interior_aperture_id);
      if (props.atomic_aperture_clear !== true) blockedInteriorApertureIds.push(props.atomic_interior_aperture_id);
    }
    if (semantic === 'interior-partition' && typeof props.atomic_partition_id === 'string') {
      partitionIds.push(props.atomic_partition_id);
    }
    if (semantic === 'stair-tread' && typeof props.atomic_stair_tread_top === 'number') {
      stairTreadTops.push(props.atomic_stair_tread_top);
    }
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    drawGroups += 1;
    const geometry = mesh.geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute('position');
    triangles += index ? index.count / 3 : (position ? position.count / 3 : 0);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      box.union(geometry.boundingBox);
      hasBounds = true;
    }
  });

  const roots = contractRoots(scene, spec);
  if (roots.length === 0) {
    failures.push(`missing semantic metadata node atomic_presentation_partition=${spec.partition}`);
  } else if (roots.length > 1) {
    failures.push(`multiple semantic metadata nodes atomic_presentation_partition=${spec.partition}`);
  } else {
    const rootProps = extras(roots[0]);
    if (rootProps.atomic_house_id !== spec.houseId) {
      failures.push(`missing atomic_house_id=${spec.houseId}`);
    }
    if (rootProps.atomic_units !== 'meters' || rootProps.atomic_up_axis !== 'Y') {
      failures.push('scene root does not declare metres / Y-up');
    }
  }
  if (windowIds.length === 0) failures.push('no breakable-window markers');
  if (apertureIds.length === 0) failures.push('no aperture-audit markers');
  if (blockedApertureIds.length > 0) {
    failures.push(`opaque geometry crosses ${blockedApertureIds.length} declared aperture(s)`);
  }
  for (const route of ['interior-stair', 'external-stair', 'garage-roof-door']) {
    if (!routeIds.includes(`${spec.houseId}-${route}`)) failures.push(`missing route landmark ${route}`);
  }

  // Interior substitution. Hiding the procedural house is all-or-nothing, so a shell without
  // these is not a substitute for it — it is a house with no inside.
  if (partitionIds.length !== INTERIOR_CONTRACT.partitions) {
    failures.push(`${partitionIds.length} interior partitions, expected ${INTERIOR_CONTRACT.partitions}`);
  }
  if (interiorApertureIds.length !== INTERIOR_CONTRACT.interiorApertures) {
    failures.push(`${interiorApertureIds.length} interior cased openings, expected ${INTERIOR_CONTRACT.interiorApertures}`);
  }
  if (blockedInteriorApertureIds.length > 0) {
    failures.push(`opaque geometry crosses ${blockedInteriorApertureIds.length} interior opening(s)`);
  }
  stairTreadTops.sort((left, right) => left - right);
  if (stairTreadTops.length !== INTERIOR_CONTRACT.stairTreads) {
    failures.push(`${stairTreadTops.length} stair treads, expected ${INTERIOR_CONTRACT.stairTreads}`);
  } else {
    let previous: number = INTERIOR_CONTRACT.groundFloorY;
    for (let step = 0; step < stairTreadTops.length; step += 1) {
      const expected = INTERIOR_CONTRACT.groundFloorY + (step + 1) * INTERIOR_CONTRACT.stairRise;
      if (Math.abs(stairTreadTops[step] - expected) > 1e-4) {
        failures.push(`tread ${step} top ${stairTreadTops[step]} is not the contracted ${expected}`);
      }
      if (stairTreadTops[step] - previous >= INTERIOR_CONTRACT.maxTreadRise) {
        failures.push(`tread ${step} rise exceeds ${INTERIOR_CONTRACT.maxTreadRise} m`);
      }
      previous = stairTreadTops[step];
    }
    const top = stairTreadTops[stairTreadTops.length - 1];
    if (Math.abs(top - INTERIOR_CONTRACT.upperFloorY) > 1e-4) {
      failures.push(`the flight lands at ${top}, not on the upper floor at ${INTERIOR_CONTRACT.upperFloorY}`);
    }
  }
  // Every pane must still name exactly one window, and no two panes may claim the same one: a
  // duplicated id is how an opaque stand-in or a superposed second pane would hide here.
  if (new Set(windowIds).size !== windowIds.length) {
    failures.push('duplicate atomic_window_id: a pane identity is claimed twice');
  }
  if (!hasBounds) {
    failures.push('no mesh geometry');
  } else {
    const { min, max } = box;
    const within =
      min.x >= SHELL_LOCAL_BOUNDS.min[0] && max.x <= SHELL_LOCAL_BOUNDS.max[0] &&
      min.y >= SHELL_LOCAL_BOUNDS.min[1] && max.y <= SHELL_LOCAL_BOUNDS.max[1] &&
      min.z >= SHELL_LOCAL_BOUNDS.min[2] && max.z <= SHELL_LOCAL_BOUNDS.max[2];
    if (!within) failures.push(`local bounds outside the contracted envelope`);
    if (Math.max(Math.abs(min.x), Math.abs(max.x)) > ROAD_CLEARANCE_LOCAL_X + 1e-3) {
      failures.push('shell crosses the road safety gap');
    }
    if (Math.abs(min.y) > 0.75) failures.push('ground contact is not at local Y = 0');
  }

  return {
    variant: spec.variant,
    houseId: spec.houseId,
    partition: spec.partition,
    passed: failures.length === 0,
    failures,
    windowIds,
    apertureIds,
    blockedApertureIds,
    routeIds,
    interiorApertureIds,
    blockedInteriorApertureIds,
    partitionIds,
    stairTreadTops,
    triangles,
    drawGroups,
    localBounds: hasBounds ? { min: box.min.toArray(), max: box.max.toArray() } : null,
  };
}

/**
 * Builds the additive house-shell group. The returned root is usable immediately; each shell
 * appears inside it once it has loaded and been audited.
 */
export function createStudioHouseShells(options: StudioHouseShellOptions = {}): StudioHouseShells {
  const root = new THREE.Group();
  root.name = 'world-studio-house-shells';
  root.userData.presentationOnly = true;

  const base = resolveBaseUrl(options.baseUrl);
  const wanted = options.variants
    ? HOUSE_SHELLS.filter((spec) => options.variants!.includes(spec.variant))
    : HOUSE_SHELLS;

  const audits = new Map<HouseVariant, HouseShellAudit>();
  const loaded: THREE.Object3D[] = [];
  let disposed = false;

  const loader = new GLTFLoader();
  const ready = Promise.all(
    wanted.map((spec) =>
      loader.loadAsync(joinUrl(base, spec.path)).then((gltf) => {
        const scene = gltf.scene;
        if (disposed) {
          // Lost the race with dispose(): release the payload instead of attaching it.
          disposeSubtree(scene);
          return;
        }
        scene.name = spec.partition;
        scene.position.set(spec.position[0], spec.position[1], spec.position[2]);
        applyPresentationContract(scene, spec);
        audits.set(spec.variant, auditStudioHouseShell(scene, spec));
        loaded.push(scene);
        root.add(scene);
      }),
    ),
  ).then(() => undefined);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const node of loaded) {
      root.remove(node);
      disposeSubtree(node);
    }
    loaded.length = 0;
    audits.clear();
    root.clear();
  };

  return { root, ready, audits, dispose };
}

/**
 * The procedural architecture nodes a passing audit authorises the root to hide.
 *
 * Returns the descendants whose names carry this house's group prefix. The caller sets
 * `visible = false`; nothing is removed or disposed, so a rollback costs one boolean.
 */
export function proceduralPartitionNodes(architectureRoot: THREE.Object3D, houseId: string): THREE.Object3D[] {
  const prefix = `world-studio-${houseId}-`;
  const matches: THREE.Object3D[] = [];
  architectureRoot.traverse((node) => {
    if (node.name.startsWith(prefix)) matches.push(node);
  });
  return matches;
}
