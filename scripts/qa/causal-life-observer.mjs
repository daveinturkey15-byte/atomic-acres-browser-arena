// QA-only reads. A callback timestamp is a read bracket, not an apply stamp.
export function installCausalDeathObserver({ id }) {
  if (window.__AA_V22_DEATH_OBSERVER__) throw Error('causal death observer already installed');
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  if (typeof debug.sampleCausalLifeSubject !== 'function') throw Error('lightweight causal life observation unavailable');
  const snapshot = debug.snapshot(), self = snapshot.player?.id === id;
  const player = self ? snapshot.player : snapshot.remotePlayers?.find(candidate => candidate.id === id);
  const legacy = {
    subjectId:id, epoch:snapshot.killstreak?.matchEpoch ?? null,
    hp:player?.hp ?? null, alive:self ? player?.alive ?? false : (player?.hp ?? 0)>0,
    renderLife:self ? snapshot.networkSync?.localContinuity ?? null : player?.continuity ?? null,
    supportLife:snapshot.killstreak?.actors?.find(actor=>actor.actorId===id)?.lifeId ?? null,
    deathCount:snapshot.privateMatch?.scores?.find(score=>score.id===id)?.deaths ?? null,
    weapon:player?.weapon ?? null, primary:self ? player?.primaryWeapon ?? null : player?.primary ?? null,
    ammo:self ? player?.ammo : player?.combatInventory?.ammo?.[player?.weapon],
    reserve:self ? player?.reserve : player?.combatInventory?.reserve?.[player?.weapon],
  };
  if (JSON.stringify(legacy)!==JSON.stringify(debug.sampleCausalLifeSubject(id))) throw Error('lightweight causal life parity failed');
  const state={id,rows:[],dropped:0,samples:0,readCostTotalMs:0,readCostMaxMs:0};
  const take=()=>{
    const readStart=performance.now();
    const value=debug.sampleCausalLifeSubject(id);
    const readEnd=performance.now();
    const row={...value,atMs:readStart,readStart,readEnd,origin:performance.timeOrigin};
    state.samples++;
    state.readCostTotalMs+=readEnd-readStart;
    state.readCostMaxMs=Math.max(state.readCostMaxMs,readEnd-readStart);
    if(state.rows.length<2048)state.rows.push(row);else state.dropped++;
  };
  take();state.interval=setInterval(take,20);
  state.expiry=setTimeout(()=>clearInterval(state.interval),10000);
  window.__AA_V22_DEATH_OBSERVER__=state;
  return {installedAt:performance.now(),origin:performance.timeOrigin,lightweightParity:true};
}

export function collectCausalDeathObserver() {
  const state=window.__AA_V22_DEATH_OBSERVER__;
  if(!state)return null;
  clearInterval(state.interval);clearTimeout(state.expiry);
  delete window.__AA_V22_DEATH_OBSERVER__;
  return {rows:state.rows,samples:state.samples,dropped:state.dropped,
    readCostMs:{mean:state.samples?state.readCostTotalMs/state.samples:null,max:state.readCostMaxMs}};
}
