/**
 * Source 40 — Voxpolia: emissive derived from voxel topology, not placed.
 *
 * The author's claim, quoted in the register from the 28 Aug post: "There are
 * exactly ZERO point lights in this city. Every glowing window is computed, not
 * placed. Each building carries a room grid from its live voxels: a room lights
 * up only if it's hollow and still has a ceiling. Shoot the ceiling out, the
 * light dies with the floor."
 *
 * That is a structural QUERY over live voxels standing in for a light object,
 * and it is the highest-value atom in the row because it stays correct under
 * destruction for free. This scene implements the query and then falsifies the
 * alternative beside it:
 *
 *   BEFORE — windows authored once as a fixed list, the ordinary way. The
 *            ceiling is destroyed and the authored windows keep glowing,
 *            because nothing connects them to the structure.
 *   AFTER  — the same building, windows recomputed from the live voxel grid
 *            each time it changes. The same destruction puts them out.
 *
 * Both halves use ZERO lights of any kind: the glow is emissive instance colour
 * on window quads, which is also how the source describes paying for it.
 *
 * Canonical: none. Voxpolia is a commercial game with no public source, so
 * nothing is copied — the method is restated from the author's own description
 * and implemented here from scratch.
 */

import {
  beforeAfterPanels,
  countDraws,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

const GRID_X = 6;
const GRID_Y = 9;
const GRID_Z = 6;
const CELL = 0.22;

/** `true` where the voxel is solid material. */
export type VoxelGrid = { solid: Uint8Array; sizeX: number; sizeY: number; sizeZ: number };

export function voxelIndex(grid: VoxelGrid, x: number, y: number, z: number): number {
  return (y * grid.sizeZ + z) * grid.sizeX + x;
}

export function isSolid(grid: VoxelGrid, x: number, y: number, z: number): boolean {
  if (x < 0 || y < 0 || z < 0 || x >= grid.sizeX || y >= grid.sizeY || z >= grid.sizeZ) {
    return false;
  }
  return grid.solid[voxelIndex(grid, x, y, z)] === 1;
}

/**
 * The technique, in one function: a cell emits light only if it is HOLLOW and
 * something solid still stands above it. No light is stored anywhere; the
 * answer is recomputed from whatever the voxels currently are, so destroying
 * the ceiling cannot leave a stale light behind — there was never a light
 * object to leave behind.
 *
 * Exported so a CPU check can carve a ceiling and assert the count falls.
 */
export function litRoomCells(grid: VoxelGrid): Array<[number, number, number]> {
  const lit: Array<[number, number, number]> = [];
  for (let y = 0; y < grid.sizeY; y += 1) {
    for (let z = 0; z < grid.sizeZ; z += 1) {
      for (let x = 0; x < grid.sizeX; x += 1) {
        if (isSolid(grid, x, y, z)) continue;
        let hasCeiling = false;
        for (let above = y + 1; above < grid.sizeY; above += 1) {
          if (isSolid(grid, x, above, z)) {
            hasCeiling = true;
            break;
          }
        }
        if (!hasCeiling) continue;
        // Only cells on the shell are visible from outside as windows.
        const onShell =
          x === 0 || z === 0 || x === grid.sizeX - 1 || z === grid.sizeZ - 1;
        if (onShell) lit.push([x, y, z]);
      }
    }
  }
  return lit;
}

function buildGrid(): VoxelGrid {
  const grid: VoxelGrid = {
    solid: new Uint8Array(GRID_X * GRID_Y * GRID_Z),
    sizeX: GRID_X,
    sizeY: GRID_Y,
    sizeZ: GRID_Z,
  };
  for (let y = 0; y < GRID_Y; y += 1) {
    for (let z = 0; z < GRID_Z; z += 1) {
      for (let x = 0; x < GRID_X; x += 1) {
        const shell = x === 0 || z === 0 || x === GRID_X - 1 || z === GRID_Z - 1;
        // Floor slabs every third storey; the cells between them are rooms.
        const slab = y % 3 === 0;
        const solid = shell ? y % 3 !== 1 : slab;
        grid.solid[voxelIndex(grid, x, y, z)] = solid ? 1 : 0;
      }
    }
  }
  return grid;
}

function worldPosition(x: number, y: number, z: number): [number, number, number] {
  return [
    (x - (GRID_X - 1) / 2) * CELL,
    y * CELL + CELL / 2,
    (z - (GRID_Z - 1) / 2) * CELL,
  ];
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  root.name = 'source-40-emissive-from-topology';
  const { before, after } = beforeAfterPanels(THREE, 2.4);

  const grid = buildGrid();
  const maxCells = GRID_X * GRID_Y * GRID_Z;

  const structureGeometry = new THREE.BoxGeometry(CELL, CELL, CELL);
  const structureMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    roughness: 0.92,
    metalness: 0.02,
  });
  const windowGeometry = new THREE.BoxGeometry(CELL * 0.62, CELL * 0.62, CELL * 0.62);

  // Emissive windows, no light objects. Instance colour carries the glow.
  const makeWindowMaterial = () =>
    new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffb24d,
      emissiveIntensity: 1.4,
      roughness: 0.4,
    });

  const structures: import('three').InstancedMesh[] = [];
  const windows: import('three').InstancedMesh[] = [];
  for (const panel of [before, after]) {
    const structure = new THREE.InstancedMesh(structureGeometry, structureMaterial, maxCells);
    structure.name = 'voxel-structure';
    structure.count = 0;
    panel.add(structure);
    structures.push(structure);

    const windowMesh = new THREE.InstancedMesh(windowGeometry, makeWindowMaterial(), maxCells);
    windowMesh.name = 'emissive-windows';
    windowMesh.count = 0;
    panel.add(windowMesh);
    windows.push(windowMesh);
  }

  const matrix = new THREE.Matrix4();

  function writeStructure(mesh: import('three').InstancedMesh): void {
    let count = 0;
    for (let y = 0; y < GRID_Y; y += 1) {
      for (let z = 0; z < GRID_Z; z += 1) {
        for (let x = 0; x < GRID_X; x += 1) {
          if (!isSolid(grid, x, y, z)) continue;
          const [wx, wy, wz] = worldPosition(x, y, z);
          matrix.makeTranslation(wx, wy, wz);
          mesh.setMatrixAt(count, matrix);
          count += 1;
        }
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function writeWindows(
    mesh: import('three').InstancedMesh,
    cells: Array<[number, number, number]>,
  ): void {
    for (let i = 0; i < cells.length; i += 1) {
      const [wx, wy, wz] = worldPosition(cells[i][0], cells[i][1], cells[i][2]);
      matrix.makeTranslation(wx, wy, wz);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  // The authored list is captured ONCE, from the intact building. It is never
  // consulted again — which is exactly the defect being demonstrated.
  const authoredWindows = litRoomCells(grid);
  writeStructure(structures[0]);
  writeWindows(windows[0], authoredWindows);
  writeStructure(structures[1]);
  writeWindows(windows[1], litRoomCells(grid));

  root.add(before, after);
  const intactLitCount = authoredWindows.length;

  /** Remove the ceiling above one column — the source's "shoot the ceiling out". */
  function carveCeiling(column: number): void {
    const x = column % GRID_X;
    const z = Math.floor(column / GRID_X) % GRID_Z;
    for (let y = GRID_Y - 1; y >= GRID_Y - 4; y -= 1) {
      grid.solid[voxelIndex(grid, x, y, z)] = 0;
    }
  }

  function restore(): void {
    const fresh = buildGrid();
    grid.solid.set(fresh.solid);
  }

  let elapsed = 0;
  let carved = 0;
  let liveLitCount = intactLitCount;
  const CARVE_INTERVAL = 0.55;
  const COLUMNS = GRID_X * GRID_Z;

  return {
    root,
    update: (_time: number, dt: number) => {
      elapsed += dt;
      const wanted = Math.floor(elapsed / CARVE_INTERVAL);
      if (wanted === carved) return;
      if (wanted > COLUMNS) {
        elapsed = 0;
        carved = 0;
        restore();
      } else {
        while (carved < wanted) {
          carveCeiling(carved);
          carved += 1;
        }
      }
      // BEFORE: structure updates, authored window list does not. The lights
      // hang in the air where the ceiling used to be.
      writeStructure(structures[0]);
      // AFTER: the query is re-run against the live voxels and the answer is
      // simply smaller. Nothing had to be told a light went out.
      writeStructure(structures[1]);
      const live = litRoomCells(grid);
      liveLitCount = live.length;
      writeWindows(windows[1], live);
    },
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 40,
      title: 'Emissive windows derived from voxel topology (zero lights)',
      method:
        'A window emits only where a voxel cell is hollow AND solid material still stands '
        + 'somewhere above it, recomputed from the live grid whenever the grid changes. No light '
        + 'object and no authored window list exists, so destroying a ceiling removes the glow '
        + 'as a consequence of the query rather than through a notification. The before panel '
        + 'keeps the authored list and keeps glowing through the same destruction.',
      adaptation: 'adapted',
      sources: ['https://x.com/VoxpoliaGame', 'https://endstreet.itch.io/voxpolia'],
      limitation:
        'Voxpolia is a commercial game with no public source; nothing is copied and no figure '
        + 'from its marketing clips is reproduced or verified. Only atom 1 (emissive-from-'
        + 'topology) is implemented. Atom 2 (amortised one-fifth-per-frame self-collision) and '
        + 'atom 3 (support-graph structural failure) are NOT here: the destruction below is a '
        + 'scripted carve on a timer, not emergent collapse, and must not be read as one. The '
        + 'ceiling query is a full column scan, not the source\'s per-building room grid.',
      localLights: [],
      counters: {
        gridCells: maxCells,
        litCellsIntact: intactLitCount,
        litCellsLive: liveLitCount,
        lightObjects: 0,
        instancedMeshes: countDraws(root).instancedMeshes,
      },
    },
  };
}

export default createDemo;
