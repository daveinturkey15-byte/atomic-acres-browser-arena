import type { WeaponId } from './protocol';

export type WeaponActionEvent =
  | 'mag-release'
  | 'mag-out'
  | 'mag-in'
  | 'mag-seat'
  | 'bolt-release'
  | 'shell-insert';

export type ReloadPose = {
  magazineDrop: number;
  magazineTwist: number;
  magazineForward: number;
  magazineLateral: number;
  handToReload: number;
  shellVisible: boolean;
  shellTravel: number;
  actionPull: number;
};

export type ViewmodelReloadStage = {
  lateral: number;
  lift: number;
  pitch: number;
  roll: number;
};

type Marker = { at: number; event: WeaponActionEvent };

const MAGAZINE_MARKERS: Marker[] = [
  { at: 0.12, event: 'mag-release' },
  { at: 0.28, event: 'mag-out' },
  { at: 0.66, event: 'mag-in' },
  { at: 0.8, event: 'mag-seat' },
  { at: 0.9, event: 'bolt-release' },
];

const SCATTERGUN_MARKERS: Marker[] = [
  { at: 0.2, event: 'shell-insert' },
  { at: 0.39, event: 'shell-insert' },
  { at: 0.58, event: 'shell-insert' },
  { at: 0.77, event: 'shell-insert' },
  { at: 0.91, event: 'bolt-release' },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Distinct camera-space staging for magazine-out and magazine-in beats. */
export function viewmodelReloadStageAt(weapon: WeaponId, rawProgress: number): ViewmodelReloadStage {
  const progress = clamp01(rawProgress);
  const out = smoothstep(0.08, 0.28, progress) * (1 - smoothstep(0.44, 0.58, progress));
  const insert = smoothstep(0.48, 0.68, progress) * (1 - smoothstep(0.84, 0.96, progress));
  const pistolScale = weapon === 'pistol' ? 0.82 : 1;
  return {
    lateral: -0.18 * out * (weapon === 'pistol' ? 1.15 : 1) + 0.03 * insert,
    lift: 0.14 * out + 0.2 * insert,
    pitch: (0.06 * out - 0.1 * insert) * pistolScale,
    roll: (0.34 * out - 0.1 * insert) * pistolScale,
  };
}

export function reloadActionEvents(weapon: WeaponId, previousProgress: number, progress: number): WeaponActionEvent[] {
  const from = clamp01(previousProgress);
  const to = clamp01(progress);
  if (to <= from) return [];
  const markers = weapon === 'scattergun' ? SCATTERGUN_MARKERS : MAGAZINE_MARKERS;
  return markers.filter(({ at }) => at > from && at <= to).map(({ event }) => event);
}

export function reloadPoseAt(weapon: WeaponId, rawProgress: number): ReloadPose {
  const progress = clamp01(rawProgress);
  if (weapon === 'scattergun') {
    const insertionPhase = (progress * 5) % 1;
    const activeInsert = progress >= 0.1 && progress <= 0.82;
    return {
      magazineDrop: 0,
      magazineTwist: 0,
      magazineForward: 0,
      magazineLateral: 0,
      handToReload: smoothstep(0.05, 0.16, progress) * (1 - smoothstep(0.82, 0.94, progress)),
      shellVisible: activeInsert && insertionPhase > 0.12 && insertionPhase < 0.78,
      shellTravel: activeInsert ? smoothstep(0.15, 0.72, insertionPhase) : 0,
      actionPull: smoothstep(0.86, 0.91, progress) * (1 - smoothstep(0.91, 0.98, progress)),
    };
  }

  const removal = smoothstep(0.1, 0.34, progress);
  const insertion = smoothstep(0.56, 0.81, progress);
  const holdOut = removal * (1 - insertion);
  const pistol = weapon === 'pistol';
  return {
    magazineDrop: holdOut * (pistol ? 0.2 : 0.36) + insertion * (1 - smoothstep(0.78, 0.84, progress)) * (pistol ? 0.018 : 0.035),
    magazineTwist: holdOut * (pistol ? 0.12 : 0.24),
    magazineForward: holdOut * (weapon === 'carbine' ? 0.17 : 0.1),
    magazineLateral: holdOut * (weapon === 'carbine' ? -0.075 : pistol ? -0.3 : -0.045),
    handToReload: smoothstep(0.06, 0.2, progress) * (1 - smoothstep(0.82, 0.94, progress)),
    shellVisible: false,
    shellTravel: 0,
    actionPull: smoothstep(0.84, 0.9, progress) * (1 - smoothstep(0.9, 0.98, progress)),
  };
}
