import * as THREE from 'three';
import { isSoftwareWebGLRenderer } from './atomic-signal';
import type { ArenaLightingProfile } from './blender-lighting';
import type { Box2 } from './collision';
import {
  createGrassPlacements,
  evaluateGrassBend,
  GRASS_BLADES_PER_INSTANCE,
  GRASS_MAX_BLADES,
  GRASS_MAX_HEIGHT,
  type GrassPlacement,
} from './grass-placement';
import type { RenderProfile } from './render-profile';

export type GrassProfileConfig = Readonly<{
  enabled: boolean;
  instanceLimit: number;
  bladeLimit: number;
  triangleLimit: number;
  chunkLimit: number;
  maximumDistance: number;
  windStrength: number;
  interactionRadius: number;
  dewStrength: number;
}>;

export type GrassTelemetry = Readonly<{
  pass: 29;
  profile: RenderProfile;
  enabled: boolean;
  bypassReason: string | null;
  layoutId: string;
  instances: number;
  blades: number;
  checksum: string;
  chunks: number;
  visibleChunks: number;
  submissions: number;
  triangles: number;
  triangleLimit: number;
  maximumHeight: number;
  maximumDistance: number;
  adaptiveDistance: number;
  windTime: number;
  interactionRadius: number;
  interactionStrength: number;
  rejectedByStructure: number;
  perFrameAllocations: 0;
  authoritative: false;
}>;

export function grassProfileConfig(profile: RenderProfile): GrassProfileConfig {
  if (profile === 'compat') {
    return {
      enabled: false,
      instanceLimit: 0,
      bladeLimit: 0,
      triangleLimit: 0,
      chunkLimit: 0,
      maximumDistance: 0,
      windStrength: 0,
      interactionRadius: 0,
      dewStrength: 0,
    };
  }
  if (profile === 'performance') {
    return {
      enabled: true,
      instanceLimit: 1_200,
      bladeLimit: 1_200 * GRASS_BLADES_PER_INSTANCE,
      triangleLimit: 21_600,
      chunkLimit: 4,
      maximumDistance: 38,
      windStrength: 0.78,
      interactionRadius: 2.35,
      dewStrength: 0.015,
    };
  }
  return {
    enabled: true,
    instanceLimit: GRASS_MAX_BLADES,
    bladeLimit: GRASS_MAX_BLADES * GRASS_BLADES_PER_INSTANCE,
    triangleLimit: 43_200,
    chunkLimit: 4,
    maximumDistance: 54,
    windStrength: 1,
    interactionRadius: 2.65,
    dewStrength: 0.028,
  };
}

export function grassBypassReason(profile: RenderProfile, rendererLabel: string, query: string | null): string | null {
  if (query === 'off') return 'query-disabled';
  if (profile === 'compat') return 'compat-profile';
  if (query === 'on') return null;
  if (isSoftwareWebGLRenderer(rendererLabel)) return 'software-renderer';
  return null;
}

function createBladeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const tufts: readonly (readonly [number, number, number])[] = [
    [-0.9, -0.15, 1],
    [0.72, 0.52, 0.82],
    [0.15, -0.86, 0.68],
  ];
  const addPlane = (offsetX: number, offsetZ: number, height: number, alongX: boolean) => {
    const base = positions.length / 3;
    const point = (side: number, y: number, width: number): [number, number, number] => alongX
      ? [offsetX + side * width, y, offsetZ]
      : [offsetX, y, offsetZ + side * width];
    for (const vertex of [
      point(-1, 0, 0.5), point(1, 0, 0.5),
      point(-1, height * 0.58, 0.3), point(1, height * 0.58, 0.3),
      [offsetX, height, offsetZ] as [number, number, number],
    ]) positions.push(...vertex);
    const normal: [number, number, number] = alongX ? [0, 0, 1] : [1, 0, 0];
    for (let index = 0; index < 5; index += 1) normals.push(...normal);
    indices.push(
      base, base + 1, base + 3,
      base, base + 3, base + 2,
      base + 2, base + 3, base + 4,
    );
  };
  for (const [x, z, height] of tufts) {
    addPlane(x, z, height, true);
    addPlane(x, z, height, false);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.name = 'pass29-three-blade-tapered-tuft';
  return geometry;
}

function createGrassMaterial(profile: GrassProfileConfig, lighting: ArenaLightingProfile): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'pass29-living-grass-linear-hdr',
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uWindStrength: { value: profile.windStrength },
        uPlayerPosition: { value: new THREE.Vector2(10_000, 10_000) },
        uInteractionRadius: { value: profile.interactionRadius },
        uInteractionStrength: { value: 0 },
        uBaseColor: { value: new THREE.Color(0x1f3d25) },
        uTipColor: { value: new THREE.Color(0x4c6f39) },
        uSunColor: { value: new THREE.Color(lighting.sunColor) },
        uSunDirection: { value: new THREE.Vector3(...lighting.sunPosition).normalize() },
        uAmbient: { value: Math.min(0.58, 0.24 + lighting.hemisphereIntensity * 0.18 + lighting.ambientIntensity * 0.36) },
        uDewStrength: { value: profile.dewStrength },
      },
    ]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uPlayerPosition;
      uniform float uInteractionRadius;
      uniform float uInteractionStrength;
      varying float vBladeHeight;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 baseWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float bladeHeight = clamp(position.y, 0.0, 1.0);
        float bendWeight = bladeHeight * bladeHeight;
        float phase = baseWorld.x * 0.19 + baseWorld.z * 0.13 + uTime * 1.35;
        vec2 wind = vec2(
          sin(phase) * 0.105 + sin(phase * 0.47 + 1.7) * 0.035,
          cos(phase * 0.82) * 0.045
        ) * uWindStrength;
        vec2 away = baseWorld.xz - uPlayerPosition;
        float playerDistance = length(away);
        float interaction = (1.0 - smoothstep(0.0, uInteractionRadius, playerDistance)) * uInteractionStrength;
        vec2 interactionDirection = playerDistance > 0.0001 ? away / playerDistance : vec2(0.0);
        worldPosition.xz += (wind + interactionDirection * interaction * 0.26) * bendWeight;
        worldPosition.y -= interaction * bladeHeight * 0.11;
        vBladeHeight = bladeHeight;
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uBaseColor;
      uniform vec3 uTipColor;
      uniform vec3 uSunColor;
      uniform vec3 uSunDirection;
      uniform float uAmbient;
      uniform float uDewStrength;
      varying float vBladeHeight;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 normal = normalize(gl_FrontFacing ? vWorldNormal : -vWorldNormal);
        float diffuse = max(dot(normal, normalize(uSunDirection)), 0.0);
        vec3 base = mix(uBaseColor, uTipColor, smoothstep(0.08, 1.0, vBladeHeight));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float grazing = pow(1.0 - abs(dot(normal, viewDirection)), 3.0);
        float dew = grazing * smoothstep(0.35, 1.0, vBladeHeight) * uDewStrength;
        vec3 outgoingLight = base * (uAmbient + diffuse * 0.42) + uSunColor * dew;
        gl_FragColor = vec4(outgoingLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  material.customProgramCacheKey = () => `pass29-grass:${profile.bladeLimit}:${profile.dewStrength}`;
  material.userData.presentationOnly = true;
  material.userData.blocksShots = false;
  material.userData.pass29LivingGrass = true;
  return material;
}

export class GrassSystem {
  readonly root = new THREE.Group();
  private readonly config: GrassProfileConfig;
  private readonly bypass: string | null;
  private readonly geometry: THREE.BufferGeometry | null;
  private readonly material: THREE.ShaderMaterial | null;
  private readonly chunks: THREE.InstancedMesh[] = [];
  private readonly chunkBounds: Array<Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>> = [];
  private readonly admittedPlacements: GrassPlacement[] = [];
  private readonly placementChecksum: string;
  private readonly rejectedByStructure: number;
  private bladeCount = 0;
  private visibleChunks = 0;
  private submissions = 0;
  private submissionRenderFrame = -1;
  private adaptiveDistance = 0;
  private debugTime: number | null = null;
  private readonly debugInteractionPosition = new THREE.Vector2();
  private debugInteractionEnabled = false;
  private windTime = 0;
  private interactionStrength = 0;

  constructor(
    scene: THREE.Scene,
    private readonly profile: RenderProfile,
    rendererLabel: string,
    query: string | null,
    colliders: readonly Box2[],
    lighting: ArenaLightingProfile,
  ) {
    this.root.name = 'pass29-living-grass';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.config = grassProfileConfig(profile);
    this.bypass = grassBypassReason(profile, rendererLabel, query);
    this.adaptiveDistance = this.config.maximumDistance;
    const placementResult = createGrassPlacements(colliders, GRASS_MAX_BLADES);
    this.placementChecksum = placementResult.checksum;
    this.rejectedByStructure = placementResult.rejectedByStructure;
    if (this.bypass || !this.config.enabled) {
      this.geometry = null;
      this.material = null;
      scene.add(this.root);
      return;
    }

    this.geometry = createBladeGeometry();
    this.material = createGrassMaterial(this.config, lighting);
    const grouped = Array.from({ length: this.config.chunkLimit }, () => [] as GrassPlacement[]);
    for (const placement of placementResult.placements.slice(0, this.config.instanceLimit)) grouped[placement.chunk]?.push(placement);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0);

    grouped.forEach((placements, chunkIndex) => {
      const admitted = placements;
      if (admitted.length === 0) return;
      const mesh = new THREE.InstancedMesh(this.geometry!, this.material!, admitted.length);
      mesh.name = `pass29-grass-chunk-${chunkIndex}`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      mesh.userData.presentationOnly = true;
      mesh.userData.blocksShots = false;
      mesh.userData.pass29GrassChunk = chunkIndex;
      let centreX = 0;
      let centreZ = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      admitted.forEach((placement, index) => {
        position.set(placement.x, 0.045, placement.z);
        euler.set(0, placement.yaw, 0);
        rotation.setFromEuler(euler);
        scale.set(placement.width, placement.height, placement.width);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
        centreX += placement.x;
        centreZ += placement.z;
        minX = Math.min(minX, placement.x);
        maxX = Math.max(maxX, placement.x);
        minZ = Math.min(minZ, placement.z);
        maxZ = Math.max(maxZ, placement.z);
        this.admittedPlacements.push(placement);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.onBeforeRender = (activeRenderer) => {
        const renderFrame = activeRenderer.info.render.frame;
        if (renderFrame !== this.submissionRenderFrame) {
          this.submissionRenderFrame = renderFrame;
          this.submissions = 0;
        }
        this.submissions += 1;
      };
      // Keep the accumulated centre calculations as a finite-data assertion in
      // development while culling against the actual occupied rectangle. AABB
      // distance prevents a long verge chunk popping out while its centre is far
      // away but nearby blades are still in view.
      if (!Number.isFinite(centreX / admitted.length) || !Number.isFinite(centreZ / admitted.length)) {
        throw new Error(`Pass 29 grass chunk ${chunkIndex} has non-finite placement data`);
      }
      this.chunkBounds.push(Object.freeze({ minX, maxX, minZ, maxZ }));
      this.chunks.push(mesh);
      this.root.add(mesh);
      this.bladeCount += admitted.length;
    });
    scene.add(this.root);
  }

  update(
    timeSeconds: number,
    cameraPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
    interactionEnabled: boolean,
  ): void {
    this.submissions = 0;
    if (!this.material) return;
    this.windTime = this.debugTime ?? (Number.isFinite(timeSeconds) ? timeSeconds : 0);
    this.interactionStrength = this.debugInteractionEnabled || interactionEnabled ? 1 : 0;
    this.material.uniforms.uTime.value = this.windTime;
    const target = this.material.uniforms.uPlayerPosition.value as THREE.Vector2;
    if (this.debugInteractionEnabled) target.copy(this.debugInteractionPosition);
    else target.set(playerPosition.x, playerPosition.z);
    this.material.uniforms.uInteractionStrength.value = this.interactionStrength;
    this.visibleChunks = 0;
    const maximumDistanceSq = this.adaptiveDistance * this.adaptiveDistance;
    for (let index = 0; index < this.chunks.length; index += 1) {
      const bounds = this.chunkBounds[index];
      const dx = cameraPosition.x < bounds.minX ? bounds.minX - cameraPosition.x
        : cameraPosition.x > bounds.maxX ? cameraPosition.x - bounds.maxX : 0;
      const dz = cameraPosition.z < bounds.minZ ? bounds.minZ - cameraPosition.z
        : cameraPosition.z > bounds.maxZ ? cameraPosition.z - bounds.maxZ : 0;
      const visible = dx * dx + dz * dz <= maximumDistanceSq;
      this.chunks[index].visible = visible;
      if (visible) this.visibleChunks += 1;
    }
  }

  setAdaptivePixelRatio(pixelRatioCap: number): void {
    if (!this.config.enabled || this.bypass) return;
    const authoredCap = this.profile === 'blender' ? 1 : 0.75;
    const ratio = THREE.MathUtils.clamp(pixelRatioCap / authoredCap, 0.66, 1);
    this.adaptiveDistance = this.config.maximumDistance * ratio;
  }

  handleContextRestored(): void {
    if (this.material) this.material.needsUpdate = true;
    if (this.geometry) for (const chunk of this.chunks) chunk.instanceMatrix.needsUpdate = true;
  }

  setDebugTime(timeSeconds: number | null): void {
    this.debugTime = timeSeconds === null || !Number.isFinite(timeSeconds) ? null : timeSeconds;
  }

  setDebugInteraction(x: number | null, z: number | null): void {
    this.debugInteractionEnabled = Number.isFinite(x) && Number.isFinite(z);
    if (this.debugInteractionEnabled) this.debugInteractionPosition.set(x!, z!);
  }

  sampleDebugBend(index: number): Record<string, number> | null {
    const placement = this.admittedPlacements[Math.max(0, Math.min(this.admittedPlacements.length - 1, Math.floor(index)))];
    if (!placement) return null;
    const bend = evaluateGrassBend(placement, this.windTime, {
      playerX: (this.material?.uniforms.uPlayerPosition.value as THREE.Vector2 | undefined)?.x ?? 10_000,
      playerZ: (this.material?.uniforms.uPlayerPosition.value as THREE.Vector2 | undefined)?.y ?? 10_000,
      radius: this.config.interactionRadius,
      strength: this.interactionStrength,
    });
    return { index: Math.floor(index), x: placement.x, z: placement.z, bendX: bend.x, bendZ: bend.z, flatten: bend.flatten };
  }

  telemetry(): GrassTelemetry {
    return {
      pass: 29,
      profile: this.profile,
      enabled: this.bypass === null && this.config.enabled,
      bypassReason: this.bypass,
      layoutId: 'split-road-verges-v2',
      instances: this.bladeCount,
      blades: this.bladeCount * GRASS_BLADES_PER_INSTANCE,
      checksum: this.placementChecksum,
      chunks: this.chunks.length,
      visibleChunks: this.visibleChunks,
      submissions: this.submissions,
      triangles: this.bladeCount * 18,
      triangleLimit: this.config.triangleLimit,
      maximumHeight: GRASS_MAX_HEIGHT,
      maximumDistance: this.config.maximumDistance,
      adaptiveDistance: this.adaptiveDistance,
      windTime: this.windTime,
      interactionRadius: this.config.interactionRadius,
      interactionStrength: this.interactionStrength,
      rejectedByStructure: this.rejectedByStructure,
      perFrameAllocations: 0,
      authoritative: false,
    };
  }

  dispose(): void {
    this.root.removeFromParent();
    this.geometry?.dispose();
    this.material?.dispose();
  }
}
