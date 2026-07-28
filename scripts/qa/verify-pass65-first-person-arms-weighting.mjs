import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { REQUIRED_ARM_BLEND_PAIRS } from './pass65-crossbow-arms-glb.mjs';

const deliveries = [0, 1].map((lod) => ({
  lod,
  path: `public/assets/original/models/operators/pass65-first-person-arms-lod${lod}.glb`,
}));

const componentMaximum = (accessor) => {
  if (!accessor.getNormalized()) return 1;
  switch (accessor.getComponentType()) {
    case 5120: return 127;
    case 5121: return 255;
    case 5122: return 32_767;
    case 5123: return 65_535;
    default: return 1;
  }
};

const canonicalPair = (left, right) => [left, right].sort().join(':');

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const reports = [];
const failures = [];
for (const delivery of deliveries) {
  const document = await io.read(delivery.path);
  const root = document.getRoot();
  const pairCounts = new Map();
  let vertices = 0;
  let blendedVertices = 0;
  let normalizedVertices = 0;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const joints = skin.listJoints().map((joint) => joint.getName());
    for (const primitive of mesh.listPrimitives()) {
      const jointAccessor = primitive.getAttribute('JOINTS_0');
      const weightAccessor = primitive.getAttribute('WEIGHTS_0');
      if (!jointAccessor || !weightAccessor) {
        failures.push(`${delivery.path}: skinned primitive lacks JOINTS_0/WEIGHTS_0`);
        continue;
      }
      const jointArray = jointAccessor.getArray();
      const weightArray = weightAccessor.getArray();
      const elementSize = weightAccessor.getElementSize();
      const maximum = componentMaximum(weightAccessor);
      for (let vertex = 0; vertex < weightAccessor.getCount(); vertex += 1) {
        vertices += 1;
        const active = [];
        let sum = 0;
        for (let influence = 0; influence < elementSize; influence += 1) {
          const index = vertex * elementSize + influence;
          const weight = Number(weightArray[index]) / maximum;
          sum += weight;
          if (weight > 0.05) active.push(joints[Number(jointArray[index])]);
        }
        if (Math.abs(sum - 1) <= 0.015) normalizedVertices += 1;
        if (active.length >= 2) {
          blendedVertices += 1;
          for (let left = 0; left < active.length; left += 1) {
            for (let right = left + 1; right < active.length; right += 1) {
              const pair = canonicalPair(active[left], active[right]);
              pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
            }
          }
        }
      }
    }
  }
  const blendedRatio = vertices > 0 ? blendedVertices / vertices : 0;
  if (vertices === 0) failures.push(`${delivery.path}: no skinned vertices decoded`);
  if (normalizedVertices !== vertices) failures.push(`${delivery.path}: ${vertices - normalizedVertices} vertices have non-normalized skin weights`);
  if (blendedVertices < 240 || blendedRatio < 0.08) {
    failures.push(`${delivery.path}: blended weighting too sparse (${blendedVertices}/${vertices}, ratio=${blendedRatio.toFixed(4)})`);
  }
  for (const pair of REQUIRED_ARM_BLEND_PAIRS) {
    if ((pairCounts.get(pair) ?? 0) < 4) failures.push(`${delivery.path}: blended pair ${pair} has fewer than four vertices`);
  }
  reports.push(Object.freeze({
    ...delivery,
    vertices,
    blendedVertices,
    blendedRatio: Number(blendedRatio.toFixed(6)),
    normalizedVertices,
    requiredPairCounts: Object.fromEntries(REQUIRED_ARM_BLEND_PAIRS.map((pair) => [pair, pairCounts.get(pair) ?? 0])),
  }));
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, reports, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, reports }, null, 2));
