import type { WeaponId } from '../protocol';
import {
  WEAPON_CATALOG,
  sustainedRecoilBurden,
} from '../combat/weapon-catalog';
import type { WeaponDefinition } from '../combat/weapon-schema';

export type WeaponMenuMetricId =
  | 'damage'
  | 'fire-rate'
  | 'effective-range'
  | 'control'
  | 'piercing';

export type WeaponMenuDps = Readonly<{
  label: 'DPS';
  value: string;
  note: string;
}>;

export type WeaponMenuMetric = Readonly<{
  id: WeaponMenuMetricId;
  label: string;
  value: string;
  note: string;
  fillPercent: number;
}>;

export type WeaponMenuPresentation = Readonly<{
  weaponId: WeaponId;
  displayName: string;
  stillPath: string;
  stillAlt: string;
  dps: WeaponMenuDps;
  metrics: readonly WeaponMenuMetric[];
}>;

const LOADOUT_WEAPONS = WEAPON_CATALOG.filter((weapon) => weapon.policies.loadout === 'eligible');
const MAX_DAMAGE_POTENTIAL = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.damage.base * weapon.pellets));
const MAX_RPM = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.rpm));
const MAX_FALLOFF_END_M = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.damage.falloffEndM));
const MAX_RECOIL_LOAD = Math.max(...LOADOUT_WEAPONS.map((weapon) => sustainedRecoilBurden(weapon)));
const MIN_RECOIL_LOAD = Math.min(...LOADOUT_WEAPONS.map((weapon) => sustainedRecoilBurden(weapon)));
const MAX_PENETRATION_POWER = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.penetration.power));

function clampedPercent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || maximum <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, value / maximum)) * 100);
}

function readableNumber(value: number, digits = 1): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.0+$/u, '');
}

function stillPathFor(weapon: WeaponDefinition): string {
  if (weapon.id === 'explosive-crossbow') {
    return './assets/original/ui/pass65-crossbow-hero-quarter.webp';
  }
  return `./assets/original/ui/pass65-firearms/${weapon.id}-hero-quarter.webp`;
}

function controlPercentFor(weapon: WeaponDefinition): number {
  const span = MAX_RECOIL_LOAD - MIN_RECOIL_LOAD;
  if (span <= Number.EPSILON) return 100;
  return Math.max(0, Math.min(100, Math.round(
    (MAX_RECOIL_LOAD - sustainedRecoilBurden(weapon)) / span * 100,
  )));
}

function presentationFor(weapon: WeaponDefinition): Pick<WeaponMenuPresentation, 'dps' | 'metrics'> {
  const damagePotential = weapon.damage.base * weapon.pellets;
  const cyclicDps = damagePotential * weapon.rpm / 60;
  const recoilLoad = sustainedRecoilBurden(weapon);
  const controlPercent = controlPercentFor(weapon);
  const wallRetention = Math.round(weapon.penetration.minimumWallDamageMultiplier * 100);
  const damageValue = weapon.pellets > 1
    ? `${readableNumber(weapon.damage.base)} × ${weapon.pellets}`
    : readableNumber(weapon.damage.base);
  const dpsQualifier = weapon.fireKind === 'pellet'
    ? 'all pellets connected; reload excluded'
    : weapon.fireKind === 'projectile'
      ? 'direct-hit fire cycle; blast damage excluded'
      : weapon.spinUpMs > 0
        ? `sustained fire after ${weapon.spinUpMs} ms spin-up; reload excluded`
        : 'body damage × RPM ÷ 60; reload excluded';

  return Object.freeze({
    dps: Object.freeze({
      label: 'DPS' as const,
      value: readableNumber(cyclicDps),
      note: dpsQualifier,
    }),
    metrics: Object.freeze([
      Object.freeze({
        id: 'damage' as const,
        label: 'DAMAGE',
        value: damageValue,
        note: weapon.pellets > 1 ? `${weapon.damage.base} per pellet; ${damagePotential} full connect` : 'base body damage before falloff',
        fillPercent: clampedPercent(damagePotential, MAX_DAMAGE_POTENTIAL),
      }),
      Object.freeze({
        id: 'fire-rate' as const,
        label: 'FIRE RATE',
        value: `${weapon.rpm} RPM`,
        note: `${weapon.fireMode} catalog cadence`,
        fillPercent: clampedPercent(weapon.rpm, MAX_RPM),
      }),
      Object.freeze({
        id: 'effective-range' as const,
        label: 'FALLOFF / RANGE',
        value: `${readableNumber(weapon.damage.falloffStartM)}–${readableNumber(weapon.damage.falloffEndM)} m`,
        note: `${readableNumber(weapon.damage.base)} → ${readableNumber(weapon.damage.minimum)} body damage`,
        fillPercent: clampedPercent(weapon.damage.falloffEndM, MAX_FALLOFF_END_M),
      }),
      Object.freeze({
        id: 'control' as const,
        label: 'CONTROL',
        value: `${controlPercent}`,
        note: `relative sustained recoil control; ${readableNumber(recoilLoad * 100, 2)} catalog recoil load (higher control is steadier)`,
        fillPercent: controlPercent,
      }),
      Object.freeze({
        id: 'piercing' as const,
        label: 'PIERCING',
        value: weapon.penetration.maximumSurfaces === 0
          ? 'NONE'
          : `${readableNumber(weapon.penetration.power, 2)} PWR · ${weapon.penetration.maximumSurfaces} WALL${weapon.penetration.maximumSurfaces === 1 ? '' : 'S'}`,
        note: `${weapon.penetration.calibreLabel}; maximum wallbang surfaces and ≥${wallRetention}% retained wall damage`,
        fillPercent: clampedPercent(weapon.penetration.power, MAX_PENETRATION_POWER),
      }),
    ] satisfies readonly WeaponMenuMetric[]),
  });
}

export const WEAPON_MENU_PRESENTATIONS: Readonly<Record<WeaponId, WeaponMenuPresentation>> = Object.freeze(
  Object.fromEntries(WEAPON_CATALOG.map((weapon) => {
    const presentation = presentationFor(weapon);
    return [weapon.id, Object.freeze({
      weaponId: weapon.id as WeaponId,
      displayName: weapon.displayName,
      stillPath: stillPathFor(weapon),
      stillAlt: `${weapon.displayName} weapon preview`,
      ...presentation,
    })];
  })) as Record<WeaponId, WeaponMenuPresentation>,
);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function metricMarkup(metric: WeaponMenuMetric): string {
  const accessibleLabel = `${metric.label} ${metric.value}. ${metric.note}`;
  return `<span class="weapon-menu-metric" data-weapon-metric="${metric.id}" title="${escapeHtml(metric.note)}" aria-label="${escapeHtml(accessibleLabel)}">
    <span><b>${metric.label}</b><strong data-weapon-metric-value>${escapeHtml(metric.value)}</strong></span>
    <i aria-hidden="true"><i data-weapon-metric-fill style="--weapon-metric-fill:${metric.fillPercent}%"></i></i>
  </span>`;
}

export function weaponMenuStatDeckMarkup(weaponId: WeaponId): string {
  const presentation = WEAPON_MENU_PRESENTATIONS[weaponId];
  const dpsLabel = `${presentation.dps.label} ${presentation.dps.value}. ${presentation.dps.note}`;
  return `<span class="weapon-menu-stat-deck" data-weapon-stat-deck data-weapon-id="${weaponId}">
    <span class="weapon-menu-stat-heading"><b data-weapon-stat-name>${escapeHtml(presentation.displayName)}</b><small>CATALOG BALLISTICS · COMPARATIVE BARS</small></span>
    <span class="weapon-menu-dps" data-weapon-dps title="${escapeHtml(presentation.dps.note)}" aria-label="${escapeHtml(dpsLabel)}"><span><b>DPS</b><small>CYCLIC OUTPUT</small></span><strong data-weapon-dps-value>${escapeHtml(presentation.dps.value)}</strong></span>
    <span class="weapon-menu-metrics">${presentation.metrics.map(metricMarkup).join('')}</span>
  </span>`;
}

export function weaponMenuPresentationMarkup(weaponId: WeaponId): string {
  const presentation = WEAPON_MENU_PRESENTATIONS[weaponId];
  return `<span class="weapon-menu-presentation" data-weapon-presentation data-weapon-id="${weaponId}">
    <span class="weapon-menu-still"><img data-weapon-still src="${presentation.stillPath}" alt="${escapeHtml(presentation.stillAlt)}" width="480" height="360" loading="lazy" decoding="async"></span>
    ${weaponMenuStatDeckMarkup(weaponId)}
  </span>`;
}

export function applyWeaponMenuPresentation(root: HTMLElement, weaponId: WeaponId): void {
  const presentation = WEAPON_MENU_PRESENTATIONS[weaponId];
  root.dataset.weaponId = weaponId;
  const image = root.querySelector<HTMLImageElement>('[data-weapon-still]');
  if (image) {
    image.src = presentation.stillPath;
    image.alt = presentation.stillAlt;
  }
  const name = root.querySelector<HTMLElement>('[data-weapon-stat-name]');
  if (name) name.textContent = presentation.displayName;
  const statDeck = root.querySelector<HTMLElement>('[data-weapon-stat-deck]');
  if (statDeck) statDeck.dataset.weaponId = weaponId;
  const dps = root.querySelector<HTMLElement>('[data-weapon-dps]');
  if (dps) {
    dps.title = presentation.dps.note;
    dps.setAttribute('aria-label', `${presentation.dps.label} ${presentation.dps.value}. ${presentation.dps.note}`);
  }
  const dpsValue = root.querySelector<HTMLElement>('[data-weapon-dps-value]');
  if (dpsValue) dpsValue.textContent = presentation.dps.value;
  for (const metric of presentation.metrics) {
    const row = root.querySelector<HTMLElement>(`[data-weapon-metric="${metric.id}"]`);
    if (!row) continue;
    row.title = metric.note;
    row.setAttribute('aria-label', `${metric.label} ${metric.value}. ${metric.note}`);
    const value = row.querySelector<HTMLElement>('[data-weapon-metric-value]');
    if (value) value.textContent = metric.value;
    row.querySelector<HTMLElement>('[data-weapon-metric-fill]')?.style.setProperty('--weapon-metric-fill', `${metric.fillPercent}%`);
  }
}
