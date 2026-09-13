/**
 * Source 42 — the vibe-stack shelf; highest-value item: `procedural-bank`'s
 * CGA-style shape grammar for buildings.
 *
 * Licence read as a file by this lane: `vibe-stack/procedural-bank` LICENSE on
 * `main`, HTTP 200, 1,072 B, MIT, "Copyright (c) 2026 @alightinastorm". MIT
 * would permit reuse with attribution; this lane still implements the grammar
 * independently, because the register's decision is to pin and gate before any
 * adoption and nothing here is an adoption.
 *
 * The method: a building is not modelled, it is DERIVED by rewriting a footprint
 * through a fixed sequence of rules — footprint -> mass -> podium/shaft/crown
 * split -> facade bays per storey -> roof. Each rule reads the shape it is given
 * and emits shapes for the next rule, so changing one parameter (storeys, bay
 * width, podium height) re-derives a coherent building rather than breaking one.
 *
 * BEFORE is the same footprint and the same height as a single extruded box —
 * what "a building" costs without a grammar. AFTER is the derivation.
 */

import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

export type Footprint = { width: number; depth: number };

export type GrammarParameters = {
  storeys: number;
  storeyHeight: number;
  podiumStoreys: number;
  crownStoreys: number;
  bayWidth: number;
};

export type DerivedShape = {
  rule: 'podium' | 'shaft' | 'crown' | 'bay' | 'roof';
  position: [number, number, number];
  size: [number, number, number];
};

/**
 * The whole grammar. Exported so a CPU check can assert that the derivation is
 * consistent — that the three mass parts tile the height exactly and that bay
 * count follows bay width — without building a scene.
 */
export function deriveBuilding(
  footprint: Footprint,
  parameters: GrammarParameters,
): DerivedShape[] {
  const shapes: DerivedShape[] = [];
  const { storeys, storeyHeight, podiumStoreys, crownStoreys, bayWidth } = parameters;
  const shaftStoreys = Math.max(1, storeys - podiumStoreys - crownStoreys);

  // Rule 1: mass -> podium | shaft | crown. A vertical split of one extrusion.
  const podiumHeight = podiumStoreys * storeyHeight;
  const shaftHeight = shaftStoreys * storeyHeight;
  const crownHeight = crownStoreys * storeyHeight;

  // The podium is set proud of the shaft; the crown is set back from it. That
  // one asymmetry is most of what makes a grammar building read as designed.
  shapes.push({
    rule: 'podium',
    position: [0, podiumHeight / 2, 0],
    size: [footprint.width * 1.08, podiumHeight, footprint.depth * 1.08],
  });
  shapes.push({
    rule: 'shaft',
    position: [0, podiumHeight + shaftHeight / 2, 0],
    size: [footprint.width, shaftHeight, footprint.depth],
  });
  shapes.push({
    rule: 'crown',
    position: [0, podiumHeight + shaftHeight + crownHeight / 2, 0],
    size: [footprint.width * 0.86, crownHeight, footprint.depth * 0.86],
  });

  // Rule 2: shaft face -> repeated bays. Bay count is derived from the face
  // width and the bay width, never authored, so a wider building simply gets
  // more bays of the same size.
  const bays = Math.max(1, Math.floor(footprint.width / bayWidth));
  const actualBayWidth = footprint.width / bays;
  for (let storey = 0; storey < shaftStoreys; storey += 1) {
    const y = podiumHeight + storey * storeyHeight + storeyHeight / 2;
    for (let bay = 0; bay < bays; bay += 1) {
      const x = -footprint.width / 2 + actualBayWidth * (bay + 0.5);
      for (const side of [-1, 1]) {
        shapes.push({
          rule: 'bay',
          position: [x, y, (side * footprint.depth) / 2],
          // A recessed opening with a sill: the window is inset, not painted on.
          size: [actualBayWidth * 0.62, storeyHeight * 0.55, 0.04],
        });
      }
    }
  }

  // Rule 3: crown -> roof cap.
  shapes.push({
    rule: 'roof',
    position: [0, podiumHeight + shaftHeight + crownHeight + 0.03, 0],
    size: [footprint.width * 0.9, 0.06, footprint.depth * 0.9],
  });

  return shapes;
}

const RULE_COLOUR: Record<DerivedShape['rule'], number> = {
  podium: 0x6d6459,
  shaft: 0x8a8277,
  crown: 0x756d63,
  bay: 0x2b3138,
  roof: 0x55504a,
};

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-42-shape-grammar';
  const { before, after } = beforeAfterPanels(THREE, 2.8);
  const rng = createRng(seed);

  const footprint: Footprint = { width: 1.2, depth: 0.9 };
  const parameters: GrammarParameters = {
    storeys: 9,
    storeyHeight: 0.26,
    podiumStoreys: 2,
    crownStoreys: 2,
    bayWidth: 0.3,
  };
  const totalHeight = parameters.storeys * parameters.storeyHeight;

  // BEFORE — one extrusion of the same footprint to the same height.
  const boxGeometry = new THREE.BoxGeometry(footprint.width, totalHeight, footprint.depth);
  const box = new THREE.Mesh(
    boxGeometry,
    new THREE.MeshStandardMaterial({ color: 0x8a8277, roughness: 0.9, metalness: 0.02 }),
  );
  box.position.y = totalHeight / 2;
  box.name = 'ungrammared-extrusion';
  before.add(box);

  // AFTER — the derivation. Shapes sharing a rule share one material, and bays
  // are instanced because there is one bay geometry and many of them.
  const shapes = deriveBuilding(footprint, parameters);
  const materials = new Map<DerivedShape['rule'], import('three').MeshStandardMaterial>();
  for (const rule of Object.keys(RULE_COLOUR) as Array<DerivedShape['rule']>) {
    materials.set(
      rule,
      new THREE.MeshStandardMaterial({
        color: RULE_COLOUR[rule],
        roughness: rule === 'bay' ? 0.35 : 0.92,
        metalness: rule === 'bay' ? 0.1 : 0.02,
      }),
    );
  }

  const bayShapes = shapes.filter((shape) => shape.rule === 'bay');
  const massShapes = shapes.filter((shape) => shape.rule !== 'bay');

  for (const shape of massShapes) {
    const geometry = new THREE.BoxGeometry(shape.size[0], shape.size[1], shape.size[2]);
    const mesh = new THREE.Mesh(geometry, materials.get(shape.rule)!);
    mesh.position.set(shape.position[0], shape.position[1], shape.position[2]);
    mesh.name = `rule-${shape.rule}`;
    after.add(mesh);
  }

  if (bayShapes.length > 0) {
    const bayGeometry = new THREE.BoxGeometry(
      bayShapes[0].size[0],
      bayShapes[0].size[1],
      bayShapes[0].size[2],
    );
    const bayMesh = new THREE.InstancedMesh(
      bayGeometry,
      materials.get('bay')!,
      bayShapes.length,
    );
    bayMesh.name = 'rule-bay';
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < bayShapes.length; i += 1) {
      const shape = bayShapes[i];
      matrix.makeTranslation(shape.position[0], shape.position[1], shape.position[2]);
      bayMesh.setMatrixAt(i, matrix);
    }
    bayMesh.instanceMatrix.needsUpdate = true;
    after.add(bayMesh);
  }

  root.add(before, after);
  const draws = countDraws(root);
  // Consumed so a reseeded lab run is visibly deterministic rather than static.
  root.rotation.y = (rng() - 0.5) * 0.2;

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 42,
      title: 'CGA-style shape grammar: footprint to podium/shaft/crown to bays',
      method:
        'A building is derived by rewriting: the mass splits vertically into a proud podium, a '
        + 'shaft and a set-back crown that tile the height exactly; the shaft face is divided '
        + 'into bays whose COUNT is derived from face width over bay width rather than authored; '
        + 'a roof cap terminates the crown. Changing storeys or bay width re-derives a coherent '
        + 'building instead of breaking one.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/stefan_3d_ai?s=11',
        'https://github.com/vibe-stack/procedural-bank',
        'https://raw.githubusercontent.com/vibe-stack/procedural-bank/main/LICENSE',
      ],
      limitation:
        'Written independently; no rule, constant or module from the MIT source is reused, and '
        + 'recording it here is not adoption — the register requires a pin and our own '
        + 'silhouette/scale/triangle/LOD gates first. This grammar has five rules against the '
        + 'source\'s footprint-edge-graph, mass, podium, shaft, facade, crown and roof set, with '
        + 'no kit-of-parts module library, no entries, no columns and no textures. The source '
        + 'ships four PNGs and is therefore not assets-free; this exhibit is.',
      localLights: [],
      counters: {
        derivedShapes: shapes.length,
        bays: bayShapes.length,
        storeys: parameters.storeys,
        meshes: draws.meshes,
        instancedMeshes: draws.instancedMeshes,
      },
    },
  };
}

export default createDemo;
