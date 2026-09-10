import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loftBody, stripAtHeight, roofRail, crownSurfaceY } from './geometry';
import { COACH_SPEC, TRUCK_CAB_SPEC, SEDAN_SPEC } from './specs';
import { lampParts } from './wheels';

// Legacy route is deliberately retained: changing only the presentation id
// disables coach allocation without changing the authored shape/dimensions.
const dense = loftBody({ ...COACH_SPEC, id: 'reference-coach' });
const reduced = loftBody(COACH_SPEC);
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
describe('bounded coach-only allocation', () => {
  it('normal comparator is accurate on unchanged thin lining triangles',()=>{
    const same=directedError(dense.lining!,dense.lining!);
    expect(same.position).toBeLessThanOrEqual(.000001);
    expect(same.normal).toBeLessThanOrEqual(.000001);
  });
  it('keeps all body, glass, groove and lining bytes unchanged', () => {
    for (const part of ['body', 'glass', 'groove','lining'] as const) {
      for (const attr of ['position', 'normal', 'uv']) expect(reduced[part]!.getAttribute(attr).array).toEqual(dense[part]!.getAttribute(attr).array);
    }
  });
  const pairs: Array<[string, THREE.BufferGeometry, THREE.BufferGeometry, number, number]> = [
    ['lining', dense.lining!, reduced.lining!, .0015, .001],
    ['stripe', stripAtHeight(dense.rings,1.75,.55,8.55,.045,.008)!, stripAtHeight(dense.rings,1.75,.55,8.55,.045,.008,true)!, .00015, .01],
    ['coach polish rub rail', stripAtHeight(dense.rings,1.42,1,8.1,.05,.014)!, stripAtHeight(dense.rings,1.42,1,8.1,.05,.014,true)!, .00015, .01],
    ['roof rail', roofRail(COACH_SPEC,dense.rings,.62,1.7,7.5,.012,.045)!, roofRail(COACH_SPEC,dense.rings,.62,1.7,7.5,.012,.045,true)!, .000001, .000001],
  ];
  for (const [name, before, after, bound, normalBound] of pairs) it(`${name} preserves bounded interior position/normal fields and outward winding`, () => {
    // Lining optimization was rejected by this stronger normal check. Keep
    // it byte-identical, rather than increasing tolerance to retain savings.
    if(name==='lining')expect(after.getAttribute('position').array).toEqual(before.getAttribute('position').array);
    else expect(after.getAttribute('position').count).toBeLessThan(before.getAttribute('position').count);
    const forward = directedError(before, after), backward = directedError(after, before);
    console.log(JSON.stringify({part:name,before:before.getAttribute('position').count/3,after:after.getAttribute('position').count/3,forward,backward,bound}));
    expect(forward.position).toBeLessThanOrEqual(bound);
    expect(backward.position).toBeLessThanOrEqual(bound);
    // Float32 interpolation tolerance only, not a relaxation of declared
    // normal-component limits. These are raw interpolated vertex normals.
    expect(forward.normal).toBeLessThanOrEqual(normalBound+1e-6);
    expect(backward.normal).toBeLessThanOrEqual(normalBound+1e-6);
    assertWinding(after);
  });
  it('omitted coach arch/seam stations cannot affect the flat crown rail field',()=>{
    const spanned=dense.rings.filter(r=>r.z>=1.7&&r.z<=7.5);
    expect(spanned.some(r=>r.inset>0)).toBe(true);
    for(const ring of spanned)expect(crownSurfaceY(COACH_SPEC,ring.z,.62)).toBe(crownSurfaceY(COACH_SPEC,spanned[0]!.z,.62));
    // roofRail reads only crownSurfaceY and signed x; arch/inset/crease data
    // are not inputs to its vertices or slope-derived analytic normals.
  });
  it('retains a meaningful authored roof bend rather than blindly dropping stations',()=>{
    const spec={...COACH_SPEC,top:[...COACH_SPEC.top.slice(0,3),{...COACH_SPEC.top[2]!,z:4,yTop:3.22,crease:true},...COACH_SPEC.top.slice(3)]};
    const rings=loftBody(spec).rings;
    const original=roofRail(spec,rings,.62,1.7,7.5,.012,.045)!;
    const simplified=roofRail(spec,rings,.62,1.7,7.5,.012,.045,true)!;
    const p=simplified.getAttribute('position');
    expect(Array.from({length:p.count},(_,i)=>p.getZ(i))).toContain(4);
    expect(directedError(original,simplified).position).toBeLessThanOrEqual(.000001);
    expect(directedError(simplified,original).position).toBeLessThanOrEqual(.000001);
  });
  it('keeps other vehicle loft routes byte-identical', () => {
    for (const spec of [TRUCK_CAB_SPEC, SEDAN_SPEC]) {
      const actual = loftBody(spec), reference = loftBody({...spec,id:'reference'});
      for (const part of ['body','glass','lining','groove'] as const) for (const attr of ['position','normal','uv']) expect(actual[part]!.getAttribute(attr).array).toEqual(reference[part]!.getAttribute(attr).array);
    }
  });
  it('retains coach lamp profile and depth while using 12 radial segments', () => {
    const before = lampParts(.14,.06), after = lampParts(.14,.06,12);
    for (const part of ['bezel','lens'] as const) {
      expect(after[part].getAttribute('position').count).toBe(before[part].getAttribute('position').count*2/3);
      before[part].computeBoundingBox();after[part].computeBoundingBox();
      expect(after[part].boundingBox!.min.z).toBe(before[part].boundingBox!.min.z);
      expect(after[part].boundingBox!.max.z).toBe(before[part].boundingBox!.max.z);
      assertWinding(after[part]);
    }
  });
});
