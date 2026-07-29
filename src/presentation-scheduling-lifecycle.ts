export type PresentationSchedulingMode =
  | 'foreground-presentation'
  | 'hosted-authority-network'
  | 'network-only'
  | 'paused-offline';

export type PresentationSchedulingInput = Readonly<{
  pageVisible: boolean;
  windowFocused: boolean;
  presentationRequested: boolean;
  hostedAuthority: boolean;
  networkConnected: boolean;
}>;

export type PresentationSchedulingDecision = Readonly<{
  mode: PresentationSchedulingMode;
  previousMode: PresentationSchedulingMode;
  changed: boolean;
  leftForeground: boolean;
  resumedForeground: boolean;
  recoveryGeneration: number;
  transitionCount: number;
  recoveryCount: number;
  reason: string;
}>;

export function presentationSchedulingMode(input: PresentationSchedulingInput): PresentationSchedulingMode {
  if (input.pageVisible && input.windowFocused && input.presentationRequested) {
    return 'foreground-presentation';
  }
  if (input.hostedAuthority) return 'hosted-authority-network';
  if (input.networkConnected) return 'network-only';
  return 'paused-offline';
}

/**
 * Coalesces browser visibility and focus notifications into one eligibility
 * transition. Browsers may deliver both events for a single tab switch; only
 * the false -> true foreground edge owns pacing/audio/input recovery.
 */
export class PresentationSchedulingLifecycle {
  private mode: PresentationSchedulingMode;
  private recoveryGeneration = 0;
  private transitionCount = 0;
  private recoveryCount = 0;
  private lastReason = 'initial';

  constructor(initial: PresentationSchedulingInput) {
    this.mode = presentationSchedulingMode(initial);
  }

  observe(input: PresentationSchedulingInput, reason: string): PresentationSchedulingDecision {
    const previousMode = this.mode;
    const mode = presentationSchedulingMode(input);
    const changed = mode !== previousMode;
    const leftForeground = previousMode === 'foreground-presentation' && mode !== previousMode;
    const resumedForeground = mode === 'foreground-presentation' && previousMode !== mode;
    if (changed) {
      this.mode = mode;
      this.transitionCount += 1;
      this.lastReason = reason;
    }
    if (resumedForeground) {
      this.recoveryGeneration += 1;
      this.recoveryCount += 1;
    }
    return Object.freeze({
      mode,
      previousMode,
      changed,
      leftForeground,
      resumedForeground,
      recoveryGeneration: this.recoveryGeneration,
      transitionCount: this.transitionCount,
      recoveryCount: this.recoveryCount,
      reason: changed ? reason : this.lastReason,
    });
  }

  snapshot(): Readonly<{
    mode: PresentationSchedulingMode;
    recoveryGeneration: number;
    transitionCount: number;
    recoveryCount: number;
    lastReason: string;
  }> {
    return Object.freeze({
      mode: this.mode,
      recoveryGeneration: this.recoveryGeneration,
      transitionCount: this.transitionCount,
      recoveryCount: this.recoveryCount,
      lastReason: this.lastReason,
    });
  }
}
