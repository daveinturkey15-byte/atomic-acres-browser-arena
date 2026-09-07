/**
 * HF-509 — "I've got the Crimson Flamethrower in the care package, and it just
 * let me keep pressing the button and getting a hundred percent value. It
 * should only grant it to you once, and then you have it until it's out of
 * ammo."
 *
 * The defect: `activateFieldSupport` recognised the crimson care reward and
 * returned straight out of `grantCrimsonFlamethrower()` WITHOUT ever reaching
 * `killstreakRuntime.activate`, which is the only code path that shifts a
 * reward off the actor's `careRewards` queue. The queue entry therefore
 * survived the grant, the HUD kept offering it, and every press refilled the
 * magazine and the reserve — "a hundred percent value", indefinitely.
 *
 * This suite pins all four halves of the contract:
 *   1. N presses on one package instance produce exactly ONE grant (ledger).
 *   2. The package instance identity is derived from the replicated queue, so
 *      a second package is a genuinely new instance and IS grantable.
 *   3. The legacy-main wiring routes the grant through host activation and the
 *      ledger, and grants only after both admit it.
 *   4. Host authority: a guest cannot double-claim a crate, a second guest
 *      arriving after the grant sees a consumed package, and the redeemed
 *      reward cannot be redeemed twice.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CARE_PACKAGE_GRANT_LEDGER_CAPACITY,
  advanceCareRewardQueue,
  createCarePackageGrantLedger,
  createCareRewardQueueTracker,
  headCarePackageId,
  redeemCarePackageWeaponGrant,
} from './care-package-grant-once';
import {
  CRIMSON_FLAMETHROWER_KILLSTREAK_ID,
  PASS65_KILLSTREAK_CATALOG,
  parseKillstreakLoadout,
} from './killstreak-catalog';
import { FIELD_SUPPORT_IDS } from './field-support';
import {
  HostKillstreakRuntime,
  type KillstreakActivationIntent,
  type KillstreakWorld,
} from './killstreak-runtime';

const legacyMain = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

/** One press of the field-support key on the head care reward. */
function pressOnce(
  ledger: ReturnType<typeof createCarePackageGrantLedger>,
  packageId: string,
  claimantId = 'owner',
  lifeId = 1,
): boolean {
  return ledger.claim({ packageId, claimantId, lifeId }).granted;
}

describe('HF-509 one grant per care-package instance', () => {
  it('grants once no matter how many times the button is pressed', () => {
    const ledger = createCarePackageGrantLedger();
    const tracker = advanceCareRewardQueue(
      createCareRewardQueueTracker(7),
      [CRIMSON_FLAMETHROWER_KILLSTREAK_ID],
    );
    const packageId = headCarePackageId(tracker, 'owner')!;
    expect(packageId).toBeTruthy();

    let grants = 0;
    for (let press = 0; press < 25; press += 1) if (pressOnce(ledger, packageId)) grants += 1;

    expect(grants).toBe(1);
    expect(ledger.isConsumed(packageId)).toBe(true);
    expect(ledger.claimantOf(packageId)).toBe('owner');
    expect(ledger.consumedCount()).toBe(1);
  });

  it('names the refusal so a repeat press can stay silent rather than re-prompt', () => {
    const ledger = createCarePackageGrantLedger();
    expect(ledger.claim({ packageId: 'p1', claimantId: 'owner', lifeId: 1 }))
      .toEqual({ granted: true, reason: 'granted', packageId: 'p1', grantedTo: 'owner' });
    expect(ledger.claim({ packageId: 'p1', claimantId: 'owner', lifeId: 1 }))
      .toEqual({ granted: false, reason: 'already-claimed', packageId: 'p1', grantedTo: 'owner' });
    // A different claimant is refused for a different reason: the package is
    // gone, not merely already taken by them.
    expect(ledger.claim({ packageId: 'p1', claimantId: 'guest-b', lifeId: 1 }))
      .toEqual({ granted: false, reason: 'package-consumed', packageId: 'p1', grantedTo: 'owner' });
  });

  it('does not re-open a consumed package after the claimant respawns', () => {
    const ledger = createCarePackageGrantLedger();
    expect(pressOnce(ledger, 'p1', 'owner', 1)).toBe(true);
    expect(pressOnce(ledger, 'p1', 'owner', 2)).toBe(false);
    expect(pressOnce(ledger, 'p1', 'owner', 9)).toBe(false);
  });

  it('refuses a structurally invalid claim without consuming anything', () => {
    const ledger = createCarePackageGrantLedger();
    for (const bad of [
      { packageId: '', claimantId: 'owner', lifeId: 1 },
      { packageId: 'p1', claimantId: '', lifeId: 1 },
      { packageId: 'p1', claimantId: 'owner', lifeId: -1 },
      { packageId: 'p1', claimantId: 'owner', lifeId: 1.5 },
      { packageId: 'p1', claimantId: 'owner', lifeId: Number.NaN },
    ]) {
      expect(ledger.claim(bad)).toMatchObject({ granted: false, reason: 'invalid-request' });
    }
    expect(ledger.consumedCount()).toBe(0);
    expect(pressOnce(ledger, 'p1')).toBe(true);
  });

  it('rolls a claim back only for its owner, so a refused host admission is retryable', () => {
    const ledger = createCarePackageGrantLedger();
    expect(pressOnce(ledger, 'p1', 'owner')).toBe(true);
    expect(ledger.release('p1', 'guest-b')).toBe(false);
    expect(ledger.release('p2', 'owner')).toBe(false);
    expect(ledger.release('p1', 'owner')).toBe(true);
    expect(ledger.isConsumed('p1')).toBe(false);
    expect(pressOnce(ledger, 'p1', 'owner')).toBe(true);
  });

  it('bounds ledger memory without letting a live package fall out', () => {
    const ledger = createCarePackageGrantLedger(4);
    for (let index = 0; index < 4; index += 1) expect(pressOnce(ledger, `p${index}`)).toBe(true);
    expect(ledger.consumedCount()).toBe(4);
    expect(pressOnce(ledger, 'p4')).toBe(true);
    expect(ledger.consumedCount()).toBe(4);
    // Oldest evicted first; the newest four are still refused.
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(ledger.isConsumed(id)).toBe(true);
    expect(CARE_PACKAGE_GRANT_LEDGER_CAPACITY).toBeGreaterThanOrEqual(256);
  });
});

describe('HF-509 package-instance identity from the replicated queue', () => {
  it('is null with no reward and stable across refreshes that consume nothing', () => {
    let tracker = createCareRewardQueueTracker(7);
    expect(headCarePackageId(tracker, 'owner')).toBeNull();
    tracker = advanceCareRewardQueue(tracker, ['nuke']);
    const first = headCarePackageId(tracker, 'owner')!;
    for (let refresh = 0; refresh < 5; refresh += 1) tracker = advanceCareRewardQueue(tracker, ['nuke']);
    expect(headCarePackageId(tracker, 'owner')).toBe(first);
  });

  it('advances to a NEW instance once the host consumes the head, so a second package is grantable', () => {
    const ledger = createCarePackageGrantLedger();
    let tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    const first = headCarePackageId(tracker, 'owner')!;
    expect(pressOnce(ledger, first)).toBe(true);
    expect(pressOnce(ledger, first)).toBe(false);

    // Host consumed it; the queue empties, then a second crate lands.
    tracker = advanceCareRewardQueue(tracker, []);
    expect(headCarePackageId(tracker, 'owner')).toBeNull();
    tracker = advanceCareRewardQueue(tracker, [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    const second = headCarePackageId(tracker, 'owner')!;
    expect(second).not.toBe(first);
    expect(pressOnce(ledger, second)).toBe(true);
  });

  it('counts a head swap inside one replication step as exactly one consumption', () => {
    let tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), ['nuke']);
    const first = headCarePackageId(tracker, 'owner')!;
    // Same length, different head: the previous head was consumed while a new
    // capture landed in the same authoritative revision.
    tracker = advanceCareRewardQueue(tracker, [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    expect(tracker.consumedCount).toBe(1);
    expect(headCarePackageId(tracker, 'owner')).not.toBe(first);
  });

  it('does not advance the instance when a SECOND reward is merely appended', () => {
    let tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    const first = headCarePackageId(tracker, 'owner')!;
    tracker = advanceCareRewardQueue(tracker, [CRIMSON_FLAMETHROWER_KILLSTREAK_ID, 'nuke']);
    expect(headCarePackageId(tracker, 'owner')).toBe(first);
  });

  it('scopes ids to the match epoch and to the owner', () => {
    const tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), ['nuke']);
    expect(headCarePackageId(tracker, 'owner')).not.toBe(headCarePackageId(tracker, 'guest-b'));
    const nextEpoch = advanceCareRewardQueue(tracker, ['nuke'], 8);
    expect(nextEpoch.consumedCount).toBe(0);
    expect(headCarePackageId(nextEpoch, 'owner')).not.toBe(headCarePackageId(tracker, 'owner'));
  });
});

describe('HF-509 redemption press loop', () => {
  function harness(hostAdmits = true) {
    const ledger = createCarePackageGrantLedger();
    let tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    const grants: number[] = [];
    let hostRequests = 0;
    const press = (claimantId = 'owner') => redeemCarePackageWeaponGrant({
      packageId: headCarePackageId(tracker, claimantId),
      claimantId,
      lifeId: 1,
      ledger,
      requestHostConsumption: () => { hostRequests += 1; return hostAdmits; },
      grant: () => { grants.push(grants.length); },
    });
    return {
      press,
      ledger,
      grantCount: () => grants.length,
      hostRequestCount: () => hostRequests,
      hostConsumed: () => { tracker = advanceCareRewardQueue(tracker, []); },
    };
  }

  it('grants exactly once and asks the host exactly once across 25 presses', () => {
    const rig = harness();
    const outcomes = Array.from({ length: 25 }, () => rig.press());
    expect(outcomes.filter((outcome) => outcome.granted)).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ granted: true, reason: 'granted' });
    expect(outcomes.slice(1).every((outcome) => outcome.reason === 'already-claimed')).toBe(true);
    expect(rig.grantCount()).toBe(1);
    // The regression also spammed the network; a refused press must not send.
    expect(rig.hostRequestCount()).toBe(1);
  });

  it('stops entirely once the host snapshot clears the queue', () => {
    const rig = harness();
    expect(rig.press().granted).toBe(true);
    rig.hostConsumed();
    for (let press = 0; press < 5; press += 1) {
      expect(rig.press()).toMatchObject({ granted: false, reason: 'no-package', packageId: null });
    }
    expect(rig.grantCount()).toBe(1);
  });

  it('never grants when the host refuses, and leaves the reward retryable', () => {
    const ledger = createCarePackageGrantLedger();
    const tracker = advanceCareRewardQueue(createCareRewardQueueTracker(7), [CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
    let admit = false;
    let granted = 0;
    const press = () => redeemCarePackageWeaponGrant({
      packageId: headCarePackageId(tracker, 'owner'),
      claimantId: 'owner',
      lifeId: 1,
      ledger,
      requestHostConsumption: () => admit,
      grant: () => { granted += 1; },
    });
    expect(press()).toMatchObject({ granted: false, reason: 'host-refused' });
    expect(granted).toBe(0);
    admit = true;
    expect(press().granted).toBe(true);
    expect(granted).toBe(1);
    expect(press()).toMatchObject({ granted: false, reason: 'already-claimed' });
    expect(granted).toBe(1);
  });

  it('refuses a second claimant on the same package instance', () => {
    const ledger = createCarePackageGrantLedger();
    const packageId = 'care-7-shared-0';
    let granted = 0;
    const press = (claimantId: string) => redeemCarePackageWeaponGrant({
      packageId,
      claimantId,
      lifeId: 1,
      ledger,
      requestHostConsumption: () => true,
      grant: () => { granted += 1; },
    });
    expect(press('owner').granted).toBe(true);
    expect(press('guest-b')).toMatchObject({ granted: false, reason: 'package-consumed' });
    expect(granted).toBe(1);
  });
});

describe('HF-509 legacy-main redemption wiring', () => {
  const body = (): string => {
    const start = legacyMain.indexOf('function redeemCarePackageWeaponReward(');
    expect(start).toBeGreaterThan(-1);
    return legacyMain.slice(start, legacyMain.indexOf('\nfunction ', start + 1));
  };

  it('redeems the crimson care reward through the redemption function, not a bare grant', () => {
    expect(legacyMain).toContain('if (revealedCareReward === CRIMSON_FLAMETHROWER_KILLSTREAK_ID) {');
    expect(legacyMain).toContain('redeemCarePackageWeaponReward(CRIMSON_FLAMETHROWER_KILLSTREAK_ID);');
    // The regression: activateFieldSupport called the grant directly and returned.
    expect(legacyMain).not.toContain('    grantCrimsonFlamethrower();\n    return;');
  });

  it('claims the package instance before granting, and grants only once admitted', () => {
    const source = body();
    expect(source).toContain('redeemCarePackageWeaponGrant({');
    expect(source).toContain('carePackageGrantLedger');
    expect(source).toContain('headCarePackageId(careRewardQueueTracker, player.id)');
  });

  it('consumes the reward host-authoritatively and rolls the claim back if the host refuses', () => {
    const source = body();
    expect(source).toContain('requestHostConsumption: () => requestKillstreakActivation(');
    expect(source).toContain('grant: () => grantCrimsonFlamethrower(');
    expect(source.indexOf('requestHostConsumption')).toBeLessThan(source.indexOf('grant: () =>'));
  });

  it('keeps the local queue tracker fed from the replicated snapshot', () => {
    expect(legacyMain).toContain('careRewardQueueTracker = advanceCareRewardQueue(');
    expect(legacyMain).toContain('killstreakMatchEpoch');
  });

  it('still grants finite personal ammo without touching timed-map-weapon authority', () => {
    const start = legacyMain.indexOf('function grantCrimsonFlamethrower(');
    const grant = legacyMain.slice(start, legacyMain.indexOf('\nfunction ', start + 1));
    expect(grant).toContain('player.ammo[weapon] = WEAPONS[weapon].mag');
    expect(grant).toContain('player.reserve[weapon] = WEAPONS[weapon].reserve');
    expect(grant).not.toContain('claimTimedMapWeapon');
    expect(grant).not.toContain('applyTimedMapWeaponState');
  });
});

const DEFAULT_WORLD: KillstreakWorld = {
  bounds: { minX: -40, maxX: 40, minZ: -45, maxZ: 45, floorY: 0, ceilingY: 40 },
  targets: [
    { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
    { id: 'guest-b', kind: 'player', team: 0, lifeId: 1, alive: true, position: [0, 1.7, 0] },
  ],
  hasLineOfSight: () => true,
  isFlightPositionValid: () => true,
};

function loadout(slots: readonly [string, string, string, string, string]) {
  return parseKillstreakLoadout({ schemaVersion: 1, slots });
}

function activateIntent(
  expectedId: KillstreakActivationIntent['expectedId'],
  matchEpoch: number,
  sequence: number,
  by = 'owner',
): KillstreakActivationIntent {
  return {
    by, matchEpoch, lifeId: 1, sequence, slot: 1,
    activationId: `activation-${by}-${expectedId}-${sequence}`,
    expectedId, anchor: [0, 0, 0],
  };
}

/**
 * The care roll is seeded from the match epoch and activation id, so the
 * crimson band is reachable deterministically by scanning epochs rather than by
 * weakening the roll or injecting a test-only reward path.
 */
function hostWithCrimsonCrate(): Readonly<{ runtime: HostKillstreakRuntime; matchEpoch: number; crateId: string }> {
  for (let matchEpoch = 1; matchEpoch <= 400; matchEpoch += 1) {
    const runtime = new HostKillstreakRuntime(matchEpoch);
    runtime.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    runtime.registerActor('guest-b', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    for (let kill = 0; kill < 4; kill += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const admission = runtime.activate(activateIntent('care-package', matchEpoch, 1), 1_000, DEFAULT_WORLD);
    if (!admission.accepted) continue;
    const crateId = admission.entityIds.find((id) => id.includes('-care-'))!;
    runtime.advance(7_100, DEFAULT_WORLD);
    const probe = new HostKillstreakRuntime(matchEpoch);
    probe.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
    for (let kill = 0; kill < 4; kill += 1) probe.recordEligibleElimination('owner', 'weapon');
    const probeCrate = probe.activate(activateIntent('care-package', matchEpoch, 1), 1_000, DEFAULT_WORLD)
      .entityIds.find((id) => id.includes('-care-'))!;
    probe.advance(7_100, DEFAULT_WORLD);
    probe.beginCareCapture('owner', 1, probeCrate, 7_100, DEFAULT_WORLD);
    if (probe.snapshotFor('owner', 7_100).actors.find((actor) => actor.actorId === 'owner')
      ?.revealedCareRewards[0] === CRIMSON_FLAMETHROWER_KILLSTREAK_ID) {
      return Object.freeze({ runtime, matchEpoch, crateId });
    }
  }
  throw new Error('no match epoch produced a crimson care reward');
}

describe('HF-509 host-authoritative guest claim path', () => {
  it('consumes and removes the crate on the first claim and replicates that to every peer', () => {
    const { runtime, crateId } = hostWithCrimsonCrate();
    expect(runtime.snapshotFor('guest-b', 7_100).entities.some((entity) => entity.id === crateId)).toBe(true);

    expect(runtime.beginCareCapture('owner', 1, crateId, 7_100, DEFAULT_WORLD))
      .toMatchObject({ accepted: true, reason: 'accepted' });

    // Consumed and removed, for the claimant AND for a peer who never saw it taken.
    expect(runtime.snapshotFor('owner', 7_101).entities.some((entity) => entity.id === crateId)).toBe(false);
    expect(runtime.snapshotFor('guest-b', 7_101).entities.some((entity) => entity.id === crateId)).toBe(false);
    expect(runtime.snapshotFor(null, 7_101).entities.some((entity) => entity.id === crateId)).toBe(false);
  });

  it('refuses a guest double-claim and a second guest arriving after the grant', () => {
    const { runtime, crateId } = hostWithCrimsonCrate();
    expect(runtime.beginCareCapture('owner', 1, crateId, 7_100, DEFAULT_WORLD).accepted).toBe(true);
    // Same guest, pressing again on the same package.
    expect(runtime.beginCareCapture('owner', 1, crateId, 7_110, DEFAULT_WORLD))
      .toMatchObject({ accepted: false, reason: 'crate-unavailable' });
    // A second guest who walks up afterwards sees a consumed package.
    expect(runtime.beginCareCapture('guest-b', 1, crateId, 7_120, DEFAULT_WORLD))
      .toMatchObject({ accepted: false, reason: 'crate-unavailable' });
    expect(runtime.snapshotFor('guest-b', 7_120).actors.find((actor) => actor.actorId === 'guest-b')
      ?.revealedCareRewards).toEqual([]);
    expect(runtime.snapshotFor('owner', 7_120).actors.find((actor) => actor.actorId === 'owner')
      ?.revealedCareRewards).toEqual([CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
  });

  it('redeems the crimson reward exactly once through the normal activation admission', () => {
    const { runtime, matchEpoch, crateId } = hostWithCrimsonCrate();
    runtime.beginCareCapture('owner', 1, crateId, 7_100, DEFAULT_WORLD);

    const first = runtime.activate(activateIntent(CRIMSON_FLAMETHROWER_KILLSTREAK_ID, matchEpoch, 2), 7_200, DEFAULT_WORLD);
    expect(first).toMatchObject({ accepted: true, activatedId: CRIMSON_FLAMETHROWER_KILLSTREAK_ID });
    expect(runtime.snapshotFor('owner', 7_201).actors.find((actor) => actor.actorId === 'owner')
      ?.revealedCareRewards).toEqual([]);

    // Every later press: the queue is empty, so slot one is the loadout streak
    // again and a crimson intent no longer matches host authority.
    for (let press = 3; press < 8; press += 1) {
      expect(runtime.activate(activateIntent(CRIMSON_FLAMETHROWER_KILLSTREAK_ID, matchEpoch, press), 7_200 + press, DEFAULT_WORLD))
        .toMatchObject({ accepted: false, reason: 'selection-mismatch' });
    }
    // And a replayed activation id cannot resurrect the first grant.
    expect(runtime.activate(activateIntent('care-package', matchEpoch, 1), 7_300, DEFAULT_WORLD))
      .toMatchObject({ accepted: false, reason: 'replayed-sequence' });
  });
});

describe('HF-509 every other care-package content follows the same rule', () => {
  it('leaves exactly one care-pool reward outside the field-support activation path', () => {
    const poolIds = [...new Set(PASS65_KILLSTREAK_CATALOG.carePackagePool.entries.map((entry) => entry.id))];
    const nonFieldSupport = poolIds.filter((id) => !(FIELD_SUPPORT_IDS as readonly string[]).includes(id));
    // If a second weapon-grant reward is ever added it must be wired through
    // the same ledger; this pin fails until it is.
    expect(nonFieldSupport).toEqual([CRIMSON_FLAMETHROWER_KILLSTREAK_ID]);
  });

  it('routes every field-support care reward through host activation, which shifts the queue', () => {
    const { runtime, matchEpoch } = (() => {
      const rt = new HostKillstreakRuntime(11);
      rt.registerActor('owner', 0, 1, loadout(['care-package', 'yardhawk', 'tri-pass', 'chopper', 'nuke']));
      return { runtime: rt, matchEpoch: 11 };
    })();
    // Grant a field-support care reward through the audited training bridge and
    // confirm one activation consumes it and a second is refused.
    expect(runtime.grantTrainingReward('owner', 1, 'piloted-drone', {
      arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'offline',
    })).toMatchObject({ accepted: true });
    expect(runtime.activate(activateIntent('piloted-drone', matchEpoch, 1), 1_000, DEFAULT_WORLD))
      .toMatchObject({ accepted: true });
    expect(runtime.snapshotFor('owner', 1_001).actors[0].revealedCareRewards).toEqual([]);
    expect(runtime.activate(activateIntent('piloted-drone', matchEpoch, 2), 1_100, DEFAULT_WORLD))
      .toMatchObject({ accepted: false });
  });

  it('never lets the weapon reward be selected into a killstreak slot', () => {
    expect(FIELD_SUPPORT_IDS as readonly string[]).not.toContain(CRIMSON_FLAMETHROWER_KILLSTREAK_ID);
  });
});
