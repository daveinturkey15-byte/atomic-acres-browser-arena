#!/usr/bin/env node
// HF-565 supersedes HF-418: the native-runtime explainer must be absent.
// Historical path retained for existing callers; test actual browser presets.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const base=arg('--url','http://127.0.0.1:41962');
const out=resolve(arg('--out','artifacts/graphics-audit'));
const expected=[['performance','PERFORMANCE'],['balanced','BALANCED'],['high','QUALITY'],['max','MAX'],['custom','CUSTOM']];
const receipt={schema:'hf565-browser-only-options/1',base,checkedAtIso:new Date().toISOString(),issues:[],pageErrors:[],states:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:[...SILENT_ARGS,'--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
mkdirSync(out,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>receipt.pageErrors.push(String(error)));
  await page.goto(base+'/?release=latest&renderer=webgpu&render=quality&externalServices=off&previewTime=0',{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>Boolean(window.__ATOMIC_ACRES_DEBUG__),undefined,{timeout:180000});
  await page.locator('#menu-tab-options').click();
  const read=()=>page.evaluate(()=>{
    const s=window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {options:[...document.querySelectorAll('#graphics-profile option')].map(o=>[o.value,o.textContent]),selectValue:document.querySelector('#graphics-profile').value,
      nativeNodes:document.querySelectorAll('[id*="rtx-native-runtime"],.rtx-runtime-dialog').length,
      graphics:JSON.stringify(s.settings.graphics),backend:s.render.runtime.actualBackend,
      initialized:s.render.runtime.initialized,softwareAdapter:s.render.runtime.softwareAdapter,deviceLost:s.render.runtime.deviceLost,uncapturedErrors:s.render.runtime.uncapturedErrors,
      visibleSummary:[...document.querySelectorAll('.graphics-profile-summary')].filter(n=>!n.hidden).map(n=>n.dataset.graphicsProfile),
      advancedControls:document.querySelectorAll('#advanced-graphics input,#advanced-graphics select').length};
  });
  const before=await read();receipt.before=before;
  if(JSON.stringify(before.options)!==JSON.stringify(expected))receipt.issues.push('exact-browser-ladder-mismatch');
  if(before.nativeNodes!==0)receipt.issues.push('native-runtime-ui-present');
  if(before.backend!=='webgpu'||!before.initialized||before.softwareAdapter!==false||before.deviceLost||before.uncapturedErrors!==0)receipt.issues.push('native-webgpu-admission-failed');
  if(!(before.advancedControls>0))receipt.issues.push('advanced-browser-controls-missing');
  await page.screenshot({path:resolve(out,'browser-only-options.png')});
  for(const [id] of expected){
    await page.locator('#graphics-profile').selectOption(id);
    const state=await read();receipt.states.push(state);
    if(state.selectValue!==id||state.visibleSummary.length!==1||state.visibleSummary[0]!==id)receipt.issues.push('preset-staging-failed:'+id);
    if(state.graphics!==before.graphics)receipt.issues.push('persisted-settings-changed-before-apply:'+id);
    if(state.nativeNodes!==0)receipt.issues.push('native-runtime-ui-appeared:'+id);
  }
  receipt.bundle=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).find(n=>/legacy-main-.*\.js/.test(n)));
} catch(error){receipt.issues.push(String(error));}
finally {await browser.close();receipt.verdict=receipt.issues.length||receipt.pageErrors.length?'FAIL':'PASS';writeFileSync(resolve(out,'rtx-explainer-receipt.json'),JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({verdict:receipt.verdict,issues:receipt.issues,pageErrors:receipt.pageErrors,out}));
if(receipt.verdict!=='PASS')process.exitCode=1;
