import { mkdir, writeFile } from 'node:fs/promises';
import { memoryUsage } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { NETWORK_IMPAIRMENT_PROFILES, impairNetworkEvents, type NetworkEvent } from '../../src/network-chaos';
import { admitRemoteShot, createRemoteShotAdmissionState } from '../../src/remote-shot-admission';
import type { PlayerSnapshot, ShotMessage } from '../../src/protocol';

const durationMs = Number(process.env.QA_NETWORK_SOAK_MS ?? 1_800_000);
const pauseMs = Number(process.env.QA_NETWORK_SOAK_PAUSE_MS ?? 50);
if (!Number.isFinite(durationMs) || durationMs < 30_000) throw new Error('QA_NETWORK_SOAK_MS must be at least 30000');
if (!Number.isFinite(pauseMs) || pauseMs < 1 || pauseMs > 1_000) throw new Error('QA_NETWORK_SOAK_PAUSE_MS must be from 1 through 1000');
const profile = NETWORK_IMPAIRMENT_PROFILES.adverse;
const sender: PlayerSnapshot = {
  id: 'peer', name: 'Peer', team: 1,
  x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0,
  hp: 100, kills: 0, deaths: 0,
  primary: 'carbine', weapon: 'carbine', stance: 'stand', seq: 1,
};
const source: NetworkEvent<ShotMessage>[] = Array.from({ length: 100 }, (_, index) => ({
  id: `shot-${index}`,
  sentAt: index * 100,
  payload: { type: 'shot', by: sender.id, nonce: index + 1, weapon: 'carbine', origin: [0, 1.7, 0], direction: [0, 0, -1] },
}));

async function main(): Promise<void> {
  const startedAt = Date.now();
  const initialRssBytes = memoryUsage().rss;
  let maxRssBytes = initialRssBytes;
  let iterations = 0;
  let totalDeliveries = 0;
  let totalAccepted = 0;
  let duplicateSideEffects = 0;
  const samples: Array<{ elapsedMs: number; rssBytes: number; iterations: number }> = [];

  while (Date.now() - startedAt < durationMs) {
    const delivered = impairNetworkEvents(source, profile, `pass25a-adverse-soak-${iterations}`);
    totalDeliveries += delivered.length;
    let state = createRemoteShotAdmissionState();
    const accepted = new Set<number>();
    for (const delivery of delivered) {
      const result = admitRemoteShot(delivery.payload, sender, delivery.arrivesAt, state);
      if (!result.accepted) continue;
      state = result.nextState;
      if (accepted.has(delivery.payload.nonce)) duplicateSideEffects += 1;
      accepted.add(delivery.payload.nonce);
    }
    if (accepted.size === 0) throw new Error(`adverse soak iteration ${iterations} accepted zero shots`);
    totalAccepted += accepted.size;
    iterations += 1;

    if (iterations % Math.max(1, Math.round(1_000 / pauseMs)) === 0) {
      const rssBytes = memoryUsage().rss;
      maxRssBytes = Math.max(maxRssBytes, rssBytes);
      samples.push({ elapsedMs: Date.now() - startedAt, rssBytes, iterations });
    }
    await delay(pauseMs);
  }

  const elapsedMs = Date.now() - startedAt;
  const finalRssBytes = memoryUsage().rss;
  maxRssBytes = Math.max(maxRssBytes, finalRssBytes);
  const result = {
    kind: 'deterministic authority-layer impairment soak',
    profile: 'adverse',
    requestedDurationMs: durationMs,
    elapsedMs,
    iterations,
    sourceEventsPerIteration: source.length,
    totalDeliveries,
    totalAccepted,
    duplicateSideEffects,
    initialRssBytes,
    finalRssBytes,
    maxRssBytes,
    rssGrowthBytes: finalRssBytes - initialRssBytes,
    acceptanceRatio: totalDeliveries === 0 ? 0 : totalAccepted / totalDeliveries,
    samples,
  };
  await mkdir('artifacts/pass25a', { recursive: true });
  await writeFile('artifacts/pass25a/network-chaos-soak.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (iterations < 1 || totalDeliveries < 1 || totalAccepted < 1 || result.acceptanceRatio < 0.4
    || duplicateSideEffects !== 0 || totalAccepted > source.length * iterations
    || result.rssGrowthBytes > 128 * 1024 * 1024) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
