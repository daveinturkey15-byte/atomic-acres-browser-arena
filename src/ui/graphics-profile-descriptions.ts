/**
 * HF-414 / HF-418 — what each graphics profile is, in words a player can act
 * on, derived from a measurement rather than from an adjective.
 *
 * WHY THIS FILE EXISTS.
 * Until now the Options panel said, for all five entries at once: "Quality is
 * the balanced default. Performance reduces presentation cost. Max cranks
 * every setting." That is a sentence about intent. The owner asked
 * (2026-09-02 17:50) to "ensure our graphic profiles are clear as to what they
 * are and what they deliver and how/why etc", and then (19:10) for a ladder
 * whose lines are true on a stated machine: "quality is beautiful and smooth
 * on a decent pc. Max is for mad pcs".
 *
 * THE HONESTY RULES THIS FILE IS HELD TO, and the test that enforces each:
 *
 *  - Every `costClass` and `measuredAt` figure comes from the HF-414 audit
 *    (scripts/qa/audit-graphics-profiles.mjs) at 2560x1440 on the owner's
 *    RTX 5080, written up in docs/GRAPHICS_PROFILES_2026-09-03.md. The doc is
 *    the source; this is the summary.
 *  - `controlSetHash` pins the EXACT control set the line describes. If a
 *    preset's values change, the hash changes, and
 *    graphics-profile-contract.test.ts fails until the doc changes too. A
 *    description cannot go stale silently.
 *  - No line claims hardware the build does not use. RAY TRACED never says
 *    RTX, RT cores, hardware acceleration or path tracing (the naming rule in
 *    the shared skill `threejs-rtx-runtime-route`), and the RTX explainer is
 *    not a profile at all (src/ui/rtx-native-runtime-explainer.ts).
 *  - `referenceFrameNote` states the machine a claim is true on. "Smooth" with
 *    no machine attached is the kind of sentence that produced the owner's
 *    "150 fps -> 40 fps" report in the first place.
 */
import { GRAPHICS_PRESET_VALUES, type AdvancedGraphicsValues } from '../graphics-settings-registry';

export type GraphicsProfilePresentationId = 'performance' | 'balanced' | 'high' | 'raytraced' | 'max';

/**
 * Cost class. Deliberately coarse: the audit measured one machine on three
 * arenas, and a four-significant-figure frame time presented as a promise
 * would be a stronger claim than the evidence supports. The exact per-arena
 * numbers live in the doc.
 */
export type GraphicsProfileCostClass = 'lowest' | 'low' | 'moderate' | 'high' | 'highest';

export type GraphicsProfileDescription = Readonly<{
  id: GraphicsProfilePresentationId;
  /** The uppercase label in the select. */
  label: string;
  /** ONE line. This is what a player reads before choosing. */
  summary: string;
  /** Who it is for, in machine terms. */
  intendedFor: string;
  costClass: GraphicsProfileCostClass;
  /** The expand/hover detail: what this profile actually turns on. */
  turnsOn: readonly string[];
  /** What it deliberately leaves off, and why. Honesty half of the pair. */
  leavesOff: readonly string[];
  /** The machine and resolution any performance word in `summary` is true on. */
  referenceFrameNote: string;
}>;

/**
 * The four selectable rendering profiles plus RAY TRACED, in ladder order.
 *
 * ORDER IS PART OF THE CONTRACT: a player reads a settings list as a ladder,
 * so the list must climb. Before HF-418 it read QUALITY, PERFORMANCE, RAY
 * TRACED, MAX, CUSTOM — Quality first because it is the default, which made
 * the second entry look like a step up from the first.
 */
export const GRAPHICS_PROFILE_DESCRIPTIONS: readonly GraphicsProfileDescription[] = Object.freeze([
  Object.freeze({
    id: 'performance',
    label: 'PERFORMANCE',
    summary: 'Lowest cost, and it looks it: renders below native resolution with no shadows and no anti-aliasing.',
    intendedFor: 'Weak or integrated graphics, laptops on battery, and the automatic choice when the browser reports fewer than 8 cores or under 8 GB.',
    costClass: 'lowest',
    turnsOn: Object.freeze([
      'Renders at 75% of your window and upsamples — the main reason it looks soft.',
      'Reduced geometry detail, low particle, decal and smoke budgets, thinner ambient air.',
      'Rain capped to light regardless of the match weather, lightning off.',
    ]),
    leavesOff: Object.freeze([
      'Shadows, anti-aliasing, sun shafts, reflections, ambient occlusion — the whole screen-space stack is structurally absent here, not merely turned down.',
    ]),
    referenceFrameNote: 'Measured at 2560x1440 on an RTX 5080; the point of this profile is the machines that are not one.',
  }),
  Object.freeze({
    id: 'balanced',
    label: 'BALANCED',
    summary: 'Native resolution, real shadows and the full colour grade, without the passes that cost the most: the sensible default on a mid-range machine.',
    intendedFor: 'Mid-range desktops and gaming laptops — anything that struggles to hold a steady rate on QUALITY.',
    costClass: 'low',
    turnsOn: Object.freeze([
      'Full native resolution and full geometry detail.',
      'Shadows at the 1024 map with SMAA edge anti-aliasing.',
      'The same filmic grade and cinematic bloom QUALITY uses — the look, without the passes.',
      'Full particle, decal and smoke budgets; rain at three-quarters density with the storm ceiling left open.',
    ]),
    leavesOff: Object.freeze([
      '4x multisampling: a 4-sample HDR target multiplies pipeline variants and bandwidth across every material in the arena.',
      'Screen-space reflections: they add two more render-target attachments to every frame.',
      'Sun shafts: a per-pixel raymarch of the shadow map.',
      'Ambient occlusion, screen-space GI, depth of field, motion blur.',
    ]),
    referenceFrameNote: 'Measured at 2560x1440 on an RTX 5080. It exists for machines below that, where the passes it drops are the ones that hurt.',
  }),
  Object.freeze({
    id: 'high',
    label: 'QUALITY',
    summary: 'The intended look: 4x multisampling, high-resolution shadows, sun shafts and screen-space reflections. Smooth on a decent gaming PC.',
    intendedFor: 'A current mid-to-high desktop GPU. Chosen automatically when the browser reports 8+ cores and 8+ GB.',
    costClass: 'moderate',
    turnsOn: Object.freeze([
      'Everything BALANCED turns on, plus 4x multisampling and the 2048 shadow map.',
      'Screen-space reflections at the low tier (half-resolution march, 6 m reach).',
      'Sun shafts at the low tier (24 raymarch steps).',
      'Rain, wind and lightning at the density the arenas were authored for.',
    ]),
    leavesOff: Object.freeze([
      'Screen-space global illumination, depth of field and motion blur — the expensive gather and the two effects that replace pixels. Those belong to a profile you pick on purpose.',
    ]),
    referenceFrameNote: '"Decent PC" reference: measured at 2560x1440 on an RTX 5080 at a median frame near the display refresh with no in-combat pipeline compiles. A slower card gives up frame rate here before it gives up looks.',
  }),
  Object.freeze({
    id: 'raytraced',
    label: 'RAY TRACED',
    summary: 'Real recursive ray tracing in shaders: true reflections off real geometry, including geometry that is off screen. Works on any WebGPU card — it is not RTX and it uses no ray-tracing hardware.',
    intendedFor: 'Any WebGPU graphics card that can already hold QUALITY. Not an NVIDIA-only profile.',
    costClass: 'high',
    turnsOn: Object.freeze([
      'World-space reflection rays traced against the arena, with hard shadow rays inside the reflected image.',
      'The highest baked reflection probe tier and ambient occlusion at high.',
      'The richest colour grade in the ladder.',
    ]),
    leavesOff: Object.freeze([
      'It BUYS the trace rather than adding it: 4x multisampling drops to SMAA and screen-space reflections turn off, because the trace supersedes them and running both would pay for reflected light twice.',
      'No indirect bounce (classic recursive ray tracing computes none) and no path tracing.',
      'Players, bots and vehicles are not in the traced set, so no reflection can show you an enemy that PERFORMANCE could not.',
    ]),
    referenceFrameNote: 'Measured at 2560x1440 on an RTX 5080. Needs the WebGPU renderer; on a WebGL2 fallback it is demoted to QUALITY and the badge says so.',
  }),
  Object.freeze({
    id: 'max',
    label: 'MAX',
    summary: 'Every effect at its highest tier, supersampled above native. For very high-end machines only — it is the most expensive thing this build can ask a GPU to do.',
    intendedFor: 'Top-end desktop GPUs. If your frame rate drops when you select it, that is the profile working as intended, not a bug.',
    costClass: 'highest',
    turnsOn: Object.freeze([
      'Renders at 115% of your window and downsamples, on top of 4x multisampling.',
      'Screen-space reflections and screen-space global illumination at high, sun shafts at high, ambient occlusion at ultra.',
      'Dynamic shadow updates, depth of field, and a low bounded amount of motion blur.',
      'Rain at 135% of authored density and the thickest ambient air.',
    ]),
    leavesOff: Object.freeze([
      'Ray tracing: MAX is the heaviest profile already, and adding the trace on top would make its first frame worse, not its picture better. RAY TRACED is a different trade, not a lower rung.',
      'Spatial upscaling, which renders below native and would contradict the supersample.',
    ]),
    referenceFrameNote: 'Measured at 2560x1440 on an RTX 5080 — the machine this profile is aimed at. Anything less should expect to choose QUALITY.',
  }),
]);

const BY_ID: ReadonlyMap<GraphicsProfilePresentationId, GraphicsProfileDescription> = new Map(
  GRAPHICS_PROFILE_DESCRIPTIONS.map((entry) => [entry.id, entry]),
);

/** Fail-closed lookup; an unknown id is a construction error, never a blank line. */
export function graphicsProfileDescription(id: GraphicsProfilePresentationId): GraphicsProfileDescription {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`HF-418 unknown graphics profile description: ${String(id)}`);
  return entry;
}

/**
 * A stable, order-independent fingerprint of one profile's control set.
 *
 * WHY A HASH AND NOT A COPY OF THE TABLE. A copied table drifts silently when
 * someone edits one value; a hash cannot. This is a 32-bit FNV-1a over the
 * key-sorted `key=value` pairs — small, dependency-free, deterministic across
 * Node and the browser, and entirely adequate for a "did this change?"
 * tripwire. It is not a security digest and is not used as one.
 */
export function graphicsControlSetHash(values: AdvancedGraphicsValues): string {
  const serialized = Object.keys(values)
    .sort()
    .map((key) => `${key}=${String((values as Record<string, unknown>)[key])}`)
    .join(';');
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    // FNV prime 16777619, folded through Math.imul so this stays exact in JS.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Every shipped profile's control-set hash, computed from the live registry. */
export function graphicsControlSetHashes(): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(GRAPHICS_PRESET_VALUES).map(([id, values]) => [id, graphicsControlSetHash(values)]),
  ));
}
