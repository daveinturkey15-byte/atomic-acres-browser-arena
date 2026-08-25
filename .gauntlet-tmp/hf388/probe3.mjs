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
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=p3&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240000 });
await page.waitForTimeout(5000);
const out = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const rows = [];
  api.sampleSceneGraph().traverse((node) => {
    const rs = node.userData?.riggedOperatorRuntime;
    if (!rs || !String(node.name ?? '').includes('bot-operator')) return;
    rows.push({
      skin: String(node.userData.operatorSkinId ?? '?'),
      arch: rs.director?.profile?.archetype ?? null,
      pref: rs.director?.profile?.idleClipPreference ?? null,
      clips: [...rs.clips.keys()],
      selected: rs.lastAnimation?.selectedClip ?? null,
      state: rs.lastAnimation?.state ?? null,
      layers: rs.lastAnimation?.layers ?? null,
      posture: rs.lastAnimation?.posture ?? null,
      stancePref: node.userData.operatorStanceId ?? null,
      currentBase: rs.currentBase,
      poseBoneNames: Object.keys(rs.poseBones ?? {}),
      chestQ: rs.poseBones?.chest ? rs.poseBones.chest.rotation.x : null,
      spineQ: rs.poseBones?.abdomen ? rs.poseBones.abdomen.rotation.x : null,
      headQ: rs.poseBones?.head ? rs.poseBones.head.rotation.x : null,
    });
  });
  return rows;
});
console.log(JSON.stringify(out, null, 1).slice(0, 8000));
await browser.close();
