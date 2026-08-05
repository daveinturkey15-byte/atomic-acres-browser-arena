import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frozen = Object.freeze({
  'gameplay-contract.json': '50bc46196b6874eb216ed651e14933847b4db779a23481c3bbca42ef9d9bf18c',
  'golden-replays.json': 'f88b9da639cf9a0f332303c832dae98949d80a9e2f57848249088a5c629309c3',
});

describe('frozen Pass 25A gameplay oracle', () => {
  for (const [name, expectedDigest] of Object.entries(frozen)) {
    it(`retains ${name} byte-for-byte after newline normalization`, () => {
      const path = resolve(import.meta.dirname, `../baselines/pass25a/${name}`);
      const normalized = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
      expect(createHash('sha256').update(normalized).digest('hex')).toBe(expectedDigest);
    });
  }
});
