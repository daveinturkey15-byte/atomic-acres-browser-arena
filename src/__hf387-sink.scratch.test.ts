import * as THREE from 'three';
import { describe, it } from 'vitest';
import { buildArena } from './map';
import { CharacterPhysics } from './physics';

/**
 * HF-387 sink diagnostic (scratch — delete before handoff).
 * Walk the -x approach to exterior-access-ramp@(7.9,16.1) in crouch and log
 * where the capsule drops below the world plane; then enumerate colliders
 * containing the endpoint.
 */

describe('HF-387 sink', () => {
  it('traces the crouch walk that ends half a metre underground', async () => {
    const scene = new THREE.Scene();
    const map = buildArena(scene);
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY ?? 0);
    try {
      physics.setStance('stand');
      physics.teleportEye({ x: 13.9, y: 1.75, z: 16.1 });
      expect(physics.setStance('crouch')).toBe(true);
      for (let i = 0; i < 30; i += 1) {
        physics.move({ x: -0.25, y: -0.06, z: 0 }, 1 / 60);
        const p = physics.eyePosition();
        if (p.y < 1.0 || i % 5 === 0) console.log(`[sink] coarse ${i}: eye=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
      }
      for (let i = 0; i < 120; i += 1) {
        physics.move({ x: -0.02, y: -0.06, z: 0 }, 1 / 60);
        const p = physics.eyePosition();
        if (i % 10 === 0 || p.y < 1.0) console.log(`[sink] fine ${i}: eye=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`);
      }
      const end = physics.eyePosition();
      console.log(`[sink] end=(${end.x.toFixed(3)},${end.y.toFixed(3)},${end.z.toFixed(3)})`);
      // Which static colliders overlap this column?
      const hits: string[] = [];
      for (const box of map.physicsColliders) {
        const minY = box.minY ?? 0;
        const maxY = box.maxY ?? 8;
        if (end.x >= box.minX && end.x <= box.maxX && end.z >= box.minZ && end.z <= box.maxZ) {
          hits.push(`x[${box.minX.toFixed(2)},${box.maxX.toFixed(2)}] y[${minY.toFixed(2)},${maxY.toFixed(2)}] z[${box.minZ.toFixed(2)},${box.maxZ.toFixed(2)}] rot=${JSON.stringify(box.rotation ?? null)}`);
        }
      }
      console.log(`[sink] ${hits.length} colliders contain column:`);
      for (const h of hits.slice(0, 20)) console.log(`[sink]   ${h}`);
      // Where along x does the drop happen? March west at fixed z, log y transitions.
      physics.setStance('stand');
      physics.teleportEye({ x: 16, y: 1.75, z: 16.1 });
      expect(physics.setStance('crouch')).toBe(true);
      let prevY = physics.eyePosition().y;
      for (let i = 0; i < 400; i += 1) {
        physics.move({ x: -0.02, y: -0.06, z: 0 }, 1 / 60);
        const p = physics.eyePosition();
        if (Math.abs(p.y - prevY) > 0.05) {
          console.log(`[sink] transition at step ${i}: y ${prevY.toFixed(2)} -> ${p.y.toFixed(2)} at x=${p.x.toFixed(2)} z=${p.z.toFixed(2)}`);
          prevY = p.y;
        }
      }
    } finally {
      physics.dispose();
    }
  }, 300_000);
});

function expect(value: unknown): { toBe(expected: unknown): void } {
  return {
    toBe(expected: unknown): void {
      if (value !== expected) throw new Error(`expected ${String(expected)}, got ${String(value)}`);
    },
  };
}
