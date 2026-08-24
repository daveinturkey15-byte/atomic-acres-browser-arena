import * as THREE from 'three';
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';

const DT = 1 / 120;

describe('real controller street walk', () => {
  it('walks the north flank eastward with sliding', async () => {
    const map = buildArena(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      const trace: string[] = [];
      // Start mid north flank, walk due east, letting the controller slide.
      physics.teleportEye({ x: -3, y: 1.7, z: -4 });
      for (let step = 0; step < 120 * 12; step += 1) {
        physics.move({ x: 8.7 * DT, y: -0.004, z: 0 }, DT);
        if (step % 240 === 0) {
          const p = physics.eyePosition();
          trace.push(`t=${(step * DT).toFixed(1)}s pos=(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
        }
      }
      const end = physics.eyePosition();
      trace.push(`final=(${end.x.toFixed(2)}, ${end.z.toFixed(2)})`);
      writeFileSync('.gauntlet-tmp/hf383-walk.txt', trace.join('\n'));
    } finally {
      physics.dispose();
    }
  }, 60_000);
});
