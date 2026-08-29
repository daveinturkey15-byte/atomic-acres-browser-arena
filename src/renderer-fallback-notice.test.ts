import { describe, expect, it } from 'vitest';
import { parseRendererFallbackRecord, rendererFallbackNotice } from './renderer-fallback-notice';

const UA = 'Mozilla/5.0 TestBrowser/153.0.8010.12';

describe('renderer fallback notice', () => {
  it('parses only a record from THIS browser build', () => {
    const raw = JSON.stringify({ userAgent: UA, at: '2026-08-29T00:00:00Z', reason: 'tint' });
    expect(parseRendererFallbackRecord(raw, UA)?.reason).toBe('tint');
    // A browser update invalidates the record (different UA).
    expect(parseRendererFallbackRecord(raw, 'Mozilla/5.0 TestBrowser/154.0.0.0')).toBeNull();
    expect(parseRendererFallbackRecord(null, UA)).toBeNull();
    expect(parseRendererFallbackRecord('{not json', UA)).toBeNull();
  });

  it('shows the banner ONLY on an actual webgl2 session with a matching record', () => {
    const record = { userAgent: UA, at: '', reason: '' };
    expect(rendererFallbackNotice(record, 'webgl2').show).toBe(true);
    expect(rendererFallbackNotice(record, 'webgl2').message).toMatch(/frame rate/i);
    // Player already retrying WebGPU, or the record is gone: no banner.
    expect(rendererFallbackNotice(record, 'webgpu').show).toBe(false);
    expect(rendererFallbackNotice(null, 'webgl2').show).toBe(false);
  });
});
