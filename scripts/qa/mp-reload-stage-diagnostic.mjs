import { V2_PEERS } from './mp-soak-v2-contract.mjs';
import { commonMappedLife, naturalDeathRespawnMapped } from './mp-soak-v21-life.mjs';
import { calibrate } from './mp-soak-v2-scenarios.mjs';

export function safeSkyShot(snapshot) {
  const p=snapshot.player;
  if(!p?.alive||p.hp!==100||p.weapon!=='carbine'||p.pitch<1.35||snapshot.privateMatch?.hostedBotCount!==0)return false;
  const direction=[-Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch)];
  return snapshot.remotePlayers.length===2&&snapshot.remotePlayers.every(remote=>{
    const delta=remote.position.map((n,i)=>n-p.position[i]),distance=Math.hypot(...delta);
    // Exclude an expanded body cone, including spread and nearby collision.
    return remote.hp===100&&distance>2&&delta.reduce((sum,n,i)=>sum+n*direction[i],0)/distance<Math.cos(0.5+Math.asin(Math.min(1,1.5/distance)));
  });
}

// Diagnostic projection only: the existing predicate above remains the gate.
// Retain every prerequisite's observed inputs when an unsafe pose stops a run.
export function safeSkyShotEvidence(snapshot) {
  const p = snapshot.player;
  return {
    safe: safeSkyShot(snapshot),
    playerPosition: p?.position ? [...p.position] : null,
    pitch: p?.pitch ?? null, yaw: p?.yaw ?? null,
    alive: p?.alive ?? null, hp: p?.hp ?? null, weapon: p?.weapon ?? null,
    hostedBotCount: snapshot.privateMatch?.hostedBotCount ?? null,
    prerequisiteChecks: {
      alive: p?.alive === true,
      fullHealth: p?.hp === 100,
      carbine: p?.weapon === 'carbine',
      upwardPitch: Number.isFinite(p?.pitch) && p.pitch >= 1.35,
      zeroHostedBots: snapshot.privateMatch?.hostedBotCount === 0,
      twoRemotes: snapshot.remotePlayers.length === 2,
      remotesFullHealth: snapshot.remotePlayers.every(remote => remote.hp === 100),
    },
    remotes: snapshot.remotePlayers.map(remote => ({ hp: remote.hp, position: [...remote.position] })),
  };
}

export function ammoAcknowledged(rows,id,expected) {
  return V2_PEERS.every(role=>{
    const p=rows[role]?.players?.[id];
    return p?.alive&&p.hp===100&&p.weapon==='carbine'&&p.ammo===expected;
  });
}

// Diagnostic-only observer. It never mutates game state. All sampled state
// transitions carry before/after browser timestamps, NOT exact apply stamps.
export function installReloadObserver({id}) {
  if(window.__AA_RELOAD_OBSERVER__)throw Error('diagnostic observer already installed');
  const state={id,rows:[],dropped:0,samples:0,previousEnd:null,signature:null};
  const take=()=>{
    const readStart=performance.now(),s=window.__ATOMIC_ACRES_DEBUG__.snapshot(),self=s.player.id===id;
    if(state.samples===0)state.shotProtocolBefore={...s.networkSync?.shotProtocol};
    const p=self?s.player:s.remotePlayers.find(p=>p.id===id);
    const value={hp:p?.hp,alive:self?p?.alive:p?.hp>0,continuity:self?s.networkSync.localContinuity:p?.continuity,
      supportLife:s.killstreak?.actors?.find(a=>a.actorId===id)?.lifeId,
      deaths:s.privateMatch?.scores?.find(a=>a.id===id)?.deaths,
      position:p?.position?.map(n=>Math.round(n*1000)/1000),weapon:p?.weapon,
      ammo:self?p?.ammo:p?.combatInventory?.ammo?.[p.weapon],reloading:p?.reloading};
    const readEnd=performance.now(),signature=JSON.stringify(value);state.samples++;
    if(signature!==state.signature) {
      const row={previousReadEnd:state.previousEnd,readStart,readEnd,timeOrigin:performance.timeOrigin,...value};
      if(state.rows.length<1024)state.rows.push(row);else state.dropped++;
      state.signature=signature;
    }
    state.previousEnd=readEnd;
  };
  take();state.interval=setInterval(take,50);
  state.expiry=setTimeout(()=>clearInterval(state.interval),25000);
  window.__AA_RELOAD_OBSERVER__=state;
  return {installedAt:performance.now(),origin:performance.timeOrigin};
}

export function collectReloadObserver() {
  const o=window.__AA_RELOAD_OBSERVER__;
  if(!o)return null;
  clearInterval(o.interval);clearTimeout(o.expiry);
  const s=window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const result={rows:o.rows,samples:o.samples,dropped:o.dropped,
    protocol:s.reloadAuthority.protocolTrace.filter(p=>p.actorId===o.id),
    protocolCapacity:128,protocolAtCapacity:s.reloadAuthority.protocolTrace.length>=128,
    healthTrace:window.__ATOMIC_ACRES_DEBUG__.sampleHealthAuthorityTrace(),
    shotEvidence:{
      scope:'peer-wide counters and last16 host resolutions; resolution rows lack actor IDs and cannot alone establish actor attribution',
      protocolBefore:o.shotProtocolBefore??null,
      protocolAfter:s.networkSync?.shotProtocol??null,
      timeline:s.networkSync?.shotTimeline??null,
      localContinuity:s.networkSync?.localContinuity??null,
      localHistory:s.networkSync?.localHistory??null,
      remoteReadiness:s.remotePlayers.filter(p=>p.id===o.id).map(p=>({id:p.id,continuity:p.continuity,authoritativeReady:p.authoritativeReady,position:p.position,authoritativePosition:p.authoritativePosition,historyFirst:p.historyFirst,historyLatest:p.historyLatest})),
    },
    fireBlock:s.fireBlock,atMs:performance.now(),origin:performance.timeOrigin};
  delete window.__AA_RELOAD_OBSERVER__;
  return result;
}

export async function reloadStageDiagnostic(peers,report,viewOf,sleep) {
  report.scope='bounded safe-shot/reload stage diagnostic, not soak acceptance';
  report.observationPolicy='50ms sampled transitions are brackets, not exact apply times; protocol stamps keep local clock domains; 25s observer expiry and1024-row cap';
  report.guests={};
  const read=async()=>Object.fromEntries(await Promise.all(V2_PEERS.map(async role=>{
    const nodeBefore=Date.now(),view=await viewOf(peers[role].page);
    return [role,{...view,nodeBefore,nodeAfter:Date.now()}];
  })));
  for(const role of ['guestA','guestB']) {
    const id=(await viewOf(peers[role].page)).selfId;
    const row=report.guests[role]={id,calibration:{before:{},after:{}},reads:[],observers:{},completed:false};
    try {
      for(const r of V2_PEERS)row.calibration.before[r]=await calibrate(peers[r].page);
      await Promise.all(V2_PEERS.map(r=>peers[r].page.evaluate(installReloadObserver,{id})));
      row.life=await naturalDeathRespawnMapped(peers,role,viewOf);
      // A strict dead-tuple failure remains recorded; staging uses independently
      // observed fully alive after-state, not an invented life/HP/ammo value.
      if(!commonMappedLife(row.life.after))throw Error('Post-respawn common alive prerequisite missing');
      const before=await read();row.reads.push({phase:'before-shot',peers:before});
      const ammo=before.host.players[id].ammo;
      if(!Number.isInteger(ammo)||ammo<2||!ammoAcknowledged(before,id,ammo))throw Error('Ammo not settled before real consumption');
      await peers[role].page.evaluate(()=>window.__ATOMIC_ACRES_DEBUG__.aimAtRemoteWithOffset(Math.PI,Math.PI/2));
      const pose=await peers[role].page.evaluate(()=>{
        const s=window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {player:s.player,privateMatch:{hostedBotCount:s.privateMatch.hostedBotCount},remotePlayers:s.remotePlayers.map(p=>({hp:p.hp,position:p.position}))};
      });
      row.safeShot=safeSkyShotEvidence(pose);
      if(!row.safeShot.safe)throw Error('Safe sky-shot cone prerequisite failed');
      row.shotNodeBefore=Date.now();
      await peers[role].page.evaluate(()=>window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      row.shotNodeAfter=Date.now();
      const deadline=Date.now()+4000;let settledAt=null;
      while(Date.now()<deadline) {
        const current=await read();row.reads.push({phase:'shot-ack',peers:current});
        if(ammoAcknowledged(current,id,ammo-1)) {
          settledAt??=Date.now();if(Date.now()-settledAt>=250){row.ammoAcknowledged=true;break;}
        } else settledAt=null;
        await sleep(50);
      }
      if(!row.ammoAcknowledged)throw Error('Real shot never reached stable authoritative ammo acknowledgement');
      row.reloadNodeBefore=Date.now();
      row.reloadTrigger=await peers[role].page.evaluate(()=>{
        const d=window.__ATOMIC_ACRES_DEBUG__,before=d.snapshot().player;
        const atMs=performance.now();d.reload();const after=d.snapshot().player;
        return {atMs,afterAtMs:performance.now(),origin:performance.timeOrigin,beforeAmmo:before.ammo,afterAmmo:after.ammo,reloading:after.reloading};
      });
      row.reloadNodeAfter=Date.now();
      await sleep(5500);
      const after=await read();row.reads.push({phase:'after-reload',peers:after});
      row.refilled=ammoAcknowledged(after,id,ammo);
      row.noExtraDeaths=V2_PEERS.every(r=>Object.entries(before[r].players).every(([pid,p])=>after[r].players[pid]?.score?.deaths===p.score?.deaths&&after[r].players[pid]?.hp===p.hp));
      row.completed=true;
    } catch(error) {row.failure=String(error?.message??error);}
    finally {
      await Promise.all(V2_PEERS.map(async r=>{row.observers[r]=await peers[r].page.evaluate(collectReloadObserver).catch(()=>null);}));
      for(const r of V2_PEERS)row.calibration.after[r]=await calibrate(peers[r].page);
    }
  }
}
