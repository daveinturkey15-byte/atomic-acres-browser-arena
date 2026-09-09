import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_BLEND_TRANSITION_S,
  advanceBlendGraph,
  blendGraphLayers,
  blendGraphSettled,
  blendGraphWeight,
  blendTransitionSeconds,
  createBlendGraph,
  requestBlendTarget,
  significantBlendLayers,
  type BlendGraphDefinition,
  type BlendLayer,
} from './animation-blend-graph';

const definition: BlendGraphDefinition = Object.freeze({
  defaultTransitionS: 0.2,
  maximumLayers: 3,
  transitions: Object.freeze({
    'idle->locomotion': 0.16,
    'locomotion->idle': 0.26,
    '*->death': 0.06,
  }),
});

function totalWeight(layers: readonly BlendLayer[]): number {
  return layers.reduce((sum, layer) => sum + layer.weight, 0);
}

function weightOf(layers: readonly BlendLayer[], state: string): number {
  return layers.find((layer) => layer.state === state)?.weight ?? 0;
}

describe('blendTransitionSeconds', () => {
  it('prefers the exact pair, then the wildcard, then the default', () => {
    expect(blendTransitionSeconds(definition, 'idle', 'locomotion')).toBe(0.16);
    expect(blendTransitionSeconds(definition, 'locomotion', 'death')).toBe(0.06);
    expect(blendTransitionSeconds(definition, 'locomotion', 'turn')).toBe(0.2);
  });

  it('clamps hostile durations into the authored band', () => {
    const hostile: BlendGraphDefinition = {
      defaultTransitionS: 0.2,
      maximumLayers: 3,
      transitions: { 'a->b': -4, 'a->c': 90, 'a->d': Number.NaN },
    };
    expect(blendTransitionSeconds(hostile, 'a', 'b')).toBe(0);
    expect(blendTransitionSeconds(hostile, 'a', 'c')).toBe(MAXIMUM_BLEND_TRANSITION_S);
    expect(blendTransitionSeconds(hostile, 'a', 'd')).toBe(0.2);
  });
});

describe('blend weights', () => {
  it('sums to one on every frame of a transition', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    for (let frame = 0; frame < 60; frame += 1) {
      const layers = advanceBlendGraph(graph, 1 / 90);
      expect(totalWeight(layers)).toBeCloseTo(1, 12);
    }
  });

  it('sums to one across repeated interruptions', () => {
    const graph = createBlendGraph(definition, 'idle');
    const script = ['locomotion', 'turn', 'idle', 'locomotion', 'idle', 'turn', 'locomotion'];
    let step = 0;
    for (const target of script) {
      requestBlendTarget(graph, target);
      // Interrupt part way through, never at a settled boundary.
      for (let frame = 0; frame < 4; frame += 1) {
        const layers = advanceBlendGraph(graph, 0.011 + (step % 3) * 0.004);
        expect(totalWeight(layers)).toBeCloseTo(1, 12);
        step += 1;
      }
    }
  });

  it('never exceeds the layer budget', () => {
    const graph = createBlendGraph(definition, 'idle');
    for (const target of ['locomotion', 'turn', 'death', 'idle', 'locomotion']) {
      requestBlendTarget(graph, target);
      const layers = advanceBlendGraph(graph, 0.004);
      expect(layers.length).toBeLessThanOrEqual(definition.maximumLayers);
      expect(totalWeight(layers)).toBeCloseTo(1, 12);
    }
  });
});

describe('monotonicity', () => {
  it('raises the incoming state and lowers every outgoing state without reversing', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    let previousIncoming = weightOf(blendGraphLayers(graph), 'locomotion');
    let previousOutgoing = weightOf(blendGraphLayers(graph), 'idle');
    for (let frame = 0; frame < 40; frame += 1) {
      const layers = advanceBlendGraph(graph, 0.006);
      const incoming = weightOf(layers, 'locomotion');
      const outgoing = weightOf(layers, 'idle');
      expect(incoming).toBeGreaterThanOrEqual(previousIncoming - 1e-12);
      expect(outgoing).toBeLessThanOrEqual(previousOutgoing + 1e-12);
      previousIncoming = incoming;
      previousOutgoing = outgoing;
    }
    expect(previousIncoming).toBe(1);
    expect(previousOutgoing).toBe(0);
  });

  it('keeps the new target monotonic when a transition is interrupted mid-flight', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    advanceBlendGraph(graph, 0.05);
    const beforeInterrupt = weightOf(blendGraphLayers(graph), 'locomotion');
    expect(beforeInterrupt).toBeGreaterThan(0);
    expect(beforeInterrupt).toBeLessThan(1);

    requestBlendTarget(graph, 'turn');
    let previous = weightOf(blendGraphLayers(graph), 'turn');
    for (let frame = 0; frame < 40; frame += 1) {
      const layers = advanceBlendGraph(graph, 0.006);
      const turn = weightOf(layers, 'turn');
      expect(turn).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = turn;
    }
    expect(previous).toBe(1);
  });

  it('resumes from the weight a re-requested state already held', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    advanceBlendGraph(graph, 0.08);
    requestBlendTarget(graph, 'idle');
    const resumed = weightOf(blendGraphLayers(graph), 'idle');
    // idle was still partly weighted, so the fade back starts from there and not
    // from zero - that is what stops a flicker under rapid direction changes.
    expect(resumed).toBeGreaterThan(0);
    expect(resumed).toBeLessThan(1);
  });
});

describe('retargeting', () => {
  it('ignores a request for the state already targeted', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    advanceBlendGraph(graph, 0.08);
    const midway = weightOf(blendGraphLayers(graph), 'locomotion');
    requestBlendTarget(graph, 'locomotion');
    expect(weightOf(blendGraphLayers(graph), 'locomotion')).toBe(midway);
  });

  it('settles a zero-duration transition immediately', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'death', 0);
    const layers = advanceBlendGraph(graph, 0);
    expect(layers).toEqual([{ state: 'death', weight: 1 }]);
    expect(blendGraphSettled(graph)).toBe(true);
  });

  it('reports a single settled layer once the transition completes', () => {
    const graph = createBlendGraph(definition, 'idle');
    requestBlendTarget(graph, 'locomotion');
    for (let frame = 0; frame < 30; frame += 1) advanceBlendGraph(graph, 0.01);
    expect(blendGraphSettled(graph)).toBe(true);
    expect(blendGraphWeight(graph, 'locomotion')).toBe(1);
    expect(blendGraphWeight(graph, 'idle')).toBe(0);
  });
});

describe('determinism', () => {
  it('produces identical weights for identical input sequences', () => {
    const script: readonly (readonly [string, number])[] = [
      ['locomotion', 0.008], ['locomotion', 0.017], ['turn', 0.005], ['turn', 0.021],
      ['idle', 0.013], ['idle', 0.004], ['death', 0.009], ['death', 0.033],
    ];
    const run = (): unknown[] => {
      const graph = createBlendGraph(definition, 'idle');
      return script.map(([target, dt]) => {
        requestBlendTarget(graph, target);
        return advanceBlendGraph(graph, dt);
      });
    };
    expect(run()).toEqual(run());
  });
});

describe('significantBlendLayers', () => {
  it('drops negligible layers and keeps the sum at one', () => {
    const layers: readonly BlendLayer[] = [
      { state: 'locomotion', weight: 0.97 },
      { state: 'idle', weight: 0.02 },
      { state: 'turn', weight: 0.01 },
    ];
    const pruned = significantBlendLayers(layers, 0.05);
    expect(pruned).toHaveLength(1);
    expect(totalWeight(pruned)).toBeCloseTo(1, 12);
    expect(pruned[0]!.state).toBe('locomotion');
  });

  it('returns the input untouched when nothing is negligible', () => {
    const layers: readonly BlendLayer[] = [{ state: 'a', weight: 0.6 }, { state: 'b', weight: 0.4 }];
    expect(significantBlendLayers(layers, 0.05)).toBe(layers);
  });
});
