/**
 * Source 49 — MotionBricks: critically-damped constraint placement and the
 * rolling motion context. THE NEURAL PLANNER IS NOT RUN.
 *
 * Read the limitation before the title is believed. motion-bricks.cpp is a
 * C++23/GGML native library with no WebAssembly target — `docs/IMPLEMENTATION.md`
 * lists "WebAssembly inference in the browser" under "Explicitly deferred", and
 * a stated deferral is stronger than an inferred absence. Its released model
 * supports only the 34-joint Unitree G1 robot skeleton, and its 183M parameters
 * (~0.73 GB of GGUF) are not present on this machine. It is an OFFLINE clip
 * bakery; `THREE.AnimationMixer` plus our own blend graph stays the runtime.
 * Licence: port Apache-2.0, weights NVIDIA Open Model License (revocable).
 *
 * So this exhibit does NOT generate motion and must never be read as doing so.
 * What it demonstrates is the planner's SCAFFOLD, which is ordinary published
 * control and is the part that would still be ours if the network were bolted
 * in tomorrow:
 *   - target pose constraints are PLACED by a critically-damped spring
 *     (zeta = 1: fastest approach with no overshoot), not snapped or lerped;
 *   - the last N frames of ACTUAL motion are the context for what comes next,
 *     and the produced frames become the next context — a rolling window.
 *
 * BEFORE is the same targets applied by a naive linear snap: it arrives, but it
 * arrives with a corner on it. AFTER is the spring. The difference is visible
 * in the traced path and is assertable as an overshoot number.
 */

import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

export type SpringState = { value: number; velocity: number };

/**
 * Critically damped spring step. Exported so a CPU check can assert that it
 * converges and never overshoots, which is the property the technique needs.
 */
export function stepCriticallyDamped(
  state: SpringState,
  target: number,
  halfLife: number,
  dt: number,
): SpringState {
  const omega = 2 * Math.LN2 / Math.max(1e-4, halfLife);
  const displacement = state.value - target;
  const acceleration = -omega * omega * displacement - 2 * omega * state.velocity;
  const velocity = state.velocity + acceleration * dt;
  return { value: state.value + velocity * dt, velocity };
}

/** The rolling context: the newest frames push the oldest out. */
export class MotionContext {
  private readonly frames: number[][] = [];

  constructor(private readonly capacity: number) {}

  push(frame: number[]): void {
    this.frames.push(frame);
    while (this.frames.length > this.capacity) this.frames.shift();
  }

  get length(): number {
    return this.frames.length;
  }

  /** The context the planner would be handed: the last `capacity` frames. */
  snapshot(): number[][] {
    return this.frames.map((frame) => [...frame]);
  }
}

const CONTEXT_FRAMES = 4;
const JOINTS = 5;
const TARGETS = [-0.55, 0.5, -0.3, 0.62, 0.0];

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-49-constraint-placement-scaffold';
  const { before, after } = beforeAfterPanels(THREE, 3.0);

  // A deliberately schematic articulated chain. It is NOT the G1 skeleton and
  // NOT our 62-joint operator rig; it is five hinges so the placement is legible.
  function buildChain(group: import('three').Group, colour: number) {
    const segments: import('three').Mesh[] = [];
    const geometry = new THREE.BoxGeometry(0.07, 0.34, 0.07);
    geometry.translate(0, 0.17, 0);
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6 });
    let parent: import('three').Object3D = group;
    for (let i = 0; i < JOINTS; i += 1) {
      const pivot = new THREE.Group();
      pivot.name = `joint-${i}`;
      pivot.position.y = i === 0 ? 0 : 0.34;
      const segment = new THREE.Mesh(geometry, material);
      segment.name = `segment-${i}`;
      pivot.add(segment);
      parent.add(pivot);
      parent = pivot;
      segments.push(segment);
    }
    return segments;
  }

  buildChain(before, 0x8a6f6f);
  buildChain(after, 0x6f8a85);

  const snapState: number[] = new Array(JOINTS).fill(0);
  const springState: SpringState[] = Array.from({ length: JOINTS }, () => ({
    value: 0,
    velocity: 0,
  }));

  const motionContext = new MotionContext(CONTEXT_FRAMES);
  motionContext.push(new Array(JOINTS).fill(0));

  let elapsed = 0;
  let peakSnapOvershoot = 0;
  let peakSpringOvershoot = 0;
  let planningWindows = 0;

  return {
    root: (() => {
      root.add(before, after);
      return root;
    })(),
    update: (_time: number, dt: number) => {
      elapsed += dt;
      // A new target constraint every 1.6 s, alternating sign — the "sampled
      // from a short reference style clip" step, stubbed with a fixed table.
      const phase = Math.floor(elapsed / 1.6) % 2 === 0 ? 1 : -1;

      for (let joint = 0; joint < JOINTS; joint += 1) {
        const target = TARGETS[joint] * phase;

        // BEFORE: naive placement. A fixed fraction per frame, which is
        // frame-rate dependent and arrives with a corner.
        const snapped = snapState[joint] + (target - snapState[joint]) * Math.min(1, dt * 14);
        snapState[joint] = snapped;
        peakSnapOvershoot = Math.max(
          peakSnapOvershoot,
          Math.max(0, Math.abs(snapped) - Math.abs(target)),
        );

        // AFTER: critically damped placement.
        springState[joint] = stepCriticallyDamped(springState[joint], target, 0.22, dt);
        peakSpringOvershoot = Math.max(
          peakSpringOvershoot,
          Math.max(0, Math.abs(springState[joint].value) - Math.abs(target)),
        );
      }

      const applyChain = (group: import('three').Group, values: number[]) => {
        let node: import('three').Object3D | undefined = group;
        for (let joint = 0; joint < JOINTS; joint += 1) {
          node = node?.getObjectByName(`joint-${joint}`) ?? undefined;
          if (!node) break;
          node.rotation.z = values[joint];
        }
      };
      applyChain(before, snapState);
      applyChain(after, springState.map((state) => state.value));

      // The rolling context: what was just produced becomes the context for
      // the next window. This is the autoregressive shape of the planner, with
      // the network replaced by the spring.
      motionContext.push(springState.map((state) => state.value));
      planningWindows += 1;
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 49,
      title: 'Critically-damped constraint placement with a rolling motion context',
      method:
        'Target pose constraints are placed by a critically-damped spring (zeta = 1, half-life '
        + 'parameterised) so the chain converges fast without overshoot, while the last four '
        + 'produced frames are retained as the context the next window would be planned from. '
        + 'The before panel applies identical targets with a naive per-frame fraction.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/jichiep/status/2095157236658315288',
        'https://github.com/localai-org/motion-bricks.cpp',
      ],
      limitation:
        'NO MOTION IS GENERATED. The MotionBricks network is not run, not present and cannot run '
        + 'here: it is native C++/GGML with WebAssembly inference EXPLICITLY DEFERRED upstream, '
        + 'its ~0.73 GB of weights are not installed, and it is an offline clip bakery by design. '
        + 'This is the placement-and-context scaffold only, with the network absent — it must '
        + 'never be reported as a measurement of the generator. The chain is five schematic '
        + 'hinges, NOT the 34-joint Unitree G1 skeleton the released model requires and NOT the '
        + 'repository\'s 62-joint operator rig; no retarget is attempted or claimed, and the G1 '
        + 'retarget risk the register records (ankle pitch/roll instead of a toe base, no '
        + 'fingers, 1.32 m stature) is untested. No .mbstyle primitive is present or shipped.',
      localLights: [],
      counters: {
        joints: JOINTS,
        contextFrames: CONTEXT_FRAMES,
        contextHeld: motionContext.length,
        planningWindows,
        peakSnapOvershoot: Math.round(peakSnapOvershoot * 1000) / 1000,
        peakSpringOvershoot: Math.round(peakSpringOvershoot * 1000) / 1000,
        meshes: countDraws(root).meshes,
      },
    },
  };
}

export default createDemo;
