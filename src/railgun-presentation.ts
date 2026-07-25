import * as THREE from 'three';
import { buildWeaponModel } from './art-kit';
import type { RailgunAuthorityState } from './railgun-authority';

export type RailgunThermalContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  position: THREE.Vector3;
}>;

export class RailgunPresentation {
  readonly root = new THREE.Group();
  private readonly weapon: THREE.Group;
  private readonly thermalRoot: HTMLElement;
  private visibleThermalContacts = 0;

  constructor(scene: THREE.Scene, thermalRoot: HTMLElement, flattenMaterials: boolean) {
    this.thermalRoot = thermalRoot;
    this.root.name = 'railgun-world-pickup';
    this.root.userData.presentationOnly = true;
    this.root.userData.weapon = 'railgun';

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.78, 0.12, 24),
      flattenMaterials
        ? new THREE.MeshBasicMaterial({ color: 0x163f49 })
        : new THREE.MeshStandardMaterial({ color: 0x163f49, emissive: 0x0a6675, emissiveIntensity: 1.35, metalness: 0.72, roughness: 0.28 }),
    );
    pedestal.name = 'railgun-pickup-pedestal';
    pedestal.position.y = -0.42;
    this.root.add(pedestal);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.028, 10, 36),
      new THREE.MeshBasicMaterial({ color: 0x73f6ff, transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false }),
    );
    halo.name = 'railgun-pickup-halo';
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.3;
    this.root.add(halo);

    this.weapon = buildWeaponModel('railgun', flattenMaterials, false);
    this.weapon.name = 'railgun-world-weapon';
    this.weapon.scale.setScalar(0.58);
    this.weapon.rotation.set(0.08, Math.PI / 2, -0.08);
    this.root.add(this.weapon);
    this.root.visible = false;
    scene.add(this.root);
  }

  updateWorld(state: RailgunAuthorityState, now: number): void {
    this.root.visible = state.status === 'available' && state.pickupPosition !== null;
    if (!this.root.visible || !state.pickupPosition) return;
    this.root.position.set(...state.pickupPosition);
    this.root.position.y += 0.28 + Math.sin(now * 0.0032) * 0.07;
    this.root.rotation.y = now * 0.00055;
  }

  updateThermal(camera: THREE.Camera, contacts: readonly RailgunThermalContact[], active: boolean): void {
    this.thermalRoot.hidden = !active;
    this.thermalRoot.replaceChildren();
    this.visibleThermalContacts = 0;
    if (!active) return;
    for (const contact of contacts) {
      const projected = contact.position.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.18 || Math.abs(projected.y) > 1.18) continue;
      const marker = document.createElement('i');
      marker.className = `thermal-contact ${contact.kind}`;
      marker.dataset.contactKind = contact.kind;
      marker.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
      const distance = Math.max(2, camera.position.distanceTo(contact.position));
      marker.style.setProperty('--thermal-scale', String(THREE.MathUtils.clamp(18 / distance, 0.42, 1.35)));
      this.thermalRoot.append(marker);
      this.visibleThermalContacts += 1;
    }
  }

  telemetry(): Readonly<{ worldVisible: boolean; thermalActive: boolean; thermalContacts: number; modelId: string }> {
    return {
      worldVisible: this.root.visible,
      thermalActive: !this.thermalRoot.hidden,
      thermalContacts: this.visibleThermalContacts,
      modelId: String(this.weapon.userData.weaponModelId ?? 'railgun-authored-v1'),
    };
  }
}
