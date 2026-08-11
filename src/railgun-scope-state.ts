import { magnifiedFovDegrees } from './weapon-presentation-state';
import type { WeaponId } from './protocol';

export const RAILGUN_SCOPE_PRESENTATION_CONTRACT = 'railgun-authored-clear-scope-v1';
export const RAILGUN_SCOPE_MAGNIFICATION = 2.5;
export const RAILGUN_SCOPE_SETTLED_ADS_PROGRESS = 0.9;
export const RAILGUN_SCOPE_FOV_TOLERANCE_DEGREES = 0.35;

export type RailgunScopePresentationState = Readonly<{
  contract: typeof RAILGUN_SCOPE_PRESENTATION_CONTRACT;
  active: boolean;
  magnification: typeof RAILGUN_SCOPE_MAGNIFICATION;
  baseFov: number;
  targetFov: number;
  cameraFov: number;
  fovSettled: boolean;
  adsSettled: boolean;
  lens: 'clear-open-aperture';
  reticle: 'camera-forward-centred';
  viewmodelSuppressed: boolean;
}>;

export type RailgunScopePresentationInput = Readonly<{
  alive: boolean;
  localHolder: boolean;
  weapon: WeaponId;
  adsHeld: boolean;
  adsProgress: number;
  baseFov: number;
  cameraFov: number;
}>;

const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;

/**
 * One pure scope lifecycle gate shared by runtime telemetry and tests. The
 * camera remains the only aim authority; this state only coordinates the clear
 * HUD aperture, real angular magnification and retained viewmodel suppression.
 */
export function deriveRailgunScopePresentation(
  input: RailgunScopePresentationInput,
): RailgunScopePresentationState {
  const baseFov = finite(input.baseFov, 76);
  const targetFov = magnifiedFovDegrees(baseFov, RAILGUN_SCOPE_MAGNIFICATION);
  const cameraFov = finite(input.cameraFov, baseFov);
  const adsSettled = finite(input.adsProgress, 0) >= RAILGUN_SCOPE_SETTLED_ADS_PROGRESS;
  const fovSettled = Math.abs(cameraFov - targetFov) < RAILGUN_SCOPE_FOV_TOLERANCE_DEGREES;
  const active = input.alive
    && input.localHolder
    && input.weapon === 'railgun'
    && input.adsHeld
    && adsSettled
    && fovSettled;
  return Object.freeze({
    contract: RAILGUN_SCOPE_PRESENTATION_CONTRACT,
    active,
    magnification: RAILGUN_SCOPE_MAGNIFICATION,
    baseFov,
    targetFov,
    cameraFov,
    fovSettled,
    adsSettled,
    lens: 'clear-open-aperture',
    reticle: 'camera-forward-centred',
    viewmodelSuppressed: active,
  });
}
