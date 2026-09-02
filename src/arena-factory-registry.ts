/**
 * MAP3: lazily loaded arena builders (HF-409).
 *
 * WHY.
 *
 * `arenaFactories` in legacy-main.ts is a static import map, so every arena's
 * builder is in the module graph the game downloads and parses at boot - for
 * every player, on every arena. That was fine while a builder was a few hundred
 * lines of boxes. It stops being fine for Map 3: the corridor showcase is ~10k
 * lines of TSL plus `@dimforge/rapier3d-compat`, and putting it in front of a
 * player who picked Nuke Town is directly against the live owner priority
 * ("faster map loads"). It is the third of the three reasons the showcase was
 * kept out of the arena.
 *
 * WHAT THIS IS.
 *
 * A registry where each arena is either EAGER - imported statically, resolved
 * with no await, byte-for-byte the behaviour every arena has today - or LAZY,
 * behind a `() => import(...)` the arena transition awaits during its existing
 * asynchronous preparation phase, before construction. Only Map 3 is lazy. No
 * other arena's timing, chunking or behaviour changes, which is the point: this
 * is an opt-in per arena, not a new indirection every arena pays for.
 *
 * A LAZY BUILDER MUST BE RESOLVED BEFORE CONSTRUCTION, and `resolved()` throws
 * rather than returning undefined if it is not. Arena construction is
 * synchronous and sits inside a fenced transaction between a WebGPU fence and
 * the authority commit; making it async in place would have opened an await
 * point inside that fence. So the await happens EARLIER, in the transition's
 * own preparation phase, and the fenced part stays synchronous.
 *
 * A FAILED LOAD IS NOT CACHED. A chunk fetch can fail transiently (flaky
 * network, an evicted CDN edge). Caching the rejected promise would make one
 * bad fetch permanently unselect the arena for the rest of the session, so the
 * failure is surfaced to the caller and the next attempt starts clean.
 */

/** Builds an arena into the scene it is given. Same shape the static map had. */
export type ArenaBuilder<TArena, TScene> = (target: TScene) => TArena;

export type ArenaFactoryEntry<TArena, TScene> =
  | { readonly kind: 'eager'; readonly build: ArenaBuilder<TArena, TScene> }
  | { readonly kind: 'lazy'; readonly load: () => Promise<ArenaBuilder<TArena, TScene>> };

/** An arena whose builder ships in the main graph. Every arena but Map 3. */
export function eagerArena<TArena, TScene>(
  build: ArenaBuilder<TArena, TScene>,
): ArenaFactoryEntry<TArena, TScene> {
  return { kind: 'eager', build };
}

/** An arena whose builder is fetched on demand. */
export function lazyArena<TArena, TScene>(
  load: () => Promise<ArenaBuilder<TArena, TScene>>,
): ArenaFactoryEntry<TArena, TScene> {
  return { kind: 'lazy', load };
}

export type ArenaFactoryRegistryTelemetry = {
  /** Arena ids whose lazy chunk has been fetched this session. */
  readonly loadedLazyIds: readonly string[];
  /** How many times a lazy loader was actually invoked. Two loads of one arena is a bug. */
  readonly loaderInvocations: number;
  /** Lazy loads that rejected. Non-zero with a resolved arena means a retry worked. */
  readonly loadFailures: number;
};

export type ArenaFactoryRegistry<TArena, TScene, TId extends string = string> = {
  /** True when `resolved(id)` will not throw: eager always, lazy once fetched. */
  isResolved(id: TId): boolean;
  /** Fetch the builder if needed. Concurrent calls for one arena share one import. */
  resolve(id: TId): Promise<ArenaBuilder<TArena, TScene>>;
  /** The builder, synchronously. Throws for a lazy arena that was never resolved. */
  resolved(id: TId): ArenaBuilder<TArena, TScene>;
  telemetry(): ArenaFactoryRegistryTelemetry;
};

export function createArenaFactoryRegistry<TArena, TScene, TId extends string = string>(
  entries: Readonly<Record<TId, ArenaFactoryEntry<TArena, TScene>>>,
): ArenaFactoryRegistry<TArena, TScene, TId> {
  const loaded = new Map<TId, ArenaBuilder<TArena, TScene>>();
  const inFlight = new Map<TId, Promise<ArenaBuilder<TArena, TScene>>>();
  let loaderInvocations = 0;
  let loadFailures = 0;

  const entry = (id: TId): ArenaFactoryEntry<TArena, TScene> => {
    const found = entries[id];
    if (!found) throw new Error(`arena factory registry: no entry for arena '${id}'`);
    return found;
  };

  return {
    isResolved(id) {
      return entry(id).kind === 'eager' || loaded.has(id);
    },

    resolve(id) {
      const found = entry(id);
      if (found.kind === 'eager') return Promise.resolve(found.build);
      const already = loaded.get(id);
      if (already) return Promise.resolve(already);
      const pending = inFlight.get(id);
      if (pending) return pending;
      loaderInvocations += 1;
      const promise = found.load().then(
        (build) => {
          if (typeof build !== 'function') {
            throw new Error(`arena factory registry: '${id}' resolved to a non-function builder`);
          }
          loaded.set(id, build);
          inFlight.delete(id);
          return build;
        },
        (error: unknown) => {
          // Never cache the rejection: one flaky chunk fetch must not retire the
          // arena for the rest of the session.
          loadFailures += 1;
          inFlight.delete(id);
          throw error;
        },
      );
      inFlight.set(id, promise);
      return promise;
    },

    resolved(id) {
      const found = entry(id);
      if (found.kind === 'eager') return found.build;
      const build = loaded.get(id);
      if (!build) {
        throw new Error(
          `arena factory registry: '${id}' is a lazily loaded arena and its builder has not been `
          + 'resolved yet. Await resolve() in the arena transition before construction.',
        );
      }
      return build;
    },

    telemetry() {
      return {
        loadedLazyIds: [...loaded.keys()],
        loaderInvocations,
        loadFailures,
      };
    },
  };
}
