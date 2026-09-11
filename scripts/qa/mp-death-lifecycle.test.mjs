import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCanonicalDeathLifecycle } from './mp-death-lifecycle.mjs';
import { evaluateCanonicalDeathReplay } from './mp-canonical-replay-consumer.mjs';

function fixture() {
  const expected = { subjectId:'a', revision:2, continuity:3, matchEpoch:7, authorId:'host' };
  const row = (revision, continuity, hp, atMs, stage='publish') => ({ ...expected,revision,continuity,hp,atMs,stage,timeOriginMs:1000 });
  const state = (atMs,hp,renderLife,supportLife,deathCount) => ({subjectId:'a',epoch:7,origin:1000,atMs,hp,alive:hp>0,renderLife,supportLife,deathCount});
  return {traceScope:'multi',expected,baselineDeathCount:0,
    trigger:{origin:1000,before:{subjectId:'a',epoch:7,hp:100,deathCount:0},after:{subjectId:'a',epoch:7,hp:0,deathCount:1},applied:{targetId:'a',storedBefore:100,storedAfter:0}},
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
    stageBeforePublication:f=>{f.hostStageTrace.rows[2].atMs=19;},
    clippedStage:f=>{f.hostStageTrace.dropped=1;},
    clippedWindow:f=>{f.healthWindow.complete=false;},
    hiddenCounterTwo:f=>{f.hostStageTrace.rows[2].deathCount=2;},
    noStages:f=>{delete f.hostStageTrace;},
    noPublish:f=>{f.healthRows[1].stage='send-call';},
    extraAliveRevision:f=>f.healthRows.push({...f.healthRows[3],revision:5,atMs:40}),
  };
  for(const [name,mutate]of Object.entries(cases)){const f=fixture();mutate(f);assert.equal(evaluateCanonicalDeathLifecycle(f).pass,false,name);}
});
