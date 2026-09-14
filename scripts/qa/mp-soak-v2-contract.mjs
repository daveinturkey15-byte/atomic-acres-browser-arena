import { evaluateMpSoakBundle, MP_SOAK_THRESHOLDS } from './mp-soak-assertions.mjs';
import { evaluateHealthLatencyV2 } from './health-latency-v2.mjs';
export const V2_PEERS = Object.freeze(['host','guestA','guestB']);
const position = p => Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export function inspectConnectedSample(views, identities, roles=V2_PEERS) {
  const failures=[],directions=[];
  if(new Set(roles.map(role=>identities?.[role])).size!==roles.length)failures.push({field:'duplicate-peer-identity'});
  for(const role of roles) {
    const view=views?.[role],id=identities?.[role];
    if(!id||view?.selfId!==id||view.gameStarted!==true||view.matchPhase!=='active')failures.push({peer:role,field:'connected-identity-or-phase'});
    if(roles.length===3&&(view?.remotes!==2||view?.lobby?.members?.filter(m=>m.connected===true).length!==3))failures.push({peer:role,field:'three-peer-world-roster'});
    for(const source of roles) {
      const sourceId=identities?.[source],player=view?.players?.[sourceId];
      const member=view?.lobby?.members?.find(m=>m.id===sourceId);
      if(!player||member?.connected!==true)failures.push({peer:role,source,field:'expected-connected-presence'});
      if(!position(player?.position))failures.push({peer:role,source,field:'position-shape'});
    }
  }
  for(const from of roles) for(const to of roles) {
    if(from===to)continue;
    const id=identities?.[from],source=views?.[from]?.players?.[id],target=views?.[to]?.players?.[id];
    const a=source?.authoritativePosition??source?.position,b=target?.position;
    if(!position(a)||!position(b))continue;
    directions.push(`${from}->${to}`);
    const distanceM=Math.hypot(...a.map((v,i)=>v-b[i]));
    if(distanceM>MP_SOAK_THRESHOLDS.positionBoundM)failures.push({from,peer:to,playerId:id,field:'position',distanceM,sourcePosition:a,targetPosition:b,sourceContinuity:source.continuity,targetContinuity:target.continuity});
  }
  return {pass:failures.length===0,failures,directions};
}
export function validNaturalLife(result) {
  if(!result||result.manualRespawn!==false||result.applied?.storedAfter!==0||!(result.applied?.storedBefore>0))return false;
  return V2_PEERS.every(role=>{
    const before=result.before?.[role],dead=result.dead?.[role],after=result.after?.[role];
    return before?.alive===true&&Number.isSafeInteger(before.continuity)
      &&dead?.alive===false&&dead.hp===0&&dead.continuity===before.continuity
      &&after?.alive===true&&after.hp===100&&after.continuity>before.continuity
      &&after.continuity===result.after.host.continuity&&before.continuity===result.before.host.continuity
      &&after.weapon===after.primary&&after.ammo>0&&after.reserve>0;
  });
}
export function evaluateMpSoakV2(bundle) {
  const base=evaluateMpSoakBundle(bundle);
  const extra=(id,pass,evidence)=>({id,requirement:id,pass:pass===true,evidence});
  const samples=bundle.replication?.samples??[],lifecycle=bundle.lifecycle;
  const transition=lifecycle?.transition;
  const health=evaluateHealthLatencyV2(bundle.rejoin?.damage?.report??{});
  const fullSamples=samples.length>=180&&samples.every((s,i)=>Number.isFinite(s.atEpochMs)
    &&(!i||s.atEpochMs-samples[i-1].atEpochMs>=1000)
    &&V2_PEERS.every(role=>s.identities?.[role]===bundle.identities?.[role])
    &&inspectConnectedSample(s.peers,s.identities).pass);
  const lifecycleValid=transition?.role==='guestB'&&transition.identityBefore===transition.identityAfter
    &&Number.isFinite(transition.intentAt)&&transition.joinAt>transition.intentAt&&transition.settledAt>=transition.joinAt
    &&transition.settledAt-transition.joinAt<=60000
    &&['host','guestA'].every(role=>transition.leave?.[role]?.disconnected===true
      &&transition.leave[role].atEpochMs>=transition.intentAt&&transition.leave[role].atEpochMs<=transition.joinAt
      &&transition.leave[role].revision>=transition.beforeRevision)
    &&V2_PEERS.every(role=>transition.settled?.[role]?.remotes===2&&transition.settled[role].connectedIds?.length===3
      &&Object.values(bundle.identities??{}).every(id=>transition.settled[role].connectedIds.includes(id)))
    &&Array.isArray(lifecycle.samples)&&lifecycle.samples.length>0
    &&lifecycle.samples.every(s=>(s.readEndedAt??s.atEpochMs)>=transition.intentAt&&s.atEpochMs<=transition.settledAt
      &&inspectConnectedSample(s.peers,s.identities,['host','guestA']).pass);
  const rows=[...base.rows,
    extra('MP-V2-FROZEN-CONFIG',bundle.contract==='mp-soak-gate-v2'&&bundle.config.playDurationMs===180000&&bundle.config.sampleIntervalMs===1000&&bundle.config.positionBoundM===1.5&&bundle.config.rttMs===120&&bundle.config.packetLossPct===1&&bundle.config.hardTimeoutMs===299000,{config:bundle.config}),
    extra('MP-V2-CONNECTED-COVERAGE',fullSamples,{samples:samples.length}),
    extra('MP-V2-EXPLICIT-LIFECYCLE',lifecycleValid,{transition,transitionSamples:lifecycle?.samples?.length}),
    extra('MP-V2-NATURAL-DEATH-RESPAWN',['guestA','guestB'].every(role=>validNaturalLife(bundle.scenarios?.guests?.[role]?.naturalLife)),{}),
    extra('MP-V2-HEALTH-BOUNDARIES',health.verdict==='PASS'&&health.boundMs===120,health),
    extra('MP-V2-LIVE-ARTIFACT',/^[0-9a-f]{40}$/.test(bundle.sourceSha??'')&&V2_PEERS.every(role=>bundle.liveArtifact?.[role]?.backend==='webgpu'&&bundle.liveArtifact[role].indexMatches===true&&bundle.liveArtifact[role].mainMatches===true),bundle.liveArtifact),
  ];
  return {pass:rows.every(r=>r.pass),rows,thresholds:base.thresholds};
}
