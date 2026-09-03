#!/usr/bin/env tsx
// HF-434 Z-FIGHTING instrument: list every pair of nuketown2 meshes whose
// horizontal TOP faces are within 0.03 m of each other in y AND whose plan
// footprints overlap — the geometry class that z-fights, because two
// up-facing surfaces a few millimetres apart race for the same depth samples.
//
// Depth-precision context (owner complaint "loads of z-fighting all through the
// map", PASS 91): the on-foot camera near plane is
// FIRST_PERSON_CAMERA_NEAR_METERS = 0.02 m with far 180 m, so depth precision is
// roughly 1 cm at 60 m. A 0.02 m authored offset therefore flickers at range,
// and an exact coplanar pair flickers everywhere.
//
// What is counted, and what is not:
//   - TOP-facing horizontal faces only (each mesh's y-max plane). Two solids
//     resting on each other (a roof deck's buried bottom face against a wall's
//     top face) are construction contact, not a depth race: the upper body's
//     bottom face is backface-culled from above and the upper body occludes the
//     contact from every outside view. The decal-on-floor race is the class the
//     owner can see.
//   - Classes. A pair whose two materials are the SAME OBJECT renders identical
//     fragments from identical +y faces under identical lighting: a depth race
//     between them cannot produce a visible artifact, so it is reported as
//     SAME-MATERIAL (benign), never as a finding. A pair with DIFFERENT
//     materials is a FINDING unless the surface that draws on top carries a
//     polygonOffset (factor < 0), which pins the race deterministically at
//     every range on both the WebGPU and WebGL2 backends — the same tiering
//     HF-346 shipped on the Skyline apron. The pass target is zero FINDINGS.
//   - Presentation decals are batched by `batchPresentationOnlyBoxes` into
//     merged meshes whose member boxes lose their names. Each batch member is
//     audited through its hidden SOURCE node instead — the same geometry, the
//     same transform, and the same material object the batch reuses — so every
//     row names a real authored piece, and nothing is counted twice.

import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { buildNuketown2 } from '../../src/nuketown2-arena';

const NEAR_METERS = 0.03;

type Box = {
  name: string;
  materialId: string;
  materialName: string;
  polygonOffsetFactor: number;
  x0: number; x1: number; z0: number; z1: number;
  top: number;
};

function offsetFactorOf(mesh: THREE.Mesh): number {
  const material = mesh.material;
  if (Array.isArray(material)) return Math.min(...material.map((entry) => (entry.polygonOffsetFactor ?? 0)));
  return material.polygonOffsetFactor ?? 0;
}

function materialIdOf(mesh: THREE.Mesh): string {
  const material = mesh.material;
  if (Array.isArray(material)) return material.map((entry) => entry.uuid).join('|');
  return material.uuid;
}

function materialNameOf(mesh: THREE.Mesh): string {
  const material = mesh.material as THREE.Material & { name?: string };
  if (Array.isArray(material)) return material.map((entry) => entry.name || entry.type).join('|');
  return material.name || material.type;
}

function collectBoxes(): { boxes: Box[]; skipped: number; skippedNames: string[] } {
  const scene = new THREE.Scene();
  const map = buildNuketown2(scene);
  const boxes: Box[] = [];
  let skipped = 0;
  const skippedNames: string[] = [];
  // REVIEW FIX (Opus, PASS 92): TRAVERSE, do not iterate the direct children.
  // The arena root also carries three art GROUPS - the instanced lawn field,
  // the forest ring and the mountain backdrop - and iterating `children` walked
  // straight past all sixteen of their meshes WITHOUT COUNTING THEM, so the
  // report's own "skipped: 0" line claimed a complete audit it had not done.
  // They are still not auditable here (instanced or non-parametric geometry
  // rather than authored axis-aligned boxes), but they are now COUNTED and
  // NAMED, so "0 FINDINGS" is a scoped claim and the unaudited classes are
  // visible to whoever reads the evidence.
  map.root.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  map.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // Batch meshes are skipped: their members are audited through the hidden
    // source nodes, which carry the names and the exact same material objects.
    // The test is `sourceMeshes`, the marker `batchPresentationOnlyBoxes` puts
    // on a MERGED mesh - NOT `presentationOnly`, which the lawn field, the
    // forest ring and the mountain backdrop also set, and which therefore
    // dropped all sixteen of their meshes out of the audit with no trace.
    if (mesh.userData.sourceMeshes !== undefined) return;
    const label = mesh.name || mesh.type;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) { skipped += 1; skippedNames.push(`${label} (instanced)`); return; }
    if (mesh.rotation.x !== 0 || mesh.rotation.y !== 0 || mesh.rotation.z !== 0) { skipped += 1; skippedNames.push(`${label} (rotated)`); return; }
    const geometry = mesh.geometry as THREE.BoxGeometry;
    if (geometry.parameters === undefined) { skipped += 1; skippedNames.push(`${label} (non-box)`); return; }
    const p = geometry.parameters;
    mesh.getWorldPosition(world);
    boxes.push({
      name: mesh.name,
      materialId: materialIdOf(mesh),
      materialName: materialNameOf(mesh),
      polygonOffsetFactor: offsetFactorOf(mesh),
      x0: world.x - p.width / 2,
      x1: world.x + p.width / 2,
      z0: world.z - p.depth / 2,
      z1: world.z + p.depth / 2,
      top: world.y + p.height / 2,
    });
  });
  return { boxes, skipped, skippedNames };
}

function main(): void {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
  const { boxes, skipped, skippedNames } = collectBoxes();

  const rows: string[] = [];
  let findings = 0;
  let fenced = 0;
  let benign = 0;
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      const first = boxes[a]!;
      const second = boxes[b]!;
      const overlapX = Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0);
      const overlapZ = Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0);
      if (overlapX <= 1e-4 || overlapZ <= 1e-4) continue;
      const gap = Math.abs(first.top - second.top);
      if (gap > NEAR_METERS) continue;
      const sameMaterial = first.materialId === second.materialId;
      const fencedByOffset = first.polygonOffsetFactor < 0 || second.polygonOffsetFactor < 0;
      const verdict = fencedByOffset ? 'FENCED  ' : sameMaterial ? 'BENIGN  ' : 'FINDING ';
      if (fencedByOffset) fenced += 1; else if (sameMaterial) benign += 1; else findings += 1;
      rows.push([
        verdict,
        `dy=${gap.toFixed(4)}m`,
        `overlap=${(overlapX * overlapZ).toFixed(1)}m2`,
        `[${first.name} top=${first.top.toFixed(3)} mat=${first.materialName} offset=${first.polygonOffsetFactor}]`,
        `[${second.name} top=${second.top.toFixed(3)} mat=${second.materialName} offset=${second.polygonOffsetFactor}]`,
      ].join(' '));
    }
  }
  rows.sort();

  const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  const header = [
    `# nuketown2 coplanar top-face pairs (HF-434 instrument)`,
    `# head ${sha} · generated ${new Date().toISOString()}`,
    `# boxes=${boxes.length} · pairs<=${NEAR_METERS}m: ${rows.length}`
      + ` · FINDINGS (different materials, no offset): ${findings}`
      + ` · FENCED (material offset): ${fenced}`
      + ` · SAME-MATERIAL (benign): ${benign}`,
    `# UNAUDITED meshes (instanced / rotated / non-parametric geometry, not covered by`
      + ` the top-face test above): ${skipped}${skippedNames.length > 0 ? ` - ${skippedNames.join(', ')}` : ''}`,
    '',
  ];
  const report = [...header, ...rows, ''].join('\n');
  if (outPath) {
    const out = resolve(outPath);
    mkdirSync(resolve(out, '..'), { recursive: true });
    writeFileSync(out, report);
    console.log(`written: ${out}`);
  }
  console.log(report);
  process.exitCode = findings === 0 ? 0 : 1;
}

main();
