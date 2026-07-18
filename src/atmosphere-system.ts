import * as THREE from 'three';
import { isSoftwareWebGLRenderer } from './atomic-signal';
import type { RenderProfile } from './render-profile';

export type AtmosphereTelemetry = Readonly<{
  pass: 30;
  enabled: boolean;
  bypassReason: string | null;
  mistCards: number;
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
  if (profile === 'performance' && query !== 'on') return 'performance-budget';
  if (isSoftwareWebGLRenderer(rendererLabel) && query !== 'on') return 'software-renderer';
  return null;
}

const MIST_LAYOUT: readonly (readonly [number, number, number, number])[] = [
  [-27, -18, 17, 5.2], [-25, 13, 14, 4.4], [-17, 29, 12, 4.2],
  [27, -23, 15, 4.8], [25, 15, 13, 4.3], [17, -32, 11, 3.8],
  [-8, -35, 13, 3.5], [8, 35, 13, 3.5], [-18, 0, 10, 3.2], [18, 0, 10, 3.2],
] as const;

export class AtmosphereSystem {
  readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial | null;
  private readonly mesh: THREE.InstancedMesh | null;
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
          uOpacity: { value: profile === 'blender' ? 0.105 : 0.065 },
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
    scene.add(this.root);
  }

  update(timeSeconds: number): void {
    this.submissions = 0;
    if (!this.material) return;
    this.time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    this.material.uniforms.uTime.value = this.time;
  }

  handleContextRestored(): void {
    if (this.material) this.material.needsUpdate = true;
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
  }

  telemetry(): AtmosphereTelemetry {
    return {
      pass: 30,
      enabled: this.material !== null,
      bypassReason: this.bypass,
      mistCards: this.mesh?.count ?? 0,
      triangles: (this.mesh?.count ?? 0) * 2,
      submissions: this.submissions,
      textureSamples: 0,
      volumetricRayMarching: false,
      perFrameAllocations: 0,
      time: this.time,
    };
  }
}
