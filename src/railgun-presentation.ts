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
  private readonly thermalWorldRoot = new THREE.Group();
  private readonly thermalWorldContacts: THREE.Group[] = [];
  private readonly thermalDomContacts: HTMLElement[] = [];
  private readonly beamRoot = new THREE.Group();
  private readonly beams: Array<{ root: THREE.Group; core: THREE.Mesh; bloom: THREE.Mesh; expiresAt: number }> = [];
  private beamCursor = 0;
  private beamPresentations = 0;
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
    this.thermalWorldRoot.name = 'railgun-through-wall-silhouettes';
    this.thermalWorldRoot.userData.presentationOnly = true;
    this.thermalWorldRoot.visible = false;
    this.beamRoot.name = 'railgun-replicated-beams';
    this.beamRoot.userData.presentationOnly = true;
    for (let index = 0; index < 4; index += 1) {
      const beam = new THREE.Group();
      beam.name = `railgun-massive-beam-${index + 1}`;
      beam.visible = false;
      beam.userData.presentationOnly = true;
      const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
      const core = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xc9fbff,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      const bloom = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0x25cfff,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }));
      core.name = 'railgun-beam-core';
      bloom.name = 'railgun-beam-bloom';
      core.renderOrder = 7;
      bloom.renderOrder = 6;
      beam.add(core, bloom);
      this.beamRoot.add(beam);
      this.beams.push({ root: beam, core, bloom, expiresAt: 0 });
    }
    scene.add(this.root, this.thermalWorldRoot, this.beamRoot);
  }

  updateWorld(state: RailgunAuthorityState, now: number): void {
    this.updateBeams(now);
    this.root.visible = state.status === 'available' && state.pickupPosition !== null;
    if (!this.root.visible || !state.pickupPosition) return;
    this.root.position.set(...state.pickupPosition);
    this.root.position.y += 0.28 + Math.sin(now * 0.0032) * 0.07;
    this.root.rotation.y = now * 0.00055;
  }

  /** Presentation hook shared by local and replicated railgun shot paths. */
  presentBeam(start: THREE.Vector3, end: THREE.Vector3, now: number): void {
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (!Number.isFinite(length) || length < 0.05) return;
    const beam = this.beams[this.beamCursor++ % this.beams.length];
    beam.root.position.copy(start).addScaledVector(delta, 0.5);
    beam.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    beam.core.scale.set(0.1, length, 0.1);
    beam.bloom.scale.set(0.42, length, 0.42);
    beam.root.visible = true;
    beam.expiresAt = now + 240;
    this.beamPresentations += 1;
  }

  private updateBeams(now: number): void {
    for (const beam of this.beams) {
      if (!beam.root.visible) continue;
      const remaining = beam.expiresAt - now;
      if (remaining <= 0) {
        beam.root.visible = false;
        continue;
      }
      const fade = THREE.MathUtils.clamp(remaining / 240, 0, 1);
      (beam.core.material as THREE.MeshBasicMaterial).opacity = 0.94 * fade;
      (beam.bloom.material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.sqrt(fade);
    }
  }

  private createThermalSilhouette(index: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `railgun-thermal-silhouette-${index + 1}`;
    group.userData.presentationOnly = true;
    const material = new THREE.MeshBasicMaterial({
      color: 0x2bdcff,
      transparent: true,
      opacity: 0.74,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const part = (name: string, geometry: THREE.BufferGeometry, position: [number, number, number], rotationZ = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.position.set(...position);
      mesh.rotation.z = rotationZ;
      mesh.renderOrder = 10;
      mesh.raycast = () => undefined;
      group.add(mesh);
    };
    part('thermal-head', new THREE.SphereGeometry(0.2, 10, 7), [0, 0.68, 0]);
    part('thermal-torso', new THREE.CapsuleGeometry(0.27, 0.48, 3, 8), [0, 0.18, 0]);
    part('thermal-arm-left', new THREE.CapsuleGeometry(0.09, 0.48, 2, 6), [-0.3, 0.18, 0], -0.18);
    part('thermal-arm-right', new THREE.CapsuleGeometry(0.09, 0.48, 2, 6), [0.3, 0.18, 0], 0.18);
    part('thermal-leg-left', new THREE.CapsuleGeometry(0.11, 0.58, 2, 6), [-0.14, -0.53, 0], 0.05);
    part('thermal-leg-right', new THREE.CapsuleGeometry(0.11, 0.58, 2, 6), [0.14, -0.53, 0], -0.05);
    group.visible = false;
    this.thermalWorldRoot.add(group);
    return group;
  }

  private thermalDomContact(index: number): HTMLElement {
    const existing = this.thermalDomContacts[index];
    if (existing) return existing;
    const marker = document.createElement('i');
    this.thermalDomContacts.push(marker);
    this.thermalRoot.append(marker);
    return marker;
  }

  updateThermal(camera: THREE.Camera, contacts: readonly RailgunThermalContact[], active: boolean): void {
    this.thermalRoot.hidden = !active;
    this.thermalWorldRoot.visible = active;
    this.visibleThermalContacts = 0;
    for (const marker of this.thermalDomContacts) marker.hidden = true;
    for (const silhouette of this.thermalWorldContacts) silhouette.visible = false;
    if (!active) return;
    for (const [index, contact] of contacts.entries()) {
      const silhouette = this.thermalWorldContacts[index] ?? this.createThermalSilhouette(index);
      if (!this.thermalWorldContacts[index]) this.thermalWorldContacts[index] = silhouette;
      silhouette.visible = true;
      silhouette.position.copy(contact.position);
      silhouette.userData.contactId = contact.id;
      silhouette.userData.contactKind = contact.kind;
      silhouette.scale.setScalar(contact.kind === 'bot' ? 0.96 : 1);
      silhouette.traverse((node) => {
        if (node instanceof THREE.Mesh) (node.material as THREE.MeshBasicMaterial).opacity = contact.kind === 'bot' ? 0.37 : 0.74;
      });
      const projected = contact.position.clone().project(camera);
      if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 1.18 || Math.abs(projected.y) > 1.18) continue;
      const marker = this.thermalDomContact(index);
      marker.hidden = false;
      marker.className = `thermal-contact ${contact.kind}`;
      marker.dataset.contactKind = contact.kind;
      marker.style.left = `${(projected.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-projected.y * 0.5 + 0.5) * 100}%`;
      const distance = Math.max(2, camera.position.distanceTo(contact.position));
      marker.style.setProperty('--thermal-scale', String(THREE.MathUtils.clamp(18 / distance, 0.42, 1.35)));
      this.visibleThermalContacts += 1;
    }
  }

  telemetry(): Readonly<{ worldVisible: boolean; thermalActive: boolean; thermalContacts: number; worldSilhouettes: number; activeBeams: number; beamPresentations: number; modelId: string }> {
    return {
      worldVisible: this.root.visible,
      thermalActive: !this.thermalRoot.hidden,
      thermalContacts: this.visibleThermalContacts,
      worldSilhouettes: this.thermalWorldContacts.filter((contact) => contact.visible).length,
      activeBeams: this.beams.filter((beam) => beam.root.visible).length,
      beamPresentations: this.beamPresentations,
      modelId: String(this.weapon.userData.weaponModelId ?? 'railgun-authored-v1'),
    };
  }
}
