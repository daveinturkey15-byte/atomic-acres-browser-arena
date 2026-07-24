import { expect, test } from '@playwright/test';

test('offers only live Pass 62 and stable Pass 60 before the menu loads', async ({ page }) => {
  await page.goto('/?release=choose');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('.release-channel-option')).toHaveCount(2);
  await expect(page.locator('[data-release-choice="latest"]')).toContainText('PASS 62');
  await expect(page.locator('[data-release-choice="latest"]')).toContainText('EXPERIMENTAL NEW NETCODE');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 60');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('NEW NETCODE');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');

  await page.locator('[data-release-choice="latest"]').click();
  await expect(page).toHaveURL(/release=latest/);
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
});

test('routes the stable choice to byte-exact Pass 60', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/recent-stable\/\?release=latest/);
});

test('keeps legacy latest, normal and room entries on live Pass 62', async ({ page }) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.eyebrow')).toContainText('PASS 62');
  }
});
