// Care-package targeting probe: replicates the e2e care-package flow
// (teleport to station, overview pose, orbit with gaze-down, F tap) and
// samples camera state + crosshairTarget every 250ms to find why the
// crosshair ray produces no floor point for ~2s.
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const REPO = 'C:/c/Users/david/projects/atomic-acres-v68-bugfixes';
const PORT = 4199;
const ROUTE = '/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-killstreak-demo';

function freePort(port) {
  try {
    return String(require('child_process').execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { encoding: 'utf8', windowsHide: true })).trim();
  } catch { return ''; }
}

async function main() {
  freePort(PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: REPO, stdio: 'ignore', detached: true, shell: true,
  });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--disable-software-rasterizer', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    await page.goto(`http://localhost:${PORT}${ROUTE}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      ready = await page.evaluate(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.snapshot));
      if (ready) break;
    }
    console.log('debugReady:', ready);
    if (!ready) return;
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    let active = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      active = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active');
      if (active) break;
    }
    console.log('active:', active);
    if (!active) return;
    // Care-package station: index 2 -> (92, 0.08, 0.2). Same as e2e.
    await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      d.setBotsFrozen(true);
      d.setCaptureViewmodelHidden(false);
      d.teleportPlayer(92, 1.7, 0.2, Math.PI / 2, -0.38);
    });
    await page.waitForTimeout(300);
    const eligibility = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport;
      return {
        eligible: s.fInteraction.inputEligible,
        candidates: s.fInteraction.candidates.map((c) => `${c.kind}:${c.targetId}:${c.enabled}`),
      };
    });
    console.log('eligibility:', JSON.stringify(eligibility));
    // Same overview pose call the e2e uses (applyCameraPose resolves internally,
    // so use the direct debug pose equivalent then the orbit).
    await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      d.setCaptureCameraPose(92, 1.1, 0.2, 0, -0.38, 75);
      d.setCaptureCameraOrbit({
        centerX: 92, centerY: 1.1, centerZ: 0.2,
        radius: 6, orbitRate: 1.0, yawRate: 0, baseYaw: 0, pitch: 0.06, fov: 75,
        lookAtX: 92, lookAtY: 0.35, lookAtZ: 0.2,
      });
      window.__PROBE_START__ = performance.now();
    });
    console.log('pose+orbit set; F tap...');
    await page.keyboard.down('f');
    await page.waitForTimeout(45);
    await page.keyboard.up('f');
    await page.waitForTimeout(300);
    const commit = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.fInteraction.lastCommit?.candidate?.targetId ?? null);
    console.log('lastCommit:', commit);
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250);
      const s = await page.evaluate(() => {
        const d = window.__ATOMIC_ACRES_DEBUG__;
        const snap = d.snapshot();
        const r = snap.deterministicReview;
        const fs = snap.fieldSupport;
        return {
          t: ((performance.now() - window.__PROBE_START__) / 1000).toFixed(2),
          cam: r.captureCameraActive,
          orbit: r.captureCameraOrbit,
          pos: [r.captureCameraX, r.captureCameraY, r.captureCameraZ].map((v) => Number(v).toFixed(1)),
          yaw: Number(r.captureCameraYaw).toFixed(2),
          pitch: Number(r.captureCameraPitch ?? r.captureCameraYaw).toFixed(2),
          targeting: fs.targetingMode,
          crosshair: fs.crosshairTarget ? fs.crosshairTarget.map((v) => Number(v).toFixed(2)) : null,
        };
      });
      console.log(JSON.stringify(s));
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch { }
    freePort(PORT);
  }
}

main().catch((e) => { console.error('PROBE FAIL:', e); process.exit(1); });
