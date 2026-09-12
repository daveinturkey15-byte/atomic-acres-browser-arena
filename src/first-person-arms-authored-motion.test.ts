import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { describe, expect, it } from 'vitest';

/**
 * HF-388 shipped-bytes gate on the first-person arms animation corpus.
 *
 * WHY THIS FILE EXISTS. `docs/PASS81_LANE_PLAN_2026-08-28.json` recorded that
 * every one of the thirteen authored clips in
 * `pass65-first-person-arms-lod0.glb` held the bind pose: two identical keys
 * per track, 0.0000 deg of arm-chain travel, and an identical hold pose in all
 * thirteen. The GLB had shipped that way for months, the authored pose layer in
 * `operator-model.ts` decomposed it to exactly zero, and nothing in the suite
 * failed - because no test had ever read animation content out of the shipped
 * bytes. The Blender-side gates all run against poses in memory.
 *
 * ROOT CAUSE (measured 2026-08-28, not inferred): the production exporter
 * `scripts/blender/export-pass69-3-first-person-operator-arms.py` reset every
 * pose bone to `rotation_mode = "QUATERNION"` immediately before export, while
 * every authored action in the manual master keys `rotation_euler`. With
 * `export_force_sampling=False` the glTF exporter resolves channels by the
 * bone's CURRENT rotation mode, found no quaternion f-curves, and emitted the
 * static rest rotation for all 37 bones. Forcing sampling did not help either -
 * the depsgraph itself ignores euler f-curves on a quaternion-mode bone - so
 * the flag the plan blamed (`export_optimize_animation_size`) was never the
 * cause. Both were verified by exporting four variants and decoding each.
 *
 * WHAT THIS GATE PINS. Animation content in the SHIPPED, meshopt-compressed
 * GLB, decoded through the same loader and decoder the game uses:
 *   - every clip moves the arm chain (span > 0), and
 *   - the clips are not all the same pose (they differ from one another), and
 *   - the finger tracks - the only tracks `firstPersonArmRuntimeClip` admits
 *     into the live mixer - carry motion, so this is frame-visible and not an
 *     offline-only property.
 * Falsifier: re-export with `rotation_mode = "QUATERNION"` restored in the
 * exporter's `reset_pose` and every assertion below fails.
 */

const MODEL_DIR = join(
  import.meta.dirname, '..', 'public', 'assets', 'original', 'models', 'operators',
);

/** `CORE_ACTIONS` in the exporter, in authoring order. */
const CORE_CLIPS = [
  'equip', 'unequip', 'idle', 'walk', 'sprint', 'ads-in', 'ads-out',
  'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect',
] as const;

/** The six bones the authored pose layer decomposes; see operator-model.ts. */
const ARM_CHAIN = ['UpperArmL', 'UpperArmR', 'LowerArmL', 'LowerArmR', 'WristL', 'WristR'];

/** Matches `FIRST_PERSON_RUNTIME_FINGER_TRACK` in `src/operator-model.ts`. */
const RUNTIME_FINGER_TRACK = /(?:Index|Middle|Ring|Pinky|Thumb)[123][LR]\.quaternion$/u;

/**
 * A bind-equal corpus reads as exactly 0 deg. The pre-fix asset measured
 * 0.0000 deg on the arm chain in all thirteen clips, so any positive floor
 * separates "authored motion arrived" from "the exporter shipped rest".
 * 0.5 deg is set below the quietest authored clip (idle, ~0.94 deg) and far
 * above meshopt's 16-bit rotation quantisation error (~0.006 deg).
 */
const MIN_CLIP_SPAN_DEG = 0.5;

/** The loudest authored poses are melee and empty-reload (~25 deg). */
const MIN_CORPUS_PEAK_DEG = 15;

/**
 * `ads-in` and `ads-out` share one authored pose dictionary by design, so a
 * strict all-pairs-differ assertion would be wrong. Thirteen clips carrying at
 * least ten distinct travel amplitudes is the falsifiable form of "the clips
 * differ": a re-broken export collapses this to 1.
 */
const MIN_DISTINCT_CLIP_SPANS = 10;

function quaternionAngleDeg(a: THREE.Quaternion, b: THREE.Quaternion): number {
  return THREE.MathUtils.radToDeg(2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))));
}

/**
 * Largest rotation, in degrees, between a track's first key and any later key.
 * Non-quaternion tracks and single-key tracks contribute nothing.
 */
function trackSpanDeg(track: THREE.KeyframeTrack): number {
  if (!(track instanceof THREE.QuaternionKeyframeTrack)) return 0;
  const count = Math.floor(track.values.length / 4);
  if (count < 2) return 0;
  const first = new THREE.Quaternion(
    track.values[0], track.values[1], track.values[2], track.values[3],
  ).normalize();
  const other = new THREE.Quaternion();
  let span = 0;
  for (let i = 1; i < count; i += 1) {
    other.set(
      track.values[i * 4], track.values[i * 4 + 1],
      track.values[i * 4 + 2], track.values[i * 4 + 3],
    ).normalize();
    span = Math.max(span, quaternionAngleDeg(first, other));
  }
  return span;
}

type ClipMotion = {
  armSpanDeg: number;
  fingerSpanDeg: number;
  armTracks: number;
  maxKeys: number;
};

async function loadClips(lod: 0 | 1): Promise<Map<string, ClipMotion>> {
  const bytes = Buffer.from(readFileSync(join(MODEL_DIR, `pass65-first-person-arms-lod${lod}.glb`)));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim()) as {
    materials?: Array<Record<string, unknown> & { pbrMetallicRoughness?: Record<string, unknown> }>;
  };
  // Node has no DOM image decoder. Textures are irrelevant to animation content,
  // so drop the references in the in-memory copy only; the meshopt geometry and
  // animation accessors still go through the real decoder.
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  const jsonText = JSON.stringify(json);
  expect(Buffer.byteLength(jsonText)).toBeLessThanOrEqual(jsonLength);
  bytes.fill(0x20, 20, 20 + jsonLength);
  bytes.write(jsonText, 20, 'utf8');
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await new Promise<Awaited<ReturnType<GLTFLoader['loadAsync']>>>((resolve, reject) => {
    loader.parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
      resolve,
      reject,
    );
  });
  const motion = new Map<string, ClipMotion>();
  for (const clip of gltf.animations) {
    let armSpanDeg = 0;
    let fingerSpanDeg = 0;
    let armTracks = 0;
    let maxKeys = 0;
    for (const track of clip.tracks) {
      maxKeys = Math.max(maxKeys, track.times.length);
      const bone = track.name.split('.')[0];
      if (ARM_CHAIN.includes(bone) && track.name.endsWith('.quaternion')) {
        armTracks += 1;
        armSpanDeg = Math.max(armSpanDeg, trackSpanDeg(track));
      }
      if (RUNTIME_FINGER_TRACK.test(track.name)) {
        fingerSpanDeg = Math.max(fingerSpanDeg, trackSpanDeg(track));
      }
    }
    motion.set(clip.name, { armSpanDeg, fingerSpanDeg, armTracks, maxKeys });
  }
  return motion;
}

const cache = new Map<number, Promise<Map<string, ClipMotion>>>();
function clips(lod: 0 | 1): Promise<Map<string, ClipMotion>> {
  const cached = cache.get(lod);
  if (cached) return cached;
  const pending = loadClips(lod);
  cache.set(lod, pending);
  return pending;
}

describe.each([0, 1] as const)('shipped first-person arms LOD%i authored motion', (lod) => {
  it('ships all thirteen authored clips with the full arm chain keyed', async () => {
    const motion = await clips(lod);
    expect([...motion.keys()].sort()).toEqual([...CORE_CLIPS].sort());
    for (const name of CORE_CLIPS) {
      expect(motion.get(name)?.armTracks, `${name} arm-chain rotation tracks`).toBe(ARM_CHAIN.length);
    }
  });

  it('carries non-zero arm-chain travel in every clip', async () => {
    const motion = await clips(lod);
    for (const name of CORE_CLIPS) {
      expect(
        motion.get(name)?.armSpanDeg,
        `${name} arm-chain rotation span (deg) - a bind-pose export reads 0`,
      ).toBeGreaterThan(MIN_CLIP_SPAN_DEG);
    }
  });

  it('reaches the authored peak amplitude somewhere in the corpus', async () => {
    const motion = await clips(lod);
    const peak = Math.max(...CORE_CLIPS.map((name) => motion.get(name)?.armSpanDeg ?? 0));
    expect(peak, 'loudest authored arm travel (deg)').toBeGreaterThan(MIN_CORPUS_PEAK_DEG);
  });

  it('gives the clips distinct arm travel rather than one shared hold pose', async () => {
    const motion = await clips(lod);
    const distinct = new Set(CORE_CLIPS.map((name) => (motion.get(name)?.armSpanDeg ?? 0).toFixed(1)));
    expect(
      distinct.size,
      `distinct arm-chain travel amplitudes across ${CORE_CLIPS.length} clips`,
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_CLIP_SPANS);
  });

  it('keys more than the two endpoints, so the pose is reached mid-clip', async () => {
    const motion = await clips(lod);
    for (const name of CORE_CLIPS) {
      expect(motion.get(name)?.maxKeys, `${name} keys on its busiest track`).toBeGreaterThan(2);
    }
  });

  it('animates the finger tracks the live mixer actually admits', async () => {
    const motion = await clips(lod);
    for (const name of CORE_CLIPS) {
      expect(
        motion.get(name)?.fingerSpanDeg,
        `${name} runtime finger-track span (deg) - the only tracks firstPersonArmRuntimeClip keeps`,
      ).toBeGreaterThan(MIN_CLIP_SPAN_DEG);
    }
  });
});
