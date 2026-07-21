import * as THREE from 'three';
import type { ArenaId } from './map-selection';
import type { ArenaLightingProfile } from './blender-lighting';
import type { RenderProfile } from './render-profile';

/**
 * Apply the same Quality Graphics rules Atomic Acres enjoys, tuned for an
 * industrial yard: richer metal read, local work lights, and a dustier fog
 * palette — only when Quality Graphics is active on Rustworks.
 */

export type RustworksQualityTelemetry = Readonly<{
  lights: number;
  enhancedMaterials: number;
  profile: RenderProfile;
  active: boolean;
}>;

const qualityState: { lightsRoot: THREE.Group | null; enhanced: number } = {
  lightsRoot: null,
  enhanced: 0,
};

export function rustworksLightingTint(
  base: ArenaLightingProfile,
  profile: RenderProfile,
  arenaId: ArenaId,
): ArenaLightingProfile {
  if (arenaId !== 'rustworks-1v1') return base;
  const quality = profile === 'blender';
  return {
    ...base,
    // Dustier industrial haze; keep sun strength so metal reads.
    fogColor: quality ? 0xa89890 : 0xb0a59a,
    skyTop: quality ? 0x3f3a4d : base.skyTop,
    skyHorizon: quality ? 0xc48a72 : base.skyHorizon,
    skyBottom: quality ? 0xe39a58 : base.skyBottom,
    hemisphereSky: quality ? 0xc2b4b8 : base.hemisphereSky,
    hemisphereGround: quality ? 0x8f7f6a : base.hemisphereGround,
    ambientColor: quality ? 0xd8d2c8 : base.ambientColor,
    sunColor: quality ? 0xffc48a : base.sunColor,
    fillColor: quality ? 0xb8c4d8 : base.fillColor,
    fillIntensity: quality ? Math.max(base.fillIntensity, 0.82) : base.fillIntensity,
    sunIntensity: quality ? Math.max(base.sunIntensity, 2.85) : base.sunIntensity,
    hemisphereIntensity: quality ? Math.max(base.hemisphereIntensity, 1.95) : base.hemisphereIntensity,
    ambientIntensity: quality ? Math.max(base.ambientIntensity, 0.88) : base.ambientIntensity,
    godRayStrength: quality ? Math.max(base.godRayStrength, 0.14) : base.godRayStrength,
    godRayLobes: quality ? Math.max(base.godRayLobes, 4) : base.godRayLobes,
  };
}

function isMetalName(name: string): boolean {
  return /steel|rust|grate|tower|pipe|crane|tank|rail|ladder|brace|manifold|crown|hook|stringer|cable|spool|post|sheeting|barrier|pallet|deck|ramp|landing|access|leg|saddle|beam|riser|sign|awning/i.test(name);
}

function isHazardName(name: string): boolean {
  return /hazard|chevron|marking|sign|rail|rung|awning|hook/i.test(name);
}

/** Boost MeshStandard materials on Quality Graphics only (leave Performance batches alone). */
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
        clone.metalness = Math.min(1, Math.max(clone.metalness, 0.62) + 0.12);
        clone.roughness = Math.min(0.72, Math.max(0.22, clone.roughness * 0.82));
        clone.envMapIntensity = Math.max(clone.envMapIntensity || 1, 1.15);
      } else {
        clone.roughness = Math.min(0.96, Math.max(0.35, clone.roughness));
        clone.envMapIntensity = Math.max(clone.envMapIntensity || 1, 0.85);
      }
      if (isHazardName(name)) {
        clone.emissive = new THREE.Color(0x4a2a08);
        clone.emissiveIntensity = Math.max(clone.emissiveIntensity, 0.18);
      }
      clone.needsUpdate = true;
      touched = true;
      count += 1;
      return clone;
    });
    if (touched) {
      node.material = Array.isArray(node.material) ? next : next[0];
      node.userData.rustworksQualityEnhanced = true;
      // Quality surfaces cast/receive shadows like Atomic's Blender arena meshes.
      if (!node.userData.presentationOnly || node.userData.rustworksDetail !== 'quality') {
        node.castShadow = true;
        node.receiveShadow = true;
      } else {
        node.castShadow = true;
        node.receiveShadow = true;
      }
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
  // Local accent lights mirror Atomic street/route lights: no extra shadow casters.
  const fixtures: Array<{ position: [number, number, number]; color: number; intensity: number; distance: number }> = [
    { position: [0, 13.2, 0], color: 0xffc27a, intensity: 3.8, distance: 32 },
    { position: [-4.2, 8.6, -4.2], color: 0xffb35c, intensity: 2.4, distance: 18 },
    { position: [4.2, 8.6, 4.2], color: 0xffb35c, intensity: 2.4, distance: 18 },
    { position: [shipLightX(), 7.4, 5.6], color: 0xd7e6ff, intensity: 1.9, distance: 16 },
    { position: [0, 4.8, -7.8], color: 0xff9a4a, intensity: 2.0, distance: 16 },
    { position: [-18, 3.6, 12], color: 0xffc27a, intensity: 1.7, distance: 14 },
    { position: [18, 3.6, -12], color: 0xffc27a, intensity: 1.7, distance: 14 },
    { position: [0, 3.0, 24], color: 0xc9d6e8, intensity: 1.4, distance: 16 },
    { position: [-22, 8.8, -22], color: 0xffd0a0, intensity: 2.2, distance: 20 },
    { position: [22, 8.8, 22], color: 0xffd0a0, intensity: 2.2, distance: 20 },
    { position: [-22, 8.8, 22], color: 0xffb070, intensity: 1.8, distance: 18 },
    { position: [22, 8.8, -22], color: 0xffb070, intensity: 1.8, distance: 18 },
    { position: [0, 9.0, -28], color: 0xe8f0ff, intensity: 1.6, distance: 18 },
    { position: [0, 9.0, 28], color: 0xe8f0ff, intensity: 1.6, distance: 18 },
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const light = new THREE.PointLight(fixture.color, fixture.intensity, fixture.distance, 2);
    light.name = `rustworks-work-light-${index}`;
    light.position.set(...fixture.position);
    light.castShadow = false;
    light.userData.presentationOnly = true;
    root.add(light);
    // Small visible bulb so Quality mode has readable industrial cues.
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial({
        color: fixture.color,
        emissive: new THREE.Color(fixture.color),
        emissiveIntensity: 1.4,
        roughness: 0.35,
        metalness: 0.1,
      }),
    );
    bulb.name = `rustworks-work-bulb-${index}`;
    bulb.position.copy(light.position);
    bulb.castShadow = false;
    bulb.receiveShadow = false;
    bulb.userData.presentationOnly = true;
    bulb.userData.blocksShots = false;
    bulb.raycast = () => undefined;
    root.add(bulb);
  }
  root.visible = profile === 'blender';
  parent.add(root);
  qualityState.lightsRoot = root;
  return root;
}

function shipLightX(): number {
  // Matches the ship-ladder +X rim used by the tower builder.
  return 8.5 / 2 - 0.35;
}

export function setRustworksQualityPresentationActive(active: boolean, profile: RenderProfile): void {
  if (!qualityState.lightsRoot) return;
  qualityState.lightsRoot.visible = active && profile === 'blender';
}

export function rustworksQualityTelemetry(profile: RenderProfile, arenaId: ArenaId): RustworksQualityTelemetry {
  const active = arenaId === 'rustworks-1v1' && profile === 'blender' && qualityState.lightsRoot?.visible === true;
  return {
    lights: qualityState.lightsRoot?.children.filter((node) => node instanceof THREE.PointLight).length ?? 0,
    enhancedMaterials: qualityState.enhanced,
    profile,
    active,
  };
}
