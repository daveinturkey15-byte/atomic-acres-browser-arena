/**
 * Lane AB — SOURCE-PINNED: time of day may never change the LIGHT SET.
 *
 * WHY THIS TEST IS A SOURCE TEST AND NOT A BEHAVIOUR TEST
 * PASS 82's root cause was that three's WebGPU light set is part of every
 * material's cache key: adding, removing or toggling a light at runtime
 * invalidates every pipeline and freezes the game for seconds. That failure is
 * invisible to a unit test — the code is correct, the scene is correct, and the
 * game still freezes on the owner's machine — so the only cheap guard is to pin
 * the SOURCE: the region that implements time of day must contain no light
 * construction, no scene attachment or detachment, and no shadow-casting
 * toggle. A future edit that reaches for `new THREE.DirectionalLight` inside it
 * fails here instead of at 40 fps in a live match.
 *
 * The complement — that the light set is built exactly once, before the
 * coverage fence — is pinned by counting every light construction in
 * `legacy-main.ts` against a named inventory.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEGACY_MAIN = resolve(HERE, '..', 'legacy-main.ts');

const REGION_START = '// LIGHTING: ==== time-of-day conditions (Lane AB, PASS 87) ====';
const REGION_END = '// LIGHTING: ==== end time-of-day conditions ====';

function legacyMainSource(): string {
  return readFileSync(LEGACY_MAIN, 'utf8');
}

function lightingRegion(source: string): string {
  const start = source.indexOf(REGION_START);
  const end = source.indexOf(REGION_END);
  expect(start, 'the LIGHTING region opening marker must exist').toBeGreaterThan(-1);
  expect(end, 'the LIGHTING region closing marker must exist').toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Every light class three exposes that the renderer would key a pipeline on. */
const LIGHT_CLASS_PATTERN =
  /new\s+THREE\.(Ambient|Directional|Hemisphere|Point|Spot|RectArea|LightProbe|Light)\w*\s*\(/g;

describe('the time-of-day region never touches the light set', () => {
  const region = lightingRegion(legacyMainSource());

  it('constructs no light of any class', () => {
    expect(region.match(LIGHT_CLASS_PATTERN)).toBeNull();
  });

  it('attaches nothing to and detaches nothing from the scene', () => {
    expect(region).not.toMatch(/scene\.add\s*\(/);
    expect(region).not.toMatch(/scene\.remove\s*\(/);
    expect(region).not.toMatch(/\.removeFromParent\s*\(/);
  });

  it('never toggles a shadow caster (a shadow-type change re-runs setupShadow)', () => {
    expect(region).not.toMatch(/castShadow\s*=/);
    expect(region).not.toMatch(/configureShadows\s*\(/);
    expect(region).not.toMatch(/setShadowsEnabled\s*\(/);
  });

  it('never hides or disposes a light', () => {
    expect(region).not.toMatch(/(sunLight|fillLight|ambientLight|hemisphereLight)\s*\.\s*visible\s*=/);
    expect(region).not.toMatch(/(sunLight|fillLight|ambientLight|hemisphereLight)\s*\.\s*dispose\s*\(/);
  });

  it('writes only colour, intensity, position, fog colour and exposure', () => {
    // The permitted write surface, stated positively. Anything the region does
    // to a light must appear here, so widening it is a deliberate edit.
    const permitted = [
      /sunLight\.color\.copy\(/,
      /sunLight\.intensity =/,
      /sunLight\.position\.set\(/,
      /sunLight\.shadow\.needsUpdate = true/,
      /ambientLight\.color\.copy\(/,
      /ambientLight\.intensity =/,
      /hemisphereLight\.color\.copy\(/,
      /hemisphereLight\.groundColor\.copy\(/,
      /hemisphereLight\.intensity =/,
      /fillLight\.color\.copy\(/,
      /fillLight\.intensity =/,
      /scene\.fog\.color\.setHex\(/,
      /renderRuntime\.setExposure\(/,
    ];
    for (const pattern of permitted) expect(region).toMatch(pattern);
  });
});

describe('the light set is built once, before the coverage fence', () => {
  const source = legacyMainSource();

  /**
   * The complete inventory. Four arena lights in `buildSky()` plus the
   * viewmodel fill, all constructed at module scope during boot. If this count
   * changes, either a light joined the set (which needs the fence argument
   * re-made) or one left it (which needs the same).
   */
  const EXPECTED_LIGHT_CONSTRUCTIONS = 5;

  it('constructs exactly the inventoried lights and no more', () => {
    const matches = source.match(LIGHT_CLASS_PATTERN) ?? [];
    expect(matches.length).toBe(EXPECTED_LIGHT_CONSTRUCTIONS);
  });

  it('builds all four arena lights inside buildSky()', () => {
    const start = source.indexOf('function buildSky(): void {');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\nlet hemisphereLight:', start);
    expect(end).toBeGreaterThan(start);
    const buildSky = source.slice(start, end);
    expect((buildSky.match(LIGHT_CLASS_PATTERN) ?? []).length).toBe(4);
  });

  it('calls buildSky exactly once, at module scope', () => {
    // Comment lines are stripped first: prose that names the function is not a
    // second call, and this test must fail on code rather than on documentation.
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect((code.match(/^buildSky\(\);$/gm) ?? []).length).toBe(1);
    expect((code.match(/buildSky\(\)/g) ?? []).length).toBe(2); // the declaration site and the one call
  });
});

describe('the frame loop drives time of day by uniform write, not by rebuild', () => {
  const source = legacyMainSource();

  it('calls the uniform-write path from the frame loop, never a light rebuild', () => {
    expect(source).toMatch(/lightingConditionsSkyDarken = weatherNow\.skyDarkenAmount;\n\s*applyLightingConditionUniforms\(\);/);
  });

  it('re-anchors the baseline on both authored-lighting apply paths', () => {
    expect((source.match(/captureLightingConditionBaseline\(\{/g) ?? []).length).toBe(2);
  });

  it('routes every fog restore through the conditioned base colour', () => {
    // A restore that reads the authored hex directly would snap the sky back to
    // the arena's authored hour for the rest of the match.
    expect(source).not.toMatch(/scene\.fog\.color\.set\(activeArenaVisualDefinition\?\.fog\.color/);
  });
});

/**
 * SOURCE-PINNED because the defect it guards was invisible to every behaviour
 * test the lane had. `applyLightingConditionUniforms` used to skip the uniform
 * write whenever the resolved HOUR had not moved. The hour is one of two inputs
 * to `resolveLightingConditions`; `skyDarkenAmount` is the other and does not
 * enter it. So at a fixed hour every weather-driven write was resolved,
 * allocated and discarded without reaching a light -- in `fixed` and in
 * `random`, and `random` is the default. The pure model still composed weather
 * correctly, which is exactly why the model tests all passed.
 */
describe('the uniform-write gate compares the writes, not one of their inputs', () => {
  const source = legacyMainSource();
  const region = lightingRegion(legacyMainSource());

  it('gates the write with lightingConditionWritesEqual', () => {
    expect(region).toMatch(/if \(!force && lightingConditionWritesEqual\(writes, lightingConditionsAppliedWrites\)\) return;/);
  });

  it('keeps no hour-epsilon early return anywhere in the region', () => {
    expect(region).not.toMatch(/LIGHTING_CONDITION_HOUR_EPSILON/);
    expect(region).not.toMatch(/writes\.hour - lightingConditionsApplied/);
    expect(source).not.toMatch(/lightingConditionsAppliedHour/);
  });

  it('stores the applied WRITES so the comparison has something to compare to', () => {
    expect(region).toMatch(/let lightingConditionsAppliedWrites: LightingConditionWrites \| null = null;/);
    expect(region).toMatch(/lightingConditionsAppliedWrites = writes;/);
    // Re-anchoring the baseline must forget the applied writes, or the first
    // write after an arena change is compared against another arena's lights.
    expect(region).toMatch(/lightingConditionsAppliedWrites = null;/);
  });

  it('exposes an UNFORCED live weather override, so the gate is falsifiable in a browser', () => {
    // The QA capture path forces the apply; a forced apply cannot show whether
    // the gate would have let the write through on an ordinary frame.
    expect(source).toMatch(/setWeatherOverride: \(state: string \| null\) => \{/);
    const start = source.indexOf('setWeatherOverride: (state: string | null) => {');
    const hook = source.slice(start, source.indexOf('\n  },', start));
    expect(hook.length).toBeGreaterThan(80);
    expect(hook).not.toMatch(/applyLightingConditionUniforms/);
  });
});

describe('a lighting epoch refreshes atmosphere inputs with the applied write', () => {
  const region = lightingRegion(legacyMainSource());

  it('re-issues the fog colour and live sun intensity after the write gate opens', () => {
    const fogWrite = 'scene.fog.color.setHex(conditionedFogBaseColorHex())';
    const atmosphereWrite = 'pass64TslSystems?.setAtmosphere(scene.fog.color, sunLight?.intensity ?? baseline.sunIntensity);';
    const fogIndex = region.indexOf(fogWrite);
    const atmosphereIndex = region.indexOf(atmosphereWrite);
    expect(fogIndex).toBeGreaterThan(-1);
    expect(atmosphereIndex).toBeGreaterThan(fogIndex);
    expect(region.slice(region.indexOf('lightingConditionsAppliedWrites = writes;'), atmosphereIndex))
      .toContain('lightingConditionsUniformWrites += 1;');
  });
});

/**
 * The brief's multiplayer rule is "friends must share a sky". `?tod=` used to
 * win over the replicated value unconditionally, so a guest could type one
 * query parameter and play a different hour to the host.
 */
describe('a local time-of-day override never wins inside a hosted lobby', () => {
  const region = lightingRegion(legacyMainSource());

  it('routes the choice through the pure precedence rule with the hosted flag', () => {
    expect(region).toMatch(/return activeLightingTimeChoiceFrom\(\{/);
    expect(region).toMatch(/hosted: Boolean\(snapshot\),/);
  });

  it('never returns the local override ahead of the replicated value', () => {
    expect(region).not.toMatch(/if \(lightingTimeChoiceOverride\) return lightingTimeChoiceOverride;/);
  });

  it('ignores a pinned capture hour inside a hosted lobby too', () => {
    expect(region).toMatch(/lightingCaptureFixedHour === null \|\| privateLobbySnapshot \? \{\}/);
  });

  it('ignores a named ?sky= catalogue preset inside a hosted lobby too, and lets ?todhour= win (PASS 95)', () => {
    expect(region).toMatch(/lightingCaptureFixedHour !== null \|\| privateLobbySnapshot \|\| !isSkyTimePresetId\(lightingQuerySkyPreset\)/);
  });
});
