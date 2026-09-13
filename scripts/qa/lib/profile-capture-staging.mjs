// These callbacks run in the browser and deliberately use only the existing
// capture hooks. They never heal, respawn or alter a graphics setting.
export function freezeActiveProfileCapture() {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const state = debug.snapshot();
  if (state.matchPhase !== 'active' || state.gameStarted !== true) return false;
  debug.setBotsFrozen(true);
  debug.setCaptureViewmodelHidden(true);
  return true;
}

export function readHealthyProfileCapture() {
  const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const health = { hp: state.player?.hp, alive: state.player?.alive,
    deaths: state.player?.deaths, matchPhase: state.matchPhase };
  if (health.hp !== 100 || health.alive !== true || health.deaths !== 0
      || health.matchPhase !== 'active' || state.gameStarted !== true) {
    throw new Error(`profile capture contaminated by combat or inactive match: ${JSON.stringify(health)}`);
  }
  return health;
}

export async function prepareProfileCapture(page, settleMs, timeoutMs) {
  // Freeze in the same browser callback that observes admission, before the
  // shader/lighting settle. Freezing before startSolo is ineffective because
  // match initialization resets the flag.
  await page.waitForFunction(freezeActiveProfileCapture, undefined, { timeout: timeoutMs });
  const beforeSettle = await page.evaluate(readHealthyProfileCapture);
  await page.waitForTimeout(settleMs);
  const afterSettle = await page.evaluate(readHealthyProfileCapture);
  return { beforeSettle, afterSettle };
}
