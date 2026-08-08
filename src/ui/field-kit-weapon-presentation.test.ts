import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from '../combat/weapon-catalog';
import type { WeaponId } from '../protocol';
import {
  WEAPON_MENU_PRESENTATIONS,
  weaponMenuPresentationMarkup,
} from './field-kit-weapon-presentation';

const expectedMetricIds = [
  'damage', 'cyclic-dps', 'fire-rate', 'effective-range', 'recoil-load',
  'ads-cone', 'penetration', 'wallbang', 'magazine-reload',
];

describe('HF-182/HF-183 Field Kit weapon presentation', () => {
  it('covers the complete canonical weapon catalog with weapon-specific WebP previews', () => {
    expect(Object.keys(WEAPON_MENU_PRESENTATIONS).sort()).toEqual(WEAPON_CATALOG.map(({ id }) => id).sort());
    for (const weapon of WEAPON_CATALOG) {
      const presentation = WEAPON_MENU_PRESENTATIONS[weapon.id as WeaponId];
      expect(presentation.stillPath).toMatch(/^\.\/assets\/original\/ui\/.+-hero-quarter\.webp$/u);
      const publicPath = presentation.stillPath.replace('./assets/', 'public/assets/');
      expect(existsSync(publicPath), `${weapon.id} still exists`).toBe(true);
      const header = readFileSync(publicPath).subarray(0, 12).toString('ascii');
      expect(header.startsWith('RIFF'), `${weapon.id} still has RIFF header`).toBe(true);
      expect(header.endsWith('WEBP'), `${weapon.id} still has WEBP header`).toBe(true);
    }
  });

  it('projects independently labelled exact catalog metrics without a composite score', () => {
    for (const weapon of WEAPON_CATALOG.filter(({ policies }) => policies.loadout === 'eligible')) {
      const presentation = WEAPON_MENU_PRESENTATIONS[weapon.id as WeaponId];
      expect(presentation.metrics.map(({ id }) => id)).toEqual(expectedMetricIds);
      expect(presentation.metrics.every(({ fillPercent }) => fillPercent >= 0 && fillPercent <= 100)).toBe(true);
      expect(presentation.metrics.find(({ id }) => id === 'fire-rate')?.value).toBe(`${weapon.rpm} RPM`);
      expect(presentation.metrics.find(({ id }) => id === 'effective-range')?.value)
        .toBe(`${weapon.damage.falloffStartM}–${weapon.damage.falloffEndM} m`);
      expect(presentation.metrics.find(({ id }) => id === 'wallbang')?.note).toContain('maximum admitted surfaces');
    }
    expect(WEAPON_MENU_PRESENTATIONS['explosive-crossbow'].metrics.find(({ id }) => id === 'cyclic-dps')?.note)
      .toContain('blast damage excluded');
    expect(WEAPON_MENU_PRESENTATIONS.minigun.metrics.find(({ id }) => id === 'cyclic-dps')?.note)
      .toContain('spin-up');
  });

  it('renders the asset and every metric as one reusable curated/custom card fragment', () => {
    const markup = weaponMenuPresentationMarkup('m4a1');
    expect(markup).toContain('data-weapon-id="m4a1"');
    expect(markup).toContain('<img data-weapon-still');
    expect(markup.match(/data-weapon-metric="/gu)).toHaveLength(4);
    expect(markup).not.toContain('<details');
    expect(markup).toContain('CATALOG BALLISTICS · NO BALANCE SCORE');
    expect(markup).not.toContain('<canvas');
  });
});
