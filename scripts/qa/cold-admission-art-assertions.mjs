export const ARENA_ART_READY_CONTRACT = 'arena-art-ready-v1';

export function selectArtAssertions(artReady) {
  if (!artReady || artReady.contract !== ARENA_ART_READY_CONTRACT) {
    return {
      kind: 'coverage-note',
      coverageNote: 'the cold subject exposes no per-arena art-ready contract; art assertions remain OPEN for this arena',
    };
  }
  return {
    kind: 'contract',
    fields: ['authoredArtRootVisible', 'authoredMaterialsResolved', 'streamingSettled'],
  };
}
