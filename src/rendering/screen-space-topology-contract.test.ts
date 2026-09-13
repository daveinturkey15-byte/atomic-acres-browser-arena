import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GRAPHICS_CONTROLS,
  GRAPHICS_PRESET_VALUES,
  type GraphicsAdvancedKey,
} from '../graphics-settings-registry';
import { normalizePass65Settings, resolveGraphicsRuntime } from '../pass65-settings';
import { screenSpaceTopologyKey } from './screen-space-post-profile';

/**
 * PASS 81 - the metadata contract said one thing and the runtime did another.
 *
 * `graphics-settings-registry.ts` declares an `applyMode` for every control.
 * `pipeline-rebuild` is a promise with teeth: the graph cannot absorb this
 * change live, so the renderer must stage a reconstruction. For the
 * screen-space family that promise is kept by exactly one mechanism - the
 * topology key, compared against the key captured when the graph was built.
 *
 * `rayTracing` has been declared `pipeline-rebuild`
 * (graphics-settings-registry.ts, `runtimeConsumer: 'ray-tracing'`) since
 * HF-398 and was absent from that key. Toggling it in Options therefore staged
 * nothing, `applyTuning` wrote uniforms into a graph that was never built with
 * a trace stage, and the panel reported the change as applied. Nothing in the
 * suite noticed, because the metadata gate only ever read the metadata.
 *
 * This gate closes that loop: it derives the list of topology owners FROM the
 * registry, so a future control declared `pipeline-rebuild` and forgotten in
 * the key fails here on the day it is added rather than on a player's machine.
 */

/**
 * Which `screenSpace` field each declared topology owner resolves into. The two
 * pipeline-rebuild controls that are NOT screen-space owners are named here
 * with the mechanism that stages them instead, so "not in the key" is a stated
 * position rather than an omission.
 */
const NON_SCREEN_SPACE_TOPOLOGY_OWNERS: Readonly<Record<string, string>> = Object.freeze({
  // Principal target multisampling: staged by `antialiasSamples`.
  antiAliasing: 'renderer-init',
  // GTAO MRT attachments: staged by `ambientOcclusionEnabled`/`...Denoise`.
  ambientOcclusion: 'ambient-occlusion',
  // Nuke Town's clustered light buffers belong to the arena-lighting rebuild,
  // not to the screen-space post topology key.
  clusteredLighting: 'arena-lighting',
});

/** A value for each control that is the OPPOSITE of presence, and one that is not. */
const OFF_AND_ON: Readonly<Record<string, readonly [unknown, unknown]>> = Object.freeze({
  // HF-418. Building the baked layer allocates three 3D textures and adds a
  // composite stage; removing it takes them away. Topology, like SSR.
  bakedIndirect: ['off', 'high'],
  screenSpaceReflections: ['off', 'high'],
  screenSpaceGi: ['off', 'high'],
  rayTracing: ['off', 'reflections'],
  volumetricLightShafts: ['off', 'high'],
  depthOfField: [false, true],
  motionBlur: [0, 0.6],
  spatialUpscaling: ['off', 'fsr1-balanced'],
});

function runtimeWith(key: GraphicsAdvancedKey, value: unknown) {
  const settings = normalizePass65Settings({
    graphics: {
      preset: 'custom',
      ...GRAPHICS_PRESET_VALUES.max,
      // Shadows on: the shafts and the trace both report a capability reason
      // rather than a topology when the sun casts none.
      shadows: 'high',
      [key]: value,
    },
  }).graphics;
  return resolveGraphicsRuntime(settings);
}

const pipelineRebuildControls = ADVANCED_GRAPHICS_CONTROLS.filter(({ applyMode }) => applyMode === 'pipeline-rebuild');

describe('screen-space topology key contract', () => {
  it('finds the declared topology owners it is meant to be covering', () => {
    // A canary: if this list ever empties, the loop below stops proving things
    // while still passing.
    expect(pipelineRebuildControls.length).toBeGreaterThanOrEqual(9);
    expect(pipelineRebuildControls.map(({ key }) => key)).toContain('rayTracing');
  });

  it('changes when any declared pipeline-rebuild owner is switched on or off', () => {
    for (const control of pipelineRebuildControls) {
      if (control.key in NON_SCREEN_SPACE_TOPOLOGY_OWNERS) continue;
      const pair = OFF_AND_ON[control.key];
      expect(pair, `${control.key} is declared pipeline-rebuild but this gate has no on/off pair for it`).toBeDefined();
      const [off, on] = pair;
      const offKey = screenSpaceTopologyKey(runtimeWith(control.key, off).screenSpace);
      const onKey = screenSpaceTopologyKey(runtimeWith(control.key, on).screenSpace);
      expect(
        onKey,
        `${control.key} is declared '${control.applyMode}' but toggling it leaves the topology key at ${offKey}, so no rebuild is ever staged`,
      ).not.toBe(offKey);
    }
  });

  it('keeps a tier change inside a built pass OUT of the key', () => {
    // The other half of the contract. If every tier moved the key, a player
    // nudging SSR from low to high would eat a graph rebuild for a uniform.
    const low = screenSpaceTopologyKey(runtimeWith('screenSpaceReflections', 'low').screenSpace);
    const high = screenSpaceTopologyKey(runtimeWith('screenSpaceReflections', 'high').screenSpace);
    expect(low).toBe(high);
    const reflections = screenSpaceTopologyKey(runtimeWith('rayTracing', 'reflections').screenSpace);
    const refractions = screenSpaceTopologyKey(runtimeWith('rayTracing', 'refractions').screenSpace);
    expect(reflections).toBe(refractions);
  });

  it('is the key the renderer actually compares against', () => {
    // IMPLEMENTED IS NOT VERIFIED. `legacy-main.ts` held a private copy of this
    // function, and the private copy is the one the pending-changes check calls
    // (`applyLiveGraphicsSettings` -> `staged.push('screenSpaceTopology')`).
    // A correct key exported from here and never called changes nothing a
    // player can see, so this asserts the production route uses THIS function.
    const legacyMain = readFileSync(
      fileURLToPath(new URL('../legacy-main.ts', import.meta.url)),
      'utf8',
    );
    const definesItsOwn = /(?:function|const)\s+screenSpaceTopologyKey\b/.test(legacyMain);
    // Any import statement from the profile module whose specifier list names
    // the symbol - single or multi-line, with or without a trailing comma.
    const importsTheShared = [...legacyMain.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*'\.\/rendering\/screen-space-post-profile'/g,
    )].some(([, specifiers]) => /\bscreenSpaceTopologyKey\b/.test(specifiers));
    // Asserted as booleans, not against the file text: a regex failure that
    // prints 40,000 lines of legacy-main is not a readable gate.
    expect(
      { definesItsOwn, importsTheShared },
      'legacy-main.ts must import screenSpaceTopologyKey from rendering/screen-space-post-profile instead of defining a private copy - the private copy omits rayTracing, so a live ray-tracing toggle stages no rebuild',
    ).toEqual({ definesItsOwn: false, importsTheShared: true });
  });
});
