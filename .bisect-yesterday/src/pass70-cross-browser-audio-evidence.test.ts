import { describe, expect, it } from 'vitest';
import {
  evaluatePass70BrowserAudioEvidence,
  pass70ListenerPoseModeFromCapabilities,
} from '../scripts/qa/pass70-cross-browser-audio-evidence-contract.mjs';

const modernProperties = Object.fromEntries([
  'positionX', 'positionY', 'positionZ',
  'forwardX', 'forwardY', 'forwardZ',
  'upX', 'upY', 'upZ',
].map((name) => [name, { propertyType: 'object', valueType: 'number' }]));

function evidence(overrides: Record<string, unknown> = {}) {
  const gameContext = { source: 'standard', state: 'running' };
  return evaluatePass70BrowserAudioEvidence({
    engine: 'chromium',
    harness: 'playwright-chromium',
    hostPlatform: 'win32',
    gameContext,
    audioListenerMode: 'modern-audio-param',
    listenerCapabilities: {
      gameContext,
      constructorSource: 'standard',
      probeContextState: 'running',
      properties: modernProperties,
      methods: { setPosition: 'undefined', setOrientation: 'undefined' },
    },
    ...overrides,
  });
}

describe('Pass 70 browser audio evidence contract', () => {
  it('accepts a running runtime only when the independent constructor and listener probes agree', () => {
    const result = evidence();
    expect(result).toMatchObject({
      verdict: 'PASS', evidenceClass: 'full-web-audio',
      coverage: { webAudio: true, playableWithoutAudio: false, nativeSafariAudio: false },
    });
    expect(result.failures).toEqual([]);
    expect(pass70ListenerPoseModeFromCapabilities({
      properties: {}, methods: { setPosition: 'function', setOrientation: 'function' },
    })).toBe('legacy-setters');
  });

  it('allows exact no-audio only as explicitly degraded Windows Playwright WebKit playability evidence', () => {
    const gameContext = { source: 'unavailable', state: 'unavailable' };
    const result = evidence({
      engine: 'webkit',
      harness: 'playwright-webkit',
      gameContext,
      audioListenerMode: 'unavailable',
      listenerCapabilities: {
        gameContext,
        constructorSource: 'unavailable',
        probeContextState: 'unavailable',
        properties: {},
        methods: {},
      },
    });
    expect(result).toMatchObject({
      verdict: 'PASS', evidenceClass: 'playable-degraded-no-audio',
      coverage: { webAudio: false, playableWithoutAudio: true, nativeSafariAudio: false },
    });
    expect(result.qualification).toMatch(/playability only/u);
    expect(result.residual).toMatch(/Native Safari.*iPhone 15\+.*external HITL/u);
  });

  it('rejects unavailable audio outside the narrow Windows Playwright WebKit exception', () => {
    const gameContext = { source: 'unavailable', state: 'unavailable' };
    const unavailable = {
      gameContext,
      constructorSource: 'unavailable',
      probeContextState: 'unavailable',
      properties: {},
      methods: {},
    };
    for (const mutation of [
      { engine: 'chromium', harness: 'playwright-chromium', hostPlatform: 'win32' as const },
      { engine: 'webkit', harness: 'playwright-webkit', hostPlatform: 'linux' as const },
      { engine: 'webkit', harness: 'native-safari', hostPlatform: 'darwin' as const },
    ]) {
      const result = evidence({
        ...mutation,
        gameContext,
        audioListenerMode: 'unavailable',
        listenerCapabilities: unavailable,
      });
      expect(result.verdict).toBe('FAIL');
      expect(result.evidenceClass).toBe('invalid');
      expect(result.failures.join('\n')).toMatch(/allowed only/u);
      expect(result.coverage.nativeSafariAudio).toBe(false);
    }
  });

  it('rejects every available-but-failed or inconsistent context mutation', () => {
    const failedContext = { source: 'failed', state: 'failed' };
    const unavailableContext = { source: 'unavailable', state: 'unavailable' };
    const mutations = [
      {
        gameContext: failedContext,
        audioListenerMode: 'modern-audio-param',
        listenerCapabilities: {
          gameContext: failedContext, constructorSource: 'standard', probeContextState: 'running',
          properties: modernProperties, methods: {},
        },
      },
      {
        gameContext: unavailableContext,
        audioListenerMode: 'unavailable',
        listenerCapabilities: {
          gameContext: unavailableContext, constructorSource: 'standard', probeContextState: 'running',
          properties: modernProperties, methods: {},
        },
      },
      {
        engine: 'webkit', harness: 'playwright-webkit',
        gameContext: unavailableContext,
        audioListenerMode: 'unavailable',
        listenerCapabilities: {
          gameContext: unavailableContext, constructorSource: 'unavailable', probeContextState: 'unavailable',
          properties: {}, methods: { setPosition: 'function' },
        },
      },
      {
        listenerCapabilities: {
          gameContext: { source: 'standard', state: 'suspended' },
          constructorSource: 'standard', probeContextState: 'running',
          properties: modernProperties, methods: {},
        },
      },
    ];
    for (const mutation of mutations) {
      const result = evidence(mutation);
      expect(result.verdict).toBe('FAIL');
      expect(result.evidenceClass).toBe('invalid');
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.coverage.webAudio).toBe(false);
    }
  });
});
