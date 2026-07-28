export type AntiAliasingMode = 'off' | 'msaa-2x' | 'msaa-4x';
export type ShadowResolution = 'medium' | 'high';
export type ShadowUpdateMode = 'static' | 'dynamic';
export type QualityTier = 'low' | 'high' | 'ultra';
export type LightingTier = 'off' | 'low' | 'high';
export type AmbientOcclusionQuality = 'off' | 'low' | 'high' | 'ultra';
export type BloomQuality = 'off' | 'subtle' | 'cinematic';
export type ToneMappingMode = 'aces' | 'agx' | 'neutral';
export type GeometryDetail = 'reduced' | 'full';

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
  indirectLighting: LightingTier;
  ambientOcclusion: AmbientOcclusionQuality;
  reflectionQuality: LightingTier;
  volumetricQuality: QualityTier;
  anisotropy: 1 | 2 | 4 | 8 | 16;
  particleQuality: QualityTier;
  decalQuality: QualityTier;
  smokeQuality: QualityTier;
  bloomQuality: BloomQuality;
  exposure: number;
  toneMapping: ToneMappingMode;
  filmGrain: number;
  vignette: number;
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
  | 'material-refinement'
  | 'atmosphere-runtime'
  | 'presentation-budget'
  | 'smoke-presentation'
  | 'hdr-pipeline';

export type GraphicsRuntimeEvidence = Readonly<{
  path: string;
  symbol: string;
  telemetryPath: string;
}>;

export type GraphicsSelectOption = Readonly<{ value: string; label: string }>;

type GraphicsControlBase = Readonly<{
  key: GraphicsAdvancedKey;
  id: `graphics-${string}`;
  category: GraphicsSettingCategory;
  label: string;
  description: string;
  applyMode: 'arena-reload';
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
    applyMode: 'arena-reload', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'adaptiveResolution', id: 'graphics-adaptive', category: 'display', label: 'Adaptive quality',
    description: 'Changes presentation budgets after sustained frame-time pressure; gameplay authority is unchanged.',
    kind: 'toggle', applyMode: 'arena-reload', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'targetFps', id: 'graphics-target-fps', category: 'display', label: 'Adaptive target',
    description: 'Target used by the adaptive workload controller. It is not the output frame limiter.',
    kind: 'range', minimum: 30, maximum: 360, step: 1, unit: 'fps',
    applyMode: 'arena-reload', runtimeConsumer: 'adaptive-quality',
  }),
  control({
    key: 'frameRateLimit', id: 'graphics-frame-rate-limit', category: 'display', label: 'Maximum FPS',
    description: 'Bounds presentation work without changing the fixed-step simulation. The final slider position is uncapped.',
    kind: 'range', minimum: 30, maximum: 361, step: 1, unit: 'fps', unlimitedSentinel: 361,
    applyMode: 'arena-reload', runtimeConsumer: 'frame-scheduler',
  }),
  control({
    key: 'antiAliasing', id: 'graphics-anti-aliasing', category: 'display', label: 'Anti-aliasing',
    description: 'Multisampling on the principal HDR scene target, not merely the canvas.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['msaa-2x', 'MSAA 2X'], ['msaa-4x', 'MSAA 4X']),
    applyMode: 'arena-reload', runtimeConsumer: 'renderer-init',
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
    applyMode: 'arena-reload', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'shadowResolution', id: 'graphics-shadow-resolution', category: 'lighting', label: 'Shadow resolution',
    description: 'Selects a bounded 1024 or arena-authored 2048 shadow map.',
    kind: 'select', options: selectOptions(['medium', 'MEDIUM'], ['high', 'HIGH']),
    applyMode: 'arena-reload', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'shadowUpdateMode', id: 'graphics-shadow-update', category: 'lighting', label: 'Shadow updates',
    description: 'Static refreshes on material scene changes; Dynamic refreshes every presented frame.',
    kind: 'select', options: selectOptions(['static', 'STATIC'], ['dynamic', 'DYNAMIC']),
    applyMode: 'arena-reload', runtimeConsumer: 'shadow-runtime',
  }),
  control({
    key: 'indirectLighting', id: 'graphics-indirect-lighting', category: 'lighting', label: 'Indirect light',
    description: 'Scales arena hemisphere and ambient bounce approximations without inventing path tracing.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'arena-reload', runtimeConsumer: 'arena-lighting',
  }),
  control({
    key: 'ambientOcclusion', id: 'graphics-ambient-occlusion', category: 'lighting', label: 'Contact shadows (GTAO)',
    description: 'Adds bounded WebGPU ground-truth ambient occlusion from the scene depth buffer. Higher tiers increase samples and resolution.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'arena-reload', runtimeConsumer: 'ambient-occlusion',
  }),
  control({
    key: 'reflectionQuality', id: 'graphics-reflections', category: 'lighting', label: 'Specular response',
    description: 'Scales bounded PBR environment/specular response on authored materials.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['low', 'LOW'], ['high', 'HIGH']),
    applyMode: 'arena-reload', runtimeConsumer: 'material-refinement',
  }),
  control({
    key: 'volumetricQuality', id: 'graphics-volumetrics', category: 'atmosphere', label: 'Volumetrics',
    description: 'Controls ambient mist, smoke stacks and deterministic dust density. Gameplay smoke remains visible at every tier.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'arena-reload', runtimeConsumer: 'atmosphere-runtime',
  }),
  control({
    key: 'smokeQuality', id: 'graphics-smoke-quality', category: 'atmosphere', label: 'Smoke presentation',
    description: 'Changes cards and opacity detail while keeping the same authoritative smoke volume and lifetime.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'arena-reload', runtimeConsumer: 'smoke-presentation',
  }),
  control({
    key: 'particleQuality', id: 'graphics-particles', category: 'atmosphere', label: 'Particles',
    description: 'Scales bounded impact and environmental particles from prewarmed pools.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'arena-reload', runtimeConsumer: 'presentation-budget',
  }),
  control({
    key: 'anisotropy', id: 'graphics-anisotropy', category: 'materials', label: 'Texture filtering',
    description: 'Maximum anisotropic filtering, clamped to the active GPU capability.',
    kind: 'select', options: selectOptions(['1', '1X'], ['2', '2X'], ['4', '4X'], ['8', '8X'], ['16', '16X']),
    applyMode: 'arena-reload', runtimeConsumer: 'material-refinement',
  }),
  control({
    key: 'decalQuality', id: 'graphics-decals', category: 'materials', label: 'Impact decals',
    description: 'Scales the bounded persistent-mark capacity and lifetime on collision surfaces.',
    kind: 'select', options: selectOptions(['low', 'LOW'], ['high', 'HIGH'], ['ultra', 'ULTRA']),
    applyMode: 'arena-reload', runtimeConsumer: 'presentation-budget',
  }),
  control({
    key: 'bloomQuality', id: 'graphics-bloom', category: 'post', label: 'Depth-aware bloom',
    description: 'Controls the TSL HDR bloom strength while retaining the scene-depth edge guard.',
    kind: 'select', options: selectOptions(['off', 'OFF'], ['subtle', 'SUBTLE'], ['cinematic', 'CINEMATIC']),
    applyMode: 'arena-reload', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'exposure', id: 'graphics-exposure', category: 'post', label: 'Exposure',
    description: 'Multiplies the calibrated per-arena exposure inside the renderer output pipeline.',
    kind: 'range', minimum: 0.75, maximum: 1.25, step: 0.05, unit: 'multiplier',
    applyMode: 'arena-reload', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'toneMapping', id: 'graphics-tone-mapping', category: 'post', label: 'Tone mapping',
    description: 'Selects a supported renderer output transform; deterministic review receipts record the effective mode.',
    kind: 'select', options: selectOptions(['aces', 'ACES FILMIC'], ['agx', 'AGX'], ['neutral', 'NEUTRAL']),
    applyMode: 'arena-reload', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'filmGrain', id: 'graphics-film-grain', category: 'post', label: 'Film grain',
    description: 'Scales deterministic TSL grain; zero disables it.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.01, unit: 'percent',
    applyMode: 'arena-reload', runtimeConsumer: 'hdr-pipeline',
  }),
  control({
    key: 'vignette', id: 'graphics-vignette', category: 'post', label: 'Vignette',
    description: 'Applies a bounded TSL edge falloff after bloom and grading; zero disables it.',
    kind: 'range', minimum: 0, maximum: 1, step: 0.01, unit: 'percent',
    applyMode: 'arena-reload', runtimeConsumer: 'hdr-pipeline',
  }),
]);

const runtimeEvidence = (
  path: string,
  symbol: string,
  telemetryPath: string,
): readonly GraphicsRuntimeEvidence[] => Object.freeze([Object.freeze({ path, symbol, telemetryPath })]);

/**
 * Fail-closed source and telemetry trace for every player-visible control.
 * Registry tests verify every path/symbol and reject missing or extra keys.
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
  indirectLighting: runtimeEvidence('src/legacy-main.ts', 'graphicsRuntime.indirectLightScale', 'settings.graphics.indirectLightScale + render.lighting'),
  ambientOcclusion: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'ao(sceneDepth, sceneNormal, camera)', 'render.atomicSignal.advancedGraphics.ambientOcclusion'),
  reflectionQuality: runtimeEvidence('src/graphics-refinement.ts', 'effectivePbrRoughness', 'render.graphicsRefinement.reflectionScale'),
  volumetricQuality: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'const volumetricScale = THREE.MathUtils.clamp', 'render.atomicSignal.advancedGraphics.volumetricScale'),
  smokeQuality: runtimeEvidence('src/legacy-main.ts', 'smokeVolumePresentationPool.setQualityScale(graphicsRuntime.smokeScale)', 'settings.graphics.smokeScale + smoke presentation telemetry'),
  particleQuality: runtimeEvidence('src/legacy-main.ts', 'budget.particleDensityScale * graphicsRuntime.particleScale', 'settings.graphics.particleScale + render.graphicsRefinement.budget'),
  anisotropy: runtimeEvidence('src/graphics-refinement.ts', 'texture.anisotropy = anisotropy', 'render.graphicsRefinement.requestedAnisotropy'),
  decalQuality: runtimeEvidence('src/legacy-main.ts', 'budget.decalLifetimeScale * graphicsRuntime.decalScale', 'settings.graphics.decalScale + impact presentation budget'),
  bloomQuality: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'bloom(sceneColor, graphics.post.bloomStrength', 'render.atomicSignal.advancedGraphics.bloomStrength'),
  exposure: runtimeEvidence('src/legacy-main.ts', 'authoredExposure * graphicsRuntime.post.exposureScale', 'settings.graphics.post.exposureScale + renderer exposure'),
  toneMapping: runtimeEvidence('src/legacy-main.ts', 'graphicsRuntime.post.toneMapping', 'settings.graphics.post.toneMapping + documentElement.dataset.graphicsToneMapping'),
  filmGrain: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'graphics.post.filmGrainScale', 'render.atomicSignal.advancedGraphics.filmGrainScale'),
  vignette: runtimeEvidence('src/rendering/pass64-tsl-scene.ts', 'const vignette = uniform(graphics.post.vignetteStrength)', 'render.atomicSignal.advancedGraphics.vignetteStrength'),
});

export const GRAPHICS_CAPABILITY_NOTICES: readonly GraphicsCapabilityNotice[] = Object.freeze([
  Object.freeze({
    id: 'path-tracing', category: 'lighting', label: 'Path tracing / hardware ray tracing', state: 'unavailable',
    reason: 'This Three.js WebGPU build has no hardware ray-tracing acceleration-structure path. Raster lighting is labelled honestly.',
    evidence: 'renderer capability gate',
  }),
  Object.freeze({
    id: 'screen-space-gi', category: 'lighting', label: 'Screen-space global illumination', state: 'unavailable',
    reason: 'Three r185 exposes an experimental SSGI node, but this arena has not passed its normal/depth, temporal, disposal and frame-budget gates.',
    evidence: 'WebGPU post gate pending',
  }),
  Object.freeze({
    id: 'screen-space-reflections', category: 'lighting', label: 'Screen-space reflections', state: 'unavailable',
    reason: 'The SSR node is available upstream, but the arena lacks a verified material MRT and occlusion/disposal receipt.',
    evidence: 'WebGPU post gate pending',
  }),
  Object.freeze({
    id: 'depth-of-field', category: 'post', label: 'Depth of field', state: 'unavailable',
    reason: 'Disabled for live first-person play until weapon-layer depth, focus transitions and accessibility behavior pass review.',
    evidence: 'viewmodel depth contract pending',
  }),
  Object.freeze({
    id: 'motion-blur', category: 'post', label: 'Motion blur', state: 'unavailable',
    reason: 'The active scene pass does not yet own a verified velocity MRT, so this cannot be exposed as a working control.',
    evidence: 'velocity MRT pending',
  }),
  Object.freeze({
    id: 'ai-upscaling-frame-generation', category: 'display', label: 'AI upscaling / frame generation', state: 'unavailable',
    reason: 'DLSS, Ray Reconstruction and frame generation are native vendor technologies and are not available to this browser renderer.',
    evidence: 'browser capability boundary',
  }),
]);

export const GRAPHICS_PRESET_VALUES: Readonly<Record<'performance' | 'high' | 'max', AdvancedGraphicsValues>> = Object.freeze({
  performance: Object.freeze({
    renderScale: 0.75, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'off', geometryDetail: 'reduced', shadows: 'off', shadowResolution: 'medium', shadowUpdateMode: 'static',
    indirectLighting: 'low', ambientOcclusion: 'off', reflectionQuality: 'low', volumetricQuality: 'low', smokeQuality: 'low',
    particleQuality: 'low', anisotropy: 4, decalQuality: 'low', bloomQuality: 'subtle',
    exposure: 1, toneMapping: 'aces', filmGrain: 0.1, vignette: 0.08,
  }),
  high: Object.freeze({
    renderScale: 1, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high', shadowResolution: 'high', shadowUpdateMode: 'static',
    indirectLighting: 'high', ambientOcclusion: 'off', reflectionQuality: 'high', volumetricQuality: 'high', smokeQuality: 'high',
    particleQuality: 'high', anisotropy: 8, decalQuality: 'high', bloomQuality: 'cinematic',
    exposure: 1, toneMapping: 'aces', filmGrain: 0.32, vignette: 0.16,
  }),
  max: Object.freeze({
    renderScale: 1.25, adaptiveResolution: false, targetFps: 240, frameRateLimit: 0,
    antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high', shadowResolution: 'high', shadowUpdateMode: 'dynamic',
    indirectLighting: 'high', ambientOcclusion: 'ultra', reflectionQuality: 'high', volumetricQuality: 'ultra', smokeQuality: 'ultra',
    particleQuality: 'ultra', anisotropy: 16, decalQuality: 'ultra', bloomQuality: 'cinematic',
    exposure: 1, toneMapping: 'aces', filmGrain: 0.4, vignette: 0.18,
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
    if (!definition.runtimeConsumer || !definition.description || definition.applyMode !== 'arena-reload') {
      issues.push(`incomplete-control:${definition.key}`);
    }
    if ((ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key]?.length ?? 0) === 0) {
      issues.push(`missing-runtime-evidence:${definition.key}`);
    }
  }
  return Object.freeze(issues);
}
