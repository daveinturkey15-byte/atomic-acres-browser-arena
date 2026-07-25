import {
  MATCH_DIAGNOSTIC_MAX_BODY_BYTES,
  validateMatchDiagnosticEnvelope,
  type MatchDiagnosticUploadEnvelope,
} from '../shared/match-diagnostics-schema';

export const MATCH_DIAGNOSTICS_ENDPOINT = (import.meta.env.VITE_MATCH_DIAGNOSTICS_URL ?? '').trim().replace(/\/$/, '');
export const MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY = 'atomic-acres:completed-match-diagnostic-queue:v1';
export const MATCH_DIAGNOSTICS_QUEUE_LIMIT = 4;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type BeaconLike = (url: string | URL, data?: BodyInit | null) => boolean;

type QueueDocument = Readonly<{
  schemaVersion: 1;
  items: readonly MatchDiagnosticUploadEnvelope[];
}>;

export type MatchDiagnosticUploadTelemetry = Readonly<{
  activeMatch: boolean;
  endpointConfigured: boolean;
  pending: number;
  attempted: number;
  delivered: number;
  requestsDuringActiveMatch: number;
  lastDelivery: 'none' | 'beacon' | 'fetch' | 'queued';
  lastEnvelopeBytes: number;
  lastMatchId: string | null;
}>;

function readQueue(storage: StorageLike | undefined): MatchDiagnosticUploadEnvelope[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueDocument;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items
      .map((item) => validateMatchDiagnosticEnvelope(item).envelope)
      .filter((item): item is MatchDiagnosticUploadEnvelope => item !== null)
      .slice(-MATCH_DIAGNOSTICS_QUEUE_LIMIT);
  } catch {
    return [];
  }
}

function writeQueue(storage: StorageLike | undefined, items: readonly MatchDiagnosticUploadEnvelope[]): void {
  if (!storage) return;
  try {
    if (items.length === 0) storage.removeItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY);
    else storage.setItem(MATCH_DIAGNOSTICS_QUEUE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: items.slice(-MATCH_DIAGNOSTICS_QUEUE_LIMIT) }));
  } catch {
    // Delivery remains best-effort when persistent storage is unavailable.
  }
}

export class MatchDiagnosticUploader {
  private activeMatch = false;
  private queue: MatchDiagnosticUploadEnvelope[];
  private flushing: Promise<number> | null = null;
  private attempted = 0;
  private delivered = 0;
  private requestsDuringActiveMatch = 0;
  private lastDelivery: MatchDiagnosticUploadTelemetry['lastDelivery'] = 'none';
  private lastEnvelopeBytes = 0;
  private lastMatchId: string | null = null;

  constructor(
    private readonly endpoint = MATCH_DIAGNOSTICS_ENDPOINT,
    private readonly storage: StorageLike | undefined = globalThis.localStorage,
    private readonly fetcher: FetchLike = globalThis.fetch.bind(globalThis),
    private readonly beacon: BeaconLike | undefined = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator),
  ) {
    this.queue = readQueue(storage);
  }

  beginMatch(): void {
    this.activeMatch = true;
  }

  async completeMatch(envelope: MatchDiagnosticUploadEnvelope): Promise<number> {
    this.activeMatch = false;
    const validated = validateMatchDiagnosticEnvelope(envelope);
    if (!validated.envelope) throw new Error(`Refused invalid completed-match diagnostic: ${validated.error}`);
    const serialized = JSON.stringify(validated.envelope);
    this.lastEnvelopeBytes = new TextEncoder().encode(serialized).byteLength;
    this.lastMatchId = validated.envelope.matchId;
    if (this.lastEnvelopeBytes > MATCH_DIAGNOSTIC_MAX_BODY_BYTES) throw new Error('Refused oversized completed-match diagnostic');
    if (!this.endpoint) return 0;
    this.queue = [
      ...this.queue.filter((item) => item.idempotencyKey !== validated.envelope?.idempotencyKey),
      validated.envelope,
    ].slice(-MATCH_DIAGNOSTICS_QUEUE_LIMIT);
    writeQueue(this.storage, this.queue);
    this.lastDelivery = 'queued';
    return this.flushPending();
  }

  abandonActiveMatch(): void {
    this.activeMatch = false;
  }

  flushPending(): Promise<number> {
    if (this.activeMatch || !this.endpoint || this.queue.length === 0) return Promise.resolve(0);
    if (this.flushing) return this.flushing;
    this.flushing = this.flushQueue().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  flushForPageLifecycle(): number {
    if (this.activeMatch || !this.endpoint || this.queue.length === 0) return 0;
    let queued = 0;
    for (const envelope of this.queue) {
      const json = JSON.stringify(envelope);
      this.attempted += 1;
      if (!this.tryBeacon(json)) break;
      queued += 1;
      this.lastDelivery = 'beacon';
    }
    // sendBeacon only confirms that the browser accepted the request for
    // delivery. Keep each envelope until a later receipt-bearing fetch proves
    // that the collector stored it; the idempotency key makes retries safe.
    writeQueue(this.storage, this.queue);
    return queued;
  }

  telemetry(): MatchDiagnosticUploadTelemetry {
    return {
      activeMatch: this.activeMatch,
      endpointConfigured: Boolean(this.endpoint),
      pending: this.queue.length,
      attempted: this.attempted,
      delivered: this.delivered,
      requestsDuringActiveMatch: this.requestsDuringActiveMatch,
      lastDelivery: this.lastDelivery,
      lastEnvelopeBytes: this.lastEnvelopeBytes,
      lastMatchId: this.lastMatchId,
    };
  }

  private tryBeacon(json: string): boolean {
    if (!this.beacon) return false;
    try {
      return this.beacon(`${this.endpoint}/v1/match-diagnostics`, new Blob([json], { type: 'text/plain;charset=UTF-8' }));
    } catch {
      return false;
    }
  }

  private async flushQueue(): Promise<number> {
    let delivered = 0;
    while (this.queue.length > 0) {
      if (this.activeMatch) {
        this.requestsDuringActiveMatch += 1;
        break;
      }
      const envelope = this.queue[0];
      const json = JSON.stringify(envelope);
      this.attempted += 1;
      try {
        const response = await this.fetcher(`${this.endpoint}/v1/match-diagnostics`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json' },
          body: json,
          credentials: 'omit',
          keepalive: true,
        });
        if (!response.ok) break;
        const receipt = await response.json() as { accepted?: unknown; receiptId?: unknown };
        if (receipt.accepted !== true || typeof receipt.receiptId !== 'string') break;
        this.queue.shift();
        this.delivered += 1;
        delivered += 1;
        this.lastDelivery = 'fetch';
        writeQueue(this.storage, this.queue);
      } catch {
        break;
      }
    }
    return delivered;
  }
}
