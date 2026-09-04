/**
 * ground-projected-env.ts — HF-479 technique #4: ground-projected environment backdrop.
 *
 * Arenas with a visible horizon (nuketown2 first, then skyline-terminal) read as
 * a flat gradient because the equirect sky is sampled by raw view direction: the
 * below-horizon half compresses into a thin strip and the horizon floats. This
 * module projects the EXISTING procedural sky backdrop onto a virtual ground
 * plane at the arena's horizon distance (height + radius uniforms per arena),
 * so the sky meets authored ground instead of a gradient edge.
 *
 * RE-IMPLEMENTED IN OUR LIKENESS, NEVER VENDORED (HF-472). The upstream r185
 * observation is `GroundedSkybox.js` (`getGroundProjectedNormal`: sphere
 * intersect + ground-disk intersect with back-face culling, sampled through a
 * cube texture). Ours differs deliberately:
 *   - the source is the arena's own equirect sky-backdrop texture (the same
 *     object `scene.background` already holds — no new texture, no PMREM
 *     regen, no render target), sampled via `equirectUV`;
 *   - radius and height are `uniform()` nodes written per arena, so retuning
 *     never rebuilds the graph (per-instance literals are forbidden here);
 *   - the result is normalised before `equirectUV` (cube sampling is
 *     length-insensitive; equirect `v = asin(y)` is not), with a 1e-4 downward
 *     bias so the degenerate straight-down-at-centre ray resolves down rather
 *     than dividing by zero. The CPU reference below mirrors all of this, and
 *     when the two disagree the CPU reference is right.
 *
 * COMPOSITION. One BackSide sphere (r = 170 m, inside the 180 m gameplay far
 * plane), drawn first (`renderOrder = -10`, no depth write) and tagged with
 * exactly one pipeline id. It sits BEHIND the atmosphere/aerial-perspective
 * composite — that stage adds haze on top of the scene pass, so it can never
 * fight this backdrop for a pixel. Disabling restores the flat
 * `scene.background` path with zero graph churn (`visible = false`).
 *
 * COST. One draw call, one equirect fetch per background pixel, no target, no
 * MRT change. The cold-session precompile already compiles every scene-root
 * descendant, so the new pipeline rides it with no fence change.
 *
 * Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_materials_envmaps_groundprojected.html
 * Installed version checked: three 0.185.1 (`node -e "console.log(require('three/package.json').version)"`).
 */

import * as THREE from 'three';
import {
  Fn,
  If,
  cameraPosition,
  equirectUV,
  float,
  min,
  normalize,
  positionWorld,
  texture,
  uniform,
  vec3,
} from 'three/tsl';
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu';
import type { ArenaId } from '../arena-identity';

/** The ONE pipeline this feature may add (brief budget: at most one). */
export const GROUND_PROJECTED_ENV_PIPELINE = 'pass64.ground-projected-env.tsl.v1';

/** Backdrop sphere radius: inside the 180 m gameplay far plane, outside every arena. */
export const GROUND_PROJECTED_ENV_MESH_RADIUS = 170;

/** Per-arena projection tuning. Height ≈ the eye that "took the photo". */
export type GroundProjectedEnvParams = Readonly<{
  /** Virtual ground-plane distance: must contain every in-bounds camera. */
  radius: number;
  /** Camera height above the virtual ground in metres. */
  height: number;
  /** False = this arena keeps the flat sky path. */
  enabled: boolean;
}>;

const DISABLED_FALLBACK: GroundProjectedEnvParams = Object.freeze({
  radius: 140,
  height: 1.7,
  enabled: false,
});

/**
 * Per-arena data ONLY. nuketown2 first (diagonal 91.4 m, fog far 148 — radius
 * 140 clears the longest sightline with margin); skyline-terminal second
 * (apron extents ±40 m, fog far 156 — radius 160). Every other arena resolves
 * to the disabled fallback until it is authored, never to a guess.
 */
const ARENA_PARAMS: Readonly<Record<string, GroundProjectedEnvParams>> = Object.freeze({
  nuketown2: Object.freeze({ radius: 140, height: 1.7, enabled: true }),
  'skyline-terminal': Object.freeze({ radius: 160, height: 2.0, enabled: true }),
});

export function resolveGroundProjectedEnvParams(arenaId: string): GroundProjectedEnvParams {
  return ARENA_PARAMS[arenaId] ?? DISABLED_FALLBACK;
}

/** Where a ray ends up: the ground disk, the projection sphere, or nowhere. */
export type GroundProjectedHitKind = 'disk' | 'sphere' | 'miss';

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-6) return [0, -1, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * THE CPU REFERENCE. The TSL node below evaluates exactly this expression (up
 * to the 1e-4 downward bias, which only moves the degenerate centre ray), so a
 * mismatch between a capture and this function is a bug in the node, not here.
 *
 * `cameraHeightM` is the world-space eye height; the projection sphere is
 * centred on the arena origin, matching the upstream construction where the
 * camera anchor is `cameraPosition - (0, height, 0)`.
 */
export function groundProjectedDirection(
  ray: readonly [number, number, number],
  cameraHeightM: number,
  radius: number,
  height: number,
): readonly [number, number, number] {
  const [px, py, pz] = normalize3([ray[0], ray[1], ray[2]]);
  const ax = 0;
  const ay = cameraHeightM - height;
  const az = 0;
  const along = ax * px + ay * py + az * pz;
  const anchorSquare = ax * ax + ay * ay + az * az - radius * radius;
  const discriminant = along * along - anchorSquare;
  const sphereReach = discriminant >= 0 ? Math.sqrt(discriminant) - along : -1;
  if (!(sphereReach > 0)) return [0, 1, 0];
  let diskReach = Number.POSITIVE_INFINITY;
  if (py <= 0) {
    const ox = ax - 0;
    const oy = ay - -height;
    const oz = az - 0;
    const planeDistance = -(oy) / py;
    const qx = ox + px * planeDistance;
    const qy = oy + py * planeDistance;
    const qz = oz + pz * planeDistance;
    if (qx * qx + qy * qy + qz * qz < radius * radius) diskReach = planeDistance;
  }
  const reach = Math.min(sphereReach, diskReach);
  // 1e-4 downward bias: mirrors the TSL guard so the degenerate centre ray
  // (straight down from the sphere axis) resolves down on both sides.
  return normalize3([
    (ax + px * reach) / radius,
    (ay + py * reach) / radius - 1e-4,
    (az + pz * reach) / radius,
  ]);
}

/** Which surface a ray resolves against (test seam for the disk/sphere split). */
export function groundProjectedHitKind(
  ray: readonly [number, number, number],
  cameraHeightM: number,
  radius: number,
  height: number,
): GroundProjectedHitKind {
  const [px, py, pz] = normalize3([ray[0], ray[1], ray[2]]);
  const ay = cameraHeightM - height;
  const along = ay * py;
  const discriminant = along * along - (ay * ay - radius * radius);
  const sphereReach = discriminant >= 0 ? Math.sqrt(discriminant) - along : -1;
  if (!(sphereReach > 0)) return 'miss';
  if (py <= 0) {
    const oy = ay + height;
    const planeDistance = -oy / py;
    const qx = px * planeDistance;
    const qy = oy + py * planeDistance;
    const qz = pz * planeDistance;
    if (qx * qx + qy * qy + qz * qz < radius * radius && planeDistance < sphereReach) return 'disk';
  }
  return 'sphere';
}

/**
 * Tripwire from the technique plan: the projection is only defined with the
 * camera inside the sphere. In-bounds play cameras always are (arena extents
 * are tens of metres against radii over a hundred); anything else keeps the
 * flat sky rather than sampling garbage.
 */
export function isGroundProjectedEnvCameraInside(
  cameraHeightM: number,
  radius: number,
  height: number,
): boolean {
  const ay = cameraHeightM - height;
  return ay * ay < radius * radius;
}


/**
 * Our own projection expression. Same surfaces as the upstream observation
 * (sphere + back-face-culled ground disk), own graph: equirect sampling of the
 * arena's sky texture, normalised direction, downward-biased degenerate guard.
 */
function buildProjectionNode(radiusNode: Node<'float'>, heightNode: Node<'float'>) {
  return Fn(() => {
    const viewDirection = positionWorld.sub(cameraPosition).normalize().toConst();
    const eyeAnchor = cameraPosition.toVar();
    eyeAnchor.y.subAssign(heightNode);
    const alongRay = eyeAnchor.dot(viewDirection).toConst();
    const anchorSquare = eyeAnchor
      .dot(eyeAnchor)
      .sub(radiusNode.mul(radiusNode))
      .toConst();
    const discriminant = alongRay.mul(alongRay).sub(anchorSquare).toConst();
    const sphereReach = discriminant.greaterThanEqual(0).select(discriminant.sqrt().sub(alongRay), float(-1));
    const sampled = vec3(0, 1, 0).toVar();
    If(sphereReach.greaterThan(0), () => {
      const groundUp = vec3(0, 1, 0).toConst();
      const diskCenter = vec3(0, heightNode.negate(), 0).toConst();
      const downward = viewDirection.dot(groundUp).toConst();
      const diskReach = float(1e6).toVar();
      If(downward.lessThanEqual(0), () => {
        const eyeOffset = eyeAnchor.sub(diskCenter).toConst();
        const planeDistance = groundUp.dot(eyeOffset).negate().div(downward).toConst();
        const groundPoint = eyeOffset.add(viewDirection.mul(planeDistance)).toConst();
        If(groundPoint.dot(groundPoint).lessThan(radiusNode.mul(radiusNode)), () => {
          diskReach.assign(planeDistance);
        });
      });
      sampled.assign(
        eyeAnchor.add(viewDirection.mul(min(sphereReach, diskReach))).div(radiusNode),
      );
    });
    // Downward bias: the degenerate centre ray divides to (0,0,0); this tips
    // it down so `normalize` stays defined. 1e-4 is far below a texel.
    return normalize(sampled.add(vec3(0, -1e-4, 0)));
  })();
}

export type GroundProjectedEnvMesh = THREE.Mesh & {
  userData: {
    radiusUniform: { value: number };
    heightUniform: { value: number };
    mapNode: { value: THREE.Texture | null };
  };
};

/**
 * Builds the backdrop mesh. Per-arena data arrives later through
 * `applyGroundProjectedEnvState` as uniform writes — the graph is built once
 * and never rebuilt per arena (see the uniform-only test).
 */
export function createGroundProjectedEnvMesh(): GroundProjectedEnvMesh {
  const radiusUniform = uniform(140);
  const heightUniform = uniform(1.7);
  // Placeholder source, replaced by the arena's admitted sky before first
  // show; a 1x1 deep-dusk texel so an unbound frame reads dark, never white.
  const placeholder = new THREE.DataTexture(new Uint8Array([10, 12, 18, 255]), 1, 1);
  placeholder.needsUpdate = true;
  const projected = buildProjectionNode(radiusUniform, heightUniform);
  const mapNode = texture(placeholder, equirectUV(projected));
  const material = new MeshBasicNodeMaterial();
  material.name = 'ground-projected-environment';
  material.colorNode = mapNode;
  material.side = THREE.BackSide;
  material.transparent = false;
  material.depthWrite = false;
  material.fog = false;
  material.toneMapped = false;
  material.userData.tslPipelineId = GROUND_PROJECTED_ENV_PIPELINE;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(GROUND_PROJECTED_ENV_MESH_RADIUS, 32, 16),
    material,
  ) as unknown as GroundProjectedEnvMesh;
  mesh.name = 'Pass 64 TSL ground-projected environment';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.visible = false;
  mesh.userData.radiusUniform = radiusUniform;
  mesh.userData.heightUniform = heightUniform;
  mesh.userData.mapNode = mapNode;
  return mesh;
}

export function setGroundProjectedEnvSource(
  mesh: GroundProjectedEnvMesh,
  source: THREE.Texture | null,
): void {
  if (source?.isTexture) mesh.userData.mapNode.value = source;
}

/**
 * Applies per-arena tuning + the settings off switch. Writes uniforms and
 * visibility only; the TSL graph object is never replaced (pinned by test).
 */
export function applyGroundProjectedEnvState(
  mesh: GroundProjectedEnvMesh,
  arenaId: ArenaId | string,
  enabledBySettings: boolean,
): GroundProjectedEnvParams {
  const params = resolveGroundProjectedEnvParams(arenaId);
  mesh.userData.radiusUniform.value = params.radius;
  mesh.userData.heightUniform.value = params.height;
  const hasSource = mesh.userData.mapNode.value !== null;
  mesh.visible = params.enabled && enabledBySettings && hasSource;
  return params;
}
