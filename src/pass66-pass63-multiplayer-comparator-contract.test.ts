import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PASS67_STABLE_BUNDLE_CAPABILITY_EVIDENCE,
  PASS67_STABLE_COMPARATOR_CAPABILITIES,
  PASS66_CANDIDATE_COMPARATOR_CAPABILITIES,
  pass66ComparatorCapabilities,
} from './pass66-pass63-multiplayer-comparator-contract';

type ReleaseChannels = Readonly<{
  stable: Readonly<{
    pagesSha: string;
    pagesPath: string;
  }>;
}>;

function pinnedStableJavascript(): string {
  const channels = JSON.parse(readFileSync(resolve('release-channels.json'), 'utf8')) as ReleaseChannels;
  const { pagesSha, pagesPath } = channels.stable;
  const assetRoot = `${pagesPath}/assets`;
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', pagesSha, '--', assetRoot], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).split(/\r?\n/u).filter((path) => path.endsWith('.js'));
  expect(paths.length).toBeGreaterThan(0);
  // Read the pinned tree through one batch process. Spawning one `git cat-file`
  // per chunk made this byte-exact contract exceed Vitest's five-second limit
  // only under full-suite process contention, even though the same assertion
  // completed quickly in isolation.
  return execFileSync('git', ['cat-file', '--batch'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    input: `${paths.map((path) => `${pagesSha}:${path}`).join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
}

describe('Pass 66 versus pinned Pass 67.1 multiplayer comparator contract', () => {
  it('derives the stable capability boundary from the byte-exact pinned Pages bundle', () => {
    const bundle = pinnedStableJavascript();
    for (const literal of PASS67_STABLE_BUNDLE_CAPABILITY_EVIDENCE.required) {
      expect(bundle, `pinned Pass 67.1 exposes ${literal}`).toContain(literal);
    }
    for (const literal of PASS67_STABLE_BUNDLE_CAPABILITY_EVIDENCE.absent) {
      expect(bundle, `pinned Pass 67.1 does not expose ${literal}`).not.toContain(literal);
    }
  });

  it('keeps Pass 66-only affordance and mirror checks out of the stable scenario', () => {
    expect(pass66ComparatorCapabilities('stable')).toBe(PASS67_STABLE_COMPARATOR_CAPABILITIES);
    expect(pass66ComparatorCapabilities('candidate')).toBe(PASS66_CANDIDATE_COMPARATOR_CAPABILITIES);
    expect(PASS67_STABLE_COMPARATOR_CAPABILITIES).toEqual({
      sessionRoomIdentity: true,
      explicitRejoinAffordance: true,
      reliableStateCommitMirrors: true,
    });
    expect(PASS66_CANDIDATE_COMPARATOR_CAPABILITIES).toEqual({
      sessionRoomIdentity: true,
      explicitRejoinAffordance: true,
      reliableStateCommitMirrors: true,
    });
  });
});
