export type Pass70AudioEvidenceInput = Readonly<{
  engine: string;
  harness: string;
  hostPlatform: NodeJS.Platform;
  gameContext: Readonly<Record<string, unknown>>;
  audioListenerMode: string;
  listenerCapabilities: Readonly<Record<string, unknown>>;
}>;

export type Pass70AudioEvidence = Readonly<{
  schema: 'atomic-acres/pass70-browser-audio-evidence@1';
  verdict: 'PASS' | 'FAIL';
  evidenceClass: 'full-web-audio' | 'playable-degraded-no-audio' | 'invalid';
  engine: string | null;
  harness: string | null;
  hostPlatform: NodeJS.Platform | null;
  coverage: Readonly<{
    webAudio: boolean;
    playableWithoutAudio: boolean;
    nativeSafariAudio: false;
  }>;
  qualification: string;
  residual: string | null;
  expectedListenerMode: 'modern-audio-param' | 'legacy-setters' | 'hybrid' | 'unavailable';
  failures: readonly string[];
}>;

export function pass70ListenerPoseModeFromCapabilities(
  capabilities: Readonly<Record<string, any>>,
): Pass70AudioEvidence['expectedListenerMode'];

export function evaluatePass70BrowserAudioEvidence(
  input: Pass70AudioEvidenceInput,
): Pass70AudioEvidence;
