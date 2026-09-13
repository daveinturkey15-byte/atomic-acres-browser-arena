import { V2_PEERS, evaluateMpSoakV2 } from './mp-soak-v2-contract.mjs';
import { commonAliveLife, settledLife } from './mp-soak-v2-runtime.mjs';
export const LIFE_CONTRACT='death-support-render-domains-v1';
export const SOAK_CONTRACT='mp-soak-gate-v2.1';

export function commonMappedLife(players, roles=V2_PEERS) {
  const first=players?.host;
  return commonAliveLife(players,roles)&&Number.isSafeInteger(first?.deathCount)&&first.deathCount>=0
    &&Number.isSafeInteger(first?.epoch)&&roles.every(role=>players[role].supportLife===first.continuity
      &&players[role].deathCount===first.deathCount&&players[role].epoch===first.epoch
      &&players[role].subjectId===first.subjectId);
}

export function validMappedLife(result) {
  if(result?.contract!==LIFE_CONTRACT||result.manualRespawn!==false||!commonMappedLife(result.before))return false;
  const old=result.before.host,life=old.continuity,next=life+1,deaths=old.deathCount+1,t=result.trigger;
  if(result.subjectId!==old.subjectId||!t||t.applied?.storedBefore!==100||t.applied.storedAfter!==0)return false;
  if(t.before?.hp!==100||t.after?.hp!==0||t.before.renderLife!==life
    ||t.before.supportLife!==life||t.after.supportLife!==next
    ||t.before.deathCount!==old.deathCount||t.after.deathCount!==deaths
    ||t.before.epoch!==old.epoch||t.after.epoch!==old.epoch)return false;
  // A processed-death identity: match + subject + old life + canonical death
  // counter. This is NOT claimed to be the wire nonce. Duplicate deliveries
  // may be idempotent; a second committed death or extra life increment fails.
  return V2_PEERS.every(role=>{
    const dead=result.dead?.[role],after=result.after?.[role];
    const deadRenderLife=role===result.role?life:next;
    return dead?.subjectId===old.subjectId&&dead.epoch===old.epoch&&dead.hp===0&&dead.alive===false
      &&dead.continuity===deadRenderLife&&dead.supportLife===next&&dead.deathCount===deaths
      &&after?.subjectId===old.subjectId&&after.epoch===old.epoch&&after.hp===100&&after.alive===true
      &&after.continuity===next&&after.supportLife===next&&after.deathCount===deaths
      &&after.weapon===after.primary&&after.ammo>0&&after.reserve>0;
  })&&['guestA','guestB'].includes(result.role);
}

// Serializable browser callback: raw counters only, no mutation and no imports.
export function mappedLifeInPage({id,phase='before',life,deaths}) {
  const s=window.__ATOMIC_ACRES_DEBUG__.snapshot(),self=s.player.id===id;
  const p=self?s.player:s.remotePlayers.find(p=>p.id===id);
  if(!p)return false;
  const row={subjectId:id,epoch:s.killstreak?.matchEpoch,hp:p.hp,alive:self?p.alive:p.hp>0,
    continuity:self?s.networkSync.localContinuity:p.continuity,
    supportLife:s.killstreak?.actors?.find(a=>a.actorId===id)?.lifeId,
    deathCount:s.privateMatch?.scores?.find(p=>p.id===id)?.deaths,
    weapon:p.weapon,primary:self?p.primaryWeapon:p.primary,
    ammo:self?p.ammo:p.combatInventory?.ammo?.[p.weapon],reserve:self?p.reserve:p.combatInventory?.reserve?.[p.weapon]};
  if(phase==='before')return row;
  if(row.supportLife!==life+1||row.deathCount!==deaths+1)return false;
  if(phase==='dead')return row.hp===0&&row.alive===false&&row.continuity===(self?life:life+1)?row:false;
  if(phase==='after')return row.hp===100&&row.alive===true&&row.continuity===life+1
    &&row.weapon===row.primary&&row.ammo>0&&row.reserve>0?row:false;
  return false;
}

export async function naturalDeathRespawnMapped(peers,role,viewOf) {
  const subjectId=(await viewOf(peers[role].page)).selfId;
  const read=async()=>Object.fromEntries(await Promise.all(V2_PEERS.map(async r=>[r,await peers[r].page.evaluate(mappedLifeInPage,{id:subjectId})])));
  const prerequisite=await settledLife(read,V2_PEERS,{accept:commonMappedLife});
  const result={contract:LIFE_CONTRACT,role,subjectId,manualRespawn:false,prerequisite,before:prerequisite.before,dead:{},after:{},failures:[]};
  if(!prerequisite.ok)return {...result,ok:false};
  const {continuity:life,deathCount:deaths}=result.before.host;
  const observe=async(phase,timeout)=>{
    const observations=await Promise.allSettled(V2_PEERS.map(async r=>{
      const handle=await peers[r].page.waitForFunction(mappedLifeInPage,{id:subjectId,phase,life,deaths},{timeout,polling:20});
      const row=await handle.jsonValue();await handle.dispose();return [r,row];
    }));
    result.failures.push(...observations.flatMap((value,i)=>value.status==='rejected'?[{phase,role:V2_PEERS[i],reason:String(value.reason?.message??value.reason).slice(0,200)}]:[]));
    return Object.fromEntries(observations.filter(v=>v.status==='fulfilled').map(v=>v.value));
  };
  const dead=observe('dead',6000); // register every observer before the trigger
  result.trigger=await peers.host.page.evaluate(id=>{
    const d=window.__ATOMIC_ACRES_DEBUG__;
    const take=()=>{
      const s=d.snapshot(),p=s.remotePlayers.find(p=>p.id===id);
      return {hp:p?.hp,renderLife:p?.continuity,supportLife:s.killstreak?.actors?.find(a=>a.actorId===id)?.lifeId,
        deathCount:s.privateMatch?.scores?.find(p=>p.id===id)?.deaths,epoch:s.killstreak?.matchEpoch};
    };
    const before=take(),applied=d.damageRemoteAuthoritatively(500,id),after=take();
    return {before,applied,after};
  },subjectId);
  result.dead=await dead;
  result.after=await observe('after',10000);
  result.last=await read();
  return {...result,ok:validMappedLife(result)};
}

export function evaluateMpSoakV21(bundle) {
  // Reuse all numeric/presence/health assertions unchanged. Only this named
  // life-domain row is replaced; a v2 report cannot qualify as v2.1.
  const previous=evaluateMpSoakV2({...bundle,contract:'mp-soak-gate-v2'});
  const rows=previous.rows.filter(row=>row.id!=='MP-V2-NATURAL-DEATH-RESPAWN');
  rows.push({id:'MP-V21-MAPPED-DEATH-RESPAWN',requirement:'exact death/support/render mapping and one committed death',
    pass:bundle.contract===SOAK_CONTRACT&&['guestA','guestB'].every(role=>validMappedLife(bundle.scenarios?.guests?.[role]?.naturalLife)),evidence:{contract:bundle.contract,lifeContract:LIFE_CONTRACT}});
  return {...previous,rows,pass:rows.every(row=>row.pass)};
}
