export type TslMigrationStatus = 'legacy-isolated' | 'tsl-authored' | 'verified';

export type TslMigrationEntry = Readonly<{
  id: string;
  owner: string;
  legacyMaterial: 'ShaderMaterial' | 'RawShaderMaterial' | 'none';
  replacementPipelineId: string;
  status: TslMigrationStatus;
  verification: string;
  descriptor: TslPipelineDescriptor;
}>;

export type TslPipelineDescriptor = Readonly<{
  schemaVersion: 1;
  sourceKind: 'three-r185-tsl-node-graph';
  stages: readonly string[];
  invariants: readonly string[];
}>;

function descriptor(stages: readonly string[], invariants: readonly string[]): TslPipelineDescriptor {
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'three-r185-tsl-node-graph',
    stages: Object.freeze([...stages]),
    invariants: Object.freeze([...invariants]),
  });
}

/**
 * This is the executable cutover ledger. WebGPU must not be advertised as the
 * game renderer until every legacy GLSL owner has a verified TSL replacement.
 */
export const TSL_MIGRATION_INVENTORY: readonly TslMigrationEntry[] = Object.freeze([
  Object.freeze({
    id: 'procedural-atmosphere-sky',
    owner: 'src/legacy-main.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.sky-atmosphere.tsl.v1',
    status: 'verified',
    verification: 'deterministic sky cameras across all arena lighting profiles',
    descriptor: descriptor(
      ['SkyMesh NodeMaterial vertexNode', 'SkyMesh NodeMaterial colorNode'],
      ['BackSide sky volume', 'depth write disabled', 'deterministic review time'],
    ),
  }),
  Object.freeze({
    id: 'atomic-signal-hdr',
    owner: 'src/atomic-signal.ts',
    legacyMaterial: 'RawShaderMaterial',
    replacementPipelineId: 'pass64.hdr-grade-grain.tsl.v1',
    status: 'verified',
    verification: 'principal HDR MSAA, depth-aware bloom occlusion, grade and dither parity',
    descriptor: descriptor(
      ['RenderPipeline scene pass', 'linear contrast and saturation grade', 'ordered deterministic dither', 'ACES output transform'],
      ['single controlled HDR owner', 'depth-discontinuity bloom guard', 'sRGB canvas output'],
    ),
  }),
  Object.freeze({
    id: 'atmosphere-mist',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-mist.tsl.v1',
    status: 'verified',
    verification: 'fixed-time depth and alpha parity cameras',
    descriptor: descriptor(
      ['MeshBasicNodeMaterial colorNode', 'world-space mist density opacityNode'],
      ['transparent', 'depth write disabled', 'bounded arena volume'],
    ),
  }),
  Object.freeze({
    id: 'atmosphere-smoke',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-smoke.tsl.v1',
    status: 'verified',
    verification: 'fixed-seed smoke density and overdraw budget',
    descriptor: descriptor(
      ['SpriteNodeMaterial colorNode', 'radial-feather smoke opacityNode'],
      ['fixed authored emitters', 'camera-facing cards', 'depth write disabled', 'bounded opacity'],
    ),
  }),
  Object.freeze({
    id: 'atmosphere-dust',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-dust.tsl.v1',
    status: 'verified',
    verification: 'fixed-seed dust density and overdraw budget',
    descriptor: descriptor(
      ['PointsNodeMaterial colorNode', 'time-varying dust opacityNode'],
      ['fixed-seed positions', 'bounded point count', 'depth write disabled'],
    ),
  }),
  Object.freeze({
    id: 'procedural-grass',
    owner: 'src/grass-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.grass.tsl.v1',
    status: 'verified',
    verification: 'placement identity, wind envelope and frame budget',
    descriptor: descriptor(
      ['MeshStandardNodeMaterial positionNode', 'MeshStandardNodeMaterial colorNode'],
      ['fixed-seed placement', 'bounded wind displacement', 'presentation-only instances'],
    ),
  }),
  Object.freeze({
    id: 'perimeter-water',
    owner: 'src/water-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.water.tsl.v1',
    status: 'verified',
    verification: 'island mask, wave bounds and reflection budget',
    descriptor: descriptor(
      ['MeshStandardNodeMaterial positionNode', 'view-independent water colorNode'],
      ['bounded wave displacement', 'presentation-only perimeter plane', 'no recursive reflection pass'],
    ),
  }),
  Object.freeze({
    // HF-479 technique #4. New authoring, not a migration: no legacy GLSL
    // owner exists, so `legacyMaterial` is 'none'. It still belongs in this
    // ledger because the traversal gate derives the compiled set from here —
    // a pipeline outside this list is invisible to the cold-session precompile
    // reach the brief requires.
    id: 'ground-projected-environment',
    owner: 'src/rendering/ground-projected-env.ts',
    legacyMaterial: 'none',
    replacementPipelineId: 'pass64.ground-projected-env.tsl.v1',
    status: 'verified',
    verification: 'projection node math, uniform-only arena data, horizon review cameras',
    descriptor: descriptor(
      ['MeshBasicNodeMaterial colorNode', 'ground-plane projection of the admitted equirect sky'],
      ['BackSide sphere inside the far plane', 'depth write disabled', 'per-arena uniforms, settings off switch'],
    ),
  }),
]);

export function pendingTslMigrationIds(
  inventory: readonly TslMigrationEntry[] = TSL_MIGRATION_INVENTORY,
): string[] {
  return inventory.filter((entry) => entry.status !== 'verified').map((entry) => entry.id);
}

export function assertTslCutoverReady(
  inventory: readonly TslMigrationEntry[] = TSL_MIGRATION_INVENTORY,
): void {
  const pending = pendingTslMigrationIds(inventory);
  if (pending.length > 0) {
    throw new Error(`WebGPU cutover is blocked by unverified TSL pipelines: ${pending.join(', ')}`);
  }
}

export function assertTslReviewAuthored(
  inventory: readonly TslMigrationEntry[] = TSL_MIGRATION_INVENTORY,
): void {
  const missing = inventory.filter((entry) => entry.status === 'legacy-isolated').map((entry) => entry.id);
  if (missing.length > 0) {
    throw new Error(`WebGPU TSL review is blocked by unauthored pipelines: ${missing.join(', ')}`);
  }
}

export function canonicalTslDescriptor(entry: TslMigrationEntry): string {
  return JSON.stringify({
    id: entry.id,
    replacementPipelineId: entry.replacementPipelineId,
    schemaVersion: entry.descriptor.schemaVersion,
    sourceKind: entry.descriptor.sourceKind,
    stages: entry.descriptor.stages,
    invariants: entry.descriptor.invariants,
  });
}

export async function tslDescriptorSha256(entry: TslMigrationEntry): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalTslDescriptor(entry));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
