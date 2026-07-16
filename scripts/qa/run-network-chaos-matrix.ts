import { mkdir, writeFile } from 'node:fs/promises';
import { NETWORK_IMPAIRMENT_PROFILES, impairNetworkEvents, type NetworkEvent } from '../../src/network-chaos';
import { admitRemoteShot, createRemoteShotAdmissionState } from '../../src/remote-shot-admission';
import type { PlayerSnapshot, ShotMessage } from '../../src/protocol';

const MIN_ACCEPTANCE_RATIO: Readonly<Record<keyof typeof NETWORK_IMPAIRMENT_PROFILES, number>> = {
  clean: 1,
  normal: 0.7,
  adverse: 0.4,
};

async function main(): Promise<void> {
  const seedsPerProfile = Number(process.env.QA_CHAOS_SEEDS ?? 1_000);
  if (!Number.isSafeInteger(seedsPerProfile) || seedsPerProfile < 1 || seedsPerProfile > 100_000) {
    throw new Error(`QA_CHAOS_SEEDS must be an integer from 1 through 100000; received ${process.env.QA_CHAOS_SEEDS ?? '(default)'}`);
  }

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
  if (source.length === 0) throw new Error('network-chaos source fixture must not be empty');

  const report = [];
  const failures: string[] = [];
  for (const [profileName, profile] of Object.entries(NETWORK_IMPAIRMENT_PROFILES) as Array<[
    keyof typeof NETWORK_IMPAIRMENT_PROFILES,
    (typeof NETWORK_IMPAIRMENT_PROFILES)[keyof typeof NETWORK_IMPAIRMENT_PROFILES],
  ]>) {
    let totalDeliveries = 0;
    let totalUniqueDeliveries = 0;
    let totalAccepted = 0;
    let duplicateSideEffects = 0;
    let maxArrivalMs = 0;
    for (let seed = 0; seed < seedsPerProfile; seed += 1) {
      const delivered = impairNetworkEvents(source, profile, `${profileName}-${seed}`);
      if (delivered.length === 0) failures.push(`${profileName}/${seed}: impairment delivered zero events`);
      totalDeliveries += delivered.length;
      const uniqueDelivered = new Set(delivered.map((event) => event.payload.nonce));
      totalUniqueDeliveries += uniqueDelivered.size;
      for (const event of delivered) maxArrivalMs = Math.max(maxArrivalMs, event.arrivesAt);
      let state = createRemoteShotAdmissionState();
      const accepted = new Set<number>();
      for (const delivery of delivered) {
        const result = admitRemoteShot(delivery.payload, sender, delivery.arrivesAt, state);
        if (!result.accepted) continue;
        state = result.nextState;
        if (accepted.has(delivery.payload.nonce)) duplicateSideEffects += 1;
        accepted.add(delivery.payload.nonce);
      }
      if (accepted.size === 0) failures.push(`${profileName}/${seed}: receiver accepted zero shots`);
      if (accepted.size > uniqueDelivered.size) failures.push(`${profileName}/${seed}: accepted more unique shots than transport delivered`);
      totalAccepted += accepted.size;
    }

    const acceptanceRatio = totalUniqueDeliveries === 0 ? 0 : totalAccepted / totalUniqueDeliveries;
    const entry = {
      profileName,
      seeds: seedsPerProfile,
      sourceEvents: source.length * seedsPerProfile,
      totalDeliveries,
      totalUniqueDeliveries,
      totalAccepted,
      acceptanceRatio,
      duplicateSideEffects,
      maxArrivalMs,
    };
    report.push(entry);

    if (duplicateSideEffects !== 0) failures.push(`${profileName}: duplicate side effects=${duplicateSideEffects}`);
    if (!Number.isFinite(maxArrivalMs) || maxArrivalMs <= 0) failures.push(`${profileName}: invalid maximum arrival ${maxArrivalMs}`);
    if (acceptanceRatio + Number.EPSILON < MIN_ACCEPTANCE_RATIO[profileName]) {
      failures.push(`${profileName}: acceptance ratio ${acceptanceRatio.toFixed(4)} below ${MIN_ACCEPTANCE_RATIO[profileName].toFixed(4)}`);
    }
    if (profileName === 'clean') {
      const expected = source.length * seedsPerProfile;
      if (totalDeliveries !== expected || totalUniqueDeliveries !== expected || totalAccepted !== expected) {
        failures.push(`clean: expected ${expected} delivered/unique/accepted, got ${totalDeliveries}/${totalUniqueDeliveries}/${totalAccepted}`);
      }
    }
  }

  await mkdir('artifacts/pass25a', { recursive: true });
  await writeFile('artifacts/pass25a/network-chaos-matrix.json', `${JSON.stringify({ report, failures }, null, 2)}\n`);
  console.log(JSON.stringify({ report, failures }, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
