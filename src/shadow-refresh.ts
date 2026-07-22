export const STATIC_SHADOW_DYNAMIC_REFRESH_INTERVAL_MS = 100;

export type StaticShadowRefreshContext = {
  shadowMode: 'off' | 'static' | 'dynamic';
  shadowsEnabled: boolean;
  contextLost: boolean;
  hasDynamicCasters: boolean;
  now: number;
  lastRefreshAt: number;
};

/** Returns the admitted refresh time, or null when the bounded static-shadow cache remains valid. */
export function admitStaticShadowDynamicRefresh(context: StaticShadowRefreshContext): number | null {
  if (context.shadowMode !== 'static' || !context.shadowsEnabled || context.contextLost || !context.hasDynamicCasters) return null;
  if (!Number.isFinite(context.now) || context.now < 0) return null;
  if (context.now - context.lastRefreshAt < STATIC_SHADOW_DYNAMIC_REFRESH_INTERVAL_MS) return null;
  return context.now;
}
