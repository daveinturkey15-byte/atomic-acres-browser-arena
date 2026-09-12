import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponPresentation } from './weapon-presentation';

/**
 * HF-399 RESIDUAL (assigned to Lane W by the brief addendum and the owner
 * ledger, 17:10) - THE VIEWMODEL MUST STOP RE-SEARCHING ITS OWN RIG EVERY
 * FRAME.
 *
 * Lane A measured `WeaponPresentation.update` at ~22% of a profiled frame, with
 * `solveRiggedArms` dominant and ~10,000 name/property searches per frame across
 * the scene. Each `Object3D.getObjectByName` is a full depth-first traversal,
 * and the viewmodel ran nine of them per frame for nodes that cannot change
 * between frames unless the mounted model does.
 *
 * MEASURED HERE, before and after, on the same tree - the "before" arm restores
 * the exact pre-repair expression (`model.getObjectByName(name)`) at the same
 * call sites, so this is a like-for-like count, not two different programs:
 *
 *   carbine 9.00 -> 2.03 calls/frame, 1850.0 -> 126.1 nodes visited/frame
 *   lmg     9.00 -> 2.03 calls/frame, 2025.0 -> 176.9 nodes visited/frame
 *   sniper  9.00 -> 3.03 calls/frame, 2060.0 -> 279.1 nodes visited/frame
 *   pistol  9.00 -> 2.03 calls/frame, 1619.0 ->  59.0 nodes visited/frame
 *
 * The residual is MISSES ONLY ('pump' on non-shotguns, 'reload-shell' where the
 * rig has none). Misses are deliberately not cached: a stale `null` here is a
 * missing hand or a missing muzzle, and a negative would have to be invalidated
 * by every path that mounts an attachment. Hits are cached and revalidated by
 * walking the cached node's parent chain back to the model, which is why a
 * re-parented or swapped socket is re-resolved rather than served stale - the
 * second test below is that falsifier.
 *
 * These numbers are the headless catalog rig. The shipped GLB rigs are larger,
 * so this is a floor on the saving, not a ceiling.
 */
const REST_POSE = {
  dt: 1 / 60,
  moving: false,
  sprinting: false,
  crouched: false,
  prone: false,
  ads: false,
  phase: 0,
  landingImpulse: 0,
  lateralSpeed: 0,
  reloadProgress: null,
};

type NamedNodeLookup = (model: THREE.Object3D | undefined, name: string) => THREE.Object3D | undefined;

function censusOverFrames(presentation: WeaponPresentation, frames: number): {
  calls: number;
  visited: number;
  names: Map<string, number>;
} {
  const proto = THREE.Object3D.prototype as unknown as {
    getObjectByName: (name: string) => THREE.Object3D | undefined;
  };
  const original = proto.getObjectByName;
  let calls = 0;
  let visited = 0;
  const names = new Map<string, number>();
  proto.getObjectByName = function counted(this: THREE.Object3D, name: string) {
    calls += 1;
    names.set(name, (names.get(name) ?? 0) + 1);
    this.traverse(() => { visited += 1; });
    return original.call(this, name);
  };
  try {
    for (let frame = 0; frame < frames; frame += 1) {
      presentation.update({ ...REST_POSE, reloadProgress: 0.5 });
    }
  } finally {
    proto.getObjectByName = original;
  }
  return { calls, visited, names };
}

describe('HF-399 viewmodel named-node cache', () => {
  it('performs no repeat name search for any node the mounted rig actually has', async () => {
    const proto = WeaponPresentation.prototype as unknown as Record<string, NamedNodeLookup>;
    const cached = proto.cachedNamedNode;
    expect(typeof cached, 'the cache accessor exists to be measured').toBe('function');
    const uncached: NamedNodeLookup = (model, name) => (model ? model.getObjectByName(name) : undefined);

    for (const weapon of ['carbine', 'lmg', 'sniper', 'pistol'] as const) {
      const measure = async (lookup: NamedNodeLookup) => {
        proto.cachedNamedNode = lookup;
        try {
          const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
          const presentation = new WeaponPresentation(camera, false);
          await presentation.load();
          presentation.setWeapon(weapon, true);
          // Warm the rig (and the cache) before counting, so this measures the
          // steady state a player is in, not first-mount.
          for (let frame = 0; frame < 30; frame += 1) presentation.update({ ...REST_POSE });
          return censusOverFrames(presentation, 30);
        } finally {
          proto.cachedNamedNode = cached;
        }
      };
      const before = await measure(uncached);
      const after = await measure(cached);

      expect(before.calls, `${weapon}: the uncached baseline searches every frame`)
        .toBeGreaterThanOrEqual(30 * 8);
      // Every socket and part the rig HAS is resolved once and never searched
      // for again. Only genuine absences may repeat.
      // 'muzzle-socket' is searched per frame only on the RIGGED arm solve,
      // which the shipped GLB rigs take and this headless harness does not; it
      // is covered by the staleness test below instead of being asserted on a
      // path this fixture never enters.
      for (const name of ['grip-socket-r', 'support-socket-l', 'first-person-arms']) {
        expect(before.names.get(name) ?? 0, `${weapon}: ${name} was searched per frame before`)
          .toBeGreaterThan(0);
        expect(after.names.get(name) ?? 0, `${weapon}: ${name} must not be searched again`).toBe(0);
      }
      expect(after.calls, `${weapon}: per-frame name searches`).toBeLessThanOrEqual(before.calls / 2);
      expect(after.visited, `${weapon}: nodes visited by name searches per frame`)
        .toBeLessThanOrEqual(before.visited / 4);
    }
  }, 180_000);

  it('re-resolves rather than serving a socket that has been detached or replaced', async () => {
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 250);
    const presentation = new WeaponPresentation(camera, false);
    await presentation.load();
    presentation.setWeapon('carbine', true);
    for (let frame = 0; frame < 30; frame += 1) presentation.update({ ...REST_POSE });
    const model = (presentation as unknown as { mountedModel(): THREE.Object3D }).mountedModel();
    const lookup = (presentation as unknown as { cachedNamedNode: NamedNodeLookup }).cachedNamedNode
      .bind(presentation);

    const first = lookup(model, 'muzzle-socket');
    expect(first, 'the socket resolves at all').toBeDefined();
    expect(lookup(model, 'muzzle-socket'), 'a warm hit is the same node').toBe(first);

    // Swap the socket for a different node with the same name, exactly as an
    // attachment rebuild would. A cache that trusted its first answer would
    // keep posing the hand onto a node no longer in the rig.
    const parent = (first as THREE.Object3D).parent as THREE.Object3D;
    (first as THREE.Object3D).removeFromParent();
    const replacement = new THREE.Object3D();
    replacement.name = 'muzzle-socket';
    replacement.position.set(0.123, 0.456, 0.789);
    parent.add(replacement);

    expect(lookup(model, 'muzzle-socket'), 'the replacement is found, not the detached node')
      .toBe(replacement);

    // And a name the rig genuinely does not have never resolves to anything.
    expect(lookup(model, 'a-socket-this-rig-does-not-have')).toBeUndefined();
  }, 60_000);
});
