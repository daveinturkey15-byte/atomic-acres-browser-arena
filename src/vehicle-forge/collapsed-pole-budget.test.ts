import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { wheelParts, lampParts } from './wheels';

function noncollapsedRecords(g:THREE.BufferGeometry) {
  const p=g.getAttribute('position');const records:number[][]=[];
  for(let i=0;i<p.count;i+=3) {
    const same=(a:number,b:number)=>p.getX(i+a)===p.getX(i+b)&&p.getY(i+a)===p.getY(i+b)&&p.getZ(i+a)===p.getZ(i+b);
    if(same(0,1)||same(0,2)||same(1,2))continue;
    records.push(...Array.from({length:3},(_,j)=>['position','normal','uv'].flatMap(key=>{
      const attr=g.getAttribute(key);return Array.from({length:attr.itemSize},(_,k)=>attr.array[(i+j)*attr.itemSize+k]!);
    })));
  }
  return records;
}
function assertOnlyCollapsedRemoved(before:THREE.BufferGeometry,after:THREE.BufferGeometry,removed:number) {
  expect(before.getAttribute('position').count-after.getAttribute('position').count).toBe(removed*3);
  const surviving=noncollapsedRecords(before);
  expect(noncollapsedRecords(after)).toEqual(surviving);
  expect(after.getAttribute('position').count).toBe(surviving.length);
  before.computeBoundingBox();after.computeBoundingBox();expect(after.boundingBox).toEqual(before.boundingBox);
}
describe('noncoach budget removes collapsed lathe pole faces only',()=>{
  for(const style of ['cover','steel','whitewall'] as const)it(`${style}: preserves all nonzero-area wheel records and contact envelope`,()=>{
    const before=wheelParts(.34,.115,style),after=wheelParts(.34,.115,style,true);
    assertOnlyCollapsedRemoved(before.face,after.face,16);
    assertOnlyCollapsedRemoved(before.dark,after.dark,6);
    for(const attr of ['position','normal','uv'])expect(after.tyre.getAttribute(attr).array).toEqual(before.tyre.getAttribute(attr).array);
    if(before.whitewall)for(const attr of ['position','normal','uv'])expect(after.whitewall!.getAttribute(attr).array).toEqual(before.whitewall.getAttribute(attr).array);
  });
  it('preserves lamp radius, profile, depth and every visible triangle without reducing radial segments',()=>{
    const before=lampParts(.12,.06,18),after=lampParts(.12,.06,18,true);
    assertOnlyCollapsedRemoved(before.lens,after.lens,18);
    for(const attr of ['position','normal','uv'])expect(after.bezel.getAttribute(attr).array).toEqual(before.bezel.getAttribute(attr).array);
  });
});
