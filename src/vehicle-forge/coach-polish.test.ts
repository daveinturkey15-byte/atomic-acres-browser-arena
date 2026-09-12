import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildForgedVehicle, type ForgedVehicleMaterials, type VehicleDressing } from './build';
import { COACH_SPEC, SEDAN_SPEC, TRUCK_CAB_SPEC } from './specs';
import { buildNuketown2 } from '../nuketown2-arena';
const materials=Object.fromEntries(['paint','glass','lining','groove','chrome','accent','tyre','headLamp','tailLamp'].map(key=>[key,new THREE.MeshBasicMaterial()])) as unknown as ForgedVehicleMaterials;
const dressing:VehicleDressing={wheelStyle:'cover',grille:{y:1.08,width:1.1,height:.32,depth:.1,barCount:5},detail:{coach:{
  windscreen:{y0:1.75,y1:2.72,halfWidth:1.1},destinationBoard:{y:2.88,width:1,height:.18},fogLamps:{x:.9,y:.82,width:.1,height:.08},
  rearLouvers:{y0:.8,y1:1.1,count:3,halfWidth:.5},skirt:{y:.5,height:.08,z0:1,z1:8.1},
  luggageDoor:{y0:.8,y1:1.2,z:4,width:2},rearPlate:{y:.6,width:.3,height:.1},
}}};

describe('coach coherent polish isolation',()=>{
  it('uses a larger grounded wheel without changing the other vehicle radii or envelope',()=>{
    expect(COACH_SPEC.wheelRadius).toBe(.47);
    expect(TRUCK_CAB_SPEC.wheelRadius).toBe(.42);expect(SEDAN_SPEC.wheelRadius).toBe(.34);
    expect(COACH_SPEC.trackHalfWidth+COACH_SPEC.tyreHalfWidth).toBeLessThan(COACH_SPEC.halfWidth);
    expect(COACH_SPEC.wheelRadius*2).toBeLessThan(COACH_SPEC.beltY);
  });
  it('keeps chrome bars but places the coach grille mouth in the existing lining bucket',()=>{
    const built=buildForgedVehicle(COACH_SPEC,dressing,materials);
    const mouth=built.partBounds.find(p=>p.part==='detail.coach.grille-mouth');
    expect(mouth).toBeDefined();expect(mouth?.bucket).toBe('lining');
    expect(mouth?.min[2]).toBeCloseTo(-.012,6);
    expect(built.partBounds.some(p=>p.part==='detail.coach.lower-sweep')).toBe(true);
    expect(built.partBounds.some(p=>p.part==='detail.coach.rub-rail')).toBe(true);
  });
  it('keeps explicit zero flags on all non-coach glass and one on coach glass',()=>{
    for(const spec of [COACH_SPEC,TRUCK_CAB_SPEC,SEDAN_SPEC]) {
      const built=buildForgedVehicle(spec,{wheelStyle:'cover'},materials);
      const glass=built.group.children.find(p=>p.userData.forgeBucket==='glass') as THREE.Mesh;
      const flag=glass.geometry.getAttribute('forgeCoachShade');
      expect(flag).toBeDefined();expect(flag.count).toBe(glass.geometry.getAttribute('position').count);
      expect(new Set(Array.from(flag.array))).toEqual(new Set([spec.id===COACH_SPEC.id?1:0]));
    }
  });
  it('keeps the enlarged coach faces aligned with their interpolated normals',()=>{
    const built=buildForgedVehicle(COACH_SPEC,dressing,materials);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
    for(const object of built.group.children) {
      const geometry=(object as THREE.Mesh).geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
      for(let i=0;i<p.count;i+=3) {
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);c.fromBufferAttribute(p,i+2).sub(a);b.cross(c);
        if(b.length()<1e-10)continue;
        normal.set(n.getX(i)+n.getX(i+1)+n.getX(i+2),n.getY(i)+n.getY(i+1)+n.getY(i+2),n.getZ(i)+n.getZ(i+1)+n.getZ(i+2));
        expect(b.normalize().dot(normal.normalize()),`${object.userData.forgeBucket} triangle ${i/3}`).toBeGreaterThanOrEqual(-1e-5);
      }
    }
  });
  it('preserves flags through the real six-vehicle static merge without new draw buckets',()=>{
    const scene=new THREE.Scene();buildNuketown2(scene);
    let draws=0,glassVertices=0;const values=new Set<number>();
    scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||!object.name.startsWith('vehicle-forge merged'))return;
      draws++;
      const material=object.material as THREE.Material;
      if(material.name!=='vehicle-forge-glass')return;
      const flag=object.geometry.getAttribute('forgeCoachShade');expect(flag).toBeDefined();
      expect(flag.count).toBe(object.geometry.getAttribute('position').count);
      glassVertices+=flag.count;for(let i=0;i<flag.count;i++)values.add(flag.getX(i));
    });
    expect(draws).toBe(15);expect(glassVertices).toBeGreaterThan(0);expect(values).toEqual(new Set([0,1]));
  });
});
