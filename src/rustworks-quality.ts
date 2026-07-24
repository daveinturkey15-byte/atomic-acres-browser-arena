import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { ArenaLightingProfile } from './blender-lighting';
import type { RenderProfile } from './render-profile';

/**
 * Night oil-rig presentation for Rustworks: dark sky, moon fill, dense flood
 * lighting so the deck never falls into pure black.
 */

export type RustworksQualityTelemetry = Readonly<{
  lights: number;
  enhancedMaterials: number;
  profile: RenderProfile;
  active: boolean;
  night: boolean;
}>;

const qualityState: {
  lightsRoot: THREE.Group | null;
  starsRoot: THREE.Points | null;
  enhanced: number;
} = {
  lightsRoot: null,
  starsRoot: null,
  enhanced: 0,
};

export function rustworksLightingTint(
  base: ArenaLightingProfile,
  profile: RenderProfile,
  arenaId: ArenaId,
): ArenaLightingProfile {
  if (arenaId === 'gun-range') {
    const quality = profile === 'blender';
    return {
      ...base,
      fogColor: 0x263136,
      skyTop: 0x11191d,
      skyHorizon: 0x263136,
      skyBottom: 0x171f23,
      skySun: 0xd9eff2,
      skyCloud: 0x303b3f,
      skyCloudShadow: 0x11191d,
      skyCloudLight: 0x63767a,
      hemisphereSky: 0xa5c5ca,
      hemisphereGround: 0x342b22,
      ambientColor: 0x9ab1b3,
      sunColor: 0xc8edf0,
      fillColor: 0xffc27c,
      // Local ceiling/practical lights model the room. Global fill stays low
      // so booths, baffles, targets and moving players retain contact shape.
      sunIntensity: quality ? 0.75 : 0.62,
      fillIntensity: quality ? 0.28 : 0.32,
      hemisphereIntensity: quality ? 0.92 : 0.88,
      ambientIntensity: quality ? 0.44 : 0.4,
      exposure: quality ? 1.04 : 1.02,
      godRayStrength: 0,
      godRayLobes: 1,
    };
  }
  if (arenaId === 'skyline-terminal') {
    const quality = profile === 'blender';
    return {
      ...base,
      fogColor: 0xa9b6b8,
      skyTop: 0x46607a,
      skyHorizon: 0xd9ad9a,
      skyBottom: 0xe9d9c8,
      skySun: 0xffe2b4,
      skyCloud: 0xd8b9ae,
      skyCloudShadow: 0x39485b,
      skyCloudLight: 0xffd8bd,
      hemisphereSky: 0xd8e7e5,
      hemisphereGround: 0x8b8d80,
      ambientColor: 0xd1dfdc,
      fillColor: 0xffcf9b,
      sunIntensity: quality ? 2.2 : 2.15,
      hemisphereIntensity: quality ? 0.72 : 0.88,
      ambientIntensity: quality ? 0.28 : 0.32,
      fillIntensity: quality ? 0.32 : 0.36,
      exposure: quality ? 1 : 1.02,
      godRayStrength: Math.min(base.godRayStrength, 0.06),
      godRayLobes: Math.min(base.godRayLobes, 3),
    };
  }
  if (arenaId !== 'rustworks-1v1') return base;
  const quality = profile === 'blender';
  // Night industrial pad — cool moon + warm floods; keep ambient high enough for play.
  return {
    ...base,
    fogColor: quality ? 0x0b1220 : 0x101820,
    skyTop: quality ? 0x050814 : 0x0a1018,
    skyHorizon: quality ? 0x1a2740 : 0x1c2838,
    skyBottom: quality ? 0x0e1828 : 0x121c28,
    skySun: quality ? 0xc8d6ff : 0xb0c0e0,
    skyCloud: quality ? 0x1a2438 : 0x222c3c,
    skyCloudShadow: quality ? 0x080c14 : 0x0c1018,
    skyCloudLight: quality ? 0x3a4a68 : 0x2e3a50,
    hemisphereSky: quality ? 0x6a7a9a : 0x5a6a82,
    hemisphereGround: quality ? 0x2a2418 : 0x282418,
    ambientColor: quality ? 0x6a7488 : 0x5c6678,
    sunColor: quality ? 0xd0dcff : 0xc0cce8,
    fillColor: quality ? 0xffb060 : 0xe8a050,
    // Moon and authored floods stay dominant; broad fill no longer turns the
    // complete oil rig into one evenly lit orange surface.
    sunIntensity: quality ? 0.95 : 0.75,
    fillIntensity: quality ? 0.28 : 0.34,
    hemisphereIntensity: quality ? 0.45 : 0.58,
    ambientIntensity: quality ? 0.16 : 0.24,
    exposure: quality ? 1 : 0.98,
    godRayStrength: 0.04,
    godRayLobes: 2,
  };
}

function isMetalName(name: string): boolean {
  return /steel|rust|grate|tower|pipe|crane|tank|rail|ladder|brace|manifold|crown|hook|stringer|cable|spool|post|sheeting|barrier|pallet|deck|ramp|landing|access|leg|saddle|beam|riser|sign|awning|rig|flood/i.test(name);
}

function isHazardName(name: string): boolean {
  return /hazard|chevron|marking|sign|rail|rung|awning|hook|flood/i.test(name);
}

export function enhanceRustworksQualityMaterials(root: THREE.Object3D, profile: RenderProfile): number {
  if (profile !== 'blender') return 0;
  let count = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.staticBatchRendered === true && !String(node.name).startsWith('rustworks-presentation-batch-')) return;
    if (node.userData.rustworksQualityEnhanced) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    let touched = false;
    const next = materials.map((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      const clone = material.clone();
      const name = `${node.name} ${material.name || ''}`;
      if (isMetalName(name)) {
        clone.metalness = Math.min(1, Math.max(clone.metalness, 0.58) + 0.1);
        clone.roughness = Math.min(0.75, Math.max(0.2, clone.roughness * 0.85));
        clone.envMapIntensity = Math.max(clone.envMapIntensity || 1, 0.95);
      } else {
        clone.roughness = Math.min(0.96, Math.max(0.35, clone.roughness));
        clone.envMapIntensity = Math.max(clone.envMapIntensity || 1, 0.7);
      }
      if (isHazardName(name)) {
        clone.emissive = new THREE.Color(0x5a3208);
        clone.emissiveIntensity = Math.max(clone.emissiveIntensity, 0.28);
      }
      clone.needsUpdate = true;
      touched = true;
      count += 1;
      return clone;
    });
    if (touched) {
      node.material = Array.isArray(node.material) ? next : next[0];
      node.userData.rustworksQualityEnhanced = true;
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  qualityState.enhanced = count;
  return count;
}

export function createRustworksQualityLights(parent: THREE.Object3D, profile: RenderProfile): THREE.Group {
  const root = new THREE.Group();
  root.name = 'rustworks-quality-work-lights';
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;

  // Flood grid: warm sodium + cool work LEDs. High intensity / long range so corners stay lit at night.
  const fixtures: Array<{ position: [number, number, number]; color: number; intensity: number; distance: number; warm?: boolean }> = [
    // Tower crown floods
    { position: [0, 14.2, 0], color: 0xffd9a0, intensity: 5.5, distance: 42, warm: true },
    { position: [-3.8, 9.2, -3.8], color: 0xffc27a, intensity: 3.6, distance: 26, warm: true },
    { position: [3.8, 9.2, 3.8], color: 0xffc27a, intensity: 3.6, distance: 26, warm: true },
    { position: [3.9, 9.2, -3.8], color: 0xd7e6ff, intensity: 2.8, distance: 22 },
    { position: [-3.9, 9.2, 3.8], color: 0xd7e6ff, intensity: 2.8, distance: 22 },
    // Deck mid floods
    { position: [0, 6.2, -8.5], color: 0xffb35c, intensity: 3.2, distance: 24, warm: true },
    { position: [0, 6.2, 8.5], color: 0xffb35c, intensity: 3.2, distance: 24, warm: true },
    { position: [-9, 5.4, 0], color: 0xe8f0ff, intensity: 2.6, distance: 22 },
    { position: [9, 5.4, 0], color: 0xe8f0ff, intensity: 2.6, distance: 22 },
    // Yard corner towers
    { position: [-22, 11, -22], color: 0xffd0a0, intensity: 4.2, distance: 36, warm: true },
    { position: [22, 11, 22], color: 0xffd0a0, intensity: 4.2, distance: 36, warm: true },
    { position: [-22, 11, 22], color: 0xffc080, intensity: 3.8, distance: 34, warm: true },
    { position: [22, 11, -22], color: 0xffc080, intensity: 3.8, distance: 34, warm: true },
    // Edge mid-span
    { position: [0, 10, -28], color: 0xc9d6e8, intensity: 3.0, distance: 30 },
    { position: [0, 10, 28], color: 0xc9d6e8, intensity: 3.0, distance: 30 },
    { position: [-26, 10, 0], color: 0xffd4a8, intensity: 3.0, distance: 30, warm: true },
    { position: [26, 10, 0], color: 0xffd4a8, intensity: 3.0, distance: 30, warm: true },
    // Fill under-look / apron
    { position: [-14, 4.2, 14], color: 0xffb070, intensity: 2.2, distance: 20, warm: true },
    { position: [14, 4.2, -14], color: 0xffb070, intensity: 2.2, distance: 20, warm: true },
    { position: [0, 3.5, 0], color: 0xa8b8d0, intensity: 1.8, distance: 18 },
  ];

  for (const [index, fixture] of fixtures.entries()) {
    const light = new THREE.PointLight(fixture.color, fixture.intensity, fixture.distance, 1.7);
    light.name = `rustworks-work-light-${index}`;
    light.position.set(...fixture.position);
    light.castShadow = false;
    light.userData.presentationOnly = true;
    root.add(light);
    // Point lights stay invisible. The old generic housing/bulb geometry was
    // generated at every light origin without a supporting pole or tower mount,
    // producing the random floating cubes and lamps visible above the rig.
  }

  root.visible = profile === 'blender' || profile === 'performance';
  // Performance still gets floods — night needs them.
  if (profile === 'performance') {
    root.traverse((node) => {
      if (node instanceof THREE.PointLight) {
        node.intensity *= 0.85;
        node.distance *= 0.9;
      }
    });
  }
  parent.add(root);
  qualityState.lightsRoot = root;
  return root;
}

/** Build / refresh a starfield sphere (shared for Quality + Performance night). */
export function ensureRustworksStarfield(scene: THREE.Scene, arenaId: ArenaId): THREE.Points | null {
  if (arenaId !== 'rustworks-1v1') {
    if (qualityState.starsRoot) qualityState.starsRoot.visible = false;
    return qualityState.starsRoot;
  }
  if (qualityState.starsRoot) {
    qualityState.starsRoot.visible = true;
    return qualityState.starsRoot;
  }
  const count = 2200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radius = 180;
  for (let i = 0; i < count; i += 1) {
    // Upper hemisphere bias
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v * 0.72); // mostly above horizon
    const r = radius * (0.92 + Math.random() * 0.08);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const warm = Math.random() > 0.85;
    const c = warm ? new THREE.Color(0xffe6c0) : new THREE.Color(0xd8e6ff);
    const b = 0.55 + Math.random() * 0.45;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.55,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'rustworks-starfield';
  stars.frustumCulled = false;
  stars.userData.presentationOnly = true;
  stars.userData.blocksShots = false;
  stars.raycast = () => undefined;
  scene.add(stars);
  qualityState.starsRoot = stars;
  return stars;
}

export function setRustworksQualityPresentationActive(active: boolean, profile: RenderProfile): void {
  if (qualityState.lightsRoot) {
    qualityState.lightsRoot.visible = active && (profile === 'blender' || profile === 'performance');
  }
  if (qualityState.starsRoot) {
    qualityState.starsRoot.visible = active;
  }
}

export function rustworksQualityTelemetry(profile: RenderProfile, arenaId: ArenaId): RustworksQualityTelemetry {
  const active = arenaId === 'rustworks-1v1' && qualityState.lightsRoot?.visible === true;
  return {
    lights: qualityState.lightsRoot?.children.filter((node) => node instanceof THREE.PointLight).length ?? 0,
    enhancedMaterials: qualityState.enhanced,
    profile,
    active,
    night: arenaId === 'rustworks-1v1',
  };
}
