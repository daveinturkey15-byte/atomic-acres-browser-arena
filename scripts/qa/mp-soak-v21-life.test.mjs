import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIFE_CONTRACT,SOAK_CONTRACT,validMappedLife,commonMappedLife,mappedLifeInPage,evaluateMpSoakV21} from './mp-soak-v21-life.mjs';
const roles=['host','guestA','guestB'];
const checkpoint=(continuity=3,hp=100,supportLife=continuity,deathCount=2)=>({subjectId:'a',epoch:7,hp,alive:hp>0,continuity,supportLife,deathCount,weapon:'carbine',primary:'carbine',ammo:30,reserve:120});
const fixture=()=>({contract:LIFE_CONTRACT,role:'guestA',subjectId:'a',manualRespawn:false,
  before:Object.fromEntries(roles.map(r=>[r,checkpoint()])),
  trigger:{applied:{storedBefore:100,storedAfter:0},before:{hp:100,renderLife:3,supportLife:3,deathCount:2,epoch:7},after:{hp:0,renderLife:3,supportLife:4,deathCount:3,epoch:7}},
  dead:Object.fromEntries(roles.map(r=>[r,checkpoint(r==='guestA'?3:4,0,4,3)])),
  after:Object.fromEntries(roles.map(r=>[r,checkpoint(4,100,4,3)]))});
test('exact asymmetric dead render mapping converges to one new life',()=>assert.equal(validMappedLife(fixture()),true));
test('same mapping works for subjectB, not role-based host shortcuts',()=>{const f=fixture();f.role='guestB';f.dead.guestA.continuity=4;f.dead.guestB.continuity=3;assert.equal(validMappedLife(f),true);});
test('no observed death fails even with agreeing respawn',()=>{const f=fixture();delete f.dead.guestB;assert.equal(validMappedLife(f),false);});
test('duplicate committed death fails even if every peer agrees on its count',()=>{const f=fixture();f.trigger.after.deathCount=4;for(const r of roles){f.dead[r].deathCount=4;f.after[r].deathCount=4;}assert.equal(validMappedLife(f),false);});
test('stale death counter and stale epoch fail',()=>{for(const mutate of[f=>f.dead.guestB.deathCount=2,f=>f.dead.host.epoch=6,f=>f.trigger.before.renderLife=2]){const f=fixture();mutate(f);assert.equal(validMappedLife(f),false);}});
test('extra increment fails instead of accepting any newer generation',()=>{const f=fixture();f.trigger.after.supportLife=5;for(const r of roles){f.dead[r].supportLife=5;f.after[r].continuity=5;f.after[r].supportLife=5;}assert.equal(validMappedLife(f),false);});
test('old-or-new render wildcard is explicitly not allowed',()=>{for(const r of roles){const f=fixture();f.dead[r].continuity=r==='guestA'?4:3;assert.equal(validMappedLife(f),false);}});
test('discordant after-respawn life or inventory fails',()=>{for(const mutate of[f=>f.after.guestB.continuity=5,f=>f.after.host.ammo=0,f=>f.after.guestA.weapon='pistol']){const f=fixture();mutate(f);assert.equal(validMappedLife(f),false);}});
test('pre-existing domain disagreement and wrong subject cannot qualify',()=>{const f=fixture();f.before.host.supportLife=4;assert.equal(commonMappedLife(f.before),false);assert.equal(validMappedLife(f),false);const g=fixture();g.dead.host.subjectId='b';assert.equal(validMappedLife(g),false);});
test('old contract cannot be retroactively accepted',()=>{const f=fixture();delete f.contract;assert.equal(validMappedLife(f),false);assert.equal(SOAK_CONTRACT,'mp-soak-gate-v2.1');});
test('browser callback reads exact support/render/death-counter domains without mutation',()=>{
  const snapshot={player:{id:'a',hp:0,alive:false,weapon:'carbine',primaryWeapon:'carbine',ammo:30,reserve:120},networkSync:{localContinuity:3},remotePlayers:[],killstreak:{matchEpoch:7,actors:[{actorId:'a',lifeId:4}]},privateMatch:{scores:[{id:'a',deaths:3}]}};
  const encoded=JSON.stringify(snapshot),previous=globalThis.window;
  globalThis.window={__ATOMIC_ACRES_DEBUG__:{snapshot:()=>snapshot}};
  try{assert.equal(mappedLifeInPage({id:'a',phase:'dead',life:3,deaths:2}).continuity,3);assert.equal(mappedLifeInPage({id:'a',phase:'after',life:3,deaths:2}),false);assert.equal(JSON.stringify(snapshot),encoded);}finally{globalThis.window=previous;}
});
test('v21 wrapper preserves numeric failure and rejects v2 reports',()=>{
  const b={contract:'mp-soak-gate-v2',sourceSha:'a'.repeat(40),config:{},scenarios:{guests:{guestA:{naturalLife:fixture()},guestB:{naturalLife:fixture()}}}};
  const result=evaluateMpSoakV21(b);assert.equal(result.pass,false);
  assert.equal(result.rows.find(r=>r.id==='MP-V21-MAPPED-DEATH-RESPAWN').pass,false);
  assert.equal(result.rows.find(r=>r.id==='MP-V2-FROZEN-CONFIG').pass,false);
});
