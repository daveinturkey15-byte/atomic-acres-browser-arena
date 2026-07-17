import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

type ManifestFile = { path: string; sha256: string };
type ManifestAsset = {
  id?: string;
  files: string | ManifestFile[];
  license?: string;
  licenseFile?: string;
  provenanceFile?: string;
  sha256?: string;
  sourceBlend?: string;
  sourceBlendSha256?: string;
  sourceSpec?: string;
  sourceSpecSha256?: string;
};
type Manifest = { schemaVersion: number; assets: ManifestAsset[]; rejectedCandidates?: ManifestAsset[] };

function filesBelow(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else result.push(relative(process.cwd(), path).replaceAll('\\', '/'));
    }
  };
  visit(root);
  return result.sort();
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('third-party asset provenance', () => {
  it('manifests every bundled file with its exact checksum and local license record', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as Manifest;
    expect(manifest.schemaVersion).toBeGreaterThanOrEqual(3);
    const thirdPartyAssets = manifest.assets.filter((asset) => Array.isArray(asset.files));
    const records = thirdPartyAssets.flatMap((asset) => asset.files as ManifestFile[]);
    const shipped = filesBelow('public/assets/third-party');
    expect(records.map((record) => record.path).sort()).toEqual(shipped);
    for (const asset of thirdPartyAssets) {
      expect(asset.license).toMatch(/CC0/);
      expect(asset.licenseFile).toMatch(/^public\/assets\/third-party\//);
      expect(asset.provenanceFile).toMatch(/^public\/assets\/third-party\//);
    }
    for (const record of records) {
      expect(record.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(sha256(record.path)).toBe(record.sha256);
    }
  });

  it('records exact checksums for the original Sanctified Frag GLB and editable Blender source', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as Manifest;
    const asset = manifest.assets.find((entry) => entry.id === 'atomic-acres-sanctified-frag-2026-07-15');
    expect(asset).toBeTruthy();
    expect(asset?.files).toBe('public/assets/original/models/holy-hand-frag.glb');
    expect(asset?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(asset?.files as string)).toBe(asset?.sha256);
    expect(asset?.sourceBlend).toBe('source-assets/blender/holy-hand-frag.blend');
    expect(asset?.sourceBlendSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(asset?.sourceBlend as string)).toBe(asset?.sourceBlendSha256);
  });

  it('records exact checksums for the Blender Render GLB, editable source, and authoritative arena spec', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as Manifest;
    const asset = manifest.assets.find((entry) => entry.id === 'atomic-acres-blender-render-arena-2026-07-17');
    expect(asset).toBeTruthy();
    expect(asset?.files).toBe('public/assets/original/models/atomic-acres-blender-arena.glb');
    expect(sha256(asset?.files as string)).toBe(asset?.sha256);
    expect(asset?.sourceBlend).toBe('source-assets/blender/atomic-acres-blender-arena.blend');
    expect(sha256(asset?.sourceBlend as string)).toBe(asset?.sourceBlendSha256);
    expect(asset?.sourceSpec).toBe('source-assets/blender/atomic-acres-arena-spec.json');
    expect(sha256(asset?.sourceSpec as string)).toBe(asset?.sourceSpecSha256);
  });

  it('preserves rejected candidate provenance outside the deployable public tree', () => {
    const manifest = JSON.parse(readFileSync('assets.manifest.json', 'utf8')) as Manifest;
    const candidates = manifest.rejectedCandidates ?? [];
    const records = candidates.flatMap((asset) => Array.isArray(asset.files) ? asset.files : []);
    expect(records.map((record) => record.path).sort()).toEqual(filesBelow('third-party-candidates'));
    for (const asset of candidates) {
      expect(asset.license).toMatch(/CC0/);
      expect(asset.licenseFile).toMatch(/^third-party-candidates\//);
      expect(asset.provenanceFile).toMatch(/^third-party-candidates\//);
    }
    for (const record of records) expect(sha256(record.path)).toBe(record.sha256);
    expect(filesBelow('public/assets/third-party').some((path) => path.includes('/opengameart/fps-arms/'))).toBe(false);
  });
});
