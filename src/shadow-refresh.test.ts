import { describe, expect, it } from 'vitest';
import { STATIC_SHADOW_DYNAMIC_REFRESH_INTERVAL_MS, admitStaticShadowDynamicRefresh } from './shadow-refresh';

describe('bounded static-shadow refresh', () => {
  const context = {
    shadowMode: 'static' as const,
    shadowsEnabled: true,
    contextLost: false,
    hasDynamicCasters: true,
    now: 1_000,
    lastRefreshAt: 0,
  };

  it('admits moving-caster refreshes without enabling every-frame shadow work', () => {
    expect(admitStaticShadowDynamicRefresh(context)).toBe(1_000);
    expect(admitStaticShadowDynamicRefresh({ ...context, lastRefreshAt: 950 })).toBeNull();
    expect(STATIC_SHADOW_DYNAMIC_REFRESH_INTERVAL_MS).toBe(100);
  });

  it('keeps the cache frozen when no dynamic caster exists or WebGL is lost', () => {
    expect(admitStaticShadowDynamicRefresh({ ...context, hasDynamicCasters: false })).toBeNull();
    expect(admitStaticShadowDynamicRefresh({ ...context, contextLost: true })).toBeNull();
    expect(admitStaticShadowDynamicRefresh({ ...context, shadowMode: 'dynamic' })).toBeNull();
  });
});
