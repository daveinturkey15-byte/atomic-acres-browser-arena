export type SchemaIssueCode =
  | 'bounds'
  | 'cross-field'
  | 'duplicate'
  | 'format'
  | 'issue-limit'
  | 'missing-key'
  | 'type'
  | 'unknown-key'
  | 'unsupported-value';

export type SchemaIssue = Readonly<{ path: string; code: SchemaIssueCode; message: string }>;

export type SchemaSnapshotBudget = Readonly<{
  maxIssues: number;
  maxSnapshotKeys: number;
  maxSnapshotDepth: number;
  maxSnapshotArrayLength: number;
}>;

export type UnknownRecord = Readonly<Record<string, unknown>>;

/** One kernel instance per schema, closed over its own budget. */
export function createSchemaSnapshotKernel(budget: SchemaSnapshotBudget): {
  addIssue(issues: SchemaIssue[], path: string, code: SchemaIssueCode, message: string): void;
  isRecord(value: unknown): value is UnknownRecord;
  snapshotInput(value: unknown, issues: SchemaIssue[]): unknown;
  exactRecord(
    value: unknown,
    path: string,
    keys: readonly string[],
    issues: SchemaIssue[],
  ): UnknownRecord | null;
  oneOf<T extends string>(value: unknown, values: readonly T[], path: string, issues: SchemaIssue[]): value is T;
} {
  function addIssue(
    issues: SchemaIssue[],
    path: string,
    code: SchemaIssueCode,
    message: string,
  ): void {
    if (issues.length >= budget.maxIssues) {
      if (issues[budget.maxIssues - 1]?.code !== 'issue-limit') {
        issues[budget.maxIssues - 1] = Object.freeze({
          path: '$',
          code: 'issue-limit',
          message: `validation stopped after ${budget.maxIssues - 1} detailed issues`,
        });
      }
      return;
    }
    issues.push(Object.freeze({ path, code, message }));
  }

  function isRecord(value: unknown): value is UnknownRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function snapshotFailure(issues: SchemaIssue[], path: string, operation: string): void {
    addIssue(issues, path, 'type', `${operation} could not be read safely`);
  }

  function snapshotOwnKeys(
    value: object,
    path: string,
    issues: SchemaIssue[],
  ): readonly PropertyKey[] | null {
    try {
      const keys = Reflect.ownKeys(value);
      if (keys.length > budget.maxSnapshotKeys) {
        addIssue(issues, path, 'bounds', `must not expose more than ${budget.maxSnapshotKeys} own properties`);
      }
      return keys.slice(0, budget.maxSnapshotKeys);
    } catch {
      snapshotFailure(issues, path, 'own property keys');
      return null;
    }
  }

  function snapshotDescriptor(
    value: object,
    key: PropertyKey,
    path: string,
    issues: SchemaIssue[],
  ): PropertyDescriptor | null {
    try {
      const first = Reflect.getOwnPropertyDescriptor(value, key);
      const second = Reflect.getOwnPropertyDescriptor(value, key);
      if (!first || !second) {
        snapshotFailure(issues, path, 'own property descriptor');
        return null;
      }
      const firstIsData = Object.hasOwn(first, 'value');
      const secondIsData = Object.hasOwn(second, 'value');
      const stable = firstIsData === secondIsData
        && first.configurable === second.configurable
        && first.enumerable === second.enumerable
        && (firstIsData
          ? first.writable === second.writable && Object.is(first.value, second.value)
          : first.get === second.get && first.set === second.set);
      if (!stable) {
        addIssue(issues, path, 'cross-field', 'own property descriptor changed during snapshot');
        return null;
      }
      return first;
    } catch {
      snapshotFailure(issues, path, 'own property descriptor');
      return null;
    }
  }

  function snapshotArray(
    value: object,
    path: string,
    issues: SchemaIssue[],
    active: WeakSet<object>,
    depth: number,
  ): unknown[] {
    const lengthDescriptor = snapshotDescriptor(value, 'length', `${path}.length`, issues);
    if (!lengthDescriptor) return [];
    if (!Object.hasOwn(lengthDescriptor, 'value')) {
      addIssue(issues, `${path}.length`, 'type', 'accessor properties are forbidden');
      return [];
    }
    const length = lengthDescriptor.value;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > budget.maxSnapshotArrayLength) {
      addIssue(
        issues,
        `${path}.length`,
        'bounds',
        `must be a safe integer from 0 through ${budget.maxSnapshotArrayLength}`,
      );
      return [];
    }
    const snapshot = new Array<unknown>(length);
    const keys = snapshotOwnKeys(value, path, issues);
    if (!keys) return snapshot;
    for (const key of keys) {
      if (key === 'length') continue;
      if (typeof key === 'symbol') {
        addIssue(issues, `${path}[${String(key)}]`, 'unknown-key', 'symbol array properties are forbidden');
        continue;
      }
      const index = Number(key);
      const isIndex = Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
      if (!isIndex) {
        addIssue(issues, `${path}.${key}`, 'unknown-key', 'non-index array properties are forbidden');
        continue;
      }
      const propertyPath = `${path}[${index}]`;
      const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
      if (!descriptor) continue;
      if (!descriptor.enumerable) {
        addIssue(issues, propertyPath, 'unknown-key', 'non-enumerable array entries are forbidden');
        continue;
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        addIssue(issues, propertyPath, 'type', 'accessor properties are forbidden');
        continue;
      }
      snapshot[index] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
    }
    return snapshot;
  }

  function snapshotRecord(
    value: object,
    path: string,
    issues: SchemaIssue[],
    active: WeakSet<object>,
    depth: number,
  ): UnknownRecord {
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = snapshotOwnKeys(value, path, issues);
    if (!keys) return snapshot;
    for (const key of keys) {
      if (typeof key === 'symbol') {
        addIssue(issues, `${path}[${String(key)}]`, 'unknown-key', 'symbol object properties are forbidden');
        continue;
      }
      const propertyPath = `${path}.${key}`;
      const descriptor = snapshotDescriptor(value, key, propertyPath, issues);
      if (!descriptor) continue;
      if (!descriptor.enumerable) {
        addIssue(issues, propertyPath, 'unknown-key', 'non-enumerable object properties are forbidden');
        continue;
      }
      if (!Object.hasOwn(descriptor, 'value')) {
        addIssue(issues, propertyPath, 'type', 'accessor properties are forbidden');
        continue;
      }
      snapshot[key] = snapshotValue(descriptor.value, propertyPath, issues, active, depth + 1);
    }
    return snapshot;
  }

  function snapshotValue(
    value: unknown,
    path: string,
    issues: SchemaIssue[],
    active: WeakSet<object>,
    depth: number,
  ): unknown {
    if (value === null || typeof value !== 'object') return value;
    if (depth > budget.maxSnapshotDepth) {
      addIssue(issues, path, 'bounds', `must not exceed snapshot depth ${budget.maxSnapshotDepth}`);
      return null;
    }
    if (active.has(value)) {
      addIssue(issues, path, 'cross-field', 'cyclic values are forbidden');
      return null;
    }
    let array: boolean;
    try {
      array = Array.isArray(value);
    } catch {
      snapshotFailure(issues, path, 'value kind');
      return null;
    }
    active.add(value);
    try {
      return array
        ? snapshotArray(value, path, issues, active, depth)
        : snapshotRecord(value, path, issues, active, depth);
    } catch {
      snapshotFailure(issues, path, 'value snapshot');
      return null;
    } finally {
      active.delete(value);
    }
  }

  function snapshotInput(value: unknown, issues: SchemaIssue[]): unknown {
    try {
      return snapshotValue(value, '$', issues, new WeakSet<object>(), 0);
    } catch {
      snapshotFailure(issues, '$', 'input snapshot');
      return null;
    }
  }

  function exactRecord(
    value: unknown,
    path: string,
    keys: readonly string[],
    issues: SchemaIssue[],
  ): UnknownRecord | null {
    if (!isRecord(value)) {
      addIssue(issues, path, 'type', 'must be an object');
      return null;
    }
    const allowed = new Set(keys);
    for (const key of keys) {
      if (!Object.hasOwn(value, key)) addIssue(issues, `${path}.${key}`, 'missing-key', 'is required');
    }
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) addIssue(issues, `${path}.${key}`, 'unknown-key', 'is not allowed');
    }
    return value;
  }

  function oneOf<T extends string>(
    value: unknown,
    values: readonly T[],
    path: string,
    issues: SchemaIssue[],
  ): value is T {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      addIssue(issues, path, 'unsupported-value', `must be one of ${values.join(', ')}`);
      return false;
    }
    return true;
  }

  return {
    addIssue,
    isRecord,
    snapshotInput,
    exactRecord,
    oneOf,
  };
}
