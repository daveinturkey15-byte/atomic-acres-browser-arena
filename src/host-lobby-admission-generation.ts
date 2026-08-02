export type HostLobbyAdmissionAttempt = Readonly<{
  generation: number;
  playerId: string;
  connectionEpoch: string;
}>;

export type HostLobbyAdmissionScope = Readonly<{
  role: 'host' | 'client' | 'offline';
  generation: number;
  currentAttempt: HostLobbyAdmissionAttempt | undefined;
  queuedConnectionEpoch: string | undefined;
}>;

/** A digest/admission continuation may mutate lobby authority only while it
 * still owns both the host-session generation and the exact application-level
 * connection epoch. A queued newer epoch invalidates it before the next await
 * continuation can publish a digest or promote transport traffic. */
export function hostLobbyAdmissionAttemptIsCurrent(
  attempt: HostLobbyAdmissionAttempt,
  scope: HostLobbyAdmissionScope,
): boolean {
  return scope.role === 'host'
    && scope.generation === attempt.generation
    && scope.currentAttempt === attempt
    && (!scope.queuedConnectionEpoch || scope.queuedConnectionEpoch === attempt.connectionEpoch);
}
