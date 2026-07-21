import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';

export type WaterTelemetry = Readonly<{
  enabled: boolean;
  arenaId: ArenaId | null;
  waveAmp: number;
  segments: number;
  physicsActive: boolean;
}>;

/**
 * Out-of-bounds ocean ring for looking past the island edge.
 * Presentation + lightweight buoyancy/drag when a body enters the water volume.
 */
export class WaterSystem {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private arenaId: ArenaId | null = null;
  private enabled = false;
  private waveAmp = 0.22;
  private segments = 96;
  private readonly waterLevel = -0.55;
  private islandHalfX = 27;
  private islandHalfZ = 29;

  constructor(scene: THREE.Scene) {
    this.root.name = 'arena-water-system';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    scene.add(this.root);
  }

  configure(arenaId: ArenaId, profile: RenderProfile, island: { halfX: number; halfZ: number }): void {
    this.arenaId = arenaId;
    this.islandHalfX = island.halfX;
    this.islandHalfZ = island.halfZ;
    this.enabled = arenaId === 'rustworks-1v1' || arenaId === 'atomic-acres';
    this.waveAmp = profile === 'blender' ? 0.28 : 0.18;
    this.segments = profile === 'blender' ? 128 : 72;
    this.rebuild();
  }

  private rebuild(): void {
    if (this.mesh) {
      this.root.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
      this.material = null;
    }
    if (!this.enabled) {
      this.root.visible = false;
      return;
    }
    const size = 220;
    const geometry = new THREE.PlaneGeometry(size, size, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: this.waveAmp },
        uDeep: { value: new THREE.Color(0x0a3a4a) },
        uShallow: { value: new THREE.Color(0x2a8fa8) },
        uFoam: { value: new THREE.Color(0xd8f4ff) },
        uSun: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() },
        uIsland: { value: new THREE.Vector2(this.islandHalfX + 1.2, this.islandHalfZ + 1.2) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmp;
        varying vec3 vWorld;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w1 = sin(p.x * 0.11 + uTime * 1.15) * cos(p.z * 0.09 - uTime * 0.85);
          float w2 = sin(p.x * 0.27 - uTime * 1.7 + p.z * 0.19) * 0.45;
          float w3 = cos(p.z * 0.33 + uTime * 1.05) * sin(p.x * 0.07 + uTime * 0.4) * 0.28;
          float wave = (w1 + w2 + w3) * uAmp;
          p.y += wave;
          vWave = wave;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform vec3 uSun;
        uniform vec2 uIsland;
        varying vec3 vWorld;
        varying float vWave;
        void main() {
          float distIsland = max(abs(vWorld.x) / max(uIsland.x, 0.001), abs(vWorld.z) / max(uIsland.y, 0.001));
          // Soft shore band just outside the playable island.
          float shore = smoothstep(0.92, 1.18, distIsland);
          float deepMix = smoothstep(1.0, 2.4, distIsland);
          vec3 col = mix(uShallow, uDeep, deepMix);
          float foam = smoothstep(0.12, 0.28, vWave) * (1.0 - deepMix);
          foam = max(foam, (1.0 - smoothstep(0.98, 1.12, distIsland)) * 0.55 * shore);
          col = mix(col, uFoam, foam * 0.55);
          float fres = pow(1.0 - abs(normalize(cameraPosition - vWorld).y), 2.4);
          col = mix(col, uShallow * 1.15, fres * 0.35);
          float sunGlint = pow(max(0.0, dot(normalize(vec3(0.08, 1.0, 0.05)), uSun)), 48.0);
          col += sunGlint * 0.35 * shore;
          float alpha = mix(0.0, 0.86, shore);
          // Hide water under the island so the pad reads solid.
          if (distIsland < 0.94) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'arena-ocean-surface';
    this.mesh.position.y = this.waterLevel;
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.userData.presentationOnly = true;
    this.mesh.userData.blocksShots = false;
    this.mesh.raycast = () => undefined;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
    this.root.visible = true;
  }

  update(timeSeconds: number): void {
    if (!this.material) return;
    this.material.uniforms.uTime.value = timeSeconds;
  }

  /** Lightweight water physics for a body centre near/under the surface outside the island. */
  samplePhysics(position: THREE.Vector3): {
    inWater: boolean;
    surfaceY: number;
    buoyancy: number;
    drag: number;
  } {
    if (!this.enabled) {
      return { inWater: false, surfaceY: this.waterLevel, buoyancy: 0, drag: 0 };
    }
    const nx = Math.abs(position.x) / (this.islandHalfX + 1.2);
    const nz = Math.abs(position.z) / (this.islandHalfZ + 1.2);
    const outside = Math.max(nx, nz) >= 0.98;
    const wave =
      Math.sin(position.x * 0.11 + performance.now() * 0.00115) *
      Math.cos(position.z * 0.09 - performance.now() * 0.00085) *
      this.waveAmp;
    const surfaceY = this.waterLevel + wave;
    const depth = surfaceY - position.y;
    const inWater = outside && depth > -0.35;
    if (!inWater) return { inWater: false, surfaceY, buoyancy: 0, drag: 0 };
    const submerged = THREE.MathUtils.clamp(depth + 0.9, 0, 2.2);
    return {
      inWater: true,
      surfaceY,
      buoyancy: submerged * 14,
      drag: 0.55 + submerged * 0.2,
    };
  }

  telemetry(): WaterTelemetry {
    return {
      enabled: this.enabled,
      arenaId: this.arenaId,
      waveAmp: this.waveAmp,
      segments: this.segments,
      physicsActive: this.enabled,
    };
  }
}
