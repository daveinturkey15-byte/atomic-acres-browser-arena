import test from 'node:test';
import assert from 'node:assert/strict';
import { channelReport, parseReleaseChannelConfig, passNumber } from './build-channels.mjs';

const source = `window.__ATOMIC_ACRES_RELEASE_CHANNELS__={"experimental":{"label":"LIVE","description":"latest","pass":"PASS 64","path":"channels/live"},"stable":{"label":"STABLE","description":"fallback","pass":"PASS 63","path":"channels/stable"}};`;

test('release config parser extracts live and stable pass metadata', () => {
  const config = parseReleaseChannelConfig(source);
  assert.equal(passNumber(config.experimental.pass), 64);
  assert.equal(passNumber(config.stable.pass), 63);
});

test('channel report maps experimental to latest and stable to stable', () => {
  const channels = channelReport(parseReleaseChannelConfig(source), 'https://example.test/game/');
  assert.deepEqual(channels.map(({ role, passNumber: number }) => [role, number]), [['latest', 64], ['stable', 63]]);
  assert.equal(channels[0].url, 'https://example.test/game/channels/live/?release=latest');
});

test('malformed release config is rejected', () => {
  assert.throws(() => parseReleaseChannelConfig('window.nope = {};'), /Could not locate/);
});
