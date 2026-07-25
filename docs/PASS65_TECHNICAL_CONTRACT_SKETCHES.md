# Pass 65 Technical Contract Sketches

These sketches are design constraints, not repository code. Exact names and paths may adapt to the final post–Pass 64 tree, but authority boundaries and invariants should not drift silently.

## 1. Shared identity and revision types

```ts
type MatchEpoch = number;
type LifeId = number;
type Revision = number;
type ActionSequence = number;
type EntityId = string; // host-created; strict prefix/pattern and maximum length
type ActivationId = string; // host-created; strict prefix/pattern and maximum length
type CatalogId = string; // must resolve through the exact allowlisted catalog

type DecisionId =
  | 'DEC-01' | 'DEC-02' | 'DEC-03' | 'DEC-04' | 'DEC-05'
  | 'DEC-06' | 'DEC-07' | 'DEC-08' | 'DEC-09' | 'DEC-10'
  | 'DEC-11' | 'DEC-12' | 'DEC-13' | 'DEC-14' | 'DEC-15';

type DecisionReceipt<TValue> = Readonly<{
  receiptVersion: 1;
  id: DecisionId;
  status: 'OPEN' | 'FROZEN' | 'SUPERSEDED';
  proposedDefault: TValue;
  value: TValue | null;
  rationale: string;
  owner: string;
  recordedAt: string;
  resolvedAt: string | null;
  freezeNoLaterThan: string;
  supersedesReceiptSha256: string | null;
}>;

type AuthorityStamp = Readonly<{
  matchEpoch: MatchEpoch;
  lifeId: LifeId;
  revision: Revision;
}>;
```

Invariants:

- Epoch changes on new match/rematch reset.
- Life ID changes on every spawn/redeploy that creates a new damage life.
- Revisions increase monotonically inside their epoch/entity.
- Action sequences are per actor/life/action domain and reject duplicates/replay.
- Catalog/definition IDs are allowlisted and length-capped. Dynamic host-created entity/activation IDs instead use strict type-specific prefixes, character patterns, maximum lengths, epoch ownership and uniqueness checks. Never accept arbitrary free text as either identity class.
- `docs/PASS65_DECISION_RECEIPTS.json` is the canonical registry and `docs/PASS65_DECISION_RECEIPTS.schema.json` is its schema. P0 contains exactly one complete `OPEN` receipt for each DEC-01…DEC-15; every authoritative value and resolution timestamp is null.
- A downstream `P04[DEC-x=FROZEN]` dependency is satisfied only by a schema-valid `FROZEN` decision receipt with non-null value, rationale, owner and resolution timestamp; a proposed default or `OPEN` receipt is not authority.

## 1A. Preview and chopper motion choreography

```ts
type MotionVarianceEnvelope = Readonly<{
  seed: number;
  minimumHoldSeconds: number;
  maximumHoldSeconds: number;
  blendSeconds: number;
  maximumPitchDegrees: number;
  maximumYawOffsetDegrees: number;
  maximumBankDegrees: number;
  maximumAltitudeOffsetM: number;
  maximumSpeedScaleDelta: number;
  maximumAngularAcceleration: number;
}>;

type MenuHelicopterPreviewDefinition = Readonly<{
  arenaId: CatalogId;
  splineId: CatalogId;
  safeFlightVolumeId: CatalogId;
  cameraLookAtTrackId: CatalogId;
  cockpitAssetId: CatalogId;
  variance: MotionVarianceEnvelope;
  deterministicCaptureSeed: number;
  reducedMotionPoseId: CatalogId;
}>;

type CatPreviewDefinition = Readonly<{
  arenaId: 'gun-range';
  bodyPathId: CatalogId;
  headLookTrackId: CatalogId;
  pointsOfInterest: readonly CatalogId[];
  loopBlendSeconds: number;
  maximumLinearAcceleration: number;
  maximumAngularVelocity: number;
  deterministicCaptureSeed: number;
  reducedMotionPoseId: CatalogId;
}>;

type ChopperMotionVarianceDefinition = Readonly<{
  id: CatalogId;
  envelope: Omit<MotionVarianceEnvelope, 'seed'>;
  hostFixedStepHz: number;
  replicationHz: number;
  interpolationDelayMs: number;
}>;

const pass65ChannelNames = Object.freeze({
  live: 'The Big One',
  stable: 'WebGPU Migration',
});
```

Menu motion is presentation-only: a seeded PRNG selects occasional targets and a band-limited/critically damped interpolator reaches them without per-frame `Math.random()`, discontinuities or flight-volume escape. Normal sessions may derive a fresh non-secret seed for variety; deterministic capture always supplies the recorded seed. Pitch, yaw, bank, speed and altitude remain coupled like aircraft motion rather than independent noise. Reduced motion keeps a strong static/near-static composition.

The cockpit is an authored asset contract with canopy/frame/instrument silhouette, coherent glass and interior/exterior material response, LODs, source/licence digest and review cameras; it cannot be a hollow primitive shell hidden at most angles. Cat choreography owns separate body and look-at tracks, deliberate points of interest, comfortable acceleration/angular bounds, clean loop closure and an expressive reduced-motion pose.

Killstreak variation is shared authority. The host derives the variance seed from activation identity, advances it at fixed step, constrains the resulting pose through arena flight/no-fly/collision data, and replicates bounded state for client interpolation. Client-local randomness cannot affect chopper pose, targeting, LOS, fire admission or expiry. Seed variation must change visual cadence without changing the frozen survival/pressure calibration outside tolerance.

## 2. Weapon catalog

```ts
type WeaponSlot = 'primary' | 'secondary' | 'special';
type WeaponFamily = 'assault-rifle' | 'smg' | 'lmg' | 'marksman' | 'shotgun' | 'sidearm' | 'launcher';
type FireKind = 'hitscan' | 'pellet' | 'slug' | 'projectile';
type FireMode = 'semi' | 'automatic';

type DamageProfile = Readonly<{
  base: number;
  minimum: number;
  falloffStartM: number;
  falloffEndM: number;
  headMultiplier: number;
  limbMultiplier: number;
}>;

type SpreadProfile = Readonly<{
  hipRadians: number;
  adsMultiplier: number;
  movementMultiplier: number;
  crouchMultiplier: number;
  sustainedPerShot: number;
  maximumRadians: number;
}>;

type RecoilProfile = Readonly<{
  pitchRadians: number;
  yawRadians: number;
  recoveryPerSecond: number;
  adsMultiplier: number;
  crouchMultiplier: number;
  proneMultiplier: number;
  deterministicPatternId: string;
}>;

type AmmoProfile = Readonly<{
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  emptyReloadSeconds: number;
  switchSeconds: number;
}>;

type PenetrationProfile = Readonly<{
  calibreLabel: string;
  power: number;
  energyFalloffStartM: number;
  energyFalloffEndM: number;
  minimumEnergyRetention: number;
  minimumWallDamageMultiplier: number;
  maximumSurfaces: number;
}>;

type OpticProfile = Readonly<{
  magnification: number;
  thermal: 'none' | 'smoke-only';
}>;

type WeaponDefinition = Readonly<{
  id: WeaponId;
  displayName: string;
  slot: WeaponSlot;
  family: WeaponFamily;
  fireKind: FireKind;
  fireMode: FireMode;
  rpm: number;
  pellets: number;
  spinUpMs: number;
  movementMultiplier: number;
  damage: DamageProfile;
  spread: SpreadProfile;
  recoil: RecoilProfile;
  ammo: AmmoProfile;
  penetration: PenetrationProfile;
  optic: OpticProfile | null;
  projectileId: ProjectileDefinitionId | null;
  presentationId: WeaponPresentationId;
  audioId: WeaponAudioProfileId;
  loadoutEligible: boolean;
  botPolicy: 'eligible' | 'diagnostic-only' | 'never';
  dropPolicy: 'droppable' | 'map-pickup' | 'never';
  provenanceId: string;
}>;
```

Validation:

- `rpm > 0`, bounded magazine/reserve/reload/switch/spin-up, finite normalized multipliers.
- `pellet` requires `pellets > 1`; all other fire kinds require one authoritative ray/projectile.
- `projectile` requires a projectile ID; other kinds reject one.
- `smoke-only` optic is permitted only on the DMR contract.
- Through-wall support sensing is not a weapon-optic capability and cannot be reused by DMR or ballistics.
- `movementMultiplier === 0.8` for the minigun definition.
- Display name is presentation data; stable ID is the protocol value.

## 3. Weapon presentation and action graph

```ts
type ViewmodelAction =
  | 'equip' | 'unequip' | 'idle' | 'idle-variant'
  | 'walk' | 'sprint' | 'ads-in' | 'ads-out'
  | 'fire' | 'dry-fire' | 'reload' | 'empty-reload' | 'melee' | 'inspect'
  | 'pump' | 'bolt' | 'spin-up' | 'spin-down'
  | 'grenade-prime' | 'grenade-hold' | 'grenade-throw' | 'grenade-cancel';

type ActionClipContract = Readonly<{
  action: ViewmodelAction;
  clipName: string;
  normalizedDuration: number;
  additive: boolean;
  priority: number;
  markers: Readonly<Record<string, number>>;
}>;

type WeaponPresentationDefinition = Readonly<{
  id: WeaponPresentationId;
  firstPersonLods: readonly AssetRef[];
  worldLods: readonly AssetRef[];
  skeletonId: string;
  semanticParts: readonly string[];
  sockets: Readonly<Record<'rightGrip' | 'leftGrip' | 'magazine' | 'muzzle' | 'eject' | 'optic' | 'flashlight' | 'bolt' | 'pump' | 'knife' | 'grenade', Transform>>;
  requiredActions: readonly ViewmodelAction[];
  allowedTransitions: readonly Readonly<{ from: ViewmodelAction; to: ViewmodelAction }>[];
  clips: readonly ActionClipContract[];
  materialFamilyId: string;
  triangleBudget: readonly [number, number, number];
  decodedTextureBudgetBytes: number;
  drawBudget: number;
  provenanceId: string;
}>;
```

Authority boundary:

- Animation markers may trigger presentation/audio only.
- Authoritative fire, ammo consumption, reload completion and switch completion use canonical action state.
- Camera-centred ray and host-resolved shot geometry never derive from animated muzzle pose.
- The verifier checks only capability-applicable required actions and rejects both missing actions and forbidden transitions such as sprint-while-ADS.

## 4. Loadout v2

```ts
type GrenadeId = 'frag' | 'smoke' | 'flash';
type LoadoutPresetId = 'custom-1' | 'custom-2' | 'custom-3' | 'custom-4';
type CuratedKitId = string; // strict allowlisted registry ID

type LoadoutSchemaDefinitionV2 = Readonly<{
  schemaVersion: 2;
  enabledCustomPresetIds: readonly LoadoutPresetId[];
  showManageRenameTile: boolean;
  decisionReceiptId: 'DEC-01';
}>;

type LoadoutPresetV2 = Readonly<{
  schemaVersion: 2;
  id: LoadoutPresetId;
  displayName: string; // local only; sanitized and never replicated
  primary: PrimaryWeaponId;
  secondary: SecondaryWeaponId;
  grenade: GrenadeId;
}>;

type SelectedLoadoutRef =
  | Readonly<{ kind: 'curated'; kitId: CuratedKitId }>
  | Readonly<{ kind: 'custom'; presetId: LoadoutPresetId }>;

type DeploymentSelection = Readonly<{
  primary: PrimaryWeaponId;
  secondary: SecondaryWeaponId;
  grenade: GrenadeId;
}>;
```

Migration transaction:

1. Parse the v1 selected kit fail closed and preserve its exact valid curated ID.
2. Map to a `SelectedLoadoutRef`; only invalid/missing data receives the documented safe default.
3. Write v2 temporary value.
4. Read back and normalize.
5. Commit v2 key only after equality.
6. Retain v1 until at least one successful v2 load; never delete on parse failure.
7. Fault-inject before/after the atomic commit and prove the last known-good curated/custom selection survives.

The enabled preset list and Manage/Rename surface are not inferred from the four-value type. They must exactly match the validated `FROZEN` DEC-01 receipt, contain three or four unique ordered IDs, and reject selection of a disabled ID.

## 5. Host combat inventory

```ts
type WeaponInventory = Readonly<{
  magazine: number;
  reserve: number;
}>;

type CombatAction =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'switch'; weapon: WeaponId; startedAtMs: number; completesAtMs: number }>
  | Readonly<{ kind: 'reload'; weapon: WeaponId; startedAtMs: number; completesAtMs: number }>
  | Readonly<{ kind: 'spin-up'; weapon: WeaponId; startedAtMs: number; readyAtMs: number }>
  | Readonly<{ kind: 'projectile'; projectileId: EntityId; startedAtMs: number }>;

type CombatInventoryState = Readonly<{
  actorId: string;
  stamp: AuthorityStamp;
  selection: DeploymentSelection;
  equipped: WeaponId;
  weapons: Readonly<Record<WeaponId, WeaponInventory>>;
  grenades: Readonly<Record<GrenadeId, number>>;
  action: CombatAction;
  adrenalineUntilMs: number;
}>;
```

Intent admission always validates actor identity, match/life, action sequence, equipped ID, catalog policy, canonical time, ammo/count, action state and cooldown. Shared state changes only through the host reducer.

## 6. Ordnance and projectile contracts

```ts
type GrenadeEffectKind = 'explosion' | 'smoke-volume' | 'flash';

type GrenadeDefinition = Readonly<{
  id: GrenadeId;
  carry: number;
  fuseMs: number;
  throwSpeed: number;
  effect: GrenadeEffectKind;
  effectDefinitionId: string;
  presentationId: string;
  audioId: string;
}>;

type ProjectileDefinition = Readonly<{
  id: ProjectileDefinitionId;
  radius: number;
  mass: number;
  launchSpeed: number;
  gravityScale: number;
  maximumLifetimeMs: number;
  collisionPolicy: 'bounce' | 'stick-world-and-actors' | 'detonate';
  fuseOrigin: 'launch' | 'attachment';
  fuseMs: number;
  effectDefinitionId: string;
}>;

type ProjectileFuseState =
  | Readonly<{ fuseOrigin: 'launch'; fuseArmedAtMs: number; detonateAtMs: number }>
  | Readonly<{ fuseOrigin: 'attachment'; fuseArmedAtMs: null; detonateAtMs: null }>
  | Readonly<{ fuseOrigin: 'attachment'; fuseArmedAtMs: number; detonateAtMs: number }>;

type ProjectileState = Readonly<{
  id: EntityId;
  definitionId: ProjectileDefinitionId;
  ownerId: string;
  ownerLifeId: LifeId;
  matchEpoch: MatchEpoch;
  revision: Revision;
  phase: 'flying' | 'attached' | 'detonated' | 'expired';
  poseQ: QuantizedPose;
  velocityQ: QuantizedVector;
  attachedTargetId: string | null;
  attachedTargetLifeId: LifeId | null;
  attachmentLocalPoseQ: QuantizedPose | null;
  launchedAtMs: number;
  attachedAtMs: number | null;
}> & ProjectileFuseState;
```

Rules:

- Host creates the ID. A launch-origin fuse receives its immutable arm/detonation ticks at launch. An attachment-origin fuse remains explicitly unarmed with null ticks until the one canonical host attachment transition, which assigns both ticks exactly once; misses expire at the definition's maximum lifetime.
- Strict cross-field parsing rejects attachment-origin armed state before attachment, attached state without target/local-pose identity, any detonation tick earlier than its arm tick, or later rewrites.
- Detonation result is idempotent on projectile ID + revision.
- Attachment to a player includes target life ID; a new life cannot inherit a stale bolt.
- Moving-target, target-respawn, world-stick, miss/no-stick, reconnect and duplicate-snapshot cases all converge to one canonical outcome.
- Presentation may predict pose but reconciles to host state.

## 7. Smoke and flash

```ts
type VisibilityVolume = Readonly<{
  id: EntityId;
  matchEpoch: MatchEpoch;
  revision: Revision;
  centreQ: QuantizedVector;
  radiusQ: number;
  densityQ: number;
  startsAtMs: number;
  peaksAtMs: number;
  endsAtMs: number;
}>;

type VisibilityQuery = Readonly<{
  origin: Vector3;
  target: Vector3;
  mode: 'normal' | 'thermal-smoke-only';
  targetKind: 'living-hostile' | 'living-friendly' | 'dead' | 'world';
}>;

type SupportSensorCapability = Readonly<{
  kind: 'piloted-drone-hostile-through-wall';
  maximumRangeM: number;
  fieldOfViewDegrees: number;
  revealPolicy: 'living-hostiles-only';
  presentationOnly: true;
}>;

type FlashResult = Readonly<{
  resultId: EntityId;
  activationId: ActivationId;
  targetId: string;
  targetLifeId: LifeId;
  intensityQ: number;
  startsAtHostMs: number;
  endsAtHostMs: number;
}>;
```

Query order:

1. Normal and DMR queries terminate at solid-world occlusion.
2. DMR `thermal-smoke-only` ignores only admitted smoke-volume presentation.
3. Living/team target policy filters presentation eligibility.
4. A separate piloted-drone sensor may reveal presentation silhouettes through geometry after range/FOV/team/life policy.
5. No visibility or support-sensor query can produce a ballistic/fire result.

Bullets never query smoke as collision. Flash results are idempotent on result ID + target life; a receiver uses synchronized host time and applies only `max(0, endsAtHostMs - estimatedHostNowMs)`, so delay/replay never restarts a full-duration flash. Accessibility scales the remaining local flash rendering/audio only after the host result.

## 8. Killstreak catalog and loadout

```ts
type KillstreakId =
  | 'adrenaline' | 'care-package' | 'yardhawk'
  | 'tri-pass' | 'piloted-drone' | 'carpet-bomber'
  | 'chopper' | 'hunter-swarm' | 'drone-swarm' | 'nuke';

type SupportEntityKind = 'aircraft' | 'parachute-crate' | 'chopper' | 'drone' | 'bomb';
type SupportDefinitionId = string; // exact allowlisted registry ID
type DroneGunProfileId = 'drone-gun-standard-v1';

type SupportDefinitionBase = Readonly<{
  id: SupportDefinitionId;
  kind: SupportEntityKind;
  maximumConcurrent: number;
  lifetimeMs: number;
  presentationId: CatalogId;
  audioProfileId: CatalogId;
}>;

type SupportEntityDefinition =
  | (SupportDefinitionBase & Readonly<{
      kind: 'aircraft'; targetable: boolean; healthQ: number | null; hitboxProfileId: CatalogId | null; routePolicyId: CatalogId;
    }>)
  | (SupportDefinitionBase & Readonly<{
      kind: 'parachute-crate'; targetable: boolean; healthQ: number | null; hitboxProfileId: CatalogId; descentPolicyId: CatalogId; capturePolicyId: CatalogId;
    }>)
  | (SupportDefinitionBase & Readonly<{
      kind: 'chopper'; targetable: boolean; healthQ: number; hitboxProfileId: CatalogId; gunProfileId: CatalogId; navigationPolicyId: CatalogId; targetingPolicyId: CatalogId;
    }>)
  | (SupportDefinitionBase & Readonly<{
      kind: 'drone'; targetable: true; healthQ: number; hitboxProfileId: CatalogId; gunProfileId: DroneGunProfileId; magazineSize: 20; reservePolicy: 'two-magazines-total' | 'unlimited-reloads-until-expiry'; reloadMs: number; fuelMs: number | null; navigationPolicyId: CatalogId; targetingPolicyId: CatalogId | null; sensorCapabilityId: CatalogId | null;
    }>)
  | (SupportDefinitionBase & Readonly<{
      kind: 'bomb'; targetable: boolean; healthQ: number | null; hitboxProfileId: CatalogId | null; impactProfileId: CatalogId;
    }>);

type KillstreakDefinition = Readonly<{
  id: KillstreakId;
  displayName: string;
  cost: number;
  tier: 'low' | 'mid' | 'high' | 'top';
  activation: 'instant' | 'target-point' | 'target-line' | 'possession';
  supportDefinitionId: SupportDefinitionId | null;
  durationMs: number;
  repeatable: boolean;
  selectable: boolean;
  carePackageWeightUnits: number; // strict non-negative safe integer
  authorityPolicyId: string;
  presentationId: string;
}>;

type KillstreakLoadoutV1 = Readonly<{
  schemaVersion: 1;
  slots: readonly [KillstreakId, KillstreakId, KillstreakId, KillstreakId, KillstreakId];
}>;
```

Validation:

- Exactly five legal IDs under the frozen duplication/alternative policy.
- The decision receipt freezes every retained/new/retired/care-only ID, exact kill cost, tier alternatives, earning/death/carry/repeatability and care-pool eligibility.
- Weight units are exact non-negative safe integers, normalized over an explicit non-recursive eligible pool, and non-increasing with higher kill cost unless the receipt documents an exception.
- Nuke weight units / total eligible weight units equals exactly `1 / 100` when DEC-03 is frozen; its existing host-owned effect remains verifier-green under R512.
- Every non-null support definition reference resolves to a strict per-kind definition. The registry freezes targetability/health/hitbox, gun identity, magazine/reserve/reload, lifetime/fuel, navigation/targeting/sensor policy, presentation/audio and entity cap before implementation.
- Selection freezes at match start and never accepts remote free text.

## 9. Support entities

```ts
type TeamId = string;
type SupportEntityBase = Readonly<{
  id: EntityId;
  definitionId: SupportDefinitionId;
  activationId: ActivationId;
  ownerId: string;
  teamId: TeamId | null;
  matchEpoch: MatchEpoch;
  revision: Revision;
  poseQ: QuantizedPose;
  velocityQ: QuantizedVector;
  expiresAtMs: number;
}>;

type AircraftState = SupportEntityBase & Readonly<{
  kind: 'aircraft';
  phase: 'inbound' | 'active' | 'outbound' | 'expired';
  routeId: string;
}>;

type CrateState = SupportEntityBase & Readonly<{
  kind: 'parachute-crate';
  phase: 'descending' | 'landed' | 'capturing' | 'claimed' | 'expired';
  captureProgressQ: number;
}>;

type ChopperState = SupportEntityBase & Readonly<{
  kind: 'chopper';
  phase: 'inbound' | 'orbiting' | 'outbound' | 'destroyed' | 'expired';
  healthQ: number;
  routeId: string;
}>;

type DroneState = SupportEntityBase & Readonly<{
  kind: 'drone';
  phase: 'spawning' | 'patrolling' | 'possessed' | 'reloading' | 'destroyed' | 'expired';
  healthQ: number;
  magazine: number;
  reserveClips: number | null; // null means bounded unlimited reload loops until expiry
  reloadCompletesAtMs: number | null;
  fuelEndsAtMs: number | null;
  navigationStateId: string;
}>;

type BombState = SupportEntityBase & Readonly<{
  kind: 'bomb';
  phase: 'falling' | 'detonated' | 'expired';
  ordinal: number;
}>;

type SupportEntityState = AircraftState | CrateState | ChopperState | DroneState | BombState;
```

Every union is strictly parsed with finite quantized bounds, allowlisted phases, pattern/length-validated dynamic IDs, allowlisted definition IDs and per-kind array/entity maxima. Each state must match the referenced definition's kind and bounds. Relationship policy is queried authoritatively rather than assuming two teams. Target IDs and other hidden acquisition state remain host-only unless a recipient-specific presentation snapshot needs them.

Reliable events:

- Activation accepted/consumed.
- Entity spawned/destroyed/despawned.
- Reward rolled/claimed.
- Possession entered/exited.
- Damage/death/score canonical result.

Lossy bounded snapshots:

- Pose/velocity/navigation progress.
- Current target and animation phase where repairable.

No reliable per-frame pose stream.

## 10. Care package

```ts
type HostCarePackageState = Readonly<{
  activationId: ActivationId;
  phase: 'inbound' | 'descending' | 'landed' | 'capturing' | 'claimed' | 'expired';
  aircraftId: EntityId;
  crateId: EntityId;
  reward: KillstreakId;
  seedId: string;
  rollQ: number;
  claimedBy: string | null;
  revision: Revision;
  expiresAtMs: number;
}>;

type CarePackageSnapshot = Readonly<{
  activationId: ActivationId;
  phase: HostCarePackageState['phase'];
  aircraftId: EntityId;
  crateId: EntityId;
  claimedBy: string | null;
  revealedReward: KillstreakId | null;
  revision: Revision;
  expiresAtMs: number;
}>;
```

Capture admission validates current actor/life, range, LOS, crate phase/revision and one exclusive capture transaction. Retry returns the original result rather than rolling again.

## 11. Drone possession

```ts
type DroneControlIntent = Readonly<{
  activationId: ActivationId;
  droneId: EntityId;
  matchEpoch: MatchEpoch;
  ownerLifeId: LifeId;
  sequence: ActionSequence;
  yawQ: number;
  pitchQ: number;
  thrustQ: number;
  verticalQ: number; // Space positive; crouch negative
  fire: boolean;
  exit: boolean;
}>;
```

Host clamps rate, deltas, thrust, turn, vertical acceleration, fire cadence, ammo, reload, collision, arena bounds and no-fly geometry. Exit is idempotent and restores player control once under every terminal condition.

## 12. Dynamic world collision

```ts
type DynamicColliderState = Readonly<{
  id: string;
  kind: 'door' | 'attached-panel' | 'major-debris';
  poseQ: QuantizedPose;
  movementSolid: boolean;
  ballisticSurfaceId: string | null;
  losOccluder: boolean;
}>;

type WorldCollisionSnapshot = Readonly<{
  arenaId: ArenaId;
  matchEpoch: MatchEpoch;
  revision: Revision;
  staticDefinitionId: string;
  dynamic: readonly DynamicColliderState[];
  apertures: readonly BallisticAperture[];
}>;
```

All consumers take an explicit snapshot/revision. Do not mutate global static arrays around a query. Presentation-only particles/decals/minor debris never enter the authority snapshot.

## 13. Shed definition and state

```ts
type BallisticAperture = Readonly<{
  id: number;
  surfaceId: string;
  uQ: number;
  vQ: number;
  radiusUQ: number;
  radiusVQ: number;
}>;

type DamageableSheetSurfaceState = Readonly<{
  surfaceId: string;
  role: 'wall' | 'roof' | 'door' | 'detached-chunk';
  attachedChunkId: string | null;
  healthQ: number;
  stage: 'intact' | 'dented' | 'perforated' | 'detached';
  holes: readonly BallisticAperture[];
  dents: readonly { uQ: number; vQ: number; radiusQ: number; depthQ: number }[];
  detachedChunkIds: readonly string[];
}>;

type ShedDoorState = Readonly<{
  surfaceId: string;
  commandId: string;
  commandSequence: number;
  angleQ: number;
  desiredAngleQ: number;
  angularVelocityQ: number;
  direction: 'opening' | 'closing' | 'stationary';
  phase: 'closed' | 'opening' | 'open' | 'closing' | 'blocked';
  startedAtTick: number;
  completesAtTick: number;
  blockedBy: Readonly<{ kind: 'player' | 'major-debris' | 'bullet'; entityId: string }> | null;
  resumePolicy: 'remain-blocked-until-new-command' | 'resume-when-clear';
}>;

type ShedState = Readonly<{
  shedId: string;
  placementId: string;
  matchEpoch: MatchEpoch;
  revision: Revision;
  door: ShedDoorState;
  surfaces: readonly DamageableSheetSurfaceState[];
  majorDebris: readonly {
    chunkId: string;
    poseQ: QuantizedPose;
    velocityQ: QuantizedVector;
    angularVelocityQ: QuantizedVector;
    sleeping: boolean;
    flat: boolean;
  }[];
}>;
```

The one-second door duration means an unobstructed closed-to-open or open-to-closed command. The state retains target, direction and canonical ticks through obstruction, reversal and late join. Door mesh, movement collider and ballistic surface derive from this one state.

Visual masking and ballistic admission consume the identical canonical aperture union/cell representation. Saturation may merge only when the exact resulting region is rendered and traced identically; otherwise it fails closed without enlarging shoot-through area.

Hard caps are part of the parser and definition, not presentation advice: global maxima are 32 apertures, 24 dents and six major chunks per shed, plus 18 simultaneously awake major shed bodies arena-wide. A definition may choose lower exact maxima. Sleeping is an optimization: valid contact wakes/non-flat-nudges, while host-resolved bullets or explosions may always wake and impulse a flat or sleeping major chunk within caps.

## 14. Settings contracts

```ts
type GraphicsPreset = 'performance' | 'high' | 'max' | 'custom';
type Percent0To100 = number; // parser requires finite integer 0..100
type UnitScale0To1 = number; // parser requires finite 0..1
type SettingApplyMode = 'live' | 'pipeline-rebuild' | 'arena-reload';

type GraphicsSettingsV1 = Readonly<{
  schemaVersion: 1;
  preset: GraphicsPreset;
  renderScale: number; // finite 0.50..2.00
  adaptiveResolution: boolean;
  targetFps: 60 | 90 | 120 | 144;
  msaaSamples: 0 | 2 | 4;
  shadows: 'off' | 'medium' | 'high' | 'max';
  shadowDistance: 'low' | 'medium' | 'high' | 'max';
  textures: 'medium' | 'high' | 'max';
  anisotropy: 1 | 4 | 8 | 16;
  atmosphere: 'low' | 'high' | 'max';
  particles: 'low' | 'high' | 'max';
  decals: 'low' | 'high' | 'max';
  bloom: UnitScale0To1;
  exposure: number; // finite 0.50..2.00
  ambientContactEffects: 'off' | 'low' | 'high' | 'max';
  materialQuality: 'medium' | 'high' | 'max';
  minorDebrisPresentationQuality: 'low' | 'high' | 'max';
  frameCap: 0 | 60 | 90 | 120 | 144;
}>;

type AudioSettingsV1 = Readonly<{
  schemaVersion: 1;
  gains: Readonly<Record<'master' | 'sfx' | 'movement' | 'ui' | 'announcements' | 'ambience' | 'menuMusic' | 'gameMusic', Percent0To100>>;
  mutes: Readonly<Record<'master' | 'sfx' | 'movement' | 'ui' | 'announcements' | 'ambience' | 'menuMusic' | 'gameMusic', boolean>>;
}>;

type AccessibilitySettingsV1 = Readonly<{
  schemaVersion: 1;
  reducedMotion: boolean;
  reducedDamageFlash: boolean;
  reducedSensoryEffects: boolean;
  damageFlashScale: UnitScale0To1;
  weaponMotionScale: UnitScale0To1;
}>;

type SettingDefinition = Readonly<{
  key: string;
  applyMode: SettingApplyMode;
  authorityAffecting: false;
}>;
```

Normalization rejects NaN/infinity/out-of-range values, returns requested/effective values plus downgrade/apply-mode reasons, and enforces effective adaptive target ≤ nonzero frame cap. Save only after successful application and read-back. MSAA is a pipeline rebuild. Sensory controls live only in accessibility settings. Minor-debris quality never changes authoritative major bodies, colliders or replication.

## 15. Spatial audio definitions

```ts
type AudioBusId =
  | 'master' | 'sfx' | 'movement' | 'ui'
  | 'announcements' | 'ambience' | 'menu-music' | 'game-music';

type SpatialVoiceProfile = Readonly<{
  id: string;
  bus: AudioBusId;
  refDistanceM: number;
  maximumDistanceM: number;
  rolloff: number;
  coneInnerDegrees: number;
  coneOuterDegrees: number;
  priority: number;
  maximumConcurrent: number;
  cooldownMs: number;
  occlusion: 'none' | 'gain-lowpass';
}>;

type ArenaAudioDefinition = Readonly<{
  arenaId: ArenaId;
  ambienceBeds: readonly AudioAssetRef[];
  zones: readonly {
    id: string;
    bounds: QuantizedBounds;
    surfaceId: string;
    ambienceIds: readonly string[];
  }[];
  sourceBudget: number;
  provenanceIds: readonly string[];
}>;

type AudioBudgetDefinition = Readonly<{
  maximumActiveVoices: number;
  maximumContinuousLoops: number;
  maximumReusableSpatialChains: number;
  maximumByBus: Readonly<Record<AudioBusId, number>>;
  occlusionQueriesPerSecond: number;
  occlusionCpuBudgetMsP95: number;
  stealPolicy: 'lowest-priority-then-farthest-then-oldest';
}>;

type FootstepMovementSample = Readonly<{
  actorId: string;
  lifeId: LifeId;
  continuityId: number;
  planarVelocityQ: QuantizedVector;
  grounded: boolean;
  movementMode: 'idle' | 'walk' | 'sprint' | 'crouch' | 'airborne';
  poseQ: QuantizedPose;
  admittedAtTick: number;
}>;
```

Footstep actor state is keyed by actor + life + continuity. It tracks accepted grounded planar travel distance, last pose, surface and next cadence threshold. Teleport/discontinuity, stale snapshots and reconciliation jumps reset without emitting; airborne lateral motion never emits footsteps. Reusable voice chains are pooled, while one-shot source nodes remain hard-bounded by active counts and deterministic stealing.

## 16. Evidence index

```ts
type AcceptanceManifestEvidenceKind = 'unit' | 'contract' | 'browser' | 'trace' | 'visual' | 'manual';
type EvidenceClass = 'unit' | 'property' | 'browser' | 'visual' | 'hardware' | 'network' | 'receipt' | 'provenance' | 'manual';

type AcceptanceEvidence = Readonly<{
  requirementId: string;
  falsifierId: string;
  evidenceClass: EvidenceClass;
  manifestKind: AcceptanceManifestEvidenceKind;
  sourceSha: string;
  buildId: string | null;
  command: string | null;
  artifactRef: string;
  artifactSha256: string;
  verifierId: string;
  verifierVersion: string;
  environmentHash: string;
  seedOrFixture: string | null;
  expected: string;
  observed: string;
  baselineRef: string | null;
  baselineSha256: string | null;
  observedAt: string;
  result: 'passed' | 'failed' | 'not-run';
  note: string;
}>;

type ReleaseLineageReceipt = Readonly<{
  approvedPreviewShaS0: string;
  preApprovalManifestShaS0M: string;
  preApprovalManifestSha256: string;
  approvedArtifactId: string;
  approvedArtifactSha256: string;
  runtimeTreeSha256S0: string;
  releaseShellTreeSha256S0: string;
  runtimeTreeSha256S0M: string;
  releaseShellTreeSha256S0M: string;
  approvalCommitShaS1: string;
  mergedMainShaS2: string;
  runtimeTreeSha256S1: string;
  runtimeTreeSha256S2: string;
  releaseShellTreeSha256S1: string;
  releaseShellTreeSha256S2: string;
  ancestryAndParityPassed: boolean;
  checkRunIds: readonly string[];
  productionRunId: string;
  pagesSha: string;
  deployedSubtreeSha256: string;
}>;
```

Executable acceptance translation is fixed:

1. Parse requirement rows from `PASS65_REQUIREMENTS_MATRIX.md` in file/table order. For zero-based row `i`, emit manifest ID `R${i + 1}` while copying the stable planning ID (for example `R001` or `R610`) into `planningRequirementId` and the summary prefix. Exactly 99 rows must map to `R1..R99` with no gaps, duplicates or order drift.
2. A Pass 65 wrapper verifier checks that mapping before the generic `acceptance-gate.mjs` runs; the generic gate remains authoritative for schema v1 and release policy.
3. Only policy kinds `unit`, `contract`, `browser`, `trace`, `visual`, and `manual` enter the manifest. Internal property evidence maps to `unit`; receipt/provenance checks map to `contract`; served multiplayer/network evidence maps to `browser`; local deterministic network traces map to `trace`; hardware receipts map through a local `contract` verifier plus `visual` artifacts; owner observations map to `manual`. Local kinds name an existing repository path and exact command.
4. Exact runtime/release-shell source `S0` produces `pr-preview-<pr>-<S0>`. Q10 then creates manifest-only descendant `S0M` with schema-required `status="accepted"`, all `R1..R99` evidence complete, S0 preview identity, and no `humanAcceptance`. The generic gate must report exactly one error: missing Dave approval.
5. After Dave approves exact S0, S1 changes only the timestamped `humanAcceptance` object. S0/S0M/S1 runtime and release-shell tree digests must be identical.

Evidence is valid only when its immutable digest and verifier/environment identity actively exercise the stated falsifier. S0 hardware/visual evidence remains valid through S0M/S1/S2 only when ancestry plus runtime/release-shell tree parity is proven in the lineage receipt. A rebuilt production bundle must record controlled build-ID/timestamp differences unless the exact stored preview artifact is promoted byte-for-byte. “Implemented” is never automatically “verified.”
