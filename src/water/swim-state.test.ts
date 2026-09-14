/**
 * swim-state.test.ts — gates for the pure water movement reducers.
 *
 * PASS 81: this file did not exist. swim-state.ts's own header claimed the
 * FLOAT_ZONE regression contract was "guarded by swim-state.test.ts and
 * water-system.test.ts"; neither file referenced it, so the frozen rustworks
 * float zone had NO test anywhere in the repo (grep FLOAT_ZONE across src/
 * hit only the module itself and a comment in weather-state.ts). It does now.
 *
 * What is pinned here:
 *   1. BODY REFERENCE — SWIM_TUNING depths are the water column over the
 *      player's FEET, and the eye-relative depth the movement loop measures is
 *      converted exactly once. The pre-Pass-81 code compared feet-scale
 *      numbers against eye depth, which put swim entry 2.60 m over the feet —
 *      deeper than the float zone can ever hold a player — so the arena's only
 *      swimmable body was unreachable.
 *   2. HYSTERESIS — enter chin-deep, hold, release at waist depth.
 *   3. FLOAT ZONE — the rustworks out-of-bounds float formula, byte-exact.
 *   4. WIRING — legacy-main still feeds EYE depth, so the single conversion
 *      inside the reducer cannot silently become a double conversion.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EYE_ABOVE_FEET_M,
  FLOAT_ZONE,
  SWIM_TUNING,
  createSwimState,
  feetDepthFromEyeDepth,
  sampleFloatZonePhysics,
  stepSwimState,
  swimMovementModifiers,
  type SwimState,
} from './swim-state';
import { CHARACTER_PHYSICS_CONFIG, STANCE_SHAPES } from '../physics';

const DT = 1 / 120;

/** Eye-relative depth (what every call site measures) for a feet-relative one. */
const eyeDepthForFeetDepth = (depthOverFeet: number): number => depthOverFeet - EYE_ABOVE_FEET_M;

function stepFor(
  seconds: number,
  depthOverFeet: number,
  from: SwimState = createSwimState(),
  swimmable = true,
): SwimState {
  let state = from;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i += 1) {
    state = stepSwimState(state, {
      depth: eyeDepthForFeetDepth(depthOverFeet),
      swimmable,
      dtSeconds: DT,
    });
  }
  return state;
}

describe('swim state body reference', () => {
  // The whole defect class in one assertion: the module must not be allowed to
  // drift from the capsule it describes.
  it('pins EYE_ABOVE_FEET_M to the live character capsule', () => {
    const derived = STANCE_SHAPES.stand.eyeFromCenter
      + CHARACTER_PHYSICS_CONFIG.playerHalfHeight
      + CHARACTER_PHYSICS_CONFIG.playerRadius;
    expect(EYE_ABOVE_FEET_M).toBeCloseTo(derived, 10);
    expect(feetDepthFromEyeDepth(0)).toBeCloseTo(derived, 10);
    expect(feetDepthFromEyeDepth(-derived)).toBeCloseTo(0, 10);
  });

  // Thresholds must be readable as human body landmarks against a 1.70 m
  // eye height, or the next reader repeats the eye/feet confusion.
  it('keys entry and exit to depths a standing player can be measured against', () => {
    expect(SWIM_TUNING.enterDepth).toBeGreaterThan(0);
    // Entry no deeper than eye level: water over the eye is already swimming.
    expect(SWIM_TUNING.enterDepth).toBeLessThanOrEqual(EYE_ABOVE_FEET_M);
    // Entry at least chest deep, or a player swims while standing in the shallows.
    expect(SWIM_TUNING.enterDepth).toBeGreaterThanOrEqual(1.2);
    // Real hysteresis band, exit above the knee.
    expect(SWIM_TUNING.exitDepth).toBeLessThan(SWIM_TUNING.enterDepth);
    expect(SWIM_TUNING.exitDepth).toBeGreaterThan(0.6);
  });

  it('enters the swim state chin-deep and refuses to at knee depth', () => {
    // Knee-deep on a 1.70 m eye height: never swimming, however long you stand.
    expect(stepFor(5, 0.5).swimming).toBe(false);
    // Waist-deep: still walking.
    expect(stepFor(5, 1.0).swimming).toBe(false);
    // Chin-deep (the authored enter depth): swimming after the enter delay.
    expect(stepFor(SWIM_TUNING.enterDelaySeconds - DT, SWIM_TUNING.enterDepth).swimming).toBe(false);
    expect(stepFor(SWIM_TUNING.enterDelaySeconds + DT, SWIM_TUNING.enterDepth).swimming).toBe(true);
  });

  // This is the assertion the shipped constants failed. Water standing level
  // with the player's EYE is total submersion of the body; nothing about that
  // state can legitimately still be "walking".
  it('is swimming when the water surface reaches the eye', () => {
    const state = stepFor(1, EYE_ABOVE_FEET_M);
    expect(state.swimming).toBe(true);
    expect(state.weaponRestricted).toBe(true);
    expect(swimMovementModifiers(state).speedScale).toBe(SWIM_TUNING.swimSpeedScale);
  });

  it('holds the swim state through the hysteresis band and releases at exit depth', () => {
    const swimming = stepFor(1, EYE_ABOVE_FEET_M);
    expect(swimming.swimming).toBe(true);
    // Inside the band (between exit and enter depth) the state must persist.
    const held = stepFor(2, (SWIM_TUNING.exitDepth + SWIM_TUNING.enterDepth) / 2, swimming);
    expect(held.swimming).toBe(true);
    // Below exit depth, only after the exit delay.
    expect(stepFor(SWIM_TUNING.exitDelaySeconds - DT, SWIM_TUNING.exitDepth, swimming).swimming).toBe(true);
    expect(stepFor(SWIM_TUNING.exitDelaySeconds + DT, SWIM_TUNING.exitDepth, swimming).swimming).toBe(false);
  });

  it('never enters on a non-swimmable body at any depth', () => {
    expect(stepFor(10, 4, createSwimState(), false).swimming).toBe(false);
    // And it clears a state carried in from a swimmable body.
    const swimming = stepFor(1, EYE_ABOVE_FEET_M);
    expect(stepSwimState(swimming, { depth: 9, swimmable: false, dtSeconds: DT }).swimming).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Frozen rustworks float zone. These numbers predate HF-358 and are a
// regression contract: changing one is a gameplay behaviour change and needs
// an owner row, never a green-driven tweak.
// ---------------------------------------------------------------------------
describe('float zone regression contract', () => {
  it('pins the extracted constants', () => {
    expect(FLOAT_ZONE).toEqual({
      islandMargin: 0.8,
      outsideThreshold: 0.98,
      entryDepth: -1.2,
      submergedOffset: 1.4,
      submergedMax: 4,
      buoyancyPerSubmergedMetre: 18,
      dragBase: 0.7,
      dragPerSubmergedMetre: 0.15,
    });
  });

  const base = {
    enabled: true,
    waterLevel: 0,
    islandHalfX: 10,
    islandHalfZ: 10,
    wave: { height: 0, verticalVelocity: 0 },
  } as const;

  it('reproduces the legacy samplePhysics formula exactly', () => {
    // Inside the island footprint: dry, whatever the depth.
    expect(sampleFloatZonePhysics({ ...base, position: { x: 0, y: -5, z: 0 } }).inWater).toBe(false);
    // Offshore and 1 m under: submerged = 1 + 1.4 = 2.4.
    const deep = sampleFloatZonePhysics({ ...base, position: { x: 20, y: -1, z: 0 } });
    expect(deep.inWater).toBe(true);
    expect(deep.buoyancy).toBeCloseTo(2.4 * 18, 12);
    expect(deep.drag).toBeCloseTo(0.7 + 2.4 * 0.15, 12);
    // Clamp ceiling: submerged saturates at 4.
    const abyss = sampleFloatZonePhysics({ ...base, position: { x: 20, y: -50, z: 0 } });
    expect(abyss.buoyancy).toBeCloseTo(4 * 18, 12);
    // Above the entry depth: offshore but flying, not floating.
    expect(sampleFloatZonePhysics({ ...base, position: { x: 20, y: 5, z: 0 } }).inWater).toBe(false);
    // Disabled system is inert.
    expect(
      sampleFloatZonePhysics({ ...base, enabled: false, position: { x: 20, y: -1, z: 0 } }).inWater,
    ).toBe(false);
  });

  // The float-zone equilibrium is WHY the eye-keyed thresholds were
  // unreachable: buoyancy 18 m/s^2 per submerged metre against the -24.5
  // player gravity balances at submerged = 24.5/18, i.e. eye depth
  // 24.5/18 - 1.4 = -0.039 m -> 1.661 m over the FEET. Any swim-entry
  // threshold above that can never be sustained by a floating player.
  it('cannot hold a player deeper than the buoyancy equilibrium', () => {
    const PLAYER_GRAVITY = 24.5;
    const equilibriumEyeDepth = PLAYER_GRAVITY / FLOAT_ZONE.buoyancyPerSubmergedMetre
      - FLOAT_ZONE.submergedOffset;
    const equilibriumFeetDepth = feetDepthFromEyeDepth(equilibriumEyeDepth);
    expect(equilibriumFeetDepth).toBeCloseTo(1.6611, 3);
    expect(SWIM_TUNING.enterDepth).toBeLessThan(equilibriumFeetDepth);
  });
});

// ---------------------------------------------------------------------------
// Wiring guard — the conversion lives in exactly one place. If a call site
// ever pre-converts to feet depth, the offset is applied twice and swim entry
// silently moves 1.7 m; if the reducer stops converting, it moves back.
// ---------------------------------------------------------------------------
describe('swim depth wiring', () => {
  const mainSource = readFileSync(
    fileURLToPath(new URL('../legacy-main.ts', import.meta.url)),
    'utf8',
  );

  it('feeds the reducer EYE depth from the live movement loop', () => {
    expect(mainSource).toContain(
      'const waterDepthOverEye = swimSample.surfaceY - player.position.y;',
    );
    const call = mainSource.indexOf('localSwimState = stepSwimState(localSwimState, {');
    expect(call).toBeGreaterThan(-1);
    const block = mainSource.slice(call, call + 240);
    expect(block).toContain('depth: waterDepthOverEye,');
    // No pre-conversion at the call site.
    expect(block).not.toMatch(/depth:\s*waterDepthOverEye\s*\+/);
  });

  it('converts eye depth to feet depth exactly once, inside the reducer', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./swim-state.ts', import.meta.url)),
      'utf8',
    );
    expect(source).toContain('const depth = feetDepthFromEyeDepth(input.depth);');
    // The raw eye depth must never be compared against a feet-keyed threshold.
    expect(source).not.toMatch(/input\.depth\s*[<>]=/);
  });
});
