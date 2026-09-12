// Separately versioned diagnostic consumer. Never edits a canonical gate/report.
export const HEALTH_LATENCY_V2_BOUND_MS = 120;
const finite = Number.isFinite;
const validRow = row => row && [row.atMs,row.timeOriginMs,row.hp].every(finite)
  && row.hp>=0 && row.hp<=100 && [row.revision,row.continuity,row.matchEpoch].every(v=>Number.isSafeInteger(v)&&v>=0)
  && [row.subjectId,row.authorId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v));
const key = row => [row.subjectId,row.authorId,row.revision,row.continuity,row.matchEpoch,row.hp].join('|');
const unknown = reason => ({verdict:'UNKNOWN',reason});

export function clockEnvelope(before, after, event) {
  if(!Array.isArray(before)||!Array.isArray(after)||!before.length||!after.length)return unknown('missing-clock-brackets');
  const valid = rows => rows.every(row=>[row.now,row.origin,row.date,row.nodeBefore,row.nodeAfter].every(finite)
    &&row.nodeAfter>=row.nodeBefore&&row.origin===event.timeOriginMs
    &&row.date>=row.nodeBefore-1&&row.date<=row.nodeAfter+1&&Math.abs(row.origin+row.now-row.date)<=2);
  if(!valid(before)||!valid(after))return unknown('invalid-clock-domain-or-bracket');
  const best = rows => rows.reduce((a,b)=>a.nodeAfter-a.nodeBefore<=b.nodeAfter-b.nodeBefore?a:b);
  const a=best(before),b=best(after);
  if(!finite(event.atMs)||a.now>event.atMs||b.now<event.atMs)return unknown('event-not-bracketed');
  // Integer Date.now quantization: widen EACH clock endpoint by one ms.
  // Envelope, not intersection: do not hide the observed pre/post variation.
  const low=Math.min(a.nodeBefore-a.now,b.nodeBefore-b.now)-1;
  const high=Math.max(a.nodeAfter-a.now,b.nodeAfter-b.now)+1;
  return {verdict:'MAPPED',low,high,before:a,after:b,
    assumption:'clock offset during the event stays inside the observed before/after envelope plus1ms quantization; abrupt unobserved clock jumps remain unknown'};
}

export function evaluateHealthLatencyV2(report) {
  const result={schema:'health-latency-v2',boundMs:HEALTH_LATENCY_V2_BOUND_MS,scope:'single-event diagnostic; not canonical MP acceptance',verdict:'UNKNOWN',peers:{}};
  if(!report.completed||!finite(report.nodeTriggeredAt)||!report.trigger?.applied
    ||![report.trigger.before,report.trigger.after,report.trigger.origin].every(finite)
    ||report.trigger.after<report.trigger.before)return {...result,reason:'incomplete-event'};
  const trace=report.peers?.host?.trace;
  if(!trace?.enabled||trace.dropped!==0||!Array.isArray(trace.rows))return {...result,reason:'host-trace-missing-or-clipped'};
  const publications=trace.rows.filter(row=>validRow(row)&&row.timeOriginMs===report.trigger.origin&&row.stage==='publish'&&row.subjectId===report.subjectId
    &&row.atMs>=report.trigger.before&&row.atMs<=report.trigger.after&&row.hp===report.trigger.applied.storedAfter);
  if(publications.length!==1||!(report.trigger.applied.storedAfter<report.trigger.applied.storedBefore))return {...result,reason:'ambiguous-publication'};
  const publication=publications[0];
  result.eventKey=key(publication);
  for(const role of ['guestA','guestB']) {
    const peer=report.peers?.[role];
    if(!peer?.trace?.enabled||peer.trace.dropped!==0||!Array.isArray(peer.trace.rows)){result.peers[role]=unknown('receiver-trace-missing-or-clipped');continue;}
    const rows=peer.trace.rows.filter(row=>validRow(row)&&key(row)===result.eventKey);
    const applies=rows.filter(row=>row.stage==='apply'&&row.observedHp===publication.hp).sort((a,b)=>a.atMs-b.atMs);
    const apply=applies[0];
    if(!apply){result.peers[role]=unknown('no-actual-apply-boundary; state-lane transition is not instrumented');continue;}
    const admitted=rows.find(row=>row.stage==='admit'&&row.reason==='accepted'&&row.observedHp>publication.hp&&row.atMs<=apply.atMs);
    const received=rows.find(row=>row.stage==='receive'&&admitted&&row.atMs<=admitted.atMs&&row.timeOriginMs===apply.timeOriginMs);
    if(!admitted||!received||admitted.timeOriginMs!==apply.timeOriginMs){result.peers[role]=unknown('actual-health-transition-not-proven');continue;}
    const clock=clockEnvelope(report.calibration?.before?.[role],report.calibration?.after?.[role],apply);
    if(clock.verdict!=='MAPPED'){result.peers[role]=clock;continue;}
    const lowerMs=apply.atMs+clock.low-report.nodeTriggeredAt;
    const upperMs=apply.atMs+clock.high-report.nodeTriggeredAt;
    if(lowerMs<0||!finite(lowerMs)||!finite(upperMs)){result.peers[role]=unknown('noncausal-clock-interval');continue;}
    result.peers[role]={verdict:upperMs<=HEALTH_LATENCY_V2_BOUND_MS?'PASS':lowerMs>HEALTH_LATENCY_V2_BOUND_MS?'FAIL':'UNKNOWN',
      reason:upperMs<=HEALTH_LATENCY_V2_BOUND_MS?'conservative-upper-within120':lowerMs>HEALTH_LATENCY_V2_BOUND_MS?'conservative-lower-exceeds120':'uncertainty-overlaps120',
      lowerMs,upperMs,clock,applyAtMs:apply.atMs};
  }
  const verdicts=Object.values(result.peers).map(row=>row.verdict);
  result.verdict=verdicts.every(v=>v==='PASS')?'PASS':verdicts.some(v=>v==='FAIL')?'FAIL':'UNKNOWN';
  return result;
}
