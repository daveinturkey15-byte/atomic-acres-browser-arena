/**
 * Source 16 — Text to character animation, locally (`localai-org/kimodo.cpp`).
 *
 * Read at pin `92341f31940d54d4f0a44aa5975e470b78b2ab5c` (the RE-PINNED revision;
 * the earlier pin predates the licence grant): `src/skeleton.hpp` and
 * `src/sequence.cpp`. Licence: Apache-2.0, LICENSE file read (11,357 bytes) —
 * not trusted from the API SPDX field.
 *
 * `src/skeleton.hpp` settles the trap the register records. The port's README
 * says Kimodo "gives you SMPL-X", and that is true only of the checkpoint we may
 * NOT use. The header declares three layouts side by side:
 *   :26  `smplx22_names`  — 22 joints, parents `{-1,0,0,0,1,2,3,...}`
 *   :45  `soma30_names`   — 30 joints, parents `{-1,0,1,2,3,4,5,6,6,6,3,...}`
 *   :79  `g1skel34_parents` — 34 joints
 * and each is wrapped in a `skeleton_spec` whose frame width is computed as
 *   :22  `motion_dim() = 9 + 12 * joints()`
 * So the joint COUNT is the discriminator available at import time, and the frame
 * stride is derivable from it. A correspondence module written against 22 joints
 * on the strength of the README returned 30 and had to be caught by an inspector.
 *
 * `src/sequence.cpp` is the `--sequence` mode: multiple prompts stitched with an
 * explicit transition, which is the native answer to the author-stated 10-second
 * per-generation cap.
 *
 * This demo implements both portable halves: layout selection by joint count at
 * import, and clip stitching across a seam. BEFORE is the naive concatenation —
 * a hard cut at the seam, which pops. AFTER is the transition-blended stitch.
 * The pop is measured, not asserted: `seamVelocityJump` reports the worst joint
 * velocity discontinuity across the seam for each half.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

/** Joint counts declared in src/skeleton.hpp, used exactly as the discriminator. */
export const LAYOUTS = { smplx22: 22, soma30: 30, g1skel34: 34 } as const;
export type LayoutName = keyof typeof LAYOUTS;

/** src/skeleton.hpp:22 — frame width follows from the joint count. */
export function motionDim(joints: number): number {
  return 9 + 12 * joints;
}

/**
 * Select by joint count, never by the README sentence. Returns null rather than
 * guessing, because a wrong layout silently mis-retargets every limb.
 */
export function selectLayout(jointCount: number): LayoutName | null {
  const hit = (Object.keys(LAYOUTS) as LayoutName[]).find((name) => LAYOUTS[name] === jointCount);
  return hit ?? null;
}

interface Clip {
  name: string;
  joints: number;
  frames: number;
  /** Per-frame, per-joint rotation angle about X. Synthetic, deterministic. */
  data: Float32Array;
}

/** A stand-in for a generated clip. No model, no weights, no binary involved. */
function synthClip(name: string, joints: number, frames: number, amplitude: number, phase: number): Clip {
  const data = new Float32Array(frames * joints);
  for (let f = 0; f < frames; f += 1) {
    const t = f / frames;
    for (let j = 0; j < joints; j += 1) {
      data[f * joints + j] = Math.sin((t * 2 + phase) * Math.PI * 2 + j * 0.21) * amplitude * (1 - j / (joints * 2));
    }
  }
  return { name, joints, frames, data };
}

/** Naive concatenation: the seam is a hard cut. */
function concatenate(a: Clip, b: Clip): Clip {
  const data = new Float32Array(a.data.length + b.data.length);
  data.set(a.data, 0);
  data.set(b.data, a.data.length);
  return { name: `${a.name}+${b.name}`, joints: a.joints, frames: a.frames + b.frames, data };
}

/**
 * src/sequence.cpp's shape: stitch with an explicit transition window, so the
 * seam is a blend rather than a cut. The transition costs frames from both
 * clips, which is why a looping cycle is not one generation.
 */
export function stitchWithTransition(a: Clip, b: Clip, transitionFrames: number): Clip {
  const overlap = Math.min(transitionFrames, a.frames, b.frames);
  const frames = a.frames + b.frames - overlap;
  const data = new Float32Array(frames * a.joints);
  data.set(a.data.subarray(0, (a.frames - overlap) * a.joints), 0);
  for (let f = 0; f < overlap; f += 1) {
    const k = (f + 1) / (overlap + 1);
    const smooth = k * k * (3 - 2 * k); // smoothstep, so velocity is continuous
    for (let j = 0; j < a.joints; j += 1) {
      const from = a.data[(a.frames - overlap + f) * a.joints + j];
      const to = b.data[f * a.joints + j];
      data[(a.frames - overlap + f) * a.joints + j] = from + (to - from) * smooth;
    }
  }
  data.set(
    b.data.subarray(overlap * b.joints),
    (a.frames) * a.joints,
  );
  return { name: `${a.name}~${b.name}`, joints: a.joints, frames, data };
}

/** Worst per-joint velocity discontinuity anywhere in the clip. */
export function worstVelocityJump(clip: Clip): number {
  let worst = 0;
  for (let f = 2; f < clip.frames; f += 1) {
    for (let j = 0; j < clip.joints; j += 1) {
      const v1 = clip.data[f * clip.joints + j] - clip.data[(f - 1) * clip.joints + j];
      const v0 = clip.data[(f - 1) * clip.joints + j] - clip.data[(f - 2) * clip.joints + j];
      worst = Math.max(worst, Math.abs(v1 - v0));
    }
  }
  return worst;
}

/** Retarget: map source joints onto our own chain by index, which is all a
 *  stand-in rig needs; a real retarget also needs rest-pose correspondence. */
function buildRig(THREE: ThreeNamespace, registry: DisposalRegistry, _joints: number, tint: number) {
  const group = new THREE.Group();
  const boneGeometry = registry.track(new THREE.BoxGeometry(0.05, 0.14, 0.05));
  const material = registry.track(new THREE.MeshStandardMaterial({ color: tint, roughness: 0.6 }));
  const chain: THREE_NS.Object3D[] = [];
  let parent: THREE_NS.Object3D = group;
  // One visible chain of 12 links driven by the first 12 source joints; the
  // remaining channels are carried but not visualised.
  for (let i = 0; i < 12; i += 1) {
    const pivot = new THREE.Group();
    pivot.position.y = i === 0 ? 0.1 : 0.15;
    parent.add(pivot);
    const mesh = new THREE.Mesh(boneGeometry, material);
    mesh.position.y = 0.075;
    pivot.add(mesh);
    chain.push(pivot);
    parent = pivot;
  }
  return { group, chain };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  // Import: the clip arrives with 30 channels. The README would have said 22.
  const jointCount = 30;
  const layout = selectLayout(jointCount);
  const walk = synthClip('walk', jointCount, 60, 0.22, 0);
  const turn = synthClip('turn', jointCount, 60, 0.3, 0.5);

  const naive = concatenate(walk, turn);
  const stitched = stitchWithTransition(walk, turn, 12);

  const naiveJump = worstVelocityJump(naive);
  const stitchedJump = worstVelocityJump(stitched);

  const left = buildRig(THREE, registry, jointCount, 0x9a5a4a);
  const right = buildRig(THREE, registry, jointCount, 0x4a7a9a);
  left.group.name = 'before:hard-cut-concatenation';
  right.group.name = 'after:sequence-transition-stitch';

  const root = sideBySide(THREE, registry, left.group, right.group, 1.6);
  root.name = 'source-16:text-to-motion-import-and-stitch';
  root.userData.motion = {
    layout,
    jointCount,
    motionDim: motionDim(jointCount),
    naiveFrames: naive.frames,
    stitchedFrames: stitched.frames,
  };

  const apply = (rig: { chain: THREE_NS.Object3D[] }, clip: Clip, frame: number) => {
    const f = ((frame % clip.frames) + clip.frames) % clip.frames;
    for (let i = 0; i < rig.chain.length; i += 1) {
      rig.chain[i].rotation.x = clip.data[f * clip.joints + i];
    }
  };
  apply(left, naive, 0);
  apply(right, stitched, 0);

  const metadata = {
    sourceId: 16,
    title: 'Text to character animation, locally (kimodo.cpp)',
    method:
      'Select the joint layout by joint count at import (22 = SMPL-X, 30 = SOMA, 34 = G1) rather than by the README sentence, derive frame stride as 9 + 12 * joints, retarget onto our own chain, and stitch past the 10-second generation cap with an explicit smoothstep transition window as src/sequence.cpp does.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/stefan_3d_ai/status/2091531702183350276',
      'https://x.com/jichiep/status/2091277918521417834',
      'https://github.com/localai-org/kimodo.cpp',
      'localai-org/kimodo.cpp@92341f31940d54d4f0a44aa5975e470b78b2ab5c src/skeleton.hpp:13-22,26-31,45-51,79,90; src/sequence.cpp (Apache-2.0)',
    ],
    limitation:
      'No kimodo binary was built, no GGUF weights were downloaded and no generation was run in this lane - building third-party C++ and downloading model weights are outside it. The motion buffers here are synthetic and deterministic, so this is evidence about the import-and-stitch contract only, not about generation quality, foot slide or prompt response. Weight licences remain separate from the Apache-2.0 code: the SOMA/G1 GGUF weights are NVIDIA Open Model License with no country exclusion, while the SMPL-X RP checkpoint is internal-R&D and must not be used.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      jointCount,
      motionDim: motionDim(jointCount),
      naiveSeamVelocityJump: Number(naiveJump.toFixed(6)),
      stitchedSeamVelocityJump: Number(stitchedJump.toFixed(6)),
    },
  };

  return {
    root,
    update(time: number) {
      const frame = Math.floor(time * 30);
      apply(left, naive, frame);
      apply(right, stitched, frame);
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
