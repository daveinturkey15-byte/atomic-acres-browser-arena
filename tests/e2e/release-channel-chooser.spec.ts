import { expect, test } from '@playwright/test';

test('chooses the latest build before the normal menu loads', async ({ page }) => {
  await page.goto('/?release=choose');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('RECENT STABLE');
  await expect(page.locator('[data-release-choice="stable"]')).toContainText('PASS 57');
  await expect(page.locator('[data-release-choice="latest"]')).toContainText('LATEST APPROVED');
  await expect(page.locator('[data-release-choice="latest"]')).not.toContainText('PASS 57');

  await page.locator('[data-release-choice="latest"]').click();

  await expect(page).toHaveURL(/release=latest/);
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  await expect(page.locator('#menu')).toBeVisible();
});

test('routes the stable choice to the pinned channel path', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.locator('[data-release-choice="stable"]').click();
  await expect(page).toHaveURL(/\/channels\/recent-stable\//);
});
