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

/**
 * Every arena the menu can offer, in ARENA_SELECTIONS order, with the exact set
 * of public bytes its visual definition pulls in.
 *
 * The roster is DERIVED, never listed: it walks ARENA_SELECTIONS and resolves
 * each id through ARENA_VISUAL_REGISTRY, so an arena added to the player-facing
 * registry joins this closure the moment it exists. That is how test1/test2
 * (owner 2026-08-30) entered it with no edit here. Both declare
 * `assetDependencies: []` on purpose - they build their own procedural sky in
 * src/rendering/arenas/test1.ts and test2.ts rather than sampling a baked sky
 * webp - so their closure is the shared gameplay set alone, and an empty
 * `assetDependencies` is a legitimate answer rather than a missing one.
 *
 * The registry lookup is checked rather than assumed: a selectable arena with no
 * visual module used to fail here as `module is not a function`, which reads as
 * a bug in this file instead of a missing registration in the one it derives
 * from.
 */
export async function canonicalPass65PreviewArenaDependencies(): Promise<Pass65PreviewArenaDependencyManifest> {
  const arenaOrder = ARENA_SELECTIONS.map((arena) => arena.id);
  const arenas = await Promise.all(arenaOrder.map(async (arenaId) => {
    const load = ARENA_VISUAL_REGISTRY[arenaId];
    if (typeof load !== 'function') {
      throw new Error(`Canonical arena dependency roster: ${arenaId} is offered by ARENA_SELECTIONS but has no ARENA_VISUAL_REGISTRY entry`);
    }
    const module = await load();
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
