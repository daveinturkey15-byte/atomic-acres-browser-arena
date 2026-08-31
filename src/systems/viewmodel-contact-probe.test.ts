/**
 * Unit gates for the viewmodel contact lattice.
 *
 * Two owner failures live here. "Gun still clips through walls and floor" was
 * the down-pitched probe passing through a raycast-plane floor that owns no
 * movement box; the analytic ground clamp is the fix and this file pins it.
 * The second is the drift between the live lattice and the HF-343 diagnostic
 * copy of it, which is now structurally impossible - there is one lattice -
 * and is pinned so a future caller cannot reintroduce a second one.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Box2 } from '../collision';
import {
  VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
  VIEWMODEL_CONTACT_PROBE_OFFSETS,
  VIEWMODEL_CONTACT_PROFILES,
  viewmodelObstructionPose,
  viewmodelProbeLattice,
  type ViewmodelContactEnvelope,
} from '../weapon-presentation-state';
import {
  measuredEnvelopeContactDepthMeters,
  nearestViewmodelForwardObstructionMeters,
  resolveViewmodelObstructionPose,
  sampleViewmodelContactProbes,
  viewmodelFloorClearanceFor,
  type ViewmodelObstructionPoseInput,
} from './viewmodel-contact-probe';

/** stanceEyeHeight('prone') / stanceEyeHeight('stand'), inlined as data. */
const PRONE_EYE_HEIGHT_M = 0.61;
const STAND_EYE_HEIGHT_M = 1.7;
const CARBINE = VIEWMODEL_CONTACT_PROFILES.carbine;

function input(overrides: Partial<ViewmodelObstructionPoseInput> = {}): ViewmodelObstructionPoseInput {
  return {
    weapon: 'carbine',
    position: { x: 0, y: STAND_EYE_HEIGHT_M, z: 0 },
    yaw: 0,
    pitch: 0,
    colliders: [],
    dressingBoxes: [],
    grounded: false,
    prone: false,
    stanceEyeHeightMeters: STAND_EYE_HEIGHT_M,
    ...overrides,
  };
}

/**
 * The carbine's rig envelope as MEASURED in installed Chrome on 2026-08-31
 * (docs/assets/viewmodel-clipping-fix-2026-08-31/measurements-after.json).
 * Inlined as data so this gate pins real geometry rather than a
 * plausible-looking invention.
 */
const MEASURED_CARBINE_ENVELOPE: ViewmodelContactEnvelope = Object.freeze({
  contract: VIEWMODEL_CONTACT_ENVELOPE_CONTRACT,
  weapon: 'carbine',
  minX: 0.198,
  maxX: 0.459,
  minY: -0.839,
  maxY: -0.111,
  forwardReachMeters: 1.97,
});

/** A wall the camera looks straight into, 1.0-1.2 m ahead down -Z. */
const WALL: Box2 = Object.freeze({ minX: -3, maxX: 3, minZ: -1.2, maxZ: -1, minY: 0, maxY: 3 });

describe('forward contact lattice', () => {
  it('reports no obstruction in open air', () => {
    expect(nearestViewmodelForwardObstructionMeters(input())).toBeNull();
  });

  it('folds against a wall inside the weapon envelope', () => {
    const distance = nearestViewmodelForwardObstructionMeters(input({ colliders: [WALL] }));
    expect(distance).not.toBeNull();
    expect(distance!).toBeGreaterThan(0);
    expect(distance!).toBeLessThan(CARBINE.probeLengthMeters);
  });

  it('ignores geometry beyond the authored probe length', () => {
    const far: Box2 = { ...WALL, minZ: -12, maxZ: -11 };
    expect(nearestViewmodelForwardObstructionMeters(input({ colliders: [far] }))).toBeNull();
  });

  /**
   * THE TEST THAT ENCODED THE BUG, corrected 2026-08-31.
   *
   * This file used to assert only the clause above and treat it as the whole
   * truth: geometry beyond `probeLengthMeters` is invisible, full stop. That is
   * the right rule for the FIRE gate - widening what the trigger can refuse is
   * not presentation work - but it was also the only rule the POSE had, and the
   * authored length is shorter than the weapon. Measured 2026-08-31: carbine
   * probeLengthMeters 1.65 m against a muzzle 1.958 m from the eye, sniper
   * 1.95 m against 2.157 m. At a 1.80 m gap the lattice reported
   * `nearestForwardMeters: null` and `retreat: 0` while the muzzle was already
   * 15.8 cm inside the wall - and this file called that correct.
   *
   * The blindness is now confined to the fire path; the pose path sees the rig
   * it is actually posing.
   */
  it('the POSE still sees a wall the authored envelope is too short to reach', () => {
    // 1.80 m ahead: past the carbine's 1.65 m authored envelope, well inside
    // the 1.958 m the measured muzzle reaches.
    const beyondAuthored: Box2 = { ...WALL, minZ: -2.0, maxZ: -1.8 };
    const world = input({ colliders: [beyondAuthored] });
    expect(CARBINE.probeLengthMeters).toBeLessThan(1.8);
    expect(nearestViewmodelForwardObstructionMeters(world)).toBeNull();

    const measured = measuredEnvelopeContactDepthMeters({ ...world, envelope: MEASURED_CARBINE_ENVELOPE });
    expect(measured).not.toBeNull();
    expect(measured!).toBeGreaterThan(1.5);
    expect(measured!).toBeLessThan(2.1);
  });

  it('leaves the fire gate blind to the same wall - retreat may not move', () => {
    const beyondAuthored: Box2 = { ...WALL, minZ: -2.0, maxZ: -1.8 };
    const authored = resolveViewmodelObstructionPose(input({ colliders: [beyondAuthored] }));
    const withEnvelope = resolveViewmodelObstructionPose(input({
      colliders: [beyondAuthored],
      envelope: MEASURED_CARBINE_ENVELOPE,
    }));
    // The presentation-only channel is the ONLY thing the envelope changes.
    expect(withEnvelope.retreat).toBe(authored.retreat);
    expect(withEnvelope.lift).toBe(authored.lift);
    expect(authored.contactDepthMeters).toBeNull();
    expect(withEnvelope.contactDepthMeters).not.toBeNull();
  });

  it('walks the complete authored probe set, not a subset', () => {
    const sweep = sampleViewmodelContactProbes(input({ colliders: [WALL] }));
    expect(sweep.samples).toHaveLength(VIEWMODEL_CONTACT_PROBE_OFFSETS.length);
    expect(sweep.samples.map((sample) => sample.offset)).toEqual([...VIEWMODEL_CONTACT_PROBE_OFFSETS]);
  });
});

describe('the lattice covers the volume the weapon is in (owner 2026-08-31)', () => {
  it('the authored lattice is centred on the EYE, which is not where the weapon is', () => {
    const authored = viewmodelProbeLattice(CARBINE, null);
    expect(authored.source).toBe('authored-profile');
    expect(authored.centreRightMeters).toBe(0);
    expect(authored.centreUpMeters).toBe(0);
    // Measured: the rig occupies camera-space X +0.198..+0.459, Y -0.839..-0.111.
    // The authored lattice spans X -0.24..+0.24 and Y -0.28..+0.25 around the
    // eye, so it samples a volume the weapon is almost entirely outside of.
    expect(authored.centreRightMeters).toBeLessThan(MEASURED_CARBINE_ENVELOPE.minX);
    expect(authored.centreUpMeters).toBeGreaterThan(MEASURED_CARBINE_ENVELOPE.maxY);
  });

  it('the measured lattice is centred on the rig and reaches as far as it does', () => {
    const measured = viewmodelProbeLattice(CARBINE, MEASURED_CARBINE_ENVELOPE);
    expect(measured.source).toBe('measured-envelope');
    const centreX = (MEASURED_CARBINE_ENVELOPE.minX + MEASURED_CARBINE_ENVELOPE.maxX) / 2;
    const centreY = (MEASURED_CARBINE_ENVELOPE.minY + MEASURED_CARBINE_ENVELOPE.maxY) / 2;
    expect(measured.centreRightMeters).toBeCloseTo(centreX, 6);
    expect(measured.centreUpMeters).toBeCloseTo(centreY, 6);
    // Every part of the rig lies inside the sampled span.
    expect(measured.centreRightMeters - measured.halfWidthMeters).toBeCloseTo(MEASURED_CARBINE_ENVELOPE.minX, 6);
    expect(measured.centreRightMeters + measured.halfWidthMeters).toBeCloseTo(MEASURED_CARBINE_ENVELOPE.maxX, 6);
    expect(measured.centreUpMeters - measured.lowerOffsetMeters).toBeCloseTo(MEASURED_CARBINE_ENVELOPE.minY, 6);
    expect(measured.centreUpMeters + measured.upperOffsetMeters).toBeCloseTo(MEASURED_CARBINE_ENVELOPE.maxY, 6);
    // And it reaches past the muzzle rather than stopping short of it.
    expect(measured.lengthMeters).toBeGreaterThan(MEASURED_CARBINE_ENVELOPE.forwardReachMeters);
    expect(measured.lengthMeters).toBeGreaterThan(CARBINE.probeLengthMeters);
  });

  it('a rig that cannot be measured falls back to the authored profile exactly', () => {
    const fallback = viewmodelProbeLattice(CARBINE, null);
    expect(fallback.halfWidthMeters).toBe(CARBINE.probeHalfWidthMeters);
    expect(fallback.upperOffsetMeters).toBe(CARBINE.probeUpperOffsetMeters);
    expect(fallback.lowerOffsetMeters).toBe(CARBINE.probeLowerOffsetMeters);
    expect(fallback.lengthMeters).toBe(CARBINE.probeLengthMeters);
  });
});

describe('dressing folds the pose but never the fire gate (owner 2026-08-30)', () => {
  it('a dressing-only obstruction bends the weapon', () => {
    const dressed = input({ colliders: [], dressingBoxes: [WALL] });
    expect(nearestViewmodelForwardObstructionMeters(dressed)).not.toBeNull();
  });

  it('the same obstruction is invisible to a collider-only sweep', () => {
    // This is the exact call shape legacy-main's fire-admission diagnostics
    // uses: the trigger gate sees movement colliders alone, so a decoration
    // must never be able to explain a refusal.
    const sweep = sampleViewmodelContactProbes({
      weapon: 'carbine',
      position: { x: 0, y: STAND_EYE_HEIGHT_M, z: 0 },
      yaw: 0,
      pitch: 0,
      colliders: [],
      dressingBoxes: [],
    });
    expect(sweep.samples.every((sample) => sample.colliderMeters === null)).toBe(true);
  });

  it('keeps the two sets separable on the same probe', () => {
    const near: Box2 = { ...WALL, minZ: -0.9, maxZ: -0.8 };
    const sweep = sampleViewmodelContactProbes(input({ colliders: [WALL], dressingBoxes: [near] }));
    const centre = sweep.samples[0];
    expect(centre.colliderMeters).not.toBeNull();
    expect(centre.dressingMeters).not.toBeNull();
    // Dressing is nearer here, so only the pose reducer may take it.
    expect(centre.dressingMeters!).toBeLessThan(centre.colliderMeters!);
  });
});

describe('one lattice, no drift between the pose and its diagnostics', () => {
  it('the sampled nearest collider hit equals the pose reducer with no dressing', () => {
    const world = input({ colliders: [WALL] });
    const sweep = sampleViewmodelContactProbes(world);
    const sampledNearest = sweep.samples.reduce<number | null>(
      (nearest, sample) => sample.colliderMeters === null
        ? nearest
        : nearest === null ? sample.colliderMeters : Math.min(nearest, sample.colliderMeters),
      null,
    );
    expect(sampledNearest).toBe(nearestViewmodelForwardObstructionMeters(world));
  });

  it('the sweep reports the profile and padding the pose actually used', () => {
    const sweep = sampleViewmodelContactProbes(input());
    expect(sweep.profile).toBe(CARBINE);
    expect(sweep.probePaddingMeters).toBeGreaterThan(0);
  });
});

/**
 * THE HISTORICAL FAILURE SHAPE. Most authored floors are raycast planes and
 * own no movement box, so before the analytic clamp a grounded, down-pitched
 * probe found nothing at all and the weapon rendered half-buried - worst while
 * prone looking down. Without the clamp the pose here collapses to the bare
 * prone retreat, which is what the owner was seeing.
 */
describe('analytic ground clamp on a box-free floor (owner 2026-08-30)', () => {
  const lookingDownProne = input({
    position: { x: 0, y: PRONE_EYE_HEIGHT_M, z: 0 },
    pitch: -1.2,
    grounded: true,
    prone: true,
    stanceEyeHeightMeters: PRONE_EYE_HEIGHT_M,
  });

  it('clamps to the stance ground plane with no collider present at all', () => {
    const distance = nearestViewmodelForwardObstructionMeters(lookingDownProne);
    expect(distance).not.toBeNull();
    // stanceEyeHeight / |forward.y|, with forward.y === sin(pitch) at yaw 0.
    expect(distance!).toBeCloseTo(PRONE_EYE_HEIGHT_M / Math.abs(Math.sin(-1.2)), 6);
  });

  it('folds the weapon far further than the unclamped pose did', () => {
    const clamped = resolveViewmodelObstructionPose(lookingDownProne);
    const unclamped = viewmodelObstructionPose(null, true, PRONE_EYE_HEIGHT_M, 'carbine');
    expect(clamped.retreat).toBeGreaterThan(unclamped.retreat);
    expect(clamped.retreat).toBeGreaterThan(0.5);
  });

  it('does not clamp while airborne - a jump must not invent a floor', () => {
    const airborne = { ...lookingDownProne, grounded: false };
    expect(nearestViewmodelForwardObstructionMeters(airborne)).toBeNull();
  });

  it('does not clamp when the camera is level or looking up', () => {
    for (const pitch of [0, 0.4, 1.2]) {
      expect(nearestViewmodelForwardObstructionMeters({ ...lookingDownProne, pitch })).toBeNull();
    }
  });

  it('does not clamp when the ground plane is beyond the probe length', () => {
    // A shallow down-pitch puts the analytic plane hit past the envelope; the
    // clamp must stay out rather than pretend the floor is close.
    const shallow = { ...lookingDownProne, pitch: -0.2 };
    expect(PRONE_EYE_HEIGHT_M / Math.abs(Math.sin(-0.2))).toBeGreaterThan(CARBINE.probeLengthMeters);
    expect(nearestViewmodelForwardObstructionMeters(shallow)).toBeNull();
  });
});

describe('floor clearance', () => {
  it('measures a real floor box under the camera in preference to the fallback', () => {
    // Prone, so the camera sits inside the 1.05 m downward probe of the floor.
    const floor: Box2 = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: -0.2, maxY: 0 };
    const clearance = viewmodelFloorClearanceFor(input({
      position: { x: 0, y: PRONE_EYE_HEIGHT_M, z: 0 },
      stanceEyeHeightMeters: PRONE_EYE_HEIGHT_M,
      colliders: [floor],
      grounded: true,
    }));
    expect(clearance).not.toBeNull();
    expect(clearance!).toBeGreaterThan(0);
    // The probe (padded) reaches the slab before the stance fallback would.
    expect(clearance!).toBeLessThan(PRONE_EYE_HEIGHT_M);
  });

  it('falls back to stance eye height when grounded over a box-free floor', () => {
    expect(viewmodelFloorClearanceFor(input({ grounded: true }))).toBe(STAND_EYE_HEIGHT_M);
  });

  it('reports no clearance while airborne over nothing', () => {
    expect(viewmodelFloorClearanceFor(input({ grounded: false }))).toBeNull();
  });
});

/**
 * RE-PIN, 2026-08-30. src/pass70-weapon-contact-scope-integration.test.ts
 * pinned these invariants as literal strings inside legacy-main - it pinned
 * the code's LOCATION, not its meaning, which is why moving the lattice out of
 * the 33k-line module reads as a gate break even though nothing behaves
 * differently. The invariants are re-stated here against the module that now
 * owns them, and strengthened with a clause the old gate could not express:
 * legacy-main must not be able to grow a SECOND lattice. Nothing is relaxed;
 * the pass70 pins for camera-forward shot authority are untouched and still
 * apply to legacy-main.
 */
describe('source shape: the contact lattice has exactly one home (re-pinned 2026-08-30)', () => {
  const MODULE = readFileSync(new URL('./viewmodel-contact-probe.ts', import.meta.url), 'utf8');
  const RUNTIME = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');

  it('derives the fold from the authored profile and the complete padded probe set', () => {
    expect(MODULE).toContain('const profile = VIEWMODEL_CONTACT_PROFILES[input.weapon];');
    expect(MODULE).toContain('const probePaddingMeters = viewmodelContactProbePaddingMeters(profile);');
    expect(MODULE).toContain('for (const offset of VIEWMODEL_CONTACT_PROBE_OFFSETS)');
    expect(MODULE).toContain('viewmodelObstructionPose(nearestForward, input.prone, floorClearance, input.weapon)');
  });

  it('leaves no second lattice in legacy-main - the drift that caused this', () => {
    expect(RUNTIME).not.toContain('VIEWMODEL_CONTACT_PROBE_OFFSETS');
    expect(RUNTIME).not.toContain('viewmodelContactProbePaddingMeters');
    expect(RUNTIME).not.toContain('VIEWMODEL_CONTACT_PROFILES');
    expect(RUNTIME).toContain('resolveViewmodelObstructionPose(currentViewmodelObstructionInput())');
  });

  it('cannot reach back into the module it was extracted from', () => {
    expect(MODULE).not.toMatch(/from\s+'\.\.\/legacy-main'/u);
    // No renderer, no DOM: the point of the extraction is that this is testable.
    expect(MODULE).not.toContain('document.');
    expect(MODULE).not.toContain('WebGPURenderer');
  });
});
