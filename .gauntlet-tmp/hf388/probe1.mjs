import { chromium } from '@playwright/test';
const BASE = process.argv[2] ?? 'http://127.0.0.1:41941';
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=p&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240000 });
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const t = api.samplePresentationTelemetry();
  return {
    keys: Object.keys(t).slice(0, 80),
    armsSource: t.armsSource,
    riggedArmsLen: Array.isArray(t.riggedArms) ? t.riggedArms.length : typeof t.riggedArms,
    riggedArms0: Array.isArray(t.riggedArms) ? t.riggedArms[0] : null,
    authoredFingerBoneCount: t.authoredFingerBoneCount,
    authoredMeleeChainCount: t.authoredMeleeChainCount,
    viewmodelViewport: t.viewmodelViewport,
    evidenceLeft: api.setArmEvidenceCapture('left'),
  };
});
console.log('TEL', JSON.stringify(out, null, 1).slice(0, 4000));
const ev = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const r = api.setArmEvidenceCapture('right');
  const t = api.samplePresentationTelemetry();
  return { right: r, cap: t.armEvidenceCapture };
});
console.log('EVIDENCE', JSON.stringify(ev, null, 1));
const ev2 = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const l = api.setArmEvidenceCapture('left');
  const t = api.samplePresentationTelemetry();
  return { left: l, cap: t.armEvidenceCapture };
});
console.log('EVIDENCE-LEFT', JSON.stringify(ev2, null, 1));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture(null));

// bots in atomic-acres
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240000 });
await page.waitForTimeout(4000);
const bots = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = api.sampleSceneGraph();
  const named = [];
  let withRuntime = 0;
  scene.traverse((node) => {
    if (node.userData && node.userData.riggedOperatorRuntime) {
      withRuntime += 1;
      named.push({
        name: String(node.name ?? ''),
        skin: String(node.userData.operatorSkinId ?? '(unset)'),
        arch: node.userData.riggedOperatorRuntime.director?.profile?.archetype ?? null,
        playerId: node.userData.playerId ?? null,
        visible: node.visible,
        pos: node.getWorldPosition(new node.position.constructor()).toArray().map((v) => Math.round(v * 100) / 100),
      });
    }
  });
  return { withRuntime, named: named.slice(0, 20), snapshotKeys: Object.keys(api.snapshot()).slice(0, 60) };
});
console.log('BOTS', JSON.stringify(bots, null, 1).slice(0, 4000));
await browser.close();
