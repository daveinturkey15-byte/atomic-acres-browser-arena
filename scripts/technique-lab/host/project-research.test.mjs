import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectResearch } from './project-research.mjs';

test('public projection drops private provenance before browser serialization', () => {
  const projected = projectResearch({ rows: [{
    sourceId: 1, methodExtracted: 'A source-derived deformation method',
    canonical: 'repo@0123456789012345678901234567890123456789',
    carrierSkills: [{ path: 'C:\\Users\\private\\SKILL.md' }],
    urlAttempts: [{ outcome: 'ok', localPath: 'C:\\Users\\private\\cache', sha256: 'a'.repeat(64) }],
    cpuCheck: 'C:\\Users\\private\\results.json',
    filesRead: ['src/method.ts (full)', '/home/private/cache'],
  }] });
  const bytes = JSON.stringify(projected);
  assert.ok(!bytes.includes('private'));
  assert.ok(!bytes.includes('localPath'));
  assert.ok(!bytes.includes('carrierSkills'));
  assert.equal(projected.records[0].methodExtracted, 'A source-derived deformation method');
  assert.deepEqual(projected.records[0].filesRead, ['src/method.ts (full)']);
  assert.equal(projected.records[0].urls[0].sha256, 'a'.repeat(64));
});

test('projection retains negative read claims and never invents successful reads', () => {
  const projected = projectResearch({ records: [{ sourceId: 3,
    readDepth: 'NOT READ', methodExtracted: 'NOT DETERMINED',
    carrierReadComplete: false, urls: [{ outcome: 'error' }],
  }] });
  assert.equal(projected.records[0].carrierReadComplete, false);
  assert.equal(projected.records[0].urls[0].outcome, 'error');
  assert.equal(projected.records[0].methodExtracted, 'NOT DETERMINED');
});
