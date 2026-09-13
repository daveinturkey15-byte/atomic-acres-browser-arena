/**
 * Props-lane street props: creosote utility poles with sagging catenary wires
 * along both loop-road verges, the north-entrance welcome gantry straddling the
 * back road, and stone entry pillars topped with white globe lamps.
 *
 * Targets: `map__center-loop.png` + `map__street-teal.png` (poles/wires both
 * sides), `prop__utility-poles.png` (paired crossarms, insulators, sag),
 * `prop__welcome-sign.png` (blank timber boards on a post frame),
 * `map__north-entrance.png` (entrance ensemble).
 *
 * Additive procedural module following
 * `src/world-studio/prop-assets/utility-ac.ts` (PLACEMENT + DIMENSIONS
 * declaration, presentation-only contract, `root`/`ready`/`dispose` shape) and
 * the merged per-material bucket batching of
 * `src/world-studio/gardens/index.ts`: one draw group per material role.
 * Built from existing primitives and `createStudioSurface` materials only —
 * no new textures, no model formats, no Blender work.
 *
 * Presentation-only: no collision authority is claimed here. Every part stands
 * off the road surface (outside kerb + sidewalk), clear of porch/balcony
 * slabs, paths, lamps, fences and spawn discs, so the arena owner keeps the
 * exact authority the TypeScript solids already carry.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStudioSurface } from '../materials';
import { studioRoadHalfWidth } from '../layout';

export interface StreetProps {
  root: THREE.Group;
  /** Already resolved: the build is synchronous, no loader race exists. */
  ready: Promise<void>;
  dispose: () => void;
  stats: StreetPropsStats;
}

export interface StreetPropsStats {
  poles: number;
  wires: number;
  pillars: number;
  triangles: number;
  drawGroups: number;
}

/**
 * Declared placement advice: the group is authored in world space with grade
 * at Y = 0, so add the root to the arena as-is. Poles stand 2.6 m outside the
 * curved road edge; the gantry straddles the back road just inside the north
 * fence; pillars flank the road at both fence ends.
 */
export const STREET_PROPS_PLACEMENT = Object.freeze({
  poleOffsetM: 2.6,
  poleStationsZ: Object.freeze([-30, -20, -10, 10, 20, 30]),
  signZ: -32.6,
  pillarZ: Object.freeze([-32.6, 32.6]),
  pillarOffsetM: 2.9,
});

/** Authored dimensions in metres (pole height, crossarm span, wire sag, sign, pillar). */
export const STREET_PROPS_DIMENSIONS = Object.freeze({
  poleHeight: 7.2,
  poleRadiusTop: 0.14,
  poleRadiusBase: 0.19,
  crossarmWidth: 1.7,
  crossarmY: Object.freeze([6.3, 5.9]),
  wireSagM: 0.7,
  wireRadius: 0.025,
  signPostHeight: 5.0,
  signBeamY: 4.75,
  signBoard: Object.freeze({ width: 3.2, height: 1.15, depth: 0.1, centreY: 3.8 }),
  pillar: Object.freeze({ width: 0.65, height: 1.7, capY: 1.77, globeRadius: 0.22, globeY: 2.05 }),
});

type StreetPropRole = 'timber' | 'stone' | 'wire' | 'porcelain' | 'globe';

/** World-metre box projection so shared tiles keep physical size on every part. */
function projectBoxUvs(geometry: THREE.BufferGeometry, tile: number): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!position || !normal || !uv) return;
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = position.getX(i);
      v = position.getZ(i);
    } else if (nx >= nz) {
      u = position.getZ(i);
      v = position.getY(i);
    } else {
      u = position.getX(i);
      v = position.getY(i);
    }
    uv.setXY(i, u / tile, v / tile);
  }
}

function disposeSubtree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry as THREE.BufferGeometry);
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      materials.add(entry);
      for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/**
 * Marks every node presentation-only and restores the closed-volume contract:
 * opaque faces stay single-sided; emissive globes keep depth-write on as
 * opaque geometry.
 */
function applyPresentationContract(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.worldStudioPropsAsset = true;
    node.userData.presentationOnly = true;
    const mesh = node as Partial<THREE.Mesh>;
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      const transparentSurface = entry.transparent === true || entry.opacity < 1;
      if (transparentSurface) {
        entry.depthWrite = false;
        continue;
      }
      entry.side = THREE.FrontSide;
      entry.needsUpdate = true;
    }
  });
}

/** Builds the additive street-props group. Usable immediately. */
export function createStreetProps(): StreetProps {
  const root = new THREE.Group();
  root.name = 'world-studio-street-props';
  root.userData.presentationOnly = true;

  const timberSurface = createStudioSurface('timber');
  const concreteSurface = createStudioSurface('concrete');
  const stone = new THREE.MeshStandardMaterial({
    color: 0xb9b19d,
    roughness: 0.95,
    map: concreteSurface.map,
    normalMap: concreteSurface.normalMap,
  });
  const wire = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.6, metalness: 0.3 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.4 });
  const globe = new THREE.MeshStandardMaterial({
    color: 0xf5efdc,
    roughness: 0.3,
    emissive: 0xffd4a1,
    emissiveIntensity: 0.12,
  });

  const buckets = new Map<StreetPropRole, THREE.BufferGeometry[]>();
  const push = (geometry: THREE.BufferGeometry, role: StreetPropRole): void => {
    projectBoxUvs(geometry, 2);
    const bucket = buckets.get(role) ?? [];
    bucket.push(geometry);
    buckets.set(role, bucket);
  };
  const box = (
    role: StreetPropRole,
    size: readonly [number, number, number],
    centre: readonly [number, number, number],
  ): void => {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geometry.translate(centre[0], centre[1], centre[2]);
    push(geometry, role);
  };
  const cylinder = (
    role: StreetPropRole,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    centre: readonly [number, number, number],
    segments = 10,
  ): void => {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    geometry.translate(centre[0], centre[1], centre[2]);
    push(geometry, role);
  };

  const dims = STREET_PROPS_DIMENSIONS;
  const poleTops: Array<{ x: number; z: number }> = [];
  let wireCount = 0;

  // Utility poles with paired crossarms + insulators, both verges.
  for (const side of [-1, 1]) {
    for (const z of STREET_PROPS_PLACEMENT.poleStationsZ) {
      const x = side * (studioRoadHalfWidth(z) + STREET_PROPS_PLACEMENT.poleOffsetM);
      cylinder(
        'timber',
        dims.poleRadiusTop,
        dims.poleRadiusBase,
        dims.poleHeight,
        [x, dims.poleHeight / 2, z],
      );
      for (const cy of dims.crossarmY) {
        box('timber', [dims.crossarmWidth, 0.12, 0.12], [x, cy, z]);
        for (const end of [-1, 1]) {
          cylinder('porcelain', 0.05, 0.06, 0.12, [x + end * (dims.crossarmWidth / 2 - 0.1), cy + 0.12, z], 6);
        }
      }
      poleTops.push({ x, z });
    }
  }

  // Catenary spans between consecutive poles on each side, both crossarms.
  const stations = [...STREET_PROPS_PLACEMENT.poleStationsZ].sort((a, b) => a - b);
  for (const side of [-1, 1]) {
    for (let s = 0; s < stations.length - 1; s += 1) {
      const z0 = stations[s]!;
      const z1 = stations[s + 1]!;
      const x0 = side * (studioRoadHalfWidth(z0) + STREET_PROPS_PLACEMENT.poleOffsetM);
      const x1 = side * (studioRoadHalfWidth(z1) + STREET_PROPS_PLACEMENT.poleOffsetM);
      for (const cy of dims.crossarmY) {
        for (const end of [-1, 1]) {
          const attachY = cy + 0.18;
          const start = new THREE.Vector3(x0 + end * (dims.crossarmWidth / 2 - 0.1), attachY, z0);
          const finish = new THREE.Vector3(x1 + end * (dims.crossarmWidth / 2 - 0.1), attachY, z1);
          const mid = start.clone().lerp(finish, 0.5);
          mid.y -= dims.wireSagM;
          const curve = new THREE.QuadraticBezierCurve3(start, mid, finish);
          push(new THREE.TubeGeometry(curve, 12, dims.wireRadius, 5), 'wire');
          wireCount += 1;
        }
      }
    }
  }

  // Transformer cans on one pole per side (pole-plate hardware read).
  for (const [side, z] of [[1, -20], [-1, 20]] as const) {
    const x = side * (studioRoadHalfWidth(z) + STREET_PROPS_PLACEMENT.poleOffsetM);
    cylinder('wire', 0.28, 0.28, 0.75, [x - side * 0.45, 5.4, z], 12);
    box('wire', [0.5, 0.08, 0.08], [x - side * 0.22, 5.85, z]);
  }

  // North-entrance welcome gantry: blank timber boards on a post frame
  // straddling the back road (dedicated plate shows unpainted blank planks).
  const signZ = STREET_PROPS_PLACEMENT.signZ;
  const signPostX = studioRoadHalfWidth(signZ) + 0.9;
  for (const side of [-1, 1]) {
    box('timber', [0.28, dims.signPostHeight, 0.28], [side * signPostX, dims.signPostHeight / 2, signZ]);
    box('timber', [0.4, 0.1, 0.4], [side * signPostX, dims.signPostHeight + 0.05, signZ]);
  }
  box('timber', [signPostX * 2 + 0.6, 0.35, 0.25], [0, dims.signBeamY, signZ]);
  const board = dims.signBoard;
  box('timber', [board.width, board.height, board.depth], [0, board.centreY, signZ]);
  for (const side of [-1, 1]) {
    box('wire', [0.08, dims.signBeamY - (board.centreY + board.height / 2), 0.06], [
      side * (board.width / 2 - 0.2),
      (dims.signBeamY + (board.centreY + board.height / 2)) / 2,
      signZ,
    ]);
  }

  // Stone entry pillars with white globe lamps at both fence ends.
  const pillar = dims.pillar;
  let pillarCount = 0;
  for (const pz of STREET_PROPS_PLACEMENT.pillarZ) {
    const px = studioRoadHalfWidth(pz) + STREET_PROPS_PLACEMENT.pillarOffsetM;
    for (const side of [-1, 1]) {
      box('stone', [pillar.width, pillar.height, pillar.width], [side * px, pillar.height / 2, pz]);
      box('stone', [pillar.width + 0.2, 0.14, pillar.width + 0.2], [side * px, pillar.capY, pz]);
      const globeGeometry = new THREE.SphereGeometry(pillar.globeRadius, 14, 10);
      globeGeometry.translate(side * px, pillar.globeY, pz);
      push(globeGeometry, 'globe');
      pillarCount += 1;
    }
  }

  const materials: Record<StreetPropRole, THREE.Material> = {
    timber: timberSurface,
    stone,
    wire,
    porcelain,
    globe,
  };
  let triangles = 0;
  let drawGroups = 0;
  for (const [role, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[role]);
    mesh.name = `world-studio-street-props-${role}`;
    mesh.castShadow = role === 'timber' || role === 'stone';
    mesh.receiveShadow = role === 'timber' || role === 'stone';
    root.add(mesh);
    triangles += (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
    drawGroups += 1;
  }
  applyPresentationContract(root);

  const stats: StreetPropsStats = Object.freeze({
    poles: poleTops.length,
    wires: wireCount,
    pillars: pillarCount,
    triangles: Math.round(triangles),
    drawGroups,
  });

  const dispose = (): void => {
    root.clear();
    disposeSubtree(root);
    timberSurface.dispose();
    concreteSurface.dispose();
    stone.dispose();
    wire.dispose();
    porcelain.dispose();
    globe.dispose();
  };

  return { root, ready: Promise.resolve(), dispose, stats };
}
