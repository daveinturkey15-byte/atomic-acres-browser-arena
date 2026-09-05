import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const gatePath = fileURLToPath(new URL('./mp-soak-gate.mjs', import.meta.url));
const source = await readFile(gatePath, 'utf8');

test('soak gate stays inside the dedicated QA port range', () => {
  assert.match(source, /dist: Number\(process\.env\.MP_SOAK_DIST_PORT \?\? '4233'\)/);
  assert.match(source, /peer: Number\(process\.env\.MP_SOAK_PEER_PORT \?\? '4234'\)/);
  assert.match(source, /new Set\(\[4233, 4234, 4235\]\)/);
  assert.doesNotMatch(source, /4227|4228/);
});

test('soak hard stop remains under the five-minute browser fence and starts after launch', () => {
  assert.match(source, /const HARD_TIMEOUT_MS = 299_000/);
  const browsersReady = source.indexOf('browsers = await Promise.all');
  const timerInstalled = source.indexOf('hardStopTimer = setTimeout');
  assert.ok(browsersReady >= 0 && timerInstalled > browsersReady);
});

test('stair probe uses returned arena anchors and preserves fire evidence', () => {
  assert.match(source, /arenaStairGeometry\(arenaId, team\)/);
  assert.match(source, /stair\.foot/);
  assert.match(source, /stair\.top/);
  assert.match(source, /debug\.teleportPlayer\(bodyPosition\[0\], bodyPosition\[1\], bodyPosition\[2\]/);
  assert.match(source, /uphill: stair\.uphill/);
  assert.doesNotMatch(source, /uphill: staged\.uphill/);
  assert.match(source, /stairFireResult/);
});

test('scoreboard is sampled after an explicit RTT propagation wait', () => {
  const wait = source.indexOf('await sleep(DAMAGE_RTT_MS);');
  const sample = source.indexOf('await scoreboardAtEnd();');
  assert.ok(wait >= 0 && sample > wait);
  assert.match(source, /damageDealt: score\.damageDealt/);
  assert.match(source, /damageTaken: score\.damageTaken/);
});
