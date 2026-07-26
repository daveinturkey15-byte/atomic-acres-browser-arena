export type UiRenderer = 'main-shell' | 'match-hud';

export type UiSurfaceDefinition = Readonly<{
  id: string;
  rootElementId: string;
  renderer: UiRenderer;
  critical: boolean;
}>;

export const UI_SURFACE_INVENTORY: readonly UiSurfaceDefinition[] = Object.freeze([
  { id: 'deployment-shell', rootElementId: 'menu', renderer: 'main-shell', critical: true },
  { id: 'field-kit-panel', rootElementId: 'menu-panel-kit', renderer: 'main-shell', critical: true },
  { id: 'killstreak-loadout-panel', rootElementId: 'menu-panel-streaks', renderer: 'main-shell', critical: true },
  { id: 'options-panel', rootElementId: 'menu-panel-options', renderer: 'main-shell', critical: true },
  { id: 'graphics-settings', rootElementId: 'graphics-settings', renderer: 'main-shell', critical: true },
  { id: 'audio-settings', rootElementId: 'audio-settings', renderer: 'main-shell', critical: true },
  { id: 'accessibility-settings', rootElementId: 'accessibility-settings', renderer: 'main-shell', critical: true },
  { id: 'menu-showcase', rootElementId: 'menu-showcase', renderer: 'main-shell', critical: false },
  { id: 'match-pause-backdrop', rootElementId: 'match-pause-backdrop', renderer: 'main-shell', critical: true },
  { id: 'menu-meta-actions', rootElementId: 'menu-meta-actions', renderer: 'main-shell', critical: false },
  { id: 'arena-selector', rootElementId: 'map-selector', renderer: 'main-shell', critical: true },
  { id: 'field-kit', rootElementId: 'selected-kit-summary', renderer: 'main-shell', critical: true },
  { id: 'room-join', rootElementId: 'room-card', renderer: 'main-shell', critical: true },
  { id: 'private-lobby', rootElementId: 'private-lobby', renderer: 'main-shell', critical: true },
  { id: 'network-status', rootElementId: 'network-status', renderer: 'main-shell', critical: true },
  { id: 'match-reports', rootElementId: 'last-match-reports', renderer: 'main-shell', critical: false },
  { id: 'leaderboard', rootElementId: 'high-score-card', renderer: 'main-shell', critical: false },
  { id: 'room-chat', rootElementId: 'text-chat', renderer: 'main-shell', critical: true },
  { id: 'release-history', rootElementId: 'changelog-panel', renderer: 'main-shell', critical: false },
  { id: 'project-map', rootElementId: 'project-map-panel', renderer: 'main-shell', critical: false },
  { id: 'targeting-map', rootElementId: 'strike-map-overlay', renderer: 'match-hud', critical: true },
  { id: 'match-hud', rootElementId: 'hud', renderer: 'match-hud', critical: true },
  { id: 'damage-direction', rootElementId: 'damage-direction', renderer: 'match-hud', critical: true },
  { id: 'nuke-warning', rootElementId: 'nuke-warning', renderer: 'match-hud', critical: true },
  { id: 'refresh-warning', rootElementId: 'refresh-warning', renderer: 'match-hud', critical: false },
  { id: 'match-bar', rootElementId: 'matchbar', renderer: 'match-hud', critical: true },
  { id: 'performance', rootElementId: 'fps-counter', renderer: 'match-hud', critical: false },
  { id: 'latency', rootElementId: 'network-strip', renderer: 'match-hud', critical: true },
  { id: 'aim', rootElementId: 'crosshair', renderer: 'match-hud', critical: true },
  { id: 'sniper-scope', rootElementId: 'sniper-scope', renderer: 'match-hud', critical: true },
  { id: 'railgun-thermal', rootElementId: 'railgun-thermal', renderer: 'match-hud', critical: true },
  { id: 'dmr-thermal', rootElementId: 'dmr-thermal', renderer: 'match-hud', critical: true },
  { id: 'damage-numbers', rootElementId: 'damage-numbers', renderer: 'match-hud', critical: true },
  { id: 'combat-feed', rootElementId: 'killfeed', renderer: 'match-hud', critical: true },
  { id: 'damage-activity', rootElementId: 'damage-feeds', renderer: 'match-hud', critical: true },
  { id: 'objective', rootElementId: 'objective', renderer: 'match-hud', critical: true },
  { id: 'minimap', rootElementId: 'minimap', renderer: 'match-hud', critical: true },
  { id: 'vitals', rootElementId: 'health-block', renderer: 'match-hud', critical: true },
  { id: 'combat-stats', rootElementId: 'combat-stats', renderer: 'match-hud', critical: true },
  { id: 'weapon', rootElementId: 'weapon-block', renderer: 'match-hud', critical: true },
  { id: 'equipment', rootElementId: 'equipment-block', renderer: 'match-hud', critical: true },
  { id: 'support', rootElementId: 'support-block', renderer: 'match-hud', critical: true },
  { id: 'support-combat-feedback', rootElementId: 'support-combat-feedback', renderer: 'match-hud', critical: true },
  { id: 'adrenaline-status', rootElementId: 'adrenaline-hud', renderer: 'match-hud', critical: true },
  { id: 'support-interaction', rootElementId: 'support-interaction-prompt', renderer: 'match-hud', critical: true },
  { id: 'overdrive', rootElementId: 'overdrive-hud', renderer: 'match-hud', critical: true },
  { id: 'power-announcement', rootElementId: 'power-announcement', renderer: 'match-hud', critical: true },
  { id: 'room-state', rootElementId: 'room-hud', renderer: 'match-hud', critical: true },
  { id: 'pickup', rootElementId: 'pickup-prompt', renderer: 'match-hud', critical: true },
  { id: 'respawn', rootElementId: 'respawn', renderer: 'match-hud', critical: true },
  { id: 'countdown', rootElementId: 'countdown', renderer: 'match-hud', critical: true },
  { id: 'round-banner', rootElementId: 'banner', renderer: 'match-hud', critical: true },
  { id: 'roster', rootElementId: 'roster', renderer: 'match-hud', critical: true },
]);

export const UI_STATE_INVENTORY = Object.freeze([
  'offline', 'host', 'guest', 'reconnecting', 'syncing', 'waiting', 'ready',
  'countdown', 'live', 'dead', 'respawning', 'match-ended', 'returned-lobby',
  'modal-open', 'chat-typing', 'loading', 'error', 'reduced-motion', 'reduced-sensory',
  'pointer-lock-requesting', 'pointer-lock-denied', 'focus-suspended', 'paused-match',
  'killstreak-possession', 'chopper-gunner', 'adrenaline-active', 'care-package-nearby',
  'narrow-height', 'narrow-width', 'ultrawide', 'high-dpi',
] as const);

export const UI_REVIEW_VIEWPORTS = Object.freeze([
  { id: 'laptop', width: 1280, height: 720, deviceScaleFactor: 1 },
  { id: 'desktop', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { id: 'ultrawide', width: 2560, height: 1080, deviceScaleFactor: 1 },
  { id: 'narrow', width: 390, height: 844, deviceScaleFactor: 2 },
] as const);

export function assertUiSurfaceInventory(root: ParentNode): void {
  for (const surface of UI_SURFACE_INVENTORY) {
    if (!root.querySelector(`#${surface.rootElementId}`)) {
      throw new Error(`Missing UI surface ${surface.id} (#${surface.rootElementId})`);
    }
  }
}
