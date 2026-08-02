import * as THREE from 'three';
import { buildWeaponModel } from './art-kit';
import {
  TIMED_MAP_WEAPON_IDS,
  type TimedMapWeaponAuthorityState,
  type TimedMapWeaponId,
} from './timed-map-weapon-authority';
import { createPass65WeaponModel, loadPass65WeaponAsset } from './weapon-model';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

type PickupPresentation = Readonly<{
  root: THREE.Group;
  weapon: THREE.Group;
  halo: THREE.Mesh;
}>;

const PICKUP_COLOURS: Readonly<Record<TimedMapWeaponId, number>> = Object.freeze({
  flamethrower: 0xff8b2d,
  'flare-gun': 0xff3d2e,
});

/** Persistent, allocation-free midpoint pickup presentation for both maps. */
export class TimedMapWeaponPresentation {
  readonly root = new THREE.Group();
  private readonly entries = new Map<TimedMapWeaponId, PickupPresentation>();
  private readonly loads = new Map<TimedMapWeaponId, Promise<void>>();
  private readonly attempts = new Map<TimedMapWeaponId, number>();
  private readonly retryAt = new Map<TimedMapWeaponId, number>();
  private prewarmGeneration = -1;

  constructor(scene: THREE.Scene, private readonly flattenMaterials: boolean) {
    this.root.name = 'timed-map-weapon-pickups';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    for (const weaponId of TIMED_MAP_WEAPON_IDS) {
      const colour = PICKUP_COLOURS[weaponId];
      const root = new THREE.Group();
      root.name = `${weaponId}-timed-world-pickup`;
      root.visible = false;
      root.userData.presentationOnly = true;
      root.userData.weapon = weaponId;

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.58, 0.74, 0.13, 24),
        flattenMaterials
          ? new THREE.MeshBasicMaterial({ color: 0x301d18 })
          : new THREE.MeshStandardMaterial({
              color: 0x301d18,
              emissive: colour,
              emissiveIntensity: 0.24,
              metalness: 0.7,
              roughness: 0.3,
            }),
      );
      pedestal.name = `${weaponId}-pickup-pedestal`;
      pedestal.position.y = -0.38;

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.67, 0.026, 10, 36),
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      halo.name = `${weaponId}-pickup-halo`;
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -0.27;

      const weapon = new THREE.Group();
      weapon.name = `${weaponId}-world-weapon`;
      weapon.scale.setScalar(weaponId === 'flamethrower' ? 0.52 : 0.66);
      weapon.rotation.set(0.08, Math.PI / 2, -0.07);
      if (typeof window === 'undefined') weapon.add(buildWeaponModel(weaponId, flattenMaterials, false));
      root.add(pedestal, halo, weapon);
      this.root.add(root);
      this.entries.set(weaponId, Object.freeze({ root, weapon, halo }));
    }
  }

  update(states: Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>>, now: number): void {
    for (const weaponId of TIMED_MAP_WEAPON_IDS) {
      const entry = this.entries.get(weaponId)!;
      const state = states[weaponId];
      entry.root.visible = state.status === 'available' && state.pickupPosition !== null;
      if (!entry.root.visible || !state.pickupPosition) continue;
      this.ensureAuthoredWeapon(weaponId, now);
      entry.root.position.set(...state.pickupPosition);
      entry.root.position.y += 0.3 + Math.sin(now * 0.003 + (weaponId === 'flamethrower' ? 0 : Math.PI)) * 0.065;
      entry.root.rotation.y = now * 0.00062;
      const haloMaterial = entry.halo.material;
      if (haloMaterial instanceof THREE.MeshBasicMaterial) haloMaterial.opacity = 0.7 + Math.sin(now * 0.004) * 0.1;
    }
  }

  reset(): void {
    for (const entry of this.entries.values()) entry.root.visible = false;
  }

  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration: number): Promise<void> {
    if (this.prewarmGeneration === sceneGeneration) return;
    await Promise.all(TIMED_MAP_WEAPON_IDS.map((weaponId) => this.loadAuthoredWeapon(weaponId, performance.now())));
    camera.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const prior = TIMED_MAP_WEAPON_IDS.map((weaponId) => {
      const entry = this.entries.get(weaponId)!;
      return { entry, visible: entry.root.visible, position: entry.root.position.clone(), rotation: entry.root.rotation.clone() };
    });
    prior.forEach(({ entry }, index) => {
      entry.root.visible = true;
      entry.root.position.copy(cameraPosition).addScaledVector(forward, 5).addScaledVector(right, index === 0 ? -0.8 : 0.8);
      entry.root.rotation.set(0, 0, 0);
    });
    try {
      await runtime.compileAndRender(this.root, camera, this.root.parent as THREE.Scene);
      this.prewarmGeneration = sceneGeneration;
    } finally {
      for (const state of prior) {
        state.entry.root.visible = state.visible;
        state.entry.root.position.copy(state.position);
        state.entry.root.rotation.copy(state.rotation);
      }
    }
  }

  telemetry(): Readonly<{
    prepared: boolean;
    prewarmGeneration: number;
    entries: readonly Readonly<{ weaponId: TimedMapWeaponId; visible: boolean; source: string; attempts: number }>[];
  }> {
    const entries = TIMED_MAP_WEAPON_IDS.map((weaponId) => {
      const entry = this.entries.get(weaponId)!;
      return Object.freeze({
        weaponId,
        visible: entry.root.visible,
        source: String(entry.weapon.userData.presentationSource ?? (entry.weapon.children.length > 0 ? 'fallback' : 'pending')),
        attempts: this.attempts.get(weaponId) ?? 0,
      });
    });
    return Object.freeze({
      prepared: entries.every((entry) => entry.source !== 'pending'),
      prewarmGeneration: this.prewarmGeneration,
      entries: Object.freeze(entries),
    });
  }

  private ensureAuthoredWeapon(weaponId: TimedMapWeaponId, now: number): void {
    const entry = this.entries.get(weaponId)!;
    if (entry.weapon.children.length > 0 || this.loads.has(weaponId)
      || (this.attempts.get(weaponId) ?? 0) >= 3 || now < (this.retryAt.get(weaponId) ?? 0)) return;
    void this.loadAuthoredWeapon(weaponId, now);
  }

  private loadAuthoredWeapon(weaponId: TimedMapWeaponId, now: number): Promise<void> {
    const entry = this.entries.get(weaponId)!;
    if (entry.weapon.children.length > 0) return Promise.resolve();
    const pending = this.loads.get(weaponId);
    if (pending) return pending;
    if ((this.attempts.get(weaponId) ?? 0) >= 3 || now < (this.retryAt.get(weaponId) ?? 0)) return Promise.resolve();
    const attempts = (this.attempts.get(weaponId) ?? 0) + 1;
    this.attempts.set(weaponId, attempts);
    const load = loadPass65WeaponAsset(weaponId, 'world').then(() => {
      const authored = createPass65WeaponModel(weaponId, this.flattenMaterials, 'world');
      if (!authored) throw new Error(`Authored ${weaponId} midpoint pickup unavailable after load`);
      authored.name = `${weaponId}-timed-world-authored-visual`;
      entry.weapon.add(authored);
      entry.weapon.userData.presentationSource = 'project-original-blender-world-lod0';
      entry.weapon.userData.projectOriginalWeapon = true;
    }).catch((error: unknown) => {
      this.retryAt.set(weaponId, now + attempts * 5_000);
      entry.root.userData.assetLoadError = error instanceof Error ? error.message : String(error);
      console.error(`Authored ${weaponId} midpoint pickup load failed`, error);
    }).finally(() => {
      this.loads.delete(weaponId);
    });
    this.loads.set(weaponId, load);
    return load;
  }
}
