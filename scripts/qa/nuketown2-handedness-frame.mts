#!/usr/bin/env tsx
/**
 * HF-473 handedness evidence that needs no GPU and no browser.
 *
 * For each of the two authored back-yard review cameras, this projects the
 * BUILT house and garage bodies into that camera's own frame and reports which
 * side of the frame each lands on. It is the same arithmetic the fidelity gate
 * asserts, printed with the numbers so a reader can check it by hand, and it
 * is what the two hardware captures are then expected to LOOK like.
 *
 *   npx tsx scripts/qa/nuketown2-handedness-frame.mts
 */
import * as THREE from 'three';
import { buildNuketown2, NUKETOWN2_SPAWN_LAYOUT } from '../../src/nuketown2-arena';
import { NUKETOWN2_HANDEDNESS } from '../../src/nuketown2-layout';
import { definition as nuketown2Definition } from '../../src/rendering/arenas/nuketown2';

const map = buildNuketown2(new THREE.Scene());
map.root.updateMatrixWorld(true);

function planCentre(suffix: string): { x: number; z: number } {
  let found: THREE.Mesh | undefined;
  map.root.traverse((node) => {
    if (found === undefined && (node as THREE.Mesh).isMesh === true && node.name.endsWith(suffix)) {
      found = node as THREE.Mesh;
    }
  });
  if (!found) throw new Error(`mesh "${suffix}" not found`);
  const box = new THREE.Box3().setFromObject(found);
  return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
}

const definition = nuketown2Definition;

const lines: string[] = [];
lines.push('HF-473 handedness - built geometry projected into the authored back-yard review cameras');
lines.push(`NUKETOWN2_HANDEDNESS = ${NUKETOWN2_HANDEDNESS}`);
lines.push('');

for (const half of ['north', 'south'] as const) {
  const camera = definition.reviewCameras.find((entry) => entry.id === `nuketown2-${half}-yard`);
  if (!camera) throw new Error(`no ${half} yard camera`);
  const house = planCentre(`${half} house roof deck`);
  const garage = planCentre(`${half} garage roof`);
  const eye = { x: camera.position[0], z: camera.position[2] };
  const target = { x: camera.target[0], z: camera.target[2] };

  const fx = target.x - eye.x;
  const fz = target.z - eye.z;
  const flen = Math.hypot(fx, fz);
  // right = forward x up, the convention src/minimap.ts states twice.
  const rx = -fz / flen;
  const rz = fx / flen;

  const side = (p: { x: number; z: number }) => {
    const dx = p.x - eye.x;
    const dz = p.z - eye.z;
    const along = (dx * fx + dz * fz) / flen;
    const across = dx * rx + dz * rz;
    return { along, across, degrees: (Math.atan2(across, along) * 180) / Math.PI };
  };

  const h = side(house);
  const g = side(garage);
  const spawns = NUKETOWN2_SPAWN_LAYOUT[half === 'north' ? 0 : 1]!;
  const onSpawn = spawns.some(([sx, sz]) => Math.hypot(sx - eye.x, sz - eye.z) < 0.001);

  lines.push(`--- ${half} back yard -------------------------------------------------`);
  lines.push(`camera at (${eye.x.toFixed(2)}, ${eye.z.toFixed(2)})  ${onSpawn ? 'IS an authored spawn point' : 'is NOT an authored spawn point'}`);
  lines.push(`looking at (${target.x.toFixed(2)}, ${target.z.toFixed(2)})`);
  lines.push(`house centre  (${house.x.toFixed(2)}, ${house.z.toFixed(2)})  ${h.along.toFixed(1)} m ahead, ${Math.abs(h.degrees).toFixed(1)} deg ${h.degrees >= 0 ? 'right' : 'left'}`);
  lines.push(`garage centre (${garage.x.toFixed(2)}, ${garage.z.toFixed(2)})  ${g.along.toFixed(1)} m ahead, ${Math.abs(g.degrees).toFixed(1)} deg ${g.degrees >= 0 ? 'RIGHT' : 'LEFT'}`);
  lines.push(`VERDICT: garage is on the ${g.degrees > 0 ? 'RIGHT' : 'LEFT'} of the house from this yard`);
  lines.push('');
}

lines.push('Every spawn, not just the camera station:');
for (const [team, half] of (['north', 'south'] as const).entries()) {
  const house = planCentre(`${half} house roof deck`);
  const garage = planCentre(`${half} garage roof`);
  for (const [x, z] of NUKETOWN2_SPAWN_LAYOUT[team]!) {
    const fx = house.x - x;
    const fz = house.z - z;
    const cross = fx * (garage.z - z) - fz * (garage.x - x);
    lines.push(`  ${half} spawn (${String(x).padStart(6)}, ${String(z).padStart(4)}) -> garage ${cross > 0 ? 'RIGHT' : 'LEFT'}`);
  }
}

console.log(lines.join('\n'));
