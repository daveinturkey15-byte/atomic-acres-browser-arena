export type UiRenderer = 'main-shell' | 'match-hud';
export type UiSurfaceKind = 'static' | 'dynamic' | 'diagnostics-overlay';

export type UiSurfaceDefinition = Readonly<{
  id: string;
  rootElementId: string;
  renderer: UiRenderer;
  critical: boolean;
  kind?: UiSurfaceKind;
  toggleCode?: string;
  zIndex?: number;
  pointerEvents?: 'auto' | 'none';
}>;

export const HUD_MOTION_PROPERTIES = Object.freeze([
  '--hud-sway-x', '--hud-sway-y', '--hud-breathe', '--hud-gait', '--hud-health',
] as const);

export type HudMotionProperty = typeof HUD_MOTION_PROPERTIES[number];

export type HudMotionTargetDefinition = Readonly<{
  id: string;
  selector: string;
  role: 'sway' | 'health';
  properties: readonly HudMotionProperty[];
}>;

/**
 * The frame-driven HUD custom properties are written directly on the elements
 * whose rules consume them. Keep this registry beside the typed surface
 * inventory so markup, CSS and the runtime agree on the invalidation boundary.
 */
export const HUD_MOTION_TARGETS: readonly HudMotionTargetDefinition[] = Object.freeze([
  { id: 'mission-console', selector: '.hud-mission-console', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'map-console', selector: '.hud-map-console', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'operator-console', selector: '.hud-operator-console', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'weapon-console', selector: '.hud-weapon-console', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'support-block', selector: '#support-block', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'killfeed', selector: '#killfeed', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'damage-feeds', selector: '#damage-feeds', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'pause-hint', selector: '#pause-hint', role: 'sway', properties: HUD_MOTION_PROPERTIES.slice(0, 4) },
  { id: 'health-fill', selector: '#health-fill', role: 'health', properties: ['--hud-health'] },
]);

export const HUD_MOTION_TARGET_COUNT = HUD_MOTION_TARGETS.length;

export const UI_SURFACE_INVENTORY: readonly UiSurfaceDefinition[] = Object.freeze([
  { id: 'deployment-shell', rootElementId: 'menu', renderer: 'main-shell', critical: true },
  { id: 'field-kit-panel', rootElementId: 'menu-panel-kit', renderer: 'main-shell', critical: true },
  { id: 'killstreak-loadout-panel', rootElementId: 'menu-panel-streaks', renderer: 'main-shell', critical: true },
  { id: 'operator-panel', rootElementId: 'menu-panel-operator', renderer: 'main-shell', critical: true },
  { id: 'operator-appearance', rootElementId: 'operator-appearance', renderer: 'main-shell', critical: true },
  { id: 'options-panel', rootElementId: 'menu-panel-options', renderer: 'main-shell', critical: true },
  { id: 'graphics-settings', rootElementId: 'graphics-settings', renderer: 'main-shell', critical: true },
  { id: 'audio-settings', rootElementId: 'audio-settings', renderer: 'main-shell', critical: true },
  { id: 'accessibility-settings', rootElementId: 'accessibility-settings', renderer: 'main-shell', critical: true },
  { id: 'privacy-settings', rootElementId: 'privacy-settings', renderer: 'main-shell', critical: true },
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
  {
    id: 'netcode-diagnostics-overlay',
    rootElementId: 'netcode-diagnostics-overlay',
    renderer: 'match-hud',
    critical: false,
    kind: 'diagnostics-overlay',
    toggleCode: 'F3',
    zIndex: 70,
    pointerEvents: 'none',
  },
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
  { id: 'sticky-ordnance-warning', rootElementId: 'sticky-warning', renderer: 'match-hud', critical: true },
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
  'narrow-height', 'narrow-width', 'ultrawide', 'high-dpi', 'mobile-touch',
  'mobile-portrait', 'mobile-landscape', 'safe-area',
] as const);

export const UI_REVIEW_VIEWPORTS = Object.freeze([
  { id: 'laptop', width: 1280, height: 720, deviceScaleFactor: 1 },
  { id: 'review', width: 1600, height: 900, deviceScaleFactor: 1 },
  { id: 'desktop', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { id: 'owner', width: 2560, height: 1440, deviceScaleFactor: 1 },
  { id: 'ultrawide', width: 3440, height: 1440, deviceScaleFactor: 1 },
  { id: 'narrow', width: 390, height: 844, deviceScaleFactor: 2 },
] as const);

export const UI_HIGH_DPI_REVIEW_VIEWPORT = Object.freeze({
  id: 'high-dpi',
  width: 1280,
  height: 720,
  deviceScaleFactor: 2,
} as const);

export const UI_MOBILE_REVIEW_VIEWPORTS = Object.freeze([
  { id: 'mobile-compact-portrait', width: 320, height: 568, deviceScaleFactor: 2 },
  { id: 'mobile-portrait', width: 390, height: 844, deviceScaleFactor: 3 },
  { id: 'mobile-compact-landscape', width: 568, height: 320, deviceScaleFactor: 2 },
  { id: 'mobile-small-landscape', width: 667, height: 375, deviceScaleFactor: 2 },
  { id: 'mobile-landscape', width: 844, height: 390, deviceScaleFactor: 3 },
  { id: 'mobile-wide-landscape', width: 932, height: 430, deviceScaleFactor: 3 },
  { id: 'mobile-tablet-landscape', width: 1024, height: 768, deviceScaleFactor: 2 },
] as const);

export function assertUiSurfaceInventory(root: ParentNode): void {
  for (const surface of UI_SURFACE_INVENTORY) {
    // Diagnostics is deliberately lazy: F3 creates the hidden overlay on first
    // use, so the initial shell assertion must validate its source contract
    // rather than force a DOM node and defeat the lazy/off-switch behavior.
    if (surface.kind === 'diagnostics-overlay') continue;
    if (!root.querySelector(`#${surface.rootElementId}`)) {
      throw new Error(`Missing UI surface ${surface.id} (#${surface.rootElementId})`);
    }
  }
}
