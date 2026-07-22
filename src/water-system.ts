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
  private nearSize = 480;
  private horizonRadius = 1_600;
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
    this.waveAmp = profile === 'blender' ? 1.65 : 1.15;
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
        void main() {
          vec3 p = position;
          // Large rolling swells + chop — readable from the elevated deck.
          float swell = sin(p.x * 0.035 + uTime * 0.55) * cos(p.z * 0.028 - uTime * 0.42);
          float roll = sin(p.x * 0.07 - p.z * 0.05 + uTime * 0.9) * 0.65;
          float chop = sin(p.x * 0.19 + uTime * 1.8) * cos(p.z * 0.17 - uTime * 1.4) * 0.35;
          float ridge = sin((p.x + p.z) * 0.09 + uTime * 0.7) * 0.28;
          float wave = (swell + roll + chop + ridge) * uAmp;
          p.y += wave;
          // Approximate normal from finite differences for lighting.
          float e = 0.9;
          float hx = (
            sin((p.x + e) * 0.035 + uTime * 0.55) * cos(p.z * 0.028 - uTime * 0.42)
            + sin((p.x + e) * 0.07 - p.z * 0.05 + uTime * 0.9) * 0.65
          ) * uAmp;
          float hz = (
            sin(p.x * 0.035 + uTime * 0.55) * cos((p.z + e) * 0.028 - uTime * 0.42)
            + sin(p.x * 0.07 - (p.z + e) * 0.05 + uTime * 0.9) * 0.65
          ) * uAmp;
          vec3 dx = normalize(vec3(e, hx - wave, 0.0));
          vec3 dz = normalize(vec3(0.0, hz - wave, e));
          vNormalW = normalize(cross(dz, dx));
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
          float moon = pow(max(0.0, dot(n, uMoon)), 28.0) * (uNight > 0.5 ? 0.55 : 0.25);
          col += moon * mix(vec3(0.6, 0.75, 1.0), vec3(1.0), 1.0 - uNight);
          float fres = pow(1.0 - abs(normalize(cameraPosition - vWorld).y), 2.2);
          col = mix(col, uShallow * 1.2, fres * 0.28);
          float alpha = mix(0.92, 0.98, deepMix);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    // uAmp used in fragment — bind same uniform
    this.material.uniforms.uAmp = this.material.uniforms.uAmp;
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

  samplePhysics(position: THREE.Vector3): {
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
    const t = performance.now() * 0.001;
    const wave =
      (Math.sin(position.x * 0.035 + t * 0.55) * Math.cos(position.z * 0.028 - t * 0.42)
        + Math.sin(position.x * 0.07 - position.z * 0.05 + t * 0.9) * 0.65)
      * this.waveAmp;
    const surfaceY = this.waterLevel + wave;
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
