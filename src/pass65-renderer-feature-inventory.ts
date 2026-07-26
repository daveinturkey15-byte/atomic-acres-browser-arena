import { graphicsEffectsBudget } from './graphics-refinement';
import { normalizePass65Settings, resolveGraphicsRuntime, type GraphicsPreset } from './pass65-settings';
import { PASS65_SETTING_DEFINITIONS } from './pass65-settings-inventory';
import { renderProfileConfig } from './render-profile';
import { TSL_MIGRATION_INVENTORY } from './rendering/tsl-migration-inventory';

export type RendererFeatureControlKind = 'setting' | 'preset' | 'fixed' | 'unsupported';

export type RendererFeatureControl = Readonly<{
  kind: RendererFeatureControlKind;
  settingKeys: readonly string[];
  effectiveValue: string;
  rationale: string;
}>;

export type RendererFeatureSourceProbe = Readonly<{
  path: string;
  symbol: string;
}>;

export type RendererFeatureDefinition = Readonly<{
  id: string;
  title: string;
  availability: 'active' | 'unsupported';
  owner: string;
  sourceProbes: readonly RendererFeatureSourceProbe[];
  pipelineIds: readonly string[];
  control: RendererFeatureControl;
  budget: string;
  verifier: string;
  authorityAffecting: false;
}>;

function control(
  kind: RendererFeatureControlKind,
  settingKeys: readonly string[],
  effectiveValue: string,
  rationale: string,
): RendererFeatureControl {
  return Object.freeze({ kind, settingKeys: Object.freeze([...settingKeys]), effectiveValue, rationale });
}

function feature(definition: Omit<RendererFeatureDefinition, 'authorityAffecting'>): RendererFeatureDefinition {
  return Object.freeze({
    ...definition,
    sourceProbes: Object.freeze([...definition.sourceProbes]),
    pipelineIds: Object.freeze([...definition.pipelineIds]),
    authorityAffecting: false,
  });
}

export const PASS65_RENDERER_FEATURES: readonly RendererFeatureDefinition[] = Object.freeze([
  feature({
    id: 'required-webgpu-backend', title: 'Required WebGPU backend', availability: 'active', owner: 'src/rendering/render-runtime.ts',
    sourceProbes: [{ path: 'src/rendering/render-runtime.ts', symbol: 'class WebGpuRenderRuntime' }], pipelineIds: [],
    control: control('fixed', [], 'WebGPU required; WebGL2 is an explicit compatibility route', 'Backend choice is a release route, not an in-match graphics option. The candidate fails closed instead of silently falling back.'),
    budget: 'Zero device loss, uncaptured GPU errors, completion failures, or presentation stalls.',
    verifier: 'scripts/qa/verify-pass65-webgpu-endurance.mjs',
  }),
  feature({
    id: 'render-resolution', title: 'Render scale and adaptive resolution', availability: 'active', owner: 'src/pass65-settings.ts + src/adaptive-quality.ts',
    sourceProbes: [
      { path: 'src/pass65-settings.ts', symbol: 'resolveGraphicsRuntime' },
      { path: 'src/adaptive-quality.ts', symbol: 'class AdaptiveQualityController' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.renderScale', 'graphics.adaptiveResolution', 'graphics.targetFps'], '50-100% effective WebGPU scale; target FPS drives adaptive-budget selection', 'Requested scale up to 200% is retained in storage but the current renderer generation truthfully reports a 100% safety cap. Target FPS is not a frame limiter.'),
    budget: 'Profile-specific bounded DPR tiers with sustained-p95 downshift and cooldown-controlled recovery.',
    verifier: 'src/pass65-settings.test.ts + src/adaptive-quality.test.ts',
  }),
  feature({
    id: 'presentation-profile', title: 'Performance, High, Max and Custom presentation profiles', availability: 'active', owner: 'src/pass65-settings.ts + src/render-profile.ts',
    sourceProbes: [
      { path: 'src/pass65-settings.ts', symbol: "export type GraphicsPreset = 'performance' | 'high' | 'max' | 'custom'" },
      { path: 'src/render-profile.ts', symbol: 'renderProfileConfig' },
    ], pipelineIds: [],
    control: control('preset', ['graphics.preset'], 'Performance uses reduced presentation; High and Max use authored Blender presentation; Max disables adaptive resolution', 'Profiles change presentation budgets only. They never change movement, collision, ballistics, visibility authority, or major debris physics.'),
    budget: 'Performance pixel ratio cap 0.75; High/Max cap 1.0; compatibility cap 0.2.',
    verifier: 'src/pass65-settings.test.ts + src/render-profile.test.ts',
  }),
  feature({
    id: 'arena-lighting-and-shadows', title: 'Arena-authored lighting and shadows', availability: 'active', owner: 'src/rendering/arena-visual-definition.ts',
    sourceProbes: [
      { path: 'src/rendering/arena-visual-definition.ts', symbol: 'type ArenaVisualDefinition' },
      { path: 'src/legacy-main.ts', symbol: 'adaptiveShadowsEnabled' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.shadows', 'graphics.preset', 'graphics.adaptiveResolution'], 'Off or authored High shadows; adaptive resolution may disable shadows below the 0.65 DPR floor', 'Shadow distance, map size, bias, and local-light volumes remain arena-authored because arbitrary values can create leaks, clipping, and unbounded GPU work.'),
    budget: 'Per-arena maximum shadow lights, map pixels, distance, and p95 frame budgets.',
    verifier: 'src/rendering/arena-visual-definition.test.ts + src/rendering/light-occlusion.test.ts',
  }),
  feature({
    id: 'principal-hdr-msaa', title: 'Principal HDR render target and MSAA', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [{ path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'const scenePass = pass(scene, camera, { samples: 4 })' }],
    pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('fixed', [], 'Linear-sRGB HDR scene target with four samples; bloom chain has zero MSAA samples', 'The current WebGPU graph is compiled around a verified four-sample principal target. A user MSAA selector is not implemented and must not be implied by the menu.'),
    budget: 'Four principal HDR samples and zero bloom-target samples, asserted in runtime telemetry.',
    verifier: 'tests/e2e/pass64-renderer-foundation.spec.ts',
  }),
  feature({
    id: 'aces-grade-exposure', title: 'ACES output, deterministic grade and arena exposure', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts + ArenaVisualDefinition',
    sourceProbes: [
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'const contrasted = saturated.sub(0.5).mul(contrast).add(0.5)' },
      { path: 'src/rendering/arena-visual-definition.ts', symbol: "toneMap: 'aces-filmic'" },
    ], pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('fixed', [], 'Arena-authored exposure and colour pipeline', 'Exposure is fixed per arena and deterministic review camera. A player exposure control is not implemented because it would invalidate the current calibrated visibility and review baselines.'),
    budget: 'One controlled HDR owner and one ACES-to-sRGB output transform.',
    verifier: 'src/rendering/arena-visual-definition.test.ts + src/rendering/pass64-tsl-scene.test.ts',
  }),
  feature({
    id: 'depth-aware-bloom', title: 'Depth-aware full-scene bloom', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [{ path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'bloom(sceneColor, 0.14, 0.32, 0.92)' }],
    pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('fixed', [], 'Authored strength 0.14 with scene-depth occlusion', 'Bloom is active but has no user slider in this candidate. The fixed value is bounded and depth-tested so foreground geometry cannot be smeared through.'),
    budget: 'Arena maximum post-texture samples and transient-byte limits.',
    verifier: 'tests/e2e/pass64-renderer-foundation.spec.ts',
  }),
  feature({
    id: 'tsl-atmosphere', title: 'TSL sky, mist, smoke and dust atmosphere', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeSky' },
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeMist' },
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeSmoke' },
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeDust' },
    ],
    pipelineIds: ['pass64.sky-atmosphere.tsl.v1', 'pass64.atmosphere-mist.tsl.v1', 'pass64.atmosphere-smoke.tsl.v1', 'pass64.atmosphere-dust.tsl.v1'],
    control: control('fixed', [], 'ArenaVisualDefinition-authored density, placement, cloud state and deterministic time', 'The candidate does not expose an atmosphere selector. Debug URL toggles and review hooks are QA surfaces, not supported player settings.'),
    budget: 'Fixed maximum mist layers, fixed-seed dust counts, bounded opacity, and no depth writes.',
    verifier: 'src/rendering/pass64-tsl-scene.test.ts',
  }),
  feature({
    id: 'tsl-grass-and-water', title: 'TSL grass and perimeter water', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeGrass' },
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'makeWater' },
    ], pipelineIds: ['pass64.grass.tsl.v1', 'pass64.water.tsl.v1'],
    control: control('fixed', [], 'Grass is arena-owned for Nuke Town; perimeter water is arena-owned for RustRig', 'Player toggles are not exposed because these are curated arena identity features. They remain presentation-only and may not enter authority collections.'),
    budget: 'Fixed-seed grass instance count; one non-reflective perimeter-water plane with three bounded wave bands.',
    verifier: 'src/rendering/pass64-tsl-scene.test.ts + src/rendering/arena-visual-definition.test.ts',
  }),
  feature({
    id: 'material-texture-quality', title: 'Material, texture and anisotropy quality', availability: 'active', owner: 'src/render-profile.ts + src/graphics-refinement.ts',
    sourceProbes: [
      { path: 'src/render-profile.ts', symbol: 'staticMaterialMode' },
      { path: 'src/graphics-refinement.ts', symbol: "this.profile === 'blender' ? 8 : 4" },
    ], pipelineIds: [],
    control: control('preset', ['graphics.preset'], 'Performance uses reduced vertex-lit presentation and up to 4x anisotropy; High/Max preserve authored materials and use up to 8x', 'Independent texture-quality and anisotropy controls are not implemented. The preset mapping is the only truthful player control in this candidate.'),
    budget: 'Arena texture-byte and triangle budgets plus renderer maximum-anisotropy clamp.',
    verifier: 'src/render-profile.test.ts + tests/e2e/pass64-renderer-foundation.spec.ts',
  }),
  feature({
    id: 'impact-particles-and-decals', title: 'Material impacts, particles and persistent decals', availability: 'active', owner: 'src/impact-presentation.ts',
    sourceProbes: [
      { path: 'src/impact-presentation.ts', symbol: 'MAX_PARTICLES = 72' },
      { path: 'src/impact-presentation.ts', symbol: 'MAX_IMPACT_MARKS = 48' },
    ], pipelineIds: [],
    control: control('preset', ['graphics.preset', 'graphics.adaptiveResolution'], 'Particle density and decal lifetime scale with the effective effects budget', 'Separate particle and decal sliders are not implemented. The current bounded preset/adaptive mapping is reported instead of inventing controls.'),
    budget: 'At most 72 pooled particles and 48 pooled marks before effective-budget scaling.',
    verifier: 'src/impact-presentation.test.ts + src/graphics-refinement.test.ts',
  }),
  feature({
    id: 'tracer-pool', title: 'Weapon tracers', availability: 'active', owner: 'src/tracer-pool.ts',
    sourceProbes: [{ path: 'src/tracer-pool.ts', symbol: 'MAX_TRACERS = 32' }], pipelineIds: [],
    control: control('fixed', [], 'Bounded presentation for admitted shots', 'Tracer visibility is part of combat readability and is capped rather than exposed as an authority-adjacent player toggle.'),
    budget: 'Exactly 32 reusable tracer slots.',
    verifier: 'src/tracer-pool.test.ts',
  }),
  feature({
    id: 'pooled-explosions', title: 'Grenade and support explosion presentation', availability: 'active', owner: 'src/grenade-explosion-presentation.ts + src/support-explosion-presentation.ts',
    sourceProbes: [
      { path: 'src/grenade-explosion-presentation.ts', symbol: 'GRENADE_EXPLOSION_POOL_CAPACITY = 4' },
      { path: 'src/support-explosion-presentation.ts', symbol: 'SUPPORT_EXPLOSION_POOL_CAPACITY = 12' },
    ], pipelineIds: [],
    control: control('fixed', [], 'Pooled authored presentation with fixed lifetimes', 'Explosion presentation follows host-authored effects and remains capped. No player density control is currently implemented.'),
    budget: 'Four grenade and twelve support presentation slots; 280 ms and 460 ms authored lifetimes.',
    verifier: 'src/grenade-explosion-presentation.test.ts + src/support-explosion-presentation.test.ts',
  }),
  feature({
    id: 'semantic-smoke-presentation', title: 'Semantic smoke volume presentation', availability: 'active', owner: 'src/smoke-volume-presentation.ts',
    sourceProbes: [
      { path: 'src/smoke-volume-presentation.ts', symbol: 'SMOKE_PRESENTATION_CARD_COUNT = 3' },
      { path: 'src/smoke-volume-presentation.ts', symbol: 'SMOKE_VOLUME_PRESENTATION_POOL_CAPACITY = 12' },
    ], pipelineIds: [],
    control: control('fixed', [], 'Three cards per authoritative smoke volume with a twelve-volume pool', 'Smoke cannot be disabled or thinned independently because its visible presentation must remain coherent with shared visibility authority.'),
    budget: 'Twelve pooled volumes, three cards each, 12 second presentation lifetime.',
    verifier: 'src/smoke-volume-presentation.test.ts + src/ordnance.test.ts',
  }),
  feature({
    id: 'damage-and-low-health-feedback', title: 'Directional damage and low-health feedback', availability: 'active', owner: 'src/sensory-feedback.ts + DOM presentation',
    sourceProbes: [
      { path: 'src/sensory-feedback.ts', symbol: 'directionalDamagePresentation' },
      { path: 'src/sensory-feedback.ts', symbol: 'sampleLowHealthFeedback' },
    ], pipelineIds: [],
    control: control('setting', ['accessibility.reducedDamageFlash', 'accessibility.reducedSensoryEffects', 'accessibility.damageFlashScale'], 'Most-restrictive accessibility composition scales flash/vignette presentation without changing damage', 'These controls are live presentation settings and never alter combat authority.'),
    budget: 'Four concurrent directional sources and bounded low-health pulse/opacity envelopes.',
    verifier: 'src/sensory-feedback.test.ts',
  }),
  feature({
    id: 'weapon-motion', title: 'First-person weapon motion', availability: 'active', owner: 'src/weapon-presentation.ts + src/legacy-main.ts',
    sourceProbes: [{ path: 'src/legacy-main.ts', symbol: 'accessibilityRuntime.weaponMotionScale' }], pipelineIds: [],
    control: control('setting', ['accessibility.weaponMotionScale', 'accessibility.reducedSensoryEffects'], '0-100% requested motion; reduced sensory caps effective motion at 35%', 'Motion scaling changes viewmodel presentation only and never the authoritative camera ray.'),
    budget: 'One viewmodel root with bounded additive idle/inertia offsets.',
    verifier: 'src/weapon-presentation.test.ts + src/pass65-settings.test.ts',
  }),
  feature({
    id: 'menu-preview-motion', title: 'Helicopter and cat menu-preview choreography', availability: 'active', owner: 'src/ui/menu-preview-camera.ts',
    sourceProbes: [
      { path: 'src/ui/menu-preview-camera.ts', symbol: 'menuPreviewPose' },
      { path: 'src/ui/menu-preview-camera.ts', symbol: 'MENU_PREVIEW_VISIT_SEED_SLOTS = 64' },
    ], pipelineIds: [],
    control: control('setting', ['accessibility.reducedMotion', 'accessibility.reducedSensoryEffects'], 'Seeded bounded motion or deterministic static reduced-motion pose', 'The same arena renderer is reused; preview cameras are presentation-only and cannot mutate gameplay authority.'),
    budget: 'One active preview camera path, 64 visit-seed slots, and a bounded 256-track cache.',
    verifier: 'src/ui/menu-preview-camera.test.ts + tests/e2e/pass64-hud-menu.spec.ts',
  }),
  feature({
    id: 'destructible-shed-presentation', title: 'Destructible shed holes, dents, doors and debris', availability: 'active', owner: 'src/destructible-shed-presentation.ts',
    sourceProbes: [{ path: 'src/destructible-shed-presentation.ts', symbol: 'class DestructibleShedPresentation' }], pipelineIds: [],
    control: control('fixed', [], 'Presentation reconstructs bounded host-authored shed state in every profile', 'Major debris, apertures, and doors cannot be hidden or simplified independently because visible geometry must agree with movement, ballistics, LOS, and physics authority.'),
    budget: 'Definition-capped apertures, dents, detached panels, debris bodies, geometry retirement, and per-arena placement counts.',
    verifier: 'src/destructible-shed-presentation.test.ts + src/interactive-world-runtime.test.ts',
  }),
  feature({
    id: 'thermal-optics', title: 'Railgun and DMR thermal presentation', availability: 'active', owner: 'src/railgun-presentation.ts + src/dmr-thermal-presentation.ts',
    sourceProbes: [
      { path: 'src/railgun-presentation.ts', symbol: 'class RailgunPresentation' },
      { path: 'src/dmr-thermal-presentation.ts', symbol: 'class DmrThermalPresentation' },
    ], pipelineIds: [],
    control: control('fixed', [], 'Weapon-capability gated; DMR bypasses smoke but never solid-wall occlusion', 'This is a weapon capability, not a general graphics option. Disabling it would change intended information semantics.'),
    budget: 'One bounded overlay/contact set per equipped optic; solid geometry remains the occlusion oracle.',
    verifier: 'src/dmr-thermal-presentation.test.ts + tests/e2e/pass64-railgun.spec.ts',
  }),
  feature({
    id: 'support-entity-presentation', title: 'Aircraft, chopper and drone presentation', availability: 'active', owner: 'src/killstreak-presentation.ts',
    sourceProbes: [{ path: 'src/killstreak-presentation.ts', symbol: 'class KillstreakPresentation' }], pipelineIds: [],
    control: control('fixed', [], 'Host-seeded, host-owned support state with bounded presentation lifetimes', 'Support entities are targetable gameplay actors. Their visibility and identity are fixed instead of exposed as graphics toggles.'),
    budget: 'Catalog/entity caps, pooled explosion roots, hard lifetimes, and generation-aware retirement.',
    verifier: 'src/killstreak-presentation.test.ts + src/killstreak-runtime.test.ts',
  }),
  feature({
    id: 'ambient-contact-effects', title: 'Ambient/contact shading', availability: 'unsupported', owner: 'src/atomic-signal.ts (WebGL2 compatibility only)',
    sourceProbes: [{ path: 'src/atomic-signal.ts', symbol: 'contactShadowStrength' }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable on the required WebGPU route', 'The existing screen-space contact effect belongs to the isolated WebGL2 compatibility post path. It is not exposed until a TSL depth implementation passes parity and performance gates.'),
    budget: 'Zero WebGPU texture samples allocated to this unsupported feature.',
    verifier: 'src/atomic-signal.test.ts + WebGPU no-legacy-post traversal gate',
  }),
  feature({
    id: 'frame-cap', title: 'Frame-rate cap', availability: 'unsupported', owner: 'not implemented',
    sourceProbes: [{ path: 'src/pass65-settings.ts', symbol: 'targetFps' }], pipelineIds: [],
    control: control('unsupported', [], 'No output frame cap; graphics.targetFps is adaptive-quality target only', 'The UI must not describe target FPS as a hard cap. A cap requires a dedicated frame scheduler and timing verification.'),
    budget: 'Browser requestAnimationFrame cadence remains authoritative for presentation scheduling.',
    verifier: 'src/pass65-settings.test.ts',
  }),
  feature({
    id: 'hardware-ray-tracing', title: 'Hardware ray tracing', availability: 'unsupported', owner: 'not available in current Three.js WebGPU route',
    sourceProbes: [{ path: 'docs/PASS65_BIG_ONE_MASTER_PLAN.md', symbol: 'No claim of RTX ray tracing' }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'The RTX 5080 is the review GPU, but the current renderer does not implement hardware ray tracing. No RTX-specific ray-tracing claim or toggle is permitted.'),
    budget: 'Zero ray-tracing acceleration structures or passes.',
    verifier: 'Generated inventory unsupported-feature gate.',
  }),
]);

export function validatePass65RendererFeatureInventory(
  features: readonly RendererFeatureDefinition[] = PASS65_RENDERER_FEATURES,
): readonly string[] {
  const issues: string[] = [];
  const ids = features.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) issues.push('duplicate-feature-id');
  const settingKeys = new Set(PASS65_SETTING_DEFINITIONS.map(({ key }) => key));
  for (const featureDefinition of features) {
    if (!featureDefinition.id || !featureDefinition.owner || featureDefinition.sourceProbes.length === 0) {
      issues.push(`incomplete-feature:${featureDefinition.id || 'unknown'}`);
    }
    if (!featureDefinition.budget || !featureDefinition.verifier || !featureDefinition.control.effectiveValue) {
      issues.push(`missing-budget-or-verifier:${featureDefinition.id}`);
    }
    if (featureDefinition.authorityAffecting !== false) issues.push(`authority-affecting-feature:${featureDefinition.id}`);
    if (featureDefinition.availability === 'unsupported' && featureDefinition.control.kind !== 'unsupported') {
      issues.push(`unsupported-control-mismatch:${featureDefinition.id}`);
    }
    if (featureDefinition.availability === 'active' && featureDefinition.control.kind === 'unsupported') {
      issues.push(`active-control-mismatch:${featureDefinition.id}`);
    }
    if ((featureDefinition.control.kind === 'fixed' || featureDefinition.control.kind === 'unsupported')
      && featureDefinition.control.rationale.trim().length < 24) {
      issues.push(`missing-control-rationale:${featureDefinition.id}`);
    }
    for (const key of featureDefinition.control.settingKeys) {
      if (!settingKeys.has(key)) issues.push(`unknown-setting:${featureDefinition.id}:${key}`);
    }
  }
  const mappedPipelines = new Set(features.flatMap(({ pipelineIds }) => pipelineIds));
  for (const entry of TSL_MIGRATION_INVENTORY) {
    if (!mappedPipelines.has(entry.replacementPipelineId)) issues.push(`missing-tsl-pipeline:${entry.replacementPipelineId}`);
  }
  const mappedSettings = new Set(features.flatMap(({ control: featureControl }) => featureControl.settingKeys));
  for (const definition of PASS65_SETTING_DEFINITIONS.filter(({ key }) => key.startsWith('graphics.') || key.startsWith('accessibility.'))) {
    if (!mappedSettings.has(definition.key)) issues.push(`unmapped-presentation-setting:${definition.key}`);
  }
  return Object.freeze(issues);
}

function presetSnapshot(preset: Exclude<GraphicsPreset, 'custom'>) {
  const settings = normalizePass65Settings({ graphics: { preset } }).graphics;
  const runtime = resolveGraphicsRuntime(settings);
  const profile = renderProfileConfig(runtime.renderProfile);
  return Object.freeze({
    requested: settings,
    effective: runtime,
    profile,
    effects: graphicsEffectsBudget(runtime.renderProfile, profile.pixelRatioCap),
  });
}

export function pass65RendererFeatureInventoryReport() {
  return Object.freeze({
    schemaVersion: 1,
    releasePass: 'PASS 65',
    candidateName: 'THE BIG ONE',
    scope: 'active WebGPU presentation features plus explicitly requested but unavailable renderer controls',
    generatedBy: 'npx tsx scripts/qa/generate-pass65-renderer-feature-inventory.ts',
    settings: Object.freeze(PASS65_SETTING_DEFINITIONS.filter(({ key }) => key.startsWith('graphics.') || key.startsWith('accessibility.'))),
    profiles: Object.freeze({
      performance: presetSnapshot('performance'),
      high: presetSnapshot('high'),
      max: presetSnapshot('max'),
    }),
    tslPipelines: Object.freeze(TSL_MIGRATION_INVENTORY.map((entry) => Object.freeze({
      id: entry.replacementPipelineId,
      owner: entry.owner,
      status: entry.status,
    }))),
    features: PASS65_RENDERER_FEATURES,
    summary: Object.freeze({
      total: PASS65_RENDERER_FEATURES.length,
      active: PASS65_RENDERER_FEATURES.filter(({ availability }) => availability === 'active').length,
      unsupported: PASS65_RENDERER_FEATURES.filter(({ availability }) => availability === 'unsupported').length,
      adjustable: PASS65_RENDERER_FEATURES.filter(({ control: featureControl }) => featureControl.kind === 'setting' || featureControl.kind === 'preset').length,
      fixedWithRationale: PASS65_RENDERER_FEATURES.filter(({ control: featureControl }) => featureControl.kind === 'fixed').length,
    }),
  });
}
