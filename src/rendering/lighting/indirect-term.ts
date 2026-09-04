/**
 * SH-L2's one ambient choke point for Nuke Town's procedural materials.
 *
 * The material factories intentionally do not hand-build lighting. They all
 * use this constructor, which replaces only the PhysicalLightingModel's
 * indirect-diffuse contribution. Three's direct light set, scene.environment,
 * specular IBL and emissive terms remain the fallback and remain untouched when
 * the volume is absent or disabled.
 *
 * The graph is shared by every factory. Its seven textures and its two control
 * uniforms are allocated once, so a live off switch writes uniforms only and
 * cannot create a new material topology or pipeline family.
 */
import { MeshStandardNodeMaterial, PhysicalLightingModel } from 'three/webgpu';
import type { NodeBuilder } from 'three/webgpu';
import { BRDF_Lambert, diffuseColor, metalness, normalWorld, positionWorld } from 'three/tsl';

import {
  SH_L2_MAXIMUM_STRENGTH,
  type ShL2NodeGraph,
  buildShL2IrradianceNode,
} from './sh-l2-irradiance-node';
import type { ShL2Volume } from './sh-l2-irradiance';

export const NUKETOWN2_SH_L2_DIMENSIONS = Object.freeze([20, 4, 44] as const);
export const NUKETOWN2_SH_L2_STRENGTH = Object.freeze({
  off: 0,
  low: 0.28,
  high: SH_L2_MAXIMUM_STRENGTH,
} as const);

let sharedGraph: ShL2NodeGraph | null = null;

type TslVec3Node = { mul(node: TslVec3Node): TslVec3Node };

/** The single node instance used by all 24 Nuke Town material factories. */
export function sharedNuketown2IndirectTerm(): ShL2NodeGraph {
  if (!sharedGraph) {
    sharedGraph = buildShL2IrradianceNode(
      { worldPosition: positionWorld, worldNormal: normalWorld },
      NUKETOWN2_SH_L2_DIMENSIONS,
      'nuketown2',
    );
  }
  return sharedGraph;
}

/** CPU-side controller used by the live settings and arena transition paths. */
export function configureNuketown2IndirectTerm(input: Readonly<{
  enabled: boolean;
  strength: number;
  volume?: ShL2Volume | null;
}>): void {
  const graph = sharedNuketown2IndirectTerm();
  if (input.volume) graph.setVolume(input.volume);
  graph.setStrength(input.strength);
  graph.setEnabled(input.enabled && Boolean(input.volume));
}

export function setNuketown2IndirectTier(tier: 'off' | 'low' | 'high', hasVolume = false): void {
  const strength = NUKETOWN2_SH_L2_STRENGTH[tier];
  const graph = sharedNuketown2IndirectTerm();
  graph.setStrength(strength);
  graph.setEnabled(tier !== 'off' && hasVolume);
}

/**
 * A small subclass keeps the factory surface identical to Three's standard
 * material while giving the shared graph a real per-material lighting hook.
 */
class Nuketown2IndirectLightingModel extends PhysicalLightingModel {
  override indirectDiffuse(builder: NodeBuilder): void {
    super.indirectDiffuse(builder);
    const shared = sharedNuketown2IndirectTerm();
    // The private `diffuseContribution` PropertyNode is not part of the public
    // TSL export and importing it directly creates a second module instance in
    // Vite. Reconstruct the exact MeshStandard contribution from public TSL
    // nodes instead: MeshStandardNodeMaterial assigns this same expression in
    // setupVariants before the lighting model runs.
    const diffuseContribution = diffuseColor.rgb.mul(metalness.oneMinus());
    const diffuse = (shared.irradiance as unknown as TslVec3Node).mul(
      BRDF_Lambert({ diffuseColor: diffuseContribution }) as unknown as TslVec3Node,
    );
    const context = builder.context as {
      reflectedLight: { indirectDiffuse: { addAssign(node: TslVec3Node): void } };
    };
    context.reflectedLight.indirectDiffuse.addAssign(diffuse);
  }
}

class Nuketown2IndirectNodeMaterial extends MeshStandardNodeMaterial {
  override setupLightingModel(): PhysicalLightingModel {
    return new Nuketown2IndirectLightingModel();
  }
}

export function createNuketown2IndirectMaterial(
  parameters?: ConstructorParameters<typeof MeshStandardNodeMaterial>[0],
): MeshStandardNodeMaterial {
  return new Nuketown2IndirectNodeMaterial(parameters);
}

/** Pure reference for tests and receipts; it mirrors the graph's two uniforms. */
export function evaluateIndirectTerm(
  irradiance: readonly [number, number, number],
  enabled: boolean,
  strength: number,
): readonly [number, number, number] {
  if (!enabled) return [0, 0, 0];
  const gain = Math.min(Math.max(0, strength), SH_L2_MAXIMUM_STRENGTH);
  return [
    Math.min(irradiance[0] * gain, 0.18),
    Math.min(irradiance[1] * gain, 0.18),
    Math.min(irradiance[2] * gain, 0.18),
  ];
}
