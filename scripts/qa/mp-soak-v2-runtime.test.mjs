import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boundedStep, waitOrStop, commonAliveLife, settledLife } from './mp-soak-v2-runtime.mjs';
import { rejoinV2 } from './mp-soak-v2-scenarios.mjs';
const roles=['host','guestA','guestB'];
const players=()=>Object.fromEntries(roles.map(role=>[role,{hp:100,alive:true,continuity:3}]));

test('common life rejects missing/dead/partial-health/different-life baselines',()=>{
  assert.equal(commonAliveLife(players(),roles),true);
  for(const mutate of [p=>delete p.guestB,p=>p.guestA.hp=99,p=>p.host.alive=false,p=>p.guestB.continuity=4]) {
    const p=players();mutate(p);assert.equal(commonAliveLife(p,roles),false);
  }
});
test('settled prerequisite retains initial mismatch and waits without changing player state',async()=>{
  let calls=0;
  const result=await settledLife(async()=>{
    const p=players();if(calls++<2)p.guestB.continuity=4;return p;
  },roles,{timeoutMs:300,stableMs:15,pollMs:5});
  assert.equal(result.ok,true);assert.ok(result.observations.length>=4);
  assert.equal(result.observations[0].players.guestB.continuity,4);
  assert.equal(result.before.guestB.continuity,3);
});
test('permanently discordant baseline fails within the bound and preserves observations',async()=>{
  const result=await settledLife(async()=>{const p=players();p.guestB.continuity=4;return p;},roles,{timeoutMs:25,stableMs:10,pollMs:5});
  assert.equal(result.ok,false);assert.ok(result.observations.length>0);
});
test('hanging diagnostics/cleanup operation is bounded',async()=>{
  await assert.rejects(boundedStep(()=>new Promise(()=>{}),10,'fake cleanup'),/fake cleanup timed out/);
});
test('cancellation releases a sleeping sampler immediately and prevents another sample',async()=>{
  const control=new AbortController();let samples=0;
  const worker=(async()=>{while(await waitOrStop(10000,control.signal))samples++;})();
  control.abort();await boundedStep(()=>worker,100,'sampler cancellation');
  assert.equal(samples,0);assert.equal(await waitOrStop(10000,control.signal),false);
});
test('real pause/main-menu controls are visible before leave; no force or DOM mutation',async()=>{
  const calls=[],ids={host:'h',guestA:'a',guestB:'b'};
  const handle=value=>({jsonValue:async()=>value,dispose:async()=>{}});
  const peers=Object.fromEntries(roles.map(role=>[role,{page:{
    keyboard:{press:async key=>calls.push(`key:${key}`)},
    locator:selector=>({waitFor:async options=>{assert.equal(options.state,'visible');calls.push(`visible:${selector}`);}}),
    textContent:async()=> 'ROOM',
    waitForFunction:async(fn,arg)=>{
      const source=fn.toString();
      if(source.includes('disconnected:true'))return handle({disconnected:true,revision:5,atEpochMs:Date.now()});
      if(source.includes('connectedIds:'))return handle({remotes:2,connectedIds:Object.values(ids),revision:6});
      return handle(true);
    },
    click:async(selector,options)=>{assert.notEqual(options?.force,true);calls.push(`click:${selector}`);},
    fill:async(selector,value)=>{assert.equal(value,'ROOM');calls.push(`fill:${selector}`);},
    evaluate:async()=>{throw Error('No direct DOM mutation allowed');},
  }}]));
  const bundle={identities:ids,lifecycle:{}};
  const result=await rejoinV2(peers,bundle,async page=>({selfId:page===peers.guestB.page?'b':'h',lobby:{revision:4}}));
  assert.equal(result.ok,true);
  assert.deepEqual(calls,['key:Escape','visible:#main-menu','click:#main-menu','fill:#room-input','click:#join']);
  assert.equal(bundle.lifecycle.active,false);
});
test('driver keeps hard protection until bounded cleanup and cancels both loops',()=>{
  const source=readFileSync(new URL('./mp-soak-gate-v2.mjs',import.meta.url),'utf8');
  assert.equal((source.match(/while \(!cancellation\.signal\.aborted/g)??[]).length,2);
  assert.match(source,/for\(const role of \['guestA','guestB'\]\)/);
  assert.ok(source.indexOf('hardKillTimer=setTimeout')<source.indexOf('const launches='));
  const final=source.slice(source.lastIndexOf('} finally {'));
  assert.ok(final.indexOf('cancellation.abort()')<final.indexOf('await closeOwnedBrowsers()'));
  assert.ok(final.indexOf('await closeOwnedBrowsers()')<final.indexOf('clearTimeout(hardKillTimer)'));
  assert.match(source,/String\(process\.pid\)/);
  assert.doesNotMatch(source,/browser\?\.process/);
});
