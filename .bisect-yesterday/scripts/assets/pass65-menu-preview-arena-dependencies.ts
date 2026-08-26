import { createHash } from 'node:crypto';
import { ARENA_SELECTIONS, type ArenaId } from '../../src/map-selection';
import { ARENA_VISUAL_REGISTRY } from '../../src/rendering/arena-visual-stream';

function localAssetPath(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0]!;
  if (!withoutQuery.startsWith('./assets/')) throw new Error(`Pass 65 preview canonical arena dependency is not a local asset URL: ${url}`);
  return `public/${withoutQuery.slice(2)}`;
}

export type Pass65PreviewArenaDependencyManifest = Readonly<{
  schemaVersion: 1;
  source: 'ARENA_VISUAL_REGISTRY';
  arenaOrder: readonly ArenaId[];
  arenas: readonly Readonly<{
    arenaId: ArenaId;
    moduleId: string;
    assetDependencies: readonly string[];
    sharedAssetDependencies: readonly string[];
    localAssetPaths: readonly string[];
  }>[];
  manifestSha256: string;
}>;

export async function canonicalPass65PreviewArenaDependencies(): Promise<Pass65PreviewArenaDependencyManifest> {
  const arenaOrder = ARENA_SELECTIONS.map((arena) => arena.id);
  const arenas = await Promise.all(arenaOrder.map(async (arenaId) => {
    const module = await ARENA_VISUAL_REGISTRY[arenaId]();
    if (module.definition.id !== arenaId) throw new Error(`Canonical arena dependency identity mismatch: ${arenaId} != ${module.definition.id}`);
    const assetDependencies = [...module.definition.assetDependencies];
    const sharedAssetDependencies = [...module.definition.sharedAssetDependencies];
    return Object.freeze({
      arenaId,
      moduleId: module.definition.moduleId,
      assetDependencies: Object.freeze(assetDependencies),
      sharedAssetDependencies: Object.freeze(sharedAssetDependencies),
      localAssetPaths: Object.freeze([...new Set([...assetDependencies, ...sharedAssetDependencies].map(localAssetPath))].sort()),
    });
  }));
  const body = Object.freeze({
    schemaVersion: 1 as const,
    source: 'ARENA_VISUAL_REGISTRY' as const,
    arenaOrder: Object.freeze(arenaOrder),
    arenas: Object.freeze(arenas),
  });
  return Object.freeze({
    ...body,
    manifestSha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
  });
}
