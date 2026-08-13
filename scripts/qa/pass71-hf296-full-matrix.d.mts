export declare const PASS71_HF296_ARENAS: readonly string[];
export declare const PASS71_HF296_STANCES: readonly string[];
export declare const PASS71_HF296_WEAPONS: readonly string[];
export declare const PASS71_HF296_LOCAL_ROLES: readonly string[];
export declare const PASS71_HF296_REMOTE_ROLES: readonly string[];
export declare const PASS71_HF296_FIXTURES: readonly string[];
export declare const PASS71_HF296_ACTIONS: readonly string[];
export declare const PASS71_HF296_VISUAL_WEAPON: string;
export declare const PASS71_HF296_VISUAL_ACTION: string;
export declare const PASS71_HF296_LOCAL_KEYS: readonly string[];
export declare const PASS71_HF296_REMOTE_KEYS: readonly string[];
export declare const PASS71_HF296_VISUAL_KEYS: readonly string[];
export declare const PASS71_HF296_LOCAL_KEY_SHA256: string;
export declare const PASS71_HF296_REMOTE_KEY_SHA256: string;
export declare const PASS71_HF296_VISUAL_KEY_SHA256: string;
export declare const PASS71_HF296_MATRIX_COUNTS: Readonly<{
  local: number;
  remote: number;
  visual: number;
  weaponCatalog: number;
}>;
export declare function pass71Hf296LocalKey(value: Record<string, string>): string;
export declare function pass71Hf296RemoteKey(value: Record<string, string>): string;
export declare function pass71Hf296VisualKey(value: Record<string, string>): string;
export declare function pass71Hf296KeyDigest(keys: readonly string[]): string;
export declare function pass71Hf296ExactSetFailures(
  actual: unknown,
  expected: readonly string[],
  label: string,
): string[];
export declare function assertPass71Hf296ExactSets(value: {
  localKeys: readonly string[];
  remoteKeys: readonly string[];
  visualKeys: readonly string[];
}): true;
