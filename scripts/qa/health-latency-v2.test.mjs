import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateHealthLatencyV2, HEALTH_LATENCY_V2_BOUND_MS } from './health-latency-v2.mjs';
const row=(stage,atMs,observedHp=null)=>({stage,atMs,timeOriginMs:1000,subjectId:'subject',authorId:'host',revision:7,continuity:4,matchEpoch:2,hp:80,observedHp,reason:stage==='admit'?'accepted':null});
const clock=(now,width=0)=>({now,origin:1000,date:1000+now,nodeBefore:1000+now-width,nodeAfter:1000+now+width});
function fixture(applyAt=1100,width=0){
  return {completed:true,nodeTriggeredAt:2000,subjectId:'subject',trigger:{before:1000,after:1001,origin:1000,applied:{storedBefore:100,storedAfter:80}},
    calibration:{before:{guestA:[clock(990,width)],guestB:[clock(990,width)]},after:{guestA:[clock(1300,width)],guestB:[clock(1300,width)]}},
    peers:{host:{trace:{enabled:true,dropped:0,rows:[row('publish',1000,80)]}},guestA:{trace:{enabled:true,dropped:0,rows:[row('receive',applyAt),row('admit',applyAt,100),row('apply',applyAt,80)]}},guestB:{trace:{enabled:true,dropped:0,rows:[row('receive',applyAt),row('admit',applyAt,100),row('apply',applyAt,80)]}}}};
}
test('bound remains exactly120 and upper-bound admission includes timestamp quantization',()=>{
  assert.equal(HEALTH_LATENCY_V2_BOUND_MS,120);const result=evaluateHealthLatencyV2(fixture());
  assert.equal(result.verdict,'PASS');assert.deepEqual([result.peers.guestA.lowerMs,result.peers.guestA.upperMs],[99,101]);
});
test('a genuinely delayed apply remainsFAIL',()=>assert.equal(evaluateHealthLatencyV2(fixture(1150)).verdict,'FAIL'));
test('a120ms point with uncertainty is UNKNOWN notroundedPASS',()=>assert.equal(evaluateHealthLatencyV2(fixture(1120)).verdict,'UNKNOWN'));
test('the entire conservative interval including upper120 is accepted',()=>assert.equal(evaluateHealthLatencyV2(fixture(1119)).verdict,'PASS'));
test('large CDP uncertainty crossing120 is UNKNOWN',()=>assert.equal(evaluateHealthLatencyV2(fixture(1100,25)).verdict,'UNKNOWN'));
test('never-apply and incomplete observation cannotPASS',()=>{const f=fixture();f.peers.guestA.trace.rows=[];assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('clipped trace cannotPASS',()=>{const f=fixture();f.peers.guestA.trace.dropped=1;assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('clock-domain mismatch cannotPASS',()=>{const f=fixture();f.calibration.after.guestA[0].origin=2000;assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('event outside calibration bracket cannotPASS',()=>{const f=fixture();f.calibration.after.guestA[0]=clock(1050);assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('wrong revision or subject does notcount asapply',()=>{for(const field of ['revision','continuity','matchEpoch','subjectId']){const f=fixture();f.peers.guestA.trace.rows.at(-1)[field]='different';assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');}});
test('already-lowered HP without actualtransition cannotPASS',()=>{const f=fixture();f.peers.guestA.trace.rows[1].observedHp=80;assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('duplicate matching publication isambiguous notPASS',()=>{const f=fixture();f.peers.host.trace.rows.push(row('publish',1000.5,80));assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('does notmutate source evidence',()=>{const f=fixture();const before=JSON.stringify(f);evaluateHealthLatencyV2(f);assert.equal(JSON.stringify(f),before);});
test('malformed identity and impossible clocks cannotPASS',()=>{const f=fixture();f.peers.host.trace.rows[0].revision=NaN;assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');const g=fixture();g.calibration.before.guestA[0].date+=100;assert.equal(evaluateHealthLatencyV2(g).verdict,'UNKNOWN');});
test('missing actualreceive boundary cannotPASS',()=>{const f=fixture();f.peers.guestA.trace.rows.shift();assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');});
test('well-formed but mismatched numeric identity cannotPASS',()=>{for(const field of ['revision','continuity','matchEpoch']){const f=fixture();f.peers.guestA.trace.rows.at(-1)[field]+=1;assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');}});
test('different valid subject or author identity cannotPASS',()=>{for(const field of ['subjectId','authorId']){const f=fixture();f.peers.guestA.trace.rows.at(-1)[field]='another-valid-peer';assert.equal(evaluateHealthLatencyV2(f).verdict,'UNKNOWN');}});
