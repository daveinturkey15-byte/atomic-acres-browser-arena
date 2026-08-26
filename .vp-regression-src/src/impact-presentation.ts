import * as THREE from 'three';
import { presentationRandom } from './runtime-random';
import type { ImpactSurface } from './combat-feedback';
import type { BallisticMaterialId } from './ballistics';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { SURFACE_IMPACT_PROFILES, surfaceImpactProfile, type SurfaceImpactProfile } from './surface-impact-registry';

type Particle = {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
};

export const MAX_IMPACT_PARTICLES = 72;
export const MAX_IMPACT_MARKS = 48;
export const IMPACT_DECAL_SURFACE_OFFSET_M = 0.006;
export const IMPACT_DECAL_OPACITY = 0.72;
const HIDDEN_Y = -10_000;

export type ImpactPresentationSurface = ImpactSurface | BallisticMaterialId;

function resolveImpactProfile(surface: ImpactPresentationSurface): SurfaceImpactProfile {
  if (surface in SURFACE_IMPACT_PROFILES) return surfaceImpactProfile(surface as BallisticMaterialId);
  if (surface === 'metal') return surfaceImpactProfile('structural-metal');
  if (surface === 'soil') return surfaceImpactProfile('earth');
  return surfaceImpactProfile('concrete');
}

function proceduralImpactTexture(size: number, kind: 'particle' | 'mark'): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const angle = Math.atan2(ny, nx);
      const irregularRadius = Math.sqrt(nx * nx + ny * ny) * (1 + Math.sin(angle * 7 + 0.8) * 0.08);
      const radial = kind === 'particle'
        ? THREE.MathUtils.smoothstep(1 - irregularRadius, 0, 0.82)
        : THREE.MathUtils.smoothstep(1 - irregularRadius, 0.04, 0.9);
      const centre = kind === 'mark' ? 0.62 + 0.38 * THREE.MathUtils.smoothstep(0.42 - irregularRadius, 0, 0.42) : 1;
      const alpha = Math.round(255 * THREE.MathUtils.clamp(radial * centre, 0, 1));
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `pass62-procedural-impact-${kind}`;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** One-draw-call pooled impact debris for every combat surface. */
export class ImpactPresentation {
  readonly root = new THREE.Group();
  readonly points: THREE.Points;
  readonly marks: THREE.InstancedMesh;
  private readonly positions = new Float32Array(MAX_IMPACT_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_IMPACT_PARTICLES * 3);
  private readonly uvs = new Float32Array(MAX_IMPACT_PARTICLES * 2);
  private readonly particles: Particle[] = [];
  private readonly markLife = new Float32Array(MAX_IMPACT_MARKS);
  private cursor = 0;
  private markCursor = 0;
  private particleDensityScale = 1;
  private decalCapacityScale = 1;
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;

  constructor(private readonly scene: THREE.Scene, reducedDetail = false) {
    this.root.name = 'surface-impact-presentation-pool';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    const geometry = new THREE.BufferGeometry();
    this.positions.fill(0);
    this.uvs.fill(0.5);
    for (let index = 0; index < MAX_IMPACT_PARTICLES; index += 1) this.positions[index * 3 + 1] = HIDDEN_Y;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // WebGL samples a PointsMaterial map with gl_PointCoord. Three's WebGPU
    // node translation instead requests a geometry UV for point primitives;
    // a stable centre sample preserves the radial particle core and prevents
    // a missing-attribute shader fallback in both prewarm and live impacts.
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    const material = new THREE.PointsMaterial({
      size: reducedDetail ? 0.075 : 0.105,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      map: proceduralImpactTexture(32, 'particle'),
      alphaTest: 0.025,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'pooled-surface-impact-debris';
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.root.add(this.points);
    this.marks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        // Marks are gameplay-readable evidence, not optional decoration. Keep
        // the same contrast in every profile; profile budgets may bound pool
        // capacity but must never make the latest admitted impact disappear.
        opacity: IMPACT_DECAL_OPACITY,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -1,
        map: proceduralImpactTexture(64, 'mark'),
        alphaTest: 0.035,
      }),
      MAX_IMPACT_MARKS,
    );
    this.marks.name = 'pooled-surface-impact-marks';
    this.marks.frustumCulled = false;
    this.marks.visible = false;
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    const hiddenColor = new THREE.Color(0, 0, 0);
    for (let index = 0; index < MAX_IMPACT_MARKS; index += 1) {
      this.marks.setMatrixAt(index, hiddenMatrix);
      // InstancedMesh lazily creates instanceColor on the first setColorAt().
      // Allocate it with the permanent pool, not on the first live bullet hit.
      this.marks.setColorAt(index, hiddenColor);
    }
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    this.root.add(this.marks);
    for (let index = 0; index < MAX_IMPACT_PARTICLES; index += 1) {
      this.particles.push({ velocity: new THREE.Vector3(), life: 0, maxLife: 0, color: new THREE.Color() });
    }
  }

  /**
   * Re-submits the permanent impact vocabulary once for each committed arena
   * scene. A menu-only compile is not sufficient: the selected HDR graph and
   * arena bindings do not exist until the arena transition has committed.
   */
  async prewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration = 0,
  ): Promise<void> {
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    while (this.gpuPrewarmPromise) {
      try {
        await this.gpuPrewarmPromise;
      } catch {
        // The initiating caller owns that failure. A queued generation gets an
        // independent attempt instead of inheriting a poisoned promise.
      }
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
    await this.withStagedVocabulary(camera, (root) => runtime.compileAndRender(root, camera, this.scene));
    this.gpuPrewarmGeneration = sceneGeneration;
  }

  /**
   * Stages the exact retained points and mark vocabulary for a caller-owned
   * renderer composition, then restores every live cursor and buffer.
   */
  async withStagedVocabulary(
    camera: THREE.Camera,
    submit: (root: THREE.Object3D) => Promise<void>,
  ): Promise<void> {
    if (this.root.parent !== this.scene || this.points.parent !== this.root || this.marks.parent !== this.root) {
      throw new Error('Impact presentation pool must be attached to its scene before prewarm');
    }
    const instanceColor = this.marks.instanceColor;
    if (!instanceColor) throw new Error('Impact presentation instanceColor must exist before prewarm');

    const positionState = this.positions.slice();
    const colorState = this.colors.slice();
    const markMatrixState = new Float32Array(this.marks.instanceMatrix.array);
    const markColorState = new Float32Array(instanceColor.array);
    const markLifeState = this.markLife.slice();
    const particleStates = this.particles.map((particle) => Object.freeze({
      velocity: particle.velocity.clone(),
      life: particle.life,
      maxLife: particle.maxLife,
      color: particle.color.clone(),
    }));
    const cursorState = this.cursor;
    const markCursorState = this.markCursor;
    const rootVisible = this.root.visible;
    const rootFrustumCulled = this.root.frustumCulled;
    const pointsVisible = this.points.visible;
    const pointsFrustumCulled = this.points.frustumCulled;
    const marksVisible = this.marks.visible;
    const marksFrustumCulled = this.marks.frustumCulled;

    this.root.visible = true;
    this.root.frustumCulled = false;
    this.points.visible = true;
    this.points.frustumCulled = false;
    this.marks.visible = true;
    this.marks.frustumCulled = false;
    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, true);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const profiles = Object.values(SURFACE_IMPACT_PROFILES);

    // Exercise every permanent particle vertex with representative, non-zero
    // positions and colors. Hidden-Y sentinels compile the shader but do not
    // prove the first useful vertex/color upload or fragment path.
    const particleColumns = 12;
    for (let slot = 0; slot < MAX_IMPACT_PARTICLES; slot += 1) {
      const profile = profiles[slot % profiles.length]!;
      const column = slot % particleColumns;
      const row = Math.floor(slot / particleColumns);
      const worldPosition = cameraPosition.clone()
        .addScaledVector(forward, 6)
        .addScaledVector(right, (column - (particleColumns - 1) / 2) * 0.16)
        .addScaledVector(up, (2.5 - row) * 0.16);
      const localPosition = this.points.worldToLocal(worldPosition);
      const color = new THREE.Color(profile.particleColors[slot % 2]!);
      const offset = slot * 3;
      this.positions[offset] = localPosition.x;
      this.positions[offset + 1] = localPosition.y;
      this.positions[offset + 2] = localPosition.z;
      this.colors[offset] = color.r;
      this.colors[offset + 1] = color.g;
      this.colors[offset + 2] = color.b;
      const particle = this.particles[slot]!;
      particle.velocity.copy(forward).multiplyScalar(0.8).addScaledVector(up, 0.55);
      particle.life = 0.38;
      particle.maxLife = 0.38;
      particle.color.copy(color);
    }

    // Submit every instance matrix and color. This is deliberately the real
    // authored decal scale in the camera frustum; zero matrices or a missing
    // instanceColor leave the first live impact's WebGPU buffers cold.
    this.marks.updateWorldMatrix(true, false);
    const marksWorldInverse = this.marks.matrixWorld.clone().invert();
    const markFacing = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      forward.clone().negate(),
    );
    const markColumns = 8;
    for (let slot = 0; slot < MAX_IMPACT_MARKS; slot += 1) {
      const profile = profiles[slot % profiles.length]!;
      const column = slot % markColumns;
      const row = Math.floor(slot / markColumns);
      const worldPosition = cameraPosition.clone()
        .addScaledVector(forward, 8)
        .addScaledVector(right, (column - (markColumns - 1) / 2) * 0.24)
        .addScaledVector(up, (2.5 - row) * 0.24);
      const worldMatrix = new THREE.Matrix4().compose(
        worldPosition,
        markFacing,
        new THREE.Vector3(profile.markScale, profile.markScale, 1),
      );
      this.marks.setMatrixAt(slot, new THREE.Matrix4().multiplyMatrices(marksWorldInverse, worldMatrix));
      this.marks.setColorAt(slot, new THREE.Color(profile.markColor));
      this.markLife[slot] = Number.POSITIVE_INFINITY;
    }
    this.markDirty();
    this.marks.instanceMatrix.needsUpdate = true;
    instanceColor.needsUpdate = true;

    try {
      await submit(this.root);
    } finally {
      this.positions.set(positionState);
      this.colors.set(colorState);
      this.marks.instanceMatrix.array.set(markMatrixState);
      instanceColor.array.set(markColorState);
      this.markLife.set(markLifeState);
      for (let slot = 0; slot < this.particles.length; slot += 1) {
        const particle = this.particles[slot]!;
        const state = particleStates[slot]!;
        particle.velocity.copy(state.velocity);
        particle.life = state.life;
        particle.maxLife = state.maxLife;
        particle.color.copy(state.color);
      }
      this.cursor = cursorState;
      this.markCursor = markCursorState;
      this.root.visible = rootVisible;
      this.root.frustumCulled = rootFrustumCulled;
      this.points.visible = pointsVisible;
      this.points.frustumCulled = pointsFrustumCulled;
      this.marks.visible = marksVisible;
      this.marks.frustumCulled = marksFrustumCulled;
      this.markDirty();
      this.marks.instanceMatrix.needsUpdate = true;
      instanceColor.needsUpdate = true;
    }
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: ImpactPresentationSurface): void {
    const profile = resolveImpactProfile(surface);
    const [primary, secondary] = profile.particleColors;
    const authoredCount = profile.particleCount;
    const count = Math.max(2, Math.round(authoredCount * this.particleDensityScale));
    const tangent = new THREE.Vector3(normal.z, 0.35, -normal.x).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    for (let index = 0; index < count; index += 1) {
      const slot = this.cursor++ % MAX_IMPACT_PARTICLES;
      const particle = this.particles[slot];
      const positionIndex = slot * 3;
      const spreadA = (presentationRandom() - 0.5) * (profile.impactSurface === 'metal' ? 4.2 : 2.6);
      const spreadB = (presentationRandom() - 0.5) * 2.2;
      const speed = profile.impactSurface === 'metal' ? 2.4 + presentationRandom() * 2.8 : 0.8 + presentationRandom() * 1.9;
      particle.velocity.copy(normal).multiplyScalar(speed)
        .addScaledVector(tangent, spreadA)
        .addScaledVector(bitangent, spreadB)
        .add(new THREE.Vector3(0, profile.impactSurface === 'soil' ? 1.2 : 0.55, 0));
      particle.maxLife = profile.impactSurface === 'metal' ? 0.24 : 0.38;
      particle.life = particle.maxLife * (0.72 + presentationRandom() * 0.28);
      particle.color.set(index % 2 === 0 ? primary : secondary);
      this.positions[positionIndex] = point.x + normal.x * 0.035;
      this.positions[positionIndex + 1] = point.y + normal.y * 0.035;
      this.positions[positionIndex + 2] = point.z + normal.z * 0.035;
      this.colors[positionIndex] = particle.color.r;
      this.colors[positionIndex + 1] = particle.color.g;
      this.colors[positionIndex + 2] = particle.color.b;
    }
    const markCapacity = Math.max(8, Math.round(MAX_IMPACT_MARKS * this.decalCapacityScale));
    const markSlot = this.markCursor++ % markCapacity;
    const markNormal = normal.clone().normalize();
    // Polygon offset carries the z-fighting burden; a six-millimetre physical
    // offset keeps the mark attached to the struck surface instead of reading
    // as a floating card at grazing angles.
    const markPosition = point.clone().addScaledVector(markNormal, IMPACT_DECAL_SURFACE_OFFSET_M);
    const markRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), markNormal);
    markRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(markNormal, presentationRandom() * Math.PI));
    this.marks.setMatrixAt(markSlot, new THREE.Matrix4().compose(
      markPosition,
      markRotation,
      new THREE.Vector3(profile.markScale, profile.markScale, 1),
    ));
    this.marks.setColorAt(markSlot, new THREE.Color(profile.markColor));
    this.markLife[markSlot] = Number.POSITIVE_INFINITY;
    this.marks.visible = true;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    this.points.visible = true;
    this.markDirty();
  }

  setBudget(particleDensityScale: number, decalCapacityScale: number): void {
    this.particleDensityScale = THREE.MathUtils.clamp(particleDensityScale, 0.35, 1);
    this.decalCapacityScale = THREE.MathUtils.clamp(decalCapacityScale, 0.35, 1);
    const markCapacity = Math.max(8, Math.round(MAX_IMPACT_MARKS * this.decalCapacityScale));
    let changed = false;
    for (let slot = markCapacity; slot < MAX_IMPACT_MARKS; slot += 1) {
      if (this.markLife[slot] <= 0) continue;
      this.markLife[slot] = 0;
      this.marks.setMatrixAt(slot, new THREE.Matrix4().makeScale(0, 0, 0));
      changed = true;
    }
    if (changed) this.marks.instanceMatrix.needsUpdate = true;
  }

  /** Round boundary for marks that otherwise persist until bounded eviction. */
  resetForRound(): void {
    this.cursor = 0;
    this.markCursor = 0;
    this.markLife.fill(0);
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let slot = 0; slot < MAX_IMPACT_MARKS; slot += 1) this.marks.setMatrixAt(slot, hiddenMatrix);
    for (let slot = 0; slot < this.particles.length; slot += 1) {
      this.particles[slot].life = 0;
      const index = slot * 3;
      this.positions[index] = 0;
      this.positions[index + 1] = HIDDEN_Y;
      this.positions[index + 2] = 0;
      this.colors[index] = this.colors[index + 1] = this.colors[index + 2] = 0;
    }
    this.points.visible = false;
    this.marks.visible = false;
    this.marks.instanceMatrix.needsUpdate = true;
    this.markDirty();
  }

  update(dt: number): void {
    let changed = false;
    let activeCount = 0;
    for (let slot = 0; slot < this.particles.length; slot += 1) {
      const particle = this.particles[slot];
      if (particle.life <= 0) continue;
      changed = true;
      particle.life -= dt;
      const index = slot * 3;
      if (particle.life <= 0) {
        this.positions[index + 1] = HIDDEN_Y;
        this.colors[index] = this.colors[index + 1] = this.colors[index + 2] = 0;
        continue;
      }
      activeCount += 1;
      particle.velocity.y -= 5.8 * dt;
      this.positions[index] += particle.velocity.x * dt;
      this.positions[index + 1] += particle.velocity.y * dt;
      this.positions[index + 2] += particle.velocity.z * dt;
      const fade = Math.min(1, particle.life / Math.max(0.001, particle.maxLife) * 1.8);
      this.colors[index] = particle.color.r * fade;
      this.colors[index + 1] = particle.color.g * fade;
      this.colors[index + 2] = particle.color.b * fade;
    }
    this.points.visible = activeCount > 0;
    let marksChanged = false;
    for (let slot = 0; slot < MAX_IMPACT_MARKS; slot += 1) {
      if (this.markLife[slot] <= 0) continue;
      if (!Number.isFinite(this.markLife[slot])) continue;
      this.markLife[slot] -= dt;
      if (this.markLife[slot] <= 0) {
        this.marks.setMatrixAt(slot, new THREE.Matrix4().makeScale(0, 0, 0));
        marksChanged = true;
      }
    }
    if (marksChanged) this.marks.instanceMatrix.needsUpdate = true;
    this.marks.visible = this.activeMarks() > 0;
    if (changed) this.markDirty();
  }

  activeParticles(): number {
    return this.particles.reduce((count, particle) => count + Number(particle.life > 0), 0);
  }

  activeMarks(): number {
    return this.markLife.reduce((count, life) => count + Number(life > 0), 0);
  }

  private markDirty(): void {
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
