export type TslMigrationStatus = 'legacy-isolated' | 'tsl-authored' | 'verified';

export type TslMigrationEntry = Readonly<{
  id: string;
  owner: string;
  legacyMaterial: 'ShaderMaterial' | 'RawShaderMaterial';
  replacementPipelineId: string;
  status: TslMigrationStatus;
  verification: string;
}>;

/**
 * This is the executable cutover ledger. WebGPU must not be advertised as the
 * game renderer until every legacy GLSL owner has a verified TSL replacement.
 */
export const TSL_MIGRATION_INVENTORY: readonly TslMigrationEntry[] = Object.freeze([
  Object.freeze({
    id: 'procedural-atmosphere-sky',
    owner: 'src/main.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.sky-atmosphere.tsl.v1',
    status: 'legacy-isolated',
    verification: 'deterministic sky cameras across all arena lighting profiles',
  }),
  Object.freeze({
    id: 'atomic-signal-hdr',
    owner: 'src/atomic-signal.ts',
    legacyMaterial: 'RawShaderMaterial',
    replacementPipelineId: 'pass64.hdr-grade-grain.tsl.v1',
    status: 'legacy-isolated',
    verification: 'principal HDR MSAA, depth-aware bloom occlusion, grade and dither parity',
  }),
  Object.freeze({
    id: 'atmosphere-mist',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-mist.tsl.v1',
    status: 'legacy-isolated',
    verification: 'fixed-time depth and alpha parity cameras',
  }),
  Object.freeze({
    id: 'atmosphere-smoke',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-smoke.tsl.v1',
    status: 'legacy-isolated',
    verification: 'fixed-seed smoke density and overdraw budget',
  }),
  Object.freeze({
    id: 'atmosphere-dust',
    owner: 'src/atmosphere-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.atmosphere-dust.tsl.v1',
    status: 'legacy-isolated',
    verification: 'fixed-seed dust density and overdraw budget',
  }),
  Object.freeze({
    id: 'procedural-grass',
    owner: 'src/grass-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.grass.tsl.v1',
    status: 'legacy-isolated',
    verification: 'placement identity, wind envelope and frame budget',
  }),
  Object.freeze({
    id: 'perimeter-water',
    owner: 'src/water-system.ts',
    legacyMaterial: 'ShaderMaterial',
    replacementPipelineId: 'pass64.water.tsl.v1',
    status: 'legacy-isolated',
    verification: 'island mask, wave bounds and reflection budget',
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
