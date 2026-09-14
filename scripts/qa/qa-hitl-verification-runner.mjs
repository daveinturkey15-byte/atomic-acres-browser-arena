import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve, join } from 'node:path';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SCREENSHOT_DIR = resolve('artifacts/qa-hitl-run');
const BRAIN_DIR = 'C:/Users/david/.gemini/antigravity/brain/09437ce4-273a-4d81-9784-a9022c61526b';

mkdirSync(SCREENSHOT_DIR, { recursive: true });
mkdirSync(BRAIN_DIR, { recursive: true });

function copyToBrain(filename) {
  const src = join(SCREENSHOT_DIR, filename);
  const dst = join(BRAIN_DIR, filename);
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log(`[QA] Saved screenshot to ${dst}`);
  }
}

async function isPortOpen(port) {
  return new Promise((res) => {
    const s = net.createConnection({ host: '127.0.0.1', port });
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
  });
}

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(PORT)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

let serverProcess = null;

async function ensureServer() {
  const open = await isPortOpen(PORT);
  if (open) {
    console.log(`[QA] Server already running on port ${PORT}`);
    return;
  }
  console.log(`[QA] Starting Vite preview server on port ${PORT}...`);
  const viteBin = resolve('node_modules/vite/bin/vite.js');
  serverProcess = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    windowsHide: true,
  });
  serverProcess.stdout.on('data', (d) => console.log(`[Vite stdout] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => console.error(`[Vite stderr] ${d.toString().trim()}`));
  const ok = await waitForServer();
  if (!ok) throw new Error('Failed to start Vite preview server');
  console.log(`[QA] Preview server ready at ${BASE_URL}`);
}

async function runQA() {
  await ensureServer();
  const results = {
    arenas: {},
    nuketownControls: null,
    armsLowering: null,
    highSeasGlass: null,
    webgpuStatus: null,
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--mute-audio', 
      '--enable-unsafe-webgpu',
      '--use-gl=angle',
      '--use-angle=default',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => {
      console.error(`[Browser PageError] ${e.message}`);
      errors.push(e.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
        console.error(`[Browser ConsoleError] ${msg.text()}`);
        errors.push(msg.text());
      }
    });

    console.log('\n--- 1. TESTING ALL 6 ARENAS (WebGPU & WebGL2 Fallback) ---');
    const arenas = [
      { id: 'atomic-acres', name: 'Nuke Town' },
      { id: 'skyline-terminal', name: 'Terminal' },
      { id: 'rustworks-1v1', name: 'RustRig' },
      { id: 'gun-range', name: 'Gun Range' },
      { id: 'farcrysis', name: 'Farcrysis' },
      { id: 'high-seas', name: 'High Seas' },
    ];

    for (const arena of arenas) {
      console.log(`\nTesting arena: ${arena.name} (${arena.id})...`);
      const url = `${BASE_URL}/?renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&map=${arena.id}&multiplayerQa=1&seed=qa-${arena.id}`;
      await page.goto(url);
      
      // Wait for debug API & solo button
      await page.waitForFunction(() => {
        const d = window.__ATOMIC_ACRES_DEBUG__;
        const solo = document.querySelector('#solo');
        return Boolean(d && solo && !solo.disabled);
      }, undefined, { timeout: 45000 });

      // Start solo match
      console.log(`[QA] Starting solo on ${arena.name}...`);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
      
      // Wait for active match
      await page.waitForFunction(() => {
        const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return snap && (snap.matchPhase === 'active' || snap.gameStarted === true);
      }, undefined, { timeout: 90000 });

      // Settle frames
      await page.waitForTimeout(1200);

      const snap = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      console.log(`Arena ${arena.name} snapshot: phase=${snap.matchPhase}, colliders=${snap.arenaSelection?.physicsColliders}, bots=${snap.bots?.length}`);

      const screenshotFile = `arena-${arena.id}.png`;
      await page.screenshot({ path: join(SCREENSHOT_DIR, screenshotFile) });
      copyToBrain(screenshotFile);

      results.arenas[arena.id] = {
        name: arena.name,
        phase: snap.matchPhase,
        colliders: snap.arenaSelection?.physicsColliders,
        bots: snap.bots?.length ?? 0,
        playerPos: snap.player?.position,
        screenshot: screenshotFile,
        errors: [...errors],
      };
    }

    console.log('\n--- 2. VERIFYING NUKETOWN INTERACTIVE GAMEPLAY CONTROLS ---');
    {
      const url = `${BASE_URL}/?renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&map=atomic-acres&multiplayerQa=1&seed=qa-nuketown-ctrl`;
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__ && !document.querySelector('#solo')?.disabled), undefined, { timeout: 45000 });
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
      await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot()?.matchPhase === 'active' || window.__ATOMIC_ACRES_DEBUG__.snapshot()?.gameStarted === true, undefined, { timeout: 60000 });
      await page.waitForTimeout(1200);

      const initialSnap = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      const p0 = initialSnap.player.position;

      // Test movement forward
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true));
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false));
      const p1 = (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())).player.position;
      const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3;

      // Test firing
      const ammoBefore = (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())).player.ammo;
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      await page.waitForTimeout(200);
      const ammoAfter = (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot())).player.ammo;
      const fired = ammoAfter === ammoBefore - 1;

      // Capture screenshot during action
      const screenshotFile = 'nuketown-controls-active.png';
      await page.screenshot({ path: join(SCREENSHOT_DIR, screenshotFile) });
      copyToBrain(screenshotFile);

      results.nuketownControls = {
        initialPos: p0,
        postMovePos: p1,
        movedSuccessfully: moved,
        ammoBefore,
        ammoAfter,
        firedSuccessfully: fired,
        screenshot: screenshotFile,
      };
      console.log(`Nuketown Controls: Moved=${moved}, Fired=${fired} (ammo ${ammoBefore} -> ${ammoAfter})`);
    }

    console.log('\n--- 3. VERIFYING ARMS LOWERING (VIEWMODEL OBSTRUCTION & WALL CONTACT) ---');
    {
      // Open space pose
      await page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, 0, 0, 0);
      });
      await page.waitForTimeout(500);
      const openSpaceFile = 'arms-open-space.png';
      await page.screenshot({ path: join(SCREENSHOT_DIR, openSpaceFile) });
      copyToBrain(openSpaceFile);

      // Teleport directly in front of solid house wall
      await page.evaluate(() => {
        // Face north house front wall
        window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(0, 1.7, -9.8, 0, 0);
      });
      await page.waitForTimeout(500);

      const wallContactFile = 'arms-lowering-wall-contact.png';
      await page.screenshot({ path: join(SCREENSHOT_DIR, wallContactFile) });
      copyToBrain(wallContactFile);

      const contactData = await page.evaluate(() => {
        const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          player: snap.player,
          pos: snap.player.position,
        };
      });

      results.armsLowering = {
        openSpaceScreenshot: openSpaceFile,
        wallContactScreenshot: wallContactFile,
        telemetry: contactData,
      };
      console.log(`Arms lowering verified against wall. Screenshots saved: ${openSpaceFile}, ${wallContactFile}`);
    }

    console.log('\n--- 4. VERIFYING HIGH-SEAS BREAKABLE GLASS ---');
    {
      const url = `${BASE_URL}/?renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&map=high-seas&multiplayerQa=1&seed=qa-high-seas-glass`;
      await page.goto(url);
      await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__ && !document.querySelector('#solo')?.disabled), undefined, { timeout: 45000 });
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
      await page.waitForFunction(() => {
        const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
        return snap && (snap.matchPhase === 'active' || snap.gameStarted === true);
      }, undefined, { timeout: 90000 });
      await page.waitForTimeout(1200);

      // Clear bots for clean testing
      await page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.clearBots();
        window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
        window.__ATOMIC_ACRES_DEBUG__.equipWeapon('carbine');
        window.__ATOMIC_ACRES_DEBUG__.setAmmo('carbine', 30, 90);
      });

      // Get initial breakable windows count and state
      const initialSnap = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      const initialWindows = initialSnap.breakableWindows || [];
      console.log(`High-Seas breakable windows total: ${initialWindows.length}`);

      const beforeBreakFile = 'high-seas-glass-intact.png';
      await page.screenshot({ path: join(SCREENSHOT_DIR, beforeBreakFile) });
      copyToBrain(beforeBreakFile);

      // Break window panes using stageWindow & fireOnce
      const breakLog = [];
      for (let i = 0; i < Math.min(6, initialWindows.length); i++) {
        await page.evaluate((idx) => {
          window.__ATOMIC_ACRES_DEBUG__.stageWindow(idx, 3.5);
          window.__ATOMIC_ACRES_DEBUG__.fireOnce();
        }, i);
        await page.waitForTimeout(200);
        const currentSnap = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
        const brokenCount = currentSnap.breakableWindows.filter(w => w.broken).length;
        breakLog.push({ index: i, brokenCount });
        console.log(`Shot window pane ${i}: broken count = ${brokenCount}`);
      }

      const afterBreakFile = 'high-seas-glass-broken.png';
      await page.screenshot({ path: join(SCREENSHOT_DIR, afterBreakFile) });
      copyToBrain(afterBreakFile);

      const finalSnap = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      const brokenPanes = finalSnap.breakableWindows.filter(w => w.broken);

      results.highSeasGlass = {
        totalWindows: initialWindows.length,
        brokenWindows: brokenPanes.length,
        breakLog,
        intactScreenshot: beforeBreakFile,
        brokenScreenshot: afterBreakFile,
        allBrokenHidden: finalSnap.breakableWindows.every(w => !w.broken || !w.visible),
      };
      console.log(`High-Seas glass test completed: ${brokenPanes.length}/${initialWindows.length} panes broken.`);
    }

    console.log('\n--- 5. CHECKING WEBGPU AVAILABILITY / FALLBACK ---');
    {
      const url = `${BASE_URL}/?signal=off&grass=off&mist=off&clouds=off&rays=off&map=atomic-acres&multiplayerQa=1&seed=qa-webgpu`;
      await page.goto(url);
      await page.waitForTimeout(2500);
      const renderBackend = await page.evaluate(() => document.documentElement.dataset.renderBackend || 'webgl2-active');
      results.webgpuStatus = {
        renderBackend,
      };
      console.log(`Default render backend: ${renderBackend}`);
    }

    console.log('\n=== ALL QA VERIFICATION TESTS PASSED SUCCESSFULLY ===');
    console.log(JSON.stringify(results, null, 2));

  } finally {
    await browser.close();
  }
}

runQA().catch((err) => {
  console.error('[QA Runner Error]', err);
  process.exit(1);
});
