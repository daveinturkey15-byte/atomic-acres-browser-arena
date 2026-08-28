// HF-387 stage 1 (offline): generate the eye positions a wall-hugging player can
// legally occupy, per arena, from the same collider builders the fidelity tests use.
//
// Why these spots: a capsule against a FLAT wall face keeps the eye ~0.36 m out
// (stance radius), far outside the 0.08 m near plane - a straight hug cannot clip.
// The clip classes that CAN happen are (a) visual geometry protruding past its
// collider by more than radius minus near-plane margin, (b) inside corners where
// two faces crowd the eye, and (c) stance-height changes under overhangs. So the
// sweep hugs every vertical face AND every inside corner, at all three stance eye
// heights (1.7 / 1.16 / 0.61 from gameplay.ts), and stage 2 probes each eye point
// against the VISUAL shot surfaces in the running game, where (a)-(c) live.
//
// Usage: npx tsx scripts/qa/sweep-eye-clearance-spots.ts
// Output: artifacts/qa/eye-clearance/<arena>-spots.json

import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildArena } from '../../src/map';
import { buildRustworks1v1, buildGunRange, buildSkylineTerminal } from '../../src/additional-maps';
import { buildHighSeas } from '../../src/high-seas';
import { isBlocked, type Box2 } from '../../src/collision';
import { InteractiveWorldRuntime } from '../../src/interactive-world-runtime';
import { shedPlacementsForArena, type ShedArenaId } from '../../src/destructible-shed-registry';

const STANCES = [
  { stance: 'stand', eye: 1.7, radius: 0.38 },
  { stance: 'crouch', eye: 1.16, radius: 0.36 },
  { stance: 'prone', eye: 0.61, radius: 0.36 },
] as const;

const HUG_GAP = 0.02;         // capsule face-to-wall gap for the closest legal hug
const FACE_STEP = 0.75;       // sample cadence along each face, metres
const MAX_SPOTS_PER_ARENA = 4000;

type Spot = {
  x: number; z: number; eyeY: number; stance: string;
  kind: 'face' | 'corner';
  facing: [number, number, number];
};

function faceSpots(box: Box2, colliders: readonly Box2[], groundY: number): Spot[] {
  // Rotated boxes get corner treatment only (their faces need frame math the
  // corner pass already covers well enough for a first sweep); axis-aligned
  // boxes get the full perimeter walk.
  if (box.rotation) return [];
  const out: Spot[] = [];
  const faces: Array<{ axis: 'x' | 'z'; at: number; dir: 1 | -1; lo: number; hi: number }> = [
    { axis: 'x', at: box.minX, dir: -1, lo: box.minZ, hi: box.maxZ },
    { axis: 'x', at: box.maxX, dir: 1, lo: box.minZ, hi: box.maxZ },
    { axis: 'z', at: box.minZ, dir: -1, lo: box.minX, hi: box.maxX },
    { axis: 'z', at: box.maxZ, dir: 1, lo: box.minX, hi: box.maxX },
  ];
  for (const face of faces) {
    const span = face.hi - face.lo;
    const steps = Math.max(1, Math.round(span / FACE_STEP));
    for (let index = 0; index <= steps; index += 1) {
      const along = face.lo + (span * index) / steps;
      for (const s of STANCES) {
        const offset = s.radius + HUG_GAP;
        const x = face.axis === 'x' ? face.at + face.dir * offset : along;
        const z = face.axis === 'z' ? face.at + face.dir * offset : along;
        const point = { x, y: groundY + 0.9, z };
        if (isBlocked(point, colliders, s.radius)) continue;
        // Face the wall: worst case for a forward-lean camera.
        const facing: [number, number, number] = face.axis === 'x'
          ? [-face.dir, 0, 0] : [0, 0, -face.dir];
        out.push({ x, z, eyeY: groundY + s.eye, stance: s.stance, kind: 'face', facing });
      }
    }
  }
  return out;
}

function cornerSpots(box: Box2, colliders: readonly Box2[], groundY: number): Spot[] {
  const out: Spot[] = [];
  const corners: Array<[number, number, number, number]> = [
    [box.minX, box.minZ, -1, -1], [box.minX, box.maxZ, -1, 1],
    [box.maxX, box.minZ, 1, -1], [box.maxX, box.maxZ, 1, 1],
  ];
  for (const [cx, cz, dx, dz] of corners) {
    for (const s of STANCES) {
      const diag = (s.radius + HUG_GAP) / Math.SQRT2;
      const x = cx + dx * diag;
      const z = cz + dz * diag;
      if (isBlocked({ x, y: groundY + 0.9, z }, colliders, s.radius)) continue;
      out.push({
        x, z, eyeY: groundY + s.eye, stance: s.stance, kind: 'corner',
        facing: [-dx / Math.SQRT2, 0, -dz / Math.SQRT2],
      });
    }
  }
  return out;
}

const ARENAS: Array<{ id: string; build: (scene: THREE.Scene) => { colliders: Box2[] } }> = [
  { id: 'atomic-acres', build: buildArena },
  { id: 'skyline-terminal', build: buildSkylineTerminal },
  { id: 'rustworks-1v1', build: buildRustworks1v1 },
  { id: 'gun-range', build: buildGunRange },
  { id: 'high-seas', build: buildHighSeas },
  // farcrysis deliberately absent: parked by the owner, 2026-08-28.
];

mkdirSync('artifacts/qa/eye-clearance', { recursive: true });
for (const arena of ARENAS) {
  const scene = new THREE.Scene();
  const map = arena.build(scene);
  // Legality must match the LIVE game, which composes static colliders with the
  // interactive-world runtime's shed and house-fragment colliders. The first run of
  // this sweep used static only, so a spot inside a shed wall was "legal" and its
  // eye probe then hit that same wall - reported as a clip that no real player can
  // reach. Boot the runtime exactly as legacy-main does and merge its view.
  let colliders = map.colliders;
  try {
    const placements = shedPlacementsForArena(arena.id as ShedArenaId);
    const houseDefinitions = (map as unknown as {
      houseDestruction?: { definitions?: readonly unknown[] };
    }).houseDestruction?.definitions ?? [];
    const runtime = new InteractiveWorldRuntime(
      arena.id as ShedArenaId, 1, placements, true, undefined, undefined,
      houseDefinitions as never,
    );
    colliders = [...map.colliders, ...runtime.collisions().movementColliders];
  } catch {
    // Arena without interactive-world support keeps its static set.
  }
  let spots: Spot[] = [];
  for (const box of colliders) {
    spots.push(...faceSpots(box, colliders, 0));
    spots.push(...cornerSpots(box, colliders, 0));
  }
  if (spots.length > MAX_SPOTS_PER_ARENA) {
    // Deterministic thin: keep every Nth. Reported, never silent.
    const keep = Math.ceil(spots.length / MAX_SPOTS_PER_ARENA);
    spots = spots.filter((_, index) => index % keep === 0);
    console.log(`${arena.id}: thinned to every ${keep}th spot`);
  }
  writeFileSync(`artifacts/qa/eye-clearance/${arena.id}-spots.json`,
    JSON.stringify({ arena: arena.id, colliders: colliders.length, spots }, null, 1));
  console.log(`${arena.id}: ${colliders.length} colliders -> ${spots.length} legal hug spots`);
}
