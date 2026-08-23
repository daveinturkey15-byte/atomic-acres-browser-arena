import { describe, expect, it } from 'vitest';
import { float, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { Node } from 'three/webgpu';
import {
  applyAscCdl,
  applyChannelCrosstalk,
  applyDisplayToe,
  applyGradeProfileToUniforms,
  applyHighlightTransfer,
  applyMidtoneContrast,
  applySplitTone,
  buildFilmicGradeChain,
  collectTunableBloomNodes,
  createFilmicGradeUniforms,
  DEFAULT_AUTHORED_GRAIN_8BIT,
  evaluateDisplayReferenceStages,
  evaluateLinearReferenceStages,
  FILMIC_GRADE_CHAIN_STAGES,
  GRAIN_MAXIMUM_8BIT_STEPS,
  gradeProfileIdForGraphicsPreset,
  grainAmplitudeFor,
  grainSeedFor,
  installFilmicGradeChain,
  isTunableBloomNode,
  LINEAR_SOURCE_STAGES,
  rcasSharpnessFor,
  REC709_LUMA,
  srgbTintDirection,
  tuneBloomForProfile,
  type GradedRenderPipeline,
  type Rgb,
  type TunableBloomNode,
} from './filmic-grade-chain';
import {
  assertGradeChainOrder,
  GRADE_CHAIN_STAGES,
  GRADE_PROFILES,
  resolveGradeProfile,
  type FrozenFilmicGradeProfile,
  type GradeProfileId,
} from './grade-profile';

const PROFILE_IDS: readonly GradeProfileId[] = ['performance', 'quality', 'max'];
const ALL_PROFILES = PROFILE_IDS.map((id) => GRADE_PROFILES[id]);

function luma(rgb: Rgb): number {
  return rgb[0] * REC709_LUMA[0] + rgb[1] * REC709_LUMA[1] + rgb[2] * REC709_LUMA[2];
}

function makePipeline(): GradedRenderPipeline {
  return { outputNode: vec4(0, 0, 1, 1) as unknown as Node<'vec4'>, outputColorTransform: true, needsUpdate: false };
}

function makeBloomNode(strength = 0.14): TunableBloomNode {
  return {
    threshold: { value: 0.92 },
    radius: { value: 0.32 },
    strength: { value: strength },
    // The duck-type marker `collectTunableBloomNodes` keys on.
    _textureNodeBlur0: {},
  } as unknown as TunableBloomNode;
}

describe('HF-362 filmic grade chain order', () => {
  it('builds exactly the frozen GRADE_CHAIN_STAGES order', () => {
    const uniforms = createFilmicGradeUniforms();
    const build = buildFilmicGradeChain(vec4(0.2, 0.3, 0.4, 1) as unknown as Node<'vec4'>, uniforms);
    expect(build.stages).toEqual([...GRADE_CHAIN_STAGES]);
    expect([...LINEAR_SOURCE_STAGES, ...FILMIC_GRADE_CHAIN_STAGES]).toEqual([...GRADE_CHAIN_STAGES]);
  });

  it('puts every linear-HDR operation before the tone map and every display operation after it', () => {
    const stages = [...GRADE_CHAIN_STAGES];
    const toneMap = stages.indexOf('tone-map-aces-plus-srgb-output');
    expect(toneMap).toBeGreaterThan(-1);
    for (const linearStage of [
      'scene-pass-linear-hdr',
      'contact-occlusion-multiply',
      'depth-guarded-bloom-add',
      'asc-cdl-slope-offset-power',
      'subtle-channel-crosstalk',
      'highlight-transfer-shoulder',
    ]) {
      expect(stages.indexOf(linearStage)).toBeLessThan(toneMap);
    }
    for (const displayStage of [
      'display-toe-lift',
      'display-midtone-contrast',
      'display-split-tone',
      'display-vignette-falloff',
      'per-frame-luminance-grain',
    ]) {
      expect(stages.indexOf(displayStage)).toBeGreaterThan(toneMap);
    }
    // Tone mapping is the LAST HDR operation and grain is the last operation.
    expect(stages.indexOf('asc-cdl-slope-offset-power')).toBeLessThan(stages.indexOf('subtle-channel-crosstalk'));
    expect(stages.indexOf('subtle-channel-crosstalk')).toBeLessThan(stages.indexOf('highlight-transfer-shoulder'));
    expect(stages.indexOf('highlight-transfer-shoulder')).toBe(toneMap - 1);
    expect(stages[stages.length - 1]).toBe('per-frame-luminance-grain');
  });

  it('fails closed when the upstream stages do not match the contract', () => {
    const uniforms = createFilmicGradeUniforms();
    const build = (upstream: readonly string[]) => () => buildFilmicGradeChain(
      vec4(0, 0, 0, 1) as unknown as Node<'vec4'>,
      uniforms,
      upstream,
    );
    // HF-364 widened the linear region to admit the enumerated optional
    // screen-space stages, so the assertion is now a slot check rather than an
    // index-for-index prefix match. Everything the old contract rejected is
    // still rejected, and the new cases below are rejections the old exact
    // prefix match could not even express.
    expect(build(['scene-pass-linear-hdr', 'depth-guarded-bloom-add', 'contact-occlusion-multiply']))
      .toThrow(/linear stage violation/);
    expect(build(['scene-pass-linear-hdr'])).toThrow(/missing mandatory linear stage/);
    expect(build(['contact-occlusion-multiply', 'depth-guarded-bloom-add']))
      .toThrow(/missing mandatory linear stage 'scene-pass-linear-hdr'/);
    // An optional stage outside its declared slot.
    expect(build([
      'scene-pass-linear-hdr', 'contact-occlusion-multiply', 'depth-guarded-bloom-add',
      'ssgi-screen-space-bounce-add',
    ])).toThrow(/linear stage violation/);
    // A repeated stage, which an index-for-index prefix match never checked.
    expect(build([
      'scene-pass-linear-hdr', 'contact-occlusion-multiply', 'contact-occlusion-multiply',
      'depth-guarded-bloom-add',
    ])).toThrow(/linear stage violation/);
    // An invented stage name.
    expect(build([
      'scene-pass-linear-hdr', 'ray-traced-global-illumination',
      'contact-occlusion-multiply', 'depth-guarded-bloom-add',
    ])).toThrow(/linear stage violation/);
    // Every optional stage in its declared slot is accepted, and the receipt
    // keeps them.
    const full = buildFilmicGradeChain(vec4(0, 0, 0, 1) as unknown as Node<'vec4'>, uniforms, [
      'scene-pass-linear-hdr',
      'motion-blur-velocity-smear',
      'ssgi-screen-space-bounce-add',
      'contact-occlusion-multiply',
      'ssr-screen-space-reflection-add',
      'depth-guarded-bloom-add',
      'godrays-volumetric-shaft-add',
      'depth-of-field-bokeh',
    ]);
    expect(full.stages.slice(0, 8)).toEqual([
      'scene-pass-linear-hdr',
      'motion-blur-velocity-smear',
      'ssgi-screen-space-bounce-add',
      'contact-occlusion-multiply',
      'ssr-screen-space-reflection-add',
      'depth-guarded-bloom-add',
      'godrays-volumetric-shaft-add',
      'depth-of-field-bokeh',
    ]);
    expect(full.stages).toContain('tone-map-aces-plus-srgb-output');
    expect(full.stages.at(-1)).toBe('per-frame-luminance-grain');
  });

  it('applies the output transform exactly once, after the linear stages and before the display stages', () => {
    const uniforms = createFilmicGradeUniforms();
    const build = buildFilmicGradeChain(vec4(0.5, 0.5, 0.5, 1) as unknown as Node<'vec4'>, uniforms);

    const collect = (root: unknown): unknown[] => {
      const seen: unknown[] = [];
      (root as { traverse(callback: (node: unknown) => void): void }).traverse((node) => {
        if (!seen.includes(node)) seen.push(node);
      });
      return seen;
    };
    const isRenderOutput = (node: unknown): boolean =>
      (node as { isRenderOutputNode?: boolean } | null)?.isRenderOutputNode === true;

    const wholeGraph = collect(build.outputNode);
    const renderOutputNodes = wholeGraph.filter(isRenderOutput);
    // Exactly one output transform: a second one would tone map twice and
    // re-encode sRGB over already-encoded pixels.
    expect(renderOutputNodes).toHaveLength(1);

    const beforeToneMap = collect(renderOutputNodes[0]);
    // Linear-side uniforms are consumed strictly upstream of the tone map.
    expect(beforeToneMap).toContain(uniforms.cdlSlope);
    expect(beforeToneMap).toContain(uniforms.cdlOffset);
    expect(beforeToneMap).toContain(uniforms.cdlPower);
    expect(beforeToneMap).toContain(uniforms.channelCrosstalk);
    expect(beforeToneMap).toContain(uniforms.shoulderStart);
    // Display-side uniforms are NOT reachable from the tone map, i.e. they run
    // after it. This is the structural proof of the ordering contract.
    for (const displayUniform of [
      uniforms.toeStrength,
      uniforms.toeFloor,
      uniforms.midtoneContrast,
      uniforms.splitToneStrength,
      uniforms.vignetteStrength,
      uniforms.grainAmplitude,
      uniforms.grainSeed,
    ]) {
      expect(beforeToneMap).not.toContain(displayUniform);
      expect(wholeGraph).toContain(displayUniform);
    }
  });
});

describe('HF-362 grade profile values in play', () => {
  it('keeps the frozen catalog values the pipeline was tuned against', () => {
    expect(GRADE_PROFILES.performance).toMatchObject({
      id: 'performance',
      cdl: { slope: [1.0, 1.0, 1.02], offset: [0, 0, 0], power: [1, 1, 1] },
      channelCrosstalkStrength: 0.04,
      transfer: { shoulderStart: 0.95, shoulderEnd: 6.0, shoulderPower: 1.06, shoulderDesaturation: 0.05 },
      bloom: { threshold: 1.15, radiusTexelScale: 0.24, intensityScale: 0.85 },
      grain: { amplitudeScale: 0.8, animationHz: 24, pixelJitterSeed: 9_117 },
    });
    expect(GRADE_PROFILES.quality).toMatchObject({
      id: 'quality',
      cdl: { slope: [1.015, 1.0, 0.98], offset: [-0.0005, 0, 0.003], power: [0.995, 1.0, 1.01] },
      channelCrosstalkStrength: 0.06,
      transfer: { shoulderStart: 0.9, shoulderEnd: 6.0, shoulderPower: 1.08, shoulderDesaturation: 0.07 },
      bloom: { threshold: 1.1, radiusTexelScale: 0.32, intensityScale: 1.0 },
    });
    expect(GRADE_PROFILES.quality.display).toMatchObject({
      toeCeiling: 0.3, toeFloor: 0.035, toeStrength: 0.14,
      midtonePivot: 0.42, midtoneWidth: 0.16, midtoneContrast: 0.2,
      shadowTint: 0x274356, highlightTint: 0xffd5a2,
      splitToneStrength: 0.45, shadowBalance: 0.48, highlightBalance: 0.56,
    });
    expect(GRADE_PROFILES.max).toMatchObject({
      id: 'max',
      cdl: { slope: [1.02, 1.0, 0.975], offset: [-0.001, 0.0005, 0.004], power: [0.99, 1.0, 1.015] },
      channelCrosstalkStrength: 0.09,
      bloom: { threshold: 1.08, radiusTexelScale: 0.4, intensityScale: 1.15 },
    });
    expect(GRADE_PROFILES.max.display.midtoneContrast).toBe(0.24);
    expect(GRADE_PROFILES.max.display.splitToneStrength).toBe(0.55);
    expect(Object.isFrozen(GRADE_PROFILES)).toBe(true);
    for (const profile of ALL_PROFILES) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.cdl)).toBe(true);
      expect(Object.isFrozen(profile.display)).toBe(true);
      expect(Object.isFrozen(profile.bloom)).toBe(true);
    }
  });

  it('pushes the whole frozen profile into the live uniforms', () => {
    const uniforms = createFilmicGradeUniforms();
    const profile = resolveGradeProfile('max');
    applyGradeProfileToUniforms(uniforms, profile);
    expect(uniforms.cdlSlope.value.toArray()).toEqual([1.02, 1.0, 0.975]);
    expect(uniforms.cdlOffset.value.toArray()).toEqual([-0.001, 0.0005, 0.004]);
    expect(uniforms.cdlPower.value.toArray()).toEqual([0.99, 1.0, 1.015]);
    expect(uniforms.channelCrosstalk.value).toBe(0.09);
    expect(uniforms.shoulderStart.value).toBe(0.85);
    expect(uniforms.shoulderEnd.value).toBe(6);
    expect(uniforms.toeFloor.value).toBe(0.035);
    expect(uniforms.toeStrength.value).toBe(0.18);
    expect(uniforms.midtoneContrast.value).toBe(0.24);
    expect(uniforms.splitToneStrength.value).toBe(0.55);
    expect(uniforms.grainAmplitude.value).toBe(grainAmplitudeFor(profile, DEFAULT_AUTHORED_GRAIN_8BIT));
    // The shadow tint is a mean-normalised hue direction, not a colour.
    const shadow = uniforms.shadowTintDirection.value;
    expect((shadow.x + shadow.y + shadow.z) / 3).toBeCloseTo(1, 12);
    expect(shadow.z).toBeGreaterThan(shadow.x);
    const highlight = uniforms.highlightTintDirection.value;
    expect(highlight.x).toBeGreaterThan(highlight.z);
  });

  it('maps graphics presets onto profiles and fails safe on unknown ids', () => {
    expect(gradeProfileIdForGraphicsPreset('performance')).toBe('performance');
    expect(gradeProfileIdForGraphicsPreset('high')).toBe('quality');
    expect(gradeProfileIdForGraphicsPreset('max')).toBe('max');
    expect(gradeProfileIdForGraphicsPreset('custom')).toBe('quality');
    expect(gradeProfileIdForGraphicsPreset('nonsense')).toBe('quality');
    expect(() => resolveGradeProfile('nope' as GradeProfileId)).toThrow(/unknown filmic grade profile/);
  });
});

describe('HF-362 combat safety envelope', () => {
  const shadowSamples = Array.from({ length: 61 }, (_, index) => index * 0.005); // 0 .. 0.30 display

  it('never lets the display toe darken a pixel', () => {
    for (const profile of ALL_PROFILES) {
      for (const value of shadowSamples) {
        const input: Rgb = [value, value, value];
        const toed = applyDisplayToe(input, profile);
        expect(toed[0]).toBeGreaterThanOrEqual(value);
        expect(toed[1]).toBeGreaterThanOrEqual(value);
        expect(toed[2]).toBeGreaterThanOrEqual(value);
      }
      // Bounded: it lifts, it does not fog. Documented ceiling is ~5% display.
      const black = applyDisplayToe([0, 0, 0], profile);
      expect(black[0]).toBeLessThanOrEqual(0.05);
      expect(black[0]).toBeGreaterThan(0);
      // Above the toe ceiling the operation is inert.
      const midtone = applyDisplayToe([0.6, 0.6, 0.6], profile);
      expect(midtone[0]).toBeCloseTo(0.6, 12);
    }
  });

  it('keeps the midtone curve strictly monotonic with bounded local slope', () => {
    for (const profile of ALL_PROFILES) {
      const k = profile.display.midtoneContrast;
      expect(k).toBeLessThanOrEqual(0.3);
      const step = 0.0005;
      let previous = -Infinity;
      // Below one 8-bit step the negative-output guard engages; that is a
      // clamp at literal black, and the toe always lifts past it first.
      for (let value = 1 / 255; value <= 1; value += step) {
        const here = luma(applyMidtoneContrast([value, value, value], profile));
        const next = luma(applyMidtoneContrast([value + step, value + step, value + step], profile));
        expect(here).toBeGreaterThan(previous);
        previous = here;
        const slope = (next - here) / step;
        // Analytic bound: slope in [1 - 0.4463k, 1 + k]. Detail is never
        // crushed - at worst it is compressed ~11%.
        expect(slope).toBeGreaterThan(1 - 0.4463 * k - 1e-6);
        expect(slope).toBeLessThan(1 + k + 1e-6);
      }
      // The guard only ever engages below one 8-bit step of display black.
      expect(luma(applyMidtoneContrast([1 / 255, 1 / 255, 1 / 255], profile))).toBeGreaterThan(0);
    }
  });

  it('keeps the shipped toe-then-contrast composition monotonic across the whole range', () => {
    for (const profile of ALL_PROFILES) {
      const shape = (value: number): number =>
        luma(applyMidtoneContrast(applyDisplayToe([value, value, value], profile), profile));
      const step = 0.0005;
      let previous = -Infinity;
      for (let value = 0; value <= 1; value += step) {
        const here = shape(value);
        expect(here).toBeGreaterThan(previous);
        previous = here;
        // The toe's own falloff can only shave the slope a further ~3%.
        expect((shape(value + step) - here) / step).toBeGreaterThan(0.85);
      }
    }
  });

  it('keeps shadow luminance within 15% of the incoming value through toe and contrast', () => {
    for (const profile of ALL_PROFILES) {
      for (const value of shadowSamples) {
        const shaped = applyMidtoneContrast(applyDisplayToe([value, value, value], profile), profile);
        const shapedLuma = luma(shaped);
        expect(shapedLuma).toBeGreaterThanOrEqual(value * 0.85);
        // Deep shade never gets crushed to black.
        if (value === 0) expect(shapedLuma).toBeGreaterThan(0);
      }
    }
  });

  it('makes split toning exactly luminance preserving', () => {
    const probes: Rgb[] = [
      [0.02, 0.03, 0.05], [0.12, 0.1, 0.09], [0.3, 0.32, 0.28],
      [0.6, 0.55, 0.5], [0.9, 0.93, 0.97], [1, 1, 1],
    ];
    for (const profile of ALL_PROFILES) {
      for (const probe of probes) {
        const toned = applySplitTone(probe, profile);
        expect(luma(toned)).toBeCloseTo(luma(probe), 10);
        // It really does tint: shadows go cooler than they came in.
        if (luma(probe) < 0.2 && profile.display.splitToneStrength > 0) {
          expect(toned[2] / Math.max(toned[0], 1e-6)).toBeGreaterThan(probe[2] / Math.max(probe[0], 1e-6));
        }
      }
    }
  });

  it('keeps channel crosstalk energy preserving', () => {
    for (const profile of ALL_PROFILES) {
      const probe: Rgb = [0.4, 0.2, 0.7];
      const crossed = applyChannelCrosstalk(probe, profile);
      expect(crossed[0] + crossed[1] + crossed[2]).toBeCloseTo(probe[0] + probe[1] + probe[2], 12);
      // It desaturates slightly rather than shifting exposure.
      expect(Math.abs(crossed[2] - crossed[1])).toBeLessThan(Math.abs(probe[2] - probe[1]));
      expect(profile.channelCrosstalkStrength).toBeLessThanOrEqual(0.09);
    }
  });

  it('leaves every combat-relevant exposure untouched by the highlight transfer', () => {
    for (const profile of ALL_PROFILES) {
      for (const value of [0, 0.05, 0.18, 0.4, 0.7, profile.transfer.shoulderStart - 1e-6]) {
        const probe: Rgb = [value, value, value];
        const transferred = applyHighlightTransfer(probe, profile);
        expect(transferred[0]).toBeCloseTo(value, 9);
        expect(transferred[1]).toBeCloseTo(value, 9);
        expect(transferred[2]).toBeCloseTo(value, 9);
      }
      // Inside the shoulder it compresses without ever inverting.
      const start = profile.transfer.shoulderStart;
      const inside = luma(applyHighlightTransfer([2, 2, 2], profile));
      expect(inside).toBeLessThan(2);
      expect(inside).toBeGreaterThan(start);
      // At and above the shoulder end it becomes a pure translation again.
      expect(luma(applyHighlightTransfer([6, 6, 6], profile))).toBeCloseTo(6, 6);
      expect(luma(applyHighlightTransfer([9, 9, 9], profile))).toBeCloseTo(9, 6);
    }
  });

  it('keeps the ASC CDL black point essentially where it was authored', () => {
    for (const profile of ALL_PROFILES) {
      for (const offset of profile.cdl.offset) {
        expect(offset).toBeGreaterThanOrEqual(-0.001);
        expect(offset).toBeLessThanOrEqual(0.004);
      }
      // A pixel one 8-bit step above black survives the CDL as a positive value.
      const nearBlack = applyAscCdl([1 / 255, 1 / 255, 1 / 255], profile);
      expect(Math.min(...nearBlack)).toBeGreaterThan(0);
      // Mid grey stays mid grey to within 3%.
      expect(luma(applyAscCdl([0.18, 0.18, 0.18], profile))).toBeGreaterThan(0.18 * 0.97);
      expect(luma(applyAscCdl([0.18, 0.18, 0.18], profile))).toBeLessThan(0.18 * 1.03);
    }
  });

  it('clamps grain to a third of one 8-bit step and animates it at the profile rate', () => {
    for (const profile of ALL_PROFILES) {
      const amplitude = grainAmplitudeFor(profile, DEFAULT_AUTHORED_GRAIN_8BIT);
      expect(amplitude).toBeGreaterThan(0);
      expect(amplitude * 255).toBeLessThanOrEqual(GRAIN_MAXIMUM_8BIT_STEPS + 1e-12);
      // Even an absurd authored strength cannot break the ceiling.
      expect(grainAmplitudeFor(profile, 1_000) * 255).toBeCloseTo(GRAIN_MAXIMUM_8BIT_STEPS, 12);
      expect(grainAmplitudeFor(profile, -5)).toBe(0);
      // 24 Hz quantisation: the pattern holds still inside one film frame.
      expect(grainSeedFor(profile, 0)).toBe(0);
      expect(grainSeedFor(profile, 10)).toBe(grainSeedFor(profile, 20));
      expect(grainSeedFor(profile, 0)).not.toBe(grainSeedFor(profile, 100));
      expect(grainSeedFor(profile, Number.NaN)).toBe(0);
    }
  });

  it('refuses a bloom threshold that would let ordinary surfaces glow', () => {
    for (const profile of ALL_PROFILES) {
      expect(profile.bloom.threshold).toBeGreaterThan(1);
      const bloom = makeBloomNode(0.2);
      tuneBloomForProfile(bloom, profile, 0.2);
      expect(bloom.threshold.value).toBe(profile.bloom.threshold);
      expect(bloom.radius.value).toBe(profile.bloom.radiusTexelScale);
      expect(bloom.strength.value).toBeCloseTo(0.2 * profile.bloom.intensityScale, 12);
    }
    const unsafe = { ...resolveGradeProfile('quality'), bloom: { threshold: 0.92, radiusTexelScale: 0.32, intensityScale: 1 } } as FrozenFilmicGradeProfile;
    expect(() => tuneBloomForProfile(makeBloomNode(), unsafe, 0.14)).toThrow(/threshold must exceed 1\.0 linear/);
  });

  it('produces a visible but bounded look change end to end', () => {
    const profile = resolveGradeProfile('quality');
    // Linear side: mid grey moves only slightly, so exposure is preserved.
    const linear = evaluateLinearReferenceStages([0.18, 0.18, 0.18], profile);
    expect(luma(linear)).toBeGreaterThan(0.18 * 0.97);
    expect(luma(linear)).toBeLessThan(0.18 * 1.03);
    // Display side: a neutral shadow picks up a cool cast without losing luma
    // beyond the shaping budget.
    const display = evaluateDisplayReferenceStages([0.1, 0.1, 0.1], profile);
    expect(display[2]).toBeGreaterThan(display[0]);
    expect(luma(display)).toBeGreaterThan(0.1 * 0.85);
    expect(luma(display)).toBeLessThan(0.1 * 1.15);
  });

  it('normalises tint hexes into unit-mean directions', () => {
    const cool = srgbTintDirection(0x274356);
    expect((cool[0] + cool[1] + cool[2]) / 3).toBeCloseTo(1, 12);
    const warm = srgbTintDirection(0xffd5a2);
    expect((warm[0] + warm[1] + warm[2]) / 3).toBeCloseTo(1, 12);
    expect(srgbTintDirection(0x000000)).toEqual([1, 1, 1]);
    expect(srgbTintDirection(0xffffff)).toEqual([1, 1, 1]);
  });
});

describe('HF-362 pipeline installation', () => {
  it('takes over the output transform so the tone map is not applied twice', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline);
    // RenderPipeline would otherwise append renderOutput() AFTER outputNode,
    // which is what forced every display-referred op onto the linear side.
    expect(pipeline.outputColorTransform).toBe(false);
    expect(pipeline.needsUpdate).toBe(true);
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES]);
    expect(handle.profileId()).toBe('quality');
  });

  it('re-wraps whatever linear-HDR node the scene-pass assembler publishes', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'max' });
    const linearSource = vec4(3, 2, 1, 1);
    pipeline.outputNode = linearSource;
    // The pipeline now reads back the graded node, not the raw linear one.
    expect(pipeline.outputNode).not.toBe(linearSource);
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES]);
    expect(handle.profileId()).toBe('max');
    // Disposal restores the linear node and the default output transform.
    handle.dispose();
    expect(pipeline.outputNode).toBe(linearSource);
    expect(pipeline.outputColorTransform).toBe(true);
  });

  it('is idempotent and keeps one chain per pipeline', () => {
    const pipeline = makePipeline();
    const first = installFilmicGradeChain(pipeline, { profileId: 'performance' });
    const second = installFilmicGradeChain(pipeline, { profileId: 'max' });
    expect(second).toBe(first);
    expect(first.profileId()).toBe('max');
  });

  it('drives profile, grain and vignette through the live uniforms', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'performance' });
    expect(handle.uniforms.midtoneContrast.value).toBe(0.16);
    handle.setProfile('max');
    expect(handle.uniforms.midtoneContrast.value).toBe(0.24);
    handle.setGrainStrength8Bit(0);
    expect(handle.uniforms.grainAmplitude.value).toBe(0);
    handle.setGrainStrength8Bit(DEFAULT_AUTHORED_GRAIN_8BIT);
    expect(handle.uniforms.grainAmplitude.value).toBeGreaterThan(0);
    // The display vignette starts disabled until the graphics runtime hands
    // it the setting; it is now the ONE owner (the linear-side stage in the
    // scene-pass assembler was retired in Pass 76), because two stacked
    // vignettes would darken the exact screen periphery enemies enter from.
    expect(handle.uniforms.vignetteStrength.value).toBe(0);
    handle.setDisplayVignetteStrength(0.16);
    expect(handle.uniforms.vignetteStrength.value).toBe(0.16);
    handle.setDisplayVignetteStrength(Number.NaN);
    expect(handle.uniforms.vignetteStrength.value).toBe(0);
    handle.beforeRender(1_000);
    expect(handle.uniforms.grainSeed.value).not.toBe(0);
  });

  it('finds and retunes the real bloom node in the published linear graph', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'quality' });
    const emissiveBloom = bloom(vec4(2, 2, 2, 1), 0.14, 0.32, 0.92);
    // The threshold the scene-pass assembler asks for today lets ordinary
    // in-gamut surfaces glow, which washes out sightlines.
    expect(emissiveBloom.threshold.value).toBe(0.92);
    pipeline.outputNode = vec4(emissiveBloom.rgb, 1);
    expect(handle.tunedBloomNodes()).toBe(1);
    expect(emissiveBloom.threshold.value).toBe(1.1);
    expect(emissiveBloom.radius.value).toBe(0.32);
    expect(emissiveBloom.strength.value).toBeCloseTo(0.14, 12);
    // A settings write is detected and rescaled rather than silently kept.
    emissiveBloom.strength.value = 0.3;
    handle.setProfile('max');
    handle.beforeRender(16);
    expect(emissiveBloom.threshold.value).toBe(1.08);
    expect(emissiveBloom.radius.value).toBe(0.4);
    expect(emissiveBloom.strength.value).toBeCloseTo(0.3 * 1.15, 12);
    handle.dispose();
  });

  it('retunes reachable bloom nodes and re-asserts them every frame', () => {
    const bloom = makeBloomNode(0.2);
    expect(isTunableBloomNode(bloom)).toBe(true);
    expect(isTunableBloomNode({ threshold: { value: 1 } })).toBe(false);
    expect(isTunableBloomNode(null)).toBe(false);

    // A stand-in linear source whose graph contains the bloom node twice, so
    // the walk is also proven to dedupe shared subtrees.
    const source = {
      isNode: true,
      getChildren() {
        return [bloom, bloom, source];
      },
    };
    const pipeline = makePipeline();
    // The chain build needs a real TSL node; install first, then point the
    // bloom discovery at the stand-in graph through the same setter path.
    const handle = installFilmicGradeChain(pipeline, { profileId: 'quality' });
    Object.assign(source, { rgb: vec4(1, 1, 1, 1).rgb, a: float(1) });
    expect(handle.tunedBloomNodes()).toBe(0);
    expect(collectTunableBloomNodes(source)).toEqual([bloom]);
    expect(collectTunableBloomNodes(null)).toEqual([]);
    expect(collectTunableBloomNodes({})).toEqual([]);

    // Directly exercise the settings-write recovery the frame hook performs.
    tuneBloomForProfile(bloom, resolveGradeProfile('quality'), 0.2);
    expect(bloom.threshold.value).toBe(1.1);
    bloom.strength.value = 0.5; // simulate a graphics-settings write
    tuneBloomForProfile(bloom, resolveGradeProfile('max'), bloom.strength.value);
    expect(bloom.threshold.value).toBe(1.08);
    expect(bloom.strength.value).toBeCloseTo(0.5 * 1.15, 12);
  });
});

describe('Pass 76 optional trailing display stages', () => {
  it('appends FXAA and RCAS sharpen after the frozen core chain in the canonical order', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'quality' });
    expect(handle.postAntiAliasing()).toBe('off');
    expect(handle.sharpness()).toBe(0);
    handle.setPostAntiAliasing('fxaa');
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES, 'display-post-antialiasing-fxaa']);
    handle.setSharpness(0.5);
    expect(handle.stages()).toEqual([
      ...GRADE_CHAIN_STAGES,
      'display-post-antialiasing-fxaa',
      'display-cas-sharpen',
    ]);
    // Strength moves through the live uniform without a graph rebuild.
    const stagesBefore = handle.stages();
    handle.setSharpness(0.9);
    expect(handle.stages()).toBe(stagesBefore);
    expect(handle.sharpness()).toBe(0.9);
    // Zero removes the RCAS stage entirely rather than idling a pass.
    handle.setSharpness(0);
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES, 'display-post-antialiasing-fxaa']);
    handle.setPostAntiAliasing('off');
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES]);
    handle.dispose();
  });

  it('installs with persisted post AA and sharpness and survives a source republish', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, {
      profileId: 'quality',
      postAntiAliasing: 'fxaa',
      sharpness: 0.25,
    });
    const expected = [...GRADE_CHAIN_STAGES, 'display-post-antialiasing-fxaa', 'display-cas-sharpen'];
    expect(handle.stages()).toEqual(expected);
    // A scene-pass republish must re-wrap the trailing stages too.
    pipeline.outputNode = vec4(2, 1, 0, 1);
    expect(handle.stages()).toEqual(expected);
    handle.dispose();
  });

  it('maps player sharpness onto the inverted stop-based RCAS parameter', () => {
    expect(rcasSharpnessFor(0)).toBe(2);
    expect(rcasSharpnessFor(0.5)).toBe(1);
    expect(rcasSharpnessFor(1)).toBe(0);
    expect(rcasSharpnessFor(Number.NaN)).toBe(2);
    expect(rcasSharpnessFor(7)).toBe(0);
    expect(rcasSharpnessFor(-3)).toBe(2);
  });

  it('fails closed on trailing stages outside the allowed optional order', () => {
    expect(() => assertGradeChainOrder([...GRADE_CHAIN_STAGES])).not.toThrow();
    expect(() => assertGradeChainOrder([...GRADE_CHAIN_STAGES, 'display-post-antialiasing-smaa'])).not.toThrow();
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES, 'display-post-antialiasing-smaa', 'display-cas-sharpen',
    ])).not.toThrow();
    expect(() => assertGradeChainOrder([...GRADE_CHAIN_STAGES, 'display-cas-sharpen'])).not.toThrow();
    expect(() => assertGradeChainOrder([...GRADE_CHAIN_STAGES, 'made-up-stage']))
      .toThrow(/trailing stage violation/);
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES, 'display-cas-sharpen', 'display-post-antialiasing-fxaa',
    ])).toThrow(/trailing stage violation/);
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES, 'display-post-antialiasing-fxaa', 'display-post-antialiasing-smaa',
    ])).toThrow(/at most one post anti-aliasing/);
    // The frozen core prefix is still mandatory and order-checked.
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES.slice(0, -1), 'display-post-antialiasing-fxaa',
    ])).toThrow(/order violation at core stage/);
  });
});

describe('HF-364 FSR 1 spatial upscaling stage', () => {
  it('takes over the RCAS stage rather than stacking a second sharpen', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'quality', sharpness: 0.5 });
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES, 'display-cas-sharpen']);
    handle.setSpatialUpscaling({ enabled: true, sceneResolutionScale: 0.67 });
    // Exactly one RCAS owner: the standalone sharpen is gone, FSR 1 owns it.
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES, 'display-fsr1-easu-rcas-upscale']);
    expect(handle.spatialUpscaling()).toEqual({ enabled: true, sceneResolutionScale: 0.67 });
    // The player's sharpness still reaches the picture; it just drives FSR 1's
    // RCAS half, so changing it must not toggle any stage.
    const stagesBefore = handle.stages();
    handle.setSharpness(0.9);
    expect(handle.stages()).toBe(stagesBefore);
    handle.setSharpness(0);
    expect(handle.stages()).toBe(stagesBefore);
    handle.setSpatialUpscaling({ enabled: false, sceneResolutionScale: 1 });
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES]);
    handle.dispose();
  });

  it('composes with post anti-aliasing in the AMD-canonical order', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, {
      profileId: 'quality',
      postAntiAliasing: 'fxaa',
      spatialUpscaling: { enabled: true, sceneResolutionScale: 0.5 },
    });
    expect(handle.stages()).toEqual([
      ...GRADE_CHAIN_STAGES, 'display-post-antialiasing-fxaa', 'display-fsr1-easu-rcas-upscale',
    ]);
    // FSR 1 explicitly expects an anti-aliased source, so the AA stage must
    // stay ahead of it, never after.
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES, 'display-fsr1-easu-rcas-upscale', 'display-post-antialiasing-smaa',
    ])).toThrow(/trailing stage violation/);
    handle.dispose();
  });

  it('rejects both RCAS owners in one chain', () => {
    expect(() => assertGradeChainOrder([...GRADE_CHAIN_STAGES, 'display-fsr1-easu-rcas-upscale'])).not.toThrow();
    expect(() => assertGradeChainOrder([
      ...GRADE_CHAIN_STAGES, 'display-cas-sharpen', 'display-fsr1-easu-rcas-upscale',
    ])).toThrow(/at most one RCAS sharpen owner/);
  });

  it('ignores an out-of-range or no-op upscale request', () => {
    const pipeline = makePipeline();
    const handle = installFilmicGradeChain(pipeline, { profileId: 'quality' });
    // A scale of 1 is not an upscale, so no stage may be built for it.
    handle.setSpatialUpscaling({ enabled: true, sceneResolutionScale: 1 });
    expect(handle.stages()).toEqual([...GRADE_CHAIN_STAGES]);
    // A hostile value is clamped rather than allowed to allocate a 1px target.
    handle.setSpatialUpscaling({ enabled: true, sceneResolutionScale: 0.01 });
    expect(handle.spatialUpscaling().sceneResolutionScale).toBe(0.25);
    handle.dispose();
  });
});
