import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  if (!existsSync('artifacts')) {
    mkdirSync('artifacts', { recursive: true });
  }

  console.log('[capture] Launching headless Chrome with WebGPU...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--mute-audio',
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  page.on('console', (msg) => console.log(`[browser console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', (err) => console.error('[browser error]:', err));

  console.log('[capture] Opening http://localhost:41931/map3.html ...');
  await page.goto('http://localhost:41931/map3.html', { waitUntil: 'domcontentloaded' });

  // Wait for scene to initialize and frames to start rendering
  await page.waitForTimeout(4000);

  const hudText = await page.evaluate(() => {
    const hud = document.getElementById('hud');
    return hud ? hud.textContent : null;
  });
  console.log('[capture] Initial HUD:', hudText);

  // Corridor 0: Nature (0)
  // Corridor 1: Maths (pi/4)
  // Corridor 2: Grammar (pi/2)
  // Corridor 3: Water (3pi/4 = 135 deg = 2.356 rad)
  // Corridor 4: Weather (4pi/4 = pi = 180 deg = 3.142 rad)
  // Corridor 5: Volume (5pi/4 = 225 deg = 3.927 rad)
  // Corridor 6: Physics (6pi/4 = 270 deg = 4.712 rad)
  // Corridor 7: Colosseum (7pi/4 = 315 deg = 5.498 rad)

  const views = [
    {
      name: 'hub-overview',
      angle: 0,
      dist: 4,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-1-nature',
      angle: 0,
      dist: 20,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-1-nature-vehicle',
      angle: 0,
      dist: 8,
      y: 1.6,
      pitch: -0.08,
    },
    {
      name: 'corridor-2-maths',
      angle: Math.PI / 4,
      dist: 20,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-3-grammar',
      angle: Math.PI / 2,
      dist: 20,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-4-water-mouth',
      angle: (3 * Math.PI) / 4,
      dist: 16,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-4-water-shore',
      angle: (3 * Math.PI) / 4,
      dist: 28,
      y: 1.7,
      pitch: -0.08,
    },
    {
      name: 'corridor-5-weather-spring',
      angle: Math.PI,
      dist: 16,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-5-weather-storm-downpour',
      angle: Math.PI,
      dist: 36,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-5-weather-winter-blizzard',
      angle: Math.PI,
      dist: 50,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-6-volume-godrays-mouth',
      angle: (5 * Math.PI) / 4,
      dist: 16,
      y: 1.7,
      pitch: -0.05,
    },
    {
      name: 'corridor-6-volume-godrays-inside',
      angle: (5 * Math.PI) / 4,
      dist: 28,
      y: 1.7,
      pitch: 0.10,
    },
    {
      name: 'corridor-7-physics-jenga-balls',
      angle: (6 * Math.PI) / 4,
      dist: 20,
      y: 1.7,
      pitch: -0.08,
    },
    {
      name: 'corridor-7-physics-machinery',
      angle: (6 * Math.PI) / 4,
      dist: 42,
      y: 1.7,
      pitch: -0.08,
    },
    {
      name: 'corridor-8-colosseum-overlook',
      angle: (7 * Math.PI) / 4,
      dist: 84.5,
      y: 1.7,
      pitch: -0.15,
    },
  ];

  for (const v of views) {
    const angle = v.angle;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const wx = -v.dist * sinA;
    const wz = -v.dist * cosA;
    const yaw = v.reverseLook ? (angle + Math.PI) : angle;

    console.log(`[capture] Setting pose for ${v.name}: pos=(${wx.toFixed(1)}, ${v.y}, ${wz.toFixed(1)}), yaw=${yaw.toFixed(2)}`);
    await page.waitForFunction(() => typeof window.__MAP3 !== 'undefined', { timeout: 10000 });
    await page.evaluate(({ x, y, z, ry, rx }) => {
      window.__MAP3.setPose(x, y, z, ry, rx);
    }, { x: wx, y: v.y, z: wz, ry: yaw, rx: v.pitch });

    await page.waitForTimeout(1500);

    const shotPath = resolve(`artifacts/${v.name}.png`);
    await page.screenshot({ path: shotPath });
    console.log(`[capture] Saved ${shotPath}`);
  }

  await browser.close();
  console.log('[capture] Done.');
}

main().catch((err) => {
  console.error('[capture] Error:', err);
  process.exit(1);
});
