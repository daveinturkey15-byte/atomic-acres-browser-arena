import { loftBody, latheGeometry, chamferedBar, stripAtHeight, roofRail, surfaceBandAtHeights } from './geometry';
import { COACH_SPEC, TRUCK_CAB_SPEC, SEDAN_SPEC } from './specs';
import { wheelParts } from './wheels';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
const cases: Array<[string, BufferGeometry]> = [];
for (const spec of [COACH_SPEC,TRUCK_CAB_SPEC,SEDAN_SPEC]) {
  const loft=loftBody(spec);
  for(const part of ['body','glass','lining','groove'] as const)if(loft[part])cases.push([`${spec.id}/${part}`,loft[part]]);
}
cases.push(['lathe',latheGeometry([[.62,-.1],[1,-.12],[1,.12],[.62,.1]],16)],['chamfer',chamferedBar(1,.1,.1,.01)]);
const rings=loftBody(COACH_SPEC).rings;
cases.push(['strip',stripAtHeight(rings,1.75,.55,8.55,.045,.008)!],['roof-rail',roofRail(COACH_SPEC,rings,.62,1.7,7.5,.012,.045)!],['surface-band',surfaceBandAtHeights(COACH_SPEC,rings,1.78,2.46,.75,8.35,.01)!]);
for(const style of ['cover','steel','whitewall'] as const){const wheel=wheelParts(.42,.14,style);for(const part of ['tyre','face','dark','whitewall'] as const)if(wheel[part])cases.push([`${style}/${part}`,wheel[part]]);}
// The b63 before/after position/UV hashes that once sat here guarded the normal
// repair of 2026-09-10 against moving a vertex. Shapes were re-authored on purpose
// afterwards, so those bytes are history, not a contract: they are preserved in
// docs/threejs-knowledge/normal-winding-b63-baseline.json. The preservation
// property they stood in for is now proved for arbitrary inputs at method level
// in triangle-orientation.test.ts. This file keeps every case and the invariant
// that is actually its job: emitted normals agree with every nondegenerate face.
describe('analytic normals follow the emitted triangle winding', () => {
  it.each(cases)('%s orients every nondegenerate face', (name,g)=>{
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  let opposing=0,valid=0,minDot=1;
  for(let i=0;i<p.count;i+=3){
    const a=[p.getX(i),p.getY(i),p.getZ(i)],u=[p.getX(i+1)-a[0]!,p.getY(i+1)-a[1]!,p.getZ(i+1)-a[2]!],v=[p.getX(i+2)-a[0]!,p.getY(i+2)-a[1]!,p.getZ(i+2)-a[2]!];
    const c=[u[1]!*v[2]!-u[2]!*v[1]!,u[2]!*v[0]!-u[0]!*v[2]!,u[0]!*v[1]!-u[1]!*v[0]!];
    if(Math.hypot(...c)<1e-10)continue;
    const avg=[0,0,0];for(let j=0;j<3;j++){avg[0]!+=n.getX(i+j);avg[1]!+=n.getY(i+j);avg[2]!+=n.getZ(i+j);}
    const dot=c.reduce((s,x,j)=>s+x*avg[j]!,0)/(Math.hypot(...c)*Math.hypot(...avg));
    valid++;minDot=Math.min(minDot,dot);if(dot < -1e-5)opposing++;
  }
  g.dispose();
  expect(p.count % 3, `${name}: non-indexed triangle soup`).toBe(0);
  expect(n.count).toBe(p.count);
  expect(valid).toBeGreaterThan(0);
  expect(opposing, `opposed faces; minimum dot ${minDot}`).toBe(0);
  });
});
