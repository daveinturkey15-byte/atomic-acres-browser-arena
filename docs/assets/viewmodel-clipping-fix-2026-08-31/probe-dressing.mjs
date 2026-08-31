import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const s = await page.context().newCDPSession(page); await s.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(()=>{});
await page.goto('http://127.0.0.1:41988/?release=latest&renderer=webgpu&render=quality&seed=vmclip', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
for (const arena of ['atomic-acres','test2']) {
  await page.evaluate(async (a) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(a); window.__ATOMIC_ACRES_DEBUG__.startSolo(); }, arena);
  await page.waitForFunction(() => { const x = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return x.matchPhase === 'active'; }, undefined, { timeout: 180000 });
  await new Promise(r=>setTimeout(r,4000));
  const out = await page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); scene.updateMatrixWorld(true);
    const stats = { total:0, meshes:0, batched:0, instanced:0, tooShort:0, tooThin:0, tooWide:0, kept:0, invisible:0 };
    const roots = [];
    for (const c of scene.children) roots.push({name:c.name||c.type, kids:c.children.length});
    const box = new (scene.position.constructor === undefined ? Object : Object)();
    const T = scene; // placeholder
    const B3 = Object.getPrototypeOf(scene).constructor;
    scene.traverse(n=>{ stats.total++; if(!n.isMesh) return; stats.meshes++;
      if(!n.visible){stats.invisible++;return;}
      if(n.userData.staticBatchRendered===true){stats.batched++;return;}
      if(n.isInstancedMesh){stats.instanced++;return;}
      const g=n.geometry; if(!g) return; if(!g.boundingBox) g.computeBoundingBox(); const bb=g.boundingBox; if(!bb)return;
      const m=n.matrixWorld.elements; let lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
      for(let i=0;i<8;i++){const x=(i&1)?bb.max.x:bb.min.x,y=(i&2)?bb.max.y:bb.min.y,z=(i&4)?bb.max.z:bb.min.z;
        const p=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
        for(let k=0;k<3;k++){if(p[k]<lo[k])lo[k]=p[k];if(p[k]>hi[k])hi[k]=p[k];}}
      const w=hi[0]-lo[0],h=hi[1]-lo[1],d=hi[2]-lo[2];
      if(h<1.05){stats.tooShort++;return;} if(Math.min(w,d)<0.16){stats.tooThin++;return;} if(w>12||d>12){stats.tooWide++;return;}
      stats.kept++;
    });
    return { stats, roots, diag: window.__ATOMIC_ACRES_DEBUG__.sampleFireAdmissionDiagnostics().dressingBoxCount };
  });
  console.log(arena, JSON.stringify(out));
}
await browser.close();
