import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { loftBody } from './geometry';
import { COACH_SPEC, TRUCK_CAB_SPEC, SEDAN_SPEC } from './specs';

function dotAt(g:THREE.BufferGeometry,i:number) {
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  const a=new THREE.Vector3().fromBufferAttribute(p,i);
  const face=new THREE.Vector3().fromBufferAttribute(p,i+1).sub(a).cross(new THREE.Vector3().fromBufferAttribute(p,i+2).sub(a));
  if(face.length()<1e-10)return null;
  const avg=new THREE.Vector3(n.getX(i)+n.getX(i+1)+n.getX(i+2),n.getY(i)+n.getY(i+1)+n.getY(i+2),n.getZ(i)+n.getZ(i+1)+n.getZ(i+2));
  return face.normalize().dot(avg.normalize());
}
function vertex(g:THREE.BufferGeometry,i:number) {
  return ['position','normal','uv'].flatMap(key=>{
    const a=g.getAttribute(key);return Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k]);
  });
}
describe('noncoach triangle-local orientation correction',()=>{
  for(const spec of [TRUCK_CAB_SPEC,SEDAN_SPEC])it(`${spec.id}: fixes only measured opposing faces without altering shape, count or normal/UV attachment`,()=>{
    const before=loftBody({...spec,id:'legacy-reference'}),after=loftBody(spec);
    const changes:Record<string,number>={};
    for(const part of ['body','glass','groove','lining'] as const) {
      const a=before[part]!,b=after[part]!,count=a.getAttribute('position').count;
      expect(b.getAttribute('position').count).toBe(count);changes[part]=0;
      for(let i=0;i<count;i+=3) {
        const oldVertices=[0,1,2].map(j=>vertex(a,i+j));
        const newVertices=[0,1,2].map(j=>vertex(b,i+j));
        // Whole vertex records travel together; identical triangle vertex set
        // preserves its surface and every barycentrically interpolated field.
        expect(newVertices.map(v=>JSON.stringify(v)).sort()).toEqual(oldVertices.map(v=>JSON.stringify(v)).sort());
        const oldDot=dotAt(a,i),newDot=dotAt(b,i);
        if(newDot!==null)expect(newDot,`${part} triangle ${i/3}`).toBeGreaterThanOrEqual(-1e-5);
        if(JSON.stringify(oldVertices)!==JSON.stringify(newVertices)) {
          changes[part]++;
          expect(oldDot).not.toBeNull();expect(oldDot!).toBeLessThan(0);
          expect(newVertices).toEqual([oldVertices[0],oldVertices[2],oldVertices[1]]);
          expect(newDot).toBeCloseTo(-oldDot!,12);
        }
      }
    }
    // Rounded 2026-09-11 sedan: four opposed body triangles, no opposed lining.
    // Every changed face above still proves exact vertex-set retention and a sign flip.
    expect(changes).toEqual(spec.id===TRUCK_CAB_SPEC.id?{body:0,glass:0,groove:0,lining:2}:{body:4,glass:0,groove:0,lining:0});
  });
  for(const radius of [.42,.47])it(`preserves every coach loft byte at wheel radius${radius}`,()=>{
    const spec={...COACH_SPEC,wheelRadius:radius},a=loftBody(spec),b=loftBody({...spec,id:'legacy-reference'});
    for(const part of ['body','glass','groove','lining'] as const)for(const attr of ['position','normal','uv'])expect(a[part]!.getAttribute(attr).array).toEqual(b[part]!.getAttribute(attr).array);
  });
});
