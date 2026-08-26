import { createRandomStreams, type RandomStreams } from './deterministic-rng';

let streams: RandomStreams = createRandomStreams('atomic-acres-unconfigured');
let configuredSeed = 'atomic-acres-unconfigured';

export function configureRuntimeRandom(seed: number | string): void {
  configuredSeed = String(seed);
  streams = createRandomStreams(seed);
}

export function gameplayRandom(): number {
  return streams.gameplay.next();
}

export function presentationRandom(): number {
  return streams.presentation.next();
}

export function protocolRandom(): number {
  return streams.protocol.next();
}

export function runtimeRandomTelemetry(): { seed: string; gameplayState: number; presentationState: number; protocolState: number } {
  return {
    seed: configuredSeed,
    gameplayState: streams.gameplay.snapshot(),
    presentationState: streams.presentation.snapshot(),
    protocolState: streams.protocol.snapshot(),
  };
}

export function runtimeSeed(search: string, cryptoSource: Pick<Crypto, 'getRandomValues'> | undefined = globalThis.crypto): string | number {
  const requested = new URLSearchParams(search).get('seed')?.trim();
  if (requested) return requested;
  if (cryptoSource) {
    const values = new Uint32Array(2);
    cryptoSource.getRandomValues(values);
    return `${values[0].toString(36)}-${values[1].toString(36)}`;
  }
  return Date.now();
}
