import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { applyRiggedCarbineFingerCurlToBone, batchStaticMeshes, buildWeaponModel, optimizeAttachedWeapon, texturedMaterial, waitForPendingArtTextures } from './art-kit';

describe('rigged carbine finger wrap', () => {
  it('replays both hardware poses on the rendered Pinky2L bone and clears the retained bind threshold', () => {
    const bind = new THREE.Quaternion(
      0.03783821687102318,
      0.17641645669937134,
      -0.06506747752428055,
      0.9814335107803345,
    );
    const tracedAfterOldCurl = [
      new THREE.Quaternion(-0.35393805909048315, 0.21481179440852435, -0.12095894931648729, 0.9022068113105155),
      new THREE.Quaternion(0.04416943606473711, 0.14839248963520346, -0.19099170836858365, 0.9693222512109313),
    ];
    const oldCurlInverse = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0, 'XYZ'));
    const replay = (trace: THREE.Quaternion, curlRadians: number) => {
      const bone = new THREE.Bone();
      bone.name = 'Pinky2L';
      bone.quaternion.copy(trace).multiply(oldCurlInverse);
      applyRiggedCarbineFingerCurlToBone(bone, curlRadians);
      return { bone, bindDeltaRadians: bone.quaternion.angleTo(bind) };
    };

    const oldSecond = replay(tracedAfterOldCurl[1], -0.42);
    expect(oldSecond.bindDeltaRadians).toBeCloseTo(0.2593672251552949, 12);
    expect(oldSecond.bindDeltaRadians >= 0.35).toBe(false);

    const corrected = tracedAfterOldCurl.map((trace) => replay(trace, -0.76));
    expect(corrected[0].bindDeltaRadians).toBeCloseTo(1.1422203698059192, 12);
    expect(corrected[1].bindDeltaRadians).toBeCloseTo(0.3746668889113999, 12);
    expect(corrected.every(({ bindDeltaRadians }) => bindDeltaRadians >= 0.35)).toBe(true);
    expect(corrected[1].bone.quaternion.angleTo(oldSecond.bone.quaternion)).toBeCloseTo(0.339595123444383, 12);
  });

  it('replays both hardware poses on Pinky2R without phase-cancelling the firing-hand wrap', () => {
    const bind = new THREE.Quaternion(
      0.03783833980560303,
      -0.1764165163040161,
      0.06506768614053726,
      0.9814335107803345,
    );
    const tracedAfterOldCurl = [
      new THREE.Quaternion(-0.5778872235655073, -0.24442568285682092, 0.07340550207689384, 0.775196179747526),
      new THREE.Quaternion(-0.12608956202419042, 0.13168703956221717, -0.20287110996152946, -0.9621008201448803),
    ];
    const oldCurlInverse = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.82, 0, 0, 'XYZ'));
    const replay = (trace: THREE.Quaternion, curlRadians: number) => {
      const bone = new THREE.Bone();
      bone.name = 'Pinky2R';
      bone.quaternion.copy(trace).multiply(oldCurlInverse);
      applyRiggedCarbineFingerCurlToBone(bone, curlRadians);
      return { bone, bindDeltaRadians: bone.quaternion.angleTo(bind) };
    };

    const old = tracedAfterOldCurl.map((trace) => replay(trace, -0.82));
    expect(old[0].bindDeltaRadians).toBeCloseTo(1.3302674277261661, 12);
    expect(old[1].bindDeltaRadians).toBeCloseTo(0.34169386046352035, 12);
    expect(old[1].bindDeltaRadians >= 0.35).toBe(false);

    const corrected = tracedAfterOldCurl.map((trace) => replay(trace, -0.78));
    expect(corrected[0].bindDeltaRadians).toBeCloseTo(1.2914456606563347, 12);
    expect(corrected[1].bindDeltaRadians).toBeCloseTo(0.36981904581827996, 12);
    expect(corrected.every(({ bindDeltaRadians }) => bindDeltaRadians >= 0.35)).toBe(true);
    expect(corrected[1].bone.quaternion.toArray()).toEqual([
      -0.14530507857983138,
      0.1276035513223795,
      -0.20546410230402973,
      -0.9593867832703411,
    ]);

    const clearsRetainedBindDelta = (radians: number) => radians >= 0.35;
    expect(clearsRetainedBindDelta(0.349)).toBe(false);
    expect(clearsRetainedBindDelta(0.35)).toBe(true);
  });
});

describe('authored texture readiness', () => {
  it('waits for null-image TextureLoader placeholders before WebGPU scene compilation', async () => {
    vi.stubGlobal('document', {});
    const load = vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((_url: string, onLoad?: (texture: THREE.Texture) => void) => {
      const value = new THREE.Texture();
      value.needsUpdate = true;
      queueMicrotask(() => {
        value.image = { complete: true, width: 1, height: 1 };
        onLoad?.(value);
      });
      return value;
    }) as THREE.TextureLoader['load']);
    try {
      const material = texturedMaterial('/qa/pass64-delayed-texture.png');
      expect(material.map?.image).toBeNull();

      await waitForPendingArtTextures();

      expect(material.map?.image).toMatchObject({ complete: true, width: 1, height: 1 });
    } finally {
      load.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('palette static batching', () => {
  it('preserves ordinary material colours instead of blending the default black emissive channel', () => {
    const root = new THREE.Group();
    root.name = 'palette-test';
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 })),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xc66d5a })),
    );
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'palette-basic');
    const batch = destination.getObjectByName('palette-test-render-batches');
    const colors = batch?.children.map((node) => {
      expect(node).toBeInstanceOf(THREE.Mesh);
      return ((node as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex();
    });

    expect(stats).toEqual({ sourceMeshes: 2, batches: 2 });
    expect(colors).toEqual(expect.arrayContaining([0x4eaaa7, 0xc66d5a]));
  });

  it('batches transparent authored materials while preserving opacity', () => {
    const root = new THREE.Group();
    root.name = 'glass-test';
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x78bad0, transparent: true, opacity: 0.5 }),
    );
    root.add(glass);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'palette-basic');
    const batch = destination.getObjectByName('glass-test-render-batches')?.children[0] as THREE.Mesh;
    const material = batch.material as THREE.MeshBasicMaterial;

    expect(stats).toEqual({ sourceMeshes: 1, batches: 1 });
    expect(glass.visible).toBe(false);
    expect(glass.userData.staticBatchRendered).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.5);
    expect(material.depthWrite).toBe(false);
  });

  it('keeps lit palette batches responsive to authored lighting', () => {
    const root = new THREE.Group();
    root.name = 'lit-test';
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 })));
    const destination = new THREE.Group();

    batchStaticMeshes(root, destination, () => '', 'palette-lit');
    const material = (destination.getObjectByName('lit-test-render-batches')?.children[0] as THREE.Mesh).material;

    expect(material).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('preserves mapped materials, UVs and normals in texture-lit batches', () => {
    const root = new THREE.Group();
    root.name = 'texture-lit-test';
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: texture, roughness: 0.8 });
    const first = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    first.castShadow = true;
    first.receiveShadow = true;
    const second = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    second.position.x = 2;
    root.add(first, second);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'texture-lit');
    const batch = destination.getObjectByName('texture-lit-test-render-batches')?.children[0] as THREE.Mesh;

    expect(stats).toEqual({ sourceMeshes: 2, batches: 1 });
    expect(batch.material).toBe(material);
    expect(batch.geometry.getAttribute('uv')).toBeDefined();
    expect(batch.geometry.getAttribute('normal')).toBeDefined();
    expect(batch.castShadow).toBe(false);
    expect(batch.receiveShadow).toBe(true);
  });

  it('collapses colour groups into one vertex-lit batch without losing palette variation', () => {
    const root = new THREE.Group();
    root.name = 'vertex-lit-test';
    const aqua = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4eaaa7 }));
    const gold = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd6a944 }));
    gold.position.x = 2;
    root.add(aqua, gold);
    const destination = new THREE.Group();

    const stats = batchStaticMeshes(root, destination, () => '', 'vertex-lit');
    const batch = destination.getObjectByName('vertex-lit-test-render-batches')?.children[0] as THREE.Mesh;
    const colors = batch.geometry.getAttribute('color') as THREE.BufferAttribute;
    const unique = new Set(Array.from({ length: colors.count }, (_, index) => new THREE.Color(colors.getX(index), colors.getY(index), colors.getZ(index)).getHex()));

    expect(stats).toEqual({ sourceMeshes: 2, batches: 1 });
    expect(batch.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(unique).toEqual(new Set([0x4eaaa7, 0xd6a944]));
  });
});

describe('attached weapon draw-call batching', () => {
  it('builds the M249 SAW with a distinct heavy support-weapon silhouette', () => {
    const lmg = buildWeaponModel('lmg', false, false);
    expect(lmg.name).toBe('lmg-original-weapon');
    for (const detail of ['lmg-heavy-receiver', 'lmg-box-magazine', 'lmg-carry-handle', 'lmg-bipod', 'lmg-heat-shield', 'bolt-or-slide']) {
      expect(lmg.getObjectByName(detail), detail).toBeDefined();
    }
    expect(lmg.getObjectByName('curved-magazine')?.visible).toBe(false);
    expect(lmg.getObjectsByProperty('name', 'reload-socket-l')).toHaveLength(1);
    expect(lmg.getObjectByName('muzzle-socket')?.position.z).toBeLessThan(-1.8);
    expect(lmg.getObjectByName('rear-sight-socket')?.position.y).toBeCloseTo(0.215, 3);
    expect(lmg.getObjectByName('front-sight-socket')?.position.y).toBeCloseTo(0.215, 3);
  });

  it('keeps the machine pistol recognisably richer than the service pistol after bounded batching', () => {
    const pistol = buildWeaponModel('pistol', true, false);
    const machinePistol = buildWeaponModel('machine-pistol', true, false);
    const pistolMagazine = pistol.getObjectByName('pistol-magazine');
    const machineMagazine = machinePistol.getObjectByName('pistol-magazine');
    const pistolMagazineHeight = new THREE.Box3().setFromObject(pistolMagazine!).getSize(new THREE.Vector3()).y;
    const machineMagazineHeight = new THREE.Box3().setFromObject(machineMagazine!).getSize(new THREE.Vector3()).y;

    expect(machinePistol.getObjectByName('auto-selector')).toBeDefined();
    expect(machinePistol.getObjectByName('machine-pistol-compensator')).toBeDefined();
    expect(machinePistol.getObjectByName('machine-pistol-charging-wings')).toBeDefined();
    expect(machineMagazineHeight).toBeGreaterThan(pistolMagazineHeight);

    const pistolStats = optimizeAttachedWeapon(pistol, 'palette-basic');
    const machinePistolStats = optimizeAttachedWeapon(machinePistol, 'palette-basic');
    expect(machinePistolStats.sourceMeshes).toBeGreaterThan(pistolStats.sourceMeshes);
    expect(machinePistolStats.batches).toBeLessThanOrEqual(pistolStats.batches + 1);
  });

  it('keeps compound magazines dynamic while batching their visible parts', () => {
    const weapon = new THREE.Group();
    weapon.name = 'compound-magazine-weapon';
    const magazine = new THREE.Group();
    magazine.name = 'curved-magazine';
    for (let index = 0; index < 6; index += 1) {
      const material = new THREE.MeshStandardMaterial({ color: index % 2 ? 0xd6a944 : 0x343b40 });
      const part = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), material);
      part.position.y = index * -0.08;
      magazine.add(part);
    }
    weapon.add(magazine);
    for (let index = 0; index < 10; index += 1) {
      weapon.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: 0x454b50 })));
    }

    optimizeAttachedWeapon(weapon, 'vertex-lit');
    const magazineBatch = magazine.getObjectByName('curved-magazine-render-batches');

    expect(magazine.userData.dynamic).toBe(true);
    expect(magazineBatch?.children).toHaveLength(1);
    expect(magazine.children.filter((node) => node instanceof THREE.Mesh && node.visible)).toHaveLength(0);
    expect(magazine.position.y).toBe(0);
  });

  it('collapses immutable pieces while preserving animated mechanics and sockets', () => {
    const weapon = new THREE.Group();
    weapon.name = 'synthetic-weapon';
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x454b50 }),
      new THREE.MeshStandardMaterial({ color: 0xd6a944 }),
      new THREE.MeshStandardMaterial({ color: 0x202529 }),
    ];
    for (let index = 0; index < 36; index += 1) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), materials[index % materials.length]);
      mesh.position.z = index * 0.01;
      weapon.add(mesh);
    }
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), materials[0]);
    bolt.name = 'bolt-or-slide';
    weapon.add(bolt);
    const muzzle = new THREE.Object3D();
    muzzle.name = 'muzzle-socket';
    weapon.add(muzzle);
    const before = weapon.getObjectsByProperty('isMesh', true).filter((node) => node.visible).length;
    const stats = optimizeAttachedWeapon(weapon, 'palette-lit');
    const after = weapon.getObjectsByProperty('isMesh', true).filter((node) => node.visible).length;

    expect(before).toBe(37);
    expect(stats.sourceMeshes).toBe(36);
    expect(stats.batches).toBe(3);
    expect(after).toBe(4);
    expect(weapon.getObjectByName('muzzle-socket')).toBeDefined();
    expect(weapon.getObjectByName('bolt-or-slide')?.visible).toBe(true);
  });
});
