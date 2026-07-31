import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const DMR_THERMAL_MAGNIFICATION = 2.5;
export const DMR_THERMAL_MAX_CONTACTS = 16;
export const DMR_THERMAL_WORLD_DRAW_CALLS = 2;
export const DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME = 2;
export const DMR_THERMAL_TARGET_POLICY = 'living-friendly-and-hostile' as const;
export const DMR_THERMAL_OCCLUSION_POLICY = 'through-wall-reveal' as const;

export type DmrThermalRelation = 'friendly' | 'hostile';

export type DmrThermalContact = Readonly<{
  id: string;
  kind: 'player' | 'bot';
  relation: DmrThermalRelation;
  position: THREE.Vector3;
  living: boolean;
  solidOccluded: boolean;
}>;

/**
 * Team policy is intentionally inclusive: every living combatant is shown,
 * hostiles in amber and friendlies in cyan. Smoke and solid geometry are both
 * presentation-transparent to the optic: silhouettes reveal through walls.
 * Ballistic authority is unchanged; bullets still obey penetration rules.
 */
export function selectDmrThermalContacts(
  contacts: readonly DmrThermalContact[],
  maximum = DMR_THERMAL_MAX_CONTACTS,
): readonly DmrThermalContact[] {
  const selected: DmrThermalContact[] = [];
  const seen = new Set<string>();
  const boundedMaximum = Math.max(0, Math.min(DMR_THERMAL_MAX_CONTACTS, Math.floor(maximum)));
  for (const contact of contacts) {
    if (selected.length >= boundedMaximum) break;
    if (!contact.living || contact.id.length === 0 || seen.has(contact.id)) continue;
    seen.add(contact.id);
    selected.push(contact);
  }
  return Object.freeze(selected);
}

/** Hard per-frame budget for the solid-occlusion sampler used by the live optic. */
export function dmrThermalOcclusionBudget(contactCount: number): number {
  if (!Number.isFinite(contactCount)) return 0;
  return Math.min(DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME, Math.max(0, Math.floor(contactCount)));
}

function thermalSilhouetteTexture(width = 32, height = 64): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  const ellipse = (x: number, y: number, centreX: number, centreY: number, radiusX: number, radiusY: number) => {
    const dx = (x - centreX) / radiusX;
    const dy = (y - centreY) / radiusY;
    return dx * dx + dy * dy <= 1;
  };
  const segment = (x: number, y: number, startX: number, startY: number, endX: number, endY: number, radius: number) => {
    const dx = endX - startX;
    const dy = endY - startY;
    const lengthSquared = dx * dx + dy * dy;
    const amount = lengthSquared > 0
      ? THREE.MathUtils.clamp(((x - startX) * dx + (y - startY) * dy) / lengthSquared, 0, 1)
      : 0;
    return Math.hypot(x - (startX + dx * amount), y - (startY + dy * amount)) <= radius;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      const body = ellipse(nx, ny, 0.5, 0.47, 0.18, 0.25);
      const head = ellipse(nx, ny, 0.5, 0.17, 0.105, 0.085);
      const arms = segment(nx, ny, 0.34, 0.34, 0.21, 0.61, 0.055)
        || segment(nx, ny, 0.66, 0.34, 0.79, 0.61, 0.055);
      const legs = segment(nx, ny, 0.43, 0.64, 0.36, 0.94, 0.064)
        || segment(nx, ny, 0.57, 0.64, 0.64, 0.94, 0.064);
      const alpha = body || head || arms || legs ? 255 : 0;
      const offset = (y * width + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'm14-ebr-thermal-human-silhouette';
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export class DmrThermalPresentation {
  readonly worldRoot = new THREE.Group();
  private readonly silhouetteTexture = thermalSilhouetteTexture();
  private readonly silhouetteGeometry = new THREE.PlaneGeometry(0.82, 1.82);
  private readonly hostileMaterial = new THREE.MeshBasicMaterial({
    name: 'm14-ebr-thermal-hostile',
    color: 0xff9147,
    alphaMap: this.silhouetteTexture,
    transparent: true,
    opacity: 0.78,
    alphaTest: 0.08,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly friendlyMaterial = new THREE.MeshBasicMaterial({
    name: 'm14-ebr-thermal-friendly',
    color: 0x63ecff,
    alphaMap: this.silhouetteTexture,
    transparent: true,
    opacity: 0.72,
    alphaTest: 0.08,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly hostileInstances = new THREE.InstancedMesh(
    this.silhouetteGeometry,
    this.hostileMaterial,
    DMR_THERMAL_MAX_CONTACTS,
  );
  private readonly friendlyInstances = new THREE.InstancedMesh(
    this.silhouetteGeometry,
    this.friendlyMaterial,
    DMR_THERMAL_MAX_CONTACTS,
  );
  private readonly domContacts: HTMLElement[] = [];
  private readonly seen = new Set<string>();
  private readonly projected = new THREE.Vector3();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly instanceScale = new THREE.Vector3(1, 1, 1);
  private active = false;
  private visibleHostiles = 0;
  private visibleFriendlies = 0;
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly overlay: HTMLElement) {
    this.worldRoot.name = 'm14-ebr-through-wall-thermal-silhouettes';
    this.worldRoot.userData.presentationOnly = true;
    this.worldRoot.userData.solidOcclusionRequired = false;
    this.worldRoot.visible = false;
    this.hostileInstances.name = 'm14-ebr-thermal-hostile-instances';
    this.friendlyInstances.name = 'm14-ebr-thermal-friendly-instances';
    for (const instances of [this.hostileInstances, this.friendlyInstances]) {
      instances.count = 0;
      instances.frustumCulled = false;
      instances.renderOrder = 8;
      instances.raycast = () => undefined;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.worldRoot.add(instances);
    }
    scene.add(this.worldRoot);
  }

  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      await this.gpuPrewarmPromise;
      if (this.gpuPrewarmGeneration === sceneGeneration) return;
    }
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    const visible = this.worldRoot.visible;
    const hostileCount = this.hostileInstances.count;
    const friendlyCount = this.friendlyInstances.count;
    camera.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const stage = (instances: THREE.InstancedMesh, lateral: number) => {
      const position = cameraPosition.clone().addScaledVector(forward, 7).addScaledVector(right, lateral);
      this.instanceMatrix.compose(position, camera.quaternion, this.instanceScale);
      instances.setMatrixAt(0, this.instanceMatrix);
      instances.count = 1;
      instances.instanceMatrix.needsUpdate = true;
    };
    this.worldRoot.visible = true;
    stage(this.hostileInstances, -0.55);
    stage(this.friendlyInstances, 0.55);
    try {
      await runtime.compileAndRender(this.worldRoot, camera, this.scene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      this.worldRoot.visible = visible;
      this.hostileInstances.count = hostileCount;
      this.friendlyInstances.count = friendlyCount;
      this.hostileInstances.instanceMatrix.needsUpdate = true;
      this.friendlyInstances.instanceMatrix.needsUpdate = true;
    }
  }

  private domContact(index: number): HTMLElement {
    const existing = this.domContacts[index];
    if (existing) return existing;
    const marker = document.createElement('i');
    this.domContacts.push(marker);
    this.overlay.append(marker);
    return marker;
  }

  update(camera: THREE.Camera, candidates: readonly DmrThermalContact[], active: boolean): void {
    if (!active && !this.active) return;
    this.active = active;
    this.overlay.hidden = !active;
    this.worldRoot.visible = active;
    this.visibleHostiles = 0;
    this.visibleFriendlies = 0;
    for (const marker of this.domContacts) marker.hidden = true;
    this.hostileInstances.count = 0;
    this.friendlyInstances.count = 0;
    if (!active) return;
    this.seen.clear();
    let visible = 0;
    for (const contact of candidates) {
      if (visible >= DMR_THERMAL_MAX_CONTACTS) break;
      if (!contact.living || contact.id.length === 0 || this.seen.has(contact.id)) continue;
      this.seen.add(contact.id);
      this.projected.copy(contact.position).project(camera);
      if (this.projected.z < -1 || this.projected.z > 1
        || Math.abs(this.projected.x) > 1.14 || Math.abs(this.projected.y) > 1.14) continue;
      const instances = contact.relation === 'hostile' ? this.hostileInstances : this.friendlyInstances;
      const instanceIndex = instances.count;
      this.instanceMatrix.compose(contact.position, camera.quaternion, this.instanceScale);
      instances.setMatrixAt(instanceIndex, this.instanceMatrix);
      instances.count += 1;
      const marker = this.domContact(visible);
      marker.hidden = false;
      marker.className = `dmr-thermal-contact ${contact.relation}`;
      marker.dataset.contactKind = contact.kind;
      marker.dataset.contactRelation = contact.relation;
      marker.style.left = `${(this.projected.x * 0.5 + 0.5) * 100}%`;
      marker.style.top = `${(-this.projected.y * 0.5 + 0.5) * 100}%`;
      const distance = Math.max(2, camera.position.distanceTo(contact.position));
      marker.style.setProperty('--dmr-thermal-scale', String(THREE.MathUtils.clamp(18 / distance, 0.42, 1.28)));
      if (contact.relation === 'hostile') this.visibleHostiles += 1;
      else this.visibleFriendlies += 1;
      visible += 1;
    }
    if (this.hostileInstances.count > 0) this.hostileInstances.instanceMatrix.needsUpdate = true;
    if (this.friendlyInstances.count > 0) this.friendlyInstances.instanceMatrix.needsUpdate = true;
  }

  telemetry(): Readonly<{
    active: boolean;
    contacts: number;
    hostiles: number;
    friendlies: number;
    maximumContacts: number;
    worldDrawCalls: typeof DMR_THERMAL_WORLD_DRAW_CALLS;
    occlusionChecksPerFrame: typeof DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME;
    gpuPrewarmGeneration: number;
    targetPolicy: typeof DMR_THERMAL_TARGET_POLICY;
    occlusionPolicy: typeof DMR_THERMAL_OCCLUSION_POLICY;
  }> {
    return Object.freeze({
      active: !this.overlay.hidden,
      contacts: this.visibleHostiles + this.visibleFriendlies,
      hostiles: this.visibleHostiles,
      friendlies: this.visibleFriendlies,
      maximumContacts: DMR_THERMAL_MAX_CONTACTS,
      worldDrawCalls: DMR_THERMAL_WORLD_DRAW_CALLS,
      occlusionChecksPerFrame: DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME,
      gpuPrewarmGeneration: this.gpuPrewarmGeneration,
      targetPolicy: DMR_THERMAL_TARGET_POLICY,
      occlusionPolicy: DMR_THERMAL_OCCLUSION_POLICY,
    });
  }

  /** Terminal renderer teardown only; never call while a frame may reference these buffers. */
  terminalDispose(): void {
    this.scene.remove(this.worldRoot);
    this.silhouetteGeometry.dispose();
    this.hostileMaterial.dispose();
    this.friendlyMaterial.dispose();
    this.silhouetteTexture.dispose();
    for (const marker of this.domContacts) marker.remove();
    this.domContacts.length = 0;
  }
}
