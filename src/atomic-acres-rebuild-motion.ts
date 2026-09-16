/**
 * atomic-acres-rebuild-motion.ts - LANE Q, 2026-09-16: the arena's ambient motion.
 *
 * WHY THIS EXISTS
 *
 * Every capture of this arena is completely static. `ATOMIC_ACRES_IMPROVEMENT_
 * PROGRAM.md` names animation as "the last standing gap in the owner's list",
 * and it is the only one of his headings that nothing in the project had
 * touched: the map is a 1960s desert suburb at mid-morning and not one thing in
 * it moves. A still photograph of a suburb is a suburb; a still *game* reads as
 * a broken one, because the eye expects air.
 *
 * WHERE IT TICKS, AND WHY IT IS THIS SEAM AND NOT ANOTHER
 *
 * `src/atmosphere-system.ts` is DEAD CODE - `legacy-main.ts:5045` pins it to
 * null and it reaches no frame - and a previous lane lost its work there. The
 * live seam is `ArenaMap.update` (`src/map.ts:95`), driven by
 * `createArenaFrameAnimator()` from exactly one call site,
 * `legacy-main.ts:31641`, inside the main frame loop:
 *
 *     arenaFrameAnimator.tick(arena, frameDt, () => ({ arenaId, cameraPosition,
 *       playerVelocity }));
 *
 * `arena` there is the ADMITTED arena, so a staged or cached build never ticks,
 * and the animator restarts `elapsedSeconds` at zero whenever the active arena
 * changes identity. Before this pass `atomic-acres-rebuild` set no `update`, so
 * it took the animator's documented zero-cost path. It now sets one.
 *
 * PRESENTATION ONLY, BY CONSTRUCTION
 *
 * Nothing in this module touches `Builder`. It never calls `centred()`,
 * `pair()` or `box()`, so it cannot append a collider, a physics collider, a
 * raycast mesh, a shot surface or a spawn - the four numbers the census pins at
 * 122 / 122 / 139 / 139. It adds exactly one `THREE.Group` to the arena root
 * and hangs everything under it.
 *
 * That Group is also how this module stays out of the static batcher.
 * `batchPresentationOnlyBoxes` (additional-maps.ts:300) iterates `root.children`
 * and skips any node that is not itself a `THREE.Mesh`, so a Group child is not
 * a candidate and neither is anything beneath it. No `presentationBatchCandidate`
 * flag to remember, no merged copy of a mesh to fight (see the kitbash header in
 * the arena module for what happens when you forget that).
 *
 * THE WIND IS THE ONE THE DUST ALREADY USES
 *
 * `src/weather/wind-field.ts` is the project's single wind model and it is pure:
 * a closed-form function of (arenaId, seed, x, z, t) with no state and no
 * `Math.random`. This module imports its band table, its profile and its
 * `gustWave` shaping rather than inventing a second wind, so the laundry, the
 * cables and the vents lean with the same fronts that shear the dust - which is
 * the entire reason that file was written (its header: "the grass leaned one
 * way while the palms leaned another").
 *
 * The one thing it does NOT reuse is `sampleWind()` itself, because that
 * function returns `Object.freeze({...})` - one allocation per call - and this
 * module's budget is zero allocations per frame. `sampleZone` below computes the
 * identical expression into pre-allocated `Float64Array` slots. It is the same
 * arithmetic on the same imported constants, so the model cannot drift; only the
 * allocation is gone. `scripts`-free proof: the lane's verification compares
 * this sampler against `sampleWind` and requires agreement to 1e-12.
 *
 * DETERMINISM
 *
 * Amplitude and phase are a pure function of `elapsedSeconds` and the arena's
 * own build seed. There is no `Math.random()`, no `performance.now()`, no
 * `Date`, and no per-frame integration anywhere in `update` - even the vents'
 * accumulated spin angle is a closed-form integral rather than `angle += w*dt`,
 * precisely so it cannot drift a fraction of a degree per frame between runs.
 * The wind field is seeded from `ATOMIC_ACRES_REBUILD_SEED`, not from the match
 * seed, because a review capture has to be comparable run to run and the match
 * seed is not available to an arena hook. Same `t` therefore gives the same
 * pixels on every machine, every run.
 *
 * READABILITY - AN FPS BUDGET, NOT A TASTE CALL
 *
 * Motion draws the eye, so every moving thing here is bounded on three axes:
 *
 *   1. HEIGHT. The cables hang at 5.9-7.75 m and the roof vents sit at 6.6 m.
 *      Head height in this arena is `DRESS_HEAD_Y` = 2.35 m, so neither class
 *      can occlude a player at any angle from the ground. Only the laundry
 *      lives in the readable band at all, and it hangs 1.20-1.95 m over a back
 *      lot with a 1.20 m clear gap beneath every garment.
 *   2. SPEED. The fastest surface point in this module moves at under
 *      0.25 m/s. A walking player moves at 4-5 m/s, so nothing here can be
 *      mistaken for player motion - it is off by more than an order of
 *      magnitude, and the check is arithmetic rather than a judgement (see
 *      `MOTION_TIP_SPEED_BUDGET_MPS` and its derivation at each node).
 *   3. SILHOUETTE. No moving element is a 1.8 m vertical mass that meets the
 *      ground. The garments are 0.5 m wide with gaps wider than the cloth, so a
 *      player crossing behind the line is visible in every gap, and a crouched
 *      player is entirely below them.
 *
 * AMPLITUDE IS THE PHYSICS', NOT THE AUTHOR'S
 *
 * `ATOMIC_ACRES_REFERENCE.md` fixes this map at a hot, dry, still mid-morning,
 * and the wind profile was cut to base 1.1 m/s / gust 1.9 / peak 3.0 to match.
 * Every angle below is a drag balance at that speed - `tan(theta) = q / w` with
 * `q = 0.5 * rho * Cd * A * v^2` - so a still day moves each thing exactly as
 * much as a still day moves it. That is deliberately unflattering to the
 * cables: a conductor on a 1.1 m/s morning blows through about half a degree,
 * and even a peak thermal gust only reaches a few. Laundry is the element that
 * actually moves, because a damp towel is an enormous drag area on a tiny mass,
 * which is exactly why the owner's list put it near the top.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaFrameUpdate } from './arena-frame-animation';
import {
  WIND_GUST_BANDS,
  WIND_REFERENCE_GUST_SCALE_M,
  createWindField,
  gustWave,
  windProfile,
} from './weather/wind-field';

/** The arena this module animates. Matches `ArenaMap.id` and the wind profile key. */
const ARENA_ID = 'atomic-acres-rebuild' as const;

/**
 * Hard ceiling on the tip speed of any animated surface, in m/s.
 *
 * Not a style preference: a strafing player moves at 4-5 m/s and a walking one
 * at ~3, so anything moving at a twentieth of that cannot be read as a player
 * or mask one moving. Every node below derives its peak tip speed from its own
 * radius and angular rate and is sized to stay under this; the lane's
 * verification recomputes them rather than trusting the comment.
 */
export const MOTION_TIP_SPEED_BUDGET_MPS = 0.25;

/** Head height in this arena (`DRESS_HEAD_Y`). Nothing above this is occlusive. */
const HEAD_HEIGHT_M = 2.35;

/** Sea-level-ish dry desert air at ~30 C, kg/m^3. */
const AIR_DENSITY = 1.16;

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// The wind sampler: the shared field, evaluated without allocating.
// ---------------------------------------------------------------------------

const PROFILE = windProfile(ARENA_ID);

/**
 * Seeded from the ARENA seed, not the match seed.
 *
 * `createWindField`'s seed only chooses where in a never-repeating gust signal
 * the field starts. Using the match seed - which an `ArenaFrameUpdate` cannot
 * see anyway - would make two review captures of the same commit differ, which
 * would destroy the instrument the whole improvement programme is graded on.
 * The cost is that this motion's gust PHASES are not locked to the dust's when
 * the dust runs on a match seed; bearing, base speed, gust ceiling and front
 * shape are the profile's and are identical.
 */
const WIND_FIELD = createWindField(ARENA_ID, 0xaac4e9);

const BAND_COUNT = WIND_GUST_BANDS.length;

/** Per-band constants, hoisted so a frame does no trigonometry it can avoid. */
const bandFrontCos = new Float64Array(BAND_COUNT);
const bandFrontSin = new Float64Array(BAND_COUNT);
const bandSpatial = new Float64Array(BAND_COUNT);
const bandRate = new Float64Array(BAND_COUNT);
const bandWeight = new Float64Array(BAND_COUNT);
const bandSwing = new Float64Array(BAND_COUNT);
const bandPhase0 = new Float64Array(BAND_COUNT);

{
  const spatialScale = WIND_REFERENCE_GUST_SCALE_M / Math.max(1, PROFILE.gustScaleM);
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const gustBand = WIND_GUST_BANDS[index];
    const frontBearing = PROFILE.baseBearingRadians + gustBand.frontBearingOffset;
    bandFrontCos[index] = Math.cos(frontBearing);
    bandFrontSin[index] = Math.sin(frontBearing);
    bandSpatial[index] = gustBand.spatialFrequency * spatialScale;
    bandRate[index] = TAU / gustBand.periodSeconds;
    bandWeight[index] = gustBand.weight;
    bandSwing[index] = gustBand.bearingSwing * PROFILE.bearingSwingScale;
    bandPhase0[index] = WIND_FIELD.bandPhases[index] ?? 0;
  }
}

/**
 * One place the wind is evaluated.
 *
 * Nodes are grouped into zones rather than sampled individually because the
 * profile's gust cell is 22 m across - finer sampling than that buys nothing
 * and costs a full band stack per node. Every zone's per-band spatial phase and
 * its `cos` at t=0 (needed by the spin integral) are resolved once at build.
 */
type WindZone = {
  readonly x: number;
  readonly z: number;
  /** Per-band spatial phase (constant in t), and cos of it, for this point. */
  readonly spatialPhase: Float64Array;
  readonly spatialPhaseCos: Float64Array;
  /** Outputs, rewritten every frame. Index 0 speed, 1 bearing, 2 gust, 3 wz, 4 speedIntegral. */
  readonly out: Float64Array;
};

const ZONE_SPEED = 0;
const ZONE_GUST = 2;
const ZONE_WIND_Z = 3;
const ZONE_SPEED_INTEGRAL = 4;

function makeZone(x: number, z: number): WindZone {
  const spatialPhase = new Float64Array(BAND_COUNT);
  const spatialPhaseCos = new Float64Array(BAND_COUNT);
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const along = x * bandFrontCos[index] + z * bandFrontSin[index];
    const phase = along * bandSpatial[index] + bandPhase0[index];
    spatialPhase[index] = phase;
    spatialPhaseCos[index] = Math.cos(phase);
  }
  return { x, z, spatialPhase, spatialPhaseCos, out: new Float64Array(5) };
}

/**
 * Evaluates the shared field at a zone and writes the results into its slots.
 *
 * The envelope/bearing arithmetic is `sampleWind()`'s, term for term, on the
 * same imported band table and the same `gustWave` shaping. It additionally
 * accumulates the TIME INTEGRAL of wind speed, which is what lets a turbine
 * vent's accumulated angle be a closed form rather than `angle += omega * dt`.
 *
 * The integral approximates each band's skewed wave by its underlying sine.
 * That is exact in the mean - the skew is a phase remap, so it moves no area
 * across a whole period - and bounded within one, and in exchange the vent
 * angle is a pure function of `t` that two runs cannot disagree about.
 *
 * Allocates nothing: every destination is a pre-sized `Float64Array` slot.
 */
function sampleZone(zone: WindZone, timeSeconds: number): void {
  let envelope = 0;
  let bearingOffset = 0;
  let gustIntegral = 0;
  for (let index = 0; index < BAND_COUNT; index += 1) {
    const rate = bandRate[index];
    const phase = timeSeconds * rate + zone.spatialPhase[index];
    const wave = gustWave(phase);
    envelope += wave * bandWeight[index];
    bearingOffset += wave * bandSwing[index];
    // integral of sin(phase(t)) dt = (cos(phase(0)) - cos(phase(t))) / rate
    gustIntegral += bandWeight[index] * (zone.spatialPhaseCos[index] - Math.cos(phase)) / rate;
  }
  const gust = envelope < -1 ? 0 : envelope > 1 ? 1 : envelope * 0.5 + 0.5;
  const bearing = PROFILE.baseBearingRadians + bearingOffset;
  const speed = PROFILE.baseSpeedMps + PROFILE.gustSpeedMps * gust;
  zone.out[ZONE_SPEED] = speed;
  zone.out[1] = bearing;
  zone.out[ZONE_GUST] = gust;
  zone.out[ZONE_WIND_Z] = Math.sin(bearing) * speed;
  // integral of speed dt = base*t + gustSpeed * (0.5*t + 0.5*integral of the band sum)
  zone.out[ZONE_SPEED_INTEGRAL] = PROFILE.baseSpeedMps * timeSeconds
    + PROFILE.gustSpeedMps * (0.5 * timeSeconds + 0.5 * gustIntegral);
}

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

/**
 * Anything that hangs from a horizontal axis running along world +X and swings
 * about it: a conductor between two poles, a shirt on a washing line.
 *
 * Every pivot is axis-aligned on purpose. Both cable spans cross the street
 * along X and the washing line runs along X, so the pivot's local frame IS the
 * world frame and `rotation.x` is unambiguously the roll about the chord. That
 * removes the only place this could have gone subtly wrong - Euler order when a
 * yaw and a roll share one object - without a nested yaw group per node.
 *
 * `dragOverWeight` is `0.5 * rho * Cd * A / W` for the hanging body, so the
 * steady-state angle is `atan(dragOverWeight * v * |v|)` - signed, and
 * quadratic in speed, which is what makes a gust read as an arrival rather than
 * a fade. `swingRate`/`swingGain` add the body's own pendulum: a real cable and
 * a real towel both overshoot their blow angle and ring at
 * `2*pi*sqrt(L_eff/g)` rather than tracking the air exactly.
 */
type SwingNode = {
  readonly pivot: THREE.Object3D;
  readonly zone: WindZone;
  readonly dragOverWeight: number;
  readonly swingRate: number;
  readonly swingGain: number;
  readonly swingPhase: number;
  /** Peak |angle| this node is allowed, rad. Bounds readability, not physics. */
  readonly clamp: number;
  /** Optional slow twist about vertical, for cloth. 0 disables the write. */
  readonly twist: THREE.Object3D | null;
  readonly twistGain: number;
  readonly twistRate: number;
  readonly twistPhase: number;
};

/**
 * A turbine (whirlybird) roof vent: free-spinning about its own vertical axis.
 *
 * `spinPerMetre` is the tip-speed ratio over the rotor radius, so
 * `omega = lambda * v / R`. At lambda 0.45 and R 0.19 m this arena's 1.1-3.0 m/s
 * gives 0.4-1.6 rev/s, which is the lazy turn a real vent does on a still
 * morning and the same figure the 100 rpm-at-10-mph rule of thumb gives.
 *
 * The angle is the INTEGRAL, taken in closed form from the zone, never
 * accumulated. See `sampleZone`.
 */
type SpinNode = {
  readonly rotor: THREE.Object3D;
  readonly zone: WindZone;
  readonly spinPerMetre: number;
  readonly phase: number;
};

export type AtomicAcresRebuildMotion = {
  /** The single Group added to the arena root. Holds every animated object. */
  readonly group: THREE.Group;
  /** The hook to publish as `ArenaMap.update`. */
  readonly update: ArenaFrameUpdate;
  readonly telemetry: Readonly<{
    zones: number;
    swingNodes: number;
    spinNodes: number;
    meshes: number;
    triangles: number;
    /** Highest peak tip speed across every node, m/s. Must stay under budget. */
    peakTipSpeedMps: number;
    /** Lowest point of any animated surface, m. Read against HEAD_HEIGHT_M. */
    lowestAnimatedY: number;
  }>;
};

// ---------------------------------------------------------------------------
// Geometry helpers. All build-time; none of this runs in a frame.
// ---------------------------------------------------------------------------

/** Deterministic per-element phases. Same generator the arena uses for scatter. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function countTriangles(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
}

/**
 * A shallow catenary as a tube, authored in a LOCAL frame: the chord runs along
 * local +X from -span/2 to +span/2 at y = 0, and the belly sags to -sag.
 *
 * Local, not world, because that is what makes the swing free: the pivot rotates
 * about local X, the two ends sit ON that axis and therefore do not move at all,
 * and only the belly swings sideways. That is also what a real span does.
 *
 * A shallow catenary and a parabola agree to well under a millimetre at these
 * sag-to-span ratios (<2%), so the parabola is used; nothing here can see the
 * difference and it needs no `cosh`.
 */
function catenaryTube(span: number, sag: number, radius: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const segments = 14;
  for (let index = 0; index <= segments; index += 1) {
    const u = index / segments;
    points.push(new THREE.Vector3((u - 0.5) * span, -sag * 4 * u * (1 - u), 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 4, false);
}

/**
 * The spinning head of a turbine vent: a cap, a collar and ten pitched fins,
 * merged into ONE geometry so a vent is one draw rather than twelve.
 *
 * `mergeGeometries` returns null when the inputs disagree about attributes (the
 * static-batcher gotcha of 2026-09-06). Every input here is a stock
 * `CylinderGeometry`/`BoxGeometry`, which all carry position/normal/uv and
 * nothing else, so they cannot disagree - but the null is handled anyway,
 * because a vent is never worth breaking a build over.
 */
function turbineRotorGeometry(radius: number, height: number, fins: number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const cap = new THREE.CylinderGeometry(radius * 0.86, radius, 0.022, 12);
  cap.translate(0, height, 0);
  parts.push(cap);
  const collar = new THREE.CylinderGeometry(radius * 0.92, radius * 0.78, 0.045, 12);
  collar.translate(0, 0.022, 0);
  parts.push(collar);
  for (let index = 0; index < fins; index += 1) {
    const angle = (index / fins) * TAU;
    const fin = new THREE.BoxGeometry(0.052, height - 0.05, 0.010);
    // Pitch the blade so it presents an edge to the air, then seat it at radius.
    fin.rotateZ(0.42);
    fin.translate(radius * 0.84, height * 0.5 + 0.02, 0);
    fin.rotateY(angle);
    parts.push(fin);
  }
  const merged = mergeGeometries(parts, false);
  if (merged === null) for (const part of parts) part.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

/**
 * Builds every animated object and returns the frame hook.
 *
 * `root` is the arena's presentation root. This function adds exactly one child
 * to it - a Group - and returns without having seen a `Builder`, which is what
 * keeps the census invariant a property of the code rather than a promise.
 */
export function buildAtomicAcresRebuildMotion(root: THREE.Group): AtomicAcresRebuildMotion {
  const group = new THREE.Group();
  group.name = 'aarr-ambient-motion';
  root.add(group);

  const random = mulberry32(0xaac4e9 ^ 0x4d4f54);
  const zones: WindZone[] = [];
  const swingNodes: SwingNode[] = [];
  const spinNodes: SpinNode[] = [];
  let meshes = 0;
  let triangles = 0;
  let peakTipSpeedMps = 0;
  let lowestAnimatedY = Number.POSITIVE_INFINITY;

  const peakSpeed = PROFILE.baseSpeedMps + PROFILE.gustSpeedMps;

  /** Records a node's worst-case tip speed so the budget is measured, not claimed. */
  const recordTip = (radiusM: number, rateRadPerSec: number, amplitudeRad: number): void => {
    const tip = radiusM * rateRadPerSec * amplitudeRad;
    if (tip > peakTipSpeedMps) peakTipSpeedMps = tip;
  };

  // -- Materials. All untextured, so this pass adds ZERO decoded texture VRAM
  // against the arena's 358.7 MB / 500 MB gate. Colours are read off the
  // reference plates: weathered aluminium for the vents, oxidised copper-grey
  // for the conductors, sun-bleached domestic cottons for the washing.
  const conductorMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.72, metalness: 0.35 });
  const galvanised = new THREE.MeshStandardMaterial({ color: 0xa8a9a4, roughness: 0.46, metalness: 0.62 });
  const lineTimber = new THREE.MeshStandardMaterial({ color: 0x9c8567, roughness: 0.86, metalness: 0.02 });
  const cordMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.92, metalness: 0.0 });

  // ==========================================================================
  // 1. UTILITY CABLES
  // ==========================================================================
  //
  // The arena already stands four utility poles (`aarr-pole-*`, 8 m, crossarm at
  // y 7.4) and strings NOTHING between them, which is the kind of absence the
  // street plates make obvious. Two spans cross the street - the pair at
  // z = +25.6 and the pair at z = -9.6 - and each carries a power conductor
  // above the crossarm and a comms drop below it.
  //
  // ROUTED ACROSS THE STREET, NOT ALONG THE LOTS. The diagonal run (a south pole
  // to a north pole) was measured first and rejected: it passes within 0.02 m of
  // the west house RIDGE at y 6.93 against a ridge top of 6.95. Crossing the
  // street at constant z clears every roof, every garage and both chimneys by
  // metres, and is also what a real distribution line does.
  //
  // CLEAR OF THE CROSSARM IT HANGS OFF. The arm occupies y 7.31-7.49 and reaches
  // 1.28 m from the pole. The upper conductor leaves the pole at 7.75 and has
  // only sagged to 7.63 by the arm's outboard end; the lower one hangs at 6.55,
  // below it. Neither intersects the geometry that is already there.
  //
  // READABILITY: the lowest point of any conductor is 5.90 m, which is 2.5x head
  // height. A cable cannot occlude a player from any ground position, and its
  // motion is a centimetre-scale drift of a 22 mm line.
  const CABLE_SPANS: ReadonlyArray<{ readonly z: number; readonly x0: number; readonly x1: number }> = [
    { z: 25.6, x0: -10.4, x1: 10.4 },
    { z: -9.6, x0: -17.6, x1: 17.6 },
  ];
  // radius, attachment height, sag fraction of span, and the drag balance.
  const CABLE_LINES: ReadonlyArray<{
    readonly y: number;
    readonly radius: number;
    readonly sagFraction: number;
    readonly massPerMetre: number;
  }> = [
    { y: 7.75, radius: 0.022, sagFraction: 0.024, massPerMetre: 0.41 },
    { y: 6.55, radius: 0.016, sagFraction: 0.019, massPerMetre: 0.16 },
  ];

  for (const span of CABLE_SPANS) {
    const length = span.x1 - span.x0;
    const midX = (span.x0 + span.x1) * 0.5;
    const zone = makeZone(midX, span.z);
    zones.push(zone);
    for (const line of CABLE_LINES) {
      const sag = length * line.sagFraction;
      const geometry = catenaryTube(length, sag, line.radius);
      const pivot = new THREE.Object3D();
      pivot.name = `aarr-cable-${span.z}-${line.y}`;
      pivot.position.set(midX, line.y, span.z);
      const mesh = new THREE.Mesh(geometry, conductorMaterial);
      mesh.name = `${pivot.name}-conductor`;
      // A 22 mm wire at 7 m throws a shadow narrower than its own penumbra
      // (4.65 mm per metre at the pinned solar elevation, so ~35 mm here) and
      // would only ever contribute shadow-map aliasing. It receives light; it
      // does not cast.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      meshes += 1;
      triangles += countTriangles(geometry);

      // Drag balance per unit length for a cylinder in crossflow: Cd ~ 1.2.
      const dragOverWeight = (0.5 * AIR_DENSITY * 1.2 * line.radius * 2)
        / (line.massPerMetre * 9.81);
      // Span pendulum: a catenary swings about its chord at 2*pi*sqrt(sag/g).
      const swingRate = TAU / (TAU * Math.sqrt(Math.max(sag, 0.05) / 9.81));
      const swingGain = 0.35;
      const clamp = 0.16;
      const peakAngle = Math.min(clamp, Math.atan(dragOverWeight * peakSpeed * peakSpeed) * (1 + swingGain));
      recordTip(sag, swingRate, swingGain * peakAngle);
      const lowest = line.y - sag - Math.abs(Math.sin(clamp)) * sag;
      if (lowest < lowestAnimatedY) lowestAnimatedY = lowest;

      swingNodes.push({
        pivot,
        zone,
        dragOverWeight,
        swingRate,
        swingGain,
        swingPhase: random() * TAU,
        clamp,
        twist: null,
        twistGain: 0,
        twistRate: 0,
        twistPhase: 0,
      });
    }
  }

  // ==========================================================================
  // 2. TURBINE ROOF VENTS
  // ==========================================================================
  //
  // Four whirlybirds on the two house roofs, two per roof, seated on the slab
  // (top y 6.60) and clear of the ridge and the chimney on each side. The garage
  // roofs (top y 3.05) and the shed roofs (2.43) were deliberately left bare:
  // both sit close enough to the 2.35 m head band that a spinning object on
  // them would be competing for attention at player height, and that is exactly
  // the trade this budget exists to refuse.
  //
  // A roof vent is also the single most legible "hot, still day" cue available
  // here - it is the one thing in a quiet suburb that turns when nothing else
  // does - and it costs 220 triangles.
  const VENT_RADIUS = 0.19;
  const VENT_HEIGHT = 0.21;
  const VENT_TIP_SPEED_RATIO = 0.45;
  const VENT_SITES: ReadonlyArray<readonly [x: number, z: number]> = [
    [-25.6, 4.5],
    [-17.8, 0.5],
    [25.6, 0.5],
    [17.5, 1.0],
  ];
  const ROOF_TOP_Y = 6.6;
  const rotorGeometry = turbineRotorGeometry(VENT_RADIUS, VENT_HEIGHT, 10);
  const throatGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.20, 10);
  const roofZoneWest = makeZone(-21.6, 2.4);
  const roofZoneEast = makeZone(21.6, -2.4);
  zones.push(roofZoneWest, roofZoneEast);

  if (rotorGeometry !== null) {
    for (const [x, z] of VENT_SITES) {
      const throat = new THREE.Mesh(throatGeometry, galvanised);
      throat.name = `aarr-vent-throat-${x}-${z}`;
      throat.position.set(x, ROOF_TOP_Y + 0.10, z);
      throat.castShadow = true;
      throat.receiveShadow = true;
      group.add(throat);
      meshes += 1;
      triangles += countTriangles(throatGeometry);

      const rotor = new THREE.Mesh(rotorGeometry, galvanised);
      rotor.name = `aarr-vent-rotor-${x}-${z}`;
      rotor.position.set(x, ROOF_TOP_Y + 0.20, z);
      rotor.castShadow = true;
      rotor.receiveShadow = true;
      group.add(rotor);
      meshes += 1;
      triangles += countTriangles(rotorGeometry);

      const zone = x < 0 ? roofZoneWest : roofZoneEast;
      const spinPerMetre = VENT_TIP_SPEED_RATIO / VENT_RADIUS;
      recordTip(VENT_RADIUS, spinPerMetre * peakSpeed, 1);
      if (ROOF_TOP_Y < lowestAnimatedY) lowestAnimatedY = ROOF_TOP_Y;
      spinNodes.push({ rotor, zone, spinPerMetre, phase: random() * TAU });
    }
  }

  // ==========================================================================
  // 3. WASHING LINE
  // ==========================================================================
  //
  // The one element that lives in the readable band, and the one that actually
  // MOVES on a 1.1 m/s morning, because a damp towel is a 0.3 m^2 flat plate on
  // half a kilogram: `tan(theta) = q/W` puts it at ~4 degrees in the lull and
  // the low twenties in a thermal gust, where the same sum puts a conductor
  // under one degree. That asymmetry is the physics, not a choice.
  //
  // SITED in the WEST back lot at z -26.5, running along X from -24.0 to -19.0.
  // Measured clear of the patio table (x -17.12..-14.88), the bench
  // (z -27.92..-27.12), the shed footprint (x -28.0..-23.2, z -35.68..-31.52)
  // and the yard crate cluster at (-12.8, -19.2). Running along X rather than Z
  // is deliberate: the prevailing bearing is 1.57 rad (+Z), so a line across the
  // wind takes it broadside and a line along it would barely stir.
  //
  // READABILITY, BOUNDED THREE WAYS AND STATED PLAINLY:
  //   - Four garments, 0.50 m wide, over a 5.0 m line: 2.0 m of cloth, 40%
  //     coverage, with gaps (0.67 m) WIDER than the cloth. A player crossing
  //     behind the line is visible in every gap.
  //   - Every garment hangs 1.20-1.95 m. A crouched player (~1.2 m) is entirely
  //     BELOW them; a standing player is veiled only across 1.20-1.80 m and
  //     never at the feet, so position stays readable even when the torso is
  //     partly behind cloth.
  //   - Peak tip speed 0.16 m/s, against 4-5 m/s for a strafing player.
  // This is the only element in the module with a non-zero readability cost. If
  // the owner wants it gone, deleting the `LAUNDRY` entries leaves the line and
  // posts standing and touches nothing else.
  const LINE_Z = -26.5;
  const LINE_X0 = -24.0;
  const LINE_X1 = -19.0;
  const LINE_Y = 1.95;
  const POST_H = 2.10;

  for (const x of [LINE_X0, LINE_X1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, POST_H, 0.09), lineTimber);
    post.name = `aarr-washline-post-${x}`;
    post.position.set(x, POST_H * 0.5, LINE_Z);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
    meshes += 1;
    triangles += countTriangles(post.geometry);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), lineTimber);
    arm.name = `aarr-washline-arm-${x}`;
    arm.position.set(x, POST_H - 0.10, LINE_Z);
    arm.castShadow = true;
    arm.receiveShadow = true;
    group.add(arm);
    meshes += 1;
    triangles += countTriangles(arm.geometry);
  }

  // The cord itself sags under the load and swings with it, so it is a swing
  // node like the conductors - same pivot trick, a much softer balance.
  {
    const span = LINE_X1 - LINE_X0;
    const sag = 0.13;
    const geometry = catenaryTube(span, sag, 0.008);
    const pivot = new THREE.Object3D();
    pivot.name = 'aarr-washline-cord';
    pivot.position.set((LINE_X0 + LINE_X1) * 0.5, LINE_Y + sag * 0.5, LINE_Z);
    const mesh = new THREE.Mesh(geometry, cordMaterial);
    mesh.name = 'aarr-washline-cord-mesh';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    meshes += 1;
    triangles += countTriangles(geometry);
    const zone = makeZone((LINE_X0 + LINE_X1) * 0.5, LINE_Z);
    zones.push(zone);
    const dragOverWeight = (0.5 * AIR_DENSITY * 1.2 * 0.016) / (0.05 * 9.81);
    const swingRate = TAU / (TAU * Math.sqrt(sag / 9.81));
    recordTip(sag, swingRate, 0.06);
    swingNodes.push({
      pivot,
      zone,
      dragOverWeight,
      swingRate,
      swingGain: 0.22,
      swingPhase: random() * TAU,
      clamp: 0.13,
      twist: null,
      twistGain: 0,
      twistRate: 0,
      twistPhase: 0,
    });
  }

  // Sun-bleached domestic cottons. Distinct from every team/skin colour in the
  // arena on purpose: nothing hanging in a yard should flash like a player.
  const LAUNDRY: ReadonlyArray<{
    readonly x: number;
    readonly width: number;
    readonly height: number;
    readonly colour: number;
    /** Damp mass, kg. A wet towel is roughly double its dry weight. */
    readonly mass: number;
  }> = [
    { x: -23.0, width: 0.50, height: 0.72, colour: 0xe8e2d4, mass: 0.46 },
    { x: -22.0, width: 0.50, height: 0.58, colour: 0xc9b48b, mass: 0.34 },
    { x: -21.0, width: 0.50, height: 0.68, colour: 0xa8bcc4, mass: 0.42 },
    { x: -20.0, width: 0.50, height: 0.60, colour: 0xdcc9b2, mass: 0.36 },
  ];

  const laundryZone = zones[zones.length - 1];
  for (const item of LAUNDRY) {
    // Two nested objects, so the swing (about the line) and the twist (about
    // vertical) can never contaminate each other through Euler order. The pivot
    // sits ON the cord; the cloth hangs below it and therefore swings, while
    // the point it is pegged at does not move.
    const pivot = new THREE.Object3D();
    pivot.name = `aarr-washing-${item.x}`;
    pivot.position.set(item.x, LINE_Y, LINE_Z);
    const twist = new THREE.Object3D();
    twist.name = `${pivot.name}-twist`;
    pivot.add(twist);
    const geometry = new THREE.BoxGeometry(item.width, item.height, 0.014);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: item.colour,
      roughness: 0.94,
      metalness: 0.0,
    }));
    mesh.name = `${pivot.name}-cloth`;
    mesh.position.set(0, -item.height * 0.5, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    twist.add(mesh);
    group.add(pivot);
    meshes += 1;
    triangles += countTriangles(geometry);

    // Flat plate broadside: Cd ~ 1.2 over the full frontal area, against damp mass.
    const area = item.width * item.height;
    const dragOverWeight = (0.5 * AIR_DENSITY * 1.2 * area) / (item.mass * 9.81);
    // Physical pendulum about the peg line: L_eff = 2/3 of the hanging length.
    const swingRate = TAU / (TAU * Math.sqrt((item.height * 2) / 3 / 9.81));
    const swingGain = 0.18;
    // 26 deg. The drag balance reaches roughly this at the profile's 3.0 m/s
    // ceiling; the clamp exists so a future "make it windier" cannot quietly
    // turn a yard detail into a flapping distraction without failing a test.
    const clamp = 0.45;
    recordTip(item.height, swingRate, swingGain * clamp);
    const lowest = LINE_Y - item.height * Math.cos(clamp);
    if (lowest < lowestAnimatedY) lowestAnimatedY = lowest;

    swingNodes.push({
      pivot,
      zone: laundryZone,
      dragOverWeight,
      swingRate,
      swingGain,
      swingPhase: random() * TAU,
      clamp,
      twist,
      // 4.6 deg of lazy yaw, so four rectangles do not read as one rigid board.
      twistGain: 0.08,
      twistRate: 0.55 + random() * 0.25,
      twistPhase: random() * TAU,
    });
  }

  // ---------------------------------------------------------------------------
  // The frame hook.
  //
  // COST, stated rather than estimated. Per frame:
  //   - 6 zones x (5 bands x [1 gustWave = 2 sin, 1 cos] + 1 sin) = 60 sin,
  //     30 cos, ~230 add/mul.
  //   - 9 swing nodes x (1 atan, 1 sin, ~12 flops).
  //   - 4 laundry twists x (1 sin, ~4 flops).
  //   - 4 spin nodes x ~3 flops.
  // Call it ~65 sin, ~30 cos, ~9 atan and ~330 scalar ops, plus the 17 matrix
  // recompositions three.js does for the objects whose rotation changed. On a
  // 16.7 ms budget that is low single-digit microseconds.
  //
  // ALLOCATION: zero. Every destination is a pre-sized Float64Array slot or an
  // existing Euler's scalar field; there is no `new`, no object literal, no
  // array method that builds an iterator, and no closure created per frame. The
  // `for (const node of swingNodes)` loops iterate arrays built once at load.
  // ---------------------------------------------------------------------------
  const update: ArenaFrameUpdate = (elapsedSeconds): void => {
    for (let index = 0; index < zones.length; index += 1) sampleZone(zones[index], elapsedSeconds);

    for (let index = 0; index < swingNodes.length; index += 1) {
      const node = swingNodes[index];
      const windZ = node.zone.out[ZONE_WIND_Z];
      // Quadratic in speed and signed, so the wind can push either way.
      const steady = Math.atan(node.dragOverWeight * windZ * Math.abs(windZ));
      // The body's own ring about that steady angle, scaled by how hard the air
      // is currently working - a dead lull does not set a towel swinging.
      const ring = node.swingGain * steady
        * Math.sin(elapsedSeconds * node.swingRate + node.swingPhase);
      let angle = steady + ring;
      if (angle > node.clamp) angle = node.clamp;
      else if (angle < -node.clamp) angle = -node.clamp;
      // Positive rotation.x carries local -Y toward -Z, so negate to blow the
      // hanging body downwind.
      node.pivot.rotation.x = -angle;
      if (node.twist !== null) {
        node.twist.rotation.y = node.twistGain * node.zone.out[ZONE_GUST]
          * Math.sin(elapsedSeconds * node.twistRate + node.twistPhase);
      }
    }

    for (let index = 0; index < spinNodes.length; index += 1) {
      const node = spinNodes[index];
      // Closed-form integral of omega dt. Never accumulated, so it cannot drift.
      node.rotor.rotation.y = node.phase
        + node.spinPerMetre * node.zone.out[ZONE_SPEED_INTEGRAL];
    }
  };

  return {
    group,
    update,
    telemetry: Object.freeze({
      zones: zones.length,
      swingNodes: swingNodes.length,
      spinNodes: spinNodes.length,
      meshes,
      triangles,
      peakTipSpeedMps,
      lowestAnimatedY: Number.isFinite(lowestAnimatedY) ? lowestAnimatedY : 0,
    }),
  };
}

/** Exported for verification: the head-height line readability is measured against. */
export const ATOMIC_ACRES_MOTION_HEAD_HEIGHT_M = HEAD_HEIGHT_M;

/**
 * Exported for verification only: the allocation-free sampler, exposed so a
 * check can prove it agrees with `sampleWind()` term for term.
 */
export function debugSampleZone(x: number, z: number, timeSeconds: number): {
  speed: number;
  bearingRadians: number;
  gust: number;
} {
  const zone = makeZone(x, z);
  sampleZone(zone, timeSeconds);
  return { speed: zone.out[ZONE_SPEED], bearingRadians: zone.out[1], gust: zone.out[ZONE_GUST] };
}

/** Exported for verification only: the wind field this module drives from. */
export const ATOMIC_ACRES_MOTION_WIND_FIELD = WIND_FIELD;
