import type { ArenaId } from '../map-selection';

export type MenuPreviewFrame = 'helicopter' | 'cat';

export type MenuPreviewPose = Readonly<{
  frame: MenuPreviewFrame;
  label: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  phase: number;
}>;

type OrbitDefinition = Readonly<{
  frame: MenuPreviewFrame;
  label: string;
  centre: readonly [number, number, number];
  radius: readonly [number, number];
  altitude: number;
  phase: number;
  durationMs: number;
  fov: number;
}>;

const DEFINITIONS = Object.freeze({
  'atomic-acres': Object.freeze({
    frame: 'helicopter', label: 'HELO FLYOVER // NUKE TOWN', centre: [0, 2.4, 0] as const,
    radius: [38, 31] as const, altitude: 18, phase: -0.78, durationMs: 18_000, fov: 58,
  }),
  'skyline-terminal': Object.freeze({
    frame: 'helicopter', label: 'HELO FLYOVER // TERMINAL', centre: [0, 3.8, -5] as const,
    radius: [42, 34] as const, altitude: 17, phase: 0.72, durationMs: 20_000, fov: 57,
  }),
  'rustworks-1v1': Object.freeze({
    frame: 'helicopter', label: 'HELO ORBIT // RUSTRIG', centre: [0, 6.2, 0] as const,
    radius: [34, 30] as const, altitude: 20, phase: -1.9, durationMs: 16_000, fov: 56,
  }),
  'gun-range': Object.freeze({
    frame: 'cat', label: 'CAT-CAM // GUN RANGE', centre: [0, 1.35, -25] as const,
    radius: [0.34, 0.42] as const, altitude: 1.22, phase: 0, durationMs: 7_000, fov: 72,
  }),
  'farcrysis': Object.freeze({
    frame: 'helicopter', label: 'HELO FLYOVER // FARCrySIS', centre: [0, 2.2, 0] as const,
    radius: [36, 34] as const, altitude: 19, phase: 2.1, durationMs: 22_000, fov: 58,
  }),
} satisfies Record<ArenaId, OrbitDefinition>);

export function menuPreviewDefinition(arenaId: ArenaId): OrbitDefinition {
  return DEFINITIONS[arenaId];
}

export function menuPreviewPose(arenaId: ArenaId, elapsedMs: number, reducedMotion = false): MenuPreviewPose {
  const definition = menuPreviewDefinition(arenaId);
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const phase = definition.phase + (reducedMotion ? 0 : elapsed / definition.durationMs * Math.PI * 2);
  if (definition.frame === 'cat') {
    const sway = reducedMotion ? 0 : Math.sin(phase) * definition.radius[0];
    const step = reducedMotion ? 0 : Math.sin(phase * 2) * 0.06;
    return Object.freeze({
      frame: definition.frame,
      label: definition.label,
      position: [sway, definition.altitude + step, 13.5 + Math.cos(phase) * definition.radius[1]] as const,
      target: [sway * 0.35, definition.centre[1] + step * 0.2, definition.centre[2]] as const,
      fov: definition.fov,
      phase,
    });
  }
  return Object.freeze({
    frame: definition.frame,
    label: definition.label,
    position: [
      definition.centre[0] + Math.cos(phase) * definition.radius[0],
      definition.altitude + Math.sin(phase * 2) * 1.1,
      definition.centre[2] + Math.sin(phase) * definition.radius[1],
    ] as const,
    target: definition.centre,
    fov: definition.fov,
    phase,
  });
}
