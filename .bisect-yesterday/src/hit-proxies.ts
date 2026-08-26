import type { HitZone, Stance } from './gameplay';

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
 * These centres match the shipped Quaternius operator's 1.7 m standing
 * silhouette. The old 2.2 m head centre sat roughly half a metre above the
 * rendered skull, making valid visual headshots miss and empty air crit.
 */
export const AUTHORITATIVE_HIT_PROXIES: readonly HitProxyDef[] = Object.freeze([
  Object.freeze({ zone: 'body' as const, size: [0.72, 0.84, 0.5] as const, position: [0, 0.98, 0] as const }),
  Object.freeze({ zone: 'head' as const, size: [0.42, 0.36, 0.42] as const, position: [0, 1.58, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.3, 0.76, 0.35] as const, position: [-0.47, 1.08, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.3, 0.76, 0.35] as const, position: [0.47, 1.08, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.32, 0.72, 0.38] as const, position: [-0.18, 0.36, 0] as const }),
  Object.freeze({ zone: 'limb' as const, size: [0.32, 0.72, 0.38] as const, position: [0.18, 0.36, 0] as const }),
]);

export type HitProxyRootTransform = Readonly<{
  position: readonly [number, number, number];
  rotationX: number;
}>;

const STANDING_PIVOT_HEIGHT = 0.84;
const PRONE_PIVOT_HEIGHT = 0.43;
const PRONE_PIVOT_PITCH = -1.42;

/**
 * One stance transform is shared by rendered bot/player proxies and host-side
 * remote-shot admission. Prone rotates around the same pelvis pivot as the
 * visible rig instead of rotating the volumes around their feet.
 */
export function hitProxyRootTransform(stance: Stance): HitProxyRootTransform {
  if (stance === 'crouch') return { position: [0, -0.42, 0], rotationX: 0 };
  if (stance !== 'prone') return { position: [0, 0, 0], rotationX: 0 };
  const offsetY = -STANDING_PIVOT_HEIGHT * Math.cos(PRONE_PIVOT_PITCH);
  const offsetZ = -STANDING_PIVOT_HEIGHT * Math.sin(PRONE_PIVOT_PITCH);
  return {
    position: [0, PRONE_PIVOT_HEIGHT + offsetY, offsetZ],
    rotationX: PRONE_PIVOT_PITCH,
  };
}

export function hitProxyZoneCentre(zone: HitZone, stance: Stance): readonly [number, number, number] {
  const proxy = AUTHORITATIVE_HIT_PROXIES.find((entry) => entry.zone === zone)
    ?? AUTHORITATIVE_HIT_PROXIES[0];
  const transform = hitProxyRootTransform(stance);
  const cos = Math.cos(transform.rotationX);
  const sin = Math.sin(transform.rotationX);
  const [, y, z] = proxy.position;
  return [
    proxy.position[0] + transform.position[0],
    y * cos - z * sin + transform.position[1],
    y * sin + z * cos + transform.position[2],
  ];
}
