/**
 * Source 41 — the technique-demo hub: a portfolio as a catalogue of
 * self-contained, individually reachable sketches.
 *
 * Canonical: none — a hosted portfolio, no repository, no licence. The
 * register's decision is explicit that the reusable object is the FORMAT, not
 * any one sketch, and that any effect the sixteen titles suggest must be built
 * independently. So nothing here reproduces a source sketch.
 *
 * The format, restated: every technique is a NAMED, ISOLATED, INDIVIDUALLY
 * ADDRESSABLE exhibit whose title states what it is — noun-phrase,
 * technique-first, no cleverness. BEFORE is the failure mode it replaces: one
 * merged scene where four techniques share a space, nothing is named and
 * nothing can be reached on its own. AFTER is the same four as separate,
 * numbered, individually addressable exhibits.
 *
 * This exhibit is self-referential on purpose — group C is itself built in this
 * format, and `selectExhibit` below is the addressability claim made executable.
 */

import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

export type Exhibit = {
  index: number;
  /** Noun-phrase, technique-first. The title IS the documentation. */
  title: string;
  build: (
    THREE: typeof import('three'),
    rng: () => number,
  ) => import('three').Mesh | import('three').Points;
};

export const EXHIBITS: readonly Exhibit[] = [
  {
    index: 1,
    title: 'Recursive Rounded Grid',
    build: (THREE) => {
      const geometry = new THREE.BoxGeometry(0.5, 0.06, 0.5, 4, 1, 4);
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x8892a6, roughness: 0.5, metalness: 0.2 }),
      );
    },
  },
  {
    index: 2,
    title: 'Animated Subdivision Pillars',
    build: (THREE) => {
      const geometry = new THREE.CylinderGeometry(0.1, 0.12, 0.6, 12, 6);
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xa8896b, roughness: 0.65 }),
      );
    },
  },
  {
    index: 3,
    title: 'Noise-Driven Voxel Cube',
    build: (THREE, rng) => {
      const geometry = new THREE.BoxGeometry(0.42, 0.42, 0.42, 3, 3, 3);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) {
        position.setY(i, position.getY(i) + (rng() - 0.5) * 0.08);
      }
      geometry.computeVertexNormals();
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x6f9a86, roughness: 0.8 }),
      );
    },
  },
  {
    index: 4,
    title: 'Proximity Fracture Sphere',
    build: (THREE, rng) => {
      const geometry = new THREE.IcosahedronGeometry(0.26, 1);
      const position = geometry.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) {
        const push = 1 + rng() * 0.18;
        position.setXYZ(
          i,
          position.getX(i) * push,
          position.getY(i) * push,
          position.getZ(i) * push,
        );
      }
      geometry.computeVertexNormals();
      return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xb5726a, roughness: 0.45, flatShading: true }),
      );
    },
  },
];

/**
 * The addressability claim, executable: an exhibit is reachable by its own
 * index without constructing or touching any other. A catalogue that cannot do
 * this is a scene with labels on it.
 */
export function selectExhibit(index: number): Exhibit | undefined {
  return EXHIBITS.find((exhibit) => exhibit.index === index);
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-41-catalogue-format';
  const { before, after } = beforeAfterPanels(THREE, 3.6);

  // BEFORE — one scene, four techniques piled together, nothing named, nothing
  // separately reachable. The group is flat on purpose: the children have no
  // per-exhibit identity at all.
  const mergedRng = createRng(seed);
  const merged = new THREE.Group();
  merged.name = 'one-big-scene';
  for (const exhibit of EXHIBITS) {
    const mesh = exhibit.build(THREE, mergedRng);
    mesh.name = '';
    mesh.position.set(
      (mergedRng() - 0.5) * 0.9,
      0.3 + (mergedRng() - 0.5) * 0.4,
      (mergedRng() - 0.5) * 0.9,
    );
    merged.add(mesh);
  }
  before.add(merged);

  // AFTER — one pedestal per exhibit, each carrying its index and title, each a
  // named group that can be resolved, shown or disposed on its own.
  const pedestalGeometry = new THREE.CylinderGeometry(0.22, 0.24, 0.14, 16);
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f3338,
    roughness: 0.9,
    metalness: 0.05,
  });
  const rails: import('three').Group[] = [];
  for (const exhibit of EXHIBITS) {
    const bay = new THREE.Group();
    // The name carries the number and the title, so the exhibit is
    // self-describing in a scene graph dump as well as on screen.
    bay.name = `exhibit-${String(exhibit.index).padStart(2, '0')}-${exhibit.title}`;
    bay.position.set(-1.35 + (exhibit.index - 1) * 0.9, 0, 0);

    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.y = 0.07;
    pedestal.name = 'pedestal';
    bay.add(pedestal);

    const piece = exhibit.build(THREE, createRng(seed + exhibit.index));
    piece.name = 'subject';
    piece.position.y = 0.42;
    bay.add(piece);

    after.add(bay);
    rails.push(bay);
  }

  root.add(before, after);
  const draws = countDraws(root);

  let elapsed = 0;
  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      // Each exhibit animates on its own clock — isolation is the point, so
      // they must not be visibly locked to one another.
      for (const bay of rails) {
        const subject = bay.getObjectByName('subject');
        if (subject) subject.rotation.y = elapsed * (0.3 + bay.position.x * 0.12);
      }
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 41,
      title: 'Catalogue format: named, isolated, individually addressable exhibits',
      method:
        'Each technique is one numbered bay carrying its own subject and a noun-phrase, '
        + 'technique-first title in its scene-graph name, resolvable by index without '
        + 'constructing any other. The before panel is the same four techniques merged into one '
        + 'unnamed scene, which is the discoverability failure the format exists to prevent.',
      adaptation: 'adapted',
      sources: ['https://x.com/curllmooha', 'https://sketchesbycurllmooha.vercel.app/'],
      limitation:
        'No repository and no licence exist for the source, and NONE of its sixteen sketches is '
        + 'reproduced. The four subjects here are deliberately trivial stand-ins built by this '
        + 'file; three of the titles echo the source\'s naming discipline but the geometry behind '
        + 'them is not the source\'s effect and must not be read as it — there is no raymarching, '
        + 'no physics and no fluid here. Routing, navigation and page chrome belong to root\'s '
        + 'HTML lab, so this exhibit demonstrates the structure, not the router.',
      localLights: [],
      counters: {
        exhibits: EXHIBITS.length,
        addressableBays: rails.length,
        unnamedMergedChildren: merged.children.length,
        meshes: draws.meshes,
      },
    },
  };
}

export default createDemo;
