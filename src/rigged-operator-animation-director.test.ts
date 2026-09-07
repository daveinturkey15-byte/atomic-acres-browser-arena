import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AIM_PITCH_LIMITS } from './animation-additive-pose';
import { MAXIMUM_HIT_REACTION_WEIGHT } from './animation-hit-reaction';
import { RIGGED_OPERATOR_RUNTIME_ACTION_NAMES } from './operator-model';
import {
  OPERATOR_ANIMATION_TRANSITIONS,
  OPERATOR_ONE_SHOT_SHAPES,
  advanceOperatorAnimation,
  createOperatorAnimationDirector,
  pushOperatorHitImpulse,
  pushOperatorOneShot,
  type OperatorAnimationInput,
  type OperatorAnimationOutput,
} from './rigged-operator-animation-director';

const RUNTIME_CLIPS = [...RIGGED_OPERATOR_RUNTIME_ACTION_NAMES];

const still: OperatorAnimationInput = Object.freeze({
  deltaSeconds: 1 / 90,
  forwardMps: 0,
  strafeMps: 0,
  aimPitchRadians: 0,
  yawErrorRadians: 0,
  dead: false,
  availableClips: RUNTIME_CLIPS,
});

function totalWeight(layers: readonly { weight: number }[]): number {
  return layers.reduce((sum, layer) => sum + layer.weight, 0);
}

function run(
  director: ReturnType<typeof createOperatorAnimationDirector>,
  input: OperatorAnimationInput,
  frames: number,
): OperatorAnimationOutput {
  let output = advanceOperatorAnimation(director, input);
  for (let frame = 1; frame < frames; frame += 1) output = advanceOperatorAnimation(director, input);
  return output;
}

/**
 * A deterministic pseudo-random script. A seeded LCG, never `Math.random`, so a
 * failure is reproducible and the assertion means the same thing on every run.
 */
function script(length: number): OperatorAnimationInput[] {
  let seed = 0x2f6e2b1;
  const next = (): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 0x100000000;
  };
  return Array.from({ length }, () => ({
    deltaSeconds: 0.004 + next() * 0.02,
    forwardMps: (next() - 0.5) * 17,
    strafeMps: (next() - 0.5) * 9,
    aimPitchRadians: (next() - 0.5) * 2.4,
    yawErrorRadians: (next() - 0.5) * 6.4,
    dead: false,
    availableClips: RUNTIME_CLIPS,
  }));
}

describe('transition table', () => {
  it('leaves idle faster than it settles back into it', () => {
    const table = OPERATOR_ANIMATION_TRANSITIONS.transitions;
    expect(table['idle->locomotion']!).toBeLessThan(table['locomotion->idle']!);
    expect(table['*->death']!).toBeLessThan(table['idle->locomotion']!);
    expect(table['locomotion->turn']!).toBeLessThan(table['idle->locomotion']!);
  });
});

describe('base pose', () => {
  it('emits weights that sum to one on every frame of a hostile script', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    for (const input of script(500)) {
      const output = advanceOperatorAnimation(director, input);
      expect(totalWeight(output.layers)).toBeCloseTo(1, 10);
    }
  });

  it('never emits a clip the mixer has not bound', () => {
    const director = createOperatorAnimationDirector('symbiote', 'bot-2');
    const bound = ['Idle_Gun', 'Walk'];
    for (const input of script(200)) {
      const output = advanceOperatorAnimation(director, { ...input, availableClips: bound });
      for (const layer of [...output.layers, ...output.additiveLayers]) expect(bound).toContain(layer.clip);
    }
  });

  it('cross-fades from idle into locomotion instead of swapping', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    run(director, still, 40);
    expect(director.graph.target).toBe('idle');

    const moving = { ...still, forwardMps: 4 };
    const first = advanceOperatorAnimation(director, moving);
    const idleWeight = first.layers.find((layer) => layer.clip === 'Idle_Gun_Pointing')?.weight ?? 0;
    // Mid-transition the outgoing idle is still visibly weighted; a hard swap
    // would have dropped it to zero on the first frame.
    expect(idleWeight).toBeGreaterThan(0);
    expect(idleWeight).toBeLessThan(1);
    expect(totalWeight(first.layers)).toBeCloseTo(1, 10);

    const settled = run(director, moving, 60);
    expect(settled.layers.some((layer) => layer.clip === 'Idle_Gun_Pointing')).toBe(false);
    expect(settled.state).toBe('locomotion');
  });

  it('speed matches the locomotion playback and reports the residual slide', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    const jog = run(director, { ...still, forwardMps: 2.4 }, 90);
    expect(jog.locomotion.footSlideMps).toBeCloseTo(0, 6);
    for (const layer of jog.layers) expect(layer.timeScale).not.toBe(1);

    const sprint = run(director, { ...still, forwardMps: 8.7 }, 90);
    expect(sprint.locomotion.footSlideRatio).toBeGreaterThan(0.3);
  });
});

describe('additive aim', () => {
  it('carries the aim pitch the shipped runtime drops, clamped and distributed', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    const output = run(director, { ...still, aimPitchRadians: 0.45 }, 120);
    expect(output.aim.aimPitchRadians).toBeCloseTo(0.45, 3);
    const joints = output.aim.aimJointRadians;
    expect(joints.spine + joints.chest + joints.neck + joints.head).toBeCloseTo(output.aim.aimPitchRadians, 12);
  });

  it('refuses a pitch that would fold the rig', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    const output = run(director, { ...still, aimPitchRadians: 12 }, 300);
    expect(output.aim.aimPitchRadians).toBeLessThanOrEqual(AIM_PITCH_LIMITS.maximumUpRadians);
  });
});

describe('hit reactions', () => {
  it('layers over locomotion without disturbing the base blend, then disappears', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    const moving = { ...still, forwardMps: 5 };
    run(director, moving, 60);
    pushOperatorHitImpulse(director, { zone: 'head', severity: 1, incomingYawRadians: 0 });

    let sawReaction = false;
    for (let frame = 0; frame < 8; frame += 1) {
      const output = advanceOperatorAnimation(director, moving);
      expect(totalWeight(output.layers)).toBeCloseTo(1, 10);
      if (output.hitReaction.clipWeight > 0) {
        sawReaction = true;
        expect(output.additiveLayers.some((layer) => layer.clip.startsWith('HitRecieve'))).toBe(true);
        expect(output.hitReaction.clipWeight).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_WEIGHT);
      }
    }
    expect(sawReaction).toBe(true);

    const settled = run(director, moving, 200);
    expect(settled.hitReaction.clipWeight).toBe(0);
    expect(settled.additiveLayers).toHaveLength(0);
  });

  it('flinches less on the plated archetype than on the light one', () => {
    const peak = (skinId: string): number => {
      const director = createOperatorAnimationDirector(skinId, 'bot-1');
      pushOperatorHitImpulse(director, { zone: 'body', severity: 1, incomingYawRadians: 0 });
      let best = 0;
      for (let frame = 0; frame < 60; frame += 1) {
        best = Math.max(best, advanceOperatorAnimation(director, still).hitReaction.clipWeight);
      }
      return best;
    };
    expect(peak('symbiote')).toBeLessThan(peak('explorer'));
  });
});

describe('one shots', () => {
  it('return to nothing, which the shipped clamped one-shots never do', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    pushOperatorOneShot(director, 'melee');
    let peak = 0;
    const total = OPERATOR_ONE_SHOT_SHAPES.melee.riseSeconds + OPERATOR_ONE_SHOT_SHAPES.melee.decaySeconds;
    for (let frame = 0; frame < 200; frame += 1) {
      const output = advanceOperatorAnimation(director, still);
      peak = Math.max(peak, output.additiveLayers.find((layer) => layer.clip === 'Punch_Right')?.weight ?? 0);
    }
    expect(peak).toBeGreaterThan(0.3);
    expect(peak).toBeLessThan(1);
    expect(total).toBeLessThan(1);
    expect(advanceOperatorAnimation(director, still).additiveLayers).toHaveLength(0);
  });

  it('restarts rather than stacking when retriggered', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    pushOperatorOneShot(director, 'fire');
    advanceOperatorAnimation(director, still);
    pushOperatorOneShot(director, 'fire');
    expect(director.oneShots).toHaveLength(1);
    expect(director.oneShots[0]!.ageSeconds).toBe(0);
  });

  it('is why the layer exists: three keeps a clamped action mixed forever', () => {
    // Evidence for the audit, pinned as a test so it cannot rot. `playOneShot`
    // in the operator runtime sets clampWhenFinished with no 'finished'
    // listener and no fade-out, so the action stays enabled at full weight
    // after it ends and keeps averaging into every later pose.
    const root = new THREE.Object3D();
    root.name = 'evidence';
    const clip = new THREE.AnimationClip('once', 0.2, [
      new THREE.NumberKeyframeTrack('.scale[x]', [0, 0.2], [1, 2]),
    ]);
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (let frame = 0; frame < 60; frame += 1) mixer.update(1 / 60);
    expect(action.isRunning()).toBe(false);
    expect(action.enabled).toBe(true);
    expect(action.getEffectiveWeight()).toBe(1);
  });
});

describe('turn in place', () => {
  it('enters a pivot only while stationary and leaves once aligned', () => {
    const director = createOperatorAnimationDirector('navalops', 'bot-1');
    run(director, still, 20);
    let yawError = 2.2;
    let output = advanceOperatorAnimation(director, { ...still, yawErrorRadians: yawError });
    for (let frame = 0; frame < 12; frame += 1) {
      yawError -= output.aim.bodyYawDeltaRadians;
      output = advanceOperatorAnimation(director, { ...still, yawErrorRadians: yawError });
    }
    expect(output.state).toBe('turn');
    expect(output.aim.turning).not.toBe(0);

    for (let frame = 0; frame < 200; frame += 1) {
      yawError -= output.aim.bodyYawDeltaRadians;
      output = advanceOperatorAnimation(director, { ...still, yawErrorRadians: yawError });
    }
    expect(output.aim.turning).toBe(0);
    expect(output.state).toBe('idle');
  });
});

describe('death', () => {
  it('is terminal - nothing re-targets a corpse', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    const dead = run(director, { ...still, dead: true }, 40);
    expect(dead.state).toBe('death');
    expect(dead.layers).toEqual([{ clip: 'Death', weight: 1, timeScale: 1 }]);

    const revived = run(director, { ...still, forwardMps: 6, dead: false }, 60);
    expect(revived.state).toBe('death');
    expect(totalWeight(revived.layers)).toBeCloseTo(1, 10);
  });
});

describe('per-skin differentiation', () => {
  it('produces visibly different output for two archetypes on identical input', () => {
    const inputs = script(120);
    const play = (skinId: string): OperatorAnimationOutput[] => {
      const director = createOperatorAnimationDirector(skinId, 'bot-1');
      return inputs.map((input) => advanceOperatorAnimation(director, input));
    };
    const symbiote = play('symbiote');
    const explorer = play('explorer');
    expect(symbiote).not.toEqual(explorer);
    expect(symbiote[0]!.posture).not.toEqual(explorer[0]!.posture);
    const differing = symbiote.filter((output, index) => (
      output.aim.aimPitchRadians !== explorer[index]!.aim.aimPitchRadians
    ));
    expect(differing.length).toBeGreaterThan(inputs.length / 2);
  });

  it('shares the clip corpus, because the catalog rig contract requires it', () => {
    const inputs = script(80);
    const clipsFor = (skinId: string): Set<string> => {
      const director = createOperatorAnimationDirector(skinId, 'bot-1');
      const seen = new Set<string>();
      for (const input of inputs) {
        for (const layer of advanceOperatorAnimation(director, input).layers) seen.add(layer.clip);
      }
      return seen;
    };
    const symbiote = clipsFor('symbiote');
    const navalops = clipsFor('navalops');
    // Locomotion clips are shared by contract; only the idle preference differs.
    for (const clip of ['Walk', 'Run_Shoot']) {
      expect(symbiote.has(clip)).toBe(true);
      expect(navalops.has(clip)).toBe(true);
    }
  });
});

describe('determinism', () => {
  it('reproduces the entire output stream for identical inputs', () => {
    const inputs = script(300);
    const play = (): OperatorAnimationOutput[] => {
      const director = createOperatorAnimationDirector('navalops', 'bot-7');
      return inputs.map((input, index) => {
        if (index % 37 === 0) pushOperatorHitImpulse(director, { zone: 'body', severity: 0.7, incomingYawRadians: index });
        if (index % 23 === 0) pushOperatorOneShot(director, 'fire');
        return advanceOperatorAnimation(director, input);
      });
    };
    expect(play()).toEqual(play());
  });

  it('clamps a stalled frame so a recovered tab does not teleport the blend', () => {
    const director = createOperatorAnimationDirector('default', 'bot-1');
    run(director, still, 30);
    const output = advanceOperatorAnimation(director, { ...still, forwardMps: 6, deltaSeconds: 12 });
    // A 12 s delta must not complete a 0.16 s cross-fade in one step.
    expect(output.layers.some((layer) => layer.clip === 'Idle_Gun_Pointing')).toBe(true);
  });
});
