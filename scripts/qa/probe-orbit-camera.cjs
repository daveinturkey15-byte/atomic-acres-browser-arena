// Minimal orbit probe: boots the killstreak capture route, starts solo,
// sets the capture pose + orbit exactly as the e2e does, and samples the
// deterministicReview camera position to prove whether the orbit advances.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const REPO = 'C:/c/Users/david/projects/atomic-acres-v68-bugfixes';
const PORT = 4199;
const ROUTE = '/?release=latest&map=gun-range&renderer=webgl2&render=blender&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-killstreak-demo';

function freePort(port) {
  try {
    const ps = require('child_process').execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
    ], { encoding: 'utf8', windowsHide: true });
    return String(ps).trim();
  } catch { return ''; }
}

async function main() {
  freePort(PORT);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: REPO, stdio: 'ignore', detached: true, shell: true,
  });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-software-rasterizer', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
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
    const boot = await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      d.startSolo();
      return { phase: d.snapshot().matchPhase, arena: d.snapshot().arenaSelection.id };
    });
    console.log('boot:', JSON.stringify(boot));
    // Wait for active.
    let active = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(1000);
      active = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active');
      if (active) break;
    }
    console.log('active:', active);
    if (!active) return;
    await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      d.setBotsFrozen(true);
      // Match the e2e orbit pattern: station-centred circle with look-at tracking.
      d.setCaptureCameraPose(68, 1.3, 6, 0, -0.38, 75);
      d.setCaptureCameraOrbit({
        centerX: 68, centerY: 1.1, centerZ: 6,
        radius: 6, orbitRate: 1.0, yawRate: 0, baseYaw: 0, pitch: 0.06, fov: 75,
        lookAtX: 68, lookAtY: 1.1, lookAtZ: 6,
      });
      window.__PROBE_START__ = performance.now();
    });
    console.log('orbit set; sampling camera for 3s...');
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(250);
      const s = await page.evaluate(() => {
        const r = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return `t+${((performance.now() - window.__PROBE_START__) / 1000).toFixed(2)}s cam=${r.captureCameraActive} orbit=${r.captureCameraOrbit} pos=${r.captureCameraX},${r.captureCameraY},${r.captureCameraZ} yaw=${r.captureCameraYaw} orbMs=${r.captureOrbitElapsedMs}`;
      });
      console.log(s);
    }
  } finally {
    await browser.close();
    try { process.kill(-server.pid); } catch { }
    freePort(PORT);
  }
}

main().catch((e) => { console.error('PROBE FAIL:', e); process.exit(1); });
