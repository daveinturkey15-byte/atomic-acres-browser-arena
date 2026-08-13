export type Pass71Hf297SourceCatalog = Readonly<{
  schemaVersion: 1;
  feedbackClaim: string;
  weaponIds: readonly string[];
  weaponDefinitionIds: readonly string[];
  stances: readonly string[];
  controllerActions: readonly string[];
  fullscreenOpticWeapons: readonly string[];
  firearmAuthoredActions: readonly string[];
  knifeAuthoredActions: readonly string[];
  sourceSha256: Readonly<Record<string, string>>;
}>;

export declare const PASS71_HF297_FULL_VIEWPORTS: readonly Readonly<{
  id: string; width: number; height: number; mobile: boolean;
}>[];
export declare const PASS71_HF297_FULL_POSE_STATES: readonly Readonly<{
  id: string; stance: string; contact: boolean;
}>[];
export declare const PASS71_HF297_FULL_RENDERERS: readonly string[];
export declare const PASS71_HF297_FULL_LOCAL_ROLES: readonly string[];
export declare const PASS71_HF297_FULL_FIREARM_ACTIONS: readonly string[];
export declare const PASS71_HF297_FULL_KNIFE_ACTIONS: readonly string[];
export declare const PASS71_HF297_FULL_REVIEW_TARGETS: readonly Readonly<{
  weapon: string; action: string;
}>[];
export declare const PASS71_HF297_FULL_CATALOG_VIEWPORT: string;
export declare const PASS71_HF297_FULL_CATALOG_POSE_STATE: string;
export declare const PASS71_HF297_FULL_CATALOG_ROLE: string;
export declare const PASS71_HF297_SOURCE_CATALOG_PATHS: Readonly<Record<string, string>>;
export declare const PASS71_HF297_CANONICAL_LEDGER_CLAIM: string;

export declare function pass71Hf297SourceCatalogFromTexts(
  texts: Readonly<Record<string, string>>,
): Pass71Hf297SourceCatalog;
export declare function pass71Hf297SourceCatalogAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Pass71Hf297SourceCatalog;
export declare function pass71Hf297ActionTargets(catalog: Pass71Hf297SourceCatalog): readonly Readonly<{
  weapon: string; action: string; presentation: string; equippedWeapon: string;
}>[];
export declare function pass71Hf297FullCellKey(value: Readonly<Record<string, string>>): string;
export declare function pass71Hf297FullCellIdentity(key: string): Readonly<Record<string, string>> | null;
export declare function pass71Hf297FullMatrixKeys(catalog: Pass71Hf297SourceCatalog): readonly string[];
export declare function pass71Hf297FullVisualKeys(catalog: Pass71Hf297SourceCatalog): readonly string[];
export declare function pass71Hf297FullKeyDigest(keys: readonly string[]): string;
export declare function pass71Hf297FullExactSetFailures(
  actual: unknown,
  expected: readonly string[],
  label: string,
): string[];
export declare function pass71Hf297FullMatrixCounts(catalog: Pass71Hf297SourceCatalog): Readonly<{
  weapons: number;
  firearmActionTargets: number;
  knifeActionTargets: number;
  actionTargets: number;
  telemetryCells: number;
  embeddedVisualCells: number;
  runtimeScopes: number;
}>;
export declare function assertPass71Hf297FullExactSets(
  value: { telemetryKeys: readonly string[]; visualKeys: readonly string[] },
  catalog: Pass71Hf297SourceCatalog,
): true;
