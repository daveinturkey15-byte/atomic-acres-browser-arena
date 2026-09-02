/** Types for the HF-395 penetration ratchet (see viewmodel-penetration-ratchet.mjs). */
export declare const VIEWMODEL_PENETRATION_RATCHET_CONTRACT: 'viewmodel-penetration-ratchet-v2';
export declare const RATCHET_TOLERANCE_METERS: number;
export declare const RATCHET_CLIPPED_FRACTION_TOLERANCE: number;

export type RatchetScenario = Readonly<{
  /** Rows the run actually posed (grounded and at the requested stance). */
  gradedRows: number;
  penetrating: number;
  worstM: number;
  belowFloor: number;
  worstBelowFloorM: number;
  /** Largest share of the rig's vertices the clip planes removed. */
  worstClippedFraction: number;
}>;

/** The per-scenario block an instrument summary produces. */
export type SummaryScenario = RatchetScenario & Readonly<{ rows: number; erased: number }>;

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
  summary: Readonly<{ byScenario: Record<string, Partial<SummaryScenario> & RatchetScenario> }>,
  coverage: RatchetCoverage,
): Ratchet;
export declare function updateRefusals(held: Ratchet | null, measured: Ratchet): string[];
export declare function gradeAgainstRatchet(held: Ratchet, measured: Ratchet): string[];
