import { describe, expect, it } from 'vitest';
import { PriorityPreparationCoordinator } from './priority-preparation-coordinator';

describe('priority preparation coordinator', () => {
  it('escalates Deploy into the same generation and releases an idle checkpoint', async () => {
    let releaseIdle = () => {};
    const coordinator = new PriorityPreparationCoordinator(() => new Promise<void>((resolve) => { releaseIdle = resolve; }));
    const phases: string[] = [];
    const background = coordinator.prepare('idle', async ({ checkpoint }) => {
      phases.push('shared');
      await checkpoint();
      phases.push('catalog');
    });
    await Promise.resolve();
    expect(phases).toEqual(['shared']);

    const deployment = coordinator.prepare('deployment', async () => {
      throw new Error('a second worker must never start');
    });
    expect(deployment).toBe(background);
    await deployment;
    releaseIdle();
    expect(phases).toEqual(['shared', 'catalog']);
    expect(coordinator.snapshot()).toMatchObject({ generation: 1, status: 'ready', escalationCount: 1 });
  });

  it('starts a new generation only after a failed generation', async () => {
    const coordinator = new PriorityPreparationCoordinator(async () => {});
    await expect(coordinator.prepare('idle', async () => { throw new Error('decode failed'); })).rejects.toThrow('decode failed');
    expect(coordinator.snapshot()).toMatchObject({ generation: 1, status: 'failed', error: 'decode failed' });
    await coordinator.prepare('deployment', async () => {});
    expect(coordinator.snapshot()).toMatchObject({ generation: 2, status: 'ready', priority: 'deployment' });
  });
});
