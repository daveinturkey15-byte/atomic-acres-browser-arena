import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';
import { CHANGELOG } from './changelog';
import {
  PROJECT_MAP_RELEASE,
  PROJECT_MAP_TREE,
  createProjectMapBundle,
  flattenProjectMap,
  projectMapJson,
  projectMapMarkdown,
} from './project-map';

describe('project map', () => {
  it('uses stable unique node ids and only names real repository paths', () => {
    const nodes = flattenProjectMap(PROJECT_MAP_TREE);
    expect(nodes.length).toBeGreaterThanOrEqual(12);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
    for (const path of nodes.flatMap((node) => node.paths ?? [])) {
      expect(existsSync(resolve(process.cwd(), path)), path).toBe(true);
    }
  });

  it('keeps the current snapshot first and the complete older history in the archive', () => {
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    expect(bundle.current.release).toEqual(PROJECT_MAP_RELEASE);
    expect(bundle.current.previousRelease).toBe('PASS 84');
    expect(bundle.archive).toEqual(CHANGELOG);
    // The current snapshot replaces the pending PASS 80 ledger entry at the
    // front of the combined changes list instead of duplicating the pass.
    expect(bundle.changes).toEqual([
      PROJECT_MAP_RELEASE,
      ...CHANGELOG.filter((entry) => entry.id !== PROJECT_MAP_RELEASE.id),
    ]);
    expect(bundle.current.releaseState).toBe('release-candidate');
    expect(bundle.publishedChannels.liveTarget).toMatchObject({
      pass: 'PASS 85', label: 'PASS 85', path: 'channels/pass85', state: 'release-candidate',
    });
    expect(bundle.publishedChannels.failedRegressionEvidence).toMatchObject({
      pass: 'PASS 64', role: 'published-failed-regression-evidence',
    });
    expect(bundle.publishedChannels.stable).toMatchObject({
      pass: 'PASS 63',
      path: 'channels/pass63-rollback',
      sourceSha: 'ac85e9b8b46cc2370aee903d564ecf3c4682b24c',
      pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
    });
  });

  it('reads its current release from the changelog instead of keeping a second copy', () => {
    // HF-406: `projectMapReleaseCopy` used to hand-write a second Pass 73 release note
    // that the map rendered next to the PASS 85 stamp ('PASS 85 · Pass 73 · release
    // candidate'). There is now exactly one record.
    expect(PROJECT_MAP_RELEASE).toBe(CHANGELOG[0]);
    expect(PROJECT_MAP_RELEASE.areas).not.toContain('HITL');
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    expect(bundle.current.release.title).toBe(CHANGELOG[0]?.title);
    expect(bundle.current.architectureRevision).toBe('atomic-acres-domains-v1');
  });

  it('derives the arena catalog node from the canonical arena ids', () => {
    const node = flattenProjectMap(PROJECT_MAP_TREE).find((entry) => entry.id === 'arena-catalog');
    expect(node).toBeDefined();
    for (const arena of ARENA_IDS) expect(node?.summary).toContain(arena);
    expect(node?.summary).toContain(`The ${ARENA_IDS.length} canonical arena ids`);
  });

  it('serializes agent JSON and human Markdown from the same bundle', () => {
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    const json = projectMapJson(bundle);
    const markdown = projectMapMarkdown(bundle);
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      current: { release: { pass: PROJECT_MAP_RELEASE.pass } },
    });
    expect(markdown.indexOf('## Current release snapshot')).toBeLessThan(markdown.indexOf('## Release archive'));
    expect(markdown).toContain(`### ${CHANGELOG[0]?.pass}: ${CHANGELOG[0]?.title}`);
    expect(markdown).toContain('TypeScript and Rapier own physics');
    expect(markdown).toMatch(/Live target: PASS 85 \(PASS 85\); release-candidate/);
    expect(markdown).toContain('Failed-regression evidence: PASS 64');
  });

  it('rejects an invalid generated timestamp', () => {
    expect(() => createProjectMapBundle('not-a-time')).toThrow('Invalid project-map timestamp');
  });
});
