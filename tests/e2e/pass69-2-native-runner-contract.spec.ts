import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('Pass 69.2 native gate completes required player launch input before trusted Solo click', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'tests/e2e/pass69-2-native-r4-r9-cell.spec.ts'),
    'utf8',
  );
  const callsign = source.indexOf("await page.locator('#player-name').fill(`PASS69 ${cellId}`)");
  const launch = source.indexOf("await page.locator('#solo').click()");

  expect(callsign).toBeGreaterThanOrEqual(0);
  expect(launch).toBeGreaterThan(callsign);
  expect(source).toContain("if (Array.isArray(staged.pickupPosition))");
  expect(source).toContain("api.equipWeapon(weaponId);");
});
