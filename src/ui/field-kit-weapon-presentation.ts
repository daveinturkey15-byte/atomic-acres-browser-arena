import type { WeaponId } from '../protocol';
import {
  WEAPON_CATALOG,
  sustainedRecoilBurden,
} from '../combat/weapon-catalog';
import type { WeaponDefinition } from '../combat/weapon-schema';

export type WeaponMenuMetricId =
  | 'damage'
  | 'cyclic-dps'
  | 'fire-rate'
  | 'effective-range'
  | 'recoil-load'
  | 'ads-cone'
  | 'penetration'
  | 'wallbang'
  | 'magazine-reload';

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
  metrics: readonly WeaponMenuMetric[];
}>;

const LOADOUT_WEAPONS = WEAPON_CATALOG.filter((weapon) => weapon.policies.loadout === 'eligible');
const MAX_DAMAGE_POTENTIAL = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.damage.base * weapon.pellets));
const MAX_CYCLIC_DPS = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.damage.base * weapon.pellets * weapon.rpm / 60));
const MAX_RPM = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.rpm));
const MAX_FALLOFF_END_M = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.damage.falloffEndM));
const MAX_RECOIL_LOAD = Math.max(...LOADOUT_WEAPONS.map((weapon) => sustainedRecoilBurden(weapon)));
const MAX_ADS_CONE_MRAD = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.spread.hipRadians * weapon.spread.adsMultiplier * 1_000));
const MAX_PENETRATION_POWER = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.penetration.power));
const MAX_WALL_SURFACES = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.penetration.maximumSurfaces));
const MAX_MAGAZINE = Math.max(...LOADOUT_WEAPONS.map((weapon) => weapon.ammo.magazine));

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

function metricsFor(weapon: WeaponDefinition): readonly WeaponMenuMetric[] {
  const damagePotential = weapon.damage.base * weapon.pellets;
  const cyclicDps = damagePotential * weapon.rpm / 60;
  const recoilLoad = sustainedRecoilBurden(weapon);
  const adsConeMrad = weapon.spread.hipRadians * weapon.spread.adsMultiplier * 1_000;
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

  return Object.freeze([
    Object.freeze({
      id: 'damage' as const,
      label: 'DAMAGE',
      value: damageValue,
      note: weapon.pellets > 1 ? `${weapon.damage.base} per pellet; ${damagePotential} full connect` : 'base body damage before falloff',
      fillPercent: clampedPercent(damagePotential, MAX_DAMAGE_POTENTIAL),
    }),
    Object.freeze({
      id: 'cyclic-dps' as const,
      label: 'CYCLIC DPS',
      value: readableNumber(cyclicDps),
      note: dpsQualifier,
      fillPercent: clampedPercent(cyclicDps, MAX_CYCLIC_DPS),
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
      label: 'FALLOFF',
      value: `${readableNumber(weapon.damage.falloffStartM)}–${readableNumber(weapon.damage.falloffEndM)} m`,
      note: `${readableNumber(weapon.damage.base)} → ${readableNumber(weapon.damage.minimum)} body damage`,
      fillPercent: clampedPercent(weapon.damage.falloffEndM, MAX_FALLOFF_END_M),
    }),
    Object.freeze({
      id: 'recoil-load' as const,
      label: 'RECOIL LOAD',
      value: readableNumber(recoilLoad * 100, 2),
      note: 'angular impulse per second ÷ authored recovery; lower is steadier',
      fillPercent: clampedPercent(recoilLoad, MAX_RECOIL_LOAD),
    }),
    Object.freeze({
      id: 'ads-cone' as const,
      label: 'ADS CONE',
      value: `${readableNumber(adsConeMrad, 2)} mrad`,
      note: 'initial aimed spread; lower is tighter',
      fillPercent: clampedPercent(adsConeMrad, MAX_ADS_CONE_MRAD),
    }),
    Object.freeze({
      id: 'penetration' as const,
      label: 'PENETRATION',
      value: readableNumber(weapon.penetration.power, 2),
      note: `${weapon.penetration.calibreLabel} authored material power`,
      fillPercent: clampedPercent(weapon.penetration.power, MAX_PENETRATION_POWER),
    }),
    Object.freeze({
      id: 'wallbang' as const,
      label: 'WALLBANG',
      value: weapon.penetration.maximumSurfaces === 0
        ? 'NONE'
        : `${weapon.penetration.maximumSurfaces} surf · ≥${wallRetention}%`,
      note: 'maximum admitted surfaces and minimum retained wall damage',
      fillPercent: clampedPercent(weapon.penetration.maximumSurfaces, MAX_WALL_SURFACES),
    }),
    Object.freeze({
      id: 'magazine-reload' as const,
      label: 'MAG / RELOAD',
      value: `${weapon.ammo.magazine} · ${readableNumber(weapon.ammo.reloadSeconds, 2)} s`,
      note: `${weapon.ammo.reserve} reserve; ${readableNumber(weapon.ammo.emptyReloadSeconds, 2)} s empty reload`,
      fillPercent: clampedPercent(weapon.ammo.magazine, MAX_MAGAZINE),
    }),
  ] satisfies readonly WeaponMenuMetric[]);
}

export const WEAPON_MENU_PRESENTATIONS: Readonly<Record<WeaponId, WeaponMenuPresentation>> = Object.freeze(
  Object.fromEntries(WEAPON_CATALOG.map((weapon) => [weapon.id, Object.freeze({
    weaponId: weapon.id as WeaponId,
    displayName: weapon.displayName,
    stillPath: stillPathFor(weapon),
    stillAlt: `${weapon.displayName} project-original asset-backed weapon render`,
    metrics: metricsFor(weapon),
  })])) as Record<WeaponId, WeaponMenuPresentation>,
);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function metricMarkup(metric: WeaponMenuMetric): string {
  return `<span class="weapon-menu-metric" data-weapon-metric="${metric.id}" title="${escapeHtml(metric.note)}">
    <span><b>${metric.label}</b><strong data-weapon-metric-value>${escapeHtml(metric.value)}</strong></span>
    <i aria-hidden="true"><i data-weapon-metric-fill style="--weapon-metric-fill:${metric.fillPercent}%"></i></i>
  </span>`;
}

export function weaponMenuPresentationMarkup(weaponId: WeaponId): string {
  const presentation = WEAPON_MENU_PRESENTATIONS[weaponId];
  return `<span class="weapon-menu-presentation" data-weapon-presentation data-weapon-id="${weaponId}">
    <span class="weapon-menu-still"><img data-weapon-still src="${presentation.stillPath}" alt="${escapeHtml(presentation.stillAlt)}" width="480" height="360" loading="lazy" decoding="async"></span>
    <span class="weapon-menu-stat-deck">
      <span class="weapon-menu-stat-heading"><b data-weapon-stat-name>${escapeHtml(presentation.displayName)}</b><small>CATALOG BALLISTICS · NO BALANCE SCORE</small></span>
      <span class="weapon-menu-metrics">${presentation.metrics.map(metricMarkup).join('')}</span>
    </span>
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
  for (const metric of presentation.metrics) {
    const row = root.querySelector<HTMLElement>(`[data-weapon-metric="${metric.id}"]`);
    if (!row) continue;
    row.title = metric.note;
    const value = row.querySelector<HTMLElement>('[data-weapon-metric-value]');
    if (value) value.textContent = metric.value;
    row.querySelector<HTMLElement>('[data-weapon-metric-fill]')?.style.setProperty('--weapon-metric-fill', `${metric.fillPercent}%`);
  }
}
