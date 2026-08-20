export type SquadColor = string;

export const DEFAULT_SQUAD_PRESENTATION = Object.freeze({
  aqua: Object.freeze({ name: 'AQUA', color: '#55e6ff' }),
  coral: Object.freeze({ name: 'CORAL', color: '#ff6b73' }),
});

export function isSquadName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/.test(value);
}

export function isSquadColor(value: unknown): value is SquadColor {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function defaultSquadPresentation(team: 0 | 1): Readonly<{ name: string; color: SquadColor }> {
  return team === 0 ? DEFAULT_SQUAD_PRESENTATION.aqua : DEFAULT_SQUAD_PRESENTATION.coral;
}

export function sanitizeSquadPresentation(
  name: unknown,
  color: unknown,
  team: 0 | 1,
): Readonly<{ name: string; color: SquadColor }> {
  const fallback = defaultSquadPresentation(team);
  return {
    name: isSquadName(name) ? name : fallback.name,
    color: isSquadColor(color) ? color.toLowerCase() : fallback.color,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]!));
}

/** Render only sanitized presentation metadata; gameplay team remains authoritative. */
export function renderSquadRosterBadge(name: unknown, color: unknown, team: 0 | 1): string {
  const squad = sanitizeSquadPresentation(name, color, team);
  return `<span class="lobby-squad-badge" style="--lobby-squad-color:${squad.color}"><span class="lobby-squad-swatch" aria-hidden="true"></span>${escapeHtml(squad.name)}</span>`;
}
