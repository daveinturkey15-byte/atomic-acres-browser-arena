import type { Group } from 'three';

type ArenaFrame = Readonly<{ id: string; root: Group }>;

/** Keeps the legacy map animation branch out of the application entrypoint. */
export function updateNuketown2Presentation(
  selectedArenaId: string,
  arena: ArenaFrame,
  now: number,
  updateArenaArt: (root: Group, now: number) => void,
): void {
  if (selectedArenaId === 'nuketown2' && arena.id === 'nuketown2') updateArenaArt(arena.root, now);
}
