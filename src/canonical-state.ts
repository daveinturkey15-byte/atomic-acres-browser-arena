function normalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical state cannot contain non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  throw new TypeError(`Unsupported canonical state value: ${typeof value}`);
}

export function stableStringify(value: unknown, spacing = 0): string {
  return JSON.stringify(normalize(value), null, spacing);
}

/** Browser-safe FNV-1a 64-bit digest for deterministic regression fixtures. */
export function canonicalStateHash(value: unknown): string {
  const bytes = new TextEncoder().encode(stableStringify(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
