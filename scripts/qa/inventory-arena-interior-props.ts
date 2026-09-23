import * as THREE from 'three';
import * as fs from 'fs';
import { buildNuketown2 } from '../../src/nuketown2-arena';
import { nuketown2HandedX } from '../../src/nuketown2-layout';
import type { ArenaMap } from '../../src/map';

export interface PropInventoryRow {
  name: string;
  authored: string;
  side: 'north' | 'south' | 'none';
  worldPos: [number, number, number];
  size: [number, number, number];
  material: string;
  presentationOnly: boolean | undefined;
  presentationBatchCandidate: boolean | undefined;
  hasBallisticSurface: boolean;
  hasCollider: boolean;
  removable: boolean;
  rectNorthInterior: [number, number, number, number] | 'near-clip';
  rectSouthInterior: [number, number, number, number] | 'near-clip';
  rectNorthClippedPx: number;
}

export interface InventorySummary {
  totalMeshes: number;
  boxMeshes: number;
  presentationBatchMeshes: number;
  invisibleMeshes: number;
  colliders: number;
  shotSurfaces: number;
  houseInteriorKitMeshes: number;
  garageInteriorKitMeshes: number;
  kitMeshesWithCollider: number;
  kitMeshesWithBallisticSurface: number;
  solidInteriorBodies: number;
  propCoveragePx: number;
  solidBodiesList: string[];
}

export interface InventoryResult {
  summary: InventorySummary;
  rows: PropInventoryRow[];
}

const ARENA_BUILDERS: Record<string, (scene: THREE.Scene) => ArenaMap> = {
  nuketown2: buildNuketown2,
};

function hasColliderMatch(box3: THREE.Box3, colliders: ArenaMap['colliders']): boolean {
  for (const c of colliders) {
    if (
      Math.abs(c.minX - box3.min.x) <= 1e-3 &&
      Math.abs(c.maxX - box3.max.x) <= 1e-3 &&
      Math.abs(c.minZ - box3.min.z) <= 1e-3 &&
      Math.abs(c.maxZ - box3.max.z) <= 1e-3
    ) {
      if (c.minY !== undefined) {
        if (Math.abs(c.minY - box3.min.y) <= 1e-3) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

function projectBox(
  box3: THREE.Box3,
  cam: THREE.PerspectiveCamera,
): { rect: [number, number, number, number] | 'near-clip'; clippedPx: number } {
  const corners = [
    new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
    new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
    new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
    new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
    new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
    new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
    new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
    new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
  ];

  const inv = cam.matrixWorldInverse;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of corners) {
    const view = c.clone().applyMatrix4(inv);
    if (view.z > -0.05) {
      return { rect: 'near-clip', clippedPx: 0 };
    }
    const proj = c.clone().project(cam);
    const px = (proj.x + 1) * 0.5 * 1280;
    const py = (1 - proj.y) * 0.5 * 720;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const rounded: [number, number, number, number] = [
    Math.round(minX),
    Math.round(minY),
    Math.round(maxX),
    Math.round(maxY),
  ];

  const cX0 = Math.max(0, Math.min(1280, rounded[0]));
  const cX1 = Math.max(0, Math.min(1280, rounded[2]));
  const cY0 = Math.max(0, Math.min(720, rounded[1]));
  const cY1 = Math.max(0, Math.min(720, rounded[3]));
  const clippedPx = Math.max(0, cX1 - cX0) * Math.max(0, cY1 - cY0);

  return { rect: rounded, clippedPx };
}

export function runInventory(arenaId = 'nuketown2'): InventoryResult {
  const builder = ARENA_BUILDERS[arenaId];
  if (!builder) {
    throw new Error(`Unknown arena: ${arenaId}`);
  }

  const scene = new THREE.Scene();
  const map = builder(scene);
  map.root.updateMatrixWorld(true);

  // Setup frozen interior cameras (fov 70, near 0.02, far 190, 1280x720)
  const northCam = new THREE.PerspectiveCamera(70, 1280 / 720, 0.02, 190);
  northCam.position.set(nuketown2HandedX(-1.25), 1.7, -19.5);
  northCam.lookAt(nuketown2HandedX(-1.25), 1.6, -12.0);
  northCam.updateMatrixWorld(true);

  const southCam = new THREE.PerspectiveCamera(70, 1280 / 720, 0.02, 190);
  southCam.position.set(nuketown2HandedX(1.25), 1.7, 19.5);
  southCam.lookAt(nuketown2HandedX(1.25), 1.6, 12.0);
  southCam.updateMatrixWorld(true);

  let totalMeshes = 0;
  let boxMeshes = 0;
  let presentationBatchMeshes = 0;
  let invisibleMeshes = 0;
  let houseInteriorKitMeshes = 0;
  let garageInteriorKitMeshes = 0;
  let kitMeshesWithCollider = 0;
  let kitMeshesWithBallisticSurface = 0;

  const solidCoverAuthoredNames = [
    'house front room counter',
    'house kitchen island',
    'house back room bench',
    'house living couch',
    'house upper crate',
    'house upper bed',
  ];
  const solidBodiesFound = new Set<string>();

  const rows: PropInventoryRow[] = [];
  const northMask = new Uint8Array(1280 * 720);

  map.root.traverse((node: THREE.Object3D) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    totalMeshes++;

    const isBox = mesh.geometry?.type === 'BoxGeometry';
    if (isBox) boxMeshes++;

    if (mesh.name && mesh.name.includes('presentation-batch')) {
      presentationBatchMeshes++;
    }
    if (mesh.visible === false) {
      invisibleMeshes++;
    }

    const nodeName = mesh.name || '';
    const isHouseKit = nodeName.includes('house interior');
    const isGarageKit = nodeName.includes('garage interior');
    if (isHouseKit) houseInteriorKitMeshes++;
    if (isGarageKit) garageInteriorKitMeshes++;

    if (!isBox) return;

    const box3 = new THREE.Box3().setFromObject(mesh);
    const hasCollider = hasColliderMatch(box3, map.colliders);
    const hasBallisticSurface = typeof mesh.userData?.ballisticSurfaceId === 'string';
    const removable = !hasCollider && !hasBallisticSurface;

    if (isHouseKit || isGarageKit) {
      if (hasCollider) kitMeshesWithCollider++;
      if (hasBallisticSurface) kitMeshesWithBallisticSurface++;
    }

    for (const scName of solidCoverAuthoredNames) {
      if (nodeName === `nuketown2 north ${scName}` || nodeName === `nuketown2 south ${scName}`) {
        if (hasCollider && hasBallisticSurface) {
          solidBodiesFound.add(nodeName);
        }
      }
    }

    let side: 'north' | 'south' | 'none' = 'none';
    let authored = nodeName;
    if (nodeName.startsWith('nuketown2 north ')) {
      side = 'north';
      authored = nodeName.slice('nuketown2 north '.length);
    } else if (nodeName.startsWith('nuketown2 south ')) {
      side = 'south';
      authored = nodeName.slice('nuketown2 south '.length);
    }

    const worldPosVec = new THREE.Vector3();
    mesh.getWorldPosition(worldPosVec);
    const worldPos: [number, number, number] = [
      Number(worldPosVec.x.toFixed(4)),
      Number(worldPosVec.y.toFixed(4)),
      Number(worldPosVec.z.toFixed(4)),
    ];

    const params = (mesh.geometry as THREE.BoxGeometry | undefined)?.parameters;
    const size: [number, number, number] = params
      ? [
          Number(params.width.toFixed(4)),
          Number(params.height.toFixed(4)),
          Number(params.depth.toFixed(4)),
        ]
      : [
          Number((box3.max.x - box3.min.x).toFixed(4)),
          Number((box3.max.y - box3.min.y).toFixed(4)),
          Number((box3.max.z - box3.min.z).toFixed(4)),
        ];

    const mat = mesh.material;
    const materialName = mat
      ? Array.isArray(mat)
        ? mat.map((m: THREE.Material) => m.name || 'unnamed').join(',')
        : (mat as THREE.Material).name || 'unnamed'
      : 'none';

    const projNorth = projectBox(box3, northCam);
    const projSouth = projectBox(box3, southCam);

    rows.push({
      name: nodeName,
      authored,
      side,
      worldPos,
      size,
      presentationOnly: mesh.userData?.presentationOnly,
      presentationBatchCandidate: mesh.userData?.presentationBatchCandidate,
      hasBallisticSurface,
      hasCollider,
      removable,
      rectNorthInterior: projNorth.rect,
      rectSouthInterior: projSouth.rect,
      rectNorthClippedPx: projNorth.clippedPx,
    });

    // Union for propCoveragePx:
    // "union of the clipped rectNorthInterior of every row with removable === true
    // whose name contains house interior or house living or house kitchen"
    const isTargetProp =
      removable &&
      (nodeName.includes('house interior') ||
        nodeName.includes('house living') ||
        nodeName.includes('house kitchen'));

    if (isTargetProp && Array.isArray(projNorth.rect)) {
      const x0 = Math.max(0, Math.min(1280, projNorth.rect[0]));
      const x1 = Math.max(0, Math.min(1280, projNorth.rect[2]));
      const y0 = Math.max(0, Math.min(720, projNorth.rect[1]));
      const y1 = Math.max(0, Math.min(720, projNorth.rect[3]));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          northMask[y * 1280 + x] = 1;
        }
      }
    }
  });

  let propCoveragePx = 0;
  for (let i = 0; i < northMask.length; i++) {
    if (northMask[i] === 1) propCoveragePx++;
  }

  const summary: InventorySummary = {
    totalMeshes,
    boxMeshes,
    presentationBatchMeshes,
    invisibleMeshes,
    colliders: map.colliders.length,
    shotSurfaces: map.shotSurfaces.length,
    houseInteriorKitMeshes,
    garageInteriorKitMeshes,
    kitMeshesWithCollider,
    kitMeshesWithBallisticSurface,
    solidInteriorBodies: solidBodiesFound.size,
    propCoveragePx,
    solidBodiesList: Array.from(solidBodiesFound).sort(),
  };

  return { summary, rows };
}

// CLI entry point
if (process.argv[1]?.endsWith('inventory-arena-interior-props.ts') || process.argv[1]?.endsWith('inventory-arena-interior-props.js')) {
  const args = process.argv.slice(2);
  let arena = 'nuketown2';
  let outFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--arena' && args[i + 1]) {
      arena = args[i + 1];
      i++;
    } else if (args[i] === '--out' && args[i + 1]) {
      outFile = args[i + 1];
      i++;
    }
  }

  const result = runInventory(arena);
  const s = result.summary;

  console.log(`=== INVENTORY SUMMARY: ${arena} ===`);
  console.log(`totalMeshes: ${s.totalMeshes}`);
  console.log(`boxMeshes: ${s.boxMeshes}`);
  console.log(`presentationBatchMeshes: ${s.presentationBatchMeshes}`);
  console.log(`invisibleMeshes: ${s.invisibleMeshes}`);
  console.log(`colliders: ${s.colliders}`);
  console.log(`shotSurfaces: ${s.shotSurfaces}`);
  console.log(`houseInteriorKitMeshes: ${s.houseInteriorKitMeshes}`);
  console.log(`garageInteriorKitMeshes: ${s.garageInteriorKitMeshes}`);
  console.log(`kitMeshesWithCollider: ${s.kitMeshesWithCollider}`);
  console.log(`kitMeshesWithBallisticSurface: ${s.kitMeshesWithBallisticSurface}`);
  console.log(`solidInteriorBodies: ${s.solidInteriorBodies}`);
  console.log(`propCoveragePx: ${s.propCoveragePx}`);

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Wrote inventory data to ${outFile}`);
  }
}
