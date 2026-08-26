/** SCRATCH — delete after use. Replicates nuketown-traversal findPath exactly. */
import * as THREE from 'three';
import { describe, it } from 'vitest';
import { ARENA_BOUNDS } from './arena-layout';
import { buildArena } from './map';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const CELL = 0.25;
const MOVEMENT_RADIUS = CHARACTER_PHYSICS_CONFIG.playerRadius;

function groundBlocked(map: ReturnType<typeof buildArena>, x: number, z: number): boolean {
  for (const b of map.colliders) {
    if (
      x > b.minX - MOVEMENT_RADIUS && x < b.maxX + MOVEMENT_RADIUS &&
      z > b.minZ - MOVEMENT_RADIUS && z < b.maxZ + MOVEMENT_RADIUS
    ) return true;
  }
  return false;
}

describe('lap-legs', () => {
  it('runs each lap leg through the exact traversal algorithm', () => {
    const map = buildArena(new THREE.Scene());
    const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
    const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
    const key = (i: number, j: number) => j * (cols + 1) + i;
    const blocked = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        const x = ARENA_BOUNDS.minX + i * CELL;
        const z = ARENA_BOUNDS.minZ + j * CELL;
        blocked[key(i, j)] = groundBlocked(map, x, z) ? 1 : 0;
      }
    }
    const comp = new Int32Array(blocked.length).fill(-1);
    const compSizes: number[] = [];
    for (let seed = 0; seed < blocked.length; seed += 1) {
      if (blocked[seed] || comp[seed] >= 0) continue;
      let size = 0;
      const stack = [seed];
      comp[seed] = compSizes.length;
      while (stack.length > 0) {
        const c = stack.pop()!;
        size += 1;
        const ci = c % (cols + 1);
        const cj = Math.floor(c / (cols + 1));
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            if (di === 0 && dj === 0) continue;
            const ni = ci + di;
            const nj = cj + dj;
            if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
            const nk = key(ni, nj);
            if (blocked[nk] || comp[nk] >= 0) continue;
            if (di !== 0 && dj !== 0 && (blocked[key(ni, cj)] || blocked[key(ci, nj)])) continue;
            comp[nk] = compSizes.length;
            stack.push(nk);
          }
        }
      }
      compSizes.push(size);
    }
    let mainComponent = 0;
    for (let c = 1; c < compSizes.length; c += 1) if (compSizes[c] > compSizes[mainComponent]) mainComponent = c;
    console.log(`[legs] comps=${compSizes.map((s, i) => `${i}:${s}`).join(' ')} main=#${mainComponent}`);
    const openness = (ni: number, nj: number): number => {
      let free = 0;
      for (let dj = -1; dj <= 1; dj += 1) {
        for (let di = -1; di <= 1; di += 1) {
          const ti = ni + di;
          const tj = nj + dj;
          if (ti < 0 || ti > cols || tj < 0 || tj > rows) continue;
          if (!blocked[key(ti, tj)]) free += 1;
        }
      }
      return free;
    };
    const analyse = (label: string, from: [number, number], to: [number, number]) => {
      const snap = (pt: [number, number]) => {
        const ci = Math.round((pt[0] - ARENA_BOUNDS.minX) / CELL);
        const cj = Math.round((pt[1] - ARENA_BOUNDS.minZ) / CELL);
        let best = { i: ci, j: cj, score: -1, found: false };
        for (let ring = 0; ring <= Math.round(4 / CELL); ring += 1) {
          for (let dj = -ring; dj <= ring; dj += 1) {
            for (let di = -ring; di <= ring; di += 1) {
              if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
              const ni = ci + di;
              const nj = cj + dj;
              if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
              if (blocked[key(ni, nj)]) continue;
              if (comp[key(ni, nj)] !== mainComponent) continue;
              const score = openness(ni, nj) * 1000 - ring;
              if (score > best.score) best = { i: ni, j: nj, score, found: true };
            }
          }
        }
        return best;
      };
      const s = snap(from);
      const g = snap(to);
      console.log(`[legs] ${label}: from(${from}) snapped=${s.found} to(${to}) snapped=${g.found} -> (${ARENA_BOUNDS.minX + g.i * CELL},${ARENA_BOUNDS.minZ + g.j * CELL})`);
    };
    analyse('leg1', [-28.5, -26], [28.5, -26]);
    analyse('leg2', [28.5, -26], [30, 25.5]);
    analyse('leg3', [30, 25.5], [-18, 26]);
    analyse('leg4', [-18, 26], [-28.5, 14]);
    analyse('leg5', [-28.5, 14], [-28.5, -26]);
  }, 300_000);
});

describe('mouths', () => {
  it('lists colliders sealing the street mouths', () => {
    const map = buildArena(new THREE.Scene());
    const zones = [
      { label: 'west-mouth', minX: -18, maxX: -5, minZ: -6, maxZ: 6 },
      { label: 'east-mouth', minX: 5, maxX: 18, minZ: -6, maxZ: 6 },
      { label: 'south-east-barrier', minX: 15, maxX: 32, minZ: -32, maxZ: -14 },
    ];
    for (const zone of zones) {
      console.log(`[mouth] zone=${zone.label}`);
      const hits = map.colliders
        .filter((b) => b.maxX > zone.minX - MOVEMENT_RADIUS && b.minX < zone.maxX + MOVEMENT_RADIUS
          && b.maxZ > zone.minZ - MOVEMENT_RADIUS && b.minZ < zone.maxZ + MOVEMENT_RADIUS)
        .sort((p, q) => (p.minZ - q.minZ) || (p.minX - q.minX));
      for (const b of hits) {
        const named = map.root.children.reduce((acc, node) => {
          const dd = Math.hypot(node.position.x - (b.minX + b.maxX) / 2, node.position.z - (b.minZ + b.maxZ) / 2);
          return dd < acc.dd ? { dd, n: node.name } : acc;
        }, { dd: Infinity, n: '<none>' }).n;
        console.log(`[mouth] x=[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] z=[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}] y=[${(b.minY ?? 0).toFixed(2)},${(b.maxY ?? 0).toFixed(2)}] ${named}`);
      }
    }
  }, 300_000);
});
