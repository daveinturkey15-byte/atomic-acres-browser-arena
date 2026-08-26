import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('runtime bootstrap preload contract', () => {
  it('does not block module readiness on unused imported weapon GLBs', () => {
    const legacyMainPath = fileURLToPath(new URL('./legacy-main.ts', import.meta.url));
    const source = readFileSync(legacyMainPath, 'utf8');
    expect(source).not.toMatch(/\bloadImportedWeaponAssets\s*\(/);
    expect(source).not.toContain('weaponError:');
  });
});
