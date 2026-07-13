import * as THREE from 'three';
import type { ImpactSurface } from './combat-feedback';

type Particle = {
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
};

const MAX_PARTICLES = 72;
const MAX_MARKS = 32;
const HIDDEN_Y = -10_000;

const SURFACE_COLORS: Record<ImpactSurface, [number, number]> = {
  metal: [0xffd06a, 0xff7b3a],
  concrete: [0xd8d0bc, 0x8c918d],
  wood: [0xd3a167, 0x6d4a32],
  soil: [0x8ca56e, 0x5c4731],
};

/** One-draw-call pooled impact debris for every combat surface. */
export class ImpactPresentation {
  readonly points: THREE.Points;
  readonly marks: THREE.InstancedMesh;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly particles: Particle[] = [];
  private readonly markLife = new Float32Array(MAX_MARKS);
  private cursor = 0;
  private markCursor = 0;

  constructor(scene: THREE.Scene, reducedDetail = false) {
    const geometry = new THREE.BufferGeometry();
    this.positions.fill(0);
    for (let index = 0; index < MAX_PARTICLES; index += 1) this.positions[index * 3 + 1] = HIDDEN_Y;
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: reducedDetail ? 0.075 : 0.105,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'pooled-surface-impact-debris';
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.marks = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: reducedDetail ? 0.24 : 0.4,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
      }),
      MAX_MARKS,
    );
    this.marks.name = 'pooled-surface-impact-marks';
    this.marks.frustumCulled = false;
    this.marks.visible = false;
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let index = 0; index < MAX_MARKS; index += 1) this.marks.setMatrixAt(index, hiddenMatrix);
    this.marks.instanceMatrix.needsUpdate = true;
    scene.add(this.marks);
    for (let index = 0; index < MAX_PARTICLES; index += 1) {
      this.particles.push({ velocity: new THREE.Vector3(), life: 0, maxLife: 0, color: new THREE.Color() });
    }
  }

  impact(point: THREE.Vector3, normal: THREE.Vector3, surface: ImpactSurface): void {
    const [primary, secondary] = SURFACE_COLORS[surface];
    const count = surface === 'metal' ? 8 : surface === 'concrete' ? 6 : 5;
    const tangent = new THREE.Vector3(normal.z, 0.35, -normal.x).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    for (let index = 0; index < count; index += 1) {
      const slot = this.cursor++ % MAX_PARTICLES;
      const particle = this.particles[slot];
      const positionIndex = slot * 3;
      const spreadA = (Math.random() - 0.5) * (surface === 'metal' ? 4.2 : 2.6);
      const spreadB = (Math.random() - 0.5) * 2.2;
      const speed = surface === 'metal' ? 2.4 + Math.random() * 2.8 : 0.8 + Math.random() * 1.9;
      particle.velocity.copy(normal).multiplyScalar(speed)
        .addScaledVector(tangent, spreadA)
        .addScaledVector(bitangent, spreadB)
        .add(new THREE.Vector3(0, surface === 'soil' ? 1.2 : 0.55, 0));
      particle.maxLife = surface === 'metal' ? 0.24 : 0.38;
      particle.life = particle.maxLife * (0.72 + Math.random() * 0.28);
      particle.color.set(index % 2 === 0 ? primary : secondary);
      this.positions[positionIndex] = point.x + normal.x * 0.035;
      this.positions[positionIndex + 1] = point.y + normal.y * 0.035;
      this.positions[positionIndex + 2] = point.z + normal.z * 0.035;
      this.colors[positionIndex] = particle.color.r;
      this.colors[positionIndex + 1] = particle.color.g;
      this.colors[positionIndex + 2] = particle.color.b;
    }
    const markSlot = this.markCursor++ % MAX_MARKS;
    const markNormal = normal.clone().normalize();
    const markPosition = point.clone().addScaledVector(markNormal, 0.018);
    const markRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), markNormal);
    markRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(markNormal, Math.random() * Math.PI));
    const markScale = surface === 'metal' ? 0.085 : surface === 'soil' ? 0.15 : 0.12;
    this.marks.setMatrixAt(markSlot, new THREE.Matrix4().compose(
      markPosition,
      markRotation,
      new THREE.Vector3(markScale, markScale, 1),
    ));
    this.marks.setColorAt(markSlot, new THREE.Color(
      surface === 'metal' ? 0x5c482f : surface === 'wood' ? 0x4d3322 : surface === 'soil' ? 0x4a452f : 0x4a4b49,
    ));
    this.markLife[markSlot] = surface === 'metal' ? 5.5 : 8;
    this.marks.visible = true;
    this.marks.instanceMatrix.needsUpdate = true;
    if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate = true;
    this.points.visible = true;
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
    for (let slot = 0; slot < MAX_MARKS; slot += 1) {
      if (this.markLife[slot] <= 0) continue;
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
