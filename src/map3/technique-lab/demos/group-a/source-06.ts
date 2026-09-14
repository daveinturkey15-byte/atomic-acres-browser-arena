/**
 * Source 6 — Image to procedural Three.js model (`img2threejs/img2threejs`).
 *
 * Read at pin `d6673386f89673a58736f8d398dd16ece67874f5`, `docs/ARCHITECTURE.md`:
 *   :9      "a staged sculpting pipeline. Scripts gate each stage"
 *   :13-17  reference image -> probe and suitability gate -> ObjectSculptSpec
 *           (components, materials, sockets)
 *   :67-72  the gates, of which the load-bearing one is **Action-ready**:
 *           "the model exposes a runtime hierarchy (pivots, sockets, colliders,
 *            destruction groups) via `root.userData.sculptRuntime`"
 *   :88-89  pass-gated generation; a strict-quality gate blocks shallow specs
 *           before a single line of Three.js is generated
 *   :133-134 output is an ObjectSculptSpec JSON plus a TypeScript
 *           `createObjectNameModel(spec, options)` returning a `THREE.Group`
 *
 * Licence at that pin: Apache-2.0 (LICENSE read, 11,337 bytes).
 *
 * The reusable atom is not "generate a mesh from a picture" — it is the CONTRACT
 * that makes a generated prop usable in a game: a declared spec, a `sculptRuntime`
 * runtime hierarchy, and a gate that refuses the model when the contract is not
 * met. This demo builds one hard-surface prop (a jerry can) from a spec written
 * here, exposes `userData.sculptRuntime` in the upstream shape, and runs the
 * action-ready gate over it.
 *
 * BEFORE: the same silhouette with no spec, no sockets, no colliders and no
 * destruction groups — a mesh that looks finished and cannot be used. Its gate
 * report fails, and the failure is in the metadata rather than in prose.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeDataTexture,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

interface ComponentSpec {
  name: string;
  size: [number, number, number];
  at: [number, number, number];
  material: 'steel' | 'rubber' | 'paint';
  destructionGroup: string;
}

interface SocketSpec {
  name: string;
  at: [number, number, number];
  /** Local +Z of the socket, so an attachment inherits an orientation, not just a point. */
  aim: [number, number, number];
}

/** The ObjectSculptSpec, in the shape the upstream stage-2 author step produces. */
const SPEC = {
  objectName: 'field-jerry-can',
  declaredMetres: [0.34, 0.46, 0.17] as [number, number, number],
  components: [
    { name: 'body', size: [0.3, 0.38, 0.15], at: [0, 0.19, 0], material: 'paint', destructionGroup: 'shell' },
    { name: 'rib-left', size: [0.03, 0.3, 0.16], at: [-0.09, 0.2, 0], material: 'steel', destructionGroup: 'shell' },
    { name: 'rib-right', size: [0.03, 0.3, 0.16], at: [0.09, 0.2, 0], material: 'steel', destructionGroup: 'shell' },
    { name: 'spout', size: [0.07, 0.08, 0.07], at: [0.1, 0.42, 0], material: 'steel', destructionGroup: 'spout' },
    { name: 'handle-bar', size: [0.26, 0.03, 0.04], at: [0, 0.42, 0], material: 'steel', destructionGroup: 'handle' },
    { name: 'foot', size: [0.32, 0.02, 0.17], at: [0, 0.01, 0], material: 'rubber', destructionGroup: 'shell' },
  ] as ComponentSpec[],
  sockets: [
    { name: 'grip', at: [0, 0.44, 0], aim: [0, 1, 0] },
    { name: 'pour', at: [0.13, 0.45, 0], aim: [1, 0.3, 0] },
    { name: 'ground', at: [0, 0, 0], aim: [0, -1, 0] },
  ] as SocketSpec[],
  colliders: [{ name: 'body-box', half: [0.17, 0.23, 0.09], at: [0, 0.23, 0] }],
  budgets: { maxTriangles: 900, maxDrawables: 8, maxTextureSize: 64 },
};

interface SculptRuntime {
  nodes: Record<string, THREE_NS.Object3D>;
  sockets: Record<string, THREE_NS.Object3D>;
  colliders: Array<{ name: string; half: [number, number, number]; at: [number, number, number] }>;
  destructionGroups: Record<string, string[]>;
}

const MATERIAL_TINT = { steel: 0x9aa0a6, rubber: 0x2b2b2d, paint: 0x3f5d3a } as const;

function buildFromSpec(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  withRuntime: boolean,
): { group: THREE_NS.Group; runtime: SculptRuntime | null } {
  const group = new THREE.Group();
  group.name = SPEC.objectName;

  // Procedural scuff map — generated, never fetched, so the prop stays code-only.
  const scuff = makeDataTexture(THREE, registry, 32, (x, y, out) => {
    const n = ((x * 7 + y * 13) % 17) / 17;
    const v = 150 + Math.round(n * 70);
    out[0] = v;
    out[1] = v;
    out[2] = v;
  });

  const materials = new Map<string, THREE_NS.MeshStandardMaterial>();
  const materialFor = (kind: ComponentSpec['material']) => {
    let m = materials.get(kind);
    if (!m) {
      m = registry.track(
        new THREE.MeshStandardMaterial({
          color: MATERIAL_TINT[kind],
          roughness: kind === 'steel' ? 0.38 : kind === 'rubber' ? 0.95 : 0.72,
          metalness: kind === 'steel' ? 0.85 : 0.02,
          roughnessMap: scuff,
        }),
      );
      materials.set(kind, m);
    }
    return m;
  };

  const nodes: Record<string, THREE_NS.Object3D> = {};
  const destructionGroups: Record<string, string[]> = {};
  for (const component of SPEC.components) {
    const geometry = registry.track(new THREE.BoxGeometry(...component.size));
    const mesh = new THREE.Mesh(geometry, materialFor(component.material));
    mesh.name = component.name;
    mesh.position.set(...component.at);
    group.add(mesh);
    nodes[component.name] = mesh;
    (destructionGroups[component.destructionGroup] ||= []).push(component.name);
  }

  if (!withRuntime) return { group, runtime: null };

  const sockets: Record<string, THREE_NS.Object3D> = {};
  for (const socket of SPEC.sockets) {
    const object = new THREE.Object3D();
    object.name = `socket:${socket.name}`;
    object.position.set(...socket.at);
    object.lookAt(
      socket.at[0] + socket.aim[0],
      socket.at[1] + socket.aim[1],
      socket.at[2] + socket.aim[2],
    );
    group.add(object);
    sockets[socket.name] = object;
  }

  const runtime: SculptRuntime = {
    nodes,
    sockets,
    colliders: SPEC.colliders as SculptRuntime['colliders'],
    destructionGroups,
  };
  group.userData.sculptRuntime = runtime;
  return { group, runtime };
}

/** The action-ready gate from ARCHITECTURE.md:72, run here rather than described. */
export function actionReadyGate(
  group: THREE_NS.Object3D,
  measured: { triangles: number; drawables: number },
): { pass: boolean; failures: string[] } {
  const failures: string[] = [];
  const runtime = group.userData?.sculptRuntime as SculptRuntime | undefined;
  if (!runtime) failures.push('no root.userData.sculptRuntime');
  else {
    if (Object.keys(runtime.sockets).length === 0) failures.push('no sockets');
    if (runtime.colliders.length === 0) failures.push('no colliders');
    if (Object.keys(runtime.destructionGroups).length < 2) failures.push('fewer than two destruction groups');
    if (Object.keys(runtime.nodes).length === 0) failures.push('no named nodes');
  }
  if (measured.triangles > SPEC.budgets.maxTriangles) failures.push('triangle budget exceeded');
  if (measured.drawables > SPEC.budgets.maxDrawables) failures.push('drawable budget exceeded');
  return { pass: failures.length === 0, failures };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const ungated = buildFromSpec(THREE, registry, false);
  const gated = buildFromSpec(THREE, registry, true);
  ungated.group.name = 'before:mesh-only-no-sculpt-runtime';
  gated.group.name = 'after:spec-plus-sculptRuntime';

  const beforeReport = actionReadyGate(ungated.group, {
    triangles: countTriangles(ungated.group),
    drawables: countDrawables(ungated.group),
  });
  const afterReport = actionReadyGate(gated.group, {
    triangles: countTriangles(gated.group),
    drawables: countDrawables(gated.group),
  });

  // Attach something to the declared socket, which is the point of having one.
  const probeGeometry = registry.track(new THREE.ConeGeometry(0.03, 0.12, 8));
  const probeMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0xd8a13a, roughness: 0.4 }));
  const probe = new THREE.Mesh(probeGeometry, probeMaterial);
  probe.name = 'socket-probe';
  gated.runtime?.sockets.pour.add(probe);

  const root = sideBySide(THREE, registry, ungated.group, gated.group, 1.4);
  root.name = 'source-06:image-to-procedural-model-contract';

  const metadata = {
    sourceId: 6,
    title: 'Image to procedural Three.js model',
    method:
      'The ObjectSculptSpec -> code-only factory -> action-ready gate contract: named components with destruction groups, oriented sockets, a collider compound, declared budgets, and a runtime hierarchy published on root.userData.sculptRuntime that a gate can refuse.',
    adaptation: 'adapted' as const,
    sources: [
      'https://github.com/img2threejs/img2threejs',
      'img2threejs/img2threejs@d6673386f89673a58736f8d398dd16ece67874f5 docs/ARCHITECTURE.md:9-17,67-72,88-89,133-134 (Apache-2.0)',
    ],
    limitation:
      'No reference image, no vision probe and no suitability/material gates were run - the upstream stages 1-3 need the installed skill and an agent with vision, and running third-party code is an owner decision. The spec here was authored by hand to the documented shape. A single image cannot establish hidden geometry, so this lane is static hard-surface props only, never deforming characters.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      beforeGateFailures: beforeReport.failures.length,
      afterGateFailures: afterReport.failures.length,
      sockets: Object.keys(gated.runtime?.sockets ?? {}).length,
      destructionGroups: Object.keys(gated.runtime?.destructionGroups ?? {}).length,
    },
  };

  root.userData.gateReports = { before: beforeReport, after: afterReport };

  return {
    root,
    update(time: number) {
      // The prop is static; only the socket probe moves, to prove the socket
      // carries an orientation and not just a position.
      probe.position.z = Math.sin(time * 1.6) * 0.05;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
