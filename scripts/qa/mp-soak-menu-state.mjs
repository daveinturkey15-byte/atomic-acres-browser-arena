// Read only UI identity/state, never field contents, chat text or credentials.
export function pauseStateInPage() {
  const s=window.__ATOMIC_ACRES_DEBUG__.snapshot(),menu=document.querySelector('#menu');
  const button=document.querySelector('#main-menu'),tactical=document.querySelector('#strike-map-overlay');
  return {atEpochMs:Date.now(),surface:menu?.dataset.lifecycleSurface??null,reason:menu?.dataset.lifecycleReason??null,
    pointerPhase:menu?.dataset.pointerLock??null,focused:document.hasFocus(),pointerLocked:document.pointerLockElement!==null,
    activeTab:document.querySelector('[data-menu-tab][aria-selected="true"]')?.getAttribute('data-menu-tab')??null,
    activeElementId:document.activeElement?.id??null,chatTyping:document.activeElement?.id==='text-chat-input',
    tacticalOpen:tactical?tactical.hidden===false:null,alive:s.player.alive,hp:s.player.hp,
    mainMenuVisible:Boolean(button&&!button.hidden&&button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden')};
}
export function pauseAction(state) {
  if(state?.surface==='paused-match')return 'use-visible-menu';
  if(state?.surface!=='hidden'||state.alive!==true||state.chatTyping||state.tacticalOpen)return 'blocked-precondition';
  if(!state.focused)return 'focus-headless-page';
  return state.pointerLocked?'release-pointer-lock':'escape-once';
}
export async function ensurePauseMenu(page,observations) {
  const read=async label=>{const state=await page.evaluate(pauseStateInPage);observations.push({label,...state});return state;};
  let state=await read('before');
  try {
    if(pauseAction(state)==='focus-headless-page') {
      await page.bringToFront();
      await page.waitForFunction(()=>document.hasFocus(),undefined,{timeout:2000});
      state=await read('after-focus');
    }
    if(pauseAction(state)==='release-pointer-lock') {
      // Native browser API, not a DOM unhide or direct game-state transaction.
      await page.evaluate(()=>document.exitPointerLock());
      await page.waitForFunction(()=>document.pointerLockElement===null,undefined,{timeout:2000});
      state=await read('after-pointer-release');
    }
    const action=pauseAction(state);
    if(action==='escape-once') {await page.keyboard.press('Escape');await read('after-escape');}
    else if(action!=='use-visible-menu')throw Error(`Pause action blocked: ${action}`);
    await page.locator('#main-menu').waitFor({state:'visible',timeout:2000});
    state=await read('visible-menu');
    if(state.surface!=='paused-match'||!state.mainMenuVisible)throw Error('Visible control lacks paused-match provenance');
  } catch(error) {await read('failure').catch(()=>{});throw error;}
}
