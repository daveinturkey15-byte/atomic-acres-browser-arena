import { describe, expect, it } from 'vitest';
import {
  EXPLOSIVE_BOLT_ARM_DELAY_MS,
  EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE,
  EXPLOSIVE_BOLT_BLAST_RADIUS_M,
  EXPLOSIVE_BOLT_DIRECT_DAMAGE,
  EXPLOSIVE_BOLT_MAX_LIFE_MS,
  calculateFlashExposure,
  detonateExplosiveBolt,
  explosiveBoltBlastDamage,
  explosiveBoltReadyToDetonate,
  impactExplosiveBolt,
  launchExplosiveBolt,
  recordGrenadeKill,
  replenishGrenadeFromCorpse,
  smokeBlocksTargetAcquisition,
  shouldResolveFlashAgainstBots,
  spawnGrenadeInventory,
  spendSelectedGrenade,
  targetAcquisitionAllowed,
} from './ordnance';

describe('Pass 65 ordnance rules', () => {
  it('spawns and caps the selected grenade at one without kill replenishment', () => {
    const spawned = spawnGrenadeInventory('smoke');
    expect(spawned).toMatchObject({ selected: 'smoke', count: 1 });
    const thrown = spendSelectedGrenade(spawned);
    expect(thrown).toMatchObject({ accepted: true, inventory: { selected: 'smoke', count: 0 } });
    expect(spendSelectedGrenade(thrown.inventory).accepted).toBe(false);
    expect(recordGrenadeKill(thrown.inventory).inventory.count).toBe(0);
  });

  it('replenishes the selected grenade on a corpse-ammo pickup exactly once', () => {
    const empty = spendSelectedGrenade(spawnGrenadeInventory('flash')).inventory;
    const first = replenishGrenadeFromCorpse(empty, 'corpse-1');
    expect(first).toMatchObject({ accepted: true, grenadeGranted: 1, inventory: { selected: 'flash', count: 1 } });
    const duplicate = replenishGrenadeFromCorpse(first.inventory, 'corpse-1');
    expect(duplicate).toMatchObject({ accepted: false, grenadeGranted: 0 });
    expect(duplicate.inventory).toBe(first.inventory);
  });

  it('lets smoke block acquisition but never turns smoke into bullet geometry', () => {
    const smoke = [{ id: 's1', centre: { x: 5, y: 1, z: 0 }, radiusM: 2, startsAtMs: 100, expiresAtMs: 10_000 }];
    const observer = { x: 0, y: 1, z: 0 };
    const target = { x: 10, y: 1, z: 0 };
    expect(smokeBlocksTargetAcquisition(observer, target, smoke, 500)).toBe(true);
    expect(targetAcquisitionAllowed({ observer, target, smokeVolumes: smoke, nowMs: 500, thermalSmokeOnly: false, solidOccluded: false })).toBe(false);
    expect(targetAcquisitionAllowed({ observer, target, smokeVolumes: smoke, nowMs: 500, thermalSmokeOnly: true, solidOccluded: false })).toBe(true);
    expect(targetAcquisitionAllowed({ observer, target, smokeVolumes: smoke, nowMs: 500, thermalSmokeOnly: true, solidOccluded: true })).toBe(false);
  });

  it('opens a short-lived sight corridor along an admitted bullet path through smoke', () => {
    const observer = { x: 0, y: 1, z: 0 };
    const target = { x: 10, y: 1, z: 0 };
    const volume = {
      id: 's1', centre: { x: 5, y: 1, z: 0 }, radiusM: 2, startsAtMs: 100, expiresAtMs: 10_000,
      corridors: [{ start: observer, end: target, radiusM: 0.42, expiresAtMs: 1_400 }],
    };
    expect(smokeBlocksTargetAcquisition(observer, target, [volume], 1_000)).toBe(false);
    expect(smokeBlocksTargetAcquisition(observer, { x: 10, y: 1, z: 1.2 }, [volume], 1_000)).toBe(true);
    expect(smokeBlocksTargetAcquisition(observer, target, [volume], 1_401)).toBe(true);
  });

  it('bounds flash by distance, facing, solid cover, and friendly attenuation', () => {
    const base = {
      origin: { x: 0, y: 1.5, z: -2 }, eyes: { x: 0, y: 1.5, z: 0 },
      lookDirection: { x: 0, y: 0, z: -1 }, maximumRadiusM: 14, solidOccluded: false,
    };
    const hostile = calculateFlashExposure({ ...base, friendly: false });
    const friendly = calculateFlashExposure({ ...base, friendly: true });
    expect(hostile.accepted).toBe(true);
    expect(friendly.intensity).toBeCloseTo(hostile.intensity * 0.5);
    expect(friendly.durationMs).toBe(Math.round(hostile.durationMs * 0.5));
    expect(calculateFlashExposure({ ...base, friendly: false, solidOccluded: true }).intensity).toBe(0);
  });

  it('lets the host resolve admitted guest flash against bots without client-side AI mutation', () => {
    expect(shouldResolveFlashAgainstBots('host', 'remote')).toBe(true);
    expect(shouldResolveFlashAgainstBots('offline', 'player')).toBe(true);
    expect(shouldResolveFlashAgainstBots('client', 'remote')).toBe(false);
  });

  it('arms an attached explosive bolt after 1250ms and detonates at most once', () => {
    const launched = launchExplosiveBolt('bolt-1', 'p1', 3, 1_000);
    const impacted = impactExplosiveBolt(launched, {
      kind: 'combatant', targetId: 'p2', targetLifeId: 7, localOffset: { x: 0, y: 1, z: 0 },
    }, 1_200);
    expect(impacted.armedAtMs).toBe(1_200 + EXPLOSIVE_BOLT_ARM_DELAY_MS);
    expect(impactExplosiveBolt(impacted, { kind: 'world', position: { x: 99, y: 0, z: 0 } }, 1_300)).toBe(impacted);
    expect(explosiveBoltReadyToDetonate(impacted, impacted.armedAtMs! - 1)).toBe(false);
    const detonated = detonateExplosiveBolt(impacted, impacted.armedAtMs!);
    expect(detonated.detonatedAtMs).toBe(impacted.armedAtMs);
    expect(detonateExplosiveBolt(detonated, impacted.armedAtMs! + 1)).toBe(detonated);
    expect(EXPLOSIVE_BOLT_DIRECT_DAMAGE).toBe(45);
  });

  it('expires unimpacted bolts at five seconds and applies the approved blast curve', () => {
    const launched = launchExplosiveBolt('bolt-2', 'p1', 1, 50);
    expect(explosiveBoltReadyToDetonate(launched, 50 + EXPLOSIVE_BOLT_MAX_LIFE_MS - 1)).toBe(false);
    expect(explosiveBoltReadyToDetonate(launched, 50 + EXPLOSIVE_BOLT_MAX_LIFE_MS)).toBe(true);
    expect(explosiveBoltBlastDamage(0)).toBe(60);
    expect(explosiveBoltBlastDamage(EXPLOSIVE_BOLT_BLAST_RADIUS_M)).toBe(EXPLOSIVE_BOLT_BLAST_MIN_DAMAGE);
    expect(explosiveBoltBlastDamage(EXPLOSIVE_BOLT_BLAST_RADIUS_M + 0.01)).toBe(0);
  });
});
