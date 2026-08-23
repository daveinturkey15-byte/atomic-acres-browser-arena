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

export const PASS65_ADVANCED_GRAPHICS_TRACE = Object.freeze({
  registry: Object.freeze({ path: 'src/graphics-settings-registry.ts', symbol: 'ADVANCED_GRAPHICS_CONTROLS' }),
  ui: Object.freeze({ path: 'src/ui/advanced-graphics-controls.ts', symbol: 'bindAdvancedGraphicsControls' }),
  normalization: Object.freeze({ path: 'src/graphics-settings-registry.ts', symbol: 'normalizeAdvancedGraphicsValues' }),
  persistence: Object.freeze({ path: 'src/player-profile.ts', symbol: 'class PlayerProfileStore' }),
  runtime: Object.freeze({ path: 'src/pass65-settings-inventory.ts', symbol: 'runtimeEvidence' }),
  telemetry: Object.freeze({ path: 'src/legacy-main.ts', symbol: 'advancedGraphicsRegistry' }),
});

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
    control: control('setting', ['graphics.renderScale', 'graphics.adaptiveResolution', 'graphics.targetFps'], '50-125% effective WebGPU scale; target FPS drives adaptive-budget selection', 'Render scale is canonicalized to the implemented framebuffer range. The adaptive target remains deliberately separate from the output frame limiter.'),
    budget: 'Profile-specific bounded DPR tiers with sustained-p95 downshift and cooldown-controlled recovery.',
    verifier: 'src/pass65-settings.test.ts + src/adaptive-quality.test.ts',
  }),
  feature({
    id: 'presentation-profile', title: 'Performance, Quality, Max and Custom presentation profiles', availability: 'active', owner: 'src/pass65-settings.ts + src/render-profile.ts',
    sourceProbes: [
      { path: 'src/pass65-settings.ts', symbol: "export type GraphicsPreset = 'performance' | 'high' | 'max' | 'custom'" },
      { path: 'src/render-profile.ts', symbol: 'renderProfileConfig' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.preset', 'graphics.geometryDetail'], 'Performance uses the lowest gameplay-safe presentation values; Quality is the balanced full-geometry profile; Max enables the highest supported values; Custom seeds from the last named profile before an explicit save', 'Profiles and geometry detail change presentation roots only. They never change movement, collision, ballistics, visibility authority, invisible blockers, or major debris physics.'),
    budget: 'Performance effective pixel ratio cap 0.75; Quality base scale 1.0; Max and explicit Custom supersampling cap 1.25; compatibility cap 0.2.',
    verifier: 'src/pass65-settings.test.ts + src/render-profile.test.ts',
  }),
  feature({
    id: 'arena-lighting-and-shadows', title: 'Arena-authored lighting and shadows', availability: 'active', owner: 'src/rendering/arena-visual-definition.ts',
    sourceProbes: [
      { path: 'src/rendering/arena-visual-definition.ts', symbol: 'type ArenaVisualDefinition' },
      { path: 'src/legacy-main.ts', symbol: 'adaptiveShadowsEnabled' },
      { path: 'src/legacy-main.ts', symbol: 'shadowMapTypeForFilter' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.shadows', 'graphics.shadowResolution', 'graphics.shadowUpdateMode', 'graphics.shadowFilter', 'graphics.indirectLighting', 'graphics.preset', 'graphics.adaptiveResolution'], 'Off/on authored shadows, 1024/2048 maps, static/dynamic refresh, an auto/PCF/PCSS-soft filter override, and bounded indirect-light scaling', 'Shadow distance, bias, and local-light volumes remain arena-authored because arbitrary values can create leaks, clipping, and unbounded GPU work. The filter override respects the WebKit basic-depth engine floor.'),
    budget: 'Per-arena maximum shadow lights, map pixels, distance, and p95 frame budgets.',
    verifier: 'src/rendering/arena-visual-definition.test.ts + src/rendering/light-occlusion.test.ts + src/arena-contrast-lighting.test.ts + tests/e2e/pass65-rustrig-container-lighting.spec.ts',
  }),
  feature({
    id: 'principal-hdr-msaa', title: 'Principal HDR render target and MSAA', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [{ path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'const scenePass = pass(scene, camera, { samples: graphics.principalSamples })' }],
    pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('setting', ['graphics.antiAliasing'], 'Off, 2x or 4x multisampling on the principal linear-sRGB HDR target; bloom chain remains single-sampled', 'The renderer is rebuilt after a setting change so the selected sample count owns a real target allocation rather than a cosmetic label.'),
    budget: 'At most four principal HDR samples and zero bloom-target samples, asserted in runtime telemetry.',
    verifier: 'tests/e2e/pass64-renderer-foundation.spec.ts',
  }),
  feature({
    id: 'post-anti-aliasing', title: 'Display-side post anti-aliasing (FXAA/SMAA)', availability: 'active', owner: 'src/rendering/filmic-grade-chain.ts',
    sourceProbes: [
      { path: 'src/rendering/filmic-grade-chain.ts', symbol: 'display-post-antialiasing-fxaa' },
      { path: 'src/rendering/render-runtime.ts', symbol: 'setPostAntiAliasing' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.antiAliasing'], 'FXAA or SMAA as an optional trailing stage after the filmic grade chain on the WebGPU route; MSAA values keep owning the principal-target path', 'The anti-aliasing selector honestly routes to two different mechanisms: MSAA rebuilds the principal HDR target, while FXAA/SMAA rebuild only the display-side output graph. WebGL2 has no grade chain, so post AA degrades to a no-op there.'),
    budget: 'At most one post AA stage; its render targets are retired on every chain rebuild and chain disposal.',
    verifier: 'src/rendering/filmic-grade-chain.test.ts',
  }),
  feature({
    id: 'cas-sharpen', title: 'Contrast-adaptive (RCAS) display sharpening', availability: 'active', owner: 'src/rendering/filmic-grade-chain.ts',
    sourceProbes: [
      { path: 'src/rendering/filmic-grade-chain.ts', symbol: 'display-cas-sharpen' },
      { path: 'src/rendering/filmic-grade-chain.ts', symbol: 'rcasSharpnessFor' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.sharpness'], '0-100% player sharpness mapped onto the RCAS parameter; zero removes the stage entirely instead of running an idle pass', 'Sharpening runs after tone mapping and after any post AA (the AMD-canonical order), moves through a live uniform, and only crossing zero changes graph topology. WebGL2 has no grade chain, so the control degrades to a no-op there.'),
    budget: 'At most one RCAS stage and one half-float target, retired with the chain.',
    verifier: 'src/rendering/filmic-grade-chain.test.ts',
  }),
  feature({
    id: 'filmic-grade-profile', title: 'Player-selectable filmic grade profile', availability: 'active', owner: 'src/rendering/grade-profile.ts + src/rendering/filmic-grade-chain.ts',
    sourceProbes: [
      { path: 'src/rendering/grade-profile.ts', symbol: 'GRADE_PROFILES' },
      { path: 'src/rendering/filmic-grade-chain.ts', symbol: 'installFilmicGradeChain' },
      { path: 'src/legacy-main.ts', symbol: 'effectiveGradeProfileId' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.filmicProfile'], 'Arena Default keeps the HF-363 preset-matched profile; Performance/Quality/Max select an authored frozen profile directly', 'Every selectable profile is a frozen authored catalog entry inside the proven combat-safety envelope; the setting can only choose between them, never invent values.'),
    budget: 'One installed grade chain; profile switches update uniforms and bloom tuning only.',
    verifier: 'src/rendering/filmic-grade-chain.test.ts',
  }),
  feature({
    id: 'aces-grade-exposure', title: 'ACES output, deterministic grade and arena exposure', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts + ArenaVisualDefinition',
    sourceProbes: [
      { path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'const contrasted = saturated.sub(0.5).mul(contrast).add(0.5)' },
      { path: 'src/rendering/arena-visual-definition.ts', symbol: "toneMap: 'aces-filmic'" },
    ], pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('setting', ['graphics.exposure', 'graphics.toneMapping', 'graphics.filmGrain', 'graphics.vignette'], 'Arena-authored base exposure with 0.75-1.25 multiplier, ACES/AgX/Neutral output, and bounded TSL grain/vignette', 'Every selector is compiled or applied by the active renderer and deterministic review telemetry records the requested runtime values.'),
    budget: 'One controlled HDR owner and one ACES-to-sRGB output transform.',
    verifier: 'src/rendering/arena-visual-definition.test.ts + src/rendering/pass64-tsl-scene.test.ts',
  }),
  feature({
    id: 'depth-aware-bloom', title: 'Depth-aware full-scene bloom', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [{ path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'bloom(sceneColor, graphics.post.bloomStrength, 0.32, 0.92)' }],
    pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('setting', ['graphics.bloomQuality'], 'Off, subtle or cinematic TSL bloom with scene-depth occlusion', 'The selected tier changes the actual bloom-node strength while preserving the verified depth-aware graph and bounded transient allocation.'),
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
    control: control('setting', ['graphics.volumetricQuality'], 'Low, High or Ultra density scaling over arena-authored placement, cloud state and deterministic time', 'Density and draw ranges are presentation-only; every tier retains at least one layer so atmosphere never disappears as an accidental gameplay cue.'),
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
      { path: 'src/graphics-refinement.ts', symbol: 'this.requestedAnisotropy' },
      { path: 'src/rendering/arena-environment-ibl.ts', symbol: 'scene.environmentIntensity' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.anisotropy', 'graphics.reflectionQuality', 'graphics.environmentIntensity'], '1x-16x requested anisotropy clamped to GPU capability, Off/Low/High/Ultra PMREM tiers (128/256/512), and a bounded 0-2x environment-map intensity multiplier', 'The controls reach actual texture and PBR material properties; hardware clamps, the effective reflection scale and the applied scene.environmentIntensity product are exposed in telemetry.'),
    budget: 'Arena texture-byte and triangle budgets plus renderer maximum-anisotropy clamp.',
    verifier: 'src/render-profile.test.ts + tests/e2e/pass64-renderer-foundation.spec.ts',
  }),
  feature({
    id: 'impact-particles-and-decals', title: 'Material impacts, particles and persistent decals', availability: 'active', owner: 'src/impact-presentation.ts',
    sourceProbes: [
      { path: 'src/impact-presentation.ts', symbol: 'MAX_IMPACT_PARTICLES = 72' },
      { path: 'src/impact-presentation.ts', symbol: 'MAX_IMPACT_MARKS = 48' },
    ], pipelineIds: [],
    control: control('setting', ['graphics.particleQuality', 'graphics.decalQuality', 'graphics.preset', 'graphics.adaptiveResolution'], 'Independent Low/High/Ultra particle-density and round-persistent decal-capacity scaling composes with the adaptive effects budget', 'The canonical controls modify the bounded presentation budget without changing admitted impacts, hit outcomes, collision, or authoritative destruction.'),
    budget: 'At most 72 pooled particles and 48 pooled marks before effective-budget scaling.',
    verifier: 'src/impact-presentation.test.ts + src/surface-impact-registry.test.ts + src/graphics-refinement.test.ts',
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
    control: control('setting', ['graphics.smokeQuality'], 'One, two or three cards per authoritative smoke volume with a twelve-volume pool', 'Quality changes card detail and opacity within a nonzero floor; authoritative volume, obstruction semantics, lifetime and damage rules remain identical.'),
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
    id: 'menu-preview-motion', title: 'Helicopter and cat menu-preview choreography', availability: 'active', owner: 'src/ui/menu-preview-video.ts + offline authored media',
    sourceProbes: [
      { path: 'src/ui/menu-preview-video.ts', symbol: 'class MenuPreviewVideoController' },
      { path: 'src/ui/menu-preview-video.ts', symbol: 'rendererSubmissions: 0' },
    ], pipelineIds: [],
    control: control('setting', ['accessibility.reducedMotion', 'accessibility.reducedSensoryEffects'], 'Distinct prerecorded compressed video, or its deterministic poster under reduced motion', 'Menu browsing owns no arena renderer: helicopter and cat paths are authored offline, while the runtime switches one bounded media decoder and reports zero renderer submissions.'),
    budget: 'One selected video decoder, detached stale sources, one poster fallback, and zero menu-preview arena constructions or WebGPU submissions.',
    verifier: 'src/ui/menu-preview-video.test.ts + tests/e2e/pass65-preview-choreography.spec.ts',
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
    id: 'ambient-contact-effects', title: 'WebGPU ground-truth ambient occlusion', availability: 'active', owner: 'src/rendering/pass64-tsl-scene.ts',
    sourceProbes: [{ path: 'src/rendering/pass64-tsl-scene.ts', symbol: 'ao(sceneDepth, sceneNormal, camera)' }], pipelineIds: ['pass64.hdr-grade-grain.tsl.v1'],
    control: control('setting', ['graphics.ambientOcclusion'], 'Off, Low, High or Ultra GTAO from the principal scene depth buffer; High and Ultra add the depth/normal-aware spatial denoise pass', 'The installed Three.js WebGPU GTAO node now owns a bounded depth-derived contact pass; each active tier selects a real sample count and resolution scale, and High/Ultra wrap the raw target in the upstream DenoiseNode (temporal filtering stays off without a TRAA resolve). Performance and default Quality keep it off after the native transition stress falsified always-on GTAO.'),
    budget: 'At most one view-normal MRT attachment plus one GTAO red-channel target and one denoise target, 16 samples and 0.75 resolution scale; exact resources dispose with the arena pipeline.',
    verifier: 'src/rendering/pass64-tsl-scene.test.ts + scripts/qa/verify-pass64-webgpu.mjs',
  }),
  feature({
    id: 'frame-cap', title: 'Frame-rate cap', availability: 'active', owner: 'src/pass65-settings.ts + src/legacy-main.ts',
    sourceProbes: [{ path: 'src/pass65-settings.ts', symbol: 'presentationFrameDue' }], pipelineIds: [],
    control: control('setting', ['graphics.frameRateLimit'], '30-360 FPS or uncapped output work; graphics.targetFps remains adaptive-quality target only', 'A phase-preserving requestAnimationFrame gate caps presentation work without changing the fixed-step simulation contract.'),
    budget: 'At most one presentation update per selected interval, with browser requestAnimationFrame as the upper cadence bound.',
    verifier: 'src/pass65-settings.test.ts',
  }),
  feature({
    id: 'hardware-ray-tracing', title: 'Hardware ray tracing', availability: 'unsupported', owner: 'not available in current Three.js WebGPU route',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'path-tracing'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'The RTX 5080 is the review GPU, but the current renderer does not implement hardware ray tracing. No RTX-specific ray-tracing claim or toggle is permitted.'),
    budget: 'Zero ray-tracing acceleration structures or passes.',
    verifier: 'Generated inventory unsupported-feature gate.',
  }),
  feature({
    id: 'screen-space-gi', title: 'Screen-space global illumination', availability: 'unsupported', owner: 'capability gate in src/graphics-settings-registry.ts',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'screen-space-gi'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'The experimental upstream node is not exposed until normal/depth, temporal stability, resource disposal and representative-hardware budgets pass.'),
    budget: 'Zero SSGI MRTs or texture samples allocated.',
    verifier: 'src/graphics-settings-registry.test.ts',
  }),
  feature({
    id: 'screen-space-reflections', title: 'Screen-space reflections', availability: 'unsupported', owner: 'capability gate in src/graphics-settings-registry.ts',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'screen-space-reflections'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'The experimental upstream node is not exposed without a verified material MRT, occlusion behavior, disposal receipt and performance budget.'),
    budget: 'Zero SSR MRTs or texture samples allocated.',
    verifier: 'src/graphics-settings-registry.test.ts',
  }),
  feature({
    id: 'depth-of-field', title: 'Depth of field', availability: 'unsupported', owner: 'capability gate in src/graphics-settings-registry.ts',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'depth-of-field'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'First-person weapon depth, focus transitions, target readability and reduced-sensory behavior have not passed the required gates.'),
    budget: 'Zero depth-of-field texture samples allocated.',
    verifier: 'src/graphics-settings-registry.test.ts',
  }),
  feature({
    id: 'motion-blur', title: 'Motion blur', availability: 'unsupported', owner: 'capability gate in src/graphics-settings-registry.ts',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'motion-blur'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'The current scene graph has no verified velocity MRT, weapon-layer composition or reduced-motion contract for blur.'),
    budget: 'Zero velocity MRT or motion-blur texture samples allocated.',
    verifier: 'src/graphics-settings-registry.test.ts',
  }),
  feature({
    id: 'ai-upscaling-frame-generation', title: 'AI upscaling and frame generation', availability: 'unsupported', owner: 'browser renderer capability boundary',
    sourceProbes: [{ path: 'src/graphics-settings-registry.ts', symbol: "id: 'ai-upscaling-frame-generation'" }], pipelineIds: [],
    control: control('unsupported', [], 'Unavailable', 'Vendor-native DLSS, Ray Reconstruction and frame-generation APIs are not available to this browser renderer and are never simulated by labels.'),
    budget: 'Zero vendor-native reconstruction or generated-frame resources allocated.',
    verifier: 'src/graphics-settings-registry.test.ts',
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
  for (const [stage, probe] of Object.entries(PASS65_ADVANCED_GRAPHICS_TRACE)) {
    if (!probe.path || !probe.symbol) issues.push(`incomplete-advanced-graphics-trace:${stage}`);
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
    schemaVersion: 2,
    releasePass: 'PASS 65',
    candidateName: 'THE BIG ONE',
    scope: 'active WebGPU presentation features plus explicitly requested but unavailable renderer controls',
    generatedBy: 'npx tsx scripts/qa/generate-pass65-renderer-feature-inventory.ts',
    settings: Object.freeze(PASS65_SETTING_DEFINITIONS.filter(({ key }) => key.startsWith('graphics.') || key.startsWith('accessibility.'))),
    advancedGraphicsTrace: PASS65_ADVANCED_GRAPHICS_TRACE,
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
