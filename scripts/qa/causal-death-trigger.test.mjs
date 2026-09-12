import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { captureCausalDeathTrigger } from './causal-death-trigger.mjs';

test('captures actual before/after reads around one synchronous authoritative damage call',()=>{
  let tick=0, dead=false, reads=0, calls=0;
  const result=vm.runInNewContext(`(${captureCausalDeathTrigger.toString()})('guest')`,{
    performance:{now:()=>++tick,timeOrigin:9000},
    window:{__ATOMIC_ACRES_DEBUG__:{
      sampleCausalLifeSubject:id=>{reads++;return {subjectId:id,hp:dead?0:100,alive:!dead,renderLife:2,supportLife:dead?3:2,deathCount:dead?1:0};},
      damageRemoteAuthoritatively:(damage,id)=>{calls++;assert.equal(damage,500);assert.equal(id,'guest');dead=true;return {targetId:id,storedBefore:100,storedAfter:0};},
      snapshot:()=>{throw Error('Full scene census must not run');},
    }},
  });
  assert.equal(reads,2);assert.equal(calls,1);
  assert.equal(result.before.hp,100);assert.equal(result.after.hp,0);
  assert.equal(result.before.origin,result.origin);assert.equal(result.after.origin,result.origin);
  assert.ok(result.before.readStart<result.before.readEnd);
  assert.ok(result.before.readEnd<result.atMs);
  assert.ok(result.atMs<result.after.readStart);
  assert.ok(result.after.readStart<result.after.readEnd);
  assert.ok(result.after.readEnd<result.afterAtMs);
});
test('missing getter fails before any damage',()=>{
  assert.throws(()=>vm.runInNewContext(`(${captureCausalDeathTrigger.toString()})('guest')`,{
    window:{__ATOMIC_ACRES_DEBUG__:{damageRemoteAuthoritatively:()=>{throw Error('Must not damage');}}},
  }),/causal trigger read unavailable/);
});
