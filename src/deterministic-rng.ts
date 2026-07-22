const UINT32_RANGE = 0x1_0000_0000;

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return mix32(hash);
}

/** Deterministic PRNG for replayable simulation/tests. It is not suitable for security tokens. */
export class DeterministicRng {
  private state: number;
  private readonly origin: number;

  constructor(seed: number | string) {
    this.origin = typeof seed === 'string' ? seedFromString(seed) : mix32(seed);
    this.state = this.origin;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  snapshot(): number {
    return this.state >>> 0;
  }

  fork(label: string): DeterministicRng {
    return new DeterministicRng(mix32(this.origin ^ seedFromString(label)));
  }
}

export type RandomStreams = {
  gameplay: DeterministicRng;
  presentation: DeterministicRng;
  protocol: DeterministicRng;
};

/** Keeps cosmetic and transport randomness from perturbing gameplay/replay randomness. */
export function createRandomStreams(seed: number | string): RandomStreams {
  const root = new DeterministicRng(seed);
  return {
    gameplay: root.fork('gameplay'),
    presentation: root.fork('presentation'),
    protocol: root.fork('protocol'),
  };
}
