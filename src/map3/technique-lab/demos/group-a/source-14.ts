/**
 * Source 14 — Modern Claudefare (`modernclaudefare.com`).
 *
 * Fetched 2026-09-12: HTTP 200, 138,790 bytes of client-rendered application
 * shell. No source repository, no reusable asset licence, no technique
 * publication, and the site presents a fan-made non-commercial experience. So
 * the register's decision stands unchanged: COMPARATOR ONLY. Nothing here copies
 * code, a map, an asset or a brand, and attractive frames are not gameplay or
 * performance evidence.
 *
 * What a comparator row can honestly deliver is the rubric, implemented with our
 * own primitives so the named properties can be argued about on screen:
 *   - offscreen-connected arm and weapon silhouette (the arm must leave frame
 *     attached to a body, not float as a severed prop)
 *   - weapon-versus-arm material contrast
 *   - a local muzzle-lit read that shows the weapon's form
 *
 * BEFORE: the failure this rubric exists to catch — a floating weapon with a
 * detached hand, arm and weapon sharing one material, no local light.
 * AFTER: forearm connected back past the near plane to a shoulder anchor,
 * distinct weapon material, and one positioned muzzle light.
 *
 * This demo creates a local light. It is named in metadata.localLights and it is
 * the technique, not decoration.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

interface Viewmodel {
  group: THREE_NS.Group;
  muzzle: THREE_NS.Object3D;
  light: THREE_NS.PointLight | null;
}

function buildViewmodel(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  connected: boolean,
): Viewmodel {
  const group = new THREE.Group();

  const skin = registry.track(new THREE.MeshStandardMaterial({ color: 0xb98a6a, roughness: 0.72, metalness: 0.02 }));
  const sleeve = registry.track(new THREE.MeshStandardMaterial({ color: 0x4a5240, roughness: 0.9 }));
  // Contrast is the point: gunmetal is low-roughness and metallic, the arm is not.
  const gunmetal = registry.track(
    new THREE.MeshStandardMaterial({
      color: connected ? 0x2a2d33 : 0xb98a6a,
      roughness: connected ? 0.28 : 0.72,
      metalness: connected ? 0.88 : 0.02,
    }),
  );
  const polymer = registry.track(
    new THREE.MeshStandardMaterial({ color: connected ? 0x17181b : 0xb98a6a, roughness: connected ? 0.62 : 0.72 }),
  );

  // Weapon: receiver, barrel, magazine, stock — enough shapes to read as one.
  const receiverGeometry = registry.track(new THREE.BoxGeometry(0.09, 0.1, 0.5));
  const receiver = new THREE.Mesh(receiverGeometry, gunmetal);
  receiver.position.set(0.1, 0.42, -0.1);
  receiver.name = 'receiver';
  group.add(receiver);

  const barrelGeometry = registry.track(new THREE.CylinderGeometry(0.018, 0.02, 0.34, 10));
  barrelGeometry.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeometry, gunmetal);
  barrel.position.set(0.1, 0.44, -0.44);
  barrel.name = 'barrel';
  group.add(barrel);

  const magGeometry = registry.track(new THREE.BoxGeometry(0.05, 0.18, 0.1));
  const magazine = new THREE.Mesh(magGeometry, polymer);
  magazine.position.set(0.1, 0.31, -0.08);
  magazine.rotation.x = 0.2;
  group.add(magazine);

  const stockGeometry = registry.track(new THREE.BoxGeometry(0.07, 0.09, 0.24));
  const stock = new THREE.Mesh(stockGeometry, polymer);
  stock.position.set(0.1, 0.4, 0.24);
  group.add(stock);

  // Forearm. CONNECTED means it continues back past where the near plane would
  // cut, to a shoulder anchor — so no viewpoint shows a severed limb.
  const armLength = connected ? 0.62 : 0.2;
  const armGeometry = registry.track(new THREE.CapsuleGeometry(0.045, armLength, 4, 10));
  armGeometry.rotateX(Math.PI / 2);
  const arm = new THREE.Mesh(armGeometry, connected ? sleeve : skin);
  arm.position.set(0.13, 0.36, connected ? 0.32 : 0.1);
  arm.name = connected ? 'forearm-connected-offscreen' : 'forearm-floating';
  group.add(arm);

  const handGeometry = registry.track(new THREE.BoxGeometry(0.06, 0.07, 0.1));
  const hand = new THREE.Mesh(handGeometry, skin);
  hand.position.set(0.12, 0.345, 0.02);
  group.add(hand);

  if (connected) {
    const shoulderGeometry = registry.track(new THREE.SphereGeometry(0.07, 10, 8));
    const shoulder = new THREE.Mesh(shoulderGeometry, sleeve);
    shoulder.position.set(0.16, 0.34, 0.62);
    shoulder.name = 'shoulder-anchor';
    group.add(shoulder);
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0.1, 0.44, -0.62);
  group.add(muzzle);

  let light: THREE_NS.PointLight | null = null;
  if (connected) {
    light = new THREE.PointLight(0xffd9a8, 0, 1.2, 2);
    light.name = 'local:muzzle-flash';
    muzzle.add(light);
  }

  return { group, muzzle, light };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const bad = buildViewmodel(THREE, registry, false);
  const good = buildViewmodel(THREE, registry, true);
  bad.group.name = 'before:floating-weapon-one-material-no-local-light';
  good.group.name = 'after:offscreen-connected-contrasted-muzzle-lit';

  const root = sideBySide(THREE, registry, bad.group, good.group, 1.8);
  root.name = 'source-14:viewmodel-comparator';

  const metadata = {
    sourceId: 14,
    title: 'Modern Claudefare',
    method:
      'First-person viewmodel comparator rubric: the arm silhouette must continue offscreen to a body anchor rather than float, the weapon must contrast against the arm in roughness and metalness, and one local muzzle light must reveal the weapon form.',
    adaptation: 'adapted' as const,
    sources: [
      'https://www.modernclaudefare.com/',
      'fetched 2026-09-12: HTTP 200, client-rendered shell, no technique content served',
    ],
    limitation:
      'Comparator-only: the site publishes no source, no technique and no reusable asset licence, and is a fan-made non-commercial experience. No code, map, asset or brand is copied and none of its frames are reproduced. The rubric here is ours; matching the comparator is NOT claimed, and rendered quality is unverified in this lane.',
    localLights: good.light ? [good.light.name] : [],
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      materialsInWeapon: 2,
    },
  };

  return {
    root,
    update(time: number) {
      // A bounded, deterministic fire cadence so the muzzle light has a reason
      // to exist and can be seen turning on and off.
      const phase = time % 1.6;
      const flash = phase < 0.06 ? 1 - phase / 0.06 : 0;
      if (good.light) good.light.intensity = flash * 6;
      const recoil = flash * 0.03;
      good.group.position.z = recoil;
      bad.group.position.z = recoil;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
