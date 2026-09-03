// Weather's player-facing vocabulary lives with the weather model, so the
// Options ladder and the clamp it drives cannot drift apart. This is the only
// import in this file and it reaches a module with no runtime dependencies of
// its own.
import { WEATHER_INTENSITY_CHOICES, type WeatherIntensityChoice } from './weather/weather-settings';
// Same argument one line up: the ambient air's own bounds live with the
// system that enforces them, so the slider and the clamp cannot drift.
import { AMBIENT_LIFE_RANGE } from './particles/ambient-life-settings';
// HF-398 — the classic recursive ray-tracing tier. The type lives with the
// tracer's own numbers and bounds so a tier can never exist here that the
// resolver does not know how to clamp.
import type { RayTracingTier } from './rendering/raytracing/raytracing-profile';
// HF-418 - the baked irradiance-probe tier. Same argument as the line above:
// the type lives with the bake's own numbers and bounds, so a tier can never
// exist here that the resolver does not know how to clamp.
import type { BakedIndirectTier } from './rendering/lighting/baked-indirect';

export type AntiAliasingMode = 'off' | 'msaa-2x' | 'msaa-4x' | 'fxaa' | 'smaa';
export type ShadowResolution = 'medium' | 'high';
export type ShadowUpdateMode = 'static' | 'dynamic';
export type ShadowFilterMode = 'auto' | 'pcf' | 'pcss-soft';
export type QualityTier = 'low' | 'high' | 'ultra';
export type LightingTier = 'off' | 'low' | 'high';
export type ReflectionQualityTier = 'off' | 'low' | 'high' | 'ultra';
export type AmbientOcclusionQuality = 'off' | 'low' | 'high' | 'ultra';
export type BloomQuality = 'off' | 'subtle' | 'cinematic';
export type ToneMappingMode = 'aces' | 'agx' | 'neutral';
export type GeometryDetail = 'reduced' | 'full';
export type FilmicProfileChoice = 'arena-default' | 'performance' | 'quality' | 'max';
/**
 * Tiers for the HF-364 screen-space raymarched stack. They share `LightingTier`
 * shape deliberately: off / low / high, with no "ultra" until a WebGPU
 * representative-hardware budget exists for one.
 */
export type ScreenSpaceTier = LightingTier;
/**
 * Spatial upscaling owner. FSR 1 is a real, vendor-published SPATIAL upscaler
 * (EASU + RCAS) that runs in a shader — it is not DLSS, not frame generation
 * and not temporal, and the labels never imply otherwise.
 */
export type SpatialUpscalingMode = 'off' | 'fsr1-quality' | 'fsr1-balanced' | 'fsr1-performance';

/**
 * Presentation-only values. None of these values may change collision,
 * ballistics, visibility authority, spawn topology, network state, or scores.
 */
export type AdvancedGraphicsValues = Readonly<{
  renderScale: number;
  adaptiveResolution: boolean;
  /** Adaptive workload target. This is deliberately separate from the frame limiter. */
  targetFps: number;
  /** 0 means uncapped; otherwise the presentation loop is bounded to this rate. */
  frameRateLimit: number;
  antiAliasing: AntiAliasingMode;
  geometryDetail: GeometryDetail;
  shadows: 'off' | 'high';
  shadowResolution: ShadowResolution;
  shadowUpdateMode: ShadowUpdateMode;
  shadowFilter: ShadowFilterMode;
  indirectLighting: LightingTier;
  /**
   * HF-418 - offline path-traced irradiance probes, sampled per pixel. The one
   * lighting control whose per-frame cost is the same at every tier: the tier
   * decides how long the OFFLINE trace ran, not what the frame does.
   */
  bakedIndirect: BakedIndirectTier;
  ambientOcclusion: AmbientOcclusionQuality;
  screenSpaceReflections: ScreenSpaceTier;
  screenSpaceGi: ScreenSpaceTier;
  rayTracing: RayTracingTier;
  reflectionQuality: ReflectionQualityTier;
  environmentIntensity: number;
  volumetricQuality: QualityTier;
  volumetricLightShafts: ScreenSpaceTier;
  anisotropy: 1 | 2 | 4 | 8 | 16;
  particleQuality: QualityTier;
  decalQuality: QualityTier;
  smokeQuality: QualityTier;
  bloomQuality: BloomQuality;
  exposure: number;
  toneMapping: ToneMappingMode;
  filmicProfile: FilmicProfileChoice;
  sharpness: number;
  filmGrain: number;
  vignette: number;
  depthOfField: boolean;
  depthOfFieldStrength: number;
  motionBlur: number;
  spatialUpscaling: SpatialUpscalingMode;
  /**
   * WEATHER — Pass 78. These four are presentation clamps on a simulation that
   * stays identical on every peer; see weather/weather-settings.ts for why a
   * weather control is only ever allowed to show LESS than the match rolled.
   */
  weatherIntensity: WeatherIntensityChoice;
  rainDensity: number;
  windStrength: number;
  lightning: boolean;
  /**
   * Pass 79. Wet ground is simulated identically on every peer whatever this
   * says; it only decides whether THIS screen writes the wetness into the
   * arena's own materials.
   */
  wetSurfaces: boolean;
  /**
   * Pass 79. How much of the authored ambient population is kept alive. A
   * different knob from `particleQuality`, which is the capacity CEILING - see
   * particles/ambient-life-settings.ts for why conflating them made the top of
   * the quality select feel like it did nothing.
   */
  ambientLife: number;
}>;

export type GraphicsAdvancedKey = keyof AdvancedGraphicsValues;
export type GraphicsSettingCategory = 'display' | 'geometry' | 'lighting' | 'atmosphere' | 'materials' | 'post';
export type GraphicsRuntimeConsumer =
  | 'adaptive-quality'
  | 'frame-scheduler'
  | 'renderer-init'
  | 'arena-stream'
  | 'shadow-runtime'
  | 'arena-lighting'
  | 'ambient-occlusion'
  | 'baked-indirect'
  | 'material-refinement'
  | 'atmosphere-runtime'
  | 'presentation-budget'
  | 'smoke-presentation'
  | 'hdr-pipeline'
  | 'volumetric-light-shafts'
  | 'screen-space-reflections'
  | 'screen-space-gi'
  | 'ray-tracing'
  | 'depth-of-field'
  | 'motion-blur'
  | 'spatial-upscaling'
  | 'weather-presentation'
  | 'rain-presentation'
  | 'ambient-particles';

/**
 * WHAT THESE FIELDS ACTUALLY PROVE.
 *
 * `path` + `symbol` are a SOURCE-SHAPE trace: the registry test greps the file
 * and asserts the symbol is present. That proves the code EXISTS. It does not
 * prove the code RAN, and on 2026-08-31 the difference cost eight arenas their
 * environment lighting: the environmentIntensity row pointed at a real symbol
 * in a real file inside a function the first arena of every page load never
 * reached, and nine unit tests passed over the top of it for weeks
 * (docs/IBL_FIRST_ARENA_BUG_2026-08-31.md).
 *
 * `telemetryPath` names where the value surfaces for a probe. `liveObservation`
 * is the stronger claim and the only one that may be described as runtime
 * evidence: the name of an assertion that reads the LIVE object graph and fails
 * closed. A row without it is making the weaker claim, and now says so.
 */
export type GraphicsRuntimeEvidence = Readonly<{
  /** File the symbol must appear in. Source shape only - grep, not execution. */
  path: string;
  /** Symbol the registry test greps for. Proves the code exists, not that it ran. */
  symbol: string;
  /** Where the value surfaces for a probe to read. */
  telemetryPath: string;
  /**
   * Optional: the live, fail-closed assertion that OBSERVES this control's
   * effect on the running scene. Present only where such a gate genuinely
   * exists, because a claim of runtime evidence that is really a grep is worse
   * than an honest grep.
   */
  liveObservation?: string;
}>;

export type GraphicsSelectOption = Readonly<{ value: string; label: string }>;

type GraphicsControlBase = Readonly<{
  key: GraphicsAdvancedKey;
  id: `graphics-${string}`;
  category: GraphicsSettingCategory;
  label: string;
  description: string;
  applyMode: 'live' | 'pipeline-rebuild' | 'arena-reload';
  runtimeConsumer: GraphicsRuntimeConsumer;
}>;

export type GraphicsControlDefinition = GraphicsControlBase & (
  | Readonly<{ kind: 'toggle' }>
  | Readonly<{
    kind: 'range';
    minimum: number;
    maximum: number;
    step: number;
    unit: 'percent' | 'fps' | 'multiplier';
    unlimitedSentinel?: number;
  }>
  | Readonly<{ kind: 'select'; options: readonly GraphicsSelectOption[] }>
);

export type GraphicsCapabilityNotice = Readonly<{
  id: string;
  category: GraphicsSettingCategory;
  label: string;
  state: 'unavailable';
  reason: string;
  evidence: string;
}>;

const selectOptions = (...options: ReadonlyArray<readonly [string, string]>): readonly GraphicsSelectOption[] => (
  Object.freeze(options.map(([value, label]) => Object.freeze({ value, label })))
);

function control(definition: GraphicsControlDefinition): GraphicsControlDefinition {
  return Object.freeze(definition);
}

/**
 * Canonical UI/persistence/runtime registry. Adding a setting anywhere else is
 * a release-blocking orphan and is rejected by the registry contract tests.
 */
export const ADVANCED_GRAPHICS_CONTROLS: readonly GraphicsControlDefinition[] = Object.freeze([
  control({
    key: 'renderScale', id: 'graphics-render-scale', category: 'display', label: 'Render scale',
    description: 'Internal framebuffer scale. Values above native supersample before output.',
    kind: 'range', minimum: 0.5, maximum: 1.25, step: 0.05, unit: 'percent',
    applyMode: 'live', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'adaptiveResolution', id: 'graphics-adaptive', category: 'display', label: 'Adaptive quality',
    description: 'Changes presentation budgets after sustained frame-time pressure; gameplay authority is unchanged.',
    kind: 'toggle', applyMode: 'live', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'targetFps', id: 'graphics-target-fps', category: 'display', label: 'Adaptive target',
    description: 'Target used by the adaptive workload controller. It is not the output frame limiter.',
    kind: 'range', minimum: 30, maximum: 360, step: 1, unit: 'fps',
    applyMode: 'live', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'frameRateLimit', id: 'graphics-frame-rate-limit', category: 'display', label: 'Maximum FPS',
    description: 'Bounds presentation work without changing the fixed-step simulation. The final slider position is uncapped. UNCAPPED means the game imposes no limit - your real ceiling is then your monitor’s refresh rate, because the browser paces frames to it. Two things raise that ceiling, and the FPS readout tells you which one you need: if the display-refresh notice appears, raise the refresh in Windows Settings › System › Display › Advanced display. To go above the refresh entirely, a page cannot switch vsync off itself - run tools/play-atomic-acres-no-vsync.cmd, which launches a separate Chrome with --disable-gpu-vsync --disable-frame-rate-limit and leaves your normal profile untouched. Measured on the owner’s RTX 5080 at 1440p: 52 presented frames per second vsynced against 63-78 uncapped.',
    kind: 'range', minimum: 30, maximum: 361, step: 1, unit: 'fps', unlimitedSentinel: 361,
    applyMode: 'live', runtimeConsumer: 'frame-scheduler',
  }),
  control({
    key: 'antiAliasing', id: 'graphics-anti-aliasing', category: 'display', label: 'Anti-aliasing',
    description: 'MSAA multisamples the principal HDR scene target; FXAA and SMAA run as WebGPU display-side post stages after the filmic grade chain.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['msaa-2x', 'MSAA 2X'], ['msaa-4x', 'MSAA 4X'], ['fxaa', 'FXAA'], ['smaa', 'SMAA']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'renderer-init',
  }),
  control({
    key: 'geometryDetail', id: 'graphics-geometry-detail', category: 'geometry', label: 'Geometry detail',
    description: 'Chooses the reduced or full authored presentation while preserving identical gameplay geometry and collision.',
    kind: 'select', options: selectOptions(['reduced', 'REDUCED'], ['full', 'FULL']),
    applyMode: 'arena-reload', runtimeConsumer: 'arena-stream',
  }),
  control({
    key: 'shadows', id: 'graphics-shadows', category: 'lighting', label: 'Sun shadows',
    description: 'Enables arena-authored shadow volumes and occlusion.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['high', 'ON']),
    applyMode: 'live', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'shadowResolution', id: 'graphics-shadow-resolution', category: 'lighting', label: 'Shadow resolution',
    description: 'Selects a bounded 1024 or arena-authored 2048 shadow map.',
    kind: 'select', options: selectOptions(['medium', 'MEDIUM'], ['high', 'HIGH']),
    applyMode: 'live', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'shadowUpdateMode', id: 'graphics-shadow-update', category: 'lighting', label: 'Shadow updates',
    description: 'Static refreshes on material scene changes; Dynamic refreshes every presented frame.',
    kind: 'select', options: selectOptions(['static', 'STATIC'], ['dynamic', 'DYNAMIC']),
    applyMode: 'live', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'shadowFilter', id: 'graphics-shadow-filter', category: 'lighting', label: 'Shadow filtering',
    description: 'Auto keeps the browser-detected sampler; PCF forces filtered comparison taps; PCSS Soft forces the authored-penumbra soft sampler. WebKit engines keep the basic-depth compatibility floor.',
    kind: 'select', options: selectOptions(['auto', 'AUTO'], ['pcf', 'PCF'], ['pcss-soft', 'PCSS SOFT']),
    applyMode: 'live', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'indirectLighting', id: 'graphics-indirect-lighting', category: 'lighting', label: 'Indirect light',
    description: 'Scales arena hemisphere and ambient bounce approximations without inventing path tracing.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'live', runtimeConsumer: 'arena-lighting',
  }),
  // HF-418 / Lane AL. THE ONE CONTROL IN THIS CATEGORY THAT IS ALMOST FREE.
  // Everything else here is a per-frame march whose tier is a cost; this is a
  // 3D texture fetch whose tier decided how long an OFFLINE path trace ran.
  // That asymmetry is why the profile defaults turn it on where they turn the
  // marches off, and the description says so without saying "free", because
  // the bake is real work - it is just work the frame does not do.
  //
  // It is also the answer to the one thing RAY TRACED structurally cannot do.
  // Classic recursive ray tracing computes no indirect bounce at all; the
  // documented failure is raising a flat ambient constant until the scene is
  // milk. This is what gets raised instead.
  control({
    key: 'bakedIndirect', id: 'graphics-baked-indirect', category: 'lighting', label: 'Baked indirect light',
    description: 'Light that has bounced off the world once or twice, traced before you got here: shaded sides pick up the colour of what is next to them instead of going flat grey. Costs the frame almost nothing.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'baked-indirect',
  }),
  control({
    key: 'ambientOcclusion', id: 'graphics-ambient-occlusion', category: 'lighting', label: 'Contact shadows (GTAO)',
    description: 'Adds bounded WebGPU ground-truth ambient occlusion from the scene depth buffer. Higher tiers increase samples and resolution; High and Ultra add a depth/normal-aware denoise pass.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'ambient-occlusion',
  }),
  // The player-facing line says what you SEE. The engineering rationale that
  // used to sit in `description` lives here instead, because `description` is
  // rendered verbatim into a one-line `<small>` under the control and a
  // paragraph of node names there is how a real feature reads as noise.
  //
  // SSR: ray-marches the depth buffer, so it only ever reflects what is already
  // on screen. Additive composite with a clamped intensity ceiling
  // (SSR_MAXIMUM_INTENSITY), so it can never darken a sightline. Known
  // approximation: non-PBR materials (sky dome, additive atmosphere cards)
  // leave metalness/roughness zero-initialised and read as smooth dielectrics —
  // see `screen-space-post.ts → packedMaterialMrtNode`.
  control({
    key: 'screenSpaceReflections', id: 'graphics-screen-space-reflections', category: 'lighting', label: 'Screen-space reflections',
    description: 'Puddles, wet decking and polished metal mirror the world in front of you. Anything off the edge of the screen cannot show up in them.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'screen-space-reflections',
  }),
  // SSGI: ray-marched bounce light. This is screen-space and the label says so
  // — WebGPU exposes no hardware ray tracing in any browser, and the
  // `path-tracing` capability notice stays. Only the node's GI buffer is
  // consumed; its occlusion buffer is discarded so it cannot darken cover.
  // Gain clamped by SSGI_MAXIMUM_GI_INTENSITY.
  control({
    key: 'screenSpaceGi', id: 'graphics-screen-space-gi', category: 'lighting', label: 'Bounced light (screen-space GI)',
    description: 'Light bounces off bright surfaces and tints whatever sits next to them, so shaded sides and interiors stop looking flat.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'screen-space-gi',
  }),
  // HF-398: CLASSIC RECURSIVE RAY TRACING. This one is genuinely ray tracing —
  // real world-space rays intersecting real world-space geometry, recursing at
  // reflective and refractive surfaces and casting shadow rays — which is why
  // the row above it is carefully NOT called that and this one is. What it may
  // still never claim, in this string or any other: RTX, RT cores, hardware
  // acceleration, or path tracing. No browser exposes a ray-tracing pipeline,
  // and this preset asks for no extension. The `path-tracing` capability notice
  // stays exactly as it is, because hardware ray tracing genuinely is
  // unavailable and that is a different statement from this one.
  control({
    key: 'rayTracing', id: 'graphics-ray-tracing', category: 'lighting', label: 'Ray tracing (software)',
    description: 'Traces real rays at the world, so reflections show what is behind and beside you and carry hard shadows; refractions adds glass and water that bend light. Software only, on any GPU.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['reflections', 'REFLECTIONS'], ['refractions', 'REFLECTIONS + REFRACTIONS']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'ray-tracing',
  }),
  control({
    key: 'reflectionQuality', id: 'graphics-reflections', category: 'lighting', label: 'Specular response',
    description: 'Gates PMREM cubemap resolution (128/256/512) for arena environment IBL. Higher tiers capture sharper specular from the sky backdrop. Does NOT raise material roughness (that was backwards).',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'live', runtimeConsumer: 'material-refinement',
  }),
  control({
    key: 'environmentIntensity', id: 'graphics-environment-intensity', category: 'lighting', label: 'Environment intensity',
    description: 'Scales the arena environment-map (IBL) contribution on top of the indirect-light budget. 1.00X is the authored calibration.',
    kind: 'range', minimum: 0, maximum: 2, step: 0.05, unit: 'multiplier',
    applyMode: 'live', runtimeConsumer: 'material-refinement',
  }),
  control({
    key: 'volumetricQuality', id: 'graphics-volumetrics', category: 'atmosphere', label: 'Volumetrics',
    description: 'Controls ambient mist, smoke stacks and deterministic dust density. Gameplay smoke remains visible at every tier.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'live', runtimeConsumer: 'atmosphere-runtime',
  }),
  // Godrays: ray-marches the sun shadow map, so the shafts are genuinely
  // occluded by the geometry casting them. `shadowsEnabled` is a hard
  // capability input, not a taste preference — with Sun shadows off the
  // resolver reports why rather than drawing nothing. Additive, with the shaft
  // gain clamped to GODRAY_MAXIMUM_ADDITIVE_GAIN (a fifth of the upstream
  // default) so a doorway beam cannot wash out the silhouette standing in it.
  control({
    key: 'volumetricLightShafts', id: 'graphics-volumetric-light-shafts', category: 'atmosphere', label: 'Sun shafts',
    description: 'Visible beams of sunlight through doorways and gaps, blocked by whatever stands in the way. Needs Sun shadows switched on.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'volumetric-light-shafts',
  }),
  control({
    key: 'smokeQuality', id: 'graphics-smoke-quality', category: 'atmosphere', label: 'Smoke presentation',
    description: 'Changes cards and opacity detail while keeping the same authoritative smoke volume and lifetime.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'live', runtimeConsumer: 'smoke-presentation',
  }),
  control({
    key: 'particleQuality', id: 'graphics-particles', category: 'atmosphere', label: 'Particles',
    description: 'Scales bounded impact and environmental particles from prewarmed pools.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'live', runtimeConsumer: 'presentation-budget',
  }),
  control({
    key: 'anisotropy', id: 'graphics-anisotropy', category: 'materials', label: 'Texture filtering',
    description: 'Maximum anisotropic filtering, clamped to the active GPU capability.',
    kind: 'select', options: selectOptions(['1', '1X'], ['2', '2X'], ['4', '4X'], ['8', '8X'], ['16', '16X']),
    applyMode: 'live', runtimeConsumer: 'material-refinement',
  }),
  control({
    key: 'decalQuality', id: 'graphics-decals', category: 'materials', label: 'Impact decals',
    description: 'Scales the bounded persistent-mark capacity and lifetime on collision surfaces.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'live', runtimeConsumer: 'presentation-budget',
  }),
  control({
    key: 'bloomQuality', id: 'graphics-bloom', category: 'post', label: 'Depth-aware bloom',
    description: 'Controls the TSL HDR bloom strength while retaining the scene-depth edge guard.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['subtle', 'SUBTLE'], ['cinematic', 'CINEMATIC']),
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'exposure', id: 'graphics-exposure', category: 'post', label: 'Exposure',
    description: 'Multiplies the calibrated per-arena exposure inside the renderer output pipeline.',
    kind: 'range', minimum: 0.75, maximum: 1.25, step: 0.05, unit: 'multiplier',
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'toneMapping', id: 'graphics-tone-mapping', category: 'post', label: 'Tone mapping',
    description: 'Selects a supported renderer output transform; deterministic review receipts record the effective mode.',
    kind: 'select', options: selectOptions(['aces', 'ACES FILMIC'], ['agx', 'AGX'], ['neutral', 'NEUTRAL']),
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'filmicProfile', id: 'graphics-filmic-profile', category: 'post', label: 'Filmic grade',
    description: 'Selects the authored filmic grade profile on the WebGPU chain. Arena Default keeps the preset-matched profile the arena was tuned against.',
    kind: 'select', options: selectOptions(['arena-default', 'ARENA DEFAULT'], ['performance', 'PERFORMANCE'], ['quality', 'QUALITY'], ['max', 'MAX']),
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'sharpness', id: 'graphics-sharpness', category: 'post', label: 'Sharpness',
    description: 'Contrast-adaptive (RCAS) sharpening on the display side after tone mapping; zero disables the stage entirely.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.01, unit: 'percent',
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'filmGrain', id: 'graphics-film-grain', category: 'post', label: 'Film grain',
    description: 'Scales deterministic TSL grain; zero disables it.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.01, unit: 'percent',
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'vignette', id: 'graphics-vignette', category: 'post', label: 'Vignette',
    description: 'Applies a bounded TSL edge falloff after bloom and grading; zero disables it.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.01, unit: 'percent',
    applyMode: 'live', runtimeConsumer: 'hdr-pipeline',
  }),
  // Depth of field: FIXED focus with a focal length far longer than any arena,
  // so there is no focus hunting and the blur radius is provably sub-pixel
  // across the whole combat midfield. `assertDepthOfFieldCombatSafety` samples
  // the band at graph construction and throws, at every strength — the bound is
  // not a comment, it is a build failure.
  control({
    key: 'depthOfField', id: 'graphics-depth-of-field', category: 'post', label: 'Depth of field',
    description: 'Softens the far background only — sky and distant horizon. Anything you can shoot at stays sharp.',
    kind: 'toggle', applyMode: 'pipeline-rebuild', runtimeConsumer: 'depth-of-field',
  }),
  control({
    key: 'depthOfFieldStrength', id: 'graphics-depth-of-field-strength', category: 'post', label: 'Defocus strength',
    description: 'How soft that far background gets. Combat range stays sharp at every setting on this slider.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.05, unit: 'percent',
    applyMode: 'live', runtimeConsumer: 'depth-of-field',
  }),
  // Motion blur: the only effect in this family that REPLACES pixels rather
  // than adding light, so it carries two clamps instead of one. The dead-zone
  // gate is a real node in the TSL graph (`smoothstep(deadZone, knee, speed)`),
  // not a CPU-side assertion, and the total screen offset is capped by
  // MOTION_BLUR_MAXIMUM_UV_OFFSET so a fast flick cannot erase a target.
  control({
    key: 'motionBlur', id: 'graphics-motion-blur', category: 'post', label: 'Motion blur',
    description: 'Adds a short smear to fast turns and fast-moving objects. Slow aim adjustments never smear; zero turns it off.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.05, unit: 'percent',
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'motion-blur',
  }),
  // FSR 1 is a real, vendor-published SPATIAL upscaler and the second sentence
  // of the description is load-bearing: the `ai-upscaling-frame-generation`
  // capability notice says DLSS and frame generation do not exist in a browser,
  // and this control must not be mistaken for either. When active it also owns
  // the sharpen stage, so Sharpness drives its RCAS.
  control({
    key: 'spatialUpscaling', id: 'graphics-spatial-upscaling', category: 'display', label: 'Spatial upscaling (FSR 1)',
    description: 'Renders below your screen resolution and rebuilds the image with AMD FSR 1 to gain frames. Spatial only: this is not DLSS and not frame generation.',
    kind: 'select', options: selectOptions(
      ['off', 'OFF'], ['fsr1-quality', 'FSR 1 QUALITY'], ['fsr1-balanced', 'FSR 1 BALANCED'], ['fsr1-performance', 'FSR 1 PERFORMANCE'],
    ),
    applyMode: 'pipeline-rebuild', runtimeConsumer: 'spatial-upscaling',
  }),
  // WEATHER — Pass 78. The owner audit rated these NOT-STARTED because there
  // was no player-facing control at all: rain, wind and wetness were fully
  // authored and completely unadjustable.
  //
  // Weather is a CEILING, not a forcing switch. The match's own weather is
  // derived from the host id and the match epoch and is identical on every
  // screen; this row decides how far of it this screen draws. That is what
  // lets it be a per-player setting at all without breaking the zero-traffic
  // determinism the whole weather model rests on.
  control({
    key: 'weatherIntensity', id: 'graphics-weather-intensity', category: 'atmosphere', label: 'Weather',
    description: 'How far the weather in a match is allowed to build on your screen. Everyone in the match still gets the same weather; this only decides how much of it you see.',
    // Derived from the weather model's own ladder rather than retyped, so a
    // rung added there cannot go missing from Options.
    kind: 'select', options: selectOptions(...WEATHER_INTENSITY_CHOICES.map((value) => [value, value.toUpperCase()] as const)),
    applyMode: 'live', runtimeConsumer: 'weather-presentation',
  }),
  // Density scales the instance count inside the quality tier's ceiling, so it
  // can thin rain right out but can never place more streaks than the tier
  // allows. The readability bound is arithmetic and lives in
  // rain-presentation.ts -> assertRainCombatSafety.
  control({
    key: 'rainDensity', id: 'graphics-rain-density', category: 'atmosphere', label: 'Rain density',
    description: 'How heavily rain falls when it rains. Turn it down if streaks distract you; combat range stays readable at every setting.',
    kind: 'range', minimum: 0.25, maximum: 1.5, step: 0.05, unit: 'multiplier',
    applyMode: 'live', runtimeConsumer: 'rain-presentation',
  }),
  // Wind is one shared field. This scales what the local presentation does with
  // it - rain lean, blowing dust, drifting embers, foliage - and nothing else.
  control({
    key: 'windStrength', id: 'graphics-wind-strength', category: 'atmosphere', label: 'Wind strength',
    description: 'How hard the wind pushes rain, dust and loose debris around. Zero is dead still air.',
    kind: 'range', minimum: 0, maximum: 2, step: 0.05, unit: 'multiplier',
    applyMode: 'live', runtimeConsumer: 'weather-presentation',
  }),
  // The description says FLASHES and not thunder on purpose. The thunder
  // timing is computed and exposed on every weather sample
  // (WeatherLightning.thunderInSeconds), but nothing plays it yet - the sound
  // inventory pins every audio call site and adding one is not this lane's to
  // make. Player-facing copy may not promise a sound the game does not make.
  control({
    key: 'lightning', id: 'graphics-lightning', category: 'atmosphere', label: 'Lightning',
    description: 'Distant strikes flash across the sky and light up the rain in heavy weather. Turn it off if the flashes bother you.',
    kind: 'toggle', applyMode: 'live', runtimeConsumer: 'weather-presentation',
  }),
  // Pass 79. Rain has darkened and glossed the ground it lands on since Pass 76
  // and there was no way to say no to it. It is a separate row from RAIN
  // DENSITY on purpose: a player who wants the storm but finds a mirror-bright
  // road distracting was previously choosing between the two.
  control({
    key: 'wetSurfaces', id: 'graphics-wet-surfaces', category: 'atmosphere', label: 'Wet surfaces',
    description: 'Roads, metal and stone darken and catch the light while it rains, then dry off slowly after it stops.',
    kind: 'toggle', applyMode: 'live', runtimeConsumer: 'rain-presentation',
  }),
  // Pass 79. The owner asked for "more like dust and particle effects" and the
  // only lever that existed was PARTICLES, which is a capacity CEILING and a
  // performance control. This is the one that decides how much of that ceiling
  // the air actually uses, which is the knob the request was about.
  control({
    key: 'ambientLife', id: 'graphics-ambient-life', category: 'atmosphere', label: 'Airborne detail',
    description: 'How much dust, pollen, leaves and sea spray hangs in the air around you. Turn it up for thicker air; zero is perfectly still.',
    kind: 'range',
    minimum: AMBIENT_LIFE_RANGE.minimum, maximum: AMBIENT_LIFE_RANGE.maximum, step: AMBIENT_LIFE_RANGE.step,
    unit: 'multiplier',
    applyMode: 'live', runtimeConsumer: 'ambient-particles',
  }),
]);

const runtimeEvidence = (
  path: string,
  symbol: string,
  telemetryPath: string,
  liveObservation?: string,
): readonly GraphicsRuntimeEvidence[] => Object.freeze([Object.freeze(
  liveObservation ? { path, symbol, telemetryPath, liveObservation } : { path, symbol, telemetryPath },
)]);

/**
 * SOURCE-SHAPE and telemetry trace for every player-visible control, plus a
 * live observation wherever one exists.
 *
 * Registry tests verify every path/symbol and reject missing or extra keys.
 * That is a real check and it catches a real class of drift - a control whose
 * consumer was deleted or renamed. It is NOT proof that the consumer executes,
 * and this table no longer describes itself as though it were. Only a row
 * carrying `liveObservation` claims that.
 */
export const ADVANCED_GRAPHICS_RUNTIME_EVIDENCE: Readonly<Record<GraphicsAdvancedKey, readonly GraphicsRuntimeEvidence[]>> = Object.freeze({
  renderScale: runtimeEvidence('src/pass65-settings.ts', 'resolveActiveGraphicsConfig', 'render.pixelRatio + render.adaptive.pixelRatioCap'),
  adaptiveResolution: runtimeEvidence('src/adaptive-quality.ts', 'configuredAdaptiveQualityLevels', 'render.adaptive.enabled + render.adaptive.levels'),
  targetFps: runtimeEvidence('src/legacy-main.ts', '1_000 / graphicsRuntime.targetFps', 'settings.graphics.targetFps + render.adaptive.targetFrameMs'),
  frameRateLimit: runtimeEvidence('src/legacy-main.ts', 'presentationFrameDue', 'settings.graphics.frameRateLimit + render.framePacing'),
  antiAliasing: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'pass(scene, camera, { samples: graphics.principalSamples })', 'render.atomicSignal.principalHdrSamples'),
  geometryDetail: runtimeEvidence('src/legacy-main.ts', 'const reducedRenderMode = activeRenderConfig.reducedPresentationDetail', 'render.reducedMode + render.representation'),
  shadows: runtimeEvidence('src/legacy-main.ts', 'renderRuntime.configureShadows', 'render.authoredShadows + render.shadows'),
  shadowResolution: runtimeEvidence('src/legacy-main.ts', 'Math.min(definition.shadows.mapSize, activeRenderConfig.shadowMapSize)', 'settings.graphics.shadowMapSize + arena visual receipt'),
  shadowUpdateMode: runtimeEvidence('src/legacy-main.ts', "activeRenderConfig.shadowMode === 'dynamic'", 'render.shadowMode + render.shadowAutoUpdate'),
  shadowFilter: runtimeEvidence('src/legacy-main.ts', 'shadowMapTypeForFilter', 'settings.graphics.shadowFilter + documentElement.dataset.webglShadowSampler'),
  indirectLighting: runtimeEvidence('src/legacy-main.ts', 'graphicsRuntime.indirectLightScale', 'settings.graphics.indirectLightScale + render.lighting'),
  ambientOcclusion: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'ao(sceneDepth, sceneNormal, camera)', 'render.atomicSignal.advancedGraphics.ambientOcclusion'),
  // The stronger claim, and it is earned: `publishBakedIndirectReceipt` writes
  // the BOUND volume's grid, digest, occluder count and LIVE gain onto
  // documentElement from the code that actually bound it, so a headless check
  // can tell "bound and correctly invisible" from "never bound" without a debug
  // hook. That is the distinction the 2026-08-31 IBL bug existed inside of.
  bakedIndirect: runtimeEvidence(
    'src/rendering/lighting/baked-indirect-runtime.ts',
    'buildBakedIndirectRuntime',
    'render.atomicSignal.advancedGraphics.screenSpace.bakedIndirect',
    'documentElement.dataset.bakedIndirect (publishBakedIndirectReceipt)',
  ),
  screenSpaceReflections: runtimeEvidence('src/rendering/screen-space-post.ts', 'ssr(sources.sceneColor, sources.sceneDepth, sources.sceneNormal', 'render.atomicSignal.advancedGraphics.screenSpace.reflections'),
  screenSpaceGi: runtimeEvidence('src/rendering/screen-space-post.ts', 'ssgi(sources.sceneColor, sources.sceneDepth, sources.sceneNormal', 'render.atomicSignal.advancedGraphics.screenSpace.globalIllumination'),
  // The telemetry probe is a receipt written BY THE GRAPH THAT WAS BUILT, not a
  // field echoing the requested tier. The scene assembler rebuilds the linear
  // stage list from a hard-coded order this lane does not own, so the trace can
  // never appear there; without a receipt of its own, "the setting is on" and
  // "the pass compiled into the live chain" would be indistinguishable from
  // outside. That is the exact class of false green this project has already
  // paid for three times.
  rayTracing: runtimeEvidence('src/rendering/screen-space-post.ts', 'buildRayTracedLightNode({', 'documentElement.dataset.rayTracedLayer (tier the graph BUILT) + dataset.rayTracedProxy (shapes/candidates:reflective)'),
  volumetricLightShafts: runtimeEvidence('src/rendering/screen-space-post.ts', 'godrays(sources.sceneDepth, sources.camera, sources.volumetricLight)', 'render.atomicSignal.advancedGraphics.screenSpace.godrays'),
  depthOfField: runtimeEvidence('src/rendering/screen-space-post.ts', 'dof(linearHdr, sources.sceneViewZ, focusDistance, focalLength, bokehScale)', 'render.atomicSignal.advancedGraphics.screenSpace.depthOfField'),
  depthOfFieldStrength: runtimeEvidence('src/rendering/screen-space-post-profile.ts', 'assertDepthOfFieldCombatSafety', 'settings.graphics.depthOfFieldStrength + screenSpace.depthOfField.bokehScale'),
  motionBlur: runtimeEvidence('src/rendering/screen-space-post.ts', 'motionBlur(sources.sceneColor, limited, int(runtime.motionBlur.samples))', 'render.atomicSignal.advancedGraphics.screenSpace.motionBlur'),
  spatialUpscaling: runtimeEvidence('src/rendering/filmic-grade-chain.ts', 'display-fsr1-easu-rcas-upscale', 'settings.graphics.spatialUpscaling + grade chain stage receipt'),
  // The receipt publishes BOTH numbers side by side - `resolutionTier` (what the
  // setting asked for) and `generatedCubeSize` (what the generator produced) -
  // because on the WebGPU route they are not the same thing: the equirect PMREM
  // path derives its cube size from the source panorama and takes no size
  // option, so the Ultra/High/Low steps do not currently change it. Publishing
  // the requested tier alone would be the same shape of claim the
  // environmentIntensity row below was making until 2026-08-31.
  reflectionQuality: runtimeEvidence(
    'src/graphics-refinement.ts', 'effectivePbrRoughness',
    'render.atomicSignal.advancedGraphics.arenaEnvironment.resolutionTier (requested) vs .generatedCubeSize (produced) + render.graphicsRefinement.reflectionScale',
  ),
  // THE ROW THAT LIED. It used to grep arena-environment-ibl.ts for the string
  // "scene.environmentIntensity" and call the hit runtime evidence. The string
  // was there; the assignment never ran on the first arena of any session, and
  // scene.environmentIntensity sat at its pristine 1 while this row reported
  // healthy. The evidence is now an observation: the gate reads
  // scene.environment and scene.environmentIntensity off the live scene and
  // fails the arena commit closed when the product does not match.
  environmentIntensity: runtimeEvidence(
    'src/rendering/arena-environment-ibl.ts', 'assertArenaEnvironmentLive',
    'render.atomicSignal.advancedGraphics.arenaEnvironment.environmentIntensity vs .expectedEnvironmentIntensity',
    'assertArenaEnvironmentLive (src/rendering/arena-environment-ibl.ts) - observed scene.environmentIntensity === budget x arenaEnvironmentScale x reflectionScale on every arena commit',
  ),
  volumetricQuality: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'const volumetricScale = THREE.MathUtils.clamp', 'render.atomicSignal.advancedGraphics.volumetricScale'),
  smokeQuality: runtimeEvidence('src/legacy-main.ts', 'smokeVolumePresentationPool.setQualityScale(graphicsRuntime.smokeScale)', 'settings.graphics.smokeScale + smoke presentation telemetry'),
  particleQuality: runtimeEvidence('src/legacy-main.ts', 'budget.particleDensityScale * graphicsRuntime.particleScale', 'settings.graphics.particleScale + render.graphicsRefinement.budget'),
  anisotropy: runtimeEvidence('src/graphics-refinement.ts', 'texture.anisotropy = anisotropy', 'render.graphicsRefinement.requestedAnisotropy'),
  decalQuality: runtimeEvidence('src/legacy-main.ts', 'budget.decalLifetimeScale * graphicsRuntime.decalScale', 'settings.graphics.decalScale + impact presentation budget'),
  bloomQuality: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'bloom(sceneColor, graphics.post.bloomStrength', 'render.atomicSignal.advancedGraphics.bloomStrength'),
  exposure: runtimeEvidence('src/legacy-main.ts', 'authoredExposure * graphicsRuntime.post.exposureScale', 'settings.graphics.post.exposureScale + renderer exposure'),
  toneMapping: runtimeEvidence('src/legacy-main.ts', 'graphicsRuntime.post.toneMapping', 'settings.graphics.post.toneMapping + documentElement.dataset.graphicsToneMapping'),
  filmicProfile: runtimeEvidence('src/legacy-main.ts', 'effectiveGradeProfileId', 'settings.graphics.filmicProfile + render.gradeProfileId'),
  sharpness: runtimeEvidence('src/rendering/filmic-grade-chain.ts', 'display-cas-sharpen', 'settings.graphics.sharpness + grade chain stage receipt'),
  // The linear-side grain uniform this used to probe was an ORPHAN - the scene
  // assembler kept writing it and no node ever read it - and the Lane L
  // streamline pass retired it. The value now reaches the picture through the
  // display-referred grade stage, so the probe follows the pixels: legacy-main
  // multiplies the arena's authored grain by this scale and pushes it into the
  // chain. Probing the retired uniform is what made this row fail closed.
  filmGrain: runtimeEvidence('src/legacy-main.ts', 'renderRuntime.setGradeGrainStrength', 'settings.graphics.post.filmGrainScale + per-frame-luminance-grain stage uniform'),
  vignette: runtimeEvidence('src/rendering/filmic-grade-chain.ts', 'setDisplayVignetteStrength', 'settings.graphics.vignette + display-vignette-falloff stage uniform'),
  weatherIntensity: runtimeEvidence('src/weather/weather-state.ts', 'presentationRung(available, presentation.ceilingState)', 'settings.graphics.weatherIntensity + sampleWeather().rain.weatherIntensity'),
  rainDensity: runtimeEvidence('src/weather/rain-presentation.ts', 'this.presentation.rainDensity', 'settings.graphics.rainDensity + sampleWeather().rain.streakInstances'),
  windStrength: runtimeEvidence('src/weather/weather-state.ts', '* presentation.windStrength', 'settings.graphics.windStrength + sampleWeather().rain.windSpeed'),
  lightning: runtimeEvidence('src/weather/rain-presentation.ts', 'RAIN_LIGHTNING.peakLightIntensity', 'settings.graphics.lightning + sampleWeather().rain.lightningFlash'),
  // The probe is the wetness the system WROTE and the surfaces it holds, not
  // the boolean it was handed - a row that reported its own input could not
  // tell 'the setting is on' from 'the materials actually changed'.
  wetSurfaces: runtimeEvidence('src/weather/rain-presentation.ts', 'this.applyWetness(this.presentation.wetSurfaces ? this.wetness : 0)', 'settings.graphics.wetSurfaces + sampleWeather().rain.wetSurfaces'),
  ambientLife: runtimeEvidence('src/particles/index.ts', 'this.densityScale * this.ambientLifeScale', 'settings.graphics.ambientLife + sampleWeather().particles.ambientLifeScale + .liveParticles'),
});

/**
 * What the renderer genuinely cannot do, after HF-364 turned the screen-space
 * stack on. The five rows that used to sit here for SSR, SSGI, depth of field,
 * motion blur and spatial upscaling are now real controls above; leaving their
 * notices in place would have been the same lie in the other direction.
 *
 * What remains is the real boundary: there is no hardware ray tracing and no
 * vendor-native temporal reconstruction in any browser, and no amount of
 * screen-space work turns into either of those.
 */
export const GRAPHICS_CAPABILITY_NOTICES: readonly GraphicsCapabilityNotice[] = Object.freeze([
  Object.freeze({
    id: 'path-tracing', category: 'lighting', label: 'Path tracing / hardware ray tracing', state: 'unavailable',
    reason: 'WebGPU exposes no ray-tracing pipeline, acceleration structures or ray queries in any shipping browser. Screen-space GI ray-marches the depth buffer instead, and is labelled as exactly that.',
    evidence: 'renderer capability gate',
  }),
  Object.freeze({
    id: 'ai-upscaling-frame-generation', category: 'display', label: 'AI upscaling / frame generation', state: 'unavailable',
    reason: 'DLSS, FSR frame generation and Ray Reconstruction are vendor-native driver technologies with no browser API. The available upscaler is AMD FSR 1, which is spatial and runs as an ordinary shader; it is offered under its own name in Spatial upscaling.',
    evidence: 'browser capability boundary',
  }),
]);

/**
 * Preset policy for the HF-364 screen-space stack.
 *
 * The previous policy left all six effects OFF in every preset as Custom-only
 * opt-ins. That was defensible as a shipping decision and indefensible as a
 * standing one: a feature that is off by default, unlabelled in a submenu and
 * never announced is, from the player's seat, identical to one that was never
 * built. Presets are the honest place to turn an effect up, because the
 * combat-safety bounds are enforced in the resolver and in the node graph
 * rather than in a preset's good manners:
 *
 * - Every lighting effect here composites with `+`. SSGI's occlusion buffer is
 *   discarded, so none of them can darken a pixel that renders today.
 * - Each additive tier's linear-HDR gain is clamped by the resolver and then
 *   re-checked by `assertScreenSpacePostCombatSafety`, which THROWS at graph
 *   construction and on every live push.
 * - Depth of field is proven sub-pixel across the whole combat midfield by
 *   `assertDepthOfFieldCombatSafety`, sampled at 64 points, at every strength.
 * - Motion blur's dead-zone gate is a node in the TSL graph and its screen
 *   offset is capped by the same fail-closed assertion.
 *
 * WHAT IS STILL TRUE, AND WHY THE TIERING IS NOT SYMMETRIC:
 *
 * 1. These passes exist only on the WebGPU route. The compatibility/WebGL2
 *    route resolves `SCREEN_SPACE_POST_DISABLED` and the stack is structurally
 *    absent, so any arena that falls back (farcrysis does today, HF-374) shows
 *    none of this whatever the preset says. That is a renderer fact, not a
 *    preset bug, and the preset must not pretend otherwise.
 * 2. No tier here has a MEASURED frame budget on representative hardware yet.
 *    That is the real remaining risk and it is a performance risk, not a
 *    combat-safety one. It is why `performance` stays untouched, why `high`
 *    (the auto-selected default on 8-core/8 GB machines) takes only the two
 *    cheapest additive effects, and why the expensive gather and the two
 *    pixel-replacing effects are confined to `max`, which the player chooses
 *    deliberately. Every preset that turns one on also keeps
 *    `adaptiveResolution` true, so `adaptScreenSpacePostForPressure` can demote
 *    high->low and halve the composite gain under sustained frame pressure.
 * 3. `spatialUpscaling` stays OFF in all three. It is the one control here with
 *    no combat-safety bound enforced anywhere in code — `resolveSpatialUpscaling`
 *    clamps nothing, because it is a performance/perceived-resolution trade
 *    rather than a light or motion effect. It also renders BELOW native, which
 *    is the opposite of what a quality preset is for. It stays a Custom opt-in.
 *
 * The exact shipped matrix is pinned in graphics-settings-registry.test.ts;
 * changing a value here without changing that table fails the suite.
 */
export const GRAPHICS_PRESET_VALUES: Readonly<Record<'performance' | 'balanced' | 'high' | 'max', AdvancedGraphicsValues>> = Object.freeze({
  // PERFORMANCE — deliberately untouched. This is the compatibility-forced and
  // low-spec preset; nothing in the screen-space stack runs here at all.
  performance: Object.freeze({
    renderScale: 0.75, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'off', geometryDetail: 'reduced', shadows: 'off', shadowResolution: 'medium', shadowUpdateMode: 'static',
    shadowFilter: 'auto', indirectLighting: 'low', bakedIndirect: 'off', ambientOcclusion: 'off',
    screenSpaceReflections: 'off', screenSpaceGi: 'off', rayTracing: 'off', reflectionQuality: 'low',
    environmentIntensity: 1, volumetricQuality: 'low', volumetricLightShafts: 'off', smokeQuality: 'low',
    particleQuality: 'low', anisotropy: 4, decalQuality: 'low', bloomQuality: 'subtle',
    exposure: 1, toneMapping: 'aces', filmicProfile: 'arena-default', sharpness: 0, filmGrain: 0.1, vignette: 0.08,
    depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
    // Weather is the one family where the low-spec preset caps the CEILING as
    // well as the density: the streak count is the cost, but a storm is also
    // the state that leans hardest on fill rate on the machines this preset
    // exists for. Lightning is off here for the same reason it is the only
    // weather row that is a toggle - it is the one a player may not want.
    weatherIntensity: 'light', rainDensity: 0.5, windStrength: 1, lightning: false,
    // Wet surfaces are two material writes per adopted surface on a 2.5 s
    // scan, so they survive the low-spec preset; the air is thinned instead
    // because ambient instances are per-frame fill rate.
    wetSurfaces: true, ambientLife: 0.6,
  }),
  // ===================================================================
  // BALANCED — HF-418. The rung between Performance and Quality.
  // ===================================================================
  //
  // Owner, 2026-09-02 19:10, verbatim: "maybe make a new balanced profile that
  // doesnt look shit like performance but will run nice and look good?"
  //
  // HOW IT WAS DERIVED, AND WHY THESE CONTROLS AND NOT OTHERS. The HF-414
  // audit measured Performance, Quality, Ray Traced and Max cold and in a
  // settled match at 2560x1440 on the owner's RTX 5080
  // (docs/GRAPHICS_PROFILES_2026-09-03.md, evidence under
  // docs/evidence/pass87/graphics-profiles/). Balanced takes the controls that
  // carry most of what a player reads as "it looks good" for the least frame
  // cost, and refuses the ones whose cost is a new render target, a new MRT
  // attachment or a new raymarch:
  //
  //   TAKEN FROM QUALITY (cheap, and the whole reason Performance looks poor)
  //     renderScale 1.00   Performance renders at 0.75 and upsamples. That is
  //                        the single largest reason it "looks shit": every
  //                        edge in the frame is reconstructed. Native
  //                        resolution costs fill rate and nothing else - no
  //                        new pass, no new target, no new pipeline.
  //     geometryDetail full  Restores the authored representation. This is a
  //                        streaming/vertex cost, not a per-pixel one.
  //     shadows HIGH       A shadowed scene reads as lit; an unshadowed one
  //                        reads as flat. This is the biggest single look win
  //                        in the ladder.
  //     indirectLighting HIGH  A scalar on the environment contribution
  //                        (lightingScale in pass65-settings.ts). It changes a
  //                        uniform, not the graph.
  //     reflectionQuality HIGH  The baked PMREM probe tier. Load-time cost,
  //                        zero per-frame cost.
  //     bloomQuality CINEMATIC  Already-built stage, different uniforms.
  //     anisotropy 8       Sampler state. Free at this resolution.
  //     particle/decal/smoke HIGH  Capacity ceilings the arenas were authored
  //                        against. Smoke in particular is gameplay-visible
  //                        and must not read differently from Quality.
  //
  //   DELIBERATELY NOT TAKEN (each one buys a new per-frame structure)
  //     MSAA 4x -> SMAA    A 4-sample principal HDR target multiplies pipeline
  //                        variants and bandwidth across every material in the
  //                        arena. The RAY TRACED preset's own notes call this
  //                        trade "the single biggest saving" in the ladder, and
  //                        the same argument applies here with nothing bought
  //                        in exchange. SMAA is one display-side post stage.
  //     SSR OFF            Quality's screen-space reflections add the normal
  //                        and material MRT attachments; the registry's own
  //                        Quality note names that as its main new cost.
  //     Sun shafts OFF     A 24-step raymarch of the sun shadow map per pixel.
  //     shadowResolution MEDIUM  1024 rather than 2048 (see resolveGraphicsRuntime).
  //                        Quarter the shadow-map fill for a softness
  //                        difference that is invisible at engagement range on
  //                        the static update mode both profiles use.
  //     AO / SSGI / DoF / motion blur / ray tracing  all off, as on Quality or
  //                        below it. Nothing here replaces or gathers pixels.
  //
  //   BETWEEN THE TWO
  //     Rain at 0.75 of the authored density with the ceiling left open, and
  //     the air at 0.8. Rain is pure fill rate and it is the one family a
  //     mid-range machine feels immediately; the CEILING is not the cost, the
  //     instance count is, so Balanced thins the count rather than hiding the
  //     storm state Performance caps away.
  //     Grain and vignette sit between the two profiles' authored values.
  //
  // TODO(HF-418 item 4, Lane AL): the lighting-feature controls Lane AL is
  // building - baked indirect, SSR tiers, AO tiers, contact shadows, each with
  // a measured cost and a per-profile default - had not landed when this
  // profile was authored. When they do, BALANCED is the profile whose defaults
  // have to be argued first: it is the rung where "beautiful lighting that
  // wont murder FPS" (owner, 19:10) is actually decided, and its current
  // lighting position is deliberately conservative (indirect HIGH, everything
  // screen-space OFF) precisely so that adding a cheap baked tier is a clear
  // improvement rather than a swap. The control-set hash in
  // graphics-profile-contract.test.ts will fail the moment that edit lands,
  // which is the intended tripwire: the audit doc must be re-measured with it.
  // PASS 89 INTEGRATION. Lane AI authored BALANCED before Lane AL's
  // `bakedIndirect` control existed, and left a TODO above saying BALANCED is
  // the rung whose baked-indirect default has to be argued first. Argued here:
  // LOW, the same tier QUALITY takes.
  //   * It is not a per-frame cost. Lane AL pins that LOW and HIGH differ only
  //     in BAKE cost, never in per-frame cost
  //     (src/rendering/lighting/baked-indirect.test.ts, "LOW and HIGH differ
  //     only in BAKE cost"), and the bake itself is chunked under a 3 ms
  //     per-frame wall-clock bound that is now enforced per RAY.
  //   * BALANCED's whole argument is "QUALITY's look without the passes that
  //     cost the most per frame". A baked volume is exactly that: an offline
  //     cost that buys bounce light. Taking OFF here would have made the rung
  //     darker than the one below it once QUALITY got the volume.
  //   * HIGH is not taken: it is the RAY TRACED / MAX bake, and its extra cost
  //     is bake time on a machine that by definition has less of it to spare.
  balanced: Object.freeze({
    renderScale: 1, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'smaa', geometryDetail: 'full', shadows: 'high', shadowResolution: 'medium', shadowUpdateMode: 'static',
    shadowFilter: 'auto', indirectLighting: 'high', bakedIndirect: 'low', ambientOcclusion: 'off',
    screenSpaceReflections: 'off', screenSpaceGi: 'off', rayTracing: 'off', reflectionQuality: 'high',
    environmentIntensity: 1, volumetricQuality: 'high', volumetricLightShafts: 'off', smokeQuality: 'high',
    particleQuality: 'high', anisotropy: 8, decalQuality: 'high', bloomQuality: 'cinematic',
    exposure: 1, toneMapping: 'aces', filmicProfile: 'arena-default', sharpness: 0, filmGrain: 0.24, vignette: 0.14,
    depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
    weatherIntensity: 'storm', rainDensity: 0.75, windStrength: 1, lightning: true,
    wetSurfaces: true, ambientLife: 0.8,
  }),
  // QUALITY — the auto-selected default on 8-core/8 GB machines. Since HF-438
  // it also carries the retired RAY TRACED rung's trace at the LIGHT tier, on
  // top of the two cheapest additive effects it already took at their LOW tier:
  //   Sun shafts LOW  — 24 raymarch steps at 0.35 scale, gain 0.14 of a ceiling
  //                     of 0.22. No extra MRT attachment; `shadows` is already
  //                     'high' here, which is the effect's one hard dependency.
  //   SSR LOW         — half-resolution march, 6 m reach, intensity 0.5 of a
  //                     ceiling of 0.75. This one DOES add the normal and
  //                     material MRT attachments; the adaptive valve is the
  //                     recovery path.
  //   Trace REFLECTIONS (HF-438, light tier) — world-space Whitted reflection
  //                     rays against the arena's analytic proxy set, with hard
  //                     shadow rays inside the reflected image. The layer is
  //                     additive and double-clamped (absolute linear-HDR
  //                     ceiling 0.20, and at most 6% of each pixel's own
  //                     luminance); players, bots and vehicles are not in the
  //                     traced set, so no reflection can show an enemy the
  //                     baseline preset could not. MSAA 4x and SSR LOW are
  //                     both KEPT: the owner asked for ray tracing baked INTO
  //                     the profile, not a trade away from it.
  //   AO HIGH (HF-438, light tier) — GTAO at the lower sample count: 0.5
  //                     resolution scale, 12 samples, spatial denoise. This is
  //                     the retired rung's own AO tier and the largest
  //                     per-frame addition of the fold.
  // SSGI, depth of field and motion blur stay off here: the first is the
  // expensive gather, the other two are the ones that replace pixels. All three
  // belong to a preset the player picks on purpose.
  high: Object.freeze({
    renderScale: 1, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high', shadowResolution: 'high', shadowUpdateMode: 'static',
    shadowFilter: 'auto', indirectLighting: 'high', bakedIndirect: 'low', ambientOcclusion: 'high',
    screenSpaceReflections: 'low', screenSpaceGi: 'off', rayTracing: 'reflections', reflectionQuality: 'high',
    environmentIntensity: 1, volumetricQuality: 'high', volumetricLightShafts: 'low', smokeQuality: 'high',
    particleQuality: 'high', anisotropy: 8, decalQuality: 'high', bloomQuality: 'cinematic',
    exposure: 1, toneMapping: 'aces', filmicProfile: 'arena-default', sharpness: 0, filmGrain: 0.32, vignette: 0.16,
    depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
    // Uncapped weather at the authored density. The ceiling is not a
    // performance dial - the instance count is - so there is no reason for the
    // default preset to hide a state the arenas were authored to reach.
    weatherIntensity: 'storm', rainDensity: 1, windStrength: 1, lightning: true,
    wetSurfaces: true, ambientLife: 1,
  }),
  // HF-438 (owner 2026-09-03, verbatim: "I don't think we should have a ray
  // tracing AND an RTX mode"). The RAY TRACED preset is RETIRED as a rung: its
  // ray-traced reflection stage lives in QUALITY at the light tier and here at
  // the FULL tier; BALANCED and PERFORMANCE take none of it. The RTX menu entry
  // remains the native-runtime explainer — it was never a preset and changes no
  // renderer value. Refractions stay a deliberate Custom opt-in.
  max: Object.freeze({
    // Max deliberately selects the highest supported values, but it must stay as
    // rock solid as Quality and Performance. Adaptive resolution is a distress
    // valve rather than a quality reduction: with it disabled a 1.25x supersample
    // on top of MSAA 4x had no way to recover, stalling match admission into a
    // load failure. Keep the supersample slightly lower and leave the valve on.
    //
    // This is the preset that has to actually LOOK like the top preset, so the
    // whole additive stack runs at its highest tier and both pixel-replacing
    // effects are on at a bounded value. Since HF-438 it also carries the
    // ray-traced reflection stage at the FULL tier:
    //   Trace REFLECTIONS (HF-438, full tier) — the same combat-clamped
    //                     world-space trace QUALITY carries, riding on top of
    //                     the full stack (ultra AO, ultra PMREM probes, high
    //                     SSGI). Its pipelines are compiled with the rest of
    //                     this preset's at admission; the audit tripwire
    //                     requires zero pipelines compiled in combat.
    //   Sun shafts HIGH — 48 steps at 0.5 scale, gain 0.22, i.e. exactly the
    //                     GODRAY_MAXIMUM_ADDITIVE_GAIN ceiling.
    //   SSR HIGH        — 0.75-scale march, 12 m reach, binary refine,
    //                     intensity 0.70 of the 0.75 ceiling.
    //   SSGI HIGH       — 2 slices x 12 steps, 8 m room-scale gather, bounce
    //                     gain 4.0 of the 4.5 ceiling, spatial denoise on.
    //   Depth of field  — ON at 0.60. Worst-case midfield blur radius is
    //                     0.277 px against the 0.5 px ceiling, so the whole
    //                     engagement band is still arithmetically sharp while
    //                     the sky and far horizon visibly soften.
    //   Motion blur     — 0.35, a deliberately low setting for the one effect
    //                     that removes information. Max screen offset is 0.875%
    //                     of the frame (0.025 x 0.35) and the dead-zone gate
    //                     means slow aim adjustment smears by exactly zero.
    // Spatial upscaling stays OFF: it renders below native, which contradicts a
    // 1.15x supersample, and it is the one control with no enforced bound.
    renderScale: 1.15, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high', shadowResolution: 'high', shadowUpdateMode: 'dynamic',
    shadowFilter: 'auto', indirectLighting: 'high', bakedIndirect: 'high', ambientOcclusion: 'ultra',
    screenSpaceReflections: 'high', screenSpaceGi: 'high', rayTracing: 'reflections', reflectionQuality: 'ultra',
    environmentIntensity: 1, volumetricQuality: 'ultra', volumetricLightShafts: 'high', smokeQuality: 'ultra',
    particleQuality: 'ultra', anisotropy: 16, decalQuality: 'ultra', bloomQuality: 'cinematic',
    exposure: 1, toneMapping: 'aces', filmicProfile: 'arena-default', sharpness: 0, filmGrain: 0.4, vignette: 0.18,
    depthOfField: true, depthOfFieldStrength: 0.6, motionBlur: 0.35, spatialUpscaling: 'off',
    // Max pushes density to 1.35x the authored figure and leaves the ceiling
    // open. Even at 1.5x the whole volume removes under 3% of the light along
    // a sightline (rain-presentation.ts -> rainSightlineObscuration), and the
    // ADS aim-cylinder clearance is unconditional at every setting.
    weatherIntensity: 'storm', rainDensity: 1.35, windStrength: 1, lightning: true,
    // Ambient instances are bounded by the family capacity at the ULTRA tier
    // this preset already selects, so 1.5x asks the arena profiles for more
    // of a ceiling that is already paid for rather than raising the ceiling.
    wetSurfaces: true, ambientLife: 1.5,
  }),
});

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeAdvancedGraphicsValues(
  value: unknown,
  fallback: AdvancedGraphicsValues = GRAPHICS_PRESET_VALUES.high,
): AdvancedGraphicsValues {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const normalized: Record<string, unknown> = {};
  for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
    const candidate = raw[definition.key];
    const fallbackValue = fallback[definition.key];
    if (definition.kind === 'toggle') {
      normalized[definition.key] = typeof candidate === 'boolean' ? candidate : fallbackValue;
      continue;
    }
    if (definition.kind === 'range') {
      const numeric = finiteNumber(candidate, fallbackValue as number);
      if (definition.unlimitedSentinel !== undefined && numeric === 0) {
        normalized[definition.key] = 0;
        continue;
      }
      const bounded = clamp(numeric, definition.minimum, definition.maximum);
      const stepped = definition.step >= 1
        ? Math.round(bounded / definition.step) * definition.step
        : Number((Math.round(bounded / definition.step) * definition.step).toFixed(4));
      normalized[definition.key] = definition.unlimitedSentinel !== undefined && stepped >= definition.unlimitedSentinel
        ? 0
        : stepped;
      continue;
    }
    const allowed = new Set(definition.options.map(({ value: option }) => option));
    const serialized = String(candidate ?? fallbackValue);
    const accepted = allowed.has(serialized) ? serialized : String(fallbackValue);
    normalized[definition.key] = definition.key === 'anisotropy' ? Number(accepted) : accepted;
  }
  return Object.freeze(normalized) as AdvancedGraphicsValues;
}

export function validateAdvancedGraphicsRegistry(): readonly string[] {
  const issues: string[] = [];
  const keys = ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key);
  const ids = ADVANCED_GRAPHICS_CONTROLS.map(({ id }) => id);
  if (new Set(keys).size !== keys.length) issues.push('duplicate-key');
  if (new Set(ids).size !== ids.length) issues.push('duplicate-dom-id');
  const expectedKeys = Object.keys(GRAPHICS_PRESET_VALUES.high).sort();
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(expectedKeys)) issues.push('preset-registry-key-drift');
  if (JSON.stringify(Object.keys(ADVANCED_GRAPHICS_RUNTIME_EVIDENCE).sort()) !== JSON.stringify(expectedKeys)) {
    issues.push('runtime-evidence-key-drift');
  }
  for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
    if (Object.keys(preset).length !== keys.length) issues.push('incomplete-preset');
    if (JSON.stringify(normalizeAdvancedGraphicsValues(preset, preset)) !== JSON.stringify(preset)) issues.push('noncanonical-preset');
  }
  for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
    if (!definition.runtimeConsumer || !definition.description
      || !['live', 'pipeline-rebuild', 'arena-reload'].includes(definition.applyMode)) {
      issues.push(`incomplete-control:${definition.key}`);
    }
    const probes = ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key] ?? [];
    if (probes.length === 0) {
      issues.push(`missing-runtime-evidence:${definition.key}`);
    }
    // A live observation has to name something; an empty string would let a row
    // claim the strong form of evidence while carrying the weak one.
    for (const probe of probes) {
      if (probe.liveObservation !== undefined && probe.liveObservation.trim().length < 24) {
        issues.push(`empty-live-observation:${definition.key}`);
      }
    }
  }
  return Object.freeze(issues);
}
