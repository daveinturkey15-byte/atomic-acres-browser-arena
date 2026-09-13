export interface ArchiveEntry {
  from: string;
  to: string;
  blobSha: string;
  requirementIds: string[];
  originalStatus: string;
}
export interface ProjectionEntry {
  source: string;
  id: string;
  originalState: string;
  disposition: string;
  basis?: string;
  projectedInto?: string | null;
}
export function validateAcceptanceArchive(input: {
  map: { archives: ArchiveEntry[]; activeManifest: string; grantsAcceptance: boolean };
  archives: ReadonlyMap<string, Uint8Array>;
  projection: { projection: ProjectionEntry[] };
  candidate: { requirements: Array<{ id: string }> };
}): {
  ok: boolean;
  errors: string[];
  originalCount: number;
  projectedCount: number;
  grantsAcceptance: false;
};
