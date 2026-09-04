#!/usr/bin/env tsx
// RAID2 coplanar top-face pairs — the HF-434 instrument's method, scoped to raid2.
//
// Why this file exists (Luna review, raid2-slice-2 DO-NOT-SHIP): the lane REPORT
// quoted a "coplanar instrument → FINDINGS: 0" line for RAID2, but the only
// instrument in the tree (scripts/qa/find-coplanar-pairs.ts) builds nuketown2,
// so no raid2-specific check backed the claim. This script is that check: same
// 0.03 m top-face rule, same verdict classes (FINDING / FENCED / BENIGN), same
// exit contract (exit 1 on any FINDING, never weakened), same batch handling
// (merged meshes audited through their hidden source nodes, not counted twice).
//
// Scope notes, stated so "0 FINDINGS" stays a scoped claim:
//   - Y-rotated boxes (the 8 court circle segments) are UNAUDITED here, exactly
//     as in the nuketown2 instrument; their lift is asserted geometrically by
//     src/raid2-slice2.test.ts ("paints court lines proud of the floor", lift
//     0.034 m > 0.03 m threshold via world boxes, rotation-safe).
//   - Non-box presentation pieces (cylinder poles/posts, cone canopies, torus
//     rims) are UNAUDITED here; they are parity-excluded on their own
//     measurements by the parity CLI, not by this script.

import * as THREE from 'three';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { buildRaid2 } from '../../src/raid2-arena';

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
  const map = buildRaid2(scene);
  const boxes: Box[] = [];
  let skipped = 0;
  const skippedNames: string[] = [];
  map.root.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  map.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    // Merged batch meshes are skipped: members are audited through the hidden
    // source nodes carrying the names and the exact same material objects.
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
    `# raid2 coplanar top-face pairs (raid2-slice-2 instrument; HF-434 method)`,
    `# head ${sha} · generated ${new Date().toISOString()}`,
    `# boxes=${boxes.length} · pairs<=${NEAR_METERS}m: ${rows.length}`
      + ` · FINDINGS (different materials, no offset): ${findings}`
      + ` · FENCED (material offset): ${fenced}`
      + ` · SAME-MATERIAL (benign): ${benign}`,
    `# UNAUDITED meshes (instanced / rotated / non-parametric geometry, not covered by`
      + ` the top-face test above): ${skipped}${skippedNames.length > 0 ? ` - ${skippedNames.join(', ')}` : ''}`,
    `# rotated court circle segments: lift asserted by src/raid2-slice2.test.ts (0.034 m > 0.03 m)`,
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
