import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import type { Node as GltfNode, Primitive as GltfPrimitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import type { TypedArray } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder as ThreeMeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyAuthoredChopperReadability,
  authoredSupportStaticBatchBudget,
  cloneAuthoredSupportStaticGeometryForTransform,
  optimizeAuthoredSupportLevel,
} from './killstreak-presentation';

const SUPPORT_ASSETS = Object.freeze([
  Object.freeze({ family: 'chopper', path: 'pass65-chopper-gunner-lod0.glb', minimumDimension: 12 }),
  Object.freeze({ family: 'care', path: 'pass65-care-aircraft-lod0.glb', minimumDimension: 10 }),
  Object.freeze({ family: 'carpet', path: 'pass65-carpet-aircraft-lod0.glb', minimumDimension: 10 }),
  Object.freeze({ family: 'crate', path: 'pass65-care-crate-lod0.glb', minimumDimension: 4 }),
  Object.freeze({ family: 'hunter', path: 'hunter-drone-lod0.glb', minimumDimension: 1 }),
]);

type RasterMask = Readonly<{ pixels: ReadonlySet<number>; width: number; height: number }>;

function cloneThreeTypedArray(source: ArrayBufferView & { slice(): ArrayBufferView }): TypedArray {
  return source.slice() as unknown as TypedArray;
}

function cloneAccessorAttribute(
  primitive: GltfPrimitive,
  semantic: 'POSITION' | 'NORMAL' | 'TANGENT',
): THREE.BufferAttribute | null {
  const accessor = primitive.getAttribute(semantic);
  const source = accessor?.getArray();
  if (!accessor || !source) return null;
  return new THREE.BufferAttribute(cloneThreeTypedArray(source), accessor.getElementSize(), accessor.getNormalized());
}

function primitiveGeometry(primitive: GltfPrimitive): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [semantic, name] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TANGENT', 'tangent'],
  ] as const) {
    const attribute = cloneAccessorAttribute(primitive, semantic);
    if (attribute) geometry.setAttribute(name, attribute);
  }
  const texcoord = primitive.getAttribute('TEXCOORD_0');
  const texcoordArray = texcoord?.getArray();
  if (texcoord && texcoordArray) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(
      cloneThreeTypedArray(texcoordArray),
      texcoord.getElementSize(),
      texcoord.getNormalized(),
    ));
  }
  const indices = primitive.getIndices();
  const indexArray = indices?.getArray();
  if (indices && indexArray) geometry.setIndex(new THREE.BufferAttribute(cloneThreeTypedArray(indexArray), 1, false));
  return geometry;
}

function decodedPositionBounds(primitive: GltfPrimitive, matrix: THREE.Matrix4): THREE.Box3 {
  const positions = primitive.getAttribute('POSITION');
  if (!positions) throw new Error('Support primitive has no POSITION accessor');
  const bounds = new THREE.Box3();
  const value: number[] = [];
  for (let index = 0; index < positions.getCount(); index += 1) {
    positions.getElement(index, value);
    bounds.expandByPoint(new THREE.Vector3(value[0], value[1], value[2]).applyMatrix4(matrix));
  }
  return bounds;
}

function expectBoxClose(actual: THREE.Box3, expected: THREE.Box3, precision = 4): void {
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(actual.min[axis]).toBeCloseTo(expected.min[axis], precision);
    expect(actual.max[axis]).toBeCloseTo(expected.max[axis], precision);
  }
}

function transformedNodePrimitive(node: GltfNode): Readonly<{
  geometry: THREE.BufferGeometry;
  materialDoubleSided: boolean;
  materialOpaque: boolean;
}> {
  const primitive = node.getMesh()?.listPrimitives()[0];
  if (!primitive) throw new Error(`${node.getName()}: expected one authored primitive`);
  const geometry = primitiveGeometry(primitive);
  const transformed = cloneAuthoredSupportStaticGeometryForTransform(
    geometry,
    new THREE.Matrix4().fromArray(node.getWorldMatrix()),
  );
  geometry.dispose();
  const material = primitive.getMaterial();
  return Object.freeze({
    geometry: transformed,
    materialDoubleSided: material?.getDoubleSided() === true,
    materialOpaque: material?.getAlphaMode() === 'OPAQUE' && (material.getBaseColorFactor()[3] ?? 1) >= 0.99,
  });
}

function projectedMask(
  geometry: THREE.BufferGeometry,
  camera: THREE.PerspectiveCamera,
  width = 320,
  height = 180,
): RasterMask {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const projected = Array.from({ length: position.count }, (_, vertex) => (
    new THREE.Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).project(camera)
  ));
  const triangleVertex = (offset: number): number => index ? index.getX(offset) : offset;
  const count = index?.count ?? position.count;
  const pixels = new Set<number>();
  const edge = (x0: number, y0: number, x1: number, y1: number, x: number, y: number): number => (
    (x - x0) * (y1 - y0) - (y - y0) * (x1 - x0)
  );
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const vertices = [0, 1, 2].map((corner) => projected[triangleVertex(offset + corner)]!);
    if (vertices.some((vertex) => vertex.z < -1 || vertex.z > 1)) continue;
    const [a, b, c] = vertices.map((vertex) => Object.freeze({
      x: (vertex.x + 1) * 0.5 * (width - 1),
      y: (1 - vertex.y) * 0.5 * (height - 1),
    }));
    const area = edge(a.x, a.y, b.x, b.y, c.x, c.y);
    if (Math.abs(area) < 1e-8) continue;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const sampleX = x + 0.5;
        const sampleY = y + 0.5;
        const edge0 = edge(a.x, a.y, b.x, b.y, sampleX, sampleY);
        const edge1 = edge(b.x, b.y, c.x, c.y, sampleX, sampleY);
        const edge2 = edge(c.x, c.y, a.x, a.y, sampleX, sampleY);
        if ((edge0 >= 0 && edge1 >= 0 && edge2 >= 0)
          || (edge0 <= 0 && edge1 <= 0 && edge2 <= 0)) pixels.add(y * width + x);
      }
    }
  }
  return Object.freeze({ pixels, width, height });
}

function intersectionSize(left: ReadonlySet<number>, right: ReadonlySet<number>): number {
  let count = 0;
  for (const pixel of left) if (right.has(pixel)) count += 1;
  return count;
}

function connectedComponentCount(mask: RasterMask): number {
  const remaining = new Set(mask.pixels);
  let components = 0;
  while (remaining.size > 0) {
    components += 1;
    const seed = remaining.values().next().value as number;
    remaining.delete(seed);
    const queue = [seed];
    while (queue.length > 0) {
      const pixel = queue.pop()!;
      const x = pixel % mask.width;
      const y = Math.floor(pixel / mask.width);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= mask.width || nextY < 0 || nextY >= mask.height) continue;
        const next = nextY * mask.width + nextX;
        if (!remaining.delete(next)) continue;
        queue.push(next);
      }
    }
  }
  return components;
}

function windingAgreement(geometry: THREE.BufferGeometry): Readonly<{
  nonDegenerate: number;
  aligned: number;
}> {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const index = geometry.index;
  if (!normal) return Object.freeze({ nonDegenerate: 0, aligned: 0 });
  const triangleVertex = (offset: number): number => index ? index.getX(offset) : offset;
  const count = index?.count ?? position.count;
  let nonDegenerate = 0;
  let aligned = 0;
  const point = (vertex: number): THREE.Vector3 => new THREE.Vector3(
    position.getX(vertex), position.getY(vertex), position.getZ(vertex),
  );
  const vertexNormal = (vertex: number): THREE.Vector3 => new THREE.Vector3(
    normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex),
  );
  for (let offset = 0; offset + 2 < count; offset += 3) {
    const a = triangleVertex(offset);
    const b = triangleVertex(offset + 1);
    const c = triangleVertex(offset + 2);
    const face = point(b).sub(point(a)).cross(point(c).sub(point(a)));
    if (face.lengthSq() < 1e-12) continue;
    nonDegenerate += 1;
    const authored = vertexNormal(a).add(vertexNormal(b)).add(vertexNormal(c));
    if (authored.lengthSq() > 1e-12 && face.normalize().dot(authored.normalize()) > 0) aligned += 1;
  }
  return Object.freeze({ nonDegenerate, aligned });
}

describe('Pass 70 quantized support static-batch geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves exact decoded world bounds for Chopper, Care, Carpet, Crate and Palantir-marked Hunter assets', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const asset of SUPPORT_ASSETS) {
      const document = await io.read(join(
        process.cwd(),
        'public/assets/original/models/support',
        asset.path,
      ));
      const expectedAssetBounds = new THREE.Box3();
      const transformedAssetBounds = new THREE.Box3();
      let primitives = 0;
      let quantizedPositions = 0;
      for (const node of document.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
        for (const primitive of mesh.listPrimitives()) {
          const source = primitiveGeometry(primitive);
          const sourcePosition = source.getAttribute('position');
          if (sourcePosition.array instanceof Int16Array && sourcePosition.normalized) quantizedPositions += 1;
          const expected = decodedPositionBounds(primitive, matrix);
          const transformed = cloneAuthoredSupportStaticGeometryForTransform(source, matrix);
          const actual = transformed.boundingBox;
          expect(actual, `${asset.family}:${node.getName()} transformed bbox`).not.toBeNull();
          expectBoxClose(actual!, expected);
          expect(transformed.boundingSphere?.radius, `${asset.family}:${node.getName()} transformed sphere`)
            .toBeGreaterThan(0);
          expect(transformed.getAttribute('position').array).toBeInstanceOf(Float32Array);
          expect(transformed.getAttribute('position').normalized).toBe(false);
          expect(source.getAttribute('position').array, `${asset.family}:${node.getName()} source retained`)
            .toBeInstanceOf(Int16Array);
          expectedAssetBounds.union(expected);
          transformedAssetBounds.union(actual!);
          primitives += 1;
          source.dispose();
          transformed.dispose();
        }
      }
      expect(quantizedPositions, `${asset.family}: every primitive exercises normalized Int16`).toBe(primitives);
      expectBoxClose(transformedAssetBounds, expectedAssetBounds);
      expect(Math.max(...transformedAssetBounds.getSize(new THREE.Vector3()).toArray()), `${asset.family}: span`)
        .toBeGreaterThan(asset.minimumDimension);
    }
  }, 30_000);

  it('keeps the real LOD0 rear cabin, authored collar, tail boom and fin one visible 60-degree silhouette', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.read(join(
      process.cwd(),
      'public/assets/original/models/support/pass65-chopper-gunner-lod0.glb',
    ));
    const nodes = document.getRoot().listNodes();
    const parts = [
      'Chopper_RearCabin_LOD0',
      'Chopper_TailRootCollar_LOD0',
      'Chopper_TailBoom_LOD0',
      'Chopper_TailFin_LOD0',
    ].map((name) => {
      const node = nodes.find((candidate) => candidate.getName() === name);
      expect(node, `${name}: authored semantic mesh`).toBeDefined();
      return Object.freeze({ name, ...transformedNodePrimitive(node!) });
    });

    for (const part of parts) {
      expect(part.materialDoubleSided, `${part.name}: fixed-camera backface safety`).toBe(true);
      expect(part.materialOpaque, `${part.name}: material contributes colour/depth`).toBe(true);
      const winding = windingAgreement(part.geometry);
      expect(winding.nonDegenerate, `${part.name}: non-degenerate triangles`).toBeGreaterThan(40);
      expect(winding.aligned / winding.nonDegenerate, `${part.name}: authored winding/normal agreement`)
        .toBeGreaterThan(0.9);
    }

    const rearBounds = parts[0]!.geometry.boundingBox!;
    const collarBounds = parts[1]!.geometry.boundingBox!;
    const tailBounds = parts[2]!.geometry.boundingBox!;
    const finBounds = parts[3]!.geometry.boundingBox!;
    const longitudinalOverlap = (left: THREE.Box3, right: THREE.Box3): number => (
      Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z)
    );
    expect(longitudinalOverlap(rearBounds, collarBounds)).toBeGreaterThanOrEqual(0.7);
    expect(longitudinalOverlap(collarBounds, tailBounds)).toBeGreaterThanOrEqual(0.65);
    expect(longitudinalOverlap(tailBounds, finBounds)).toBeGreaterThan(0.8);

    const mergedCore = mergeGeometries(parts.slice(0, 3).map((part) => part.geometry.clone()), false);
    expect(mergedCore, 'real LOD0 rear/collar/tail runtime batch').not.toBeNull();
    mergedCore!.computeBoundingBox();
    mergedCore!.computeBoundingSphere();
    const expectedCoreBounds = rearBounds.clone().union(collarBounds).union(tailBounds);
    expectBoxClose(mergedCore!.boundingBox!, expectedCoreBounds);
    expect(mergedCore!.boundingSphere?.radius).toBeGreaterThan(2);

    const coreBounds = parts.reduce((bounds, part) => bounds.union(part.geometry.boundingBox!), new THREE.Box3());
    const target = coreBounds.getCenter(new THREE.Vector3());
    const size = coreBounds.getSize(new THREE.Vector3());
    for (const side of [-1, 1] as const) {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
      const angle = Math.PI + side * Math.PI / 3;
      const distance = Math.max(...size.toArray()) * 1.8;
      camera.position.set(
        target.x + Math.sin(angle) * distance,
        target.y + size.y * 0.2,
        target.z + Math.cos(angle) * distance,
      );
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const masks = parts.map((part) => projectedMask(part.geometry, camera));
      expect(intersectionSize(masks[0]!.pixels, masks[1]!.pixels), `side ${side}: rear/collar pixels`)
        .toBeGreaterThan(100);
      expect(intersectionSize(masks[1]!.pixels, masks[2]!.pixels), `side ${side}: collar/tail pixels`)
        .toBeGreaterThan(80);
      expect(intersectionSize(masks[2]!.pixels, masks[3]!.pixels), `side ${side}: tail/fin pixels`)
        .toBeGreaterThan(40);
      const unionPixels = new Set(masks.flatMap((mask) => [...mask.pixels]));
      expect(connectedComponentCount(Object.freeze({ pixels: unionPixels, width: 320, height: 180 })),
        `side ${side}: connected rear-to-fin silhouette`).toBe(1);
    }

    mergedCore!.dispose();
    for (const part of parts) part.geometry.dispose();
  }, 30_000);

  it('reduces every real Chopper LOD through the production batcher without losing rear-tail span', async () => {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Object.freeze({
      width: 4,
      height: 4,
      close: () => undefined,
    })));
    const expectedBudgets = Object.freeze([
      // Re-pinned 2026-08-31: the chopper gunner cockpit was reworked for the owner
      // ("the cockpit not stopping midscreen") - the canopy/frame now frames the view
      // at every aspect instead of ending partway across it. sourceMeshes 321 -> 316 and
      // batches 49 -> 47 as redundant frame pieces were removed; visibleMeshes 89 -> 92
      // because more of the cockpit is now actually presented rather than culled.
      // Exterior batch counts are UNCHANGED, which is the part this gate exists to hold:
      // the cockpit is first-person dressing and must not alter the exterior silhouette.
      Object.freeze({ sourceMeshes: 316, batches: 47, visibleMeshes: 92, exteriorBatchMeshes: 19, exteriorBatchMaterials: 15 }),
      // LOD1 moves by the SAME deltas as LOD0 (-5 source, -2 batches, +3 visible),
      // which is the expected signature of a cockpit change: the same authored pieces
      // exist at both detail tiers. Exterior counts unchanged again.
      Object.freeze({ sourceMeshes: 254, batches: 42, visibleMeshes: 89, exteriorBatchMeshes: 19, exteriorBatchMaterials: 15 }),
      // LOD2, same -5/-2/+3 signature. All three tiers moving by an identical delta is
      // itself the evidence that this is the cockpit rework and not an accidental
      // exterior change: exteriorBatchMeshes/Materials are untouched at every tier.
      Object.freeze({ sourceMeshes: 129, batches: 32, visibleMeshes: 68, exteriorBatchMeshes: 17, exteriorBatchMaterials: 13 }),
    ] as const);
    for (const lod of [0, 1, 2] as const) {
      const file = await readFile(join(
        process.cwd(),
        `public/assets/original/models/support/pass65-chopper-gunner-lod${lod}.glb`,
      ));
      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      const gltf = await new GLTFLoader()
        .setMeshoptDecoder(ThreeMeshoptDecoder)
        .parseAsync(buffer, '');
      applyAuthoredChopperReadability(gltf.scene);
      await optimizeAuthoredSupportLevel(gltf.scene, 'chopper', gltf.animations);
      const budget = authoredSupportStaticBatchBudget(gltf.scene);
      expect(budget, `LOD${lod}: frozen production batch budget`).toMatchObject(expectedBudgets[lod]);
      expect(budget.batches, `LOD${lod}: every authored batch is resident`).toBe(budget.batchOutputMeshes);
      expect(budget.sourceMeshes, `LOD${lod}: every batched source is retired`).toBe(budget.retiredSourceMeshes);
      // Floor lowered 130 -> 120 on 2026-08-31. This guards that the batcher is being
      // exercised on a NON-TRIVIAL workload - it is not a product requirement and it
      // does not pin a count (the exact per-LOD counts are pinned above). LOD2 is the
      // lowest detail tier and sat at 134; the cockpit rework legitimately took it to
      // 129, one below a floor that was only ever set just under the then-current value.
      // 129 still batches 32 outputs from 129 sources, which is the thing being tested.
      // If any tier ever approaches 120, that IS worth looking at rather than lowering again.
      expect(budget.sourceMeshes, `LOD${lod}: materially reduces first-use primitives`).toBeGreaterThan(120);
      expect(budget.visibleMeshes, `LOD${lod}: bounded post-batch drawables`).toBeLessThanOrEqual(100);
      expect(budget.stableVisibleMeshes, `LOD${lod}: bounded exterior drawables`).toBeLessThanOrEqual(45);
      expect(budget.exteriorBatchMeshes, `LOD${lod}: bounded static exterior batches`).toBeLessThanOrEqual(19);
      expect(budget.exteriorBatchMaterials, `LOD${lod}: bounded static exterior materials`).toBeLessThanOrEqual(15);
      expect(budget.rearTailBatchMeshes, `LOD${lod}: rear-tail merged batch`).toBeGreaterThan(0);
      expect(budget.rearTailBatchMeshes, `LOD${lod}: rear-tail merge count`).toBeLessThanOrEqual(3);
      expect(budget.rearTailBatchBounds, `LOD${lod}: rear-tail bounds`).not.toBeNull();
      expect(
        budget.rearTailBatchBounds!.max[2]! - budget.rearTailBatchBounds!.min[2]!,
        `LOD${lod}: connected rear-tail longitudinal span`,
      ).toBeGreaterThan(4.8);
    }
  }, 30_000);
});
