import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog';
import {
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
    expect(bundle.current.release).toEqual(CHANGELOG[0]);
    expect(bundle.current.previousRelease).toBe(CHANGELOG[1]?.pass);
    expect(bundle.archive).toEqual(CHANGELOG.slice(1));
    expect(bundle.changes).toEqual(CHANGELOG);
    expect(bundle.current.candidateState).toBe('hitl-candidate');
    expect(bundle.publishedChannels.live.pass).toBe('PASS 62');
    expect(bundle.publishedChannels.stable.pass).toBe('PASS 60');
  });

  it('serializes agent JSON and human Markdown from the same bundle', () => {
    const bundle = createProjectMapBundle('2026-07-24T17:00:00Z');
    const json = projectMapJson(bundle);
    const markdown = projectMapMarkdown(bundle);
    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: 1,
      current: { release: { pass: CHANGELOG[0]?.pass } },
    });
    expect(markdown.indexOf('## Current release snapshot')).toBeLessThan(markdown.indexOf('## Release archive'));
    expect(markdown).toContain(`### ${CHANGELOG[1]?.pass}: ${CHANGELOG[1]?.title}`);
    expect(markdown).toContain('TypeScript and Rapier own physics');
    expect(markdown).toContain('Published live channel: PASS 62');
  });

  it('rejects an invalid generated timestamp', () => {
    expect(() => createProjectMapBundle('not-a-time')).toThrow('Invalid project-map timestamp');
  });
});
