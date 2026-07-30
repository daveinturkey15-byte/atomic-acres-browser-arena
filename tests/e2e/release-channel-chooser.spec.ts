import { expect, test } from '@playwright/test';

test('offers only Pass 66 The Big One and stable Pass 63 before the menu loads', async ({ page }) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('.release-channel-option')).toHaveCount(2);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('PASS 66');
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('THE BIG ONE');
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('LIVE');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 63');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('NEW NETCODE');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('STABLE');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');

  await page.locator('[data-release-choice="experimental"]').click();
  await expect(page).toHaveURL(/\/channels\/the-big-one\/.*release=latest/);
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
});

test('routes the stable choice to byte-exact Pass 63', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/recent-stable\/\?release=latest/);
});

test('keeps legacy latest, normal and room entries on live Pass 66 The Big One', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText('PASS 66 · THE BIG ONE');
    await expect(page.locator('.command-brand span')).not.toContainText('HITL CANDIDATE');
  }
});
