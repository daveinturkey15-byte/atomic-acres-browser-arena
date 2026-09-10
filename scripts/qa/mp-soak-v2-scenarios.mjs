import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { V2_PEERS, validNaturalLife } from './mp-soak-v2-contract.mjs';
import { evaluateHealthLatencyV2 } from './health-latency-v2.mjs';
import { settledLife } from './mp-soak-v2-runtime.mjs';

export async function calibrate(page) {
  const rows=[];
  for(let i=0;i<3;i++) {
    const nodeBefore=Date.now();
    const sample=await page.evaluate(()=>({now:performance.now(),origin:performance.timeOrigin,date:Date.now()}));
    rows.push({...sample,nodeBefore,nodeAfter:Date.now()});
  }
  return rows;
}
export async function naturalDeathRespawn(peers, role, viewOf) {
  const subjectId=(await viewOf(peers[role].page)).selfId;
  const prerequisite=await settledLife(async()=>Object.fromEntries(await Promise.all(V2_PEERS.map(async r=>[r,(await viewOf(peers[r].page)).players[subjectId]]))),V2_PEERS);
  const before=prerequisite.before;
  if(!prerequisite.ok)return {subjectId,manualRespawn:false,prerequisite,before,dead:{},after:{},ok:false};
  const watches=V2_PEERS.map(async r=>{
    const handle=await peers[r].page.waitForFunction(id=>{
      const s=window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const p=s.player.id===id?{hp:s.player.hp,alive:s.player.alive,continuity:s.networkSync.localContinuity}:s.remotePlayers.find(p=>p.id===id);
      return p&&p.hp===0?{hp:p.hp,alive:false,continuity:p.continuity}:false;
    },subjectId,{timeout:6000,polling:20});
    const dead=await handle.jsonValue();await handle.dispose();return [r,dead];
  });
  // Observe promises immediately so a timeout cannot become unhandled while
  // the authoritative trigger is awaited.
  const deadObserved=Promise.allSettled(watches);
  const applied=await peers.host.page.evaluate(id=>window.__ATOMIC_ACRES_DEBUG__.damageRemoteAuthoritatively(500,id),subjectId);
  const observations=await deadObserved;
  const dead=Object.fromEntries(observations.filter(r=>r.status==='fulfilled').map(r=>r.value));
  const lifeWait=await Promise.allSettled(V2_PEERS.map(async r=>{
    await peers[r].page.waitForFunction(({id,previous})=>{
      const s=window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const p=s.player.id===id?{hp:s.player.hp,continuity:s.networkSync.localContinuity}:s.remotePlayers.find(p=>p.id===id);
      return p&&p.hp===100&&p.continuity>previous;
    },{id:subjectId,previous:before[r]?.continuity},{timeout:10000,polling:20});
    return [r,(await viewOf(peers[r].page)).players[subjectId]];
  }));
  const after=Object.fromEntries(lifeWait.filter(r=>r.status==='fulfilled').map(r=>r.value));
  const result={subjectId,manualRespawn:false,prerequisite,applied,before,dead,after};
  return {...result,ok:validNaturalLife(result)};
}
export async function rejoinV2(peers, bundle, viewOf) {
  const identityBefore=bundle.identities.guestB;
  // The active-match lobby button is hidden. Follow the same visible pause
  // and MAIN MENU route an owner uses; both buttons call returnToMainMenu.
  await peers.guestB.page.keyboard.press('Escape');
  await peers.guestB.page.locator('#main-menu').waitFor({state:'visible',timeout:2000});
  const hostBefore=await viewOf(peers.host.page);
  const transition={role:'guestB',identityBefore,beforeRevision:hostBefore.lobby?.revision,intentAt:Date.now(),leave:{},settled:{}};
  bundle.lifecycle.transition=transition;
  bundle.lifecycle.active=true;
  const roomCode=(await peers.host.page.textContent('#room-code')).trim();
  const observes=Promise.allSettled(['host','guestA'].map(async role=>{
    const h=await peers[role].page.waitForFunction(id=>{
      const s=window.__ATOMIC_ACRES_DEBUG__.snapshot(),m=s.privateMatch?.members??[];
      return !m.some(p=>p.id===id&&p.connected)&&s.remotes===1
        ?{disconnected:true,revision:s.privateMatch.revision,atEpochMs:Date.now()}:false;
    },identityBefore,{timeout:2000,polling:20});
    const row=await h.jsonValue();await h.dispose();return[role,row];
  }));
  await peers.guestB.page.click('#main-menu',{timeout:2000});
  const leave=await observes;
  transition.leave=Object.fromEntries(leave.filter(r=>r.status==='fulfilled').map(r=>r.value));
  if(Object.keys(transition.leave).length!==2)throw Error('Both remaining peers must acknowledge intentional leave');
  await peers.guestB.page.fill('#room-input',roomCode);
  await peers.guestB.page.waitForFunction(()=>document.querySelector('#join')?.disabled===false,undefined,{timeout:60000});
  transition.joinAt=Date.now();
  await peers.guestB.page.click('#join',{timeout:2000});
  const deadline=transition.joinAt+60000;
  for(const role of V2_PEERS) {
    const h=await peers[role].page.waitForFunction(()=>{
      const s=window.__ATOMIC_ACRES_DEBUG__.snapshot(),connected=(s.privateMatch?.members??[]).filter(m=>m.connected);
      return connected.length===3&&s.remotes===2?{remotes:s.remotes,connectedIds:connected.map(m=>m.id),revision:s.privateMatch.revision}:false;
    },undefined,{timeout:Math.max(1,deadline-Date.now()),polling:20});
    transition.settled[role]=await h.jsonValue();await h.dispose();
  }
  transition.identityAfter=(await viewOf(peers.guestB.page)).selfId;
  if(transition.identityAfter!==identityBefore)throw Error('Rejoin changed stable identity');
  transition.settledAt=Date.now();
  bundle.lifecycle.active=false;
  return {ok:true};
}
export async function damageBoundaryV2(peers, subjectId, viewOf) {
  const report={completed:false,subjectId,calibration:{before:{},after:{}},peers:{}};
  report.beforeHp=Object.fromEntries(await Promise.all(V2_PEERS.map(async role=>[role,(await viewOf(peers[role].page)).players?.[subjectId]?.hp??null])));
  if(!V2_PEERS.every(role=>report.beforeHp[role]===100))throw Error('Rejoined subject must be at100 on every peer before the damage probe');
  for(const role of V2_PEERS)report.calibration.before[role]=await calibrate(peers[role].page);
  report.nodeTriggeredAt=Date.now();
  report.trigger=await peers.host.page.evaluate(id=>{
    const before=performance.now(),applied=window.__ATOMIC_ACRES_DEBUG__.damageRemoteAuthoritatively(20,id);
    return {before,after:performance.now(),origin:performance.timeOrigin,applied};
  },subjectId);
  // Observe well beyond120ms, but only the actual bounded application stamp
  // decides latency. Delayed/missing/uncertain application never passes.
  await new Promise(resolve=>setTimeout(resolve,500));
  for(const role of V2_PEERS) {
    report.calibration.after[role]=await calibrate(peers[role].page);
    report.peers[role]=await peers[role].page.evaluate(()=>({trace:window.__ATOMIC_ACRES_DEBUG__.sampleHealthAuthorityTrace()}));
  }
  report.completed=true;
  return {report,measurement:evaluateHealthLatencyV2(report)};
}
export async function verifyLiveArtifact(peers, port, dist) {
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const indexHash=hash(await(await fetch(`http://127.0.0.1:${port}/`)).bytes());
  const indexExpected=hash(readFileSync(join(dist,'index.html'))),results={};
  for(const role of V2_PEERS) {
    const observed=await peers[role].page.evaluate(()=>({backend:document.documentElement.dataset.renderBackend,bundle:performance.getEntriesByType('resource').map(r=>r.name).find(n=>/\/legacy-main-.*\.js/.test(n))}));
    const url=new URL(observed.bundle);
    if(url.origin!==`http://127.0.0.1:${port}`)throw Error('Unexpected runtime bundle origin');
    const liveHash=hash(await(await fetch(url)).bytes()),expectedHash=hash(readFileSync(join(dist,url.pathname)));
    results[role]={...observed,indexHash,indexExpected,indexMatches:indexHash===indexExpected,liveHash,expectedHash,mainMatches:liveHash===expectedHash};
    if(!results[role].indexMatches||!results[role].mainMatches)throw Error('Live artifact does not match supplied immutable directory');
  }
  return results;
}
