import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCanonicalDeathLifecycle } from './mp-death-lifecycle.mjs';
import { evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';

function fixture() {
  const expected = { subjectId:'a', revision:2, continuity:3, matchEpoch:7, authorId:'host' };
  const row = (revision, continuity, hp, atMs, stage='publish') => ({ ...expected,revision,continuity,hp,atMs,stage,timeOriginMs:1000 });
  const state = (atMs,hp,renderLife,supportLife,deathCount) => ({subjectId:'a',epoch:7,origin:1000,atMs,readStart:atMs,readEnd:atMs,hp,alive:hp>0,renderLife,supportLife,deathCount});
  return {traceScope:'multi',expected,baselineDeathCount:0,
    trigger:{origin:1000,atMs:8,afterAtMs:12,before:state(8,100,3,3,0),after:state(12,0,3,4,1),applied:{targetId:'a',storedBefore:100,storedAfter:0}},
    healthRows:[row(2,3,0,10),row(3,4,0,20),row(2,3,0,25,'send-call'),row(4,4,100,30)],
    healthWindow:{complete:true},
    deathEvents:[{...expected,kind:'canonical-death',transportCopies:2}],
    hostStageTrace:{dropped:0,samples:4,rows:[state(5,100,3,3,0),state(15,0,3,4,1),state(25,0,4,4,1),state(35,100,4,4,1)]}};
}
test('held-dead lifecycle is separately proven without changing strict single-fact rejection',()=>{
  const f=fixture();
  assert.equal(evaluateCanonicalDeathReplay(f).pass,false);
  const result=evaluateCanonicalDeathLifecycle(f);
  assert.equal(result.pass,true,JSON.stringify(result.reasons));
  assert.equal(result.evidence.canonicalDeathCount,1);
  assert.equal(f.healthRows.length,4);
});
test('synchronous trigger anchors old-life death when timer skips that state',()=>{
  const f=fixture();
  f.hostStageTrace.rows.splice(1,1);
  f.hostStageTrace.samples--;
  assert.equal(evaluateCanonicalDeathLifecycle(f).pass,true);
});
test('local held and alive reads may precede outgoing publications, with later witnesses',()=>{
  const f=fixture(), rows=f.hostStageTrace.rows;
  rows.splice(2,0,{...rows[2],atMs:19,readStart:19,readEnd:19});
  rows.splice(4,0,{...rows[4],atMs:29,readStart:29,readEnd:29});
  f.hostStageTrace.samples=rows.length;
  assert.equal(evaluateCanonicalDeathLifecycle(f).pass,true);
});
test('lifecycle rejects conflicting identities, second deaths, missing and unordered evidence',()=>{
  const cases={
    extraOldKey:f=>f.healthRows.push({...f.healthRows[0],revision:9,atMs:40}),
    lifeJump:f=>{f.healthRows[1].continuity=5;},
    wrongAuthor:f=>{f.healthRows[1].authorId='other';},
    counterTwo:f=>{f.trigger.after.deathCount=2;},
    secondEvent:f=>f.deathEvents.push({...f.deathEvents[0]}),
    deathAfterAlive:f=>f.healthRows.push({...f.healthRows[1],atMs:40}),
    missingHeld:f=>{f.hostStageTrace.rows.splice(2,1);},
    badExtraIdentity:f=>f.healthRows.push({stage:'publish',subjectId:'other',hp:0}),
    mismatchedCopy:f=>{f.healthRows[2].hp=100;},
    staleRevision:f=>{f.healthRows[1].revision=1;},
    badClock:f=>{f.healthRows[1].timeOriginMs=1001;},
    badStageClock:f=>{f.hostStageTrace.rows[2].origin=1001;},
    mismatchedReadStart:f=>{f.hostStageTrace.rows[2].atMs=19;},
    noInitialDeathAnchor:f=>{delete f.trigger.after.renderLife;},
    initialLifeAlreadyAdvanced:f=>{f.trigger.after.renderLife=4;},
    initialSupportNotAdvanced:f=>{f.trigger.after.supportLife=3;},
    initialAlive:f=>{f.trigger.after.alive=true;},
    missingTriggerClock:f=>{delete f.trigger.afterAtMs;},
    reverseTrigger:f=>{f.trigger.afterAtMs=7;},
    publicationOutsideTrigger:f=>{f.trigger.afterAtMs=9;},
    unaccountedSample:f=>{f.hostStageTrace.samples++;},
    missingReadEnd:f=>{delete f.hostStageTrace.rows[2].readEnd;},
    reverseRead:f=>{f.hostStageTrace.rows[2].readEnd=24;},
    overlappingReads:f=>{f.hostStageTrace.rows[1].readEnd=26;},
    noHeldPublicationWitness:f=>{Object.assign(f.hostStageTrace.rows[2],{atMs:19,readStart:19,readEnd:19});},
    noAlivePublicationWitness:f=>{Object.assign(f.hostStageTrace.rows[3],{atMs:29,readStart:29,readEnd:29});},
    heldBeforeTrigger:f=>{f.hostStageTrace.rows.splice(1,1);f.hostStageTrace.samples--;Object.assign(f.hostStageTrace.rows[1],{atMs:11,readStart:11,readEnd:11});},
    clippedStage:f=>{f.hostStageTrace.dropped=1;},
    clippedWindow:f=>{f.healthWindow.complete=false;},
    hiddenCounterTwo:f=>{f.hostStageTrace.rows[2].deathCount=2;},
    noStages:f=>{delete f.hostStageTrace;},
    noPublish:f=>{f.healthRows[1].stage='send-call';},
    extraAliveRevision:f=>f.healthRows.push({...f.healthRows[3],revision:5,atMs:40}),
  };
  for(const [name,mutate]of Object.entries(cases)){const f=fixture();mutate(f);assert.equal(evaluateCanonicalDeathLifecycle(f).pass,false,name);}
});
