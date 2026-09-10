import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loftBody, stripAtHeight, roofRail } from './geometry';
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
  const targets = triangles(b), closest = new THREE.Vector3();
  let maximum = 0;
  for (const triangle of triangles(a)) {
    const samples = [triangle.a, triangle.b, triangle.c,
      triangle.getMidpoint(new THREE.Vector3()),
      triangle.a.clone().lerp(triangle.b, .5),
      triangle.b.clone().lerp(triangle.c, .5),
      triangle.c.clone().lerp(triangle.a, .5)];
    for (const point of samples) {
      let nearest = Infinity;
      for (const target of targets) nearest = Math.min(nearest, point.distanceTo(target.closestPointToPoint(point, closest)));
      maximum = Math.max(maximum, nearest);
    }
  }
  return maximum;
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
  it('keeps all outer body, glass and groove bytes unchanged', () => {
    for (const part of ['body', 'glass', 'groove'] as const) {
      for (const attr of ['position', 'normal', 'uv']) expect(reduced[part]!.getAttribute(attr).array).toEqual(dense[part]!.getAttribute(attr).array);
    }
  });
  const pairs: Array<[string, THREE.BufferGeometry, THREE.BufferGeometry, number]> = [
    ['lining', dense.lining!, reduced.lining!, .0015],
    ['stripe', stripAtHeight(dense.rings,1.75,.55,8.55,.045,.008)!, stripAtHeight(dense.rings,1.75,.55,8.55,.045,.008,true)!, .00015],
    ['roof rail', roofRail(COACH_SPEC,dense.rings,.62,1.7,7.5,.012,.045)!, roofRail(COACH_SPEC,dense.rings,.62,1.7,7.5,.012,.045,true)!, .000001],
  ];
  for (const [name, before, after, bound] of pairs) it(`${name} reduces triangles with bounded bidirectional surface error and outward winding`, () => {
    expect(after.getAttribute('position').count).toBeLessThan(before.getAttribute('position').count);
    const forward = directedError(before, after), backward = directedError(after, before);
    console.log(JSON.stringify({part:name,before:before.getAttribute('position').count/3,after:after.getAttribute('position').count/3,forward,backward,bound}));
    expect(forward).toBeLessThanOrEqual(bound);
    expect(backward).toBeLessThanOrEqual(bound);
    assertWinding(after);
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
