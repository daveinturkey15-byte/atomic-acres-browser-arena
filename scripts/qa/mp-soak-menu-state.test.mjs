import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pauseAction,ensurePauseMenu} from './mp-soak-menu-state.mjs';
const hidden={surface:'hidden',alive:true,focused:true,pointerLocked:false,chatTyping:false,tacticalOpen:false,mainMenuVisible:false};
test('paused options state uses menu without Escape/resume',()=>assert.equal(pauseAction({...hidden,surface:'paused-match',activeTab:'options'}),'use-visible-menu'));
test('locked, unfocused and overlay states have explicit different actions',()=>{
  assert.equal(pauseAction({...hidden,pointerLocked:true}),'release-pointer-lock');
  assert.equal(pauseAction({...hidden,focused:false}),'focus-headless-page');
  for(const s of [{...hidden,alive:false},{...hidden,chatTyping:true},{...hidden,tacticalOpen:true},{...hidden,surface:'pre-match'}])assert.equal(pauseAction(s),'blocked-precondition');
});
test('already paused visible menu performs no input mutation',async()=>{
  const observations=[];
  await ensurePauseMenu({evaluate:async()=>({...hidden,surface:'paused-match',mainMenuVisible:true}),locator:()=>({waitFor:async()=>{}}),keyboard:{press:async()=>{throw Error('Must not toggle paused state');}}},observations);
  assert.deepEqual(observations.map(s=>s.label),['before','visible-menu']);
});
test('failure preserves pre/post metadata and never blindly retries Escape',async()=>{
  let presses=0;const observations=[];
  await assert.rejects(ensurePauseMenu({evaluate:async()=>({...hidden}),keyboard:{press:async()=>{presses++;}},locator:()=>({waitFor:async()=>{throw Error('Still hidden');}})},observations),/Still hidden/);
  assert.equal(presses,1);assert.deepEqual(observations.map(s=>s.label),['before','after-escape','failure']);
});
