import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('executed top-level reload mode boots mocked peers then exits without soak or stairs',async()=>{
  const url=new URL('./mp-soak-gate-v21.mjs',import.meta.url);
  // Only module imports are dependency-injected. The real top-level argv,
  // main(), mode branch, writer and finally block execute unchanged.
  let source=readFileSync(url,'utf8').replace(/^#![^\n]*\n/,'').replace(/^import[\s\S]*?;\r?\n/gm,'').replaceAll('import.meta.url',JSON.stringify(url.href));
  for(const name of ['runStairScenarios','runGuestScenarios','scriptedPlay','sampleReplication']) {
    const pattern=new RegExp(`(async function ${name}\\([^)]*\\) \\{)`);
    assert.match(source,pattern);
    source=source.replace(pattern,`$1 throw Error('FORBIDDEN ${name}');`);
  }
  const calls=[],writes=[];
  const page={click:async()=>{},fill:async()=>{},selectOption:async()=>{},waitForFunction:async()=>{},textContent:async()=> 'ROOM'};
  const fakeProcess={argv:['node','gate','--sha','b'.repeat(40),'--reload-diagnostic'],env:{},execPath:'node',platform:'test',pid:1,exit:()=>{throw Error('unexpected forced exit');}};
  const dependencies={
    process:fakeProcess,spawnSync:()=>({stdout:'a'.repeat(40)}),mkdirSync:()=>{},existsSync:()=>false,
    writeFile:async(path,data)=>writes.push({path,data}),join,resolve,fileURLToPath,
    chromium:{launch:async()=>{calls.push('browser');return {close:async()=>calls.push('closed')};}},
    PEERS:['host','guestA','guestB'],MP_SOAK_THRESHOLDS:{playDurationMs:180000,rttMs:120,positionBoundM:1.5},SOAK_CONTRACT:'mp-soak-gate-v2.1',
    multiplayerArenaRoster:()=>[{id:'nuketown2'}],serveDist:async()=>{calls.push('server');return {close:()=>calls.push('server-close')};},
    startPeerServer:async()=>{calls.push('peer-server');return {kill:()=>calls.push('peer-stop')};},chromeArgs:()=>[],
    openPeer:async()=>({page,errors:{page:[],console:[]}}),verifyLiveArtifact:async()=>({verified:true}),
    reloadStageDiagnostic:async(peers,report)=>{calls.push('reload-diagnostic');report.guests={guestA:{completed:true,refilled:true,noExtraDeaths:true},guestB:{completed:true,refilled:true,noExtraDeaths:true}};},
    finalizationWriter:()=>row=>{calls.push(`cleanup:${row.cleanup}`);},
    boundedStep:async task=>task(),traceOf:async()=>null,viewOf:async()=>null,sleep:async()=>{},
    setTimeout:()=>1,clearTimeout:()=>{},console:{log:()=>{},error:()=>{}},
  };
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction(...Object.keys(dependencies),source)(...Object.values(dependencies));
  assert.equal(calls.filter(c=>c==='browser').length,3);
  assert.equal(calls.filter(c=>c==='reload-diagnostic').length,1);
  assert.equal(writes.length,1);assert.match(writes[0].path,/-reload-diagnostic.json$/);
  assert.equal(JSON.parse(writes[0].data).failure,null);
  assert.equal(calls.filter(c=>c==='closed').length,3);
  assert.equal(calls.at(-1),'cleanup:normal');assert.equal(fakeProcess.exitCode,undefined);
});
