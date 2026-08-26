/**
 * Pass 77 / HF-375. A generic, deterministic cross-fade graph over named
 * animation STATES (not clips - a state may resolve to a whole blend space).
 *
 * The operator runtime it is written for changes pose by calling `fadeIn(0.14)`
 * on the next action and `fadeOut(0.14)` on the previous one: one hard-coded
 * duration for every transition, and nothing that guarantees the blended weights
 * add up to one while both are in flight. Interrupting a fade half way through
 * leaves the mixer averaging several partly-faded actions with no bound on how
 * many, which is exactly how a rig ends up looking like it is wading.
 *
 * This module owns that arithmetic instead, with three properties the tests pin:
 *   - the emitted weights always sum to exactly 1 (within float epsilon);
 *   - the incoming state's weight is monotonically non-decreasing and every
 *     outgoing state's weight is monotonically non-increasing, so a transition
 *     can never visibly reverse;
 *   - the same inputs always produce the same weights - no clock reads, no
 *     randomness - so networked peers and replays agree.
 *
 * Time is passed in as a delta. Nothing here touches THREE; the caller applies
 * the resulting weights to whatever actions back each state.
 */

/** A transition key is `from->to`; `*->to` matches any origin. */
export type BlendTransitionTable = Readonly<Record<string, number>>;

export type BlendGraphDefinition = Readonly<{
  /** Used when neither `from->to` nor `*->to` is listed. */
  defaultTransitionS: number;
  /** Hard ceiling on simultaneously mixed states, so mixer cost stays bounded. */
  maximumLayers: number;
  transitions: BlendTransitionTable;
}>;

export type BlendLayer = Readonly<{ state: string; weight: number }>;

type ResidualShare = { state: string; share: number };

export type BlendGraphState = {
  target: string;
  /** Target weight at the instant the current transition began. */
  startWeight: number;
  /** Outgoing states and their fixed share of the remaining `1 - targetWeight`. */
  residual: ResidualShare[];
  transitionS: number;
  elapsedS: number;
  readonly definition: BlendGraphDefinition;
};

/** Transitions longer than this are authoring mistakes, not slow blends. */
export const MAXIMUM_BLEND_TRANSITION_S = 2;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Smoothstep rather than a linear ramp: a linear cross-fade lands with a
 * velocity discontinuity that reads as a pop on short transitions. Smoothstep is
 * strictly increasing on [0,1], so it preserves the monotonicity guarantee.
 */
function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function blendTransitionSeconds(definition: BlendGraphDefinition, from: string, to: string): number {
  const exact = definition.transitions[`${from}->${to}`];
  const wildcard = definition.transitions[`*->${to}`];
  const chosen = Number.isFinite(exact) ? exact! : Number.isFinite(wildcard) ? wildcard! : definition.defaultTransitionS;
  return Math.min(MAXIMUM_BLEND_TRANSITION_S, Math.max(0, finiteOr(chosen, 0)));
}

export function createBlendGraph(definition: BlendGraphDefinition, initialState: string): BlendGraphState {
  return {
    target: initialState,
    startWeight: 1,
    residual: [],
    transitionS: 0,
    elapsedS: 0,
    definition: Object.freeze({
      defaultTransitionS: Math.max(0, finiteOr(definition.defaultTransitionS, 0.15)),
      maximumLayers: Math.max(2, Math.trunc(finiteOr(definition.maximumLayers, 3))),
      transitions: definition.transitions,
    }),
  };
}

function targetWeightNow(state: BlendGraphState): number {
  if (state.transitionS <= 0) return 1;
  return clamp01(state.startWeight + (1 - state.startWeight) * smoothstep(state.elapsedS / state.transitionS));
}

/**
 * Current weights WITHOUT advancing the clock. The target holds
 * `targetWeightNow` and the outgoing states split the exact remainder by their
 * fixed shares, so the sum is 1 by construction rather than by rounding.
 */
export function blendGraphLayers(state: BlendGraphState): readonly BlendLayer[] {
  const target = targetWeightNow(state);
  const remainder = 1 - target;
  return Object.freeze([
    { state: state.target, weight: target },
    ...state.residual.map((entry) => ({ state: entry.state, weight: remainder * entry.share })),
  ]);
}

export function blendGraphWeight(state: BlendGraphState, name: string): number {
  let total = 0;
  for (const layer of blendGraphLayers(state)) if (layer.state === name) total += layer.weight;
  return total;
}

/**
 * Prunes layers too light to be worth a bound action and hands their weight to
 * the heaviest survivor, so the sum stays exactly 1. Offered separately from the
 * core graph because pruning trades the per-layer monotonicity guarantee for a
 * smaller mixer, and only the caller knows which it needs.
 */
export function significantBlendLayers(layers: readonly BlendLayer[], minimumWeight: number): readonly BlendLayer[] {
  const floor = Math.max(0, finiteOr(minimumWeight, 0));
  const kept = layers.filter((layer) => layer.weight >= floor);
  if (kept.length === 0 || kept.length === layers.length) return layers;
  const surrendered = layers.reduce((total, layer) => total + (layer.weight >= floor ? 0 : layer.weight), 0);
  let heaviest = 0;
  for (let index = 1; index < kept.length; index += 1) {
    const candidate = kept[index]!;
    const incumbent = kept[heaviest]!;
    if (candidate.weight > incumbent.weight
      || (candidate.weight === incumbent.weight && candidate.state.localeCompare(incumbent.state) < 0)) heaviest = index;
  }
  return Object.freeze(kept.map((layer, index) => (
    index === heaviest ? { state: layer.state, weight: layer.weight + surrendered } : layer
  )));
}

/**
 * Retargets the graph. Requesting the state that is already the target is a
 * no-op: restarting an in-flight fade to the same destination every frame is
 * what makes a blend stall forever when gameplay re-asserts its intent.
 */
export function requestBlendTarget(state: BlendGraphState, next: string, overrideTransitionS?: number): void {
  if (next === state.target) return;
  const current = blendGraphLayers(state);
  const startWeight = clamp01(current.find((layer) => layer.state === next)?.weight ?? 0);
  const outgoing = current
    .filter((layer) => layer.state !== next && layer.weight > 0)
    .map((layer) => ({ state: layer.state, weight: layer.weight }))
    // Deterministic ordering: heaviest first, ties broken by name so two peers
    // that reached the same weights drop the same layer.
    .sort((left, right) => (right.weight - left.weight) || left.state.localeCompare(right.state));

  const keep = outgoing.slice(0, Math.max(0, state.definition.maximumLayers - 1));
  const droppedWeight = outgoing.slice(keep.length).reduce((total, layer) => total + layer.weight, 0);
  const keptWeight = keep.reduce((total, layer) => total + layer.weight, 0);
  // Anything past the layer budget is surrendered to the incoming state, which
  // keeps the sum at 1 without letting a stale pose linger at a fixed weight.
  const effectiveStart = clamp01(startWeight + droppedWeight);

  state.residual = 1 - effectiveStart > 0 && keptWeight > 0
    ? keep.map((layer) => ({ state: layer.state, share: layer.weight / keptWeight }))
    : [];
  state.startWeight = effectiveStart;
  state.transitionS = state.residual.length === 0
    ? 0
    : Math.min(
      MAXIMUM_BLEND_TRANSITION_S,
      Math.max(0, finiteOr(overrideTransitionS ?? Number.NaN, blendTransitionSeconds(state.definition, state.target, next))),
    );
  state.elapsedS = 0;
  state.target = next;
}

/** Advances the transition clock and returns the resulting layer weights. */
export function advanceBlendGraph(state: BlendGraphState, deltaSeconds: number): readonly BlendLayer[] {
  const dt = Math.max(0, finiteOr(deltaSeconds, 0));
  if (state.transitionS > 0) state.elapsedS = Math.min(state.transitionS, state.elapsedS + dt);
  if (state.transitionS <= 0 || state.elapsedS >= state.transitionS) {
    // Settled: collapse to a single layer so the caller can release actions.
    state.startWeight = 1;
    state.residual = [];
    state.transitionS = 0;
    state.elapsedS = 0;
  }
  return blendGraphLayers(state);
}

export function blendGraphSettled(state: BlendGraphState): boolean {
  return state.residual.length === 0 && state.transitionS <= 0;
}
