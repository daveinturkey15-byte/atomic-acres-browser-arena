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
  { x: 0.91, z: 0.41, frequency: 0.0118, speed: 0.38, weight: 0.68, phase: 0.31, warpX: -0.43, warpZ: 0.90, warpFrequency: 0.0062, warpSpeed: -0.11, warpAmount: 0.72, warpPhase: 0.90 },
  { x: -0.22, z: 0.98, frequency: 0.0185, speed: 0.54, weight: 0.41, phase: 1.73, warpX: 0.84, warpZ: 0.54, warpFrequency: 0.0090, warpSpeed: 0.16, warpAmount: 0.55, warpPhase: 2.10 },
  { x: 0.65, z: -0.76, frequency: 0.0290, speed: 0.72, weight: 0.24, phase: 3.14, warpX: 0.76, warpZ: 0.65, warpFrequency: 0.0140, warpSpeed: -0.22, warpAmount: 0.42, warpPhase: 4.20 },
  { x: -0.95, z: -0.31, frequency: 0.0460, speed: 0.96, weight: 0.13, phase: 4.86, warpX: -0.31, warpZ: 0.95, warpFrequency: 0.0210, warpSpeed: 0.29, warpAmount: 0.31, warpPhase: 1.40 },
  { x: 0.37, z: 0.93, frequency: 0.0740, speed: 1.36, weight: 0.065, phase: 5.77, warpX: -0.93, warpZ: 0.37, warpFrequency: 0.0350, warpSpeed: -0.41, warpAmount: 0.22, warpPhase: 3.30 },
] as const;

export function sampleOceanWave(x: number, z: number, timeSeconds: number, amplitude: number): {
  height: number;
  normal: THREE.Vector3;
  verticalVelocity: number;
} {
  let height = 0;
  let derivativeX = 0;
  let derivativeZ = 0;
  let verticalVelocity = 0;
  for (const wave of OCEAN_WAVES) {
    const warpPhase = (x * wave.warpX + z * wave.warpZ) * wave.warpFrequency
      + timeSeconds * wave.warpSpeed
      + wave.warpPhase;
    const warpSin = Math.sin(warpPhase);
    const warpCos = Math.cos(warpPhase);
    const phase = (x * wave.x + z * wave.z) * wave.frequency
      + timeSeconds * wave.speed
      + wave.phase
      + warpSin * wave.warpAmount;
    const phaseDerivativeX = wave.frequency * wave.x
      + warpCos * wave.warpAmount * wave.warpFrequency * wave.warpX;
    const phaseDerivativeZ = wave.frequency * wave.z
      + warpCos * wave.warpAmount * wave.warpFrequency * wave.warpZ;
    const phaseDerivativeTime = wave.speed + warpCos * wave.warpAmount * wave.warpSpeed;
    const scaledAmplitude = wave.weight * amplitude;
    height += Math.sin(phase) * scaledAmplitude;
    derivativeX += Math.cos(phase) * scaledAmplitude * phaseDerivativeX;
    derivativeZ += Math.cos(phase) * scaledAmplitude * phaseDerivativeZ;
    verticalVelocity += Math.cos(phase) * scaledAmplitude * phaseDerivativeTime;
  }
  return {
    height,
    normal: new THREE.Vector3(-derivativeX, 1, -derivativeZ).normalize(),
    verticalVelocity,
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
  private waveAmp = 1.15;
  private segments = 140;
  /** Metres below the playable deck (oil-rig height). */
  private waterLevel = -19.5;
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
    this.waterLevel = options?.waterLevel ?? (this.enabled ? -19.5 : -0.55);
    this.waveAmp = profile === 'blender' ? 1.55 : 1.15;
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
        varying float vSlope;
        vec3 sampleWave(
          vec3 p,
          vec2 direction,
          float frequency,
          float speed,
          float weight,
          float phaseOffset,
          vec2 warpDirection,
          float warpFrequency,
          float warpSpeed,
          float warpAmount,
          float warpOffset
        ) {
          float warpPhase = dot(p.xz, warpDirection) * warpFrequency + uTime * warpSpeed + warpOffset;
          float warpCos = cos(warpPhase);
          float wavePhase = dot(p.xz, direction) * frequency
            + uTime * speed
            + phaseOffset
            + sin(warpPhase) * warpAmount;
          float scaledAmplitude = weight * uAmp;
          vec2 phaseDerivative = direction * frequency
            + warpDirection * (warpCos * warpAmount * warpFrequency);
          return vec3(
            sin(wavePhase) * scaledAmplitude,
            cos(wavePhase) * scaledAmplitude * phaseDerivative.x,
            cos(wavePhase) * scaledAmplitude * phaseDerivative.y
          );
        }
        void main() {
          vec3 p = position;
          // Deterministically warped long swells avoid the repeating sine-grid
          // look while keeping the CPU buoyancy sampler exactly in agreement.
          vec3 wave = sampleWave(p, vec2(0.91, 0.41), 0.0118, 0.38, 0.68, 0.31, vec2(-0.43, 0.90), 0.0062, -0.11, 0.72, 0.90)
            + sampleWave(p, vec2(-0.22, 0.98), 0.0185, 0.54, 0.41, 1.73, vec2(0.84, 0.54), 0.0090, 0.16, 0.55, 2.10)
            + sampleWave(p, vec2(0.65, -0.76), 0.0290, 0.72, 0.24, 3.14, vec2(0.76, 0.65), 0.0140, -0.22, 0.42, 4.20)
            + sampleWave(p, vec2(-0.95, -0.31), 0.0460, 0.96, 0.13, 4.86, vec2(-0.31, 0.95), 0.0210, 0.29, 0.31, 1.40)
            + sampleWave(p, vec2(0.37, 0.93), 0.0740, 1.36, 0.065, 5.77, vec2(-0.93, 0.37), 0.0350, -0.41, 0.22, 3.30);
          p.y += wave.x;
          vNormalW = normalize(mat3(modelMatrix) * vec3(-wave.y, 1.0, -wave.z));
          vSlope = length(wave.yz);
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
        uniform float uTime;
        uniform float uAmp;
        varying vec3 vWorld;
        varying float vWave;
        varying vec3 vNormalW;
        varying float vSlope;
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x), f.y);
        }
        void main() {
          float distIsland = max(abs(vWorld.x) / max(uIsland.x, 0.001), abs(vWorld.z) / max(uIsland.y, 0.001));
          // Ocean visible everywhere outside the deck footprint (including far under looking down).
          if (distIsland < 0.97) discard;
          float deepMix = smoothstep(1.0, 2.8, distIsland);
          vec3 col = mix(uShallow, uDeep, deepMix);
          vec2 detailUv = vWorld.xz * 0.052 + vec2(uTime * 0.048, -uTime * 0.033);
          float detail = valueNoise(detailUv) * 0.62 + valueNoise(detailUv * 2.17 + 9.4) * 0.38;
          float crest = smoothstep(0.28, 0.88, vWave / max(uAmp, 0.001));
          float foam = crest * smoothstep(0.38, 0.82, detail + vSlope * 2.6)
            * (0.45 + 0.55 * (1.0 - deepMix));
          // Bright lip under the rig edge.
          float edge = 1.0 - smoothstep(0.97, 1.12, distIsland);
          foam = max(foam, edge * 0.75);
          col = mix(col, uFoam, foam * (uNight > 0.5 ? 0.4 : 0.55));
          float detailX = valueNoise(detailUv + vec2(0.055, 0.0));
          float detailZ = valueNoise(detailUv + vec2(0.0, 0.055));
          vec3 n = normalize(vNormalW + vec3((detail - detailX) * 0.22, 0.0, (detail - detailZ) * 0.22));
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
    this.horizonMesh.position.y = this.waterLevel - 0.55;
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
    surfaceVelocityY: number;
  } {
    if (!this.enabled) {
      return { inWater: false, surfaceY: this.waterLevel, buoyancy: 0, drag: 0, surfaceVelocityY: 0 };
    }
    const nx = Math.abs(position.x) / (this.islandHalfX + 0.8);
    const nz = Math.abs(position.z) / (this.islandHalfZ + 0.8);
    const outside = Math.max(nx, nz) >= 0.98;
    const wave = sampleOceanWave(position.x, position.z, timeSeconds, this.waveAmp);
    const surfaceY = this.waterLevel + wave.height;
    const depth = surfaceY - position.y;
    const inWater = outside && depth > -1.2;
    if (!inWater) return { inWater: false, surfaceY, buoyancy: 0, drag: 0, surfaceVelocityY: wave.verticalVelocity };
    const submerged = THREE.MathUtils.clamp(depth + 1.4, 0, 4);
    return {
      inWater: true,
      surfaceY,
      buoyancy: submerged * 18,
      drag: 0.7 + submerged * 0.15,
      surfaceVelocityY: wave.verticalVelocity,
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
