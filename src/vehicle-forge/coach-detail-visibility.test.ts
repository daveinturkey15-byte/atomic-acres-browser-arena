import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {buildForgedVehicle,type ForgedVehicleMaterials,type VehicleDressing} from './build';
import {COACH_SPEC,SEDAN_SPEC} from './specs';
const materials=Object.fromEntries(['paint','glass','lining','groove','chrome','accent','tyre','headLamp','tailLamp'].map(key=>[key,new THREE.MeshBasicMaterial()])) as unknown as ForgedVehicleMaterials;
const grille={y:1.08,width:1.1,height:.32,depth:.1,barCount:5};
const skirt={y:.5,height:.08,z0:1,z1:8.1};
const dressing:VehicleDressing={wheelStyle:'cover',grille,pillars:{z:[3.2,4.95,6.7],y0:1.75,y1:2.63},detail:{coach:{
  windscreen:{y0:1.75,y1:2.72,halfWidth:1.1},destinationBoard:{y:2.88,width:1,height:.18},fogLamps:{x:.9,y:.82,width:.1,height:.08},
  rearLouvers:{y0:.8,y1:1.1,count:3,halfWidth:.5},skirt,
  luggageDoor:{y0:.8,y1:1.2,z:4,width:2},rearPlate:{y:.6,width:.3,height:.1},
}}};
const vehicle=buildForgedVehicle(COACH_SPEC,dressing,materials);
function positions(bucket:string,source=vehicle){
  const mesh=source.group.children.find(child=>child.userData.forgeBucket===bucket) as THREE.Mesh;
  const p=mesh.geometry.getAttribute('position');
  return Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)] as const);
}
describe('existing coach detail is exposed rather than buried',()=>{
  it('places existing grille bars22mm proud of the nose',()=>{
    const grillePoints=positions('chrome').filter(([x,y,z])=>Math.abs(x)<.57&&Math.abs(y-1.08)<.17&&z<.2);
    expect(Math.min(...grillePoints.map(p=>p[2]))).toBeCloseTo(-.022,6);
  });
  it('puts the coach mullion outer edge20mm proud of the flank',()=>{
    const mullion=positions('groove').filter(([,y,z])=>y>1.9&&y<2.7&&Math.abs(z-3.2)<.02);
    expect(Math.max(...mullion.map(p=>Math.abs(p[0])))).toBeCloseTo(1.32,6);
  });
  it('keeps the two existing skirt pieces clear of both wheel arches',()=>{
    const skirts=vehicle.partBounds.filter(p=>p.part==='detail.coach.skirt-line');
    expect(skirts).toHaveLength(2);
    // Physical clearance derived from the spec, not a span literal: the arch
    // opening around each axle is wheelRadius + archGap; each skirt end must
    // stop beyond the nearer opening, by the same margin fore and aft, and stay
    // inside the authored skirt span. (The former literals 2.25/6.85 were this
    // derivation evaluated at wheelRadius 0.42; coach-polish.test.ts pins 0.47.)
    const front=Math.min(...COACH_SPEC.wheelZ),rear=Math.max(...COACH_SPEC.wheelZ);
    const archHalfSpan=COACH_SPEC.wheelRadius+COACH_SPEC.archGap;
    for(const part of skirts){
      expect(part.triangles).toBe(12);
      const frontMargin=part.min[2]-(front+archHalfSpan);
      const rearMargin=(rear-archHalfSpan)-part.max[2];
      expect(frontMargin).toBeGreaterThan(0);
      expect(rearMargin).toBeCloseTo(frontMargin,6);
      expect(part.min[2]).toBeGreaterThanOrEqual(skirt.z0);
      expect(part.max[2]).toBeLessThanOrEqual(skirt.z1);
    }
    // Perturbation evidence: the clearance tracks the wheel radius. A coach
    // with 50 mm smaller wheels must gain exactly 50 mm of skirt at each end.
    const shrunk=buildForgedVehicle({...COACH_SPEC,wheelRadius:COACH_SPEC.wheelRadius-.05},dressing,materials);
    const shrunkSkirts=shrunk.partBounds.filter(p=>p.part==='detail.coach.skirt-line');
    expect(shrunkSkirts).toHaveLength(2);
    for(const part of shrunkSkirts){
      expect(part.triangles).toBe(12);
      expect(part.min[2]).toBeCloseTo(skirts[0]!.min[2]-.05,6);
      expect(part.max[2]).toBeCloseTo(skirts[0]!.max[2]+.05,6);
    }
  });
  it('exposes the sedan grille outside its opaque nose with dark backing',()=>{
    const sedan=buildForgedVehicle(SEDAN_SPEC,{wheelStyle:'cover',grille},materials);
    const points=positions('chrome',sedan).filter(([,y,z])=>Math.abs(y-1.08)<.17&&z<.2);
    expect(Math.min(...points.map(p=>p[2]))).toBeCloseTo(-.022,6);
    const backing=sedan.partBounds.find(part=>part.part==='detail.grille-mouth');
    expect(backing?.min[2]).toBeCloseTo(-.012,6);
    // A sightline between bars must reach the grille backing before the paint.
    sedan.group.updateMatrixWorld(true);
    const hits=new THREE.Raycaster(new THREE.Vector3(.1,1.08,-1),new THREE.Vector3(0,0,1)).intersectObject(sedan.group,true);
    expect(hits[0].object.userData.forgeBucket).toBe('lining');
  });
});
