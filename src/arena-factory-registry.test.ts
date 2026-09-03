/**
 * MAP3 (HF-409): lazily loaded arena builders.
 *
 * The failure this exists to prevent is the one the repo has already shipped
 * twice in a different shape - work that every player pays for so that one
 * arena can exist. Map 3's builder is ~10k lines of TSL plus a wasm physics
 * runtime; a static import puts it in front of a player who picked Nuke Town.
 *
 * The failure this test guards on the OTHER side is worse: a lazy arena whose
 * builder is read before it has been fetched. Arena construction is synchronous
 * inside a fenced transaction, so `resolved()` must fail loudly rather than
 * return undefined and take the transition down halfway through the commit.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createArenaFactoryRegistry,
  eagerArena,
  lazyArena,
} from './arena-factory-registry';

type Scene = { readonly tag: 'scene' };
type Arena = { readonly id: string };

const scene: Scene = { tag: 'scene' };

describe('arena factory registry', () => {
  it('resolves an eager arena synchronously, with no load at all', () => {
    const build = vi.fn((_target: Scene): Arena => ({ id: 'atomic-acres' }));
    const registry = createArenaFactoryRegistry<Arena, Scene>({ 'atomic-acres': eagerArena(build) });

    expect(registry.isResolved('atomic-acres')).toBe(true);
    expect(registry.resolved('atomic-acres')(scene)).toEqual({ id: 'atomic-acres' });
    expect(registry.telemetry().loaderInvocations).toBe(0);
    expect(registry.telemetry().loadedLazyIds).toEqual([]);
  });

  it('refuses to hand back a lazy builder that has not been fetched', () => {
    const registry = createArenaFactoryRegistry<Arena, Scene>({
      map3: lazyArena(async () => () => ({ id: 'map3' })),
    });

    expect(registry.isResolved('map3')).toBe(false);
    // Loud, and naming the fix. The alternative - undefined - crashes inside the
    // fenced transaction with a TypeError that says nothing about the cause.
    expect(() => registry.resolved('map3')).toThrow(/has not been resolved yet/u);
  });

  it('fetches a lazy arena once, however many callers ask at the same time', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const load = vi.fn(async () => {
      await gate;
      return (_target: Scene): Arena => ({ id: 'map3' });
    });
    const registry = createArenaFactoryRegistry<Arena, Scene>({ map3: lazyArena(load) });

    const all = Promise.all([registry.resolve('map3'), registry.resolve('map3'), registry.resolve('map3')]);
    release!();
    const builders = await all;

    expect(load).toHaveBeenCalledTimes(1);
    expect(new Set(builders).size).toBe(1);
    expect(registry.isResolved('map3')).toBe(true);
    expect(registry.resolved('map3')(scene)).toEqual({ id: 'map3' });
    expect(registry.telemetry().loadedLazyIds).toEqual(['map3']);
    expect(registry.telemetry().loaderInvocations).toBe(1);

    // Once resolved it is free: a later selection of the same arena re-imports nothing.
    await registry.resolve('map3');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed chunk fetch, so a retry can still deploy the arena', async () => {
    let attempt = 0;
    const load = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('chunk fetch failed');
      return (_target: Scene): Arena => ({ id: 'map3' });
    });
    const registry = createArenaFactoryRegistry<Arena, Scene>({ map3: lazyArena(load) });

    await expect(registry.resolve('map3')).rejects.toThrow('chunk fetch failed');
    expect(registry.isResolved('map3')).toBe(false);
    // The whole point: one flaky fetch must not retire the arena for the session.
    await expect(registry.resolve('map3')).resolves.toBeTypeOf('function');
    expect(registry.telemetry().loadFailures).toBe(1);
    expect(registry.telemetry().loaderInvocations).toBe(2);
  });

  it('rejects a module that resolved to something other than a builder', async () => {
    const registry = createArenaFactoryRegistry<Arena, Scene>({
      map3: lazyArena(async () => (undefined as unknown as (target: Scene) => Arena)),
    });
    await expect(registry.resolve('map3')).rejects.toThrow(/non-function builder/u);
    expect(registry.isResolved('map3')).toBe(false);
  });

  it('names the arena when asked for one it has never heard of', () => {
    const registry = createArenaFactoryRegistry<Arena, Scene>({});
    expect(() => registry.resolved('nope')).toThrow(/no entry for arena 'nope'/u);
  });
});
