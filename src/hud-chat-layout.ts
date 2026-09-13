export type HudChatViewport = Readonly<{
  width: number;
  height: number;
}>;

export type HudChatRect = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type HudChatLayout = Readonly<{
  chat: HudChatRect;
  ammo: HudChatRect;
  minimap: HudChatRect;
  crosshairBand: HudChatRect;
}>;

export const HUD_CHAT_OPEN_HEIGHT_PX = 220;
export const HUD_CHAT_COMPACT_HEIGHT_PX = 28;
export const HUD_CHAT_CROSSHAIR_BAND_HALF_HEIGHT_PX = 64;

const DESKTOP_EDGE_PX = 24;
const DESKTOP_CHAT_WIDTH_PX = 360;
const MOBILE_EDGE_PX = 8;
const MOBILE_CHAT_WIDTH_PX = 216;
const MOBILE_MAP_WIDTH_PX = 150;
const MOBILE_MAP_TOP_PX = 118;

function desktopChatTop(height: number): number {
  // Mirrors `clamp(48px, calc(50vh - 300px), 240px)` in the final CSS.
  return Math.max(48, Math.min(240, height / 2 - 300));
}

export function hudChatLayoutForViewport(viewport: HudChatViewport): HudChatLayout {
  const mobile = viewport.width <= 700;
  const chatWidth = mobile
    ? Math.min(MOBILE_CHAT_WIDTH_PX, Math.max(0, viewport.width - MOBILE_MAP_WIDTH_PX - 24))
    : Math.min(DESKTOP_CHAT_WIDTH_PX, Math.max(0, viewport.width - DESKTOP_EDGE_PX * 2));
  const chat: HudChatRect = {
    left: mobile ? MOBILE_EDGE_PX : DESKTOP_EDGE_PX,
    top: mobile ? MOBILE_MAP_TOP_PX : desktopChatTop(viewport.height),
    width: chatWidth,
    height: HUD_CHAT_OPEN_HEIGHT_PX,
  };
  const minimap: HudChatRect = mobile
    ? { left: viewport.width - MOBILE_EDGE_PX - MOBILE_MAP_WIDTH_PX, top: MOBILE_MAP_TOP_PX, width: MOBILE_MAP_WIDTH_PX, height: 150 }
    : { left: viewport.width - DESKTOP_EDGE_PX - 224, top: 22, width: 224, height: 224 };
  const ammo: HudChatRect = mobile
    ? { left: viewport.width - MOBILE_EDGE_PX - 176, top: viewport.height - 8 - 126, width: 176, height: 126 }
    : { left: viewport.width - DESKTOP_EDGE_PX - 236 - 292, top: viewport.height - 22 - 142, width: 292, height: 142 };
  const crosshairBand: HudChatRect = {
    left: 0,
    top: viewport.height / 2 - HUD_CHAT_CROSSHAIR_BAND_HALF_HEIGHT_PX,
    width: viewport.width,
    height: HUD_CHAT_CROSSHAIR_BAND_HALF_HEIGHT_PX * 2,
  };
  return { chat, ammo, minimap, crosshairBand };
}

export function rectsOverlap(a: HudChatRect, b: HudChatRect): boolean {
  return a.left < b.left + b.width
    && a.left + a.width > b.left
    && a.top < b.top + b.height
    && a.top + a.height > b.top;
}
