import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { loftBody, stripAtHeight, roofRail } from './geometry';
import { TRUCK_CAB_SPEC, SEDAN_SPEC } from './specs';
// Same strict bidirectional quarter-grid field comparator as the preserved
// coach allocation tests; no normal tolerance or geometry bound is relaxed.
function triangles(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position');
  return Array.from({ length: p.count / 3 }, (_, i) => new THREE.Triangle(
    new THREE.Vector3().fromBufferAttribute(p, i * 3),
    new THREE.Vector3().fromBufferAttribute(p, i * 3 + 1),
    new THREE.Vector3().fromBufferAttribute(p, i * 3 + 2),
  ));
}
function directedError(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const targets = triangles(b), sources=triangles(a), closest = new THREE.Vector3(), bary=new THREE.Vector3();
  const sourceNormals=a.getAttribute('normal'),targetNormals=b.getAttribute('normal');
  const normalAt=(n: THREE.BufferAttribute|THREE.InterleavedBufferAttribute,index:number,w:THREE.Vector3)=>new THREE.Vector3(
    n.getX(index)*w.x+n.getX(index+1)*w.y+n.getX(index+2)*w.z,
    n.getY(index)*w.x+n.getY(index+1)*w.y+n.getY(index+2)*w.z,
    n.getZ(index)*w.x+n.getZ(index+1)*w.y+n.getZ(index+2)*w.z);
  const stableBarycentric=(triangle:THREE.Triangle,point:THREE.Vector3)=>{
    const ab=triangle.b.clone().sub(triangle.a),ac=triangle.c.clone().sub(triangle.a),ap=point.clone().sub(triangle.a);
    const cross=ab.clone().cross(ac),abs=[Math.abs(cross.x),Math.abs(cross.y),Math.abs(cross.z)];
    const drop=abs.indexOf(Math.max(...abs)),axes=[0,1,2].filter(k=>k!==drop);
    const u=axes[0]!,v=axes[1]!,det=ab.getComponent(u)*ac.getComponent(v)-ab.getComponent(v)*ac.getComponent(u);
    if(Math.abs(det)<1e-20)return null;
    const beta=(ap.getComponent(u)*ac.getComponent(v)-ap.getComponent(v)*ac.getComponent(u))/det;
    const gamma=(ab.getComponent(u)*ap.getComponent(v)-ab.getComponent(v)*ap.getComponent(u))/det;
    return bary.set(1-beta-gamma,beta,gamma);
  };
  let maximum = 0,normalMaximum=0;
  for (const [index,triangle] of sources.entries()) {
    // Quarter-grid barycentric samples include strict triangle interiors,
    // every edge and every vertex, not just centroid/midpoints.
    const weights:THREE.Vector3[]=[];
    for(let u=0;u<=4;u++)for(let v=0;v<=4-u;v++)weights.push(new THREE.Vector3(u/4,v/4,1-(u+v)/4));
    for (const weight of weights) {
      const point=triangle.a.clone().multiplyScalar(weight.x).addScaledVector(triangle.b,weight.y).addScaledVector(triangle.c,weight.z);
      const sourceNormal=normalAt(sourceNormals,index*3,weight);
      let nearest=Infinity,normalError=Infinity;
      for (const [targetIndex,target] of targets.entries()) {
        const distance=point.distanceTo(target.closestPointToPoint(point,closest));
        if(distance>nearest+3e-7)continue;
        // Dominant-axis area ratios avoid cancellation in Three's dot-product
        // barycentrics for the very thin original arch-station triangles.
        const coordinate=stableBarycentric(target,closest);
        if(!coordinate)continue;
        const delta=normalAt(targetNormals,targetIndex*3,coordinate).sub(sourceNormal);
        const error=Math.max(Math.abs(delta.x),Math.abs(delta.y),Math.abs(delta.z));
        if(distance<nearest-3e-7)normalError=error;else normalError=Math.min(normalError,error);
        nearest=Math.min(nearest,distance);
      }
      maximum=Math.max(maximum,nearest);
      normalMaximum=Math.max(normalMaximum,normalError);
    }
  }
  return {position:maximum,normal:normalMaximum};
}
function assertWinding(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a);
    b.cross(c);
    if (b.length() < 1e-10) continue;
    normal.set(n.getX(i) + n.getX(i+1) + n.getX(i+2), n.getY(i) + n.getY(i+1) + n.getY(i+2), n.getZ(i) + n.getZ(i+1) + n.getZ(i+2));
    expect(b.normalize().dot(normal.normalize())).toBeGreaterThanOrEqual(-1e-5);
  }
}

const truck=loftBody(TRUCK_CAB_SPEC),sedan=loftBody(SEDAN_SPEC);
const pairs:Array<[string,THREE.BufferGeometry,THREE.BufferGeometry,number,number]>=[
 ['truck stripe',stripAtHeight(truck.rings,1.99,.4,4.8,.05,.014)!,stripAtHeight(truck.rings,1.99,.4,4.8,.05,.014,true)!,.00015,.01],
 ['truck roof rail',roofRail(TRUCK_CAB_SPEC,truck.rings,.6,1.9,4.3,.03,.045)!,roofRail(TRUCK_CAB_SPEC,truck.rings,.6,1.9,4.3,.03,.045,true)!,.000001,.000001],
 ['driveway spear',stripAtHeight(sedan.rings,.9,.35,4.05,.06,.014)!,stripAtHeight(sedan.rings,.9,.35,4.05,.06,.014,true)!,.00015,.01],
];
describe('noncoach trim allocation preserves surface and normal fields',()=>{
 for(const [name,before,after,bound,normalBound] of pairs)it(name,()=>{
  const forward=directedError(before,after),backward=directedError(after,before);
  process.stdout.write(JSON.stringify({name,before:before.getAttribute('position').count/3,after:after.getAttribute('position').count/3,forward,backward})+'\n');
  expect(after.getAttribute('position').count).toBeLessThan(before.getAttribute('position').count);
  expect(forward.position).toBeLessThanOrEqual(bound);expect(backward.position).toBeLessThanOrEqual(bound);
  expect(forward.normal).toBeLessThanOrEqual(normalBound+1e-6);expect(backward.normal).toBeLessThanOrEqual(normalBound+1e-6);
  assertWinding(after);
 });
});

