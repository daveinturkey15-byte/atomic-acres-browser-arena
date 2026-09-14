#!/usr/bin/env tsx
/**
 * nuketown2-surface-quality-census.mjs — DAY-2 NIGHT lane MATERIALS-HOUSE-VEHICLES gate.
 *
 * Builds `buildNuketown2(new THREE.Scene()).root` in node, walks the graph, and
 * prints JSON with: total node/total materials, distinct graph count (via the
 * `materialGraphKey` signature copied from src/nuketown2-pipeline-budget.test.ts),
 * the count + NAMES of materials carrying a `normalNode`, per-owned-material
 * {name, meshes, hasNormalNode, metalness, roughness, type}, and for every owned
 * opaque material its declared grain/scuff/traffic/soil/readDistanceM plus the
 * `albedoWearStep(spec)` and `maxDarkening(spec)` values as raw numbers.
 *
 * Owned specs are read off `material.userData.nuketown2Spec` (plain data the
 * rewritten factories stash). Materials without one print null declarations.
 *
 * Exit non-zero when an acceptance row A1–A6 fails. This script IS the gate.
 *
 * Usage: npx tsx scripts/qa/nuketown2-surface-quality-census.mjs [--json <path>]
 */
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { buildNuketown2 } from '../../src/nuketown2-arena.ts';
import { albedoWearStep, maxDarkening } from '../../src/nuketown2-materials/spec.ts';

const NON_SHADER_KEYS = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);

function graphSignature(value, seen = new Map()) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  const object = value;
  if (object.isNode !== true) {
    if (object instanceof THREE.Color) return 'color';
    if (object instanceof THREE.Vector3) return `vector:${object.x},${object.y},${object.z}`;
    return `object:${object.constructor?.name ?? 'unknown'}`;
  }
  const prior = seen.get(object);
  if (prior) return prior;
  seen.set(object, '<recursive>');
  const parts = [object.type ?? object.constructor?.name ?? '?'];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key) || typeof object[key] === 'function') continue;
    if (object.isUniformNode && key === 'value') {
      parts.push(`${key}=<uniform>`);
      continue;
    }
    const child = object[key];
    parts.push(`${key}=${Array.isArray(child)
      ? `[${child.map((entry) => graphSignature(entry, seen)).join(',')}]`
      : graphSignature(child, seen)}`);
  }
  const result = `(${parts.join(' ')})`;
  seen.set(object, result);
  return result;
}

function materialGraphKey(material) {
  const slots = material;
  const nodes = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && slots[key]?.isNode === true)
    .sort();
  return `${material.type}|${nodes.map((key) => `${key}=${graphSignature(slots[key])}`).join('|')}`;
}

// The 25 surfaces this lane owns (§3.1). Glass x3 exempt from relief, gated on metalness.
const OWNED_OPAQUE = [
  'nuketown2-drywall-dbd1ba',
  'nuketown2-house-wood-floor',
  'nuketown2-garage-floor-concrete',
  'nuketown2-automotive-chrome',
  'nuketown2-tire-rubber',
  'nuketown2-car-aqua',
  'nuketown2-car-saloon-navy',
  'nuketown2-car-classic-jade',
  'nuketown2-coach-shell',
  'nuketown2-truck-cab',
  'nuketown2-truck-box-ribbed',
  'vehicle-forge-chrome',
  'vehicle-forge-tyre',
  'vehicle-forge-lining',
  'nuketown2-forge-coach',
  'nuketown2-forge-coach-accent',
  'nuketown2-forge-truck',
  'nuketown2-forge-truck-accent',
  'nuketown2-forge-saloon',
  'nuketown2-forge-saloon-accent',
  'nuketown2-forge-coupe',
  'nuketown2-forge-coupe-accent',
];
const OWNED_GLASS = ['nuketown2-window-glass', 'nuketown2-vehicle-glass', 'vehicle-forge-glass'];
const OWNED = [...OWNED_OPAQUE, ...OWNED_GLASS];

const scene = new THREE.Scene();
const { root } = buildNuketown2(scene);

const materials = new Map();
const meshCounts = new Map();
root.traverse((object) => {
  const holder = object;
  const list = Array.isArray(holder.material)
    ? holder.material
    : holder.material ? [holder.material] : [];
  for (const material of list) {
    if (!materials.has(material.uuid)) materials.set(material.uuid, material);
    if (object.isMesh) meshCounts.set(material.uuid, (meshCounts.get(material.uuid) ?? 0) + 1);
  }
});
const all = [...materials.values()];
const nodeMaterials = all.filter((m) => m.isNodeMaterial === true);
const withNormal = nodeMaterials.filter((m) => m.normalNode?.isNode === true);
const distinctGraphs = new Set(nodeMaterials.map((m) => {
  try { return materialGraphKey(m); } catch { return `error:${m.name}`; }
}));

const byName = new Map(nodeMaterials.map((m) => [m.name, m]));
// Non-node materials with owned names still count as owned rows (they fail relief).
for (const m of all) {
  if (!m.isNodeMaterial && OWNED.includes(m.name) && ![...byName.keys()].includes(m.name)) {
    byName.set(m.name, m);
  }
}

const ownedRows = OWNED.map((name) => {
  const m = byName.get(name);
  if (!m) return { name, present: false };
  const spec = m.userData?.nuketown2Spec ?? null;
  let declared = {
    grainM: null, scuffM: null, trafficM: null, soil: null, readDistanceM: null,
    albedoWearStep: null, maxDarkening: null,
  };
  if (spec) {
    try {
      declared = {
        grainM: spec.grain?.sizeM ?? null,
        scuffM: spec.scuff?.sizeM ?? null,
        trafficM: spec.traffic?.sizeM ?? null,
        soil: spec.soil ?? null,
        readDistanceM: spec.readDistanceM ?? 0.5,
        albedoWearStep: albedoWearStep(spec),
        maxDarkening: maxDarkening(spec),
      };
    } catch (error) {
      declared = { ...declared, error: String(error).slice(0, 200) };
    }
  }
  return {
    name,
    present: true,
    meshes: meshCounts.get(m.uuid) ?? 0,
    hasNormalNode: m.normalNode?.isNode === true,
    metalness: m.metalness ?? null,
    roughness: m.roughness ?? null,
    type: m.type ?? null,
    isNodeMaterial: m.isNodeMaterial === true,
    declared,
  };
});

// A1: owned opaque with normalNode. A3/A4: declaration gates over owned opaque.
const opaqueRows = ownedRows.filter((r) => OWNED_OPAQUE.includes(r.name));
const glassRows = ownedRows.filter((r) => OWNED_GLASS.includes(r.name));
const carPaintRows = ownedRows.filter((r) =>
  ['nuketown2-car-aqua', 'nuketown2-car-saloon-navy', 'nuketown2-car-classic-jade'].includes(r.name));
const inBand = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;
const a1 = opaqueRows.filter((r) => r.present && r.hasNormalNode).length;
const a3 = opaqueRows.filter((r) => r.present
  && inBand(r.declared?.grainM, 0.0005, 0.0015)
  && inBand(r.declared?.scuffM, 0.020, 0.080)
  && inBand(r.declared?.trafficM, 0.5, 3.0)).length;
const a4 = opaqueRows.filter((r) => r.present
  && typeof r.declared?.albedoWearStep === 'number' && r.declared.albedoWearStep >= 0.10
  && typeof r.declared?.maxDarkening === 'number' && r.declared.maxDarkening <= 0.45).length;
const a5 = glassRows.every((r) => r.present && typeof r.metalness === 'number' && r.metalness <= 0.02);
const a6 = carPaintRows.length === 3
  && carPaintRows.every((r) => r.present && typeof r.metalness === 'number' && r.metalness <= 0.05
    && (byName.get(r.name)?.clearcoat !== undefined || byName.get(r.name)?.isMeshPhysicalNodeMaterial === true || String(byName.get(r.name)?.type ?? '').includes('Physical')));
// N16: the three car paints share ONE uniform-carried graph.
let carPaintGraphs = [];
try {
  carPaintGraphs = carPaintRows.filter((r) => r.present).map((r) => materialGraphKey(byName.get(r.name)));
} catch { carPaintGraphs = ['error']; }
const n16 = new Set(carPaintGraphs).size <= 1 && carPaintGraphs.length === 3;

const result = {
  totals: {
    nodeMaterials: nodeMaterials.length,
    totalMaterials: all.length,
    distinctGraphs: distinctGraphs.size,
    withNormalNode: withNormal.length,
    withNormalNodeNames: withNormal.map((m) => m.name).sort(),
  },
  owned: ownedRows,
  gates: {
    A1_ownedOpaqueWithRelief: `${a1}/22`,
    A2_arenaWithRelief: `${withNormal.length}/${nodeMaterials.length}`,
    A3_specsInBand: `${a3}/22`,
    A4_wearBounds: `${a4}/22`,
    A5_glassMetalness: a5 ? 'pass' : 'fail',
    A6_carPaintPhysical: a6 ? 'pass' : 'fail',
    N16_carPaintOneGraph: n16 ? 'pass' : 'fail',
  },
};

const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
  writeFileSync(process.argv[jsonIndex + 1], JSON.stringify(result, null, 2));
}
console.log(JSON.stringify(result, null, 2));

const failures = [];
if (a1 !== 22) failures.push(`A1 ${a1}/22`);
if (withNormal.length < 44) failures.push(`A2 ${withNormal.length} < 44`);
if (a3 !== 22) failures.push(`A3 ${a3}/22`);
if (a4 !== 22) failures.push(`A4 ${a4}/22`);
if (!a5) failures.push('A5 glass metalness');
if (!a6) failures.push('A6 car paint physical');
if (failures.length > 0) {
  console.error(`CENSUS FAIL: ${failures.join('; ')}`);
  process.exit(1);
}
console.error('CENSUS PASS');
