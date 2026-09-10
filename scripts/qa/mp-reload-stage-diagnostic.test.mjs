import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeSkyShot, ammoAcknowledged } from './mp-reload-stage-diagnostic.mjs';
const pose=()=>({player:{alive:true,hp:100,weapon:'carbine',pitch:1.42,yaw:0,position:[0,1.7,0]},privateMatch:{hostedBotCount:0},remotePlayers:[{hp:100,position:[5,1.7,0]},{hp:100,position:[-5,1.7,0]}]});
test('safe shot requires upward ordinary weapon and clear expanded player cones',()=>{
  assert.equal(safeSkyShot(pose()),true);
  for(const mutate of [s=>s.player.pitch=0,s=>s.player.weapon='rpg',s=>s.remotePlayers[0].position=[0,5,-.5],s=>s.privateMatch.hostedBotCount=1,s=>s.remotePlayers[0].hp=0]) {
    const s=pose();mutate(s);assert.equal(safeSkyShot(s),false);
  }
});
test('real ammo acknowledgement requires all peers, alive and the same consumed count',()=>{
  const rows=Object.fromEntries(['host','guestA','guestB'].map(r=>[r,{players:{id:{alive:true,hp:100,weapon:'carbine',ammo:29}}}]));
  assert.equal(ammoAcknowledged(rows,'id',29),true);
  rows.host.players.id.ammo=30;assert.equal(ammoAcknowledged(rows,'id',29),false);
});
test('diagnostic never stages ammo or respawn and preserves sampled uncertainty',()=>{
  const source=readFileSync(new URL('./mp-reload-stage-diagnostic.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.setAmmo\(|\.setRemoteAmmoAuthoritatively\(|\.respawn\(|\.teleportPlayer\(/);
  assert.match(source,/previousReadEnd/);assert.match(source,/nodeBefore,nodeAfter/);
  assert.match(source,/rows.length<1024/);assert.match(source,/25000/);
});
