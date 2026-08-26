import * as THREE from 'three';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';

export const MAX_TRACERS = 32;

/** Fixed-capacity, one-draw-call tracer presentation. Authoritative rays remain external. */
export class TracerPool {
  readonly lines: THREE.LineSegments;
  private readonly positions = new Float32Array(MAX_TRACERS * 2 * 3);
  private readonly colors = new Float32Array(MAX_TRACERS * 2 * 3);
  private readonly life = new Float32Array(MAX_TRACERS);
  private cursor = 0;
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;

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
    const parentScene = this.lines.parent;
    if (!(parentScene instanceof THREE.Scene)) throw new Error('Tracer presentation must be attached to a scene before prewarm');

    const positions = this.positions.slice();
    const colors = this.colors.slice();
    const visible = this.lines.visible;
    const frustumCulled = this.lines.frustumCulled;

    camera.updateWorldMatrix(true, false);
    this.lines.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const tint = new THREE.Color();
    const columns = 8;
    const rows = Math.ceil(MAX_TRACERS / columns);

    // Stage every vertex in the fixed live buffer as an opaque-screen, exact-
    // scale draw. Merely compiling the initially zeroed LineSegments leaves
    // its first useful buffer upload and raster work in the combat frame.
    for (let slot = 0; slot < MAX_TRACERS; slot += 1) {
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      const center = cameraPosition.clone()
        .addScaledVector(forward, 18)
        .addScaledVector(right, (column - (columns - 1) / 2) * 0.9)
        .addScaledVector(up, ((rows - 1) / 2 - row) * 1.2);
      const start = this.lines.worldToLocal(center.clone().addScaledVector(right, -2.75));
      const end = this.lines.worldToLocal(center.clone().addScaledVector(right, 2.75));
      const offset = slot * 6;
      this.positions.set([start.x, start.y, start.z, end.x, end.y, end.z], offset);
      tint.setHSL(slot / MAX_TRACERS, 0.72, 0.62);
      this.colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], offset);
    }

    this.lines.visible = true;
    this.lines.frustumCulled = false;
    this.markDirty();
    try {
      await runtime.compileAndRender(this.lines, camera, parentScene);
      this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      this.positions.set(positions);
      this.colors.set(colors);
      this.lines.visible = visible;
      this.lines.frustumCulled = frustumCulled;
      this.markDirty();
    }
  }

  emit(start: THREE.Vector3, end: THREE.Vector3, color: number, lifetime = 0.085): void {
    if (![start.x, start.y, start.z, end.x, end.y, end.z, lifetime].every(Number.isFinite)) return;
    const slot = this.cursor++ % MAX_TRACERS;
    const offset = slot * 6;
    this.positions.set([start.x, start.y, start.z, end.x, end.y, end.z], offset);
    const tint = new THREE.Color(color);
    this.colors.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], offset);
    this.life[slot] = THREE.MathUtils.clamp(lifetime, 0.016, 0.18);
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
