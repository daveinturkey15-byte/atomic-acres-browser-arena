// Types for the HF-413 arms/weapon handedness gate, so
// src/hf413-arms-handedness.test.ts can drive the real audit under `tsc
// --noEmit` without a cast. The implementation stays the single source of
// truth; this file only describes its exported surface.

export interface ArmsHandednessNode {
  name?: string;
  translation?: number[];
  scale?: number[];
  matrix?: number[];
}

export interface ArmsHandednessNodeGraph {
  nodes: ArmsHandednessNode[];
}

export interface ArmsHandednessAudit {
  file: string;
  nodes: number;
  checkedSockets: number;
  violations: string[];
}

export interface ArmsHandednessCorpusReport {
  files: number;
  nodes: number;
  sockets: number;
  violations: string[];
}

export declare const ARMS_HANDEDNESS_CONTRACT: string;

export declare const RELOAD_CONTACT_CONTRACT: Readonly<{
  maximumMagazineDistanceMeters: number;
  centrelineToleranceMeters: number;
}>;

export declare function auditGlbNodeGraph(
  label: string,
  json: ArmsHandednessNodeGraph,
): ArmsHandednessAudit;

export declare function auditGlbHandedness(file: string): ArmsHandednessAudit;

export declare function readCorpusGlbJson(file: string): ArmsHandednessNodeGraph;

export declare function auditArmsAndWeaponCorpus(roots?: readonly string[]): ArmsHandednessCorpusReport;
