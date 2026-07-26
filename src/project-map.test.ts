import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog';
import {
  PROJECT_MAP_CANDIDATE,
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
    expect(bundle.current.release).toEqual(PROJECT_MAP_CANDIDATE);
    expect(bundle.current.previousRelease).toBe('PASS 64');
    expect(bundle.archive).toEqual(CHANGELOG);
    expect(bundle.changes).toEqual([PROJECT_MAP_CANDIDATE, ...CHANGELOG]);
    expect(bundle.current.candidateState).toBe('hitl-candidate');
    expect(bundle.publishedChannels.stagedCandidate).toMatchObject({
      pass: 'PASS 65', label: 'THE BIG ONE', path: 'channels/the-big-one', state: 'unpublished-hitl-candidate',
    });
    expect(bundle.publishedChannels.live).toMatchObject({
      pass: 'PASS 64', role: 'published-failed-regression-evidence',
    });
    expect(bundle.publishedChannels.stable.pass).toBe('PASS 63');
  });

  it('serializes agent JSON and human Markdown from the same bundle', () => {
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    const json = projectMapJson(bundle);
    const markdown = projectMapMarkdown(bundle);
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      current: { release: { pass: PROJECT_MAP_CANDIDATE.pass } },
    });
    expect(markdown.indexOf('## Current release snapshot')).toBeLessThan(markdown.indexOf('## Release archive'));
    expect(markdown).toContain(`### ${CHANGELOG[0]?.pass}: ${CHANGELOG[0]?.title}`);
    expect(markdown).toContain('TypeScript and Rapier own physics');
    expect(markdown).toContain('Staged HITL candidate: PASS 65 (THE BIG ONE); unpublished');
    expect(markdown).toContain('Published live channel: PASS 64');
  });

  it('rejects an invalid generated timestamp', () => {
    expect(() => createProjectMapBundle('not-a-time')).toThrow('Invalid project-map timestamp');
  });
});
