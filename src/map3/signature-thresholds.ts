/**
 * map3/signature-thresholds.ts — M3.SIGNATURE.3a: arrival moments.
 *
 * Corridor transitions are currently just a walk. A threshold is the cheapest
 * memorable thing that fixes that: two pylons and a blown lintel framing the
 * mouth (the silhouette), an additive halo + floor pool in the same tint (the
 * shaft you step into). One formal language at every mouth so the map reads
 * as one place; the TINT varies per corridor so each arrival reads different.
 *
 * Technique notes (skills cited in REPORT.md):
 * - threejs-webgpu-interior-lighting-look §3: the lintel is a flat emissive
 *   bar driven ABOVE the bloom threshold (drive 2.5, the headlightMat
 *   precedent in corridors.ts); the halo is post bloom, not geometry. The
 *   skill's fence holds: the threshold is never touched, the emissive is.
 * - webgpu-tsl-arena-forging §7: NodeMaterials + TSL expressions only. No
 *   ShaderMaterial, no onBeforeCompile, no samplers, nothing imported.
 * - photoreal-procedural-scene-forge §6: presentation only. The pylons stand
 *   outside the walk line and above head height at the lintel; no solid, no
 *   collider, no shot surface is derived from them.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  clamp, float, smoothstep, uv, vec2,
} = TSL as unknown as Record<string, any>;
import { rgb } from './foliage-material';
import { mergeGeometries } from './leaf-geometry';

/** Half-width of the framed walk. One value everywhere: shared language. */
export const THRESHOLD_HALF = 2.6;
/** Lintel height: well above the 1.7 m nailed eye (main.ts), below feels low. */
const LINTEL_Y = 4.4;
/** Pylon cross-section. Outside the walk line, inside the mouth. */
const PYLON_W = 0.55;

/** Arrival tints. Warm for the shaft hall, pale gold for the overlook, cool for water. */
export const THRESHOLD_WARM = 0xffc873;
export const THRESHOLD_GOLD = 0xffe6b0;
export const THRESHOLD_COOL = 0x9fd4ff;

export interface SignatureThreshold {
  group: THREE.Group;
  dispose(): void;
}

/**
 * Build one threshold in corridor-local coords: mouth at z = 0, walk toward
 * -z. Main adds the group to the corridor's own group so it inherits the
 * spoke pivot with no extra maths.
 */
export function createSignatureThreshold(tint: THREE.ColorRepresentation): SignatureThreshold {
  const group = new THREE.Group();
  group.name = 'map3-signature-threshold';
  const disposables: Array<{ dispose(): void }> = [];

  // --- 1. the frame: two pylons, one merged mesh -----------------------
  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.85;
  stoneMat.colorNode = rgb(0x8a8272);
  disposables.push(stoneMat);

  const pylonGeoL = new THREE.BoxGeometry(PYLON_W, LINTEL_Y, PYLON_W);
  pylonGeoL.translate(-THRESHOLD_HALF - 0.3, LINTEL_Y / 2, -1.5);
  const pylonGeoR = new THREE.BoxGeometry(PYLON_W, LINTEL_Y, PYLON_W);
  pylonGeoR.translate(THRESHOLD_HALF + 0.3, LINTEL_Y / 2, -1.5);
  const pylons = new THREE.Mesh(mergeGeometries([pylonGeoL, pylonGeoR]), stoneMat);
  pylonGeoL.dispose();
  pylonGeoR.dispose();
  pylons.name = 'map3-signature-threshold-pylons';
  pylons.castShadow = true;
  pylons.receiveShadow = true;
  group.add(pylons);
  disposables.push(pylons.geometry);

  // --- 2. the lintel: a flat bar BLOWN above the bloom threshold ---------
  // The halo is the post chain's bloom, not geometry (skill §3).
  const lintelMat = new MeshBasicNodeMaterial();
  lintelMat.colorNode = rgb(tint, 2.5);
  lintelMat.fog = false;
  disposables.push(lintelMat);

  const lintelGeo = new THREE.BoxGeometry((THRESHOLD_HALF + 0.3) * 2 + PYLON_W, 0.35, 0.6);
  const lintel = new THREE.Mesh(lintelGeo, lintelMat);
  lintel.position.set(0, LINTEL_Y + 0.17, -1.5);
  lintel.name = 'map3-signature-threshold-lintel';
  group.add(lintel);
  disposables.push(lintelGeo);

  // --- 3. halo + floor pool: one merged additive mesh --------------------
  // Vertical card facing the hub (+z) so the arrival reads from the centre;
  // floor quad so there is a shaft to step into. Radial TSL falloff, no texture.
  const glowMat = new MeshBasicNodeMaterial();
  glowMat.transparent = true;
  glowMat.depthWrite = false;
  glowMat.blending = THREE.AdditiveBlending;
  glowMat.side = THREE.DoubleSide;
  glowMat.fog = false;
  {
    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const fall = float(1.0).sub(smoothstep(float(0.15), float(1.0), d));
    glowMat.colorNode = rgb(tint, 1.0);
    glowMat.opacityNode = clamp(fall.mul(0.55), float(0), float(1));
  }
  disposables.push(glowMat);

  const haloGeo = new THREE.PlaneGeometry((THRESHOLD_HALF + 0.3) * 2.4, 2.8);
  haloGeo.translate(0, 3.4, -1.2);
  const poolGeo = new THREE.PlaneGeometry((THRESHOLD_HALF + 0.3) * 2.0, 3.4);
  poolGeo.rotateX(-Math.PI / 2);
  poolGeo.translate(0, 0.07, -3.0);
  const glow = new THREE.Mesh(mergeGeometries([haloGeo, poolGeo]), glowMat);
  haloGeo.dispose();
  poolGeo.dispose();
  glow.name = 'map3-signature-threshold-glow';
  glow.renderOrder = 6;
  glow.frustumCulled = false;
  group.add(glow);
  disposables.push(glow.geometry);

  return {
    group,
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
