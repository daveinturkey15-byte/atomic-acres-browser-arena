import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateMpSoakBundle, formatMpSoakTable } from './mp-soak-assertions.mjs';

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/mp-soak/${name}`, import.meta.url), 'utf8'));
}

test('passes the complete three-minute evidence fixture', async () => {
  const result = evaluateMpSoakBundle(await fixture('valid-bundle.json'));
  assert.equal(result.pass, true);
  assert.equal(result.rows.every((row) => row.pass), true);
  assert.match(formatMpSoakTable(result.rows), /MP-SOAK-REPLICATION/u);
  assert.match(formatMpSoakTable(result.rows), /PASS/u);
});

test('fails closed on short replication, missing directions, rejoin, errors, and scoreboard disagreement', async () => {
  const result = evaluateMpSoakBundle(await fixture('invalid-bundle.json'));
  assert.equal(result.pass, false);
  const failed = result.rows.filter((row) => !row.pass).map((row) => row.id);
  assert.deepEqual(failed, [
    'MP-SOAK-REPLICATION',
    'MP-SOAK-REJOIN-DAMAGE',
    'MP-SOAK-RELOAD-AFTER-DEATH',
    'MP-SOAK-RESPAWN-RESET',
    'MP-SOAK-STAIR-FIRE',
    'MP-SOAK-CONSOLE-CLEAN',
    'MP-SOAK-SCOREBOARD',
  ]);
});

test('does not admit a position divergence at the stated bound', async () => {
  const bundle = await fixture('valid-bundle.json');
  bundle.replication.divergences = [{ second: 30, distanceM: 1.5001 }];
  assert.equal(evaluateMpSoakBundle(bundle).pass, false);
  assert.equal(evaluateMpSoakBundle(bundle).rows.find((row) => row.id === 'MP-SOAK-REPLICATION').pass, false);
});
