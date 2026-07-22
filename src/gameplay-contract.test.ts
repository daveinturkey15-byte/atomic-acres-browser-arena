import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableStringify } from './canonical-state';
import { buildGameplayContract } from './gameplay-contract';

const baselinePath = resolve(import.meta.dirname, '../baselines/pass25a/gameplay-contract.json');

describe('Pass 25A gameplay contract', () => {
  it('matches the checked approved baseline exactly', async () => {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as { contract: unknown };
    expect(stableStringify(buildGameplayContract())).toBe(stableStringify(baseline.contract));
  });
});
