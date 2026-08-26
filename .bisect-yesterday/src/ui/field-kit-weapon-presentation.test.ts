import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WEAPON_CATALOG } from '../combat/weapon-catalog';
import type { WeaponId } from '../protocol';
import {
  WEAPON_MENU_PRESENTATIONS,
  weaponMenuPresentationMarkup,
  weaponMenuStatDeckMarkup,
} from './field-kit-weapon-presentation';

const expectedMetricIds = [
  'damage', 'fire-rate', 'effective-range', 'control', 'piercing',
];

function readableNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0+$/u, '');
}

describe('HF-182/HF-183/HF-249 Field Kit weapon presentation', () => {
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
      expect(presentation.metrics.every(({ fillPercent }) => fillPercent >= 0 && fillPercent <= 100), `${weapon.id} bars stay bounded`).toBe(true);
    }
  });

  it('projects one exact DPS value and the five ordered requested metrics from the canonical catalog', () => {
    const eligible = WEAPON_CATALOG.filter(({ policies }) => policies.loadout === 'eligible');
    for (const weapon of eligible) {
      const presentation = WEAPON_MENU_PRESENTATIONS[weapon.id as WeaponId];
      expect(presentation.dps.value).toBe(readableNumber(weapon.damage.base * weapon.pellets * weapon.rpm / 60));
      expect(presentation.metrics.map(({ id }) => id)).toEqual(expectedMetricIds);
      expect(presentation.metrics.every(({ fillPercent }) => fillPercent >= 0 && fillPercent <= 100)).toBe(true);
      expect(presentation.metrics.find(({ id }) => id === 'fire-rate')?.value).toBe(`${weapon.rpm} RPM`);
      expect(presentation.metrics.find(({ id }) => id === 'effective-range')?.value)
        .toBe(`${weapon.damage.falloffStartM}–${weapon.damage.falloffEndM} m`);
      expect(presentation.metrics.find(({ id }) => id === 'piercing')?.note).toContain('maximum wallbang surfaces');
    }
    const controlValues = eligible.map(({ id }) => Number(
      WEAPON_MENU_PRESENTATIONS[id as WeaponId].metrics.find(({ id: metricId }) => metricId === 'control')?.value,
    ));
    expect(Math.min(...controlValues)).toBe(0);
    expect(Math.max(...controlValues)).toBe(100);
    expect(WEAPON_MENU_PRESENTATIONS['explosive-crossbow'].dps.note).toContain('blast damage excluded');
    expect(WEAPON_MENU_PRESENTATIONS.minigun.dps.note).toContain('spin-up');
  });

  it('renders standalone DPS without a bar and exactly five labelled/value-bearing bars', () => {
    const markup = weaponMenuPresentationMarkup('m4a1');
    expect(markup).toContain('data-weapon-id="m4a1"');
    expect(markup).toContain('<img data-weapon-still');
    expect(markup.match(/data-weapon-dps(?:\s|>)/gu)).toHaveLength(1);
    expect(markup).toContain('data-weapon-dps-value');
    expect(markup).not.toContain('data-weapon-dps-fill');
    expect(markup.match(/data-weapon-metric="/gu)).toHaveLength(5);
    expect([...markup.matchAll(/data-weapon-metric="([^"]+)"/gu)].map((match) => match[1])).toEqual(expectedMetricIds);
    expect(markup).toContain('CATALOG BALLISTICS · COMPARATIVE BARS');
    expect(markup).not.toContain('<canvas');

    const deck = weaponMenuStatDeckMarkup('m4a1');
    expect(deck).toContain('data-weapon-stat-deck');
    expect(deck).not.toContain('data-weapon-still');
    expect(deck.match(/data-weapon-metric="/gu)).toHaveLength(5);
  });
});
