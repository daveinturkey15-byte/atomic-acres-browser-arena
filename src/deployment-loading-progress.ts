export type DeploymentLoadingStage =
  | 'loading-module-assets'
  | 'measuring-display'
  | 'module-ready'
  | 'menu-video-ready'
  | 'loading-gameplay-assets'
  | 'prewarming-weapon-catalog'
  | 'prewarming-batched-presentations'
  | 'prewarming-grenade-world-presentations'
  | 'prewarming-killstreak-presentations'
  | 'prewarming-bot-world-weapons'
  | 'prewarming-smoke-presentations'
  | 'prewarming-combat-tracers'
  | 'prewarming-combat-impacts'
  | 'prewarming-explosive-bolts'
  | 'prewarming-grenade-explosion'
  | 'prewarming-support-explosion'
  | 'prewarming-death-drops'
  | 'prewarming-nuke'
  | 'binding-world'
  | 'waiting-for-authored-textures'
  | 'compiling-scene'
  | 'batching-static-meshes'
  | 'prewarming-overdrive'
  | 'finalizing'
  | 'verifying-first-presentation'
  | 'gameplay-assets-ready'
  | 'ready'
  | 'failed';

export type DeploymentLoadingProgress = Readonly<{
  percent: number;
  etaSeconds: number | null;
  label: string;
  completed: boolean;
}>;

const STAGE_PROGRESS: Readonly<Record<DeploymentLoadingStage, Readonly<{ percent: number; label: string }>>> = {
  'loading-module-assets': { percent: 0, label: 'Loading game modules' },
  'measuring-display': { percent: 1, label: 'Measuring display' },
  'module-ready': { percent: 2, label: 'Game modules ready' },
  'menu-video-ready': { percent: 3, label: 'Deployment media ready' },
  'loading-gameplay-assets': { percent: 6, label: 'Downloading GLBs and preparing audio buffers' },
  'binding-world': { percent: 30, label: 'Building physics world' },
  'waiting-for-authored-textures': { percent: 45, label: 'Decoding authored textures' },
  'prewarming-weapon-catalog': { percent: 56, label: 'Preparing weapon models' },
  'prewarming-batched-presentations': { percent: 64, label: 'Compiling effect shaders' },
  'prewarming-combat-tracers': { percent: 64, label: 'Compiling tracer shaders' },
  'prewarming-combat-impacts': { percent: 67, label: 'Compiling impact shaders' },
  'prewarming-grenade-explosion': { percent: 70, label: 'Compiling grenade shaders' },
  'prewarming-support-explosion': { percent: 73, label: 'Compiling support shaders' },
  'prewarming-death-drops': { percent: 76, label: 'Preparing dropped weapons' },
  'prewarming-nuke': { percent: 79, label: 'Compiling nuke shaders' },
  'prewarming-overdrive': { percent: 81, label: 'Compiling overdrive shaders' },
  'prewarming-grenade-world-presentations': { percent: 83, label: 'Preparing grenade models' },
  'prewarming-killstreak-presentations': { percent: 85, label: 'Preparing support models' },
  'prewarming-bot-world-weapons': { percent: 87, label: 'Preparing bot weapons' },
  'prewarming-smoke-presentations': { percent: 89, label: 'Compiling smoke shaders' },
  'prewarming-explosive-bolts': { percent: 91, label: 'Compiling projectile shaders' },
  'compiling-scene': { percent: 93, label: 'Compiling arena shaders' },
  'batching-static-meshes': { percent: 95, label: 'Batching arena geometry' },
  'gameplay-assets-ready': { percent: 97, label: 'Gameplay assets ready' },
  'finalizing': { percent: 98, label: 'Finalizing match state' },
  'verifying-first-presentation': { percent: 99, label: 'Ready — return to this tab to enter' },
  'ready': { percent: 100, label: 'In game' },
  'failed': { percent: 0, label: 'Loading failed' },
};

export function deploymentLoadingProgress(
  stage: DeploymentLoadingStage,
  elapsedMs: number,
  previousPercent = 0,
): DeploymentLoadingProgress {
  const definition = STAGE_PROGRESS[stage];
  const percent = stage === 'failed'
    ? Math.max(0, Math.min(99, previousPercent))
    : Math.max(previousPercent, definition.percent);
  const completed = stage === 'ready';
  const etaSeconds = completed
    ? 0
    : percent > 0 && elapsedMs >= 500
      ? Math.max(1, Math.ceil((Math.max(0, elapsedMs) * (100 - percent)) / percent / 1_000))
      : null;
  return Object.freeze({ percent, etaSeconds, label: definition.label, completed });
}
