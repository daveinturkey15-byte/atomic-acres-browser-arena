/**
 * Source 47 — GTA-style open-world city art: the STREET CELL, and the surface
 * priority order that carries the look.
 *
 * The register's honest finding is that the post is a BAR, not a pipeline: four
 * sentences and a video, no prompt, no repository, no tooling list, no licence.
 * The loop it demonstrates is already rows 13/34. What is genuinely new is how
 * to cut a city into a piece a critic can judge — one street cell — and which
 * surfaces actually carry the look, in order of screen area: ROAD first,
 * PAVEMENT second, FACADE BAYS third, FURNITURE DENSITY fourth.
 *
 * BEFORE is the cell with its surfaces flat and untreated — the greybox. AFTER
 * applies the four layers in that priority order. The exhibit deliberately does
 * NOT adopt the reference's flat overcast grade: the register records that as a
 * trap (cheap, hides weak procedural materials, and the opposite of the owner's
 * dynamic time-of-day direction), and the measured reference itself runs at
 * 18-20 fps, so it is a screenshot-grade bar and not a gameplay target.
 */

import { hash11 } from '../../../noise';
import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  paintVertices,
  type Demo,
  type DemoContext,
} from './shared';

const CELL_LENGTH = 4.0;
const ROAD_WIDTH = 1.6;
const PAVEMENT_WIDTH = 0.5;

/** Layer 1, the largest share of screen area: aggregate, cold patches, tar seams, lane paint. */
function roadSurface(x: number, z: number): [number, number, number] {
  const aggregate = hash11(Math.floor(x * 26) * 3.1 + Math.floor(z * 26) * 7.7) * 0.09;
  const coldPatch = hash11(Math.floor(x * 2.2) * 17.3 + Math.floor(z * 1.6) * 5.1) > 0.72 ? 0.84 : 1;
  const tarSeam = Math.abs(Math.sin(z * 2.1 + Math.sin(x * 3.3) * 0.4)) < 0.05 ? 0.72 : 1;
  const crack = Math.abs(Math.sin(x * 7.9 + z * 1.3)) < 0.03 ? 0.78 : 1;
  // Worn lane paint down the centre, broken into dashes.
  const lane = Math.abs(x) < 0.045 && Math.sin(z * 5.2) > 0 ? 1 : 0;
  const base = (0.20 + aggregate) * coldPatch * tarSeam * crack;
  const wear = 0.55 + hash11(Math.floor(z * 9) * 2.7) * 0.35;
  return [
    base + lane * 0.5 * wear,
    base + lane * 0.48 * wear,
    base * 1.02 + lane * 0.40 * wear,
  ];
}

/** Layer 2: paving slabs on a regular joint pattern, with a split kerb edge. */
function pavementSurface(x: number, z: number): [number, number, number] {
  const slabX = Math.floor(x * 4.5);
  const slabZ = Math.floor(z * 4.5);
  const joint =
    Math.abs(x * 4.5 - slabX - 0.5) > 0.44 || Math.abs(z * 4.5 - slabZ - 0.5) > 0.44 ? 0.7 : 1;
  const tone = 0.33 + hash11(slabX * 11.3 + slabZ * 4.9) * 0.09;
  return [tone * joint, tone * joint * 0.99, tone * joint * 0.96];
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-47-street-cell';
  const { before, after } = beforeAfterPanels(THREE, 3.4);

  function buildCell(group: import('three').Group, treated: boolean): void {
    // Layer 1 — road.
    const road = new THREE.PlaneGeometry(ROAD_WIDTH, CELL_LENGTH, 48, 96);
    road.rotateX(-Math.PI / 2);
    paintVertices(THREE, road, (x, _y, z) =>
      treated ? roadSurface(x, z) : [0.34, 0.34, 0.35]);
    group.add(
      new THREE.Mesh(
        road,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }),
      ),
    );

    // Layer 2 — pavements and split kerbs.
    for (const side of [-1, 1]) {
      const pavement = new THREE.PlaneGeometry(PAVEMENT_WIDTH, CELL_LENGTH, 12, 72);
      pavement.rotateX(-Math.PI / 2);
      pavement.translate(side * (ROAD_WIDTH / 2 + PAVEMENT_WIDTH / 2), 0.055, 0);
      paintVertices(THREE, pavement, (x, _y, z) =>
        treated ? pavementSurface(x, z) : [0.40, 0.40, 0.41]);
      group.add(
        new THREE.Mesh(
          pavement,
          new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
        ),
      );

      const kerb = new THREE.BoxGeometry(0.07, 0.055, CELL_LENGTH);
      kerb.translate(side * (ROAD_WIDTH / 2 + 0.035), 0.028, 0);
      group.add(
        new THREE.Mesh(
          kerb,
          new THREE.MeshStandardMaterial({
            color: treated ? 0x6e6a63 : 0x767676,
            roughness: 0.9,
          }),
        ),
      );

      // Layer 3 — facade bays: recessed openings, sills, a distinct ground
      // floor and a parapet. Flat walls are what makes a greybox read as one.
      const facade = new THREE.BoxGeometry(0.36, 1.9, CELL_LENGTH);
      facade.translate(side * (ROAD_WIDTH / 2 + PAVEMENT_WIDTH + 0.18), 0.95, 0);
      group.add(
        new THREE.Mesh(
          facade,
          new THREE.MeshStandardMaterial({
            color: treated ? 0x6a5c51 : 0x8a8a8a,
            roughness: 0.92,
          }),
        ),
      );

      if (treated) {
        const bayGeometry = new THREE.BoxGeometry(0.05, 0.26, 0.22);
        const bayMaterial = new THREE.MeshStandardMaterial({
          color: 0x1d2227,
          roughness: 0.32,
          metalness: 0.12,
        });
        const storeys = 4;
        const perStorey = 7;
        const bays = new THREE.InstancedMesh(bayGeometry, bayMaterial, storeys * perStorey);
        bays.name = `facade-bays-${side}`;
        const matrix = new THREE.Matrix4();
        let index = 0;
        for (let storey = 0; storey < storeys; storey += 1) {
          for (let bay = 0; bay < perStorey; bay += 1) {
            matrix.makeTranslation(
              side * (ROAD_WIDTH / 2 + PAVEMENT_WIDTH + 0.01),
              0.55 + storey * 0.36,
              -CELL_LENGTH / 2 + 0.3 + bay * 0.56,
            );
            bays.setMatrixAt(index, matrix);
            index += 1;
          }
        }
        bays.instanceMatrix.needsUpdate = true;
        group.add(bays);
      }
    }

    // Layer 4 — furniture density. Lowest priority: it is the last thing that
    // buys look per unit of work, and the first thing that gets overdone.
    if (treated) {
      const postGeometry = new THREE.CylinderGeometry(0.018, 0.022, 0.5, 6);
      const postMaterial = new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: 0.7 });
      const posts = new THREE.InstancedMesh(postGeometry, postMaterial, 12);
      posts.name = 'street-furniture';
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < 12; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        matrix.makeTranslation(
          side * (ROAD_WIDTH / 2 + 0.18),
          0.3,
          -CELL_LENGTH / 2 + 0.35 + Math.floor(i / 2) * 0.62,
        );
        posts.setMatrixAt(i, matrix);
      }
      posts.instanceMatrix.needsUpdate = true;
      group.add(posts);
    }
  }

  buildCell(before, false);
  buildCell(after, true);
  root.add(before, after);
  const draws = countDraws(root);

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 47,
      title: 'The street cell, authored in surface-priority order',
      method:
        'One street cell is the unit a critic can judge. Its surfaces are treated in descending '
        + 'order of screen area: road (aggregate, cold-patch repairs, tar seams, crack network, '
        + 'worn dashed lane paint), then paving slabs with a jointed pattern and a split kerb, '
        + 'then instanced recessed facade bays, then street furniture last. The before panel is '
        + 'the same cell untreated.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/mattshumer_/status/2095187868746383758',
        'https://somethingbig.ai/gauntlet-loop',
      ],
      limitation:
        'The source city is unpublished with no repository and no licence; no frame, texture, '
        + 'signage or street identity is reproduced, and no reference image is held. This is one '
        + 'cell, not a city: no road graph, no traffic, no pedestrians, no HUD, no minimap and no '
        + 'streaming. The register\'s two traps are deliberately NOT adopted — the flat overcast '
        + 'grade is absent (this exhibit sets no lighting at all) and the reference\'s own '
        + 'measured 18-20 fps means it is a screenshot bar, not a gameplay target. Trees, which '
        + 'the decomposition ranks above furniture, are absent.',
      localLights: [],
      counters: {
        surfaceLayers: 4,
        facadeBaysPerSide: 28,
        furniturePieces: 12,
        meshes: draws.meshes,
        instancedMeshes: draws.instancedMeshes,
        triangles: draws.triangles,
      },
    },
  };
}

export default createDemo;
