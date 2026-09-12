/**
 * particles/light-shaft-registry.ts — Pass 79: the shafts finally reach the dust.
 *
 * THE DEFECT THIS CLOSES. `farcrysis-atmosphere.ts` builds seven god-ray cones
 * and publishes their geometry through `farcrysisLightShafts()`; its own header
 * says, in as many words, that it exists so "the particle runtime can BRIGHTEN
 * where the light actually is". `ParticleRuntime.setLightShafts()` is written,
 * bounded and unit-tested to consume exactly that.
 *
 * Nothing ever connected the two. A repo-wide grep finds `farcrysisLightShafts`
 * imported by ONE file: its own test. Live telemetry confirms it —
 * `sampleWeather().particles.lightShafts` reads 0 on every arena. So "motes in
 * a shaft of light", authored on both sides and green on both sides, has never
 * been on a player's screen. That is failure mode #1 in the gauntlet spec, for
 * the fourth time in this project.
 *
 * WHY A LATCH RATHER THAN A CALL. The obvious fix is one line in the arena
 * orchestrator: `particles.setLightShafts(farcrysisLightShafts())`. The arena
 * orchestrator does not own the particle runtime — legacy-main constructs it at
 * module scope and hands it a camera and a wind sample once a frame — so that
 * line would have to go in legacy-main, which this lane may not touch.
 *
 * This is the same latch idiom `weather/weather-settings.ts` and
 * `particles/ambient-life-settings.ts` already use, and it is a better fit here
 * anyway: an arena art module knows where its own light is and knows nothing
 * about who wants it, which is exactly what publish/subscribe is for.
 *
 * THIS FILE IS PURE. No THREE, no timers, no Math.random. The shaft type lives
 * here rather than in index.ts so an art module can publish without importing
 * the renderer-side particle system at all.
 */

/**
 * A cone of light motes brighten inside. Plain numbers so the arena art
 * modules that author shafts need no dependency on the particle runtime.
 */
export type ParticleLightShaft = Readonly<{
  x: number; y: number; z: number;
  /** Unit axis along the shaft. Normalised defensively on registration. */
  axisX: number; axisY: number; axisZ: number;
  radiusM: number;
}>;

export type PublishedLightShafts = Readonly<{
  /** The arena these shafts belong to. Shafts never cross arenas. */
  arenaId: string | null;
  /**
   * Bumped on every publish. The runtime compares this integer once per frame
   * and does nothing else unless it changed, so subscribing costs one compare
   * and never an allocation.
   */
  revision: number;
  shafts: readonly ParticleLightShaft[];
}>;

const NONE: PublishedLightShafts = Object.freeze({
  arenaId: null,
  revision: 0,
  shafts: Object.freeze([] as readonly ParticleLightShaft[]),
});

let published: PublishedLightShafts = NONE;

/**
 * The one write. An arena art module calls this once, at build time, with the
 * shafts it just authored. Publishing an empty list is a legitimate way to say
 * "this arena has no shafts", and is what a teardown should do.
 */
export function publishLightShafts(arenaId: string, shafts: readonly ParticleLightShaft[]): PublishedLightShafts {
  published = Object.freeze({
    arenaId,
    revision: published.revision + 1,
    shafts: Object.freeze([...shafts]),
  });
  return published;
}

/** What the particle runtime reads. Never null, never allocates. */
export function activeLightShafts(): PublishedLightShafts {
  return published;
}

/** Test-only reset, so one suite's shafts cannot leak into the next. */
export function resetLightShafts(): void {
  published = NONE;
}
