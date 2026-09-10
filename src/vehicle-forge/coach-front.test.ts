import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {loftBody} from './geometry';
import {COACH_SPEC} from './specs';
describe('coherent coach front cap',()=>{
  const loft=loftBody(COACH_SPEC);
  it('uses one full-width continuous trapezoidal front windshield',()=>{
    const p=loft.glass!.getAttribute('position');
    let area=0;const heights:number[]=[],widths:number[]=[];
    for(let i=0;i<p.count;i+=3){
      if([i,i+1,i+2].some(j=>Math.abs(p.getZ(j))>1e-7))continue;
      const points=[i,i+1,i+2].map(j=>new THREE.Vector3().fromBufferAttribute(p,j));
      area+=new THREE.Triangle(points[0]!,points[1]!,points[2]!).getArea();
      for(const point of points){heights.push(point.y);widths.push(Math.abs(point.x));}
    }
    expect(Math.min(...heights)).toBeCloseTo(1.75,6);
    expect(Math.max(...heights)).toBeCloseTo(2.72,6);
    expect(Math.max(...widths)).toBeCloseTo(1.3,6);
    expect(area).toBeCloseTo((2.72-1.75)*(2.6+2.2)/2,5);
  });
  it('keeps a backed painted brow and monotonic front roof inside the original envelope',()=>{
    expect(COACH_SPEC.top[0]!.yTop-COACH_SPEC.noseGlass!.yMax).toBeCloseTo(.32,8);
    expect(COACH_SPEC.top[0]!.yTop).toBeLessThan(COACH_SPEC.top[1]!.yTop);
    expect(COACH_SPEC.top[1]!.yTop).toBeLessThan(COACH_SPEC.top[2]!.yTop);
    for(const ring of loft.rings)for(const [x,y] of ring.points){expect(Math.abs(x)).toBeLessThanOrEqual(1.3);expect(y).toBeLessThanOrEqual(3.3);}
  });
  it('keeps the rear screen while replacing the duplicate front top-arc screen',()=>{
    expect(COACH_SPEC.screens).toEqual([{z0:8.5,z1:9.02}]);
    expect(COACH_SPEC.sideGlass).toEqual([{z0:1.45,z1:8.2}]);
    expect(COACH_SPEC.wheelZ).toEqual([1.65,7.45]);
  });
});
