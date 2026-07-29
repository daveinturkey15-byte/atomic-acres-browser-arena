import { describe, expect, it } from 'vitest';
import {
  PresentationSchedulingLifecycle,
  presentationSchedulingMode,
  type PresentationSchedulingInput,
} from './presentation-scheduling-lifecycle';

const foreground = (patch: Partial<PresentationSchedulingInput> = {}): PresentationSchedulingInput => ({
  pageVisible: true,
  windowFocused: true,
  presentationRequested: true,
  hostedAuthority: false,
  networkConnected: false,
  ...patch,
});

describe('presentation scheduling lifecycle', () => {
  it('classifies ineligible clients without granting presentation work', () => {
    expect(presentationSchedulingMode(foreground({ pageVisible: false }))).toBe('paused-offline');
    expect(presentationSchedulingMode(foreground({ windowFocused: false, networkConnected: true }))).toBe('network-only');
    expect(presentationSchedulingMode(foreground({ pageVisible: false, hostedAuthority: true, networkConnected: true })))
      .toBe('hosted-authority-network');
  });

  it('coalesces visibility and focus recovery into one generation', () => {
    const lifecycle = new PresentationSchedulingLifecycle(foreground());
    const hidden = lifecycle.observe(foreground({ pageVisible: false, windowFocused: false }), 'visibility hidden');
    expect(hidden.leftForeground).toBe(true);
    expect(hidden.recoveryCount).toBe(0);

    const visibleButBlurred = lifecycle.observe(foreground({ pageVisible: true, windowFocused: false }), 'visibility visible');
    expect(visibleButBlurred.resumedForeground).toBe(false);

    const focused = lifecycle.observe(foreground(), 'window focus regained');
    expect(focused.resumedForeground).toBe(true);
    expect(focused.recoveryGeneration).toBe(1);

    const duplicateFocus = lifecycle.observe(foreground(), 'duplicate focus');
    expect(duplicateFocus.resumedForeground).toBe(false);
    expect(duplicateFocus.recoveryCount).toBe(1);
  });

  it('does not recover when a hosted background mode merely changes network classification', () => {
    const lifecycle = new PresentationSchedulingLifecycle(foreground({ pageVisible: false, hostedAuthority: true, networkConnected: true }));
    const networkOnly = lifecycle.observe(
      foreground({ pageVisible: false, hostedAuthority: false, networkConnected: true }),
      'host authority transferred',
    );
    expect(networkOnly.mode).toBe('network-only');
    expect(networkOnly.recoveryCount).toBe(0);
  });
});
