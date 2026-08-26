import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableStringify } from './canonical-state';
import { buildGameplayContract } from './gameplay-contract';

const baselinePath = resolve(import.meta.dirname, '../baselines/pass65-candidate/gameplay-contract.json');

describe('Pass 65 candidate gameplay contract', () => {
  it('matches the checked pre-HITL candidate exactly', async () => {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as { contract: unknown };
    expect(stableStringify(buildGameplayContract())).toBe(stableStringify(baseline.contract));
  });
});
