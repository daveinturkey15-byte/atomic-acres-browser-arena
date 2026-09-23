/**
 * READ the identity the runtime reports for a weapon, so a checked-in identity
 * is measured rather than invented.
 *
 * PASS 86, job 3: `tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts`
 * carries an EXACT authored design identity per canonical weapon and compares
 * it against `weaponPresentation.weaponModelId`. `crimson-flamethrower` is a
 * HF-334 livery of `flamethrower` (WEAPON_LIVERY_ALIASES, src/weapon-model.ts)
 * and so appears in no family spec, which left the map one entry short and the
 * spec red in setup. Its identity could not be derived from the flamethrower's
 * - a livery has its own identity over a shared body - and guessing it would
 * put a made-up authored identity into a UNIQUENESS contract. So it is read.
 *
 * Headless installed Chrome, WebGPU, one browser, private port.
 *   PASS73_NATIVE_WEBGPU=1 PROBE_PORT=44217  *     PROBE_OUT=docs/evidence/pass86/gate-repairs/crimson-flamethrower-runtime-identity.json  *     node scripts/qa/probe-weapon-runtime-identity.mjs
 */
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.PROBE_PORT ?? '44217');
const executablePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('installed Chrome required');

const server = await createServer({ server: { port, strictPort: true, host: '127.0.0.1' } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--mute-audio', '--enable-unsafe-webgpu', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
  await page.route('**/v1/streak', (r) => r.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));
  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&render=blender&map=gun-range&grass=off&mist=off&seed=650085`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready' && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === 'webgpu' && state?.render?.profile === 'blender';
  }, undefined, { timeout: 90_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'));
  await page.waitForTimeout(1500);

  const rows = [];
  for (const weapon of ['flamethrower', 'crimson-flamethrower', 'explosive-crossbow']) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon(id), weapon);
    await page.waitForFunction((id) => {
      const p = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return p?.weapon === id && p?.detailsReady === true;
    }, weapon, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    rows.push(await page.evaluate((id) => {
      const p = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.weaponPresentation;
      return {
        asked: id,
        weapon: p?.weapon ?? null,
        modelKind: p?.modelKind ?? null,
        firstPersonSource: p?.firstPersonSource ?? null,
        weaponModelId: p?.weaponModelId ?? null,
        weaponFinishId: p?.weaponFinishId ?? null,
        detailsReady: p?.detailsReady ?? null,
        importedModelSource: p?.importedModel?.source ?? null,
        importedModelWeapon: p?.importedModel?.weapon ?? null,
        socketContractReady: p?.importedModel?.socketContractReady ?? null,
        meshes: p?.importedModel?.meshes ?? null,
        triangles: p?.importedModel?.triangles ?? null,
      };
    }, weapon));
  }
  const out = { schema: 'pass86/crimson-flamethrower-runtime-identity@1', rows };
  await writeFile(process.env.PROBE_OUT ?? 'crimson-identity.json', `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
