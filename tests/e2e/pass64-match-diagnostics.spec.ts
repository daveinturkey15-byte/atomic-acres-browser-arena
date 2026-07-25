import { expect, test } from '@playwright/test';

const endpoint = 'http://127.0.0.1:8791/v1/match-diagnostics';

test('completed-match diagnostics stay off the active match path and beacon one private envelope', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: Array<{ contentType: string; body: string }> = [];
  await page.route(endpoint, async (route) => {
    const request = route.request();
    requests.push({ contentType: request.headers()['content-type'] ?? '', body: request.postData() ?? '' });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ accepted: true, idempotent: false, receiptId: 'md_browser_receipt' }),
    });
  });

  await page.goto('/?release=latest&renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=6408&map=atomic-acres');
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === 'active');
  await page.waitForTimeout(750);
  expect(requests).toHaveLength(0);
  const activeTelemetry = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().matchDiagnosticsUpload);
  expect(activeTelemetry).toMatchObject({ activeMatch: true, attempted: 0, requestsDuringActiveMatch: 0 });

  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    api.damage(20);
  });
  await page.waitForFunction(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().player.hp > 80, undefined, { timeout: 10_000 });
  await page.evaluate(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    api.endMatch();
  });
  await expect.poll(() => requests.length, { timeout: 10_000 }).toBe(1);
  expect(requests[0].contentType.toLowerCase()).toContain('text/plain');
  const envelope = JSON.parse(requests[0].body);
  expect(envelope).toMatchObject({ schemaVersion: 1, pass: 'PASS 64', arena: 'atomic-acres', mode: 'solo', role: 'offline' });
  expect(envelope.final.participantCount).toBeGreaterThan(0);
  expect(envelope.events.some((event: { category: string }) => event.category === 'damage')).toBe(true);
  expect(envelope.events.some((event: { category: string }) => event.category === 'regen')).toBe(true);
  const serialized = JSON.stringify(envelope);
  for (const forbidden of ['QA Operator', 'roomCode', 'peerId', 'installId', 'userAgent', 'stack', 'chat']) {
    expect(serialized).not.toContain(forbidden);
  }
  const completedTelemetry = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().matchDiagnosticsUpload);
  expect(completedTelemetry).toMatchObject({ activeMatch: false, pending: 0, delivered: 1, requestsDuringActiveMatch: 0, lastDelivery: 'fetch' });
});
