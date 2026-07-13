import * as THREE from 'three';

export const MAX_TRACERS = 18;

/** Fixed-capacity, one-draw-call tracer presentation. Authoritative rays remain external. */
export class TracerPool {
  readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_TRACERS * 2 * 3);
  private readonly colors = new Float32Array(MAX_TRACERS * 2 * 3);
  private readonly life = new Float32Array(MAX_TRACERS);
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.name = 'pooled-combat-tracers';
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  emit(start: THREE.Vector3, end: THREE.Vector3, color: number, lifetime = 0.055): void {
    if (![start.x, start.y, start.z, end.x, end.y, end.z, lifetime].every(Number.isFinite)) return;
    const slot = this.cursor++ % MAX_TRACERS;
    const offset = slot * 6;
    this.positions.set([start.x, start.y, start.z, end.x, end.y, end.z], offset);
    const tint = new THREE.Color(color);
    this.colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], offset);
    this.life[slot] = THREE.MathUtils.clamp(lifetime, 0.016, 0.12);
    this.lines.visible = true;
    this.markDirty();
  }

  update(dt: number): void {
    let changed = false;
    for (let slot = 0; slot < MAX_TRACERS; slot += 1) {
      if (this.life[slot] <= 0) continue;
      this.life[slot] -= Math.max(0, dt);
      if (this.life[slot] <= 0) {
        this.positions.fill(0, slot * 6, slot * 6 + 6);
        changed = true;
      }
    }
    if (changed) this.markDirty();
    this.lines.visible = this.activeCount() > 0;
  }

  activeCount(): number {
    return this.life.reduce((count, value) => count + Number(value > 0), 0);
  }

  private markDirty(): void {
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.lines.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
