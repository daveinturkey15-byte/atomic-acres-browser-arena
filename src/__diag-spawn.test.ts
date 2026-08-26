import * as THREE from 'three';
import { it } from 'vitest';
import { buildArena } from './map';
import { ARENA_BOUNDS, SPAWN_LAYOUT, PATROL_LAYOUT } from './arena-layout';
import { circleIntersectsBox } from './collision';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const CELL = 0.25;
const R = CHARACTER_PHYSICS_CONFIG.playerRadius;

function groundBlocked(map: ReturnType<typeof buildArena>, x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0, maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    const yaw = b.rotation?.[1];
    let bx = x, bz = z;
    if (yaw) { const cx=(b.minX+b.maxX)/2, cz=(b.minZ+b.maxZ)/2, dx=x-cx, dz=z-cz, c=Math.cos(yaw), s=Math.sin(yaw); bx=cx+dx*c-dz*s; bz=cz+dx*s+dz*c; }
    if (circleIntersectsBox(bx, bz, R, b)) return true;
  }
  return false;
}

it('final survey', () => {
  const map = buildArena(new THREE.Scene());
  const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
  const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
  const W = cols + 1;
  const blocked = new Uint8Array(W * (rows + 1));
  for (let j = 0; j <= rows; j += 1)
    for (let i = 0; i <= cols; i += 1)
      blocked[j*W+i] = groundBlocked(map, ARENA_BOUNDS.minX+i*CELL, ARENA_BOUNDS.minZ+j*CELL) ? 1 : 0;
  const comp = new Int32Array(blocked.length).fill(-1);
  const sizes: number[] = [];
  for (let seed = 0; seed < blocked.length; seed += 1) {
    if (blocked[seed] || comp[seed] >= 0) continue;
    const id = sizes.length; sizes.push(0);
    const st = [seed]; comp[seed] = id;
    while (st.length) {
      const c = st.pop()!; sizes[id]++;
      const ci=c%W, cj=Math.floor(c/W);
      for (let dj=-1;dj<=1;dj++) for (let di=-1;di<=1;di++) {
        if (!di&&!dj) continue;
        const ni=ci+di, nj=cj+dj;
        if (ni<0||ni>cols||nj<0||nj>rows) continue;
        const nk=nj*W+ni;
        if (blocked[nk]||comp[nk]>=0) continue;
        if (di&&dj&&(blocked[cj*W+ni]||blocked[nj*W+ci])) continue;
        comp[nk]=id; st.push(nk);
      }
    }
  }
  const main = sizes.indexOf(Math.max(...sizes));
  console.log(`comps=${sizes.join(',')}`);
  const inMain = (x:number,z:number)=>{const i=Math.round((x-ARENA_BOUNDS.minX)/CELL),j=Math.round((z-ARENA_BOUNDS.minZ)/CELL);return !blocked[j*W+i]&&comp[j*W+i]===main;};
  for (const [x,z] of [[-28.5,-26],[28.5,-26],[30,25.5],[-28.5,26],[-18,26],[-28.5,14],[-29,-27]] as const)
    console.log(`PT (${x},${z}) main=${inMain(x,z)}`);
  // All spawns/patrols reachable from main?
  let bad = 0;
  for (const t of [SPAWN_LAYOUT[0], SPAWN_LAYOUT[1]]) for (const [sx,sz] of t) if (!inMain(sx,sz)) { console.log(`SPAWN OFF-MAIN (${sx},${sz})`); bad++; }
  for (const [px,pz] of PATROL_LAYOUT) if (!inMain(px,pz)) { console.log(`PATROL OFF-MAIN (${px},${pz})`); bad++; }
  console.log(`offMainCount=${bad}`);
  // Unreachable cells grouped by component with bbox.
  for (let c=0;c<sizes.length;c++) {
    if (c===main) continue;
    let n=0,minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
    for (let k=0;k<blocked.length;k++) if (!blocked[k]&&comp[k]===c){n++;const x=ARENA_BOUNDS.minX+(k%W)*CELL,z=ARENA_BOUNDS.minZ+Math.floor(k/W)*CELL;if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;}
    console.log(`POCKET comp${c} cells=${n} x[${minX},${maxX}] z[${minZ},${maxZ}]`);
  }
});

it('thread', () => {
  const map = buildArena(new THREE.Scene());
  const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
  const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
  const W = cols + 1;
  const blocked = new Uint8Array(W * (rows + 1));
  const why: Array<Array<string>> = Array.from({length: blocked.length},()=>[]);
  for (let j = 0; j <= rows; j += 1)
    for (let i = 0; i <= cols; i += 1) {
      const x = ARENA_BOUNDS.minX+i*CELL, z = ARENA_BOUNDS.minZ+j*CELL;
      if (!groundBlocked(map,x,z)) continue;
      blocked[j*W+i]=1;
      for (const b of map.physicsColliders) {
        const minY=b.minY??0,maxY=b.maxY??minY+3;
        if (maxY<=0.45||minY>=2.2) continue;
        const yaw=b.rotation?.[1];
        let bx=x,bz=z;
        if (yaw){const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,dx=x-cx,dz=z-cz,c=Math.cos(yaw),s=Math.sin(yaw);bx=cx+dx*c-dz*s;bz=cz+dx*s+dz*c;}
        if (circleIntersectsBox(bx,bz,R,b)) {
          const nm=map.root.children.find((n)=>Math.abs(n.position.x-(b.minX+b.maxX)/2)<0.3&&Math.abs(n.position.z-(b.minZ+b.maxZ)/2)<0.3)?.name??'?';
          why[j*W+i].push(nm);
        }
      }
    }
  const col = (x:number)=>{const i=Math.round((x-ARENA_BOUNDS.minX)/CELL);return i;};
  const ci = col(-25.0);
  for (let z=15.5; z<=19.5; z+=0.25) {
    const j=Math.round((z-ARENA_BOUNDS.minZ)/CELL);
    console.log(`cell(-25.0,${z.toFixed(2)}) blocked=${blocked[j*W+ci]} ${why[j*W+ci].join(',')}`);
  }
});

it('probe15', () => {
  const map = buildArena(new THREE.Scene());
  for (const [x,z] of [[-26,15],[-25.5,15],[-26.5,15],[-26,16],[-26,14]] as const) {
    for (const b of map.physicsColliders) {
      const minY=b.minY??0,maxY=b.maxY??minY+3;
      if (maxY<=0.45||minY>=2.2) continue;
      const yaw=b.rotation?.[1];
      let bx=x,bz=z;
      if (yaw){const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,dx=x-cx,dz=z-cz,c=Math.cos(yaw),s=Math.sin(yaw);bx=cx+dx*c-dz*s;bz=cz+dx*s+dz*c;}
      if (circleIntersectsBox(bx,bz,R,b)) {
        const nm=map.root.children.find((n)=>Math.abs(n.position.x-(b.minX+b.maxX)/2)<0.3&&Math.abs(n.position.z-(b.minZ+b.maxZ)/2)<0.3)?.name??'?';
        console.log(`(${x},${z}) <- ${nm} x[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] z[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}]`);
      }
    }
  }
});
