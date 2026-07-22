import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';

export type WaterTelemetry = Readonly<{
  enabled: boolean;
  arenaId: ArenaId | null;
  waveAmp: number;
  segments: number;
  waterLevel: number;
  nearSize: number;
  horizonRadius: number;
  physicsActive: boolean;
}>;

const OCEAN_WAVES = [
  { x: 0.87, z: 0.49, frequency: 0.025, speed: 0.58, weight: 0.82, phase: 0.31 },
  { x: -0.31, z: 0.95, frequency: 0.041, speed: 0.76, weight: 0.46, phase: 1.73 },
  { x: 0.62, z: -0.78, frequency: 0.073, speed: 1.08, weight: 0.27, phase: 3.14 },
  { x: -0.91, z: -0.42, frequency: 0.12, speed: 1.55, weight: 0.14, phase: 4.86 },
] as const;

export function sampleOceanWave(x: number, z: number, timeSeconds: number, amplitude: number): {
  height: number;
  normal: THREE.Vector3;
} {
  let height = 0;
  let derivativeX = 0;
  let derivativeZ = 0;
  for (const wave of OCEAN_WAVES) {
    const phase = (x * wave.x + z * wave.z) * wave.frequency + timeSeconds * wave.speed + wave.phase;
    const scaledAmplitude = wave.weight * amplitude;
    height += Math.sin(phase) * scaledAmplitude;
    derivativeX += Math.cos(phase) * scaledAmplitude * wave.frequency * wave.x;
    derivativeZ += Math.cos(phase) * scaledAmplitude * wave.frequency * wave.z;
  }
  return {
    height,
    normal: new THREE.Vector3(-derivativeX, 1, -derivativeZ).normalize(),
  };
}

/**
 * Deep ocean under a raised oil-rig deck.
 * Water sits well below playable Y=0 so looking over the edge reads as height.
 */
export class WaterSystem {
  readonly root = new THREE.Group();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private horizonMesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private arenaId: ArenaId | null = null;
  private enabled = false;
  private waveAmp = 1.45;
  private segments = 140;
  /** Metres below the playable deck (oil-rig height). */
  private waterLevel = -16.5;
  private nearSize = 960;
  private horizonRadius = 3_200;
  private islandHalfX = 27;
  private islandHalfZ = 29;
  private night = true;

  constructor(scene: THREE.Scene) {
    this.root.name = 'arena-water-system';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    scene.add(this.root);
  }

  configure(
    arenaId: ArenaId,
    profile: RenderProfile,
    island: { halfX: number; halfZ: number },
    options?: { night?: boolean; waterLevel?: number },
  ): void {
    this.arenaId = arenaId;
    this.islandHalfX = island.halfX;
    this.islandHalfZ = island.halfZ;
    this.enabled = arenaId === 'rustworks-1v1';
    this.night = options?.night ?? arenaId === 'rustworks-1v1';
    this.waterLevel = options?.waterLevel ?? (this.enabled ? -16.5 : -0.55);
    this.waveAmp = profile === 'blender' ? 1.9 : 1.4;
    this.segments = profile === 'blender' ? 160 : 96;
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
    if (this.horizonMesh) {
      this.root.remove(this.horizonMesh);
      this.horizonMesh.geometry.dispose();
      this.horizonMesh.material.dispose();
      this.horizonMesh = null;
    }
    if (!this.enabled) {
      this.root.visible = false;
      return;
    }
    const size = this.nearSize;
    const geometry = new THREE.PlaneGeometry(size, size, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);
    const deep = this.night ? new THREE.Color(0x020814) : new THREE.Color(0x0a3a4a);
    const shallow = this.night ? new THREE.Color(0x0a2a44) : new THREE.Color(0x2a8fa8);
    const foam = this.night ? new THREE.Color(0x7ec8e8) : new THREE.Color(0xd8f4ff);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: this.waveAmp },
        uDeep: { value: deep },
        uShallow: { value: shallow },
        uFoam: { value: foam },
        uMoon: { value: new THREE.Vector3(0.25, 0.85, 0.35).normalize() },
        uIsland: { value: new THREE.Vector2(this.islandHalfX + 0.8, this.islandHalfZ + 0.8) },
        uNight: { value: this.night ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmp;
        varying vec3 vWorld;
        varying float vWave;
        varying vec3 vNormalW;
        vec3 sampleWave(vec3 p, float dx, float dz, float frequency, float speed, float weight, float phaseOffset) {
          float wavePhase = (p.x * dx + p.z * dz) * frequency + uTime * speed + phaseOffset;
          float scaledAmplitude = weight * uAmp;
          return vec3(
            sin(wavePhase) * scaledAmplitude,
            cos(wavePhase) * scaledAmplitude * frequency * dx,
            cos(wavePhase) * scaledAmplitude * frequency * dz
          );
        }
        void main() {
          vec3 p = position;
          // Large rolling swells + chop — readable from the elevated deck.
          vec3 wave = sampleWave(p, 0.87, 0.49, 0.025, 0.58, 0.82, 0.31)
            + sampleWave(p, -0.31, 0.95, 0.041, 0.76, 0.46, 1.73)
            + sampleWave(p, 0.62, -0.78, 0.073, 1.08, 0.27, 3.14)
            + sampleWave(p, -0.91, -0.42, 0.12, 1.55, 0.14, 4.86);
          p.y += wave.x;
          vNormalW = normalize(mat3(modelMatrix) * vec3(-wave.y, 1.0, -wave.z));
          vWave = wave.x;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform vec3 uMoon;
        uniform vec2 uIsland;
        uniform float uNight;
        varying vec3 vWorld;
        varying float vWave;
        varying vec3 vNormalW;
        void main() {
          float distIsland = max(abs(vWorld.x) / max(uIsland.x, 0.001), abs(vWorld.z) / max(uIsland.y, 0.001));
          // Ocean visible everywhere outside the deck footprint (including far under looking down).
          if (distIsland < 0.97) discard;
          float deepMix = smoothstep(1.0, 2.8, distIsland);
          vec3 col = mix(uShallow, uDeep, deepMix);
          float foam = smoothstep(0.4, 1.2, abs(vWave)) * (0.55 + 0.45 * (1.0 - deepMix));
          // Bright lip under the rig edge.
          float edge = 1.0 - smoothstep(0.97, 1.12, distIsland);
          foam = max(foam, edge * 0.75);
          col = mix(col, uFoam, foam * (uNight > 0.5 ? 0.4 : 0.55));
          vec3 n = normalize(vNormalW);
          vec3 viewDir = normalize(cameraPosition - vWorld);
          vec3 halfVector = normalize(uMoon + viewDir);
          float diffuse = 0.22 + max(0.0, dot(n, uMoon)) * 0.46;
          float specular = pow(max(0.0, dot(n, halfVector)), uNight > 0.5 ? 92.0 : 58.0);
          col *= diffuse + 0.56;
          col += specular * mix(vec3(0.58, 0.76, 1.0), vec3(1.0, 0.92, 0.72), 1.0 - uNight);
          float fres = pow(1.0 - max(0.0, dot(n, viewDir)), 3.2);
          vec3 horizonTint = mix(vec3(0.055, 0.12, 0.22), vec3(0.34, 0.68, 0.76), 1.0 - uNight);
          col = mix(col, horizonTint, fres * 0.52);
          float alpha = mix(0.92, 0.98, deepMix);
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

    // Cheap far-ocean ring. The animated near plane remains dense enough for
    // readable swells; this low-poly overlap carries the sea through the longer
    // Rustworks camera frustum so its square edge can never reveal sky/void.
    const horizonGeometry = new THREE.RingGeometry(size * 0.4, this.horizonRadius, 192, 1);
    horizonGeometry.rotateX(-Math.PI / 2);
    const horizonMaterial = new THREE.MeshBasicMaterial({
      color: deep,
      side: THREE.DoubleSide,
      depthWrite: true,
      // The animated near-water shader does not consume Three.js fog chunks.
      // Fogging only the far ring creates a bright horizontal colour step where
      // the two overlap, so keep both surfaces on the same night/day palette.
      fog: false,
    });
    this.horizonMesh = new THREE.Mesh(horizonGeometry, horizonMaterial);
    this.horizonMesh.name = 'arena-ocean-horizon';
    this.horizonMesh.position.y = this.waterLevel - 0.35;
    this.horizonMesh.receiveShadow = false;
    this.horizonMesh.castShadow = false;
    this.horizonMesh.userData.presentationOnly = true;
    this.horizonMesh.userData.blocksShots = false;
    this.horizonMesh.raycast = () => undefined;
    this.horizonMesh.frustumCulled = false;
    this.root.add(this.horizonMesh);
    this.root.visible = true;
  }

  update(timeSeconds: number): void {
    if (!this.material) return;
    this.material.uniforms.uTime.value = timeSeconds;
  }

  samplePhysics(position: THREE.Vector3, timeSeconds = performance.now() * 0.001): {
    inWater: boolean;
    surfaceY: number;
    buoyancy: number;
    drag: number;
  } {
    if (!this.enabled) {
      return { inWater: false, surfaceY: this.waterLevel, buoyancy: 0, drag: 0 };
    }
    const nx = Math.abs(position.x) / (this.islandHalfX + 0.8);
    const nz = Math.abs(position.z) / (this.islandHalfZ + 0.8);
    const outside = Math.max(nx, nz) >= 0.98;
    const wave = sampleOceanWave(position.x, position.z, timeSeconds, this.waveAmp);
    const surfaceY = this.waterLevel + wave.height;
    const depth = surfaceY - position.y;
    const inWater = outside && depth > -1.2;
    if (!inWater) return { inWater: false, surfaceY, buoyancy: 0, drag: 0 };
    const submerged = THREE.MathUtils.clamp(depth + 1.4, 0, 4);
    return {
      inWater: true,
      surfaceY,
      buoyancy: submerged * 18,
      drag: 0.7 + submerged * 0.15,
    };
  }

  telemetry(): WaterTelemetry {
    return {
      enabled: this.enabled,
      arenaId: this.arenaId,
      waveAmp: this.waveAmp,
      segments: this.segments,
      waterLevel: this.waterLevel,
      nearSize: this.nearSize,
      horizonRadius: this.horizonRadius,
      physicsActive: this.enabled,
    };
  }
}
