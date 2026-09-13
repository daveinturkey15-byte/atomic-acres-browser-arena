/**
 * Validate every geometry the Map 3 corridors build, without a browser.
 *
 * The failure being chased: on real WebGPU the scene renders 8 draws / 96
 * triangles — the hub, the ground and the signs — while every corridor mesh is
 * missing. Those three are the only meshes using geometry THREE builds; every
 * missing one uses geometry assembled by our own merge path. That makes the
 * geometry the suspect, not the shaders.
 *
 * A hand-built BufferGeometry disappears silently if:
 *   - any position is NaN or Infinity, because the bounding sphere then
 *     computes to NaN and Frustum.intersectsSphere returns false for every
 *     frame, at which point the mesh is culled and nothing is logged;
 *   - the index buffer references a vertex >= position.count;
 *   - attribute counts disagree with position.count;
 *   - the geometry is empty.
 *
 * Run: npx tsx scripts/map3-validate-geometry.mts
 */
import * as THREE from 'three';

import {
  createLeafGeometry, createFlatLeafGeometry, createLeafSpray,
  createLitterSkirt, mergeGeometries,
} from '../src/map3/leaf-geometry.js';
import {
  createTree, createConifer, createShrub, createFallenLog, createGrassTuft,
} from '../src/map3/plants.js';

interface Problem { what: string; detail: string }

const problems: Problem[] = [];
let checked = 0;

function check(what: string, g: THREE.BufferGeometry): void {
  checked++;
  const pos = g.getAttribute('position');
  if (!pos) { problems.push({ what, detail: 'no position attribute' }); return; }
  if (pos.count === 0) { problems.push({ what, detail: 'zero vertices' }); return; }

  // 1. Non-finite positions -> NaN bounding sphere -> culled every frame.
  let bad = -1;
  for (let i = 0; i < pos.count * 3; i++) {
    const v = pos.array[i] as number;
    if (!Number.isFinite(v)) { bad = i; break; }
  }
  if (bad >= 0) {
    problems.push({
      what,
      detail: `non-finite position at component ${bad} (vertex ${Math.floor(bad / 3)}), `
        + `value ${String(pos.array[bad])}`,
    });
  }

  // 2. Index out of range -> undefined behaviour, and NaN after toNonIndexed.
  const idx = g.getIndex();
  if (idx) {
    let maxIdx = -1;
    for (let i = 0; i < idx.count; i++) maxIdx = Math.max(maxIdx, idx.array[i] as number);
    if (maxIdx >= pos.count) {
      problems.push({
        what,
        detail: `index references vertex ${maxIdx} but only ${pos.count} exist`,
      });
    }
    if (idx.count % 3 !== 0) {
      problems.push({ what, detail: `index count ${idx.count} is not a multiple of 3` });
    }
  }

  // 3. Attribute length disagreement — WebGPU is far stricter than WebGL here.
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name);
    if (a.count !== pos.count) {
      problems.push({
        what,
        detail: `attribute '${name}' has ${a.count} items, position has ${pos.count}`,
      });
    }
  }

  // 4. The bounding sphere itself — the thing the frustum test actually uses.
  g.computeBoundingSphere();
  const bs = g.boundingSphere;
  if (!bs || !Number.isFinite(bs.radius) || !Number.isFinite(bs.center.x)) {
    problems.push({
      what,
      detail: `bounding sphere is ${bs ? `radius ${bs.radius}, centre ${bs.center.toArray()}` : 'null'}`
        + ' — a NaN sphere fails every frustum test, so the mesh is culled silently',
    });
  }
}

// ---- primitives ----------------------------------------------------------
check('leaf default', createLeafGeometry({ length: 0.72, width: 0.3 }));
check('leaf flat', createFlatLeafGeometry({ length: 0.72, width: 0.3 }));
check('leaf zero droop', createLeafGeometry({ length: 0.5, width: 0.2, droop: 0 }));
check('leaf zero cup/twist', createLeafGeometry({ length: 0.5, width: 0.2, cup: 0, twist: 0 }));
check('needle', createLeafGeometry({ length: 0.5, width: 0.035, droop: 1.15 }));
check('spray', createLeafSpray({
  count: 11, radius: 0.78, height: 0.5, seed: 3,
  leaf: { length: 0.72, width: 0.3 },
}));
check('litter skirt', createLitterSkirt(0.8, 9, { length: 0.19, width: 0.07 }, 5));

// ---- plants --------------------------------------------------------------
for (let s = 0; s < 6; s++) {
  const tree = createTree({ seed: s * 7 + 1, height: 4 + s, depth: 3, leavesPerClump: 11 });
  check(`tree ${s} wood`, tree.wood);
  check(`tree ${s} foliage`, tree.foliage);
  check(`tree ${s} litter`, tree.litter);

  const bare = createTree({ seed: s * 3 + 2, height: 6, depth: 3, bare: true });
  check(`bare tree ${s} wood`, bare.wood);
  check(`bare tree ${s} litter`, bare.litter);
  // A bare tree returns an EMPTY foliage geometry by design — merging that into
  // a batch is exactly the kind of thing that poisons a whole merged mesh.
  const bf = bare.foliage.getAttribute('position');
  if (bf && bf.count > 0) problems.push({ what: `bare tree ${s}`, detail: 'bare tree produced foliage' });

  const con = createConifer({ seed: s * 5 + 3, height: 9 });
  check(`conifer ${s} wood`, con.wood);
  check(`conifer ${s} foliage`, con.foliage);
  check(`conifer ${s} litter`, con.litter);

  check(`shrub ${s}`, createShrub(s * 11 + 1, 1));
  check(`log ${s}`, createFallenLog(s * 13 + 1, 3.6));
  check(`grass ${s}`, createGrassTuft(s * 17 + 1, 1));
}

// ---- the merge path, including the empty-geometry case -------------------
{
  const a = createLeafSpray({ count: 4, radius: 0.4, height: 0.2, seed: 1, leaf: { length: 0.5, width: 0.2 } });
  const b = createLitterSkirt(0.5, 4, { length: 0.2, width: 0.08 }, 2);
  check('merge two', mergeGeometries([a, b]));

  const empty = new THREE.BufferGeometry();
  const withEmpty = mergeGeometries([
    createLeafSpray({ count: 4, radius: 0.4, height: 0.2, seed: 4, leaf: { length: 0.5, width: 0.2 } }),
    empty,
    createLitterSkirt(0.5, 4, { length: 0.2, width: 0.08 }, 6),
  ]);
  check('merge including an EMPTY geometry', withEmpty);

  // A tree's wood carries zeroed leaf attributes so it can share a batch with
  // foliage. Prove that actually holds after a merge.
  const t = createTree({ seed: 99, depth: 3 });
  const mixed = mergeGeometries([t.wood, t.foliage, t.litter]);
  check('merge wood + foliage + litter', mixed);
  const names = Object.keys(mixed.attributes).sort().join(',');
  if (names !== 'aDead,aSide,aSpan,normal,position,uv') {
    problems.push({ what: 'merged attribute set', detail: `got: ${names}` });
  }
}

// ---- report --------------------------------------------------------------
console.log(`checked ${checked} geometries`);
if (problems.length === 0) {
  console.log('PASS — every geometry is finite, indexed in range, and boundable.');
} else {
  console.log(`FAIL — ${problems.length} problem(s):`);
  const seen = new Set<string>();
  for (const p of problems) {
    const key = p.what.replace(/\d+/g, 'N') + p.detail.replace(/\d+/g, 'N');
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${p.what}] ${p.detail}`);
  }
  process.exitCode = 1;
}
