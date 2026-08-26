import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const gatePaths = [
  'scripts/qa/verify-pass66-atomic-sky-webgpu.mjs',
  'scripts/qa/verify-pass66-viewmodel-framing.mjs',
] as const;

describe('Pass 66 standalone browser evidence source binding', () => {
  it.each(gatePaths)('%s clears stale evidence and proves one clean HEAD before and after capture', (gatePath) => {
    const source = readFileSync(gatePath, 'utf8');

    expect(source).toContain("execFileSync('git', ['rev-parse', 'HEAD']");
    expect(source).toContain("['status', '--porcelain', '--untracked-files=all']");
    expect(source).toContain('await rm(artifactRoot, { recursive: true, force: true })');
    expect(source).toContain("Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'))");
    expect(source).toContain("'.env.development.local'");
    expect(source).toContain('endingRevision !== sourceRevision');
    if (gatePath.endsWith('verify-pass66-viewmodel-framing.mjs')) {
      // Local visual iteration may opt into a dirty development receipt, but
      // the default exact-SHA gate remains strict and any byte drift during the
      // capture still invalidates the evidence.
      expect(source).toContain("const allowDirty = process.env.PASS66_VIEWMODEL_ALLOW_DIRTY === '1'");
      expect(source).toContain('if (!allowDirty && startingStatus)');
      expect(source).toContain('(allowDirty && endingStatus !== startingStatus)');
      expect(source).toContain('cleanBefore: startingStatus.length === 0');
      expect(source).toContain('cleanAfter: endingStatus.length === 0');
      expect(source).toContain('exactSource: !allowDirty');
      expect(source).toContain('dirtyDevelopmentCapture: allowDirty');
      expect(source).toContain("if (snapshot.player?.stance !== 'stand') api.setStance('stand')");
      expect(source).toContain('{ timeout: 5_000, polling: 50 }');
      expect(source).not.toContain('await page.waitForTimeout(180)');
    } else {
      expect(source).toContain('cleanBefore: true');
      expect(source).toContain('cleanAfter: true');
    }
    expect(source).toContain('expectedRevision: expectedSourceRevision ?? sourceRevision');

    const staleEvidenceRemoval = source.indexOf('await rm(artifactRoot, { recursive: true, force: true })');
    const sourceStatusCheck = source.indexOf("['status', '--porcelain', '--untracked-files=all']");
    const finalSourceCheck = source.indexOf('endingRevision !== sourceRevision', staleEvidenceRemoval);
    const firstReceiptWrite = source.indexOf('await writeFile(', finalSourceCheck);
    expect(staleEvidenceRemoval).toBeGreaterThanOrEqual(0);
    expect(staleEvidenceRemoval).toBeLessThan(sourceStatusCheck);
    expect(finalSourceCheck).toBeGreaterThan(staleEvidenceRemoval);
    expect(firstReceiptWrite).toBeGreaterThan(finalSourceCheck);
    expect(source.slice(firstReceiptWrite, firstReceiptWrite + 160)).toMatch(/receipt\.json/);
  });
});
