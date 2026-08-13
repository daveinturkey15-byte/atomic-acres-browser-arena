export declare const PASS71_WINDOWS_SUPPLEMENTAL_GROUPS: readonly string[];
export declare const PASS71_LINUX_SUPPLEMENTAL_GROUPS: readonly string[];
export declare function pass71CandidateAArtifactNames(sourceSha: string): readonly string[];
export declare function parsePass71CandidateAArtifactReference(reference: string, sourceSha: string): Readonly<{
  artifactName: string;
  path: string;
  sha256: string;
  byteLength: number;
}>;
