#!/usr/bin/env tsx
/**
 * audit-arena-draw-calls.mts - PASS 95 per-arena draw-call / instancing audit.
 *
 * Method: the `threejs-frame-loop-audit` skill. Two things are reported and
 * never mixed:
 *
 *   1. STATIC SUBMISSION COST - what the arena asks the renderer to submit for
 *      one camera: draw calls (one per visible mesh; an InstancedMesh is ONE
 *      draw; a THREE.LOD contributes ONE draw at the level its distance
 *      selects; a BatchedMesh is ONE draw), triangles, distinct geometries,
 *      distinct materials, distinct textures, and shadow-casting draws.
 *   2. FRAME-LOOP EXPOSURE - how much of that static set the matrix-update
 *      walk touches every frame. `matrixAutoUpdate === true` on a node that
 *      never moves is r185's per-frame recompose tax (see the pass94
 *      `three-r185-matrix-recompose` gotcha): every auto node recomposes its
 *      local matrix and its world matrix every frame whether or not anything
 *      changed.
 *
 * WHY NODE AND NOT A BROWSER. The arena builders are pure scene-graph
 * construction; the counts above are properties of the graph they return, not
 * of a GPU. Counting here is deterministic, reruns in seconds, and can be
 * asserted by a unit test. A browser run is a separate, additive check that
 * confirms `renderer.info.render.calls` agrees with this walk; it is not the
 * source of the budget numbers.
 *
 * LOD accounting: `near` charges every LOD its level-0 mesh (an unreachable
 * worst case); `typical` charges the level a camera at the arena's review
 * station would select. Both are printed - quoting only the worst case
 * overstates a design whose whole point is that the worst case cannot happen.
 *
 * Usage: npx tsx scripts/qa/audit-arena-draw-calls.mts [--json <path>] [--arenas a,b]
 */
import * as THREE from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { arenaReviewStation } from '../../src/arena-draw-call-budget';

export type ArenaCounts = {
  drawCallsNear: number;
  drawCallsTypical: number;
  triangles: number;
  meshNodes: number;
  instancedMeshes: number;
  instancedInstances: number;
  batchedMeshes: number;
  lodNodes: number;
  geometries: number;
  materials: number;
  textures: number;
  texturesWithoutMipmaps: number;
  texturesOver1024: number;
  shadowCasters: number;
  shadowReceivers: number;
  totalNodes: number;
  autoUpdateNodes: number;
  autoUpdateStaticNodes: number;
  approxGeometryBytes: number;
  duplicateMaterialGroups: number;
  duplicateMaterialWaste: number;
  topRepeats: Array<{ key: string; count: number }>;
};

function triangleCount(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

function geometryBytes(geometry: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const attribute of Object.values(geometry.attributes)) {
    const typed = (attribute as THREE.BufferAttribute).array as ArrayLike<number> & {
      BYTES_PER_ELEMENT?: number;
    };
    bytes += (typed.length ?? 0) * (typed.BYTES_PER_ELEMENT ?? 4);
  }
  if (geometry.index) {
    const array = geometry.index.array as ArrayLike<number> & { BYTES_PER_ELEMENT?: number };
    bytes += (array.length ?? 0) * (array.BYTES_PER_ELEMENT ?? 4);
  }
  return bytes;
}

/**
 * A coarse "would these two materials have been the same object" signature.
 * Deliberately conservative: type + colour + the flags that change a pipeline.
 * A hit here is a review prompt, not an automatic finding.
 */
function materialSignature(material: THREE.Material): string {
  const anyMaterial = material as unknown as Record<string, unknown>;
  const colour = anyMaterial.color as THREE.Color | undefined;
  const map = anyMaterial.map as THREE.Texture | null | undefined;
  return [
    material.type,
    colour ? colour.getHexString() : '-',
    String(anyMaterial.roughness ?? '-'),
    String(anyMaterial.metalness ?? '-'),
    String(anyMaterial.transparent ?? false),
    String(anyMaterial.opacity ?? 1),
    String(material.side),
    String((anyMaterial.emissive as THREE.Color | undefined)?.getHexString() ?? '-'),
    map ? map.uuid : '-',
    String(anyMaterial.wireframe ?? false),
    String(anyMaterial.depthWrite ?? true),
  ].join('|');
}

function collectTextures(material: THREE.Material, into: Map<string, THREE.Texture>): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    const texture = value as THREE.Texture | null;
    if (texture && (texture as THREE.Texture).isTexture === true) {
      into.set(texture.uuid, texture);
    }
  }
}

/** Nodes that are not animated by construction. */
function isStaticCandidate(node: THREE.Object3D): boolean {
  return node.userData?.dynamic !== true
    && (node as unknown as { isBone?: boolean }).isBone !== true
    && (node as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh !== true;
}

export function auditScene(root: THREE.Object3D, station: THREE.Vector3): ArenaCounts {
  root.updateMatrixWorld(true);
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.Material>();
  const textures = new Map<string, THREE.Texture>();
  const signatures = new Map<string, Set<string>>();
  const repeats = new Map<string, number>();
  const world = new THREE.Vector3();

  const counts: ArenaCounts = {
    drawCallsNear: 0,
    drawCallsTypical: 0,
    triangles: 0,
    meshNodes: 0,
    instancedMeshes: 0,
    instancedInstances: 0,
    batchedMeshes: 0,
    lodNodes: 0,
    geometries: 0,
    materials: 0,
    textures: 0,
    texturesWithoutMipmaps: 0,
    texturesOver1024: 0,
    shadowCasters: 0,
    shadowReceivers: 0,
    totalNodes: 0,
    autoUpdateNodes: 0,
    autoUpdateStaticNodes: 0,
    approxGeometryBytes: 0,
    duplicateMaterialGroups: 0,
    duplicateMaterialWaste: 0,
    topRepeats: [],
  };

  const chargeMesh = (mesh: THREE.Mesh, charge: 'both' | 'near' | 'typical'): void => {
    if (charge !== 'typical') counts.drawCallsNear += 1;
    if (charge !== 'near') counts.drawCallsTypical += 1;
    if (charge !== 'both') return;
    counts.meshNodes += 1;
    const instanced = mesh as THREE.InstancedMesh;
    const batched = mesh as unknown as { isBatchedMesh?: boolean };
    const instances = instanced.isInstancedMesh === true ? instanced.count : 1;
    if (instanced.isInstancedMesh === true) {
      counts.instancedMeshes += 1;
      counts.instancedInstances += instances;
    }
    if (batched.isBatchedMesh === true) counts.batchedMeshes += 1;
    if (mesh.castShadow) counts.shadowCasters += 1;
    if (mesh.receiveShadow) counts.shadowReceivers += 1;
    if (mesh.geometry) {
      counts.triangles += triangleCount(mesh.geometry) * instances;
      if (!geometries.has(mesh.geometry.uuid)) {
        geometries.set(mesh.geometry.uuid, mesh.geometry);
        counts.approxGeometryBytes += geometryBytes(mesh.geometry);
      }
    }
    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materialList) {
      if (!material) continue;
      materials.set(material.uuid, material);
      collectTextures(material, textures);
      const signature = materialSignature(material);
      let bucket = signatures.get(signature);
      if (!bucket) {
        bucket = new Set();
        signatures.set(signature, bucket);
      }
      bucket.add(material.uuid);
    }
    const first = materialList[0];
    if (mesh.geometry && first && instanced.isInstancedMesh !== true) {
      const key = `${mesh.geometry.uuid}:${first.uuid}`;
      repeats.set(key, (repeats.get(key) ?? 0) + 1);
    }
  };

  const visit = (node: THREE.Object3D): void => {
    counts.totalNodes += 1;
    if (node.matrixAutoUpdate) {
      counts.autoUpdateNodes += 1;
      if (isStaticCandidate(node)) counts.autoUpdateStaticNodes += 1;
    }
    if (node.visible === false) return;
    const lod = node as THREE.LOD;
    if (lod.isLOD === true) {
      counts.lodNodes += 1;
      lod.getWorldPosition(world);
      const distance = world.distanceTo(station);
      const near = lod.levels[0]?.object;
      let typical = lod.levels[0]?.object;
      for (const level of lod.levels) {
        if (distance >= level.distance) typical = level.object;
      }
      if (near) chargeMesh(near as THREE.Mesh, near === typical ? 'both' : 'near');
      if (typical && typical !== near) chargeMesh(typical as THREE.Mesh, 'typical');
      return;
    }
    if ((node as THREE.Mesh).isMesh === true) chargeMesh(node as THREE.Mesh, 'both');
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);

  counts.geometries = geometries.size;
  counts.materials = materials.size;
  counts.textures = textures.size;
  for (const texture of textures.values()) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    if (texture.generateMipmaps === false && texture.minFilter === THREE.LinearFilter) {
      counts.texturesWithoutMipmaps += 1;
    }
    if (image && Math.max(image.width ?? 0, image.height ?? 0) > 1024) counts.texturesOver1024 += 1;
  }
  for (const bucket of signatures.values()) {
    if (bucket.size > 1) {
      counts.duplicateMaterialGroups += 1;
      counts.duplicateMaterialWaste += bucket.size - 1;
    }
  }
  counts.topRepeats = [...repeats.entries()]
    .filter(([, count]) => count >= 8)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([key, count]) => ({ key, count }));
  counts.triangles = Math.round(counts.triangles);
  return counts;
}

/**
 * Review stations, one per arena. Single copy: `src/arena-draw-call-budget.ts`
 * owns them because the vitest ratchet must select the same LOD levels this
 * script measures. Two copies of a station table is two different budgets.
 */
export { ARENA_REVIEW_STATIONS as REVIEW_STATIONS } from '../../src/arena-draw-call-budget';

export async function buildersById(): Promise<Record<string, (scene: THREE.Scene) => unknown>> {
  const [map, additional, farcrysisModule, highSeas, testMaps, nuketown2, raid2] = await Promise.all([
    import('../../src/map'),
    import('../../src/additional-maps'),
    import('../../src/farcrysis'),
    import('../../src/high-seas'),
    import('../../src/test-maps'),
    import('../../src/nuketown2-arena'),
    import('../../src/raid2-arena'),
  ]);
  return {
    nuketown2: nuketown2.buildNuketown2 as never,
    raid2: raid2.buildRaid2 as never,
    'atomic-acres': map.buildArena as never,
    'skyline-terminal': additional.buildSkylineTerminal as never,
    'rustworks-1v1': additional.buildRustworks1v1 as never,
    'gun-range': additional.buildGunRange as never,
    farcrysis: farcrysisModule.buildFarcrysis as never,
    'high-seas': highSeas.buildHighSeas as never,
    test1: testMaps.buildTest1 as never,
    test2: testMaps.buildTest2 as never,
  };
}

export type ArenaAudit = {
  /** The authored graph, exactly as the arena builder returns it. */
  authored: ArenaCounts;
  /**
   * What the renderer is actually asked to submit in the owner's default
   * Quality profile: after `batchStaticMeshes(root, root, () => '',
   * 'preserve')` - the same call `batchSelectedArenaPresentation()` makes -
   * and after `freezeStaticArenaMatrices()`.
   */
  submitted: ArenaCounts;
  /** Nodes `freezeStaticArenaMatrices` actually froze on the batched graph. */
  frozenByArenaFreeze: number;
};

export async function auditArena(id: string): Promise<ArenaAudit> {
  const builders = await buildersById();
  const build = builders[id];
  if (!build) throw new Error(`audit-arena-draw-calls: no builder for arena '${id}'`);
  const [{ batchStaticMeshes }, { freezeStaticArenaMatrices }] = await Promise.all([
    import('../../src/art-kit'),
    import('../../src/static-matrix-freeze'),
  ]);
  const scene = new THREE.Scene();
  const arena = build(scene) as { root: THREE.Object3D };
  const station = arenaReviewStation(id);
  const authored = auditScene(arena.root, station);
  // The owner's default profile is `blender` (Quality) -> 'preserve'.
  batchStaticMeshes(arena.root, arena.root, () => '', 'preserve');
  const frozenByArenaFreeze = freezeStaticArenaMatrices(arena.root);
  const submitted = auditScene(arena.root, station);
  return { authored, submitted, frozenByArenaFreeze };
}

async function main(): Promise<void> {
  const jsonIndex = process.argv.indexOf('--json');
  const jsonPath = jsonIndex >= 0 ? process.argv[jsonIndex + 1] : undefined;
  const arenasIndex = process.argv.indexOf('--arenas');
  const builders = await buildersById();
  const ids = arenasIndex >= 0
    ? process.argv[arenasIndex + 1].split(',').map((value) => value.trim()).filter(Boolean)
    : Object.keys(builders);

  const report: Record<string, unknown> = {};
  for (const id of ids) {
    const started = process.hrtime.bigint();
    let audit: ArenaAudit | null = null;
    let error: string | null = null;
    try {
      audit = await auditArena(id);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    const buildMs = Number(process.hrtime.bigint() - started) / 1e6;
    report[id] = error ? { error } : { ...audit, buildMs: Number(buildMs.toFixed(1)) };
    if (error) {
      console.log(`${id.padEnd(16)} BUILD FAILED: ${error}`);
    } else if (audit) {
      const { authored, submitted } = audit;
      console.log(
        `${id.padEnd(16)} authoredDraws=${String(authored.drawCallsTypical).padStart(5)}`
        + ` submittedDraws=${String(submitted.drawCallsTypical).padStart(5)}`
        + ` tris=${String(submitted.triangles).padStart(9)}`
        + ` geo=${String(submitted.geometries).padStart(4)}`
        + ` mat=${String(submitted.materials).padStart(4)}`
        + ` tex=${String(submitted.textures).padStart(3)}`
        + ` inst=${String(submitted.instancedMeshes).padStart(3)}/${submitted.instancedInstances}`
        + ` cast=${String(submitted.shadowCasters).padStart(4)}`
        + ` autoStatic=${String(submitted.autoUpdateStaticNodes).padStart(5)}/${submitted.totalNodes}`
        + ` frozen=${audit.frozenByArenaFreeze}`,
      );
    }
  }
  if (jsonPath) {
    const target = resolve(process.cwd(), jsonPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`\nwrote ${target}`);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/gu, '/').endsWith('audit-arena-draw-calls.mts');
if (invokedDirectly) {
  main().catch((cause) => {
    console.error(cause);
    process.exit(1);
  });
}
