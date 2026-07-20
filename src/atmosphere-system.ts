import * as THREE from 'three';
import { isSoftwareWebGLRenderer } from './atomic-signal';
import type { RenderProfile } from './render-profile';

export type AtmosphereTelemetry = Readonly<{
  pass: 30;
  enabled: boolean;
  bypassReason: string | null;
  mistCards: number;
  smokeCards: number;
  dustMotes: number;
  triangles: number;
  submissions: number;
  textureSamples: 0;
  volumetricRayMarching: false;
  perFrameAllocations: 0;
  time: number;
}>;

export function atmosphereBypassReason(profile: RenderProfile, rendererLabel: string, query: string | null): string | null {
  if (query === 'off') return 'query-disabled';
  if (profile === 'compat') return 'compat-profile';
  if (isSoftwareWebGLRenderer(rendererLabel) && query !== 'on') return 'software-renderer';
  return null;
}

const MIST_LAYOUT: readonly (readonly [number, number, number, number])[] = [
  [-27, -18, 17, 5.2], [-25, 13, 14, 4.4], [-17, 29, 12, 4.2],
  [27, -23, 15, 4.8], [25, 15, 13, 4.3], [17, -32, 11, 3.8],
  [-8, -35, 13, 3.5], [8, 35, 13, 3.5], [-18, 0, 10, 3.2], [18, 0, 10, 3.2],
] as const;

const SMOKE_LAYOUT: readonly (readonly [number, number, number, number, number])[] = [
  [-1.7, 13.4, 2.5, 4.4, 0.3], [5.8, -3.6, 2.2, 3.8, 1.7],
  [-4.2, -31.2, 2.6, 4.8, 3.1], [13.8, 31.2, 2.6, 4.8, 4.6],
  [29.8, -14.2, 2.4, 4.2, 5.8],
] as const;

export class AtmosphereSystem {
  readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial | null;
  private readonly mesh: THREE.InstancedMesh | null;
  private readonly smokeMaterial: THREE.ShaderMaterial | null;
  private readonly smokeMesh: THREE.InstancedMesh | null;
  private readonly dustMaterial: THREE.ShaderMaterial | null;
  private readonly dustPoints: THREE.Points | null;
  private submissions = 0;
  private submissionFrame = -1;
  private time = 0;
  private readonly bypass: string | null;

  constructor(scene: THREE.Scene, profile: RenderProfile, rendererLabel: string, query: string | null) {
    this.root.name = 'pass30-subtle-ground-mist';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.bypass = atmosphereBypassReason(profile, rendererLabel, query);
    if (this.bypass) {
      this.material = null;
      this.mesh = null;
      this.smokeMaterial = null;
      this.smokeMesh = null;
      this.dustMaterial = null;
      this.dustPoints = null;
      scene.add(this.root);
      return;
    }
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    geometry.setAttribute('mistPhase', new THREE.InstancedBufferAttribute(new Float32Array(MIST_LAYOUT.map((_, index) => index * 1.731)), 1));
    this.material = new THREE.ShaderMaterial({
      name: 'pass30-ground-mist-linear-hdr',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uShadowColor: { value: new THREE.Color(0x725f87) },
          uLightColor: { value: new THREE.Color(0xe9a57b) },
          uOpacity: { value: profile === 'blender' ? 0.16 : 0.085 },
        },
      ]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        attribute float mistPhase;
        uniform float uTime;
        varying vec2 vMistUv;
        varying float vMistPulse;
        void main() {
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          worldPosition.x += sin(uTime * 0.09 + mistPhase) * 0.9;
          worldPosition.z += cos(uTime * 0.065 + mistPhase * 1.37) * 0.55;
          vMistUv = uv;
          vMistPulse = 0.78 + sin(uTime * 0.13 + mistPhase) * 0.16;
          vec4 mvPosition = viewMatrix * worldPosition;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uShadowColor;
        uniform vec3 uLightColor;
        uniform float uOpacity;
        varying vec2 vMistUv;
        varying float vMistPulse;
        void main() {
          vec2 centred = (vMistUv - 0.5) * vec2(1.0, 1.8);
          float feather = 1.0 - smoothstep(0.12, 0.52, length(centred));
          float layered = 0.72 + 0.28 * sin(vMistUv.x * 18.0 + vMistUv.y * 9.0);
          vec3 color = mix(uShadowColor, uLightColor, smoothstep(0.28, 0.82, vMistUv.x));
          gl_FragColor = vec4(color, feather * layered * vMistPulse * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    const mesh = new THREE.InstancedMesh(geometry, this.material, MIST_LAYOUT.length);
    mesh.name = 'pass30-mist-cards';
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -1;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3();
    for (let index = 0; index < MIST_LAYOUT.length; index += 1) {
      const [x, z, width, depth] = MIST_LAYOUT[index];
      position.set(x, 0.16 + (index % 3) * 0.025, z);
      scale.set(width, depth, 1);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.onBeforeRender = (renderer) => {
      const frame = renderer.info.render.frame;
      if (frame !== this.submissionFrame) {
        this.submissionFrame = frame;
        this.submissions = 0;
      }
      this.submissions += 1;
    };
    this.mesh = mesh;
    this.root.add(mesh);

    const smokeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    smokeGeometry.setAttribute('smokePhase', new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_LAYOUT.map((entry) => entry[4])), 1));
    this.smokeMaterial = new THREE.ShaderMaterial({
      name: 'pass31-subtle-smoke-haze-linear-hdr',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uSmokeColor: { value: new THREE.Color(0x84909a) },
          uWarmEdge: { value: new THREE.Color(0xc3a58d) },
          uOpacity: { value: profile === 'blender' ? 0.082 : 0.05 },
        },
      ]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        attribute float smokePhase;
        uniform float uTime;
        varying vec2 vSmokeUv;
        varying float vSmokePulse;
        void main() {
          vec4 centreWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          centreWorld.x += sin(uTime * 0.12 + smokePhase) * 0.32;
          centreWorld.z += cos(uTime * 0.09 + smokePhase * 1.7) * 0.2;
          vec4 mvPosition = viewMatrix * centreWorld;
          float width = length(vec3(instanceMatrix[0]));
          float height = length(vec3(instanceMatrix[1]));
          mvPosition.xy += position.xy * vec2(width, height);
          vSmokeUv = uv;
          vSmokePulse = 0.82 + sin(uTime * 0.17 + smokePhase) * 0.12;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uSmokeColor;
        uniform vec3 uWarmEdge;
        uniform float uOpacity;
        uniform float uTime;
        varying vec2 vSmokeUv;
        varying float vSmokePulse;
        void main() {
          vec2 centred = (vSmokeUv - 0.5) * vec2(1.4, 1.0);
          float feather = 1.0 - smoothstep(0.18, 0.54, length(centred));
          float curl = 0.66 + 0.22 * sin(vSmokeUv.y * 15.0 + vSmokeUv.x * 9.0 + uTime * 0.11)
            + 0.12 * sin(vSmokeUv.y * 31.0 - vSmokeUv.x * 17.0 - uTime * 0.08);
          float rise = smoothstep(0.02, 0.22, vSmokeUv.y) * (1.0 - smoothstep(0.72, 1.0, vSmokeUv.y));
          vec3 color = mix(uSmokeColor, uWarmEdge, smoothstep(0.58, 0.92, vSmokeUv.y));
          gl_FragColor = vec4(color, feather * rise * max(0.22, curl) * vSmokePulse * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    const smokeMesh = new THREE.InstancedMesh(smokeGeometry, this.smokeMaterial, SMOKE_LAYOUT.length);
    smokeMesh.name = 'pass31-subtle-smoke-cards';
    smokeMesh.castShadow = false;
    smokeMesh.receiveShadow = false;
    smokeMesh.renderOrder = -1;
    smokeMesh.userData.presentationOnly = true;
    smokeMesh.userData.blocksShots = false;
    for (let index = 0; index < SMOKE_LAYOUT.length; index += 1) {
      const [x, z, width, height] = SMOKE_LAYOUT[index];
      matrix.compose(new THREE.Vector3(x, height / 2 + 0.15, z), new THREE.Quaternion(), new THREE.Vector3(width, height, 1));
      smokeMesh.setMatrixAt(index, matrix);
    }
    smokeMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    smokeMesh.instanceMatrix.needsUpdate = true;
    smokeMesh.computeBoundingSphere();
    smokeMesh.onBeforeRender = mesh.onBeforeRender;
    this.smokeMesh = smokeMesh;
    this.root.add(smokeMesh);

    const dustCount = profile === 'blender' ? 96 : 64;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustPhases = new Float32Array(dustCount);
    for (let index = 0; index < dustCount; index += 1) {
      // Low-discrepancy deterministic distribution: dust reads as air volume,
      // not large authored objects suspended in the sky.
      const u = ((index * 37) % dustCount) / dustCount;
      const v = ((index * 61) % dustCount) / dustCount;
      dustPositions[index * 3] = -37 + u * 74;
      dustPositions[index * 3 + 1] = 0.35 + ((index * 19) % 43) / 43 * 2.25;
      dustPositions[index * 3 + 2] = -39 + v * 78;
      dustPhases[index] = index * 1.61803398875;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('dustPhase', new THREE.BufferAttribute(dustPhases, 1));
    this.dustMaterial = new THREE.ShaderMaterial({
      name: 'pass32-bounded-airborne-dust',
      transparent: true,
      depthWrite: false,
      fog: true,
      toneMapped: true,
      blending: THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xd8bd95) }, uOpacity: { value: 0.22 } },
      ]),
      vertexShader: `
        #include <fog_pars_vertex>
        attribute float dustPhase;
        uniform float uTime;
        varying float vDustFade;
        void main() {
          vec3 drifted = position;
          float gust = 0.65 + 0.35 * sin(uTime * 0.27 + dustPhase * 0.31);
          drifted.x += sin(uTime * 0.42 + dustPhase) * 0.42 * gust;
          drifted.z += cos(uTime * 0.31 + dustPhase * 1.37) * 0.24;
          drifted.y += sin(uTime * 0.18 + dustPhase * 0.71) * 0.14;
          vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(17.0 / max(2.0, -mvPosition.z), 1.2, 3.2);
          vDustFade = 0.68 + 0.32 * sin(dustPhase * 2.1);
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vDustFade;
        void main() {
          vec2 centred = gl_PointCoord - 0.5;
          float feather = 1.0 - smoothstep(0.18, 0.5, length(centred));
          gl_FragColor = vec4(uColor, feather * vDustFade * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.dustPoints = new THREE.Points(dustGeometry, this.dustMaterial);
    this.dustPoints.name = 'pass32-subtle-airborne-dust';
    this.dustPoints.frustumCulled = true;
    this.dustPoints.renderOrder = -1;
    this.dustPoints.userData.presentationOnly = true;
    this.dustPoints.userData.blocksShots = false;
    this.dustPoints.raycast = () => undefined;
    this.dustPoints.onBeforeRender = mesh.onBeforeRender;
    this.root.add(this.dustPoints);
    scene.add(this.root);
  }

  update(timeSeconds: number): void {
    this.submissions = 0;
    if (!this.material) return;
    this.time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    this.material.uniforms.uTime.value = this.time;
    if (this.smokeMaterial) this.smokeMaterial.uniforms.uTime.value = this.time;
    if (this.dustMaterial) this.dustMaterial.uniforms.uTime.value = this.time;
  }

  handleContextRestored(): void {
    if (this.material) this.material.needsUpdate = true;
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMaterial) this.smokeMaterial.needsUpdate = true;
    if (this.smokeMesh) this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.dustMaterial) this.dustMaterial.needsUpdate = true;
    if (this.dustPoints) this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  telemetry(): AtmosphereTelemetry {
    return {
      pass: 30,
      enabled: this.material !== null,
      bypassReason: this.bypass,
      mistCards: this.mesh?.count ?? 0,
      smokeCards: this.smokeMesh?.count ?? 0,
      dustMotes: this.dustPoints?.geometry.attributes.position.count ?? 0,
      triangles: ((this.mesh?.count ?? 0) + (this.smokeMesh?.count ?? 0)) * 2,
      submissions: this.submissions,
      textureSamples: 0,
      volumetricRayMarching: false,
      perFrameAllocations: 0,
      time: this.time,
    };
  }
}
