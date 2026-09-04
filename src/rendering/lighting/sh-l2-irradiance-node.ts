/**
 * HF-486 — the GPU half of the SH-L2 irradiance volume.
 *
 * `sh-l2-irradiance.ts` owns the maths, the bake, the packing and the CPU
 * reference. This file turns a packed volume into seven RGBA16F 3D textures and
 * one TSL node that reconstructs bounced irradiance for a WORLD POSITION and a
 * WORLD NORMAL. When the CPU reference and this graph disagree, the CPU
 * reference is right and this is the bug — the same contract the HF-418 lane
 * holds against its own reference, and for the same reason: a TSL node-build
 * failure is SWALLOWED by three (it logs `THREE.TSL: <error>` and substitutes a
 * bare NodeMaterial), so the only thing that keeps this debuggable is something
 * off the GPU that is known to be right.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE L1 LANE'S NODE, AND WHY IT IS WORTH IT.
 * `baked-indirect-node.ts` composites in SCREEN SPACE, off the shaded colour,
 * the packed normal and viewZ. That works and ships, but its own header is
 * honest about the approximation it is forced into: with no albedo attachment
 * to read it has to divide the shaded colour by its own luminance and call the
 * result an albedo, so "a white wall lit by a red lamp reads as a red wall".
 *
 * Sampled inside the SHARED MATERIAL GRAPHS instead, both of those inputs are
 * already in hand and exact: the material's real albedo, and the interpolated
 * shading normal rather than a G-buffer round-trip. No proxy, no luminance
 * division, no depth gate, and no dependence on what the composite happens to
 * have in its attachments. That is the whole reason this row exists.
 *
 * THE OFF SWITCH IS A UNIFORM, NOT A TOPOLOGY CHANGE. The L1 lane's control is
 * `applyMode: 'pipeline-rebuild'` because building its layer allocates textures
 * and ADDS A COMPOSITE STAGE — turning it on or off changes the screen-space
 * topology, so it cannot move mid-match without compiling a pipeline, which is
 * tripwire 0. This node is a uniform multiply and a texture fetch INSIDE a
 * graph that already exists. Setting `strength` to zero leaves the graph, the
 * bindings and the pipeline exactly as they were, so the control is
 * `applyMode: 'live'` and is safe to move while a match is being played. That
 * is a real capability difference and it is the direct consequence of sampling
 * in the material rather than compositing after it.
 *
 * NORMAL-OFFSET SAMPLING. The sample position is pushed half a probe spacing
 * along the shading normal before the volume is read. Textbook, one line, and
 * not optional: without it a surface sitting flush against the cell boundary
 * trilinearly blends in the probe on the far side of its own wall, and an
 * interior wall picks up the sunlit exterior behind it. That single artefact
 * makes a probe volume look worse than no GI at all, which is why it is in the
 * adopt list for this row rather than a refinement for later.
 *
 * Upstream: https://threejs.org/docs/#api/en/textures/Data3DTexture and the
 * TSL `texture3D` node. Convolution constants: Ramamoorthi & Hanrahan 2001.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  Fn,
  clamp,
  float,
  max,
  min,
  nodeObject,
  normalize,
  texture3D,
  uniform,
  vec3,
} from 'three/tsl';

import {
  SH_A0,
  SH_A1,
  SH_Y00,
  SH_Y1,
} from './baked-indirect';
import {
  SH_A2,
  SH_L2_PLANES,
  SH_Y2_XXYY,
  SH_Y2_XY,
  SH_Y2_XZ,
  SH_Y2_YZ,
  SH_Y2_ZZ,
  type ShL2Volume,
  packShL2Volume,
} from './sh-l2-irradiance';

/**
 * Largest multiplier the volume may apply where it is composed into a
 * material's ambient term. Mirrors `BAKED_INDIRECT_MAXIMUM_GAIN`'s role and
 * sits at the same value for the same reason: it is where a fully sky-lit
 * interior wall reads as lit rather than as fogged.
 */
export const SH_L2_MAXIMUM_STRENGTH = 0.55;

/**
 * Hard per-channel ceiling on the linear-HDR value this layer may ADD to any
 * one pixel, clamped last in the node rather than trusted. Additive and
 * clamped, exactly like every other lighting effect here: this layer may
 * brighten a pixel and can never darken one, so nothing visible today can be
 * hidden by turning it on.
 */
export const SH_L2_MAXIMUM_ADDITIVE = 0.18;

/** Fraction of a probe spacing the sample point is pushed along the normal. */
export const SH_L2_NORMAL_OFFSET_CELLS = 0.5;

export type ShL2Textures = Readonly<{
  planes: readonly THREE.Data3DTexture[];
  dispose(): void;
}>;

/**
 * Seven RGBA16F 3D textures, `nx * ny * nz` texels each. Half float rather than
 * full: irradiance is a low-dynamic-range low-frequency signal and half gives
 * ~3 decimal digits across the range these bakes produce, which is far below
 * what trilinear interpolation between probes metres apart is already
 * discarding. It also halves the residency, which is what lets two bakes (day
 * and dusk) stay resident for the time-of-day blend inside the lane's budget.
 *
 * Linear filtering on all three axes IS the trilinear probe interpolation; the
 * CPU reference does the same blend by hand, which is what makes the two
 * comparable at all.
 */
export function allocateShL2Textures(
  dimensions: readonly [number, number, number],
  label = 'arena',
): ShL2Textures {
  const [nx, ny, nz] = dimensions;
  const texels = nx * ny * nz;
  const planes: THREE.Data3DTexture[] = [];
  for (let plane = 0; plane < SH_L2_PLANES; plane += 1) {
    const texture = new THREE.Data3DTexture(new Uint16Array(texels * 4), nx, ny, nz);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.HalfFloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.name = `sh-l2-${label}-${plane}`;
    planes.push(texture);
  }
  return Object.freeze({
    planes: Object.freeze(planes),
    dispose(): void {
      for (const texture of planes) texture.dispose();
    },
  });
}

/**
 * Copies a baked volume into already-allocated textures. Separate from
 * allocation because every re-bake re-uploads into the SAME texture objects:
 * swapping a bound texture for one of different dimensions rebuilds the node,
 * which rebuilds the pipeline, which is the thing this lane must never do while
 * a match is being played.
 */
export function uploadShL2Volume(textures: ShL2Textures, volume: ShL2Volume): void {
  const [nx, ny, nz] = volume.dimensions;
  const texels = nx * ny * nz;
  const packed = packShL2Volume(volume);
  for (let plane = 0; plane < SH_L2_PLANES; plane += 1) {
    const data = textures.planes[plane].image.data as Uint16Array;
    if (data.length !== texels * 4) {
      throw new Error(
        `uploadShL2Volume: volume is ${nx}x${ny}x${nz} but plane ${plane} holds ${data.length / 4} texels.`,
      );
    }
    const source = packed[plane];
    for (let index = 0; index < data.length; index += 1) {
      data[index] = THREE.DataUtils.toHalfFloat(source[index]);
    }
    textures.planes[plane].needsUpdate = true;
  }
}

export type ShL2NodeGraph = Readonly<{
  /** Additive linear-HDR bounced irradiance for a world position and normal. */
  irradiance: Node<'vec3'>;
  /** Uniform-only. Zero is the off switch and costs no pipeline rebuild. */
  setStrength(strength: number): void;
  /** Re-uploads probe data and re-points the volume transform. Uniform-only. */
  setVolume(volume: ShL2Volume): void;
  /** Blend weight between the two resident bakes. 0 = A, 1 = B. */
  setBlend(weight: number): void;
  receipt(): Readonly<{
    dimensions: string; digest: string; band: string;
    occluderShapes: number; strength: number; bytes: number;
  }>;
  dispose(): void;
}>;

export type ShL2NodeSources = Readonly<{
  /** World-space shading position. Normally TSL `positionWorld`. */
  worldPosition: Node<'vec3'>;
  /** World-space shading normal. Normally TSL `normalWorld`. */
  worldNormal: Node<'vec3'>;
}>;

/**
 * Builds the sampling node. `dimensions` is fixed for the life of the node for
 * the reason stated on `uploadShL2Volume`: the grid is allocated once and
 * re-uploaded in place, so an arena change and a time-of-day rebake are both
 * uniform-and-texture-data events rather than pipeline events.
 */
export function buildShL2IrradianceNode(
  sources: ShL2NodeSources,
  dimensions: readonly [number, number, number],
  label = 'arena',
  textures: ShL2Textures = allocateShL2Textures(dimensions, label),
): ShL2NodeGraph {
  const [nx, ny, nz] = dimensions;
  const volumeOrigin = uniform(new THREE.Vector3(0, 0, 0));
  const volumeSpacing = uniform(new THREE.Vector3(1, 1, 1));
  const volumeDimensions = uniform(new THREE.Vector3(nx, ny, nz));
  const strength = uniform(0);
  const maximumAdditive = uniform(SH_L2_MAXIMUM_ADDITIVE);
  let bound: ShL2Volume | null = null;

  const irradiance = Fn(() => {
    const normal = normalize(nodeObject(sources.worldNormal));

    // Normal-offset: push half a cell along the shading normal before reading,
    // so a surface flush against a cell boundary does not blend in the probe on
    // the far side of its own wall. See the file header.
    const offset = normal.mul(volumeSpacing).mul(float(SH_L2_NORMAL_OFFSET_CELLS));
    const world = nodeObject(sources.worldPosition).add(offset);

    // Probe (x,y,z) sits at texel centre (x+0.5)/n. Clamping to the half-texel
    // border rather than to 0..1 is what stops the edge probe being smeared
    // across the outer half-cell of the volume.
    const grid = world.sub(volumeOrigin).div(volumeSpacing).add(0.5);
    const half = vec3(0.5, 0.5, 0.5).div(volumeDimensions);
    const uvw = clamp(grid.div(volumeDimensions), half, vec3(1, 1, 1).sub(half));

    const plane = (index: number) =>
      nodeObject(texture3D(textures.planes[index], uvw) as unknown as Node<'vec4'>);
    const p0 = plane(0); const p1 = plane(1); const p2 = plane(2);
    const p3 = plane(3); const p4 = plane(4); const p5 = plane(5); const p6 = plane(6);

    // Band-2 basis for the shading normal, constants folded exactly as the CPU
    // reference folds them.
    const nx1 = normal.x; const ny1 = normal.y; const nz1 = normal.z;
    const b0 = nx1.mul(ny1).mul(SH_Y2_XY);
    const b1 = ny1.mul(nz1).mul(SH_Y2_YZ);
    const b2 = nz1.mul(nz1).mul(3).sub(1).mul(SH_Y2_ZZ);
    const b3 = nx1.mul(nz1).mul(SH_Y2_XZ);
    const b4 = nx1.mul(nx1).sub(ny1.mul(ny1)).mul(SH_Y2_XXYY);

    // Band 0 and 1 come out of planes 0..2 in the L1 lane's exact order
    // (L0, L1y, L1z, L1x). Band 2's fifteen floats are laid channel-major
    // across planes 3..6; see `packShL2Volume` for the table.
    const l01 = (p: ReturnType<typeof plane>) =>
      p.x.mul(SH_A0 * SH_Y00).add(
        ny1.mul(p.y).add(nz1.mul(p.z)).add(nx1.mul(p.w)).mul(SH_A1 * SH_Y1),
      );

    const l2 = (c0: Node<'float'>, c1: Node<'float'>, c2: Node<'float'>, c3: Node<'float'>, c4: Node<'float'>) =>
      b0.mul(c0).add(b1.mul(c1)).add(b2.mul(c2)).add(b3.mul(c3)).add(b4.mul(c4)).mul(SH_A2);

    const red = max(float(0), l01(p0).add(l2(p3.x, p3.y, p3.z, p3.w, p4.x)).div(Math.PI));
    const green = max(float(0), l01(p1).add(l2(p4.y, p4.z, p4.w, p5.x, p5.y)).div(Math.PI));
    const blue = max(float(0), l01(p2).add(l2(p5.z, p5.w, p6.x, p6.y, p6.z)).div(Math.PI));

    // Clamped last, per channel. A clamp, not advice: no bake value and no
    // strength edit can put a wash across a sightline.
    return min(
      vec3(red, green, blue).mul(strength),
      vec3(1, 1, 1).mul(maximumAdditive),
    );
  })();

  return Object.freeze({
    irradiance: irradiance as unknown as Node<'vec3'>,
    setStrength(next: number): void {
      // Clamped HERE, not only upstream. A value that reaches a live uniform
      // unclamped is not "clamped, not assumed" whatever the caller promises.
      strength.value = Math.min(Math.max(0, next), SH_L2_MAXIMUM_STRENGTH);
    },
    setVolume(volume: ShL2Volume): void {
      const [vx, vy, vz] = volume.dimensions;
      if (vx !== nx || vy !== ny || vz !== nz) {
        throw new Error(
          `setVolume: node is bound to ${nx}x${ny}x${nz}, volume is ${vx}x${vy}x${vz}.`,
        );
      }
      uploadShL2Volume(textures, volume);
      volumeOrigin.value.set(volume.originM[0], volume.originM[1], volume.originM[2]);
      volumeSpacing.value.set(volume.spacingM[0], volume.spacingM[1], volume.spacingM[2]);
      bound = volume;
    },
    setBlend(): void {
      // Reserved for the two-bake time-of-day blend. The current shipping route
      // re-uploads a fresh bake between matches instead, so this is a no-op
      // rather than a half-wired second texture set: an unused second volume
      // would double residency for a path nothing calls.
    },
    receipt() {
      return Object.freeze({
        dimensions: `${nx}x${ny}x${nz}`,
        digest: bound?.digest ?? 'unbound',
        band: bound?.band ?? 'unbound',
        occluderShapes: bound?.bake.occluderShapes ?? -1,
        strength: strength.value,
        bytes: nx * ny * nz * SH_L2_PLANES * 4 * 2,
      });
    },
    dispose(): void {
      textures.dispose();
    },
  });
}

/**
 * Publishes what the BOUND volume is, from the code that actually bound it,
 * where a headless browser can read it without a debug hook. An arena whose
 * bake found zero occluder shapes produces a correct, sky-only, invisible
 * volume, and that must be distinguishable from a volume that failed to bind.
 */
export function publishShL2Receipt(
  target: { dataset: Record<string, string | undefined> },
  graph: ShL2NodeGraph | null,
): void {
  if (!graph) {
    target.dataset.shL2Irradiance = 'off';
    return;
  }
  const receipt = graph.receipt();
  target.dataset.shL2Irradiance =
    `${receipt.dimensions}:${receipt.band}:${receipt.digest}:${receipt.occluderShapes}:${receipt.strength.toFixed(3)}`;
}
