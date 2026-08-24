import * as THREE from 'three';
import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildHighSeas } from './high-seas';

it('scratch pane orientation probe', () => {
  const lines: string[] = [];
  const map = buildHighSeas(new THREE.Scene());
  map.root.updateMatrixWorld(true);
  const panes: string[] = [];
  const mullions: string[] = [];
  map.root.traverse((n) => {
    if (!(n instanceof THREE.Mesh)) return;
    if (n.name.includes('-window-')) panes.push(n.name);
    if (n.name.includes('-mullion-')) mullions.push(n.name);
  });
  lines.push(`panes(${panes.length}): ${JSON.stringify(panes)}`);
  lines.push(`mullions(${mullions.length}): ${JSON.stringify(mullions)}`);
  for (const name of [...panes.slice(0, 4), ...mullions.slice(0, 4)]) {
    const node = map.root.getObjectByName(name);
    if (!node) { lines.push(`${name}: NOT FOUND`); continue; }
    const box = new THREE.Box3().setFromObject(node);
    lines.push(`${name}: world size (${(box.max.x - box.min.x).toFixed(3)}, ${(box.max.y - box.min.y).toFixed(3)}, ${(box.max.z - box.min.z).toFixed(3)}) z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`);
  }
  writeFileSync('artifacts/hf392/probe-out.txt', lines.join('\n'));
  expect(true).toBe(true);
});
