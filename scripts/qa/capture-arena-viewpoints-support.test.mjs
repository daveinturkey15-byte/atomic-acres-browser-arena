import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stopPreviewServer,
  waitForReviewCameraRegistry,
} from './capture-arena-viewpoints-support.mjs';

test('review-camera wait polls the QA registry and returns the populated state', async () => {
  const states = [
    { loadedArenaIds: [], cameraIdsByArena: {} },
    { loadedArenaIds: ['nuketown2'], cameraIdsByArena: { nuketown2: ['north', 'south'] } },
  ];
  let reads = 0;
  const result = await waitForReviewCameraRegistry(
    async () => { reads += 1; return states[Math.min(reads - 1, states.length - 1)]; },
    {
      arena: 'nuketown2',
      cameraIds: ['north', 'south'],
      pollMs: 0,
      sleepImpl: async () => {},
    },
  );
  assert.equal(reads, 2);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.state, states[1]);
});

test('review-camera wait fails with the last registry state when the bounded wait expires', async () => {
  let now = 0;
  await assert.rejects(
    () => waitForReviewCameraRegistry(
      async () => ({ loadedArenaIds: [], cameraIdsByArena: {} }),
      {
        arena: 'nuketown2',
        cameraIds: ['north'],
        timeoutMs: 10,
        pollMs: 5,
        sleepImpl: async (ms) => { now += ms; },
        nowImpl: () => now,
      },
    ),
    /review camera registry for 'nuketown2' did not populate within 10 ms; state=/u,
  );
});

test('preview teardown kills the port LISTENING pid and proves the port is closed', async () => {
  const listeningPids = [9021, null];
  const killed = [];
  let childKillCalls = 0;
  const result = await stopPreviewServer({
    port: 4221,
    child: { pid: 9021, killed: false, kill: () => { childKillCalls += 1; } },
    platform: 'linux',
    findListeningPidImpl: async () => listeningPids.shift(),
    killImpl: (pid, signal) => { killed.push({ pid, signal }); },
    sleepImpl: async () => {},
  });
  assert.deepEqual(killed, [{ pid: 9021, signal: 'SIGTERM' }]);
  assert.equal(childKillCalls, 0, 'the tracked direct child is the listener and needs no second signal');
  assert.equal(result.closed, true);
});
