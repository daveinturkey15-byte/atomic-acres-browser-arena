/** Types for the HF-395 penetration ratchet (see viewmodel-penetration-ratchet.mjs). */
export declare const VIEWMODEL_PENETRATION_RATCHET_CONTRACT: 'viewmodel-penetration-ratchet-v1';
export declare const RATCHET_TOLERANCE_METERS: number;

export type RatchetScenario = Readonly<{
  penetrating: number;
  worstM: number;
  belowFloor: number;
  worstBelowFloorM: number;
}>;

export type RatchetCoverage = Readonly<{
  arenas: readonly string[];
  weapons: readonly string[];
  yawSteps: number;
  stances: readonly string[];
}>;

export type Ratchet = Readonly<{
  contract: string;
  arenas: string[];
  weapons: string[];
  yawSteps: number;
  stances: string[];
  scenarios: Record<string, RatchetScenario>;
}>;

export declare function buildRatchet(
  summary: Readonly<{ byScenario: Record<string, RatchetScenario> }>,
  coverage: RatchetCoverage,
): Ratchet;
export declare function updateRefusals(held: Ratchet | null, measured: Ratchet): string[];
export declare function gradeAgainstRatchet(held: Ratchet, measured: Ratchet): string[];
