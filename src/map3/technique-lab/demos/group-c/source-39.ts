/**
 * Source 39 — engine-native level generation over an MCP bridge.
 *
 * Canonical: NONE. No repository, no released bridge, no licence, for either
 * instance the register records. So there is no implementation to inspect and
 * nothing may be claimed about one.
 *
 * The atom that IS recoverable from the descriptions: the agent does not
 * generate engine-independent code, it drives the engine's own authoring tools,
 * and level generation becomes an ORDERED SEQUENCE OF EDITOR OPERATIONS. That
 * is a tool/harness technique, so this exhibit ships the actual artifact — a
 * typed operation schema and a deterministic replayer — and then shows the
 * before/after that makes the difference legible: BEFORE is the empty editor
 * state, AFTER is the scene the operation log produced. The log is data, so it
 * is inspectable, diffable and replayable; that is the whole claim.
 *
 * The register's caveat is carried into the limitation below and must not be
 * lost: both source demos lean on their host engine's asset libraries
 * (Megascans), so neither is evidence that procedural-from-nothing is faster.
 */

import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

/** The artifact: one operation an agent could issue across a bridge. */
export type EditorOperation =
  | { op: 'create_terrain'; extent: number; segments: number; relief: number }
  | { op: 'scatter_props'; kind: 'rock' | 'shrub'; count: number; clearRadius: number }
  | { op: 'carve_clearing'; x: number; z: number; radius: number }
  | { op: 'place_trigger'; x: number; z: number; radius: number };

export type ReplayState = {
  terrain: { extent: number; segments: number; relief: number } | null;
  clearings: Array<{ x: number; z: number; radius: number }>;
  props: Array<{ kind: 'rock' | 'shrub'; x: number; z: number; scale: number }>;
  triggers: Array<{ x: number; z: number; radius: number }>;
  applied: number;
  rejected: Array<{ op: string; reason: string }>;
};

/**
 * The replayer. It is deliberately strict: an operation that arrives before its
 * precondition is REJECTED with a reason rather than silently reordered, which
 * is what makes an operation log auditable instead of merely suggestive.
 */
export function replay(operations: readonly EditorOperation[], seed: number): ReplayState {
  const rng = createRng(seed);
  const state: ReplayState = {
    terrain: null,
    clearings: [],
    props: [],
    triggers: [],
    applied: 0,
    rejected: [],
  };

  for (const operation of operations) {
    if (operation.op !== 'create_terrain' && state.terrain === null) {
      state.rejected.push({ op: operation.op, reason: 'no terrain exists yet' });
      continue;
    }
    switch (operation.op) {
      case 'create_terrain':
        state.terrain = {
          extent: operation.extent,
          segments: operation.segments,
          relief: operation.relief,
        };
        break;
      case 'carve_clearing':
        state.clearings.push({ x: operation.x, z: operation.z, radius: operation.radius });
        break;
      case 'scatter_props': {
        const extent = state.terrain!.extent;
        for (let i = 0; i < operation.count; i += 1) {
          const x = (rng() - 0.5) * extent;
          const z = (rng() - 0.5) * extent;
          const blocked = state.clearings.some(
            (clearing) =>
              Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius + operation.clearRadius,
          );
          if (blocked) continue;
          state.props.push({
            kind: operation.kind,
            x,
            z,
            scale: 0.6 + rng() * 0.7,
          });
        }
        break;
      }
      case 'place_trigger':
        state.triggers.push({ x: operation.x, z: operation.z, radius: operation.radius });
        break;
    }
    state.applied += 1;
  }
  return state;
}

/** The log this exhibit replays; the same shape an agent would emit. */
export const OPERATION_LOG: readonly EditorOperation[] = [
  { op: 'scatter_props', kind: 'rock', count: 10, clearRadius: 0.1 },
  { op: 'create_terrain', extent: 3.0, segments: 40, relief: 0.16 },
  { op: 'carve_clearing', x: 0.35, z: -0.3, radius: 0.55 },
  { op: 'scatter_props', kind: 'shrub', count: 120, clearRadius: 0.04 },
  { op: 'scatter_props', kind: 'rock', count: 40, clearRadius: 0.06 },
  { op: 'place_trigger', x: 0.35, z: -0.3, radius: 0.4 },
];

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-39-editor-operation-log';
  const { before, after } = beforeAfterPanels(THREE, 3.4);

  const state = replay(OPERATION_LOG, seed);

  // BEFORE — the empty editor: the ground plane an author starts from.
  const emptyGeometry = new THREE.PlaneGeometry(3.0, 3.0, 1, 1);
  emptyGeometry.rotateX(-Math.PI / 2);
  before.add(
    new THREE.Mesh(
      emptyGeometry,
      new THREE.MeshStandardMaterial({ color: 0x3c3f42, roughness: 1, wireframe: false }),
    ),
  );

  // AFTER — only what the log produced, in the order it produced it.
  const terrain = state.terrain!;
  const terrainGeometry = new THREE.PlaneGeometry(
    terrain.extent,
    terrain.extent,
    terrain.segments,
    terrain.segments,
  );
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPosition = terrainGeometry.getAttribute('position');
  for (let i = 0; i < terrainPosition.count; i += 1) {
    const x = terrainPosition.getX(i);
    const z = terrainPosition.getZ(i);
    terrainPosition.setY(i, Math.sin(x * 2.3) * Math.cos(z * 1.9) * terrain.relief);
  }
  terrainGeometry.computeVertexNormals();
  after.add(
    new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({ color: 0x4d5136, roughness: 0.96 }),
    ),
  );

  const propGeometry = {
    rock: new THREE.DodecahedronGeometry(0.05, 0),
    shrub: new THREE.ConeGeometry(0.035, 0.12, 5),
  } as const;
  const propMaterial = {
    rock: new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 }),
    shrub: new THREE.MeshStandardMaterial({ color: 0x53703b, roughness: 0.9 }),
  } as const;

  for (const kind of ['rock', 'shrub'] as const) {
    const members = state.props.filter((prop) => prop.kind === kind);
    if (members.length === 0) continue;
    const mesh = new THREE.InstancedMesh(propGeometry[kind], propMaterial[kind], members.length);
    mesh.name = `scattered-${kind}`;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < members.length; i += 1) {
      const prop = members[i];
      const y = Math.sin(prop.x * 2.3) * Math.cos(prop.z * 1.9) * terrain.relief;
      position.set(prop.x, y + 0.03, prop.z);
      scale.setScalar(prop.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    after.add(mesh);
  }

  for (const trigger of state.triggers) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(trigger.radius * 0.86, trigger.radius, 24),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xcf7a2a,
        emissiveIntensity: 1.2,
        roughness: 0.6,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(trigger.x, 0.06, trigger.z);
    ring.name = 'trigger-volume';
    after.add(ring);
  }

  root.add(before, after);
  const draws = countDraws(root);

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 39,
      title: 'Level generation as a replayable editor-operation log',
      method:
        'The generator emits an ordered log of typed editor operations — create_terrain, '
        + 'carve_clearing, scatter_props, place_trigger — and a strict replayer applies them, '
        + 'rejecting any operation whose precondition is unmet rather than reordering it. The '
        + 'first log entry here deliberately arrives before its terrain and is refused, which is '
        + 'what makes the log auditable rather than merely suggestive.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/fabianofirmo/status/2094044844804993523',
        'https://x.com/Stefan_3D_AI',
      ],
      limitation:
        'There is NO MCP bridge here and none exists publicly: no repository, no released '
        + 'bridge, no licence for either source instance, so nothing about their implementation '
        + 'is claimed or reproduced. This is the engine-agnostic restatement of the atom only — '
        + 'no Unreal, no Unity, no editor, no agent, no tool-call transport and no docs wiring. '
        + 'Carried caveat: both source demos scatter Megascans library foliage, so neither is '
        + 'evidence that procedural-from-nothing is faster.',
      localLights: [],
      counters: {
        operationsIssued: OPERATION_LOG.length,
        operationsApplied: state.applied,
        operationsRejected: state.rejected.length,
        propsPlaced: state.props.length,
        instancedMeshes: draws.instancedMeshes,
      },
    },
  };
}

export default createDemo;
