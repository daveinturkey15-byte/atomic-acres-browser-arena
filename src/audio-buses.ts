export const AUDIO_BUS_IDS = Object.freeze([
  'master',
  'sfx',
  'movement',
  'ui',
  'announcements',
  'ambience',
  'menu-music',
  'game-music',
] as const);

export type AudioBusId = typeof AUDIO_BUS_IDS[number];
