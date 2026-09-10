/** Diagnostic-only identity. Never used to admit or mutate a reload. */
export type ReloadProtocolTraceInput = Readonly<{
  direction: 'send' | 'receive' | 'cache-hit' | 'admit' | 'commit' | 'clear';
  actorId: string;
  requestId: string;
  action: 'start' | 'cancel' | 'result';
  status: string;
  reason: string;
  actionSequence: number;
  /** Identity of the actual message, cached result, or cleared pending record. */
  lifeId: number;
  connectionEpoch: string;
  /** Original local pending identity, separate from an emitted retry's identity. */
  requestLifeId?: number;
  requestConnectionEpoch?: string;
  /** Cached result sequence; the existing actionSequence describes its trigger. */
  resultActionSequence?: number;
}>;

export function captureReloadProtocolTrace(
  input: ReloadProtocolTraceInput, role: string, atMs: number, matchEpoch: number,
) {
  return Object.freeze({
    ...input, role, atMs: Math.round(atMs), matchEpoch,
    // Reload wire messages do not carry a match epoch. This is the observing
    // runtime's epoch at the event, never a fabricated request-authored epoch.
    matchEpochSemantics: 'event-at-record' as const,
  });
}

export type ReloadProtocolTrace = ReturnType<typeof captureReloadProtocolTrace>;
