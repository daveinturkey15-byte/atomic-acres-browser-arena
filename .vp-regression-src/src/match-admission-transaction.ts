export type MatchAdmissionMode = 'solo' | 'host' | 'client';
export type MatchAdmissionRole = 'offline' | 'host' | 'client';
export type MatchAdmissionLobbyPhase = 'waiting' | 'countdown' | 'active' | 'ended' | null;

export type MatchAdmissionIdentity = Readonly<{
  mode: MatchAdmissionMode;
  role: MatchAdmissionRole;
  arenaId: string;
  roomCode: string;
  connectionEpoch: string;
  lobbyRevision: number | null;
  lobbyPhase: MatchAdmissionLobbyPhase;
  activeAtHostTimeMs: number | null;
  activeAtEpochMs: number | null;
}>;

export type MatchAdmissionToken = MatchAdmissionIdentity & Readonly<{
  generation: number;
  signal: AbortSignal;
}>;

export type MatchAdmissionResult = Readonly<
  | { status: 'admitted'; generation: number }
  | { status: 'superseded'; generation: number; reason: string }
  | { status: 'failed'; generation: number; error: Error }
>;

export type MatchAdmissionBegin = Readonly<{
  token: MatchAdmissionToken;
  started: boolean;
  replacedGeneration: number | null;
}>;

export class MatchAdmissionSupersededError extends Error {
  readonly generation: number;

  constructor(generation: number, reason: string) {
    super(reason);
    this.name = 'MatchAdmissionSupersededError';
    this.generation = generation;
  }
}

function carriesLiveStartAuthority(identity: MatchAdmissionIdentity): boolean {
  return (identity.lobbyPhase === 'countdown' || identity.lobbyPhase === 'active')
    && identity.activeAtHostTimeMs !== null
    && identity.activeAtEpochMs !== null;
}

export function sameMatchAdmissionAuthority(left: MatchAdmissionIdentity, right: MatchAdmissionIdentity): boolean {
  const sameStableAuthority = left.mode === right.mode
    && left.role === right.role
    && left.arenaId === right.arenaId
    && left.roomCode === right.roomCode
    && left.connectionEpoch === right.connectionEpoch
    && left.activeAtHostTimeMs === right.activeAtHostTimeMs
    && left.activeAtEpochMs === right.activeAtEpochMs;
  if (!sameStableAuthority) return false;
  if (left.lobbyRevision === right.lobbyRevision && left.lobbyPhase === right.lobbyPhase) return true;
  // Ping, score, ready-state and other lobby telemetry can advance the lobby
  // revision while a cold arena is still preparing. Once the host has authored
  // the same non-waiting start clocks, those revision/phase updates describe
  // the same admission rather than a new authority generation.
  return carriesLiveStartAuthority(left) && carriesLiveStartAuthority(right);
}

function frozenIdentity(identity: MatchAdmissionIdentity): MatchAdmissionIdentity {
  return Object.freeze({
    ...identity,
    roomCode: identity.roomCode.trim(),
  });
}

export class MatchAdmissionCoordinator {
  private generation = 0;
  private current: Readonly<{ token: MatchAdmissionToken; abort: AbortController }> | null = null;

  begin(identityValue: MatchAdmissionIdentity): MatchAdmissionBegin {
    const identity = frozenIdentity(identityValue);
    const current = this.current;
    if (current && !current.token.signal.aborted && sameMatchAdmissionAuthority(current.token, identity)) {
      return Object.freeze({ token: current.token, started: false, replacedGeneration: null });
    }
    const replacedGeneration = current?.token.generation ?? null;
    if (current) this.abortOwned(current, 'Replaced by a newer match admission');
    const abort = new AbortController();
    this.generation += 1;
    const token = Object.freeze({
      ...identity,
      generation: this.generation,
      signal: abort.signal,
    });
    this.current = Object.freeze({ token, abort });
    return Object.freeze({ token, started: true, replacedGeneration });
  }

  token(): MatchAdmissionToken | null {
    return this.current?.token ?? null;
  }

  owns(token: MatchAdmissionToken): boolean {
    return this.current?.token === token && !token.signal.aborted;
  }

  assertCurrent(token: MatchAdmissionToken, observed?: MatchAdmissionIdentity): void {
    if (!this.owns(token)) {
      const reason = token.signal.reason;
      if (reason instanceof MatchAdmissionSupersededError) throw reason;
      throw new MatchAdmissionSupersededError(token.generation, 'Match admission no longer owns the current generation');
    }
    if (!observed || sameMatchAdmissionAuthority(token, frozenIdentity(observed))) return;
    this.invalidate('Match admission authority changed while preparation was pending');
    throw new MatchAdmissionSupersededError(token.generation, 'Match admission authority changed while preparation was pending');
  }

  invalidate(reason: string): MatchAdmissionToken | null {
    const current = this.current;
    if (!current) return null;
    this.abortOwned(current, reason);
    return current.token;
  }

  complete(token: MatchAdmissionToken): boolean {
    if (!this.owns(token)) return false;
    this.current = null;
    return true;
  }

  private abortOwned(
    owned: Readonly<{ token: MatchAdmissionToken; abort: AbortController }>,
    reason: string,
  ): void {
    if (this.current !== owned) return;
    this.current = null;
    owned.abort.abort(new MatchAdmissionSupersededError(owned.token.generation, reason));
  }
}

export function isMatchAdmissionSuperseded(error: unknown): error is MatchAdmissionSupersededError {
  return error instanceof MatchAdmissionSupersededError
    || typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError';
}

export function matchAdmissionResult(
  token: MatchAdmissionToken,
  outcome: 'admitted' | 'superseded' | 'failed',
  detail?: string | Error,
): MatchAdmissionResult {
  if (outcome === 'admitted') return Object.freeze({ status: 'admitted', generation: token.generation });
  if (outcome === 'superseded') {
    return Object.freeze({
      status: 'superseded',
      generation: token.generation,
      reason: typeof detail === 'string' ? detail : detail?.message ?? 'Match admission was superseded',
    });
  }
  return Object.freeze({
    status: 'failed',
    generation: token.generation,
    error: detail instanceof Error ? detail : new Error(detail ?? 'Match admission failed'),
  });
}
