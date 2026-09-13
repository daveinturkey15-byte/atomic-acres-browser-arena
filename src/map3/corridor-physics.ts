/**
 * map3/corridor-physics.ts — corridor 7, THE PHYSICS PLAYGROUND.
 *
 * A corridor you walk into and knock apart. Four bays down its length:
 *
 *   1. JENGA   — 15 courses of 3 blocks, alternating orientation, each block a
 *                different density and a slightly different size. The mass is
 *                readable off the block: denser blocks are darker and redder.
 *   2. BALLS   — eight spheres from a 2.4 kg beach ball to a 23 kg lead shot,
 *                each with its own procedural surface and a motion trail.
 *   3. WALL    — a running-bond brick wall of 76 dynamic bricks. B puts every
 *                brick back exactly where it started.
 *   4. MACHINE — a paddle wheel on a revolute joint that the balls spin, a
 *                gear train and slider-crank driven by the wheel's own measured
 *                rotation, and a see-saw you can drop a block onto.
 *
 * Controls it installs itself (main.ts is not edited, so the corridor owns its
 * own listener and removes it in dispose()):
 *   B — rebuild the brick wall
 *   F — reset the whole playground: wall, tower, balls, machinery
 *
 * ---------------------------------------------------------------------------
 * FIVE THINGS THAT ARE DELIBERATE, AND WHY.
 *
 * 1. ITS OWN RAPIER WORLD. The game's world is a character-controller world
 *    with a fixed collider set and a timestep the character move() writes to
 *    every frame. Sharing it would mean this exhibit could destabilise the
 *    player. So this owns a private World, created from its own RAPIER.init(),
 *    and the only thing that crosses the boundary is a camera pose.
 *
 * 2. A FIXED TIMESTEP ACCUMULATOR. The solver's error per step grows with dt,
 *    and a 45-block stack has no margin for it. The world steps at exactly
 *    1/120 s (the game's SIMULATION_HZ), as many whole steps per frame as the
 *    accumulator holds, capped so a stall cannot spiral. That alone was NOT
 *    enough to keep this tower up — see the measured note on contact stiffness
 *    at the World construction below, which is the thing that actually was.
 *
 * 3. THE PLAYER IS A CAMERA, NOT A BODY. This preview walks a free camera with
 *    no collider, so there is nothing for Rapier to push with. Interaction is
 *    driven from the camera pose instead: a body that comes properly in front
 *    of a closing camera gets ONE impulse, away from the camera and below its
 *    centre of mass so a stack topples rather than slides, then a refractory
 *    period. Feed it with setPlayer(); see the integration note at the bottom.
 *
 * 4. EVERYTHING BATCHES. Three InstancedMeshes carry 129 of the 131 rigid
 *    bodies, one dynamic mesh carries all eight motion trails, and every static
 *    prop is merged per material: 15 meshes and 13.3k triangles for the whole
 *    corridor. Measured cost per frame: 0.31 ms at rest, and at worst — walker
 *    charging, every body awake — 0.84 ms of Rapier plus 0.12 ms of the JS
 *    here.
 *
 * 5. NO ShaderMaterial ANYWHERE. Repo contract: three/webgpu NodeMaterials with
 *    TSL node graphs, node EXPRESSIONS assigned directly to colorNode — never
 *    wrapped in Fn(() => ...)(), which compiles under the GLSL backend and then
 *    silently renders nothing on real WebGPU. Per-body variation rides in on
 *    InstancedBufferAttributes, which the WebGPU backend binds with
 *    GPUInputStepMode.Instance (WebGPUAttributeUtils.js:312).
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import type * as RapierTypes from '@dimforge/rapier3d-compat';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  abs, attribute, clamp, float, fract, max, mix, positionLocal, sin, smoothstep, uniform,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import type { CorridorSolid } from './corridor-solids';
import { rgb } from './foliage-material';
import { hash11 } from './leaf-geometry';
import { retryLoad } from '../retry-load';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const LEN = 50;
/** Playable width. Kerbs at ±HALF_W keep everything you kick in the corridor. */
const HALF_W = 5.4;

/**
 * The floor sits 4 cm above y = 0, not on it.
 *
 * The hub disc in main.ts is a radius-19 circle at y = 0 and every corridor's
 * mouth starts at world radius 18, so the first metre of any corridor floor is
 * coplanar with the hub. Z-fighting there is a live complaint in this repo, so
 * every horizontal surface in this file is given a real standoff and nothing is
 * ever placed flush with anything else.
 */
const FLOOR_Y = 0.04;

/**
 * Matches src/physics.ts CHARACTER_PHYSICS_CONFIG.gravity.
 *
 * Copied rather than imported ON PURPOSE: importing it pulls physics.ts, which
 * pulls gameplay.ts, which pulls the weapon adapter and the wire protocol into
 * a standalone graphics preview whose entire premise is that it shares nothing
 * with the game bundle. The number is one line and it is asserted here in a
 * comment instead. If the game's gravity changes, this changes with it.
 */
const GRAVITY_Y = -22;

/** SIMULATION_HZ in src/gameplay.ts. See note 2 in the file header. */
const FIXED_DT = 1 / 120;
/** A stalled frame must not be repaid all at once; four steps is 33 ms of sim. */
const MAX_STEPS_PER_FRAME = 4;

const TOWER_Z = -9;
const BALL_Z = -20;
const WALL_Z = -31;
const MACH_Z = -41;

/** How far in front of the camera a body can be and still be kicked. */
const KICK_REACH = 1.25;
/**
 * Velocity change a 1 kg body gets per m/s of closing speed, at zero range.
 *
 * A KICK, not a push. The first version applied this every frame a body was in
 * reach, and measuring it killed the idea: a 2.4 kg ball and a 10.1 kg ball
 * both travelled ~20 m from one walk-through, because the heavy one stayed in
 * reach longer and collected proportionally more impulses. A continuous push
 * converges on "everything leaves at the walker's speed" no matter what it
 * weighs, which is the exact opposite of what different masses are FOR. One
 * impulse on entry, then a refractory period, and the spread comes back.
 */
const KICK_GAIN = 0.95;
/**
 * Fraction of the reach a body must be INSIDE before the kick fires.
 *
 * Firing the moment a body crosses the outer edge of the reach made the kick
 * frame-rate dependent in the worst way: at 6.15 m/s the walker covers 10 cm a
 * frame, so the first in-range frame lands right at the fringe where the
 * distance falloff is ~0.03, the body gets a 0.37 m/s nudge, and the cooldown
 * then locks out the real contact entirely. Measured: everything from 2.4 kg to
 * 23 kg moved less than 30 cm at walking pace but flew several metres at 2 m/s,
 * which is exactly backwards. Waiting until the body is properly in front of
 * you makes the kick depend on speed and mass rather than on frame timing.
 */
const KICK_TRIGGER = 0.62;
/** Seconds before the same body can be kicked again. */
const KICK_COOLDOWN = 0.35;
/** Closing speed is clamped before it is used, so nothing goes into orbit. */
const KICK_MAX_CLOSING = 10;
/** Hard ceiling on the velocity change one kick can impart. */
const KICK_MAX_DV = 7;

const TRAIL_SAMPLES = 24;
/**
 * Minimum seconds between trail samples.
 *
 * The ring advances on the first frame at or past this, and the clock resets
 * rather than subtracting — so at 60 fps it takes a sample every second frame
 * and the ribbon's segments are evenly spaced in time (24 samples, ~0.8 s of
 * history). Subtracting instead would hit a truer 40 Hz but alternate one- and
 * two-frame gaps, which shows up as a visibly uneven ribbon.
 */
const TRAIL_INTERVAL = 1 / 40;

type V3 = { x: number; y: number; z: number };
type Q4 = { x: number; y: number; z: number; w: number };

/* ------------------------------------------------------------------ */
/* Small geometry helpers                                              */
/* ------------------------------------------------------------------ */

/** Merge for geometries carrying only position/normal/uv. */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []; const nor: number[] = []; const uvs: number[] = [];
  const idx: number[] = []; let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position'); const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count * 3; i++) pos.push(p.array[i] as number);
    for (let i = 0; i < p.count * 3; i++) nor.push(n ? (n.array[i] as number) : 0);
    for (let i = 0; i < p.count * 2; i++) uvs.push(u ? (u.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}

/** Merge and release the parts in one go — the pattern every builder below uses. */
function consume(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeSimple(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** A box placed by its centre. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/**
 * A spur gear with real teeth, axis along +X.
 *
 * Teeth matter here: a smooth disc spinning has no visible rotation at all, so
 * the whole point of driving the train from the wheel would be invisible.
 */
function makeGear(radius: number, teeth: number, thickness: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.CylinderGeometry(radius, radius, thickness, Math.max(14, teeth), 1);
  body.rotateZ(Math.PI / 2);
  parts.push(body);
  for (let i = 0; i < teeth; i++) {
    const t = new THREE.BoxGeometry(thickness * 0.86, radius * 0.24, radius * 0.30);
    t.translate(0, radius + radius * 0.10, 0);
    t.rotateX((i / teeth) * Math.PI * 2);
    parts.push(t);
  }
  const hub = new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, thickness * 1.7, 12);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  return consume(parts);
}

/**
 * The paddle wheel's render geometry, built from EXACTLY the numbers its
 * colliders are built from. A visual wheel that does not match its collider is
 * the classic physics-demo lie: things bounce off nothing.
 */
function makeWheel(
  hubR: number, blades: number, halfLen: number, halfWide: number, halfThick: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const axle = new THREE.CylinderGeometry(0.075, 0.075, halfWide * 2 + 0.9, 12);
  axle.rotateZ(Math.PI / 2);
  parts.push(axle);
  const hub = new THREE.CylinderGeometry(hubR * 0.42, hubR * 0.42, halfWide * 1.7, 14);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    const blade = box(halfWide * 2, halfLen * 2, halfThick * 2, 0, hubR, 0);
    blade.rotateX(a);
    parts.push(blade);
    const spoke = box(halfWide * 0.30, hubR, halfThick * 1.4, 0, hubR * 0.5, 0);
    spoke.rotateX(a);
    parts.push(spoke);
  }
  return consume(parts);
}

/* ------------------------------------------------------------------ */
/* Body book-keeping                                                   */
/* ------------------------------------------------------------------ */

interface Piece {
  body: RapierTypes.RigidBody;
  /** Scale applied to the family's unit source geometry. */
  scale: THREE.Vector3;
  /** Cached once; densities never change after build. */
  mass: number;
  /** Roughly half the body's largest extent — the kick's contact offset. */
  reach: number;
  /** Family multiplier so a brick wall is not as kickable as a beach ball. */
  kick: number;
  restP: V3;
  restQ: Q4;
}

/** The Corridor contract plus the three hooks main.ts needs. */
export interface PhysicsCorridor extends Corridor {
  /** Feed the walker's WORLD-space pose every frame. Both vectors are copied. */
  setPlayer(pos: THREE.Vector3, vel: THREE.Vector3): void;
  /** Put every brick back exactly where it started. Also bound to B. */
  rebuildWall(): void;
  /** Wall, tower, balls and machinery back to their build poses. Also bound to F. */
  resetAll(): void;
}

/* ------------------------------------------------------------------ */
/* The corridor                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* PREPARE, then BUILD (HF-409 finish)                                  */
/* ------------------------------------------------------------------ */

/**
 * MAP3 (HF-409 finisher 2): why this corridor is split in two.
 *
 * Building this corridor needs a wasm module, and fetching a wasm module is
 * asynchronous. That was fine while the corridor only ever appeared on
 * `/map3.html`, whose `main.ts` is free to await. It stops being fine the
 * moment the corridor is part of the ARENA, because three callers build an
 * arena SYNCHRONOUSLY and cannot be made async where they stand:
 *
 *   * `constructArena` in legacy-main sits inside the fenced transaction
 *     between the WebGPU fence and the authority commit - an await there opens
 *     the fence;
 *   * `__ATOMIC_ACRES_DEBUG__.traceBallistics(..., arenaId)` builds a
 *     NON-ACTIVE arena on the spot to trace against it, which is how the eye
 *     clearance stage-2 sweep works at all;
 *   * the collider/visual parity audit and the spawn-layout solver hold a
 *     plain `Record<ArenaId, (scene) => ArenaMap>` builder table.
 *
 * So the asynchrony is moved OUT of the build and in front of it.
 * `loadMap3Rapier()` is the whole async part: it resolves the chunk, runs
 * `RAPIER.init()` once, and caches the module. After it has resolved,
 * `createPhysicsCorridorSync()` is an ordinary synchronous constructor and
 * `buildMap3` is an ordinary synchronous builder.
 *
 * IT THROWS RATHER THAN OMITTING. An unprepared build does NOT quietly return
 * seven corridors instead of eight: an arena that is silently missing an
 * eighth of its content, its colliders and its shot surfaces would sail
 * through every gate that counts things it can see and would be measured,
 * ledgered and published as complete. The error names the fix instead.
 *
 * A FAILED LOAD IS NOT CACHED, for the same reason the arena factory registry
 * does not cache one: a flaky wasm fetch must not retire the corridor for the
 * rest of the session.
 */
let rapierModule: typeof RapierTypes | null = null;
let rapierLoad: Promise<typeof RapierTypes> | null = null;

/** True once `createPhysicsCorridorSync()` will not throw. */
export function isMap3RapierReady(): boolean {
  return rapierModule !== null;
}

/**
 * Resolve the Rapier chunk and initialise its wasm. Idempotent; concurrent
 * callers share one load. This is the ONLY asynchronous step Map 3 has.
 */
export async function loadMap3Rapier(): Promise<typeof RapierTypes> {
  if (rapierModule) return rapierModule;
  if (rapierLoad) return rapierLoad;
  rapierLoad = (async () => {
    /* ---- Rapier boot, matching src/physics.ts exactly ------------------ */
    const { default: RAPIER } = await retryLoad(
      'rapier3d chunk (map3 physics corridor)',
      () => import('@dimforge/rapier3d-compat'),
    );
    // Rapier 0.19.3's compatibility bundle calls its own wasm-bindgen loader with
    // the legacy positional form and warns even though the public init() takes no
    // arguments. Suppress only that upstream message; restore immediately. Left in
    // because map3's error surface promotes warnings to the screen.
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (args.length === 1
        && args[0] === 'using deprecated parameters for the initialization function; pass a single object instead') return;
      originalWarn(...args);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = originalWarn;
    }
    rapierModule = RAPIER as unknown as typeof RapierTypes;
    rapierLoad = null;
    return rapierModule;
  })().catch((error: unknown) => {
    rapierLoad = null;
    throw error;
  });
  return rapierLoad;
}

function requireRapier(): typeof RapierTypes {
  if (!rapierModule) {
    throw new Error(
      'map3 physics corridor: Rapier has not been prepared. createPhysicsCorridorSync() and '
      + 'buildMap3() are SYNCHRONOUS by contract, so the wasm module must already be resolved '
      + 'when they run. Await loadMap3Rapier() (or prepareMap3(), which wraps it) first. '
      + 'KNOWN CALLERS (HF-409): __ATOMIC_ACRES_DEBUG__.prepareArena(map3) before '
      + "traceBallistics against a non-active map3; the arena transition's preparation phase "
      + 'before constructArena; scripts/qa builder tables before they call buildMap3.',
    );
  }
  return rapierModule;
}

export type PhysicsCorridorOptions = Readonly<{
  /**
   * Install this corridor's own `keydown` listener for B (rebuild wall) and F
   * (reset everything). TRUE on `/map3.html`, which owns the whole window;
   * FALSE inside the game arena, which does not.
   *
   * WHY THE ARENA MUST PASS FALSE. `KeyB` is the game's `emote` binding and
   * `KeyF` is `interact` (src/key-bindings.ts). A window-level listener here
   * fires ALONGSIDE the game's own handler, so pressing F to use something
   * would silently also reset a 131-body playground three corridors away, and
   * emoting would rebuild a brick wall. The corridor still exposes
   * `rebuildWall()` and `resetAll()`; the arena simply has nothing bound to
   * them yet, which is the honest state - a new in-game keybinding belongs to
   * whoever owns the input map, not to a corridor.
   */
  bindKeys?: boolean;
}>;

/**
 * The async form kept for `/map3.html`, whose `main.ts` awaits its corridors
 * anyway. Exactly `prepare` then `build`, so the page and the arena run the
 * same constructor.
 */
export async function createPhysicsCorridor(
  options: PhysicsCorridorOptions = {},
): Promise<PhysicsCorridor> {
  await loadMap3Rapier();
  return createPhysicsCorridorSync(options);
}

/**
 * Build the playground. Synchronous; throws if `loadMap3Rapier()` has not
 * resolved. See the prepare-then-build note above.
 */
export function createPhysicsCorridorSync(
  options: PhysicsCorridorOptions = {},
): PhysicsCorridor {
  const RAPIER = requireRapier();
  const bindKeys = options.bindKeys ?? true;

  const world = new RAPIER.World({ x: 0, y: GRAVITY_Y, z: 0 });
  world.timestep = FIXED_DT;

  /**
   * CONTACT STIFFNESS IS WHY THE TOWER STANDS UP. Measured, not guessed.
   *
   * At Rapier's defaults this exact tower collapsed on its own in under four
   * seconds with nobody near it — 3.4 m of drift, every block on the floor. The
   * obvious suspects were all wrong: raising numSolverIterations from 8 to 16
   * changed nothing, a 1-3 mm contact skin changed nothing, more PGS iterations
   * changed nothing, more friction changed nothing, removing the size variation
   * changed nothing. Two things DID fix it, which is what identified the cause:
   * dropping gravity to -9.81, or removing the per-block density variation.
   *
   * Both of those say the same thing. Rapier's soft-contact model defaults to a
   * 30 Hz contact natural frequency, tuned for Earth gravity and similar masses.
   * The game runs at -22 (2.24 g) and these blocks span 3.5-11.9 kg, so a 30 Hz
   * contact is too compliant to hold: each joint sags a few millimetres, fifteen
   * courses of sag accumulate, the stack leans, and it goes over.
   *
   * Raising the contact frequency to 120 Hz and tightening the allowed linear
   * error takes the same tower to 3.7 mm of drift over ten seconds with the full
   * density spread intact, and costs 0.083 ms of physics per frame for all 131
   * bodies. Twelve solver iterations, because eight is enough for stability once
   * the contacts are stiff but twelve settles the brick wall visibly faster.
   *
   * If you ever change GRAVITY_Y, re-measure this.
   */
  world.numSolverIterations = 12;
  world.numInternalPgsIterations = 2;
  world.integrationParameters.contact_natural_frequency = 120;
  world.integrationParameters.normalizedAllowedLinearError = 0.0002;

  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const pieces: Piece[] = [];

  /* ================================================================== */
  /* Materials                                                           */
  /* ================================================================== */

  /**
   * Floor. positionLocal, NOT positionWorld: the hub rotates each corridor onto
   * its own spoke, so a world-space pattern would arrive at a different angle in
   * every corridor and the bay rings would sit off-centre.
   */
  const floorMat = new MeshStandardNodeMaterial();
  floorMat.metalness = 0;
  floorMat.polygonOffset = true;
  floorMat.polygonOffsetFactor = -1;
  floorMat.polygonOffsetUnits = -1;
  {
    const p = positionLocal;
    const speck = sin(p.x.mul(37.1)).mul(sin(p.z.mul(31.7))).mul(0.5).add(0.5);
    const base = mix(rgb(0x4b4d4e), rgb(0x5e605f), speck);

    // Expansion joints on a 2 m grid.
    const jx = float(1).sub(smoothstep(float(0.0), float(0.05), abs(sin(p.x.mul(Math.PI / 2)))));
    const jz = float(1).sub(smoothstep(float(0.0), float(0.05), abs(sin(p.z.mul(Math.PI / 2)))));
    const joint = clamp(jx.add(jz), float(0), float(1));

    // A painted ring around each bay. Compared in SQUARED distance so there is
    // no sqrt in the fragment for what is only ever a mask.
    const ring = (zc: number, r: number, w: number) => {
      const dz = p.z.sub(float(zc));
      const d2 = p.x.mul(p.x).add(dz.mul(dz));
      const inner = (r - w) * (r - w);
      const outer = r * r;
      return smoothstep(float(inner), float(inner + 0.2), d2)
        .mul(float(1).sub(smoothstep(float(outer), float(outer + 0.2), d2)));
    };
    const paint = clamp(
      ring(TOWER_Z, 2.3, 0.10)
        .add(ring(BALL_Z, 3.6, 0.10))
        .add(ring(WALL_Z, 2.9, 0.10))
        .add(ring(MACH_Z, 3.2, 0.10)),
      float(0), float(1),
    );

    floorMat.colorNode = mix(mix(base, rgb(0x212323), joint), rgb(0xd7c04a), paint.mul(0.85));
    floorMat.roughnessNode = mix(mix(float(0.93), float(0.74), joint), float(0.55), paint);
  }

  /** Kerbs, frames, plinths: painted steel with a hazard stripe. */
  const steelMat = new MeshStandardNodeMaterial();
  steelMat.metalness = 0.25;
  {
    const p = positionLocal;
    const stripe = smoothstep(float(0.42), float(0.58), fract(p.z.mul(0.55).add(p.y.mul(0.55))));
    steelMat.colorNode = mix(rgb(0xada595), rgb(0x2b2d2c), stripe.mul(0.7));
    steelMat.roughnessNode = float(0.66);
  }

  /**
   * Jenga wood. `aTone` is the block's NORMALISED DENSITY, straight off the same
   * number that went into the collider — so the shading is a readout of the mass
   * rather than decoration. Heavy blocks are dark and red; light ones are pale.
   */
  const woodMat = new MeshStandardNodeMaterial();
  woodMat.metalness = 0;
  {
    const p = positionLocal;                       // unit box, -0.5..0.5
    const tone = attribute('aTone', 'float');
    const grain = attribute('aGrain', 'float');
    const rings = sin(p.y.mul(41.0).add(p.z.mul(13.0)).add(grain.mul(6.2831))).mul(0.5).add(0.5);
    const timber = mix(rgb(0xcaa46c), rgb(0x8d6233), rings.mul(0.6));
    const density = mix(rgb(0xffffff), rgb(0x8a4526), tone);
    const rim = smoothstep(float(0.43), float(0.5), max(abs(p.x), max(abs(p.y), abs(p.z))));
    woodMat.colorNode = timber.mul(density).mul(mix(float(1.0), float(0.55), rim));
    woodMat.roughnessNode = mix(float(0.78), float(0.62), rings);
  }

  /**
   * Brick. `wallFlash` is a plain uniform driven from update(): the wall glows
   * for 0.8 s after a rebuild so you can see that B did something even if you
   * pressed it while facing the other way.
   */
  const wallFlash = uniform(0);
  const brickMat = new MeshStandardNodeMaterial();
  brickMat.metalness = 0;
  {
    const p = positionLocal;
    const tone = attribute('aTone', 'float');
    const wear = attribute('aWear', 'float');
    const clay = mix(rgb(0x8d4531), rgb(0xb5694b), tone);
    const mottle = sin(p.x.mul(23.0).add(wear.mul(9.4))).mul(sin(p.y.mul(33.0))).mul(0.5).add(0.5);
    const face = mix(clay, clay.mul(0.7), mottle.mul(0.55));
    // A chamfered rim reads as a mortar joint without a second body per brick.
    const mortar = smoothstep(float(0.42), float(0.5), max(abs(p.x), max(abs(p.y), abs(p.z))));
    brickMat.colorNode = mix(face, rgb(0xb6b0a2), mortar.mul(0.8));
    brickMat.roughnessNode = mix(float(0.88), float(0.7), mortar);
    brickMat.emissiveNode = rgb(0x3f8ec9).mul(wallFlash);
  }

  /**
   * Balls. Everything that makes one ball look unlike another arrives as a
   * per-instance attribute, so eight visibly different surfaces cost one draw
   * call and one pipeline. `aParam` is (pattern frequency, pattern kind,
   * roughness, metalness).
   */
  const ballMat = new MeshStandardNodeMaterial();
  {
    const p = positionLocal;                        // unit sphere, radius 0.5
    const cA = attribute('aColA', 'vec3');
    const cB = attribute('aColB', 'vec3');
    const prm = attribute('aParam', 'vec4');
    const f = prm.x;
    const kind = prm.y;

    const bands = sin(p.y.mul(f)).mul(0.5).add(0.5);
    const checker = smoothstep(float(-0.03), float(0.03),
      sin(p.x.mul(f)).mul(sin(p.y.mul(f))).mul(sin(p.z.mul(f))));
    const dimple = smoothstep(float(0.15), float(0.92),
      abs(sin(p.x.mul(f)).mul(sin(p.z.mul(f)))));
    // f is a NODE, so `f * 1.7` is JS arithmetic on an object and evaluates to
    // NaN, which three then bakes into the shader as the literal `NaN.0` and the
    // whole fragment program fails to compile. Node arithmetic must use .mul().
    const marble = sin(p.x.mul(f).add(sin(p.y.mul(f.mul(1.7))).mul(2.2))).mul(0.5).add(0.5);

    // An exact selector: 1 where kind == k, 0 at every other integer kind.
    const pick = (k: number) => clamp(float(1).sub(abs(kind.sub(float(k)))), float(0), float(1));
    const pattern = clamp(
      bands.mul(pick(0)).add(checker.mul(pick(1)))
        .add(dimple.mul(pick(2))).add(marble.mul(pick(3))),
      float(0), float(1),
    );

    ballMat.colorNode = mix(cA, cB, pattern);
    ballMat.roughnessNode = prm.z;
    ballMat.metalnessNode = prm.w;
  }

  /** Machined metal for the wheel, gears and slider-crank. */
  const metalMat = new MeshStandardNodeMaterial();
  metalMat.metalness = 0.86;
  {
    const p = positionLocal;
    const brush = sin(p.x.mul(62.0).add(p.z.mul(7.0))).mul(0.5).add(0.5);
    metalMat.colorNode = mix(rgb(0x4a4f54), rgb(0x7b8288), brush);
    metalMat.roughnessNode = mix(float(0.30), float(0.46), brush);
  }

  /** Plank for the see-saw — plain sawn timber, no instancing needed. */
  const plankMat = new MeshStandardNodeMaterial();
  plankMat.metalness = 0;
  {
    const p = positionLocal;
    const grain = sin(p.z.mul(21.0).add(sin(p.x.mul(6.0)).mul(1.4))).mul(0.5).add(0.5);
    plankMat.colorNode = mix(rgb(0x9b7440), rgb(0x6a4c26), grain);
    plankMat.roughnessNode = float(0.84);
  }

  /**
   * Motion trails. Unlit on purpose — a trail is a readout, not a surface, and
   * lighting it makes it disappear whenever the ball is in shadow.
   */
  const trailMat = new MeshBasicNodeMaterial();
  trailMat.transparent = true;
  trailMat.depthWrite = false;
  trailMat.side = THREE.DoubleSide;
  trailMat.toneMapped = false;
  {
    trailMat.colorNode = attribute('aTint', 'vec3');
    trailMat.opacityNode = attribute('aFade', 'float').mul(0.8);
  }

  disposables.push(floorMat, steelMat, woodMat, brickMat, ballMat, metalMat, plankMat, trailMat);

  /* ================================================================== */
  /* Static world: floor, kerbs, colliders                               */
  /* ================================================================== */

  const floorGeo = new THREE.PlaneGeometry(HALF_W * 2, LEN + 1, 24, 100);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, FLOOR_Y, -LEN / 2 + 0.5);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  // MAP3 (HF-409 finisher 2): every mesh here is NAMED, because the parity
  // audit and its triage ledger identify geometry by name and this corridor
  // was authored for a page where nothing ever asked. Names deliberately dodge
  // the audit's own exclusion patterns: "seesaw" matches /sea/ and would have
  // quietly excused the tilt plank as water presentation.
  floor.name = 'map3-physics-bay-floor';
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  /** Static collider from a centre and half extents. No body = fixed in Rapier. */
  const staticBox = (hx: number, hy: number, hz: number, x: number, y: number, z: number,
                     rot?: Q4): void => {
    const desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setFriction(0.9)
      .setRestitution(0.02);
    if (rot) desc.setRotation(rot);
    world.createCollider(desc);
  };

  // Ground: a thick slab whose TOP face is exactly the rendered floor height.
  staticBox(HALF_W + 1, 0.5, (LEN + 2) / 2, 0, FLOOR_Y - 0.5, -LEN / 2 + 0.5);

  /**
   * A box STANDING on the floor.
   *
   * Its base is buried 15 cm rather than resting at FLOOR_Y, because a box whose
   * bottom face is exactly the floor height gives you two coplanar surfaces and
   * a shimmering seam all the way down the corridor. Nothing in this file is
   * ever placed flush with anything else.
   */
  const standing = (w: number, h: number, d: number, x: number, z: number) =>
    box(w, h + 0.15, d, x, FLOOR_Y + h / 2 - 0.075, z);

  const kerbParts: THREE.BufferGeometry[] = [];
  const KERB_H = 0.44;
  /**
   * MAP3 (HF-409 finisher 2): what the ARENA collides in this corridor.
   *
   * Two collider sets exist here and they are not the same set, on purpose.
   * `staticBox()` above writes into this corridor's PRIVATE Rapier world - the
   * one the bricks and balls live in - and those boxes are sized for a rolling
   * 23 kg lead shot (the mouth threshold's Rapier box stands 0.64 m so nothing
   * escapes into the hub). `solids` below is what the GAME's movement and shot
   * authority gets, and it must describe what a PLAYER meets: the same kerb at
   * its true visible 0.34 m, which is under the 0.45 m autostep, so you walk
   * into the bay instead of bouncing off an invisible wall a third of a metre
   * taller than the thing you can see.
   *
   * Only the STATIC mass is here. Every jenga block, brick, ball, gear, paddle
   * and see-saw plank is a dynamic body that moves every frame, and a Box2
   * collider is a static world rectangle: pinning one where a brick stood at
   * t = 0 leaves an invisible brick in the aisle and the real one intangible.
   * That is the rovers' argument in the parity ledger, and it is the same
   * argument.
   */
  const solids: CorridorSolid[] = [];
  for (const side of [-1, 1]) {
    kerbParts.push(standing(0.30, KERB_H, LEN + 1, side * HALF_W, -LEN / 2 + 0.5));
    staticBox(0.15, KERB_H / 2 + 0.4, (LEN + 1) / 2, side * HALF_W, FLOOR_Y + KERB_H / 2 - 0.4, -LEN / 2 + 0.5);
    solids.push({
      name: `kerb-${side < 0 ? 'west' : 'east'}`,
      x: side * HALF_W, y: FLOOR_Y + KERB_H / 2, z: -LEN / 2 + 0.5,
      sx: 0.30, sy: KERB_H, sz: LEN + 1, material: 'metal',
    });
  }
  // Threshold at the mouth and a back wall at the far end so nothing escapes
  // into the hub or off the end of the world.
  kerbParts.push(standing(HALF_W * 2, 0.34, 0.3, 0, 0.35));
  staticBox(HALF_W, 0.5, 0.15, 0, FLOOR_Y + 0.1, 0.35);
  solids.push({
    name: 'mouth-threshold', x: 0, y: FLOOR_Y + 0.17, z: 0.35,
    sx: HALF_W * 2, sy: 0.34, sz: 0.3, material: 'metal',
  });
  kerbParts.push(standing(HALF_W * 2, 1.2, 0.34, 0, -LEN + 0.3));
  staticBox(HALF_W, 0.6, 0.17, 0, FLOOR_Y + 0.6, -LEN + 0.3);
  solids.push({
    name: 'back-wall', x: 0, y: FLOOR_Y + 0.6, z: -LEN + 0.3,
    sx: HALF_W * 2, sy: 1.2, sz: 0.34, material: 'metal',
  });

  /* ================================================================== */
  /* Bay 1 — the Jenga tower                                             */
  /* ================================================================== */

  const COURSES = 15;
  const BLOCK_LEN = 0.54;
  const jengaTone: number[] = [];
  const jengaGrain: number[] = [];

  {
    let y = FLOOR_Y;
    for (let c = 0; c < COURSES; c++) {
      // Height is uniform WITHIN a course. Varying it per block would leave the
      // course non-planar, and a Jenga tower on a non-planar course does not
      // settle — it slowly walks itself apart over about ten seconds and looks
      // like a solver bug when it is really an authoring bug.
      const h = 0.104 + hash11(c * 3.7 + 1.1) * 0.016;
      const along = c % 2 === 0;                    // even courses run along +X
      const widths = [0, 1, 2].map((i) => 0.166 + hash11(c * 11.3 + i * 2.9) * 0.028);
      const gap = 0.005;
      const total = widths[0] + widths[1] + widths[2] + gap * 2;
      let off = -total / 2;

      for (let i = 0; i < 3; i++) {
        const w = widths[i];
        const across = off + w / 2;
        off += w + gap;

        const ex = along ? BLOCK_LEN : w;           // full extents
        const ez = along ? w : BLOCK_LEN;
        const px = along ? 0 : across;
        const pz = along ? across : 0;

        // 340..1100 kg/m^3: balsa through to a dense tropical hardwood. At this
        // block volume that is 3.6 kg to 11.6 kg, which is a spread you feel.
        const density = 340 + hash11(c * 17.7 + i * 5.3) * 760;

        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(px, y + h / 2, TOWER_Z + pz)
            .setLinearDamping(0.12)
            .setAngularDamping(0.38)
            .setCanSleep(true),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(ex / 2, h / 2, ez / 2)
            .setDensity(density)
            .setFriction(0.86)
            .setRestitution(0.02),
          body,
        );

        const t = body.translation();
        pieces.push({
          body,
          scale: new THREE.Vector3(ex, h, ez),
          mass: body.mass(),
          reach: Math.max(ex, ez) * 0.5,
          kick: 0.85,
          restP: { x: t.x, y: t.y, z: t.z },
          restQ: { x: 0, y: 0, z: 0, w: 1 },
        });
        jengaTone.push((density - 340) / 760);
        jengaGrain.push(hash11(c * 7.1 + i * 13.9));
      }
      y += h;
    }
  }
  const JENGA_COUNT = jengaTone.length;
  const JENGA_FIRST = 0;

  /* ================================================================== */
  /* Bay 2 — the balls                                                   */
  /* ================================================================== */

  /**
   * Densities are TUNED, not physical: a real 0.24 m steel ball is 190 kg and
   * would not move for a walking player. What matters is the RATIO — 2.4 kg to
   * 23 kg is a tenfold spread, which is about as much as a kick can express
   * before the heavy end reads as scenery.
   */
  const BALLS: Array<{
    r: number; density: number; rest: number; friction: number;
    colA: number; colB: number; kind: number; freq: number; rough: number; metal: number;
    x: number; z: number;
  }> = [
    { r: 0.40, density: 9, rest: 0.74, friction: 0.55, colA: 0xf2f4f6, colB: 0x2fb6d8, kind: 0, freq: 24, rough: 0.55, metal: 0.0, x: -3.6, z: -17.2 },
    { r: 0.34, density: 22, rest: 0.66, friction: 0.72, colA: 0xf5a23a, colB: 0x8c3a12, kind: 3, freq: 17, rough: 0.74, metal: 0.0, x: -2.0, z: -19.4 },
    { r: 0.30, density: 60, rest: 0.86, friction: 0.90, colA: 0xd93b3b, colB: 0x141414, kind: 1, freq: 13, rough: 0.60, metal: 0.0, x: -0.4, z: -17.6 },
    { r: 0.28, density: 110, rest: 0.42, friction: 0.62, colA: 0xd8cfae, colB: 0x8f7d4e, kind: 2, freq: 29, rough: 0.80, metal: 0.0, x: 1.2, z: -19.8 },
    { r: 0.26, density: 240, rest: 0.30, friction: 0.70, colA: 0xc2c6c9, colB: 0x565d62, kind: 3, freq: 11, rough: 0.34, metal: 0.15, x: 2.8, z: -17.4 },
    { r: 0.24, density: 330, rest: 0.52, friction: 0.40, colA: 0xdfe5ea, colB: 0x99a3aa, kind: 0, freq: 33, rough: 0.16, metal: 0.95, x: 4.0, z: -20.6 },
    { r: 0.22, density: 520, rest: 0.22, friction: 0.80, colA: 0x3b4550, colB: 0x0d1116, kind: 1, freq: 21, rough: 0.44, metal: 0.55, x: -3.0, z: -21.8 },
    { r: 0.32, density: 38, rest: 0.70, friction: 0.85, colA: 0x6ee08a, colB: 0x18452a, kind: 2, freq: 19, rough: 0.58, metal: 0.0, x: 0.6, z: -22.6 },
  ];
  const BALL_COUNT = BALLS.length;
  const BALL_FIRST = pieces.length;

  BALLS.forEach((b) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(b.x, FLOOR_Y + b.r + 0.004, b.z)
        .setLinearDamping(0.16)
        .setAngularDamping(0.30)
        .setCanSleep(true)
        // Soft CCD, not full CCD: a hard-kicked light ball can otherwise tunnel
        // a 7 cm paddle, and soft prediction costs a fraction of swept CCD.
        .setSoftCcdPrediction(0.5),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(b.r)
        .setDensity(b.density)
        .setFriction(b.friction)
        .setRestitution(b.rest),
      body,
    );
    const t = body.translation();
    pieces.push({
      body,
      scale: new THREE.Vector3(b.r * 2, b.r * 2, b.r * 2),
      mass: body.mass(),
      reach: b.r,
      kick: 1.0,
      restP: { x: t.x, y: t.y, z: t.z },
      restQ: { x: 0, y: 0, z: 0, w: 1 },
    });
  });

  /* ================================================================== */
  /* Bay 3 — the brick wall                                              */
  /* ================================================================== */

  const BRICK_L = 0.44;
  const BRICK_H = 0.14;
  const BRICK_D = 0.22;
  const WALL_COURSES = 9;
  const WALL_WHOLE = 8;                 // whole bricks in an even course
  const PERPEND = 0.012;                // vertical joint only; bed joints are exact
  const brickTone: number[] = [];
  const brickWear: number[] = [];
  const BRICK_FIRST = pieces.length;

  {
    const pitch = BRICK_L + PERPEND;
    const wallW = WALL_WHOLE * pitch - PERPEND;
    for (let c = 0; c < WALL_COURSES; c++) {
      const y = FLOOR_Y + BRICK_H / 2 + c * BRICK_H;
      // Running bond: odd courses are offset half a brick and closed at each end
      // with a real half brick, so the wall face stays flush instead of stepping.
      const odd = c % 2 === 1;
      const lens: number[] = [];
      if (odd) {
        lens.push(BRICK_L / 2);
        for (let i = 0; i < WALL_WHOLE - 1; i++) lens.push(BRICK_L);
        lens.push(BRICK_L / 2);
      } else {
        for (let i = 0; i < WALL_WHOLE; i++) lens.push(BRICK_L);
      }
      let x = -wallW / 2;
      lens.forEach((len, i) => {
        const cx = x + len / 2;
        x += len + PERPEND;
        // 2.9-7.3 kg. Heavier bricks were measurably no fun: at 4.3-10.4 kg a
        // sprint through the wall displaced 7 of 76 and a walk displaced 2.
        const density = 420 + hash11(c * 9.1 + i * 4.3) * 120;
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(cx, y, WALL_Z)
            .setLinearDamping(0.14)
            .setAngularDamping(0.42)
            .setCanSleep(true),
        );
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(len / 2, BRICK_H / 2, BRICK_D / 2)
            .setDensity(density)
            .setFriction(0.92)
            .setRestitution(0.01),
          body,
        );
        pieces.push({
          body,
          scale: new THREE.Vector3(len, BRICK_H, BRICK_D),
          mass: body.mass(),
          reach: Math.max(len, BRICK_D) * 0.5,
          // A wall is a rigid stack: a brick with neighbours on five sides
          // barely notices the impulse that would send a loose one flying, so
          // the family scale is above 1 to compensate. Measured response at
          // 1.4: stroll in at 2.5 m/s and nothing moves, walk in at 6.15 and 57
          // of 76 bricks come down, sprint and 59 do. That threshold — leaning
          // on it does nothing, walking into it demolishes it — is the point.
          kick: 1.4,
          restP: { x: cx, y, z: WALL_Z },
          restQ: { x: 0, y: 0, z: 0, w: 1 },
        });
        brickTone.push(hash11(c * 3.3 + i * 7.7));
        brickWear.push(hash11(c * 21.7 + i * 1.9));
      });
    }
  }
  const BRICK_COUNT = brickTone.length;
  const BRICK_LAST = BRICK_FIRST + BRICK_COUNT;

  /* ================================================================== */
  /* Bay 4 — the machine                                                 */
  /* ================================================================== */

  // --- paddle wheel ----------------------------------------------------
  const HUB_R = 0.50;
  const BLADES = 8;
  const BLADE_HALF_LEN = 0.26;
  const BLADE_HALF_WIDE = 0.70;
  const BLADE_HALF_THICK = 0.03;
  const WHEEL_POS: V3 = { x: 0, y: FLOOR_Y + 0.84, z: MACH_Z };

  const wheelAnchor = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(WHEEL_POS.x, WHEEL_POS.y, WHEEL_POS.z),
  );
  const wheelBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(WHEEL_POS.x, WHEEL_POS.y, WHEEL_POS.z)
      // Low angular damping is the whole point: the wheel has to coast long
      // enough after a hit that you can watch the gear train run down.
      .setAngularDamping(0.22)
      .setLinearDamping(0.5)
      .setCanSleep(true),
  );
  for (let i = 0; i < BLADES; i++) {
    const a = (i / BLADES) * Math.PI * 2;
    const half = a / 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(BLADE_HALF_WIDE, BLADE_HALF_LEN, BLADE_HALF_THICK)
        // Rotating about X by `a` puts the blade at angle `a` in the YZ plane,
        // which is exactly what makeWheel() does to the render geometry.
        .setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) })
        .setTranslation(0, Math.cos(a) * HUB_R, Math.sin(a) * HUB_R)
        .setDensity(26)
        .setFriction(0.7)
        .setRestitution(0.15),
      wheelBody,
    );
  }
  world.createCollider(
    RAPIER.ColliderDesc.ball(HUB_R * 0.42).setDensity(26).setFriction(0.5), wheelBody,
  );
  world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    wheelAnchor, wheelBody, true,
  );
  pieces.push({
    body: wheelBody,
    scale: new THREE.Vector3(1, 1, 1),
    mass: wheelBody.mass(),
    reach: HUB_R + BLADE_HALF_LEN * 2,
    kick: 1.0,
    restP: { ...WHEEL_POS },
    restQ: { x: 0, y: 0, z: 0, w: 1 },
  });

  // --- see-saw ---------------------------------------------------------
  const PLANK_POS: V3 = { x: -3.1, y: FLOOR_Y + 0.52, z: MACH_Z - 0.4 };
  const PLANK_HALF: V3 = { x: 0.42, y: 0.045, z: 1.30 };
  const plankAnchor = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(PLANK_POS.x, PLANK_POS.y, PLANK_POS.z),
  );
  const plankBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(PLANK_POS.x, PLANK_POS.y, PLANK_POS.z)
      .setAngularDamping(0.55)
      .setLinearDamping(0.5)
      .setCanSleep(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(PLANK_HALF.x, PLANK_HALF.y, PLANK_HALF.z)
      .setDensity(42).setFriction(0.9).setRestitution(0.03),
    plankBody,
  );
  // End lips, so a ball you tip onto the plank stays on it for a moment.
  for (const s of [-1, 1]) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(PLANK_HALF.x, 0.07, 0.03)
        .setTranslation(0, 0.10, s * (PLANK_HALF.z - 0.04))
        .setDensity(42).setFriction(0.9),
      plankBody,
    );
  }
  world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }),
    plankAnchor, plankBody, true,
  );
  pieces.push({
    body: plankBody,
    scale: new THREE.Vector3(1, 1, 1),
    mass: plankBody.mass(),
    reach: 0.6,
    kick: 0.9,
    restP: { ...PLANK_POS },
    restQ: { x: 0, y: 0, z: 0, w: 1 },
  });

  // --- static machine frame -------------------------------------------
  const GEAR_X = 2.35;
  const GEAR_BIG_R = 0.46;
  const GEAR_SMALL_R = 0.20;
  const GEAR_RATIO = -GEAR_BIG_R / GEAR_SMALL_R;     // meshing gears counter-rotate
  const GEAR_BIG: V3 = { x: GEAR_X, y: WHEEL_POS.y, z: MACH_Z };
  const GEAR_SMALL: V3 = { x: GEAR_X, y: WHEEL_POS.y + GEAR_BIG_R + GEAR_SMALL_R, z: MACH_Z };
  const CRANK_R = 0.13;
  const ROD_LEN = 0.66;
  const DIAL: V3 = { x: -1.9, y: FLOOR_Y + 1.85, z: MACH_Z + 0.6 };

  const frameParts: THREE.BufferGeometry[] = [];
  // Wheel bearings.
  for (const s of [-1, 1]) {
    const bx = WHEEL_POS.x + s * (BLADE_HALF_WIDE + 0.16);
    frameParts.push(standing(0.14, WHEEL_POS.y + 0.16 - FLOOR_Y, 0.30, bx, MACH_Z));
    staticBox(0.07, (WHEEL_POS.y + 0.16) / 2, 0.15, bx, FLOOR_Y + (WHEEL_POS.y + 0.16) / 2, MACH_Z);
  }
  // Gear-train stanchion, and an open guide rail beside the piston so its
  // stroke is legible. A closed cylinder would hide the only moving part.
  frameParts.push(standing(0.12, GEAR_SMALL.y + 0.5 - FLOOR_Y, 0.24, GEAR_X + 0.30, MACH_Z));
  frameParts.push(box(0.05, 0.05, 1.0, GEAR_X + 0.22, GEAR_SMALL.y, MACH_Z + 0.72));
  // Dial plate for the tachometer needle: a disc facing back down the corridor.
  {
    const plate = new THREE.CylinderGeometry(0.34, 0.34, 0.05, 24);
    plate.rotateX(Math.PI / 2);
    plate.translate(DIAL.x, DIAL.y, DIAL.z);
    frameParts.push(plate);
    frameParts.push(standing(0.10, DIAL.y - FLOOR_Y, 0.10, DIAL.x, DIAL.z));
    for (let i = 0; i <= 8; i++) {
      const a = -2.4 + (i / 8) * 4.8;
      const tick = box(0.022, 0.07, 0.022, 0, 0.26, 0);
      tick.rotateZ(a);
      // 5 cm proud of the plate face, never grazing it.
      tick.translate(DIAL.x, DIAL.y, DIAL.z + 0.075);
      frameParts.push(tick);
    }
  }
  // See-saw fulcrum: a four-sided pyramid, base buried, apex stopping 2 cm short
  // of the plank so the two never intersect at any tilt.
  {
    const wedgeH = 0.60;
    const wedge = new THREE.CylinderGeometry(0.001, 0.42, wedgeH, 4);
    wedge.rotateY(Math.PI / 4);
    wedge.translate(PLANK_POS.x, FLOOR_Y - 0.15 + wedgeH / 2, PLANK_POS.z);
    frameParts.push(wedge);
    // Static steel, and tall enough to stop a body: the arena collides it.
    solids.push({
      name: 'seesaw-fulcrum', x: PLANK_POS.x, y: FLOOR_Y - 0.15 + wedgeH / 2, z: PLANK_POS.z,
      sx: 0.60, sy: wedgeH, sz: 0.60, material: 'metal',
    });
  }
  // Two guide rails that funnel a kicked ball into the paddles instead of past
  // them. Angled inward, so they steer rather than block.
  for (const s of [-1, 1]) {
    const a = s * 0.42;
    const rail = box(0.10, 0.65, 3.2, 0, 0, 0);
    rail.rotateY(a);
    rail.translate(s * 1.95, FLOOR_Y + 0.25, MACH_Z + 2.1);
    frameParts.push(rail);
    // The rails are yawed by +/-0.42 rad. `clusterSolid`'s rule applies: a yaw
    // that is not a quarter turn is DROPPED rather than inflated into an AABB,
    // so the collider stays the rail's true footprint, square to the corridor
    // and always inside the visible steel.
    solids.push({
      name: `machine-guide-rail-${s < 0 ? 'west' : 'east'}`,
      x: s * 1.95, y: FLOOR_Y + 0.25, z: MACH_Z + 2.1,
      sx: 0.10, sy: 0.65, sz: 3.2, material: 'metal',
    });
    staticBox(0.05, 0.25, 1.6, s * 1.95, FLOOR_Y + 0.25, MACH_Z + 2.1,
      { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
  }

  const frameGeo = consume(frameParts);
  const frameMesh = new THREE.Mesh(frameGeo, steelMat);
  frameMesh.name = 'map3-physics-machine-frame';
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(frameMesh);
  disposables.push(frameGeo);

  const kerbGeo = consume(kerbParts);
  const kerbMesh = new THREE.Mesh(kerbGeo, steelMat);
  kerbMesh.name = 'map3-physics-kerb';
  kerbMesh.castShadow = true;
  kerbMesh.receiveShadow = true;
  group.add(kerbMesh);
  disposables.push(kerbGeo);

  /* ================================================================== */
  /* Render side — instanced families                                    */
  /* ================================================================== */

  /**
   * Build one InstancedMesh for a family of bodies.
   *
   * THE FRUSTUM TRAP. three's Frustum.intersectsObject() prefers
   * `object.boundingSphere` when the property EXISTS, and InstancedMesh defines
   * it as null — so the first frustum test calls computeBoundingSphere() once,
   * caches the result, and never looks again. Every instance then moves and the
   * cached sphere goes stale: turn away and the entire mesh pops out of the
   * frame, blinking on and off as you look around. The source geometry's own
   * sphere is worse still — it is the unit box, radius 0.87.
   *
   * So: compute the source sphere honestly (other code may read it), seed the
   * instance sphere after the initial spread, and then turn culling off. These
   * bodies move every frame and the corridor is one contiguous region; a
   * per-frame recompute would cost more than the draw it saves.
   */
  function buildFamily(
    source: THREE.BufferGeometry, material: THREE.Material, count: number,
    attrs: Array<{ name: string; data: Float32Array; size: number }>,
  ): THREE.InstancedMesh {
    attrs.forEach((a) => {
      source.setAttribute(a.name, new THREE.InstancedBufferAttribute(a.data, a.size));
    });
    source.computeBoundingSphere();
    const mesh = new THREE.InstancedMesh(source, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  const xf = new THREE.Matrix4();
  const tmpP = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  /** Write every body in [first, first+count) into an instanced mesh. */
  function writeInstances(mesh: THREE.InstancedMesh, first: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const piece = pieces[first + i];
      const t = piece.body.translation();
      const r = piece.body.rotation();
      tmpP.set(t.x, t.y, t.z);
      tmpQ.set(r.x, r.y, r.z, r.w);
      xf.compose(tmpP, tmpQ, piece.scale);
      mesh.setMatrixAt(i, xf);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- Jenga -----------------------------------------------------------
  const jengaGeo = new THREE.BoxGeometry(1, 1, 1);
  const jengaMesh = buildFamily(jengaGeo, woodMat, JENGA_COUNT, [
    { name: 'aTone', data: new Float32Array(jengaTone), size: 1 },
    { name: 'aGrain', data: new Float32Array(jengaGrain), size: 1 },
  ]);
  jengaMesh.name = "map3-physics-jenga-block";
  group.add(jengaMesh);
  disposables.push(jengaGeo, jengaMesh);

  // --- bricks ----------------------------------------------------------
  const brickGeo = new THREE.BoxGeometry(1, 1, 1);
  const brickMesh = buildFamily(brickGeo, brickMat, BRICK_COUNT, [
    { name: 'aTone', data: new Float32Array(brickTone), size: 1 },
    { name: 'aWear', data: new Float32Array(brickWear), size: 1 },
  ]);
  brickMesh.name = "map3-physics-wall-brick";
  group.add(brickMesh);
  disposables.push(brickGeo, brickMesh);

  // --- balls -----------------------------------------------------------
  const ballColA = new Float32Array(BALL_COUNT * 3);
  const ballColB = new Float32Array(BALL_COUNT * 3);
  const ballParam = new Float32Array(BALL_COUNT * 4);
  const tmpColor = new THREE.Color();
  BALLS.forEach((b, i) => {
    tmpColor.set(b.colA);
    ballColA[i * 3] = tmpColor.r; ballColA[i * 3 + 1] = tmpColor.g; ballColA[i * 3 + 2] = tmpColor.b;
    tmpColor.set(b.colB);
    ballColB[i * 3] = tmpColor.r; ballColB[i * 3 + 1] = tmpColor.g; ballColB[i * 3 + 2] = tmpColor.b;
    ballParam[i * 4] = b.freq;
    ballParam[i * 4 + 1] = b.kind;
    ballParam[i * 4 + 2] = b.rough;
    ballParam[i * 4 + 3] = b.metal;
  });
  const ballGeo = new THREE.SphereGeometry(0.5, 22, 16);
  const ballMesh = buildFamily(ballGeo, ballMat, BALL_COUNT, [
    { name: 'aColA', data: ballColA, size: 3 },
    { name: 'aColB', data: ballColB, size: 3 },
    { name: 'aParam', data: ballParam, size: 4 },
  ]);
  ballMesh.name = "map3-physics-ball";
  group.add(ballMesh);
  disposables.push(ballGeo, ballMesh);

  // --- machine meshes --------------------------------------------------
  const wheelGeo = makeWheel(HUB_R, BLADES, BLADE_HALF_LEN, BLADE_HALF_WIDE, BLADE_HALF_THICK);
  const wheelMesh = new THREE.Mesh(wheelGeo, metalMat);
  wheelMesh.name = 'map3-physics-paddle-wheel';
  wheelMesh.castShadow = true;
  group.add(wheelMesh);
  disposables.push(wheelGeo);

  const plankGeo = box(PLANK_HALF.x * 2, PLANK_HALF.y * 2, PLANK_HALF.z * 2, 0, 0, 0);
  const lipA = box(PLANK_HALF.x * 2, 0.14, 0.06, 0, 0.10, PLANK_HALF.z - 0.04);
  const lipB = box(PLANK_HALF.x * 2, 0.14, 0.06, 0, 0.10, -(PLANK_HALF.z - 0.04));
  const plankFullGeo = consume([plankGeo, lipA, lipB]);
  const plankMesh = new THREE.Mesh(plankFullGeo, plankMat);
  plankMesh.name = 'map3-physics-tilt-plank';
  plankMesh.castShadow = true;
  group.add(plankMesh);
  disposables.push(plankFullGeo);

  const bigGearGeo = makeGear(GEAR_BIG_R, 22, 0.10);
  const bigGear = new THREE.Mesh(bigGearGeo, metalMat);
  bigGear.name = 'map3-physics-gear-large';
  bigGear.position.set(GEAR_BIG.x, GEAR_BIG.y, GEAR_BIG.z);
  group.add(bigGear);
  disposables.push(bigGearGeo);

  const smallGearGeo = makeGear(GEAR_SMALL_R, 10, 0.10);
  const smallGear = new THREE.Mesh(smallGearGeo, metalMat);
  smallGear.name = 'map3-physics-gear-small';
  smallGear.position.set(GEAR_SMALL.x, GEAR_SMALL.y, GEAR_SMALL.z);
  group.add(smallGear);
  disposables.push(smallGearGeo);

  // Axle from the wheel to the big gear, so the drive is visibly connected. It
  // starts INSIDE the wheel's own axle rather than butting against its end cap:
  // two cylinder caps meeting at the same x would be coplanar.
  const AXLE_FROM = WHEEL_POS.x + BLADE_HALF_WIDE;
  const axleGeo = new THREE.CylinderGeometry(0.05, 0.05, GEAR_X - AXLE_FROM, 10);
  axleGeo.rotateZ(Math.PI / 2);
  axleGeo.translate((AXLE_FROM + GEAR_X) / 2, WHEEL_POS.y, MACH_Z);
  const axleMesh = new THREE.Mesh(axleGeo, metalMat);
  axleMesh.name = 'map3-physics-axle';
  group.add(axleMesh);
  disposables.push(axleGeo);

  // Con-rod: a unit-length box along +Z, scaled and aimed each frame.
  const rodGeo = box(0.055, 0.055, 1, 0, 0, 0);
  const rodMesh = new THREE.Mesh(rodGeo, metalMat);
  rodMesh.name = 'map3-physics-crank-rod';
  group.add(rodMesh);
  disposables.push(rodGeo);

  const pistonGeo = new THREE.CylinderGeometry(0.10, 0.10, 0.30, 14);
  pistonGeo.rotateX(Math.PI / 2);
  const pistonMesh = new THREE.Mesh(pistonGeo, metalMat);
  pistonMesh.name = 'map3-physics-piston';
  group.add(pistonMesh);
  disposables.push(pistonGeo);

  const needleGeo = box(0.026, 0.30, 0.026, 0, 0.13, 0);
  const needleMesh = new THREE.Mesh(needleGeo, metalMat);
  needleMesh.name = 'map3-physics-tacho-needle';
  needleMesh.position.set(DIAL.x, DIAL.y, DIAL.z + 0.13);
  group.add(needleMesh);
  disposables.push(needleGeo);

  /* ================================================================== */
  /* Motion trails                                                       */
  /* ================================================================== */

  /**
   * One mesh for all eight trails.
   *
   * A ring buffer per ball, resampled on a clock rather than per frame, so the
   * trail is a fixed span of TIME rather than of frames — sampled per frame it
   * grows and shrinks with the frame rate, which reads as the physics changing
   * speed.
   *
   * The ribbon is widened on the CPU using the camera position that setPlayer()
   * already hands over: side = normalize(cross(tangent, eye - point)). That is
   * a real camera-facing ribbon for 384 vertices a frame, and it avoids both a
   * billboarding vertex graph and the one-pixel line the WebGPU backend gives
   * you for LineSegments regardless of linewidth.
   */
  const TRAIL_VERTS = BALL_COUNT * TRAIL_SAMPLES * 2;
  const trailPos = new Float32Array(TRAIL_VERTS * 3);
  const trailFade = new Float32Array(TRAIL_VERTS);
  const trailTint = new Float32Array(TRAIL_VERTS * 3);
  const trailIndex: number[] = [];
  BALLS.forEach((b, bi) => {
    tmpColor.set(b.colA);
    for (let k = 0; k < TRAIL_SAMPLES; k++) {
      const v0 = (bi * TRAIL_SAMPLES + k) * 2;
      const fade = k / (TRAIL_SAMPLES - 1);      // 0 at the tail, 1 at the ball
      trailFade[v0] = fade;
      trailFade[v0 + 1] = fade;
      for (const v of [v0, v0 + 1]) {
        trailTint[v * 3] = tmpColor.r;
        trailTint[v * 3 + 1] = tmpColor.g;
        trailTint[v * 3 + 2] = tmpColor.b;
      }
      if (k < TRAIL_SAMPLES - 1) {
        trailIndex.push(v0, v0 + 2, v0 + 3, v0, v0 + 3, v0 + 1);
      }
    }
  });
  const trailGeo = new THREE.BufferGeometry();
  const trailPosAttr = new THREE.BufferAttribute(trailPos, 3);
  trailPosAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailPosAttr);
  trailGeo.setAttribute('aFade', new THREE.BufferAttribute(trailFade, 1));
  trailGeo.setAttribute('aTint', new THREE.BufferAttribute(trailTint, 3));
  trailGeo.setIndex(trailIndex);
  const trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.name = 'map3-physics-motion-trail';
  trailMesh.frustumCulled = false;
  trailMesh.renderOrder = 6;
  group.add(trailMesh);
  disposables.push(trailGeo);

  /** ring[b] holds TRAIL_SAMPLES xyz triples; ringHead[b] is the OLDEST slot. */
  const ring = BALLS.map(() => new Float32Array(TRAIL_SAMPLES * 3));
  const ringHead = new Int32Array(BALL_COUNT);
  let trailClock = 0;
  let trailPrimed = false;

  /* ================================================================== */
  /* Player interaction                                                  */
  /* ================================================================== */

  const playerWorld = new THREE.Vector3();
  const playerVelWorld = new THREE.Vector3();
  const playerLocal = new THREE.Vector3(0, 1.7, 6);
  const playerVelLocal = new THREE.Vector3();
  const invWorld = new THREE.Matrix4();
  const invQuat = new THREE.Quaternion();
  const probePrev = new THREE.Vector3();
  let playerFed = false;
  let probeSeen = false;

  const impulse: V3 = { x: 0, y: 0, z: 0 };
  const point: V3 = { x: 0, y: 0, z: 0 };

  /** Seconds until each piece may be kicked again. Parallel to `pieces`. */
  const kickCooldown = new Float32Array(pieces.length);

  /**
   * Kick whatever the walker walks into.
   *
   * Gated on the CLOSING component of the camera velocity, not on its speed, so
   * standing beside a stack does nothing and backing away does nothing — only
   * walking INTO something moves it.
   *
   * The impulse carries mass^0.62, which means the velocity change carries
   * mass^-0.38: a 2.4 kg ball leaves at about 2.4x the speed of a 23 kg one off
   * the same kick. Scaling by mass outright would make every body leave at the
   * same speed and make the densities pointless; not scaling at all would leave
   * the heavy ones welded to the floor.
   */
  function applyPlayerKick(dt: number): void {
    const px = playerLocal.x;
    const py = playerLocal.y;
    const pz = playerLocal.z;
    for (let i = 0; i < pieces.length; i++) {
      if (kickCooldown[i] > 0) { kickCooldown[i] = Math.max(0, kickCooldown[i] - dt); continue; }
      const piece = pieces[i];
      const t = piece.body.translation();
      const dx = t.x - px;
      const dz = t.z - pz;
      const dxz = Math.hypot(dx, dz);
      const range = KICK_REACH + piece.reach;
      if (dxz > range * KICK_TRIGGER) continue;
      const dy = t.y - py;
      // A vertical band around the walker: ankles to just above the head.
      if (dy < -2.1 || dy > 0.9) continue;

      let nx: number;
      let nz: number;
      if (dxz < 1e-4) { nx = 0; nz = -1; } else { nx = dx / dxz; nz = dz / dxz; }
      const closing = Math.min(
        playerVelLocal.x * nx + playerVelLocal.z * nz, KICK_MAX_CLOSING,
      );
      if (closing <= 0.05) continue;

      // Mild, and plateaued well inside the trigger radius, so the strength
      // comes from speed and mass rather than from which frame caught it.
      const falloff = Math.min(1, (range - dxz) / (range * 0.45));
      const mass = Math.max(piece.mass, 0.05);
      const dv = Math.min(KICK_GAIN * closing * falloff * piece.kick, KICK_MAX_DV);
      const j = dv * Math.pow(mass, 0.62);

      impulse.x = nx * j;
      impulse.y = j * 0.20;                 // a little lift, so a kick lofts
      impulse.z = nz * j;
      // Applied on the near face and BELOW the centre of mass. That torque is
      // what topples a tower instead of sliding it along the floor.
      point.x = t.x - nx * piece.reach * 0.8;
      point.y = t.y - piece.reach * 0.45;
      point.z = t.z - nz * piece.reach * 0.8;
      piece.body.applyImpulseAtPoint(impulse, point, true);
      kickCooldown[i] = KICK_COOLDOWN;
    }
  }

  /* ================================================================== */
  /* Rebuild / reset                                                     */
  /* ================================================================== */

  let flashAt = -10;
  let lastElapsed = 0;
  let accumulator = 0;
  let wheelAngle = 0;
  let needleSmoothed = 0;

  /** Restore one piece to its build pose with zero velocity. */
  function restore(piece: Piece): void {
    piece.body.setTranslation(piece.restP, true);
    piece.body.setRotation(piece.restQ, true);
    piece.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    piece.body.wakeUp();
  }

  function rebuildWall(): void {
    for (let i = BRICK_FIRST; i < BRICK_LAST; i++) restore(pieces[i]);
    world.propagateModifiedBodyPositionsToColliders();
    flashAt = lastElapsed;
  }

  function resetAll(): void {
    pieces.forEach(restore);
    world.propagateModifiedBodyPositionsToColliders();
    wheelAngle = 0;
    needleSmoothed = 0;
    trailPrimed = false;
    flashAt = lastElapsed;
  }

  /**
   * The corridor owns its own keys.
   *
   * main.ts is a shared file this pass must not edit, so the B/F bindings live
   * here and are removed in dispose(). Neither key is taken by main.ts (it uses
   * WASD, Shift, Space, 0-6, O, P, H), and the listener is inert while you are
   * anywhere else in the map — resetting a corridor you cannot see is harmless.
   */
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'KeyB') rebuildWall();
    else if (e.code === 'KeyF') resetAll();
  };
  // `typeof window.addEventListener === 'function'` and not just `typeof
  // window !== 'undefined'`: the collider/visual parity audit builds every
  // arena under a minimal window stub that has no listener API, and the old
  // guard threw there the moment this corridor joined the arena.
  const keysBound = bindKeys
    && typeof window !== 'undefined'
    && typeof window.addEventListener === 'function';
  if (keysBound) window.addEventListener('keydown', onKeyDown);

  /* ================================================================== */
  /* Frame                                                               */
  /* ================================================================== */

  const rodDir = new THREE.Vector3();
  const rodUp = new THREE.Vector3(0, 0, 1);
  const eye = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const toEye = new THREE.Vector3();
  const sideVec = new THREE.Vector3();
  const samplePos = new THREE.Vector3();

  /** Refresh playerLocal/playerVelLocal from whichever source is feeding us. */
  function syncPlayer(dt: number): void {
    group.updateWorldMatrix(true, false);
    if (!playerFed) {
      // Fallback so the corridor is alive the moment it is added, before the
      // integrator wires setPlayer(). main.ts publishes the camera on __MAP3.
      const probe = (globalThis as unknown as {
        __MAP3?: { camera?: THREE.Camera };
      }).__MAP3;
      const cam = probe?.camera;
      if (cam) {
        cam.getWorldPosition(playerWorld);
        if (probeSeen && dt > 1e-5) {
          playerVelWorld.copy(playerWorld).sub(probePrev).multiplyScalar(1 / dt);
        } else {
          playerVelWorld.set(0, 0, 0);
        }
        probePrev.copy(playerWorld);
        probeSeen = true;
      } else {
        // Nobody is feeding us and there is no probe: no player, no kicking.
        playerVelWorld.set(0, 0, 0);
      }
    }
    invWorld.copy(group.matrixWorld).invert();
    playerLocal.copy(playerWorld).applyMatrix4(invWorld);
    // Velocity is a direction, so only the rotation applies — running it through
    // the full inverse matrix would add the corridor's offset to every m/s.
    group.getWorldQuaternion(invQuat);
    invQuat.invert();
    playerVelLocal.copy(playerVelWorld).applyQuaternion(invQuat);
  }

  /** Rebuild every trail ribbon from its ring buffer. */
  function updateTrails(dt: number): void {
    trailClock += dt;
    const advance = trailClock >= TRAIL_INTERVAL;
    if (advance) trailClock = 0;

    eye.copy(playerLocal);
    for (let b = 0; b < BALL_COUNT; b++) {
      const t = pieces[BALL_FIRST + b].body.translation();
      const buf = ring[b];
      if (!trailPrimed) {
        for (let k = 0; k < TRAIL_SAMPLES; k++) {
          buf[k * 3] = t.x; buf[k * 3 + 1] = t.y; buf[k * 3 + 2] = t.z;
        }
        ringHead[b] = 0;
      } else if (advance) {
        const h = ringHead[b];
        buf[h * 3] = t.x; buf[h * 3 + 1] = t.y; buf[h * 3 + 2] = t.z;
        ringHead[b] = (h + 1) % TRAIL_SAMPLES;
      }

      const half = BALLS[b].r * 0.62;
      const base = b * TRAIL_SAMPLES * 2;
      for (let k = 0; k < TRAIL_SAMPLES; k++) {
        // Oldest first, so vertex slot k always has the same age and the fade
        // attribute can stay static.
        const s = (ringHead[b] + k) % TRAIL_SAMPLES;
        if (k === TRAIL_SAMPLES - 1) samplePos.set(t.x, t.y, t.z);
        else samplePos.set(buf[s * 3], buf[s * 3 + 1], buf[s * 3 + 2]);

        const prev = (ringHead[b] + Math.max(0, k - 1)) % TRAIL_SAMPLES;
        const next = (ringHead[b] + Math.min(TRAIL_SAMPLES - 1, k + 1)) % TRAIL_SAMPLES;
        tangent.set(
          buf[next * 3] - buf[prev * 3],
          buf[next * 3 + 1] - buf[prev * 3 + 1],
          buf[next * 3 + 2] - buf[prev * 3 + 2],
        );
        toEye.copy(samplePos).sub(eye);
        sideVec.crossVectors(tangent, toEye);
        const len = sideVec.length();
        // A resting ball has no tangent, so the ribbon collapses to zero width
        // and vanishes on its own — no special case, no popping.
        if (len > 1e-5) sideVec.multiplyScalar((half * (k / (TRAIL_SAMPLES - 1))) / len);
        else sideVec.set(0, 0, 0);

        const v0 = (base + k * 2) * 3;
        trailPos[v0] = samplePos.x + sideVec.x;
        trailPos[v0 + 1] = samplePos.y + sideVec.y;
        trailPos[v0 + 2] = samplePos.z + sideVec.z;
        trailPos[v0 + 3] = samplePos.x - sideVec.x;
        trailPos[v0 + 4] = samplePos.y - sideVec.y;
        trailPos[v0 + 5] = samplePos.z - sideVec.z;
      }
    }
    trailPrimed = true;
    trailPosAttr.needsUpdate = true;
  }

  /** Drive the gear train, slider-crank and tachometer off the wheel's motion. */
  function updateMachine(dt: number): void {
    const w = wheelBody.angvel();
    // Integrating the measured angular velocity, rather than unwrapping the
    // body's quaternion, keeps a continuous angle across full revolutions —
    // which is what a gear ratio needs to multiply.
    wheelAngle += w.x * dt;

    const t = wheelBody.translation();
    const r = wheelBody.rotation();
    wheelMesh.position.set(t.x, t.y, t.z);
    wheelMesh.quaternion.set(r.x, r.y, r.z, r.w);

    const pt = plankBody.translation();
    const pr = plankBody.rotation();
    plankMesh.position.set(pt.x, pt.y, pt.z);
    plankMesh.quaternion.set(pr.x, pr.y, pr.z, pr.w);

    bigGear.rotation.x = wheelAngle;
    const smallAngle = wheelAngle * GEAR_RATIO;
    smallGear.rotation.x = smallAngle;

    // Slider-crank: the pin rides the small gear, the piston slides along +Z.
    const pinY = GEAR_SMALL.y + Math.sin(smallAngle) * CRANK_R;
    const pinZ = GEAR_SMALL.z + Math.cos(smallAngle) * CRANK_R;
    const offset = pinY - GEAR_SMALL.y;
    const reach = Math.sqrt(Math.max(0, ROD_LEN * ROD_LEN - offset * offset));
    const pistonZ = pinZ + reach;

    pistonMesh.position.set(GEAR_SMALL.x, GEAR_SMALL.y, pistonZ);
    rodDir.set(0, GEAR_SMALL.y - pinY, pistonZ - pinZ);
    const rodLen = Math.max(rodDir.length(), 1e-4);
    rodMesh.position.set(GEAR_SMALL.x, (pinY + GEAR_SMALL.y) / 2, (pinZ + pistonZ) / 2);
    rodMesh.scale.set(1, 1, rodLen);
    rodDir.multiplyScalar(1 / rodLen);
    rodMesh.quaternion.setFromUnitVectors(rodUp, rodDir);

    // Tachometer: needle tracks wheel speed with a lag, so it settles instead
    // of buzzing on every contact impulse.
    const speed = Math.min(Math.abs(w.x), 14) / 14;
    needleSmoothed += (speed - needleSmoothed) * Math.min(1, dt * 5);
    needleMesh.rotation.z = -2.4 + needleSmoothed * 4.8;
  }

  // Seed the render side once so the first frame is not a pile at the origin.
  writeInstances(jengaMesh, JENGA_FIRST, JENGA_COUNT);
  writeInstances(brickMesh, BRICK_FIRST, BRICK_COUNT);
  writeInstances(ballMesh, BALL_FIRST, BALL_COUNT);
  jengaMesh.computeBoundingSphere();
  brickMesh.computeBoundingSphere();
  ballMesh.computeBoundingSphere();
  updateMachine(0);
  updateTrails(0);

  return {
    group,
    length: LEN,
    title: 'Rapier playground — B rebuilds the wall, F resets everything',
    skill: 'threejs-game-development',
    solids,

    update(elapsed: number, dt: number): void {
      lastElapsed = elapsed;
      const step = Math.min(Math.max(dt, 0), 0.05);

      syncPlayer(step);
      applyPlayerKick(step);

      // Fixed timestep. See note 2 in the file header — the tower depends on it.
      accumulator = Math.min(accumulator + step, FIXED_DT * MAX_STEPS_PER_FRAME);
      while (accumulator >= FIXED_DT) {
        world.step();
        accumulator -= FIXED_DT;
      }

      writeInstances(jengaMesh, JENGA_FIRST, JENGA_COUNT);
      writeInstances(brickMesh, BRICK_FIRST, BRICK_COUNT);
      writeInstances(ballMesh, BALL_FIRST, BALL_COUNT);
      updateMachine(step);
      updateTrails(step);

      const since = elapsed - flashAt;
      (wallFlash as unknown as { value: number }).value =
        since < 0.8 ? Math.max(0, 1 - since / 0.8) * 0.9 : 0;

      playerFed = false;
    },

    setPlayer(pos: THREE.Vector3, vel: THREE.Vector3): void {
      playerWorld.copy(pos);
      playerVelWorld.copy(vel);
      playerFed = true;
    },

    rebuildWall,
    resetAll,

    dispose(): void {
      if (keysBound) window.removeEventListener('keydown', onKeyDown);
      disposables.forEach((d) => d.dispose());
      group.clear();
      // Frees every body, collider and joint in one call — Rapier owns them.
      world.free();
    },
  };
}
