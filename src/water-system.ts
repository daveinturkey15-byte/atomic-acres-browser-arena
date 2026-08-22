import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { RenderProfile } from './render-profile';
// HF-358: the per-arena WaterBodyDefinition registry is the single authored
// source for where water exists, its level and its swimmability. The legacy
// WebGL2 route reads the same registry as the WebGPU TSL factory so both
// presentations can never drift apart.
import { waterBodyForArena } from './water/water-authoring';
import { sampleOcean } from './water/ocean-spectrum';

export type WaterTelemetry = Readonly<{
  enabled: boolean;
  arenaId: ArenaId | null;
  waveAmp: number;
  segments: number;
  waterLevel: number;
  nearSize: number;
  horizonRadius: number;
  physicsActive: boolean;
  swimmable: boolean;
  waveBands: number;
  waveAuthority: typeof RUSTWORKS_OCEAN_AUTHORITY_ID;
}>;

export const RUSTWORKS_OCEAN_AUTHORITY_ID = 'shared-render-physics-ocean-spectrum' as const;

export const OCEAN_WAVES = Object.freeze([
  // Long storm swells plus progressively tighter chop. The previous 85-530 m
  // wavelengths looked like a handful of enormous flat polygons from the rig;
  // this 22-180 m spectrum preserves the large displacement while making the
  // physical surface read continuously at player height.
  { x: 0.91, z: 0.41, frequency: 0.035, speed: 0.55, weight: 0.68, phase: 0.31, warpX: -0.43, warpZ: 0.90, warpFrequency: 0.012, warpSpeed: -0.17, warpAmount: 0.72, warpPhase: 0.90 },
  { x: -0.22, z: 0.98, frequency: 0.061, speed: 0.78, weight: 0.41, phase: 1.73, warpX: 0.84, warpZ: 0.54, warpFrequency: 0.019, warpSpeed: 0.24, warpAmount: 0.55, warpPhase: 2.10 },
  { x: 0.65, z: -0.76, frequency: 0.105, speed: 1.10, weight: 0.24, phase: 3.14, warpX: 0.76, warpZ: 0.65, warpFrequency: 0.032, warpSpeed: -0.34, warpAmount: 0.42, warpPhase: 4.20 },
  { x: -0.95, z: -0.31, frequency: 0.175, speed: 1.52, weight: 0.13, phase: 4.86, warpX: -0.31, warpZ: 0.95, warpFrequency: 0.052, warpSpeed: 0.45, warpAmount: 0.31, warpPhase: 1.40 },
  { x: 0.37, z: 0.93, frequency: 0.290, speed: 2.05, weight: 0.065, phase: 5.77, warpX: -0.93, warpZ: 0.37, warpFrequency: 0.090, warpSpeed: -0.62, warpAmount: 0.22, warpPhase: 3.30 },
] as const);

export const RUSTWORKS_OCEAN_AMPLITUDE = Object.freeze({
  // Wave height participates in buoyancy and is therefore gameplay authority,
  // not a graphics-quality knob. Every profile and peer must sample the same
  // spectrum; Performance reduces presentation tessellation instead.
  compat: 1.55,
  performance: 1.55,
  blender: 1.55,
} as const);

export function rustworksOceanAmplitude(profile: RenderProfile): number {
  return RUSTWORKS_OCEAN_AMPLITUDE[profile];
}

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
  private presentationEnabled = false;
  private waveAmp: number = RUSTWORKS_OCEAN_AMPLITUDE.blender;
  private segments = 140;
  /** Metres below the playable deck (oil-rig height). */
  private waterLevel = -19.5;
  private nearSize = 960;
  private horizonRadius = 3_200;
  private islandHalfX = 27;
  private islandHalfZ = 29;
  private night = true;
  private shoreInnerRadius = 27.8;
  private shoreOuterRadius = 78;
  private palette = { deep: 0x071b2b, shallow: 0x165b71, foam: 0x68b9c9 };
  private dryFootprintMask: 'rectangular' | 'none' = 'rectangular';

  constructor(
    scene: THREE.Scene,
    private readonly presentation: 'legacy-glsl' | 'external-tsl' = 'legacy-glsl',
  ) {
    this.root.name = 'arena-water-system';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    scene.add(this.root);
  }

  configure(
    arenaId: ArenaId,
    profile: RenderProfile,
  ): void {
    this.arenaId = arenaId;
    const body = waterBodyForArena(arenaId);
    this.enabled = body !== null;
    this.presentationEnabled = body?.presentationOwner === 'shared-ocean';
    if (body) {
      this.islandHalfX = body.island.halfX;
      this.islandHalfZ = body.island.halfZ;
      this.night = body.night;
      this.waterLevel = body.level;
      this.waveAmp = rustworksOceanAmplitude(profile) * body.amplitudeScale;
      this.nearSize = body.nearSize;
      this.horizonRadius = body.horizonRadius;
      this.shoreInnerRadius = body.shore.innerRadius;
      this.shoreOuterRadius = body.shore.outerRadius;
      this.palette = body.legacyPalette;
      this.dryFootprintMask = body.dryFootprintMask;
    } else {
      // Clear the complete authored state on every arena switch. Leaving the
      // previous body's level, mask or swim flag behind made disabled-water
      // telemetry and CPU samples describe whichever arena ran before it.
      this.islandHalfX = 0;
      this.islandHalfZ = 0;
      this.night = false;
      this.waterLevel = 0;
      this.waveAmp = 0;
      this.nearSize = 0;
      this.horizonRadius = 0;
      this.shoreInnerRadius = 0;
      this.shoreOuterRadius = 0;
      this.palette = { deep: 0, shallow: 0, foam: 0 };
      this.dryFootprintMask = 'none';
    }
    this.segments = profile === 'blender' ? 160 : 96;
    // WebGPU owns the visible water through Pass64TslSceneSystems. This object
    // remains the deterministic CPU water/physics authority only.
    if (this.presentation === 'external-tsl') {
      this.root.visible = false;
      return;
    }
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
    if (!this.presentationEnabled) {
      this.root.visible = false;
      return;
    }
    const size = this.nearSize;
    const geometry = new THREE.PlaneGeometry(size, size, this.segments, this.segments);
    geometry.rotateX(-Math.PI / 2);
    const deep = new THREE.Color(this.palette.deep);
    const shallow = new THREE.Color(this.palette.shallow);
    const foam = new THREE.Color(this.palette.foam);
    const glslWaveExpression = OCEAN_WAVES.map((wave) => `sampleWave(p, vec2(${wave.x.toFixed(6)}, ${wave.z.toFixed(6)}), ${wave.frequency.toFixed(6)}, ${wave.speed.toFixed(6)}, ${wave.weight.toFixed(6)}, ${wave.phase.toFixed(6)}, vec2(${wave.warpX.toFixed(6)}, ${wave.warpZ.toFixed(6)}), ${wave.warpFrequency.toFixed(6)}, ${wave.warpSpeed.toFixed(6)}, ${wave.warpAmount.toFixed(6)}, ${wave.warpPhase.toFixed(6)})`)
      .join('\n            + ');
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
        uExcludeDryFootprint: { value: this.dryFootprintMask === 'rectangular' ? 1 : 0 },
        uShore: { value: new THREE.Vector2(this.shoreInnerRadius, this.shoreOuterRadius) },
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
          vec3 wave = ${glslWaveExpression};
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
        uniform float uExcludeDryFootprint;
        uniform vec2 uShore;
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
          if (uExcludeDryFootprint > 0.5 && distIsland < 0.97) discard;
          float distanceFromOrigin = max(abs(vWorld.x), abs(vWorld.z));
          float deepMix = smoothstep(uShore.x, uShore.y, distanceFromOrigin);
          vec3 col = mix(uShallow, uDeep, deepMix);
          vec2 detailUv = vWorld.xz * 0.052 + vec2(uTime * 0.048, -uTime * 0.033);
          float detail = valueNoise(detailUv) * 0.62 + valueNoise(detailUv * 2.17 + 9.4) * 0.38;
          float crest = smoothstep(0.28, 0.88, vWave / max(uAmp, 0.001));
          float foam = crest * smoothstep(0.38, 0.82, detail + vSlope * 2.6)
            * (0.45 + 0.55 * (1.0 - deepMix));
          // Bright lip under the rig edge.
          float edge = uExcludeDryFootprint * (1.0 - smoothstep(0.97, 1.12, distIsland));
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
    const outside = this.dryFootprintMask === 'none' || Math.max(nx, nz) >= 0.98;
    // HF-358: one shared frozen Gerstner spectrum (ocean-spectrum.ts) is the
    // single CPU authority — the same table the WebGPU TSL surface displaces
    // with. The legacy warped-sine OCEAN_WAVES field remains only for the
    // WebGL2 GLSL presentation above.
    const wave = sampleOcean(position.x, position.z, timeSeconds, this.waveAmp);
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

  /** HF-358: the authored body driving this system (null when no water). */
  get body(): ReturnType<typeof waterBodyForArena> {
    return this.arenaId === null ? null : waterBodyForArena(this.arenaId);
  }

  /** HF-358: whether this body admits the swim state (registry-driven). */
  get swimmable(): boolean {
    return this.body?.swimmable ?? false;
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
      swimmable: this.swimmable,
      waveBands: OCEAN_WAVES.length,
      waveAuthority: RUSTWORKS_OCEAN_AUTHORITY_ID,
    };
  }
}
