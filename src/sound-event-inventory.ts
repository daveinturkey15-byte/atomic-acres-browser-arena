export const AUDIO_BUS_IDS = Object.freeze([
  'master',
  'sfx',
  'movement',
  'ui',
  'announcements',
  'ambience',
  'menu-music',
  'game-music',
] as const);

export type AudioBusId = (typeof AUDIO_BUS_IDS)[number];

export const SOUND_EVENT_INVENTORY_SCHEMA_VERSION = 1 as const;

export const SOUND_EVENT_FAMILIES = Object.freeze([
  'weapon-report',
  'weapon-foley',
  'combat-feedback',
  'world-impact',
  'movement',
  'player-state',
  'ordnance',
  'support',
  'pickup-interaction',
  'interactive-world',
  'arena-ambience',
  'ui',
  'announcements',
  'music',
] as const);

export type SoundEventFamily = (typeof SOUND_EVENT_FAMILIES)[number];
export type SoundDeliveryPolicy = 'listener-local' | 'world-spatial' | 'global-nonspatial';
export type SoundVariantMode = 'fixed' | 'parameterized' | 'round-robin' | 'seeded-choice';
/** Emitter coverage only; policy fields on partial/planned rows do not claim runtime integration or acceptance. */
export type SoundEventCoverageStatus = 'implemented' | 'partial' | 'planned';
export type SoundLifecycleOwner =
  | 'audio-session'
  | 'ui-root'
  | 'menu-route'
  | 'player-life'
  | 'match-epoch'
  | 'arena-generation'
  | 'projectile-entity'
  | 'support-activation'
  | 'support-entity'
  | 'shed-entity';

export type SoundEventInventoryEntry = Readonly<{
  id: string;
  family: SoundEventFamily;
  bus: AudioBusId;
  delivery: SoundDeliveryPolicy;
  spatialProfileId: string | null;
  variants: Readonly<{
    mode: SoundVariantMode;
    ids: readonly string[];
    genericFallbackRationale: string | null;
  }>;
  provenance: Readonly<{
    policy: 'repository-procedural-original' | 'manifested-original-or-compatible-license';
    status: 'verified-existing-source' | 'required-before-runtime';
    sourceIdentity: string;
    digestAuthority: 'git-blob-at-release-sha' | 'assets-manifest-sha256';
  }>;
  concurrency: Readonly<{
    scope: 'global' | 'per-listener' | 'per-source';
    maximumVoices: number;
    cooldownMs: number;
    overflow:
      | 'drop-newest'
      | 'coalesce'
      | 'steal-oldest'
      | 'lowest-priority-then-farthest-then-oldest';
  }>;
  lifecycleOwner: SoundLifecycleOwner;
  coverage: Readonly<{
    status: SoundEventCoverageStatus;
    detail: string;
  }>;
  source: Readonly<{
    producerIdentity: string;
    runtimeEmitterSymbols: readonly string[];
    contractRefs: readonly string[];
  }>;
}>;

type ExistingEventInput = Readonly<{
  id: string;
  family: SoundEventFamily;
  bus: AudioBusId;
  delivery: SoundDeliveryPolicy;
  spatialProfileId?: string;
  variants?: readonly string[];
  variantMode?: SoundVariantMode;
  genericFallbackRationale?: string;
  emitterSymbols: readonly string[];
  contractRefs: readonly string[];
  concurrency: SoundEventInventoryEntry['concurrency'];
  lifecycleOwner: SoundLifecycleOwner;
  coverageStatus?: Extract<SoundEventCoverageStatus, 'implemented' | 'partial'>;
  coverageDetail: string;
}>;

type PlannedEventInput = Readonly<{
  id: string;
  family: SoundEventFamily;
  bus: AudioBusId;
  delivery: SoundDeliveryPolicy;
  spatialProfileId?: string;
  variants?: readonly string[];
  variantMode?: SoundVariantMode;
  genericFallbackRationale?: string;
  contractRefs: readonly string[];
  concurrency: SoundEventInventoryEntry['concurrency'];
  lifecycleOwner: SoundLifecycleOwner;
  coverageDetail: string;
}>;

const LOCAL_FEEDBACK = Object.freeze({
  scope: 'per-listener' as const,
  maximumVoices: 4,
  cooldownMs: 0,
  overflow: 'steal-oldest' as const,
});

const LOCAL_CRITICAL = Object.freeze({
  scope: 'per-listener' as const,
  maximumVoices: 2,
  cooldownMs: 80,
  overflow: 'drop-newest' as const,
});

const WORLD_TRANSIENT = Object.freeze({
  scope: 'global' as const,
  maximumVoices: 24,
  cooldownMs: 0,
  overflow: 'lowest-priority-then-farthest-then-oldest' as const,
});

const WORLD_DENSE_TRANSIENT = Object.freeze({
  scope: 'global' as const,
  maximumVoices: 12,
  cooldownMs: 25,
  overflow: 'lowest-priority-then-farthest-then-oldest' as const,
});

const WORLD_LOOP = Object.freeze({
  scope: 'per-source' as const,
  maximumVoices: 12,
  cooldownMs: 0,
  overflow: 'lowest-priority-then-farthest-then-oldest' as const,
});

const GLOBAL_CUE = Object.freeze({
  scope: 'per-listener' as const,
  maximumVoices: 2,
  cooldownMs: 120,
  overflow: 'steal-oldest' as const,
});

const SINGLETON_LOOP = Object.freeze({
  scope: 'per-listener' as const,
  maximumVoices: 1,
  cooldownMs: 0,
  overflow: 'steal-oldest' as const,
});

function freezeEntry(entry: SoundEventInventoryEntry): SoundEventInventoryEntry {
  return Object.freeze({
    ...entry,
    variants: Object.freeze({ ...entry.variants, ids: Object.freeze([...entry.variants.ids]) }),
    provenance: Object.freeze({ ...entry.provenance }),
    concurrency: Object.freeze({ ...entry.concurrency }),
    coverage: Object.freeze({ ...entry.coverage }),
    source: Object.freeze({
      ...entry.source,
      runtimeEmitterSymbols: Object.freeze([...entry.source.runtimeEmitterSymbols]),
      contractRefs: Object.freeze([...entry.source.contractRefs]),
    }),
  });
}

function existingEvent(input: ExistingEventInput): SoundEventInventoryEntry {
  const variants = input.variants ?? ['default'];
  return freezeEntry({
    id: input.id,
    family: input.family,
    bus: input.bus,
    delivery: input.delivery,
    spatialProfileId: input.spatialProfileId ?? null,
    variants: {
      mode: input.variantMode ?? (variants.length === 1 ? 'fixed' : 'parameterized'),
      ids: variants,
      genericFallbackRationale: input.genericFallbackRationale ?? null,
    },
    provenance: {
      policy: 'repository-procedural-original',
      status: 'verified-existing-source',
      sourceIdentity: input.emitterSymbols.map((symbol) => `src/audio.ts#ArenaAudio.${symbol}`).join('+'),
      digestAuthority: 'git-blob-at-release-sha',
    },
    concurrency: input.concurrency,
    lifecycleOwner: input.lifecycleOwner,
    coverage: {
      status: input.coverageStatus ?? 'implemented',
      detail: input.coverageDetail,
    },
    source: {
      producerIdentity: input.emitterSymbols.map((symbol) => `arena-audio:${symbol}`).join('+'),
      runtimeEmitterSymbols: input.emitterSymbols,
      contractRefs: input.contractRefs,
    },
  });
}

function plannedEvent(input: PlannedEventInput): SoundEventInventoryEntry {
  const variants = input.variants ?? ['default'];
  return freezeEntry({
    id: input.id,
    family: input.family,
    bus: input.bus,
    delivery: input.delivery,
    spatialProfileId: input.spatialProfileId ?? null,
    variants: {
      mode: input.variantMode ?? (variants.length === 1 ? 'fixed' : 'parameterized'),
      ids: variants,
      genericFallbackRationale: input.genericFallbackRationale ?? null,
    },
    provenance: {
      policy: 'manifested-original-or-compatible-license',
      status: 'required-before-runtime',
      sourceIdentity: `audio-manifest-slot:${input.id}`,
      digestAuthority: 'assets-manifest-sha256',
    },
    concurrency: input.concurrency,
    lifecycleOwner: input.lifecycleOwner,
    coverage: { status: 'planned', detail: input.coverageDetail },
    source: {
      producerIdentity: `pass65-contract:${input.contractRefs.join('+')}:${input.id}`,
      runtimeEmitterSymbols: [],
      contractRefs: input.contractRefs,
    },
  });
}

export const PASS64_WEAPON_AUDIO_VARIANTS = Object.freeze([
  'carbine',
  'smg',
  'lmg',
  'scattergun',
  'sniper',
  'pistol',
  'machine-pistol',
  'magnum',
  'railgun',
] as const);

export const PASS65_PLANNED_WEAPON_AUDIO_ROLES = Object.freeze([
  'micro-smg',
  'compact-smg',
  'loud-flashlight-pistol',
  'explosive-crossbow',
  'balanced-rifle',
  'hard-hitting-rifle',
  'minigun',
  'thermal-dmr',
  'slug-shotgun',
] as const);

const IMPACT_SURFACE_VARIANTS = Object.freeze(['metal', 'concrete', 'wood', 'soil', 'glass'] as const);
const FOOTSTEP_SURFACE_VARIANTS = Object.freeze(['asphalt', 'concrete', 'wood', 'soil'] as const);
const FOOTSTEP_GAIT_VARIANTS = Object.freeze(['walk', 'sprint', 'crouch'] as const);
const FOOTSTEP_VARIANTS = Object.freeze(FOOTSTEP_SURFACE_VARIANTS.flatMap((surface) =>
  FOOTSTEP_GAIT_VARIANTS.flatMap((gait) => [0, 1, 2, 3].map((cycle) => `${surface}.${gait}.cycle-${cycle}`))));

const events: SoundEventInventoryEntry[] = [
  // Existing Pass 64 weapon and combat emitters.
  existingEvent({
    id: 'weapon.report.local', family: 'weapon-report', bus: 'sfx', delivery: 'listener-local',
    variants: PASS64_WEAPON_AUDIO_VARIANTS, emitterSymbols: ['shot', 'railgunReport'], contractRefs: ['R109', 'R308'],
    concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'audio-session',
    coverageDetail: 'Pass 64 local reports are original procedural layers on the compressed weapon mix.',
  }),
  existingEvent({
    id: 'weapon.report.world', family: 'weapon-report', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'weapon-report-world-v1', variants: PASS64_WEAPON_AUDIO_VARIANTS,
    emitterSymbols: ['shot', 'railgunReport'], contractRefs: ['R109', 'R307', 'R308'],
    concurrency: WORLD_TRANSIENT, lifecycleOwner: 'audio-session', coverageStatus: 'partial',
    coverageDetail: 'Replicated reports have scalar distance attenuation; pooled HRTF, pan, occlusion, and deterministic stealing remain S04/O06 work.',
  }),
  existingEvent({
    id: 'weapon.reload-mechanic', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    variants: ['mag-release', 'mag-out', 'mag-in', 'mag-seat', 'shell-insert', 'bolt-release'],
    emitterSymbols: ['weaponAction'], contractRefs: ['R109', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'Action-marker foley is emitted from the normalized reload timeline.',
  }),
  existingEvent({
    id: 'weapon.dry-fire', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['empty'], contractRefs: ['R109', 'R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'player-life', coverageDetail: 'The empty trigger uses a dedicated two-layer procedural cue.',
  }),
  existingEvent({
    id: 'weapon.reload-handling', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['reload'], contractRefs: ['R109', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'Reload start handling is separate from action-marker mechanics.',
  }),
  existingEvent({
    id: 'weapon.switch', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['weaponSwitch'], contractRefs: ['R109', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'Weapon switching has a dedicated local handling cue.',
  }),
  existingEvent({
    id: 'interaction.weapon-pickup', family: 'pickup-interaction', bus: 'ui', delivery: 'listener-local',
    variants: ['gun-range', 'death-drop', 'railgun'], variantMode: 'parameterized',
    genericFallbackRationale: 'Pass 64 deliberately reuses the bounded weapon-switch handling cue for all three pickup contexts pending authored Pass 65 identities.',
    emitterSymbols: ['weaponSwitch'], contractRefs: ['R236', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageStatus: 'partial',
    coverageDetail: 'Three semantically distinct pickup callers exist, but they currently share the switch cue and have no canonical UI bus.',
  }),
  existingEvent({
    id: 'weapon.melee-swing', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['melee'], contractRefs: ['R110', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'The current knife/melee swing is an original procedural transient.',
  }),
  existingEvent({
    id: 'weapon.melee-world', family: 'weapon-foley', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'melee-world-v1', variants: ['swing'], emitterSymbols: ['melee'],
    contractRefs: ['R110', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'player-life', coverageStatus: 'partial',
    coverageDetail: 'Remote melee currently plays the centered local swing; source position, HRTF, occlusion, and hit/miss identity remain planned.',
  }),
  existingEvent({
    id: 'combat.hit-confirm', family: 'combat-feedback', bus: 'ui', delivery: 'listener-local',
    variants: ['body', 'head'], emitterSymbols: ['hit'], contractRefs: ['R101', 'R308'],
    concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'player-life',
    coverageDetail: 'Body and head confirmations use separate deterministic envelopes.',
  }),
  existingEvent({
    id: 'combat.kill-confirm', family: 'combat-feedback', bus: 'ui', delivery: 'listener-local',
    emitterSymbols: ['kill'], contractRefs: ['R101', 'R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'player-life', coverageDetail: 'Kill confirmation uses a dedicated three-tone local cue.',
  }),
  existingEvent({
    id: 'combat.damage-taken', family: 'combat-feedback', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['damage'], contractRefs: ['R100', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'Damage taken has a dedicated local transient; direction remains visual-only.',
  }),
  existingEvent({
    id: 'combat.near-miss', family: 'combat-feedback', bus: 'sfx', delivery: 'listener-local',
    emitterSymbols: ['nearMiss'], contractRefs: ['R101', 'R307', 'R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'player-life', coverageDetail: 'Near-miss whizz/crack admission is locally throttled at the emitter.',
  }),
  existingEvent({
    id: 'world.projectile-impact', family: 'world-impact', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'impact-world-v1', variants: IMPACT_SURFACE_VARIANTS,
    emitterSymbols: ['impact', 'coverImpact'], contractRefs: ['R101', 'R307', 'R308'],
    concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'match-epoch', coverageStatus: 'partial',
    coverageDetail: 'Five surface identities exist with scalar attenuation; pooled HRTF/occlusion and global voice enforcement remain planned.',
  }),
  existingEvent({
    id: 'world.window-break', family: 'world-impact', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'impact-world-v1', variants: ['glass'],
    genericFallbackRationale: 'Pass 64 represents a broken window with the existing glass-impact profile; Pass 65 may add a manifested fracture tail without changing break authority.',
    emitterSymbols: ['impact'], contractRefs: ['R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'match-epoch', coverageStatus: 'partial',
    coverageDetail: 'The semantic window-break caller is inventoried separately even though it currently reuses the glass impact synthesis.',
  }),
  existingEvent({
    id: 'movement.footstep.local', family: 'movement', bus: 'movement', delivery: 'listener-local',
    variants: FOOTSTEP_VARIANTS, variantMode: 'round-robin', emitterSymbols: ['footstep'], contractRefs: ['R104', 'R308'],
    concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'player-life',
    coverageDetail: 'Local grounded movement emits four deterministic variation cycles across surface and gait parameters.',
  }),
  existingEvent({
    id: 'movement.land.local', family: 'movement', bus: 'movement', delivery: 'listener-local',
    variants: ['light', 'medium', 'hard'], emitterSymbols: ['land'], contractRefs: ['R104', 'R308'],
    concurrency: LOCAL_CRITICAL, lifecycleOwner: 'player-life',
    coverageDetail: 'Landing strength is parameterized from admitted impact speed.',
  }),
  existingEvent({
    id: 'ordnance.grenade-bounce', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['frag.light', 'frag.heavy'],
    emitterSymbols: ['grenadeBounce'], contractRefs: ['R210', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageStatus: 'partial',
    coverageDetail: 'Frag bounce strength is synthesized, but the current cue is listener-local and has no pooled spatial chain.',
  }),
  existingEvent({
    id: 'ordnance.grenade-out-of-bounds-impact', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['concrete-cover'],
    genericFallbackRationale: 'Pass 64 deliberately reuses the bounded concrete impact profile when a grenade leaves the playable cover envelope.',
    emitterSymbols: ['coverImpact'], contractRefs: ['R210', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageStatus: 'partial',
    coverageDetail: 'The caller is registered, but its current synthesis is centered and shares the generic concrete impact identity.',
  }),
  existingEvent({
    id: 'ordnance.frag-fuse-beep', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['urgency-continuous'], emitterSymbols: ['grenadeFuseBeep'],
    contractRefs: ['R210', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'projectile-entity',
    coverageStatus: 'partial', coverageDetail: 'The canonical accelerating fuse cadence exists; spatial pooling/occlusion remains planned.',
  }),
  existingEvent({
    id: 'ordnance.frag-explosion', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'explosion-world-v1', emitterSymbols: ['explosion'], contractRefs: ['R210', 'R307', 'R308'],
    concurrency: Object.freeze({ ...WORLD_DENSE_TRANSIENT, cooldownMs: 90, overflow: 'coalesce' as const }),
    lifecycleOwner: 'match-epoch', coverageStatus: 'partial',
    coverageDetail: 'The full mix is coalesced in a 90 ms gate; world position, HRTF, and shared cap enforcement remain planned.',
  }),
  existingEvent({
    id: 'ambience.zone-transition', family: 'arena-ambience', bus: 'ambience', delivery: 'listener-local',
    variants: ['aqua-home', 'coral-home', 'west-garden', 'central-transit', 'east-service'],
    emitterSymbols: ['setArenaZone'], contractRefs: ['R304', 'R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'arena-generation', coverageStatus: 'partial',
    coverageDetail: 'Pass 64 has throttled Atomic Acres coordinate-zone tones on every map, not arena-specific continuous ambience.',
  }),

  // Existing support and pickup presentation.
  existingEvent({
    id: 'support.scout-sweep', family: 'support', bus: 'announcements', delivery: 'global-nonspatial',
    emitterSymbols: ['scoutSweep'], contractRefs: ['R500', 'R508', 'R308'], concurrency: GLOBAL_CUE,
    lifecycleOwner: 'support-activation', coverageDetail: 'The existing five-pulse sweep cue is tied to support activation.',
  }),
  existingEvent({
    id: 'support.inbound', family: 'support', bus: 'announcements', delivery: 'global-nonspatial',
    variants: ['yardhawk', 'tri-pass', 'hunter-swarm'], emitterSymbols: ['supportInbound'],
    contractRefs: ['R500', 'R506', 'R508', 'R308'], concurrency: GLOBAL_CUE, lifecycleOwner: 'support-activation',
    coverageDetail: 'Existing offensive support sources have distinct procedural inbound signatures.',
  }),
  existingEvent({
    id: 'support.hunter-launch', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-projectile-world-v1', variants: ['drone-0', 'drone-1', 'drone-2', 'drone-3', 'drone-4'],
    emitterSymbols: ['hunterLaunch'], contractRefs: ['R500', 'R508', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'support-entity', coverageStatus: 'partial',
    coverageDetail: 'Launch staggering exists; positions, HRTF, occlusion, and shared support voice caps remain planned.',
  }),
  existingEvent({
    id: 'support.legacy-explosion', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'explosion-world-v1', variants: ['yardhawk', 'tri-pass', 'hunter-swarm'],
    genericFallbackRationale: 'Pass 64 intentionally sends all three support damage sources through the same 90 ms coalesced explosion mix; Pass 65 content must author distinct manifested identities.',
    emitterSymbols: ['explosion'], contractRefs: ['R500', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'support-activation', coverageStatus: 'partial',
    coverageDetail: 'All current support explosion callers are covered, while semantic profiles and world spatialization remain gaps.',
  }),
  existingEvent({
    id: 'pickup.overdrive-claimed', family: 'pickup-interaction', bus: 'ui', delivery: 'listener-local',
    emitterSymbols: ['overdrivePickup'], contractRefs: ['R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'match-epoch', coverageDetail: 'The existing Overdrive pickup has a distinct local claim cue.',
  }),
  existingEvent({
    id: 'pickup.overdrive-available', family: 'pickup-interaction', bus: 'announcements', delivery: 'global-nonspatial',
    emitterSymbols: ['overdriveAvailable'], contractRefs: ['R308'], concurrency: GLOBAL_CUE,
    lifecycleOwner: 'match-epoch', coverageDetail: 'Overdrive availability has a distinct global cue.',
  }),
  existingEvent({
    id: 'pickup.overdrive-expired', family: 'pickup-interaction', bus: 'ui', delivery: 'listener-local',
    emitterSymbols: ['overdriveExpire'], contractRefs: ['R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'player-life', coverageDetail: 'Overdrive expiry has a distinct local cue.',
  }),
  existingEvent({
    id: 'support.nuke-warning', family: 'support', bus: 'announcements', delivery: 'global-nonspatial',
    emitterSymbols: ['nukeWarning'], contractRefs: ['R503', 'R512', 'R308'], concurrency: GLOBAL_CUE,
    lifecycleOwner: 'support-activation', coverageDetail: 'The warning schedules five bounded alarm pulses and a pressure rise.',
  }),
  existingEvent({
    id: 'support.nuke-detonation', family: 'support', bus: 'sfx', delivery: 'global-nonspatial',
    emitterSymbols: ['nukeDetonation'], contractRefs: ['R503', 'R512', 'R308'], concurrency: LOCAL_CRITICAL,
    lifecycleOwner: 'support-activation', coverageDetail: 'The existing detonation is a bounded procedural global mix.',
  }),

  // Pass 65 weapon, movement, health, and ordnance obligations.
  plannedEvent({
    id: 'weapon.report.pass65-local', family: 'weapon-report', bus: 'sfx', delivery: 'listener-local',
    variants: PASS65_PLANNED_WEAPON_AUDIO_ROLES, contractRefs: ['R109', 'R220-R231', 'R236', 'R308'],
    concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'audio-session',
    coverageDetail: 'Every new weapon role requires a distinct manifested local report before it can be marked implemented.',
  }),
  plannedEvent({
    id: 'weapon.report.pass65-world', family: 'weapon-report', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'weapon-report-world-v1', variants: PASS65_PLANNED_WEAPON_AUDIO_ROLES,
    contractRefs: ['R109', 'R220-R231', 'R236', 'R307', 'R308'], concurrency: WORLD_TRANSIENT,
    lifecycleOwner: 'audio-session',
    coverageDetail: 'Every new report requires admitted source position, HRTF/rolloff/occlusion, and deterministic voice stealing.',
  }),
  plannedEvent({
    id: 'weapon.extended-foley', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    variants: ['equip', 'unequip', 'pump', 'bolt', 'inspect', 'grenade-prime', 'grenade-throw', 'knife-hit', 'knife-miss'],
    contractRefs: ['R106', 'R109', 'R110', 'R236', 'R308'], concurrency: LOCAL_FEEDBACK,
    lifecycleOwner: 'player-life', coverageDetail: 'The expanded viewmodel action graph needs authored cue identities rather than generic fallbacks.',
  }),
  plannedEvent({
    id: 'weapon.minigun-drive', family: 'weapon-foley', bus: 'sfx', delivery: 'listener-local',
    variants: ['spin-up', 'sustain-loop', 'spin-down', 'overheat'], contractRefs: ['R228', 'R236', 'R307', 'R308'],
    concurrency: SINGLETON_LOOP, lifecycleOwner: 'player-life',
    coverageDetail: 'The rotary drive loop must follow authoritative spin state and stop on switch, death, rematch, or disposal.',
  }),
  plannedEvent({
    id: 'movement.footstep.world', family: 'movement', bus: 'movement', delivery: 'world-spatial',
    spatialProfileId: 'footstep-world-v1', variants: FOOTSTEP_VARIANTS, variantMode: 'round-robin',
    contractRefs: ['R104', 'R307', 'R308'], concurrency: WORLD_TRANSIENT, lifecycleOwner: 'player-life',
    coverageDetail: 'Remote-player and bot footsteps require admitted grounded velocity/distance with discontinuity suppression and HRTF.',
  }),
  plannedEvent({
    id: 'movement.land.world', family: 'movement', bus: 'movement', delivery: 'world-spatial',
    spatialProfileId: 'footstep-world-v1', variants: ['light', 'medium', 'hard'], contractRefs: ['R104', 'R307', 'R308'],
    concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'player-life',
    coverageDetail: 'Remote and bot landing cues require admitted impact state and source position.',
  }),
  plannedEvent({
    id: 'player.low-health-breathing', family: 'player-state', bus: 'sfx', delivery: 'listener-local',
    variants: ['threshold', 'severe', 'critical'], contractRefs: ['R103', 'R305', 'R307', 'R308'],
    concurrency: SINGLETON_LOOP, lifecycleOwner: 'player-life',
    coverageDetail: 'One generation-owned breathing loop must intensify with health and stop on recovery, death, rematch, or reduced-sensory suppression.',
  }),
  plannedEvent({
    id: 'player.low-health-heartbeat', family: 'player-state', bus: 'sfx', delivery: 'listener-local',
    variants: ['threshold', 'severe', 'critical'], contractRefs: ['R103', 'R305', 'R307', 'R308'],
    concurrency: SINGLETON_LOOP, lifecycleOwner: 'player-life',
    coverageDetail: 'Heartbeat cadence is a bounded local loop under the same health and sensory lifecycle as breathing.',
  }),
  plannedEvent({
    id: 'ordnance.grenade-prime-throw', family: 'ordnance', bus: 'sfx', delivery: 'listener-local',
    variants: ['frag.prime', 'frag.throw', 'smoke.prime', 'smoke.throw', 'flash.prime', 'flash.throw'],
    contractRefs: ['R210-R212', 'R236', 'R308'], concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'player-life',
    coverageDetail: 'Each grenade type needs authored handling cues tied to the canonical action timeline.',
  }),
  plannedEvent({
    id: 'ordnance.smoke-release', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['canister-pop', 'release-hiss', 'dissipate'],
    contractRefs: ['R211', 'R214', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageDetail: 'Smoke release phases require world position and must end with the host-owned volume lifecycle.',
  }),
  plannedEvent({
    id: 'ordnance.smoke-loop', family: 'ordnance', bus: 'ambience', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['dense', 'decay'], contractRefs: ['R211', 'R214', 'R307', 'R308'],
    concurrency: WORLD_LOOP, lifecycleOwner: 'projectile-entity',
    coverageDetail: 'A bounded per-volume loop may follow density but cannot outlive the canonical smoke generation.',
  }),
  plannedEvent({
    id: 'ordnance.flash-detonation', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'explosion-world-v1', variants: ['occluded', 'peripheral', 'direct'],
    contractRefs: ['R212', 'R215', 'R305', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageDetail: 'Flash detonation audibility follows admitted LOS/distance while sensory scaling remains presentation-only.',
  }),
  plannedEvent({
    id: 'ordnance.flash-recovery', family: 'ordnance', bus: 'sfx', delivery: 'listener-local',
    variants: ['reduced-sensory', 'standard'], contractRefs: ['R212', 'R215', 'R305', 'R307', 'R308'],
    concurrency: SINGLETON_LOOP, lifecycleOwner: 'player-life',
    coverageDetail: 'Any local recovery/ringing cue must use remaining host duration, respect sensory controls, and never restart after replay.',
  }),
  plannedEvent({
    id: 'ordnance.crossbow-launch', family: 'ordnance', bus: 'sfx', delivery: 'listener-local',
    variants: ['string-release', 'rail-mechanic'], contractRefs: ['R223', 'R232', 'R236', 'R308'],
    concurrency: LOCAL_FEEDBACK, lifecycleOwner: 'player-life',
    coverageDetail: 'Fusebolt launch requires a distinct original local identity tied to canonical fire admission.',
  }),
  plannedEvent({
    id: 'ordnance.crossbow-impact', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['stick-world', 'stick-actor'],
    contractRefs: ['R223', 'R232', 'R236', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageDetail: 'The bolt attachment result selects the impact variant; clients do not invent it.',
  }),
  plannedEvent({
    id: 'ordnance.crossbow-fuse-beep', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'small-ordnance-world-v1', variants: ['canonical-urgency'],
    contractRefs: ['R223', 'R232', 'R236', 'R307', 'R308'], concurrency: WORLD_DENSE_TRANSIENT,
    lifecycleOwner: 'projectile-entity', coverageDetail: 'Beeps derive from the one host-fixed detonation time and end on detonation, expiry, or disposal.',
  }),
  plannedEvent({
    id: 'ordnance.crossbow-explosion', family: 'ordnance', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'explosion-world-v1', variants: ['small-blast'], contractRefs: ['R223', 'R232', 'R236', 'R307', 'R308'],
    concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'projectile-entity',
    coverageDetail: 'The exactly-once small blast needs its own bounded profile rather than the full frag fallback.',
  }),

  // Pass 65 support-entity obligations.
  plannedEvent({
    id: 'support.adrenaline-state', family: 'support', bus: 'ui', delivery: 'listener-local',
    variants: ['activate', 'five-second-warning', 'expire'], contractRefs: ['R500', 'R501', 'R308'],
    concurrency: LOCAL_CRITICAL, lifecycleOwner: 'player-life',
    coverageDetail: 'Adrenaline state cues must track the frozen modifier lifecycle without becoming the only state indication.',
  }),
  plannedEvent({
    id: 'support.care-aircraft', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-aircraft-world-v1', variants: ['inbound', 'drop', 'outbound'],
    contractRefs: ['R500', 'R502', 'R511', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'support-entity',
    coverageDetail: 'The aircraft voice is owned by its host-spawned support entity and ends on outbound/expiry/disposal.',
  }),
  plannedEvent({
    id: 'support.care-crate-descent', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-crate-world-v1', variants: ['canopy-open', 'descent-loop', 'landing'],
    contractRefs: ['R500', 'R502', 'R511', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'support-entity',
    coverageDetail: 'Parachute and landing audio follow the admitted crate phase and terminate exactly once.',
  }),
  plannedEvent({
    id: 'support.care-capture', family: 'support', bus: 'ui', delivery: 'listener-local',
    variants: ['start', 'progress-loop', 'interrupted', 'claimed', 'denied', 'reward-reveal'],
    contractRefs: ['R500', 'R502', 'R511', 'R308'], concurrency: LOCAL_CRITICAL, lifecycleOwner: 'support-entity',
    coverageDetail: 'Capture feedback is local, contention-aware, and cannot reveal a reward before host claim resolution.',
  }),
  plannedEvent({
    id: 'support.chopper-rotor', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-aircraft-world-v1', variants: ['approach', 'orbit-loop', 'depart'],
    contractRefs: ['R500', 'R504', 'R511', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'support-entity',
    coverageDetail: 'Rotor audio follows replicated aircraft pose and the exact chopper entity lifetime.',
  }),
  plannedEvent({
    id: 'support.chopper-gun', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-weapon-world-v1', variants: ['burst-near', 'burst-far'],
    contractRefs: ['R500', 'R504', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'support-entity',
    coverageDetail: 'Gun bursts are position-bound, compressor-limited, and capped independently from player reports.',
  }),
  plannedEvent({
    id: 'support.chopper-damage', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-aircraft-world-v1', variants: ['hit', 'critical', 'destroyed'],
    contractRefs: ['R500', 'R504', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'support-entity',
    coverageDetail: 'Damage and destruction variants follow host-owned health transitions.',
  }),
  plannedEvent({
    id: 'support.carpet-aircraft', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-aircraft-world-v1', variants: ['approach', 'drop-run', 'depart'],
    contractRefs: ['R500', 'R505', 'R511', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'support-entity',
    coverageDetail: 'The aircraft loop follows the seeded host route and is disposed after the run.',
  }),
  plannedEvent({
    id: 'support.carpet-bomb', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'explosion-world-v1', variants: ['release', 'fall', 'impact'],
    contractRefs: ['R500', 'R505', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'support-entity',
    coverageDetail: 'Twenty-bomb presentation uses capped/coalesced voices without altering host-authored impact order.',
  }),
  plannedEvent({
    id: 'support.drone-rotor', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-drone-world-v1', variants: ['piloted', 'hunter', 'swarm'],
    contractRefs: ['R500', 'R506-R508', 'R511', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'support-entity',
    coverageDetail: 'Every active drone owns at most one pooled positional rotor voice and releases it on death/expiry/rematch.',
  }),
  plannedEvent({
    id: 'support.drone-gun', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-weapon-world-v1', variants: ['single', 'burst', 'dry-fire', 'reload'],
    contractRefs: ['R500', 'R506-R508', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'support-entity',
    coverageDetail: 'Drone-gun audio follows admitted magazine/fire state and shares a hard support-weapon cap.',
  }),
  plannedEvent({
    id: 'support.drone-damage', family: 'support', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'support-drone-world-v1', variants: ['hit', 'critical', 'destroyed'],
    contractRefs: ['R500', 'R506-R508', 'R511', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'support-entity',
    coverageDetail: 'Damage identity follows host health and cannot be forged by the controlling client.',
  }),
  plannedEvent({
    id: 'support.drone-possession', family: 'support', bus: 'ui', delivery: 'listener-local',
    variants: ['enter', 'fuel-warning', 'ammo-warning', 'exit', 'body-killed'],
    contractRefs: ['R500', 'R506', 'R510', 'R308'], concurrency: LOCAL_CRITICAL, lifecycleOwner: 'support-activation',
    coverageDetail: 'Possession cues are local supplements to visible state and stop on every exit/death/disconnect path.',
  }),
  plannedEvent({
    id: 'support.drone-sensor', family: 'support', bus: 'ui', delivery: 'listener-local',
    variants: ['acquire', 'lost', 'cooldown'], contractRefs: ['R500', 'R506', 'R510', 'R308'],
    concurrency: LOCAL_CRITICAL, lifecycleOwner: 'support-activation',
    coverageDetail: 'Sensor feedback reports only admitted silhouettes and never implies ballistic visibility.',
  }),

  // Interactive-world, UI, announcement, ambience, and music obligations.
  plannedEvent({
    id: 'interaction.pickup', family: 'pickup-interaction', bus: 'ui', delivery: 'listener-local',
    variants: ['weapon', 'ammo', 'ordnance', 'unavailable'], contractRefs: ['R236', 'R308'],
    concurrency: LOCAL_CRITICAL, lifecycleOwner: 'player-life',
    coverageDetail: 'Pickup success/failure needs bounded local feedback and a non-audio state indication.',
  }),
  plannedEvent({
    id: 'shed.door-motion', family: 'interactive-world', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'shed-mechanism-world-v1', variants: ['open-start', 'open-loop', 'close-start', 'close-loop', 'latched', 'interrupted'],
    contractRefs: ['R403', 'R405', 'R411', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'shed-entity',
    coverageDetail: 'Door audio follows the host-authoritative reversible phase and stops on collision, bullet interruption, detach, or disposal.',
  }),
  plannedEvent({
    id: 'shed.damage', family: 'interactive-world', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'shed-damage-world-v1', variants: ['perforate', 'dent', 'warp', 'panel-detach', 'fracture'],
    contractRefs: ['R404', 'R406-R410', 'R411', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'shed-entity',
    coverageDetail: 'Structural transition audio is selected from admitted shed state, with no cue for rejected visual-only damage.',
  }),
  plannedEvent({
    id: 'shed.debris-impact', family: 'interactive-world', bus: 'sfx', delivery: 'world-spatial',
    spatialProfileId: 'shed-damage-world-v1', variants: ['light', 'heavy', 'settle'],
    contractRefs: ['R407-R411', 'R308'], concurrency: WORLD_DENSE_TRANSIENT, lifecycleOwner: 'shed-entity',
    coverageDetail: 'Bounded debris voices follow major pooled bodies; minor presentation debris cannot create unbounded audio.',
  }),
  plannedEvent({
    id: 'ui.feedback', family: 'ui', bus: 'ui', delivery: 'listener-local',
    variants: ['navigate', 'activate', 'back', 'error', 'saved', 'renamed', 'reset'], contractRefs: ['R303', 'R609', 'R308'],
    concurrency: LOCAL_CRITICAL, lifecycleOwner: 'ui-root',
    coverageDetail: 'Loadout, killstreak, graphics, audio, and accessibility surfaces share a manifested UI family without audio-only meaning.',
  }),
  plannedEvent({
    id: 'announcement.match', family: 'announcements', bus: 'announcements', delivery: 'global-nonspatial',
    variants: ['countdown', 'start', 'one-minute', 'end-win', 'end-loss', 'end-draw'], contractRefs: ['R303', 'R308'],
    concurrency: GLOBAL_CUE, lifecycleOwner: 'match-epoch',
    coverageDetail: 'Match announcements are epoch-owned, deduplicated, and never overlap stale rematch state.',
  }),
  plannedEvent({
    id: 'announcement.killstreak', family: 'announcements', bus: 'announcements', delivery: 'global-nonspatial',
    variants: ['earned', 'ready', 'selected', 'inbound-friendly', 'inbound-hostile', 'expired'],
    contractRefs: ['R500', 'R509', 'R308'], concurrency: GLOBAL_CUE, lifecycleOwner: 'match-epoch',
    coverageDetail: 'Killstreak announcements supplement HUD state and use admitted owner/team identity without custom-name audio.',
  }),
  plannedEvent({
    id: 'ambience.arena-bed', family: 'arena-ambience', bus: 'ambience', delivery: 'world-spatial',
    spatialProfileId: 'arena-ambience-bed-v1',
    variants: [
      'atomic-acres.wind', 'atomic-acres.insects', 'atomic-acres.transformer-hum',
      'skyline-terminal.hvac', 'skyline-terminal.jet-wash', 'skyline-terminal.pa',
      'rustworks-1v1.sea-wind', 'rustworks-1v1.machinery', 'rustworks-1v1.metal-creak',
      'gun-range.ventilation', 'gun-range.electrical-room', 'gun-range.distant-report',
    ],
    contractRefs: ['R304', 'R307', 'R308'], concurrency: WORLD_LOOP, lifecycleOwner: 'arena-generation',
    coverageDetail: 'Every arena has three distinct source slots; stems require source/licence/digest before an arena can claim coverage.',
  }),
  plannedEvent({
    id: 'ambience.menu-helicopter', family: 'arena-ambience', bus: 'ambience', delivery: 'world-spatial',
    spatialProfileId: 'menu-preview-aircraft-v1', variants: ['cockpit-idle', 'flyby-near', 'flyby-far'],
    contractRefs: ['R112-R114', 'R307', 'R308'], concurrency: SINGLETON_LOOP, lifecycleOwner: 'menu-route',
    coverageDetail: 'Menu-preview aircraft audio follows the active preview route and stops across route/arena changes or reduced-sensory teardown.',
  }),
  plannedEvent({
    id: 'music.menu', family: 'music', bus: 'menu-music', delivery: 'global-nonspatial',
    variants: ['menu-main', 'menu-lobby'], contractRefs: ['R303', 'R307', 'R308'], concurrency: SINGLETON_LOOP,
    lifecycleOwner: 'menu-route', coverageDetail: 'Menu music requires manifested stems, autoplay recovery, crossfade ownership, and route disposal.',
  }),
  plannedEvent({
    id: 'music.game', family: 'music', bus: 'game-music', delivery: 'global-nonspatial',
    variants: ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'],
    contractRefs: ['R303', 'R304', 'R307', 'R308'], concurrency: SINGLETON_LOOP, lifecycleOwner: 'arena-generation',
    coverageDetail: 'In-game music is arena-generation-owned, independently controlled, and fully manifested before runtime use.',
  }),
];

export const SOUND_EVENT_INVENTORY: readonly SoundEventInventoryEntry[] = Object.freeze(events);
export const REQUIRED_SOUND_EVENT_IDS: readonly string[] = Object.freeze(events.map((event) => event.id));
export const SOUND_EVENT_INVENTORY_DOCUMENT = Object.freeze({
  schemaVersion: SOUND_EVENT_INVENTORY_SCHEMA_VERSION,
  events: SOUND_EVENT_INVENTORY,
});
export const SOUND_EVENT_INVENTORY_SHA256 = '16d5f51f82a65d9e469cb85b6f16300a5a9ccb224cba802fd8abec658b82618b';

export type SoundEventInventoryVerificationOptions = Readonly<{
  requiredIds?: readonly string[];
  requiredFamilies?: readonly SoundEventFamily[];
  observedRuntimeEmitterSymbols?: readonly string[];
}>;

export function verifySoundEventInventory(
  inventory: readonly SoundEventInventoryEntry[],
  options: SoundEventInventoryVerificationOptions = {},
): readonly string[] {
  const errors: string[] = [];
  const requiredIds = options.requiredIds ?? REQUIRED_SOUND_EVENT_IDS;
  const requiredFamilies = options.requiredFamilies ?? SOUND_EVENT_FAMILIES;
  const ids = inventory.map((event) => event.id);
  const idSet = new Set(ids);

  for (const id of new Set(requiredIds)) {
    if (!idSet.has(id)) errors.push(`missing sound event: ${id}`);
  }
  for (const id of idSet) {
    if (!requiredIds.includes(id)) errors.push(`unregistered sound event: ${id}`);
  }
  for (const id of new Set(ids.filter((candidate, index) => ids.indexOf(candidate) !== index))) {
    errors.push(`duplicate sound event: ${id}`);
  }

  for (const family of requiredFamilies) {
    if (!inventory.some((event) => event.family === family)) errors.push(`missing sound-event family: ${family}`);
  }

  const coveredEmitterSymbols = new Set(inventory.flatMap((event) => event.source.runtimeEmitterSymbols));
  for (const symbol of new Set(options.observedRuntimeEmitterSymbols ?? [])) {
    if (!coveredEmitterSymbols.has(symbol)) errors.push(`unregistered ArenaAudio emitter: ${symbol}`);
  }

  for (const event of inventory) {
    const prefix = `${event.id}:`;
    if (!event.id || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(event.id)) errors.push(`${prefix} invalid stable ID`);
    if (!SOUND_EVENT_FAMILIES.includes(event.family)) errors.push(`${prefix} unknown family ${String(event.family)}`);
    if (!AUDIO_BUS_IDS.includes(event.bus)) errors.push(`${prefix} unknown bus ${String(event.bus)}`);
    if (event.bus === 'master') errors.push(`${prefix} events cannot route directly to the master control bus`);
    if (event.delivery === 'world-spatial' && !event.spatialProfileId) errors.push(`${prefix} world-spatial delivery requires a profile`);
    if (event.delivery !== 'world-spatial' && event.spatialProfileId !== null) errors.push(`${prefix} non-spatial delivery cannot name a spatial profile`);
    if (event.variants.ids.length === 0) errors.push(`${prefix} requires at least one variant`);
    if (event.variants.mode === 'fixed' && event.variants.ids.length !== 1) errors.push(`${prefix} fixed variant policy must name exactly one variant`);
    if (new Set(event.variants.ids).size !== event.variants.ids.length) errors.push(`${prefix} has duplicate variants`);
    if (event.variants.ids.some((variant) => !variant.trim())) errors.push(`${prefix} has an empty variant ID`);
    if (event.variants.genericFallbackRationale !== null && !event.variants.genericFallbackRationale.trim()) {
      errors.push(`${prefix} generic fallback rationale is empty`);
    }
    if (!Number.isSafeInteger(event.concurrency.maximumVoices) || event.concurrency.maximumVoices < 1) {
      errors.push(`${prefix} maximumVoices must be a positive safe integer`);
    }
    if (!Number.isSafeInteger(event.concurrency.cooldownMs) || event.concurrency.cooldownMs < 0) {
      errors.push(`${prefix} cooldownMs must be a non-negative safe integer`);
    }
    if (!event.lifecycleOwner) errors.push(`${prefix} lifecycle owner is missing`);
    if (event.source.contractRefs.length === 0) errors.push(`${prefix} requirement/evidence reference is missing`);
    if (event.source.contractRefs.some((ref) => !/^R\d{3}(?:-R\d{3})?$/.test(ref))) {
      errors.push(`${prefix} has an invalid requirement/evidence reference`);
    }
    if (!event.source.producerIdentity.trim()) errors.push(`${prefix} producer identity is missing`);
    if (!event.provenance.sourceIdentity.trim()) errors.push(`${prefix} provenance source identity is missing`);
    if (!event.coverage.detail.trim()) errors.push(`${prefix} coverage detail is missing`);
    if (event.coverage.status === 'implemented' && event.provenance.status !== 'verified-existing-source') {
      errors.push(`${prefix} implemented coverage requires verified provenance`);
    }
    if (event.coverage.status === 'planned' && event.source.runtimeEmitterSymbols.length > 0) {
      errors.push(`${prefix} planned coverage cannot claim a runtime emitter`);
    }
    if (event.coverage.status !== 'planned' && event.source.runtimeEmitterSymbols.length === 0) {
      errors.push(`${prefix} existing coverage requires a runtime emitter identity`);
    }
    if (event.provenance.status === 'verified-existing-source'
      && (event.provenance.policy !== 'repository-procedural-original'
        || event.provenance.digestAuthority !== 'git-blob-at-release-sha'
        || !event.provenance.sourceIdentity.startsWith('src/audio.ts#ArenaAudio.'))) {
      errors.push(`${prefix} observed procedural provenance must resolve to the release Git blob`);
    }
    if (event.provenance.status === 'required-before-runtime'
      && (event.provenance.policy !== 'manifested-original-or-compatible-license'
        || event.provenance.digestAuthority !== 'assets-manifest-sha256'
        || event.provenance.sourceIdentity !== `audio-manifest-slot:${event.id}`)) {
      errors.push(`${prefix} planned provenance must resolve to its exact asset-manifest slot`);
    }
  }

  return Object.freeze(errors.sort());
}

export function canonicalSoundEventInventoryJson(inventory = SOUND_EVENT_INVENTORY): string {
  return `${JSON.stringify({ schemaVersion: SOUND_EVENT_INVENTORY_SCHEMA_VERSION, events: inventory }, null, 2)}\n`;
}
