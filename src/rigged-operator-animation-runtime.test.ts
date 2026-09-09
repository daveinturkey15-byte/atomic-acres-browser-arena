import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AIM_PITCH_LIMITS, clampAimPitch } from './animation-additive-pose';
import { operatorYawToward } from './bot-ai';
import {
  advanceOperatorAnimation,
  createOperatorAnimationDirector,
  pushOperatorHitImpulse,
  pushOperatorOneShot,
  type OperatorAnimationInput,
} from './rigged-operator-animation-director';
import {
  applyOperatorAnimationPose,
  applyOperatorMixerPlan,
  directedGroundVelocity,
  localGroundVelocity,
  planOperatorMixer,
  type OperatorAdditiveBones,
} from './rigged-operator-animation-runtime';
import { RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES, RIGGED_OPERATOR_RUNTIME_ACTION_NAMES } from './operator-model';

const CLIPS = [...RIGGED_OPERATOR_RUNTIME_ACTION_NAMES, ...RIGGED_OPERATOR_DIRECTIONAL_ACTION_NAMES];

/**
 * A real `THREE.AnimationMixer` over a two-node rig. Real three on purpose: the
 * defect this module exists to fix is a property of three's own handling of a
 * finished clamped action, so proving the fix against a fake would prove nothing.
 */
function riggedFixture(): {
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  resolve: (clip: string) => THREE.AnimationAction | undefined;
} {
  const root = new THREE.Object3D();
  const bone = new THREE.Object3D();
  bone.name = 'Chest';
  root.add(bone);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  const durations: Record<string, number> = {
    Walk: 1.3333, Run: 0.8, Run_Shoot: 0.8333, Run_Back: 0.8333, Run_Left: 0.8, Run_Right: 0.8,
  };
  const resolve = (name: string): THREE.AnimationAction | undefined => {
    const existing = actions.get(name);
    if (existing) return existing;
    if (!CLIPS.includes(name as (typeof CLIPS)[number])) return undefined;
    const duration = durations[name] ?? 1;
    const clip = new THREE.AnimationClip(name, duration, [
      new THREE.VectorKeyframeTrack('Chest.position', [0, duration], [0, 0, 0, 0, 1, 0]),
    ]);
    const action = mixer.clipAction(clip);
    actions.set(name, action);
    return action;
  };
  return { mixer, actions, resolve };
}

const still: OperatorAnimationInput = Object.freeze({
  deltaSeconds: 1 / 90,
  forwardMps: 0,
  strafeMps: 0,
  aimPitchRadians: 0,
  yawErrorRadians: 0,
  dead: false,
  availableClips: CLIPS,
});

/**
 * The active-clip set is threaded across frames exactly as `RiggedOperatorRuntime`
 * threads it, because that set is what tells the plan which clips to release.
 * An earlier version of this helper reset it per call and the weight-sum test
 * immediately caught it - a clip that is never declared active is never released.
 */
function driver(
  director: ReturnType<typeof createOperatorAnimationDirector>,
  fixture: ReturnType<typeof riggedFixture>,
): (input: OperatorAnimationInput, frames: number) => string[] {
  let active: string[] = [];
  return (input, frames) => {
    for (let frame = 0; frame < frames; frame += 1) {
      const output = advanceOperatorAnimation(director, input);
      const plan = planOperatorMixer(output, active);
      applyOperatorMixerPlan(plan, fixture.resolve);
      active = [...plan.active];
      fixture.mixer.update(input.deltaSeconds);
    }
    return active;
  };
}

/**
 * "Contributing to the mix" is `isScheduled() && enabled && weight > 0`, and
 * nothing looser. A live probe caught an earlier version of this predicate
 * reporting the whole prewarmed set as live: a freshly bound action is `enabled`
 * with weight 1 but is not in the mixer's active list and writes nothing.
 * `isRunning()` is the opposite error - it excludes paused actions, and a
 * clamped finished one-shot is exactly a paused action that still writes.
 */
function contributing(fixture: ReturnType<typeof riggedFixture>): { name: string; weight: number }[] {
  return [...fixture.actions.entries()]
    .filter(([, action]) => action.isScheduled() && action.enabled && action.getEffectiveWeight() > 1e-4)
    .map(([name, action]) => ({ name, weight: action.getEffectiveWeight() }));
}

describe('operator mixer plan', () => {
  it('releases every clip that leaves the mix, which is what three never does by itself', () => {
    const director = createOperatorAnimationDirector('default', 'plan-release');
    const output = advanceOperatorAnimation(director, still);
    const plan = planOperatorMixer(output, ['Gun_Shoot', 'HitRecieve', 'Punch_Right']);
    expect(plan.released).toEqual(['Gun_Shoot', 'HitRecieve', 'Punch_Right']);
    expect(plan.active.length).toBeGreaterThan(0);
    for (const clip of plan.released) expect(plan.active).not.toContain(clip);
  });

  it('never hands the same action a base and an accent weight in one frame', () => {
    const director = createOperatorAnimationDirector('default', 'plan-collision');
    pushOperatorOneShot(director, 'fire');
    const output = advanceOperatorAnimation(director, { ...still, deltaSeconds: 0.03 });
    const plan = planOperatorMixer(output, []);
    const names = plan.commands.map((command) => command.clip);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks a clip as entering exactly once across a settled blend', () => {
    const director = createOperatorAnimationDirector('default', 'plan-enter');
    let active: string[] = [];
    let entries = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      const output = advanceOperatorAnimation(director, { ...still, forwardMps: 6.15 });
      const plan = planOperatorMixer(output, active);
      entries += plan.commands.filter((command) => command.enter && command.clip === 'Run_Shoot').length;
      active = [...plan.active];
    }
    expect(entries).toBe(1);
  });
});

describe('applied to a real three mixer', () => {
  it('leaves nothing frozen in the mix after firing, being hit and meleeing', () => {
    // The shipped defect, stated exactly: playOneShot set clampWhenFinished with
    // no finished listener, and three handles a finished clamped LoopOnce action
    // as `this.paused = true` - NOT `enabled = false`. The action stayed enabled
    // at weight 1 for the rest of the operator's life. An operator that had
    // fired, been hit and meleed was a running average of three frozen poses.
    const director = createOperatorAnimationDirector('default', 'accent-release');
    const fixture = riggedFixture();
    const drive = driver(director, fixture);
    drive(still, 10);
    pushOperatorOneShot(director, 'fire');
    pushOperatorOneShot(director, 'melee');
    pushOperatorHitImpulse(director, { zone: 'head', severity: 1, incomingYawRadians: 0 });
    const midFire = drive(still, 4);
    expect(midFire.some((clip) => clip === 'Gun_Shoot' || clip === 'Idle_Gun_Shoot')).toBe(true);

    // Long past the longest envelope (melee, 0.45 s) and the hit shape (0.385 s).
    drive(still, 180);
    const stuck = contributing(fixture).filter(({ name }) => (
      name === 'Gun_Shoot' || name === 'Idle_Gun_Shoot' || name === 'Punch_Right'
      || name === 'Kick_Right' || name === 'HitRecieve' || name === 'HitRecieve_2'
    ));
    expect(stuck).toEqual([]);
    for (const [, action] of fixture.actions) {
      // Nothing may be left parked in three's clamped-and-paused state.
      if (action.enabled) expect(action.paused).toBe(false);
    }
  });

  it('keeps the contributing base weight at 1 through a walk to sprint transition', () => {
    const director = createOperatorAnimationDirector('default', 'weight-sum');
    const fixture = riggedFixture();
    const drive = driver(director, fixture);
    drive({ ...still, forwardMps: 1.3 }, 40);
    for (let frame = 0; frame < 40; frame += 1) {
      drive({ ...still, forwardMps: 8.7 }, 1);
      const total = contributing(fixture).reduce((sum, entry) => sum + entry.weight, 0);
      expect(total).toBeGreaterThan(0.999);
      expect(total).toBeLessThan(1.001);
    }
  });

  it('seeds an entering locomotion clip at the running clip phase so footfalls stay in step', () => {
    const director = createOperatorAnimationDirector('default', 'phase-sync');
    const fixture = riggedFixture();
    const drive = driver(director, fixture);
    // Settle into a walk, then demand a run so the run clip enters mid-stride.
    drive({ ...still, forwardMps: 1.2 }, 60);
    const walk = fixture.resolve('Walk')!;
    const walkPhase = (walk.time % walk.getClip().duration) / walk.getClip().duration;
    expect(walkPhase).toBeGreaterThan(0.02);

    const output = advanceOperatorAnimation(director, { ...still, forwardMps: 8.7 });
    const plan = planOperatorMixer(output, ['Walk']);
    const entering = plan.commands.find((command) => command.enter && command.clip === 'Run_Shoot');
    expect(entering?.phaseSource).toBe('Walk');
    applyOperatorMixerPlan(plan, fixture.resolve);
    const run = fixture.resolve('Run_Shoot')!;
    const runPhase = (run.time % run.getClip().duration) / run.getClip().duration;
    expect(runPhase).toBeCloseTo(walkPhase, 5);
  });

  it('plays the corpse clip once and clamps it instead of looping the collapse', () => {
    const director = createOperatorAnimationDirector('default', 'death');
    const fixture = riggedFixture();
    const drive = driver(director, fixture);
    drive({ ...still, forwardMps: 6 }, 30);
    drive({ ...still, forwardMps: 6, dead: true }, 120);
    const death = fixture.actions.get('Death');
    expect(death).toBeDefined();
    expect(death!.loop).toBe(THREE.LoopOnce);
    expect(death!.clampWhenFinished).toBe(true);
    // Locomotion is gone; only the corpse contributes.
    expect(contributing(fixture).map(({ name }) => name)).toEqual(['Death']);
  });

  it('does not count a bound-but-never-played action as contributing', () => {
    // Found by the live probe, not by reasoning: prewarm binds up to fourteen
    // actions at spawn and every one of them is `enabled` with weight 1 the
    // moment it is created. Only the mixer's active list decides what writes.
    const fixture = riggedFixture();
    const prewarmed = fixture.resolve('Kick_Right')!;
    expect(prewarmed.enabled).toBe(true);
    expect(prewarmed.getEffectiveWeight()).toBe(1);
    expect(prewarmed.isScheduled()).toBe(false);
    expect(contributing(fixture)).toEqual([]);
  });

  it('bounds how many actions are ever mixed at once under a chaotic script', () => {
    const director = createOperatorAnimationDirector('symbiote', 'chaos');
    const fixture = riggedFixture();
    let seed = 0x51f3a7;
    const next = (): number => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 0x100000000;
    };
    let active: string[] = [];
    let peak = 0;
    for (let frame = 0; frame < 900; frame += 1) {
      if (next() < 0.08) pushOperatorOneShot(director, next() < 0.5 ? 'fire' : 'melee');
      if (next() < 0.05) {
        pushOperatorHitImpulse(director, {
          zone: next() < 0.34 ? 'head' : next() < 0.67 ? 'body' : 'limb',
          severity: next(),
          incomingYawRadians: (next() - 0.5) * 6.4,
        });
      }
      const output = advanceOperatorAnimation(director, {
        ...still,
        deltaSeconds: 0.004 + next() * 0.02,
        forwardMps: (next() - 0.5) * 17,
        strafeMps: (next() - 0.5) * 9,
        aimPitchRadians: (next() - 0.5) * 2.4,
        yawErrorRadians: (next() - 0.5) * 6.4,
      });
      const plan = planOperatorMixer(output, active);
      applyOperatorMixerPlan(plan, fixture.resolve);
      active = [...plan.active];
      fixture.mixer.update(0.011);
      peak = Math.max(peak, contributing(fixture).length);
    }
    // Three base layers is the graph's declared ceiling; the accent layer adds a
    // hit clip and up to two one-shots on top.
    expect(peak).toBeLessThanOrEqual(6);
  });
});

describe('local ground velocity', () => {
  it('agrees with the authoritative yaw convention for forward, back and both flanks', () => {
    // operatorYawToward puts forward on local -Z. Face +X, then move each way.
    const yaw = operatorYawToward({ x: 0, z: 0 }, { x: 5, z: 0 });
    const dt = 0.5;
    const forward = localGroundVelocity(2 * dt, 0, yaw, dt);
    expect(forward.forwardMps).toBeCloseTo(2, 6);
    expect(forward.strafeMps).toBeCloseTo(0, 6);

    const back = localGroundVelocity(-2 * dt, 0, yaw, dt);
    expect(back.forwardMps).toBeCloseTo(-2, 6);

    // Facing +X, the operator's right is +Z.
    const right = localGroundVelocity(0, 3 * dt, yaw, dt);
    expect(right.strafeMps).toBeCloseTo(3, 6);
    expect(right.forwardMps).toBeCloseTo(0, 6);

    const left = localGroundVelocity(0, -3 * dt, yaw, dt);
    expect(left.strafeMps).toBeCloseTo(-3, 6);
  });

  it('preserves speed magnitude and refuses to divide by a zero frame', () => {
    for (const yaw of [0, 0.7, -2.4, Math.PI]) {
      const measured = localGroundVelocity(0.31, -0.17, yaw, 0.05);
      expect(Math.hypot(measured.forwardMps, measured.strafeMps)).toBeCloseTo(Math.hypot(0.31, -0.17) / 0.05, 6);
    }
    expect(localGroundVelocity(1, 1, 0, 0)).toEqual({ forwardMps: 0, strafeMps: 0 });
  });
});

describe('directed ground velocity', () => {
  it('takes magnitude from the caller and direction from measurement', () => {
    const directed = directedGroundVelocity(5.85, { forwardMps: -0.8, strafeMps: 0.6 });
    expect(Math.hypot(directed.forwardMps, directed.strafeMps)).toBeCloseTo(5.85, 6);
    expect(directed.forwardMps).toBeLessThan(0);
    expect(directed.strafeMps).toBeGreaterThan(0);
  });

  it('keeps the frozen debug presentation route working', () => {
    // __ATOMIC_ACRES_DEBUG__.setBotPresentation declares a speed while the bot
    // does not move at all. Without this fallback that route would go idle.
    const directed = directedGroundVelocity(6.4, { forwardMps: 0, strafeMps: 0 });
    expect(directed).toEqual({ forwardMps: 6.4, strafeMps: 0 });
    expect(directedGroundVelocity(0, { forwardMps: 3, strafeMps: 2 }))
      .toEqual({ forwardMps: 0, strafeMps: 0 });
  });

  it('routes a retreating bot onto a backward clip instead of a forward run', () => {
    const director = createOperatorAnimationDirector('default', 'retreat');
    // 4.65 m/s straight backwards, the real hosted-bot retreat speed.
    const velocity = directedGroundVelocity(4.65, localGroundVelocity(0, 4.65 * 0.02, 0, 0.02));
    const output = advanceOperatorAnimation(director, {
      ...still,
      forwardMps: velocity.forwardMps,
      strafeMps: velocity.strafeMps,
    });
    expect(velocity.forwardMps).toBeLessThan(-4.6);
    expect(output.locomotion.clips.map((clip) => clip.clip)).toContain('Run_Back');
    expect(output.locomotion.directionMismatch).toBeLessThan(0.05);
  });
});

describe('additive pose application', () => {
  type TestBone = { rotation: { x: number; y: number; z: number } };
  type TestRig = Required<{ [K in keyof OperatorAdditiveBones]: TestBone }>;

  function bones(): TestRig {
    const make = (): TestBone => ({ rotation: { x: 0, y: 0, z: 0 } });
    return { hips: make(), abdomen: make(), torso: make(), chest: make(), neck: make(), head: make() };
  }

  it('pitches the spine chain up for an upward aim, by exactly the clamped pitch', () => {
    const director = createOperatorAnimationDirector('default', 'aim-up');
    let output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: 0.5 });
    for (let frame = 0; frame < 400; frame += 1) {
      output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: 0.5 });
    }
    expect(output.aim.aimPitchRadians).toBeCloseTo(0.5, 3);
    const rig = bones();
    applyOperatorAnimationPose(rig, output);
    // +X pitches the body forward and down (that is how applyStancePose builds a
    // crouch), so aiming up must be negative on every spine joint.
    expect(rig.abdomen.rotation.x).toBeLessThan(0);
    expect(rig.chest.rotation.x).toBeLessThan(0);
    expect(rig.neck.rotation.x).toBeLessThan(0);
    expect(rig.head.rotation.x).toBeLessThan(0);
    const joints = output.aim.aimJointRadians;
    expect(joints.spine + joints.chest + joints.neck + joints.head)
      .toBeCloseTo(clampAimPitch(0.5), 9);
  });

  it('clamps an absurd aim instead of folding the rig in half', () => {
    const director = createOperatorAnimationDirector('default', 'aim-clamp');
    let output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: 42 });
    for (let frame = 0; frame < 600; frame += 1) {
      output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: 42 });
    }
    expect(output.aim.aimPitchRadians).toBeLessThanOrEqual(AIM_PITCH_LIMITS.maximumUpRadians + 1e-9);
    const rig = bones();
    applyOperatorAnimationPose(rig, output);
    for (const bone of [rig.abdomen, rig.chest, rig.neck, rig.head]) {
      expect(Math.abs(bone.rotation.x)).toBeLessThan(AIM_PITCH_LIMITS.maximumUpRadians);
    }
  });

  it('never accumulates: the same output applied to a clean pose is idempotent', () => {
    const director = createOperatorAnimationDirector('symbiote', 'idempotent');
    let output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: -0.3, strafeMps: 3 });
    for (let frame = 0; frame < 90; frame += 1) {
      output = advanceOperatorAnimation(director, { ...still, aimPitchRadians: -0.3, strafeMps: 3 });
    }
    const first = bones();
    applyOperatorAnimationPose(first, output);
    const second = bones();
    applyOperatorAnimationPose(second, output);
    applyOperatorAnimationPose(second, output);
    // Twice from a clean pose would double; the runtime restores the clean pose
    // every frame, which is what this asserts the caller must keep doing.
    expect(second.chest.rotation.x).toBeCloseTo(first.chest.rotation.x * 2, 9);
    expect(first.chest.rotation.x).not.toBe(0);
  });

  it('gives each archetype a visibly different resting posture from one shared corpus', () => {
    const resting = (skinId: string): number => {
      const director = createOperatorAnimationDirector(skinId, `posture-${skinId}`);
      const output = advanceOperatorAnimation(director, still);
      const rig = bones();
      applyOperatorAnimationPose(rig, output);
      return rig.abdomen.rotation.x;
    };
    const standard = resting('default');
    const symbiote = resting('symbiote');
    const navalops = resting('navalops');
    const explorer = resting('explorer');
    // Plated symbiote is the most hunched; standard is upright.
    expect(symbiote).toBeGreaterThan(navalops);
    expect(navalops).toBeGreaterThan(explorer);
    expect(explorer).toBeGreaterThan(standard);
    expect(symbiote - standard).toBeGreaterThan(0.1);
  });

  it('layers a hit over locomotion instead of replacing it', () => {
    const director = createOperatorAnimationDirector('default', 'hit-layer');
    for (let frame = 0; frame < 60; frame += 1) {
      advanceOperatorAnimation(director, { ...still, forwardMps: 6.15 });
    }
    pushOperatorHitImpulse(director, { zone: 'head', severity: 1, incomingYawRadians: 0 });
    let peak = 0;
    let peakOutput = advanceOperatorAnimation(director, { ...still, forwardMps: 6.15 });
    for (let frame = 0; frame < 12; frame += 1) {
      const output = advanceOperatorAnimation(director, { ...still, forwardMps: 6.15 });
      if (output.hitReaction.clipWeight > peak) {
        peak = output.hitReaction.clipWeight;
        peakOutput = output;
      }
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThan(1);
    // Locomotion still owns the base at full weight while the flinch plays.
    const baseTotal = peakOutput.layers.reduce((sum, layer) => sum + layer.weight, 0);
    expect(baseTotal).toBeCloseTo(1, 6);
    expect(peakOutput.layers.some((layer) => layer.clip.startsWith('Run'))).toBe(true);
    const rig = bones();
    applyOperatorAnimationPose(rig, peakOutput);
    // A hit from dead ahead throws the torso back, i.e. negative X.
    expect(peakOutput.hitReaction.pitchOffsetRadians).toBeLessThan(0);
    expect(rig.chest.rotation.x).toBeLessThan(0);
  });
});
