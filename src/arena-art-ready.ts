import * as THREE from 'three';

/** Stable debug contract consumed by cold-admission evidence. */
export const ARENA_ART_READY_CONTRACT = 'arena-art-ready-v1' as const;

export type ArenaArtMaterialState = 'resolved' | 'pending' | 'placeholder' | 'fallback';

export type ArenaArtReadiness = Readonly<{
  contract: typeof ARENA_ART_READY_CONTRACT;
  arenaId: string;
  authoredArtRootVisible: boolean;
  authoredMaterialsResolved: boolean;
  streamingSettled: boolean;
  ready: boolean;
  registry: Readonly<{
    materialCount: number;
    unresolvedMaterialCount: number;
    pendingTextureCount: number;
    pendingLutCount: number;
  }>;
}>;

export type ArenaArtReadyContract = Readonly<{
  snapshot(): ArenaArtReadiness;
}>;

type ArenaArtUserData = Record<string, unknown> & {
  arenaArtMaterialState?: ArenaArtMaterialState;
  arenaArtPlaceholder?: boolean;
  arenaArtFallback?: boolean;
  arenaArtStreamingSettled?: boolean;
  arenaArtPendingTextureCount?: number;
  arenaArtPendingLutCount?: number;
};

function materialsIn(root: THREE.Group): THREE.Material[] {
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const entry of material ? (Array.isArray(material) ? material : [material]) : []) materials.add(entry);
  });
  return [...materials];
}

function unresolvedMaterial(material: THREE.Material): boolean {
  const userData = material.userData as ArenaArtUserData;
  return userData.arenaArtMaterialState === 'pending'
    || userData.arenaArtMaterialState === 'placeholder'
    || userData.arenaArtMaterialState === 'fallback'
    || userData.arenaArtPlaceholder === true
    || userData.arenaArtFallback === true;
}

function nonNegativeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Create the readiness contract for one arena's live authored root.
 *
 * The registry is collected from the root's actual render materials on every
 * snapshot. There is no arena-name allowlist: a new arena gets the same
 * contract as soon as its ArenaMap publishes one, and a placeholder/fallback
 * is visible to the contract only when its material carries the explicit art
 * state marker.
 */
export function createArenaArtReadyContract(
  arenaId: string,
  root: THREE.Group,
  scene?: THREE.Scene,
): ArenaArtReadyContract {
  return Object.freeze({
    snapshot(): ArenaArtReadiness {
      const materials = materialsIn(root);
      const unresolvedMaterialCount = materials.filter(unresolvedMaterial).length;
      const userData = root.userData as ArenaArtUserData;
      const pendingTextureCount = nonNegativeCount(userData.arenaArtPendingTextureCount);
      const pendingLutCount = nonNegativeCount(userData.arenaArtPendingLutCount);
      const backdropLoading = scene?.userData.pass66SkyBackdropStatus === 'asset-loading';
      const authoredArtRootVisible = root.parent !== null
        && root.visible
        && userData.menuOnlyPlaceholder !== true
        && materials.length > 0;
      const authoredMaterialsResolved = materials.length > 0 && unresolvedMaterialCount === 0;
      const streamingSettled = userData.arenaArtStreamingSettled !== false
        && pendingTextureCount === 0
        && pendingLutCount === 0
        && !backdropLoading;
      return Object.freeze({
        contract: ARENA_ART_READY_CONTRACT,
        arenaId,
        authoredArtRootVisible,
        authoredMaterialsResolved,
        streamingSettled,
        ready: authoredArtRootVisible && authoredMaterialsResolved && streamingSettled,
        registry: Object.freeze({
          materialCount: materials.length,
          unresolvedMaterialCount,
          pendingTextureCount,
          pendingLutCount,
        }),
      });
    },
  });
}
