/**
 * First-person cockpit HUD for the Chopper Gunner and Piloted Drone. Values
 * mirror the authoritative entity snapshot; the disconnected reticle leaves
 * the exact centre ray unobstructed on desktop and mobile. Hoisted out of
 * legacy-main (HF-509 size ratchet); behaviour is unchanged.
 */
import { CHOPPER_MISSILE_CAPACITY, type KillstreakEntitySnapshot } from './killstreak-runtime';
import { PILOTED_DRONE_TASER_CHARGES } from './killstreak-tuning';

export type ElementQuery = <T extends HTMLElement>(selector: string) => T;

export type GunnerCockpitHudInput = Readonly<{
  entity: KillstreakEntitySnapshot;
  possessionKind: 'chopper-gunner' | 'piloted-drone';
  now: number;
  arenaMinY: number;
  damageDealt: number;
  targetConfirmUntil: number;
}>;

export function syncGunnerCockpitHudElements(element: ElementQuery, input: GunnerCockpitHudInput): void {
  const { entity, possessionKind, now } = input;
  const hud = element<HTMLElement>('#gunner-cockpit-hud');
  hud.hidden = false;
  hud.setAttribute('aria-hidden', 'false');
  hud.dataset.supportKind = possessionKind;
  const controlStrip = element<HTMLElement>('#gunner-control-strip');
  controlStrip.hidden = possessionKind !== 'chopper-gunner';
  controlStrip.setAttribute('aria-hidden', String(possessionKind !== 'chopper-gunner'));
  element<HTMLElement>('#gunner-hull').textContent = String(Math.max(0, Math.round(entity.health)));
  const gunAmmo = entity.magazine === null ? '∞' : String(entity.magazine);
  element<HTMLElement>('#gunner-ammo').textContent = gunAmmo;
  element<HTMLElement>('#gunner-control-gun-ammo').textContent = gunAmmo;
  element<HTMLElement>('#gunner-altitude').textContent = `${Math.max(0, Math.round(entity.position[1] - input.arenaMinY))}M`;
  element<HTMLElement>('#gunner-speed').textContent = String(Math.round(Math.hypot(...entity.velocity)));
  element<HTMLElement>('#gunner-time').textContent = (Math.max(0, entity.expiresInMs) / 1_000).toFixed(1);
  element<HTMLElement>('#gunner-damage').textContent = String(Math.round(input.damageDealt));
  element<HTMLElement>('#gunner-platform').textContent = possessionKind === 'chopper-gunner' ? 'CHOPPER GUNNER' : 'PILOTED DRONE';
  element<HTMLElement>('#gunner-weapon-mode').textContent = possessionKind === 'chopper-gunner' ? '30MM AUTOCANNON' : 'REMOTE CANNON';
  const missileStatus = element<HTMLElement>('#gunner-missile-status');
  const chopperGunner = possessionKind === 'chopper-gunner';
  missileStatus.hidden = !chopperGunner;
  missileStatus.setAttribute('aria-hidden', String(!chopperGunner));
  if (chopperGunner) {
    const ammo = Math.max(0, Math.min(CHOPPER_MISSILE_CAPACITY, entity.missileAmmo ?? 0));
    const cooldownMs = Math.max(0, entity.missileCooldownMs ?? 0);
    element<HTMLElement>('#gunner-missile-ammo').textContent = `×${ammo} / ${CHOPPER_MISSILE_CAPACITY}`;
    element<HTMLElement>('#gunner-missile-cooldown').textContent = ammo <= 0
      ? 'EMPTY'
      : cooldownMs > 0 ? `${(cooldownMs / 1_000).toFixed(1)}S` : 'READY';
    missileStatus.dataset.ready = String(ammo > 0 && cooldownMs <= 0);
  }
  // HF-458: the drone's taser counter, same RMB slot, same lifecycle contract.
  const taserStatus = element<HTMLElement>('#gunner-taser-status');
  const dronePilot = possessionKind === 'piloted-drone';
  taserStatus.hidden = !dronePilot;
  taserStatus.setAttribute('aria-hidden', String(!dronePilot));
  if (dronePilot) {
    const charges = Math.max(0, Math.min(PILOTED_DRONE_TASER_CHARGES, entity.taserCharges ?? 0));
    element<HTMLElement>('#gunner-taser-charges').textContent = `×${charges} / ${PILOTED_DRONE_TASER_CHARGES}`;
    element<HTMLElement>('#gunner-taser-state').textContent = charges > 0 ? 'READY' : 'EMPTY';
    taserStatus.dataset.ready = String(charges > 0);
  }
  if (now >= input.targetConfirmUntil) {
    element<HTMLElement>('#gunner-target-confirm').hidden = true;
    hud.dataset.hitConfirm = 'false';
  }
}

export function hideGunnerCockpitHudElements(element: ElementQuery): void {
  const hud = element<HTMLElement>('#gunner-cockpit-hud');
  hud.hidden = true;
  hud.setAttribute('aria-hidden', 'true');
  hud.dataset.supportKind = 'none';
  hud.dataset.hitConfirm = 'false';
  const controlStrip = element<HTMLElement>('#gunner-control-strip');
  controlStrip.hidden = true;
  controlStrip.setAttribute('aria-hidden', 'true');
  const targetConfirm = element<HTMLElement>('#gunner-target-confirm');
  targetConfirm.hidden = true;
  targetConfirm.style.removeProperty('left');
  targetConfirm.style.removeProperty('top');
  delete targetConfirm.dataset.targetId;
  element<HTMLElement>('#chopper-thermal').hidden = true;
  const missileStatus = element<HTMLElement>('#gunner-missile-status');
  missileStatus.hidden = true;
  missileStatus.setAttribute('aria-hidden', 'true');
  missileStatus.dataset.ready = 'false';
  element<HTMLElement>('#gunner-control-gun-ammo').textContent = '∞';
  element<HTMLElement>('#gunner-missile-ammo').textContent = `×0 / ${CHOPPER_MISSILE_CAPACITY}`;
  element<HTMLElement>('#gunner-missile-cooldown').textContent = 'OFFLINE';
  const taserStatus = element<HTMLElement>('#gunner-taser-status');
  taserStatus.hidden = true;
  taserStatus.setAttribute('aria-hidden', 'true');
  taserStatus.dataset.ready = 'false';
  element<HTMLElement>('#gunner-taser-charges').textContent = `×0 / ${PILOTED_DRONE_TASER_CHARGES}`;
  element<HTMLElement>('#gunner-taser-state').textContent = 'OFFLINE';
}
