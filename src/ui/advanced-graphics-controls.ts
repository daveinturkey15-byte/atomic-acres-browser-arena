import {
  ADVANCED_GRAPHICS_CONTROLS,
  GRAPHICS_CAPABILITY_NOTICES,
  validateAdvancedGraphicsRegistry,
  type GraphicsAdvancedKey,
  type GraphicsControlDefinition,
  type GraphicsSettingCategory,
} from '../graphics-settings-registry';
import type { GraphicsSettings } from '../pass65-settings';

const CATEGORY_LABELS: Readonly<Record<GraphicsSettingCategory, string>> = Object.freeze({
  display: 'DISPLAY & RESOLUTION',
  geometry: 'GEOMETRY',
  lighting: 'LIGHTING & REFLECTIONS',
  atmosphere: 'ATMOSPHERE & EFFECTS',
  materials: 'MATERIALS & DECALS',
  post: 'POST PROCESSING',
});

function controlMarkup(definition: GraphicsControlDefinition): string {
  const shared = `id="${definition.id}" data-graphics-setting="${definition.key}"`;
  if (definition.kind === 'toggle') {
    return `<label class="advanced-graphics-control advanced-graphics-toggle" for="${definition.id}"><span>${definition.label}</span><small>${definition.description}</small><input ${shared} type="checkbox"></label>`;
  }
  if (definition.kind === 'select') {
    const options = definition.options.map(({ value, label }) => `<option value="${value}">${label}</option>`).join('');
    return `<label class="advanced-graphics-control" for="${definition.id}"><span>${definition.label}</span><small>${definition.description}</small><select ${shared}>${options}</select></label>`;
  }
  const list = definition.key === 'targetFps'
    ? ' list="graphics-target-fps-marks"'
    : definition.key === 'frameRateLimit' ? ' list="graphics-frame-limit-marks"' : '';
  return `<label class="advanced-graphics-control" for="${definition.id}"><span>${definition.label}</span><small>${definition.description}</small><span class="advanced-graphics-range"><input ${shared} type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}"${list}><output id="${definition.id}-value" for="${definition.id}"></output></span></label>`;
}

function noticeMarkup(category: GraphicsSettingCategory): string {
  return GRAPHICS_CAPABILITY_NOTICES.filter((notice) => notice.category === category).map((notice) => (
    `<div class="advanced-graphics-unavailable" data-graphics-capability="${notice.id}" aria-disabled="true"><span>${notice.label}</span><b>UNAVAILABLE</b><small>${notice.reason}</small><em>${notice.evidence}</em></div>`
  )).join('');
}

export function advancedGraphicsMarkup(): string {
  const categories = Object.keys(CATEGORY_LABELS) as GraphicsSettingCategory[];
  return `<div class="advanced-graphics-catalog" data-graphics-registry-count="${ADVANCED_GRAPHICS_CONTROLS.length}">
    <datalist id="graphics-target-fps-marks"><option value="60"></option><option value="120"></option><option value="144"></option><option value="240"></option><option value="360"></option></datalist>
    <datalist id="graphics-frame-limit-marks"><option value="60"></option><option value="120"></option><option value="144"></option><option value="240"></option><option value="360"></option><option value="361" label="UNCAPPED"></option></datalist>
    ${categories.map((category) => `<section class="advanced-graphics-category" data-graphics-category="${category}"><header><b>${CATEGORY_LABELS[category]}</b><small>ONE CANONICAL RUNTIME REGISTRY</small></header><div class="advanced-graphics-grid">${ADVANCED_GRAPHICS_CONTROLS.filter((definition) => definition.category === category).map(controlMarkup).join('')}${noticeMarkup(category)}</div></section>`).join('')}
  </div>`;
}

function controlUiValue(definition: GraphicsControlDefinition, value: GraphicsSettings[GraphicsAdvancedKey]): string {
  if (definition.kind === 'range' && definition.unlimitedSentinel !== undefined && value === 0) {
    return String(definition.unlimitedSentinel);
  }
  return String(value);
}

function formatRangeValue(definition: Extract<GraphicsControlDefinition, { kind: 'range' }>, rawValue: string): string {
  const value = Number(rawValue);
  if (definition.unlimitedSentinel !== undefined && value >= definition.unlimitedSentinel) return 'UNCAPPED';
  if (definition.unit === 'percent') return `${Math.round(value * 100)}%`;
  if (definition.unit === 'fps') return `${Math.round(value)} FPS`;
  return `${value.toFixed(2)}X`;
}

function settingValue(definition: GraphicsControlDefinition, element: HTMLInputElement | HTMLSelectElement): unknown {
  if (definition.kind === 'toggle') return (element as HTMLInputElement).checked;
  if (definition.kind === 'select') {
    const value = element.value;
    return definition.key === 'anisotropy' ? Number(value) : value;
  }
  const value = Number(element.value);
  return definition.unlimitedSentinel !== undefined && value >= definition.unlimitedSentinel ? 0 : value;
}

export type AdvancedGraphicsBinding = Readonly<{
  refresh(settings: GraphicsSettings): void;
  registeredKeys: readonly GraphicsAdvancedKey[];
  hasPendingEdits(): boolean;
  peekPendingEdits(): Partial<GraphicsSettings>;
  customSettings(): GraphicsSettings;
  clearPendingEdits(): void;
  /** @deprecated Non-destructive compatibility alias for peekPendingEdits. */
  takePendingEdits(): Partial<GraphicsSettings>;
}>;

/**
 * Keeps one preset snapshot and its unsaved edits separate from persistence.
 * Callers may inspect/materialize repeatedly, persist the result, and clear
 * only after verified storage succeeds. Refreshing with another named preset
 * atomically replaces the seed and discards the superseded draft.
 */
export class AdvancedGraphicsEditTransaction {
  private baseline: GraphicsSettings;
  private pending: Partial<Record<GraphicsAdvancedKey, unknown>> = {};

  constructor(initial: GraphicsSettings) {
    this.baseline = Object.freeze({ ...initial });
  }

  refresh(settings: GraphicsSettings): void {
    this.baseline = Object.freeze({ ...settings });
    this.clearPendingEdits();
  }

  stage(key: GraphicsAdvancedKey, value: GraphicsSettings[GraphicsAdvancedKey]): void {
    this.pending[key] = value;
  }

  hasPendingEdits(): boolean {
    return Object.keys(this.pending).length > 0;
  }

  peekPendingEdits(): Partial<GraphicsSettings> {
    return Object.freeze({ ...this.pending }) as Partial<GraphicsSettings>;
  }

  customSettings(): GraphicsSettings {
    return Object.freeze({
      ...this.baseline,
      ...this.pending,
      schemaVersion: 1,
      preset: 'custom',
    }) as GraphicsSettings;
  }

  clearPendingEdits(): void {
    this.pending = {};
  }
}

export function bindAdvancedGraphicsControls(
  root: ParentNode,
  initial: GraphicsSettings,
  onEdit: () => void,
): AdvancedGraphicsBinding {
  const registryIssues = validateAdvancedGraphicsRegistry();
  if (registryIssues.length > 0) {
    throw new Error(`Advanced Graphics registry is invalid: ${registryIssues.join(', ')}`);
  }
  const elements = new Map<GraphicsAdvancedKey, HTMLInputElement | HTMLSelectElement>();
  const transaction = new AdvancedGraphicsEditTransaction(initial);
  const refresh = (settings: GraphicsSettings): void => {
    transaction.refresh(settings);
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      const element = elements.get(definition.key);
      if (!element) continue;
      if (definition.kind === 'toggle') (element as HTMLInputElement).checked = Boolean(settings[definition.key]);
      else element.value = controlUiValue(definition, settings[definition.key]);
      if (definition.kind === 'range') {
        const output = root.querySelector<HTMLOutputElement>(`#${definition.id}-value`);
        if (output) output.value = formatRangeValue(definition, element.value);
      }
    }
  };
  for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
    const element = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${definition.id}`);
    if (!element) throw new Error(`Advanced Graphics registry control is missing: ${definition.id}`);
    elements.set(definition.key, element);
    if (definition.kind === 'range') {
      element.addEventListener('input', () => {
        const output = root.querySelector<HTMLOutputElement>(`#${definition.id}-value`);
        if (output) output.value = formatRangeValue(definition, element.value);
      });
    }
    element.addEventListener('change', () => {
      transaction.stage(
        definition.key,
        settingValue(definition, element) as GraphicsSettings[GraphicsAdvancedKey],
      );
      onEdit();
    });
  }
  refresh(initial);
  return Object.freeze({
    refresh,
    registeredKeys: Object.freeze(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key)),
    hasPendingEdits: () => transaction.hasPendingEdits(),
    peekPendingEdits: () => transaction.peekPendingEdits(),
    customSettings: () => transaction.customSettings(),
    clearPendingEdits: () => transaction.clearPendingEdits(),
    takePendingEdits: () => transaction.peekPendingEdits(),
  });
}
