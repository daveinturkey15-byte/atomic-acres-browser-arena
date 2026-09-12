import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {installCausalDeathObserver,collectCausalDeathObserver} from './causal-life-observer.mjs';

function harness(self=true) {
  let snapshots=0,interval,clock=0;
  const value={subjectId:'a',epoch:7,hp:100,alive:true,renderLife:3,supportLife:3,deathCount:0,weapon:'carbine',primary:'carbine',ammo:30,reserve:120};
  const snapshot={player:{id:self?'a':'host',hp:100,alive:true,primaryWeapon:'carbine',weapon:'carbine',ammo:30,reserve:120},
    remotePlayers:[{id:'a',hp:100,continuity:3,primary:'carbine',weapon:'carbine',combatInventory:{ammo:{carbine:30},reserve:{carbine:120}}}],
    networkSync:{localContinuity:3},killstreak:{matchEpoch:7,actors:[{actorId:'a',lifeId:3}]},privateMatch:{scores:[{id:'a',deaths:0}]}};
  const debug={snapshot(){snapshots++;return snapshot;},sampleCausalLifeSubject(){return value;}};
  const context={window:{__ATOMIC_ACRES_DEBUG__:debug},performance:{now:()=>clock+=0.01,timeOrigin:1000},
    setInterval(fn,ms){assert.equal(ms,20);interval=fn;return 1;},setTimeout(fn,ms){assert.equal(ms,10000);return 2;},clearInterval(){},clearTimeout(){}};
  return {value,debug,context,tick:()=>interval(),snapshots:()=>snapshots};
}
test('local and remote parity covers reserve/primary/life and does not poll the scene',()=>{
  for(const self of [true,false]){
    const h=harness(self);
    runInNewContext(`(${installCausalDeathObserver})({id:'a'})`,h.context);
    h.value.hp=0;h.value.alive=false;h.value.supportLife=4;h.value.deathCount=1;h.tick();
    h.value.renderLife=4;h.tick();
    h.value.hp=100;h.value.alive=true;h.tick();
    const result=runInNewContext(`(${collectCausalDeathObserver})()`,h.context);
    assert.equal(h.snapshots(),1);
    assert.equal(result.rows.length,5);
    assert.deepEqual(Array.from(result.rows,r=>r.hp),[100,0,0,100,100]);
    assert.ok(result.rows.every(r=>r.readEnd>=r.readStart && r.atMs===r.readStart));
    assert.ok(result.readCostMs.max<0.02);
    assert.equal(h.context.window.__AA_V22_DEATH_OBSERVER__,undefined);
  }
});
test('closing read retains a respawn that occurred after the final timer tick',()=>{
  const h=harness();
  runInNewContext(`(${installCausalDeathObserver})({id:'a'})`,h.context);
  h.value.hp=0;h.value.alive=false;h.value.renderLife=4;h.value.supportLife=4;h.value.deathCount=1;h.tick();
  h.value.hp=100;h.value.alive=true; // No timer tick after this state change.
  const result=runInNewContext(`(${collectCausalDeathObserver})()`,h.context);
  assert.deepEqual(Array.from(result.rows,r=>r.hp),[100,0,100]);
  assert.equal(result.samples,result.rows.length);
  assert.ok(result.rows[2].readStart>result.rows[1].readEnd);
  assert.equal(result.rows[2].deathCount,1);
  assert.equal(h.snapshots(),1);
});
test('observer refuses missing thin reader and parity drift instead of silently dropping fields',()=>{
  for(const field of ['reserve','primary','epoch','renderLife','supportLife','deathCount']){
    const h=harness();h.value[field]='wrong';
    assert.throws(()=>runInNewContext(`(${installCausalDeathObserver})({id:'a'})`,h.context),/parity failed/);
  }
  const h=harness();delete h.debug.sampleCausalLifeSubject;
  assert.throws(()=>runInNewContext(`(${installCausalDeathObserver})({id:'a'})`,h.context),/unavailable/);
});
