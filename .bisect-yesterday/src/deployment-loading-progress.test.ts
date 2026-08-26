import { describe, expect, it } from 'vitest';
import { deploymentLoadingProgress, type DeploymentLoadingStage } from './deployment-loading-progress';

describe('deployment loading progress', () => {
  it('covers asset, texture, physics, shader and final admission stages monotonically', () => {
    const stages: DeploymentLoadingStage[] = [
      'loading-gameplay-assets',
      'binding-world',
      'waiting-for-authored-textures',
      'prewarming-weapon-catalog',
      'prewarming-batched-presentations',
      'compiling-scene',
      'finalizing',
      'verifying-first-presentation',
      'ready',
    ];
    let previousPercent = 0;
    for (const stage of stages) {
      const progress = deploymentLoadingProgress(stage, 5_000, previousPercent);
      expect(progress.percent).toBeGreaterThanOrEqual(previousPercent);
      previousPercent = progress.percent;
    }
    expect(previousPercent).toBe(100);
  });

  it('estimates remaining seconds and makes the in-game completion explicit', () => {
    expect(deploymentLoadingProgress('waiting-for-authored-textures', 9_000)).toMatchObject({
      percent: 45,
      etaSeconds: 11,
      completed: false,
    });
    expect(deploymentLoadingProgress('ready', 20_000, 99)).toEqual({
      percent: 100,
      etaSeconds: 0,
      label: 'In game',
      completed: true,
    });
  });

  it('does not move backwards when concurrent preparation stages finish out of order', () => {
    expect(deploymentLoadingProgress('binding-world', 10_000, 64).percent).toBe(64);
  });
});
