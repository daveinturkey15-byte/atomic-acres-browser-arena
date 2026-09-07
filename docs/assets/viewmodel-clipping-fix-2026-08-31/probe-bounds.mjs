import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const s = await page.context().newCDPSession(page);
await s.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(()=>{});
await page.goto('http://127.0.0.1:41988/?release=latest&renderer=webgpu&render=quality&seed=vmclip', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => { const x = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return x.matchPhase === 'active' && x.gameStarted === true; }, undefined, { timeout: 180000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
await new Promise(r=>setTimeout(r,5000));
for (const w of ['carbine','sniper','explosive-crossbow','flamethrower']) {
  await page.evaluate((w) => { const a=window.__ATOMIC_ACRES_DEBUG__; a.equipWeapon(w); a.teleportPlayer(-30, 1.7, 23.0, Math.PI/2, 0); }, w);
  await new Promise(r=>setTimeout(r,2200));
  const out = await page.evaluate((w) => {
    const api=window.__ATOMIC_ACRES_DEBUG__; const scene=api.sampleSceneGraph(); scene.updateMatrixWorld(true);
    let vm=null; scene.traverse(n=>{ if(!vm&&n.name==='original-weapon-view') vm=n; });
    const model = vm.children.find(c=>c.name.includes(w+'-pass65'));
    if (!model) return { err:'no model', kids: vm.children.map(c=>c.name) };
    const M4 = vm.matrixWorld.constructor;
    const toRoot = new M4().copy(vm.matrixWorld).invert();
    const B3 = scene.constructor === undefined ? null : null;
    const rows=[]; let min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9];
    const visibleChain = (n) => { for(let p=n;p&&p!==vm;p=p.parent) if(!p.visible) return false; return true; };
    model.traverse(n=>{
      if(!n.isMesh) return;
      const g=n.geometry; if(!g) return; if(!g.boundingBox) g.computeBoundingBox();
      const bb=g.boundingBox; if(!bb) return;
      const m = new M4().multiplyMatrices(toRoot, n.matrixWorld).elements;
      let lo=[1e9,1e9,1e9], hi=[-1e9,-1e9,-1e9];
      for(let i=0;i<8;i++){ const x=(i&1)?bb.max.x:bb.min.x,y=(i&2)?bb.max.y:bb.min.y,z=(i&4)?bb.max.z:bb.min.z;
        const p=[m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
        for(let k=0;k<3;k++){ if(p[k]<lo[k])lo[k]=p[k]; if(p[k]>hi[k])hi[k]=p[k]; } }
      const vis = n.visible && visibleChain(n);
      rows.push({name:n.name.slice(0,42), vis, lo:lo.map(v=>+v.toFixed(3)), hi:hi.map(v=>+v.toFixed(3))});
      if (vis) for(let k=0;k<3;k++){ if(lo[k]<min[k])min[k]=lo[k]; if(hi[k]>max[k])max[k]=hi[k]; }
    });
    return { weapon:w, min:min.map(v=>+v.toFixed(3)), max:max.map(v=>+v.toFixed(3)), rows: rows.slice(0,14) };
  }, w);
  console.log(JSON.stringify(out));
}
await browser.close();
