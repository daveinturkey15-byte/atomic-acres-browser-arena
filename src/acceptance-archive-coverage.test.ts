import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateAcceptanceArchive } from '../scripts/release/acceptance-archive.mjs';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)));
const document = (path: string) => JSON.parse(read(path).toString('utf8'));
function input() {
  const map = document('docs/acceptance-archive/archive-map.json');
  return {
    map,
    archives: new Map<string, Buffer>(map.archives.map((entry: { to: string }) => [entry.to, read(entry.to)])),
    projection: document('docs/acceptance-archive/requirement-projection.json'),
    candidate: document(map.activeManifest),
  };
}

describe('recovered acceptance obligation preservation', () => {
  it('preserves every original Git blob and all 22 original obligations without granting approval', () => {
    expect(validateAcceptanceArchive(input())).toEqual({
      ok: true, errors: [], originalCount: 22, projectedCount: 22, grantsAcceptance: false,
    });
  });

  it('rejects each individually omitted original obligation, including the four missed in review', () => {
    const count = input().projection.projection.length;
    for (let index = 0; index < count; index += 1) {
      const data = input();
      const [omitted] = data.projection.projection.splice(index, 1);
      expect(validateAcceptanceArchive(data).errors).toContain(`Omitted original requirement: ${omitted.source}:${omitted.id}`);
    }
  });

  it('rejects a duplicate projection even when the total count looks plausible', () => {
    const data = input();
    data.projection.projection[1] = structuredClone(data.projection.projection[0]);
    const result = validateAcceptanceArchive(data);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error: string) => error.startsWith('Duplicate projection:'))).toBe(true);
    expect(result.errors.some((error: string) => error.startsWith('Omitted original requirement:'))).toBe(true);
  });

  it('rejects altered historical bytes rather than silently updating an old acceptance claim', () => {
    const data = input();
    const path = data.map.archives[0].to;
    data.archives.set(path, Buffer.from(read(path).toString('utf8').replace('pending', 'verified')));
    expect(validateAcceptanceArchive(data).errors).toContain(`Changed historical bytes: ${path}`);
  });

  it('rejects a retained requirement without a real active target', () => {
    const data = input();
    const entry = data.projection.projection.find((row: { disposition: string }) => row.disposition === 'PROJECT');
    entry.projectedInto = 'pass-96 R999';
    expect(validateAcceptanceArchive(data).errors).toContain(`Missing active requirement target: ${entry.source}:${entry.id}`);
  });
});
