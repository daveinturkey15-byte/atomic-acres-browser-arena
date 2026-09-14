// Owner 2026-08-30 playtest verification: proves each reported defect is
// actually fixed IN THE BUILT GAME, not just in a unit test. Every check
// reports a measured number or an explicit "could not measure", never a
// bare pass. Silent by contract (--mute-audio via launchSoloMatch).
//
// Usage: node scripts/qa/verify-playtest-fixes.mjs
import { launchSoloMatch } from './lib/launch-match.mjs';

const results = [];
const record = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : 'UNKNOWN'}  ${id}  ${detail}`);
};

async function withMatch(arena, seed, fn) {
  const launched = await launchSoloMatch({ arena, seed, uncapFrameRate: true });
  try {
    return await fn(launched.page);
  } finally {
    await launched.browser.close();
  }
}

// --- 1. Kill-frame hitch -----------------------------------------------------
await withMatch('atomic-acres', 7, async (page) => {
  await page.evaluate(() => {
    window.__deltas = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__deltas.push(now - last);
      last = now;
      if (window.__deltas.length < 1400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { window.__killAt = window.__deltas.length; window.__ATOMIC_ACRES_DEBUG__.damageBot(500); });
  await page.waitForTimeout(2500);
  const hitch = await page.evaluate(() => {
    const around = window.__deltas.slice(Math.max(0, window.__killAt - 5), window.__killAt + 100);
    return { worst: Math.max(...around), over50: around.filter((d) => d > 50).length };
  });
  record('kill-frame-hitch', hitch.worst < 50,
    `worst frame ${hitch.worst.toFixed(1)}ms, frames>50ms: ${hitch.over50} (owner reported a ~500ms freeze)`);
});

// --- 2. Crossbow 1.5x optic --------------------------------------------------
await withMatch('gun-range', 5, async (page) => {
  const fov = await page.evaluate(async () => {
    const d = window.__ATOMIC_ACRES_DEBUG__;
    if (!d.setWeaponForQa && !d.giveWeapon) return null;
    try { (d.setWeaponForQa ?? d.giveWeapon).call(d, 'crossbow'); } catch { return null; }
    await new Promise((r) => setTimeout(r, 400));
    const hip = d.snapshot().camera?.fov ?? null;
    d.setAdsForQa?.(true);
    await new Promise((r) => setTimeout(r, 700));
    const ads = d.snapshot().camera?.fov ?? null;
    d.setAdsForQa?.(false);
    return { hip, ads };
  });
  if (!fov || fov.hip == null || fov.ads == null) {
    record('crossbow-1.5x-optic', null, 'no QA hook for weapon/ADS on this build - verify by hand');
  } else {
    const magnification = fov.hip / fov.ads;
    record('crossbow-1.5x-optic', magnification > 1.3 && magnification < 1.75,
      `hip FOV ${fov.hip} -> ADS FOV ${fov.ads} = ${magnification.toFixed(2)}x (want ~1.5x)`);
  }
});

// --- 3. Chopper gunner autocannon actually damages --------------------------
await withMatch('atomic-acres', 7, async (page) => {
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.earnSupport(15); });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'));
  await page.waitForTimeout(1400);
  await page.keyboard.press('6');
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot('chopper').supportDamageFeedback?.received ?? 0);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(true));
  for (let i = 0; i < 18; i += 1) {
    await page.evaluate(() => {
      const d = window.__ATOMIC_ACRES_DEBUG__;
      const bot = (d.snapshot().bots ?? []).find((b) => b.alive);
      if (bot) d.aimPossessedChopperAtBot(bot.id);
    });
    await page.waitForTimeout(160);
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld(false));
  const after = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot('chopper').supportDamageFeedback?.received ?? 0);
  record('chopper-autocannon-damage', after > before,
    `admitted damage events ${before} -> ${after} over ~3s of aimed fire`);
});

// --- 4. Killstreak support damages a gun-range training dummy ----------------
await withMatch('gun-range', 5, async (page) => {
  const dummyHealth = () => page.evaluate(() => {
    const targets = window.__ATOMIC_ACRES_DEBUG__.snapshot().rangePractice?.targets
      ?? window.__ATOMIC_ACRES_DEBUG__.snapshot().testDummies ?? [];
    return targets.map((t) => t.health ?? t.hp ?? null);
  });
  const before = await dummyHealth();
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.earnSupport(15); });
  const activated = await page.evaluate(() => {
    try { return window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('carpet-bomber'); } catch (error) { return String(error); }
  });
  await page.waitForTimeout(9000);
  const after = await dummyHealth();
  const damaged = before.some((h, i) => h != null && after[i] != null && after[i] < h);
  record('gun-range-support-damage', before.length === 0 ? null : damaged,
    `carpet bomber activation=${JSON.stringify(activated).slice(0, 60)} dummy health ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
});

const failures = results.filter((r) => r.ok === false);
const unknown = results.filter((r) => r.ok === null);
console.log(JSON.stringify({
  verdict: failures.length === 0 ? (unknown.length ? 'PASS-WITH-UNMEASURED' : 'ALL-VERIFIED') : 'FAILURES',
  failures: failures.map((f) => f.id),
  unmeasured: unknown.map((u) => u.id),
}));
process.exitCode = failures.length === 0 ? 0 : 1;
