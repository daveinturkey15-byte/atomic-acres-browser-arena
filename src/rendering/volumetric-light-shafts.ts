/**
 * Narrow, opening-anchored volumetric light shafts for authored Nuke Town.
 *
 * This is deliberately a presentation-only attachment.  The arena owns the
 * doorway/window dimensions; this module derives a small opening table from
 * those exports and never edits the arena, collision, or projectile graph.
 * The visible slabs are camera-facing additive quads with a height/edge
 * density term.  They are not a raymarch, render pass, sampler, or second
 * post-process stage.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { NUKETOWN2_DOORWAYS, NUKETOWN2_WINDOWS } from '../nuketown2-arena';
import { nuketown2HandedX } from '../nuketown2-layout';

const { clamp, float, length, smoothstep, uniform, uv, vec2, vec3 } = TSL as unknown as Record<string, any>;

export const NUKETOWN2_MAX_VOLUMETRIC_SHAFTS = 6;
export const VOLUMETRIC_SHAFT_DEPTH_M = 4.8;
export const VOLUMETRIC_SHAFT_SUN_GATE = 0.05;

export type VolumetricShaftQuality = 'off' | 'low' | 'high';

export type OpeningAnchor = Readonly<{
  id: string;
  sourceId: string;
  side: 'north' | 'south';
  kind: 'door' | 'window';
  center: readonly [number, number, number];
  normal: readonly [number, number, number];
  width: number;
  floorY: number;
  headY: number;
}>;

const SHAFT_SOURCE_DOORS = ['house front door', 'garage vehicle door'] as const;
const SHAFT_SOURCE_WINDOWS = ['ground front west'] as const;

function makeAnchor(input: {
  sourceId: string;
  side: 'north' | 'south';
  kind: 'door' | 'window';
  authoredX: number;
  authoredZ: number;
  authoredNormalX: number;
  authoredNormalZ: number;
  width: number;
  floorY: number;
  headY: number;
}): OpeningAnchor {
  const handedX = nuketown2HandedX(input.authoredX);
  const handedNormalX = nuketown2HandedX(input.authoredNormalX);
  const south = input.side === 'south';
  const x = south ? -handedX : handedX;
  const z = south ? -input.authoredZ : input.authoredZ;
  const normalX = south ? -handedNormalX : handedNormalX;
  const normalZ = south ? -input.authoredNormalZ : input.authoredNormalZ;
  return Object.freeze({
    id: `${input.side}-${input.sourceId}`,
    sourceId: input.sourceId,
    side: input.side,
    kind: input.kind,
    center: Object.freeze([x, (input.floorY + input.headY) / 2, z] as const),
    normal: Object.freeze([normalX, 0, normalZ] as const),
    width: input.width,
    floorY: input.floorY,
    headY: input.headY,
  });
}

/**
 * Derive six bounded presentation anchors from the existing authored frames.
 * The north/south pair is the same x-handed, 180-degree pair used by the
 * arena builder, so this table cannot drift by inventing a second layout.
 */
export function buildNuketown2OpeningAnchors(): readonly OpeningAnchor[] {
  const anchors: OpeningAnchor[] = [];
  for (const side of ['north', 'south'] as const) {
    for (const sourceId of SHAFT_SOURCE_DOORS) {
      const door = NUKETOWN2_DOORWAYS.find((entry) => entry.id === sourceId);
      if (!door || door.span !== 'x') throw new Error(`Missing x-span doorway anchor: ${sourceId}`);
      anchors.push(makeAnchor({
        sourceId,
        side,
        kind: 'door',
        authoredX: door.centre,
        authoredZ: door.at,
        authoredNormalX: 0,
        authoredNormalZ: sourceId === 'house front door' || sourceId === 'garage vehicle door' ? 1 : -1,
        width: door.width,
        floorY: door.floorY,
        headY: door.headY,
      }));
    }
    for (const sourceId of SHAFT_SOURCE_WINDOWS) {
      const window = NUKETOWN2_WINDOWS.find((entry) => entry.id === sourceId);
      if (!window || window.face !== 'front') throw new Error(`Missing front window anchor: ${sourceId}`);
      anchors.push(makeAnchor({
        sourceId,
        side,
        kind: 'window',
        authoredX: (window.x0 + window.x1) / 2,
        authoredZ: window.wallZ,
        authoredNormalX: 0,
        authoredNormalZ: 1,
        width: window.x1 - window.x0,
        floorY: window.sillTop,
        headY: window.headY,
      }));
    }
  }
  return Object.freeze(anchors);
}

export const NUKETOWN2_OPENING_ANCHORS = buildNuketown2OpeningAnchors();

/** Dot product against a possibly non-normalised sun vector without a frame allocation. */
export function openingSunFacingDot(anchor: OpeningAnchor, sunDirection: THREE.Vector3): number {
  const sunLength = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z);
  if (sunLength <= Number.EPSILON) return 0;
  return (
    anchor.normal[0] * sunDirection.x
    + anchor.normal[1] * sunDirection.y
    + anchor.normal[2] * sunDirection.z
  ) / sunLength;
}

/** Physical phase gate used by the cheap presentation graph: back-facing light contributes nothing. */
export function volumetricShaftSunPhase(viewSunDot: number): number {
  return Math.pow(Math.max(viewSunDot, 0), 2);
}

export function selectSunlitOpeningAnchors(
  anchors: readonly OpeningAnchor[],
  quality: VolumetricShaftQuality,
  sunDirection: THREE.Vector3,
): readonly OpeningAnchor[] {
  const limit = quality === 'off' ? 0 : quality === 'low' ? 3 : NUKETOWN2_MAX_VOLUMETRIC_SHAFTS;
  const selected: OpeningAnchor[] = [];
  for (const anchor of anchors) {
    if (selected.length >= limit) break;
    if (openingSunFacingDot(anchor, sunDirection) > VOLUMETRIC_SHAFT_SUN_GATE) selected.push(anchor);
  }
  return Object.freeze(selected);
}

type ShaftMaterialUserData = {
  sunPhase: { value: number };
};

/** One sampler-free TSL graph shared by every shaft quad. */
export function createVolumetricShaftMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = 'nuketown2-volumetric-opening-shafts';
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = true;

  const tint = new THREE.Color(0xffdca8).convertSRGBToLinear();
  const centred = uv().sub(vec2(float(0.5), float(0.5))).mul(float(2));
  const edgeFade = clamp(float(1).sub(length(centred)), float(0), float(1));
  const heightFade = float(1).sub(smoothstep(float(0.04), float(0.98), uv().y));
  const sunPhase = uniform(1);
  const opacity = edgeFade.mul(heightFade).mul(float(0.22)).mul(sunPhase);
  material.colorNode = vec3(float(tint.r), float(tint.g), float(tint.b));
  material.opacityNode = opacity;
  material.userData = { sunPhase } as ShaftMaterialUserData;
  return material;
}

/**
 * Reusable presentation system. The caller owns attachment to the active
 * WebGPU scene; construction is cheap and update has no per-frame allocation.
 */
export class VolumetricShaftSystem {
  readonly group: THREE.Group;
  readonly anchors: readonly OpeningAnchor[];
  readonly material: MeshBasicNodeMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly meshes: THREE.Mesh[];
  private readonly viewDirection = new THREE.Vector3();
  private quality: VolumetricShaftQuality;

  constructor(options: {
    anchors?: readonly OpeningAnchor[];
    quality?: VolumetricShaftQuality;
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'nuketown2-volumetric-opening-shafts';
    this.anchors = options.anchors ?? NUKETOWN2_OPENING_ANCHORS;
    this.quality = options.quality ?? 'high';
    this.material = createVolumetricShaftMaterial();
    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 2);
    this.meshes = [];
    for (let i = 0; i < Math.min(this.anchors.length, NUKETOWN2_MAX_VOLUMETRIC_SHAFTS); i += 1) {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.name = `volumetric-shaft-${this.anchors[i].id}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      mesh.visible = false;
      mesh.userData.presentationOnly = true;
      mesh.userData.blocksShots = false;
      mesh.userData.sourceOpening = this.anchors[i].sourceId;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  setQuality(quality: VolumetricShaftQuality): void {
    this.quality = quality;
    if (quality === 'off') {
      for (const mesh of this.meshes) mesh.visible = false;
    }
  }

  update(camera: THREE.Camera, sunDirection: THREE.Vector3): void {
    const userData = this.material.userData as ShaftMaterialUserData;
    camera.getWorldDirection(this.viewDirection);
    const sunLength = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z);
    const viewSunDot = sunLength <= Number.EPSILON
      ? 0
      : this.viewDirection.dot(sunDirection) / sunLength;
    userData.sunPhase.value = volumetricShaftSunPhase(viewSunDot);

    const limit = this.quality === 'off' ? 0 : this.quality === 'low' ? 3 : NUKETOWN2_MAX_VOLUMETRIC_SHAFTS;
    for (let i = 0; i < this.meshes.length; i += 1) {
      const mesh = this.meshes[i];
      const anchor = this.anchors[i];
      const active = i < limit && openingSunFacingDot(anchor, sunDirection) > VOLUMETRIC_SHAFT_SUN_GATE;
      mesh.visible = active;
      if (!active) continue;
      mesh.position.set(
        anchor.center[0] + anchor.normal[0] * VOLUMETRIC_SHAFT_DEPTH_M * 0.5,
        anchor.center[1],
        anchor.center[2] + anchor.normal[2] * VOLUMETRIC_SHAFT_DEPTH_M * 0.5,
      );
      mesh.scale.set(anchor.width, Math.max(anchor.headY - anchor.floorY, 1), 1);
      mesh.quaternion.copy(camera.quaternion);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
