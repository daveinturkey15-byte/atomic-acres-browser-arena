import type { HitZone } from './gameplay';

/**
 * Shared authoritative hit volumes for local raycasts and remote admission.
 * Presentation meshes must never define combat hit zones — only these proxies.
 */
export type HitProxyDef = Readonly<{
  zone: HitZone;
  /** Full box size in metres. */
  size: readonly [number, number, number];
  /** Centre offset from operator root (standing eye-height frame). */
  position: readonly [number, number, number];
}>;

/**
 * Tight head volume: 1.5× body damage, not a free “whole upper torso is head”.
 * Body / limbs stay generous enough for fair gunfights.
 */
export const AUTHORITATIVE_HIT_PROXIES: readonly HitProxyDef[] = Object.freeze([
  Object.freeze({ zone: 'body' as const, size: [0.72, 1.02, 0.5] as const, position: [0, 1.38, 0] as const }),
  Object.freeze({ zone: 'head' as const, size: [0.42, 0.38, 0.42] as const, position: [0, 2.2, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.3, 1.08, 0.35] as const, position: [-0.5, 1.35, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.3, 1.08, 0.35] as const, position: [0.5, 1.35, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.32, 0.95, 0.38] as const, position: [-0.18, 0.48, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.32, 0.95, 0.38] as const, position: [0.18, 0.48, 0] as const }),
]);
