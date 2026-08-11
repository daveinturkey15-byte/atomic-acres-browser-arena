import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Pass 70 multiplayer regression wiring', () => {
  it('routes the QA Railgun interaction through the production host-authority path', () => {
    const main = source('src/legacy-main.ts');
    const start = main.indexOf('interactRailgun: () => {');
    const end = main.indexOf('degradeStateChannel:', start);
    const implementation = main.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(implementation).toContain('return interactWithRailgunPickup();');
    expect(implementation).not.toContain('claimRailgun(');
    expect(implementation).not.toContain('applyRailgunState(');
  });

  it('canonicalizes a host lobby map change to that arena round duration', () => {
    const main = source('src/legacy-main.ts');
    const start = main.indexOf('const updateLobbyConfigFromUi');
    const end = main.indexOf("element<HTMLSelectElement>('#lobby-arena').addEventListener", start);
    const implementation = main.slice(start, end);

    expect(start).toBeGreaterThan(0);
    expect(implementation).toContain('durationMs: hostedArenaDurationMs(arenaSelection(arenaId))');
  });

  it('keeps supported long-soak fixtures on current gameplay entry points', () => {
    const networkSoak = source('scripts/qa/run-network-chaos-soak.ts');
    const browserSoak = source('scripts/qa/run-pass25a-soak.mjs');

    expect(networkSoak).toContain('pelletDirections: [[0, 0, -1]]');
    expect(browserSoak).toContain("candidateUrl.searchParams.set('release', 'latest')");
    expect(browserSoak).toContain("await page.click('#solo')");
    expect(browserSoak).not.toContain('__ATOMIC_ACRES_DEBUG__.startSolo()');
  });
});
