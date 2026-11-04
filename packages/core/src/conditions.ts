import * as v from 'valibot';
import { dateSchema } from './date';
import type { Component, Condition, ConditionLeaf, FieldNode, ValueField } from './definition';
import { isEmpty } from './empty';
import type { PathKey } from './errors';
import { isRecord } from './fields';
import { resolve, segmentsOf, treeOf, type DataScope, type FormTree, type Reference } from './tree';

type Path = readonly PathKey[];

/**
 * What the Conditions of one form decide for one input. `scope` is the data
 * path of the scope the Component sits in: `[]` at the root, `['address']`
 * inside an `object`, `['items', 2]` in the third row of a Repeater.
 *
 * Nothing here throws, whatever the input.
 */
export interface ConditionState {
  /** The Component and every Component around it are visible. */
  isVisible(component: Component, scope: Path): boolean;
  /** The Field, or an `object` or Repeater around it, is disabled. */
  isDisabled(field: FieldNode, scope: Path): boolean;
  /** The Field must have a value, if it is active. */
  isRequired(field: ValueField, scope: Path): boolean;
}

/**
 * The Condition evaluator of one Definition. `prep` and the Renderer both use
 * it, so what a form shows cannot drift from what the server validates
 * (ADR 0002).
 */
export interface FormConditions {
  /** Some Component has a Condition, so the outcome depends on the input. */
  readonly readsValues: boolean;
  /** Evaluates against the whole form input, as the store or skeleton holds it. */
  evaluate(input: unknown): ConditionState;
}

export function conditionsOf(components: readonly Component[]): FormConditions {
  const tree = treeOf(components);
  const references = new Map<ConditionLeaf, Reference | undefined>();
  const reference = (leaf: ConditionLeaf, scope: DataScope): Reference | undefined => {
    if (!references.has(leaf)) {
      const resolved = resolve(tree, leaf.field, scope);
      references.set(leaf, 'error' in resolved ? undefined : resolved);
    }
    return references.get(leaf);
  };
  const readsValues = tree.components.some((component) =>
    (['visible', 'disabled', 'required'] as const).some((key) =>
      isCondition((component as Partial<Record<typeof key, unknown>>)[key]),
    ),
  );
  return {
    readsValues,
    evaluate: (input) => new Evaluation(tree, reference, input),
  };
}

const isCondition = (value: unknown): value is Condition =>
  typeof value === 'object' && value !== null;

class Evaluation implements ConditionState {
  private readonly visible = new Map<Component, Map<string, boolean>>();
  private readonly disabled = new Map<Component, Map<string, boolean>>();

  constructor(
    private readonly tree: FormTree,
    private readonly reference: (leaf: ConditionLeaf, scope: DataScope) => Reference | undefined,
    private readonly input: unknown,
  ) {}

  isVisible(component: Component, scope: Path): boolean {
    return this.memo(this.visible, component, scope, () => {
      const placement = this.tree.placement(component);
      if (placement === undefined) return true;
      if (!this.holds(component.visible, placement.scope, scope, true)) return false;
      const { parent } = placement;
      if (parent === undefined) return true;
      const outer =
        parent === placement.scope.owner ? up(scope, segmentsOf(placement.scope)) : scope;
      return this.isVisible(parent, outer);
    });
  }

  isDisabled(field: FieldNode, scope: Path): boolean {
    return this.memo(this.disabled, field, scope, () => {
      const placement = this.tree.placement(field);
      if (placement === undefined) return false;
      if (this.holds(field.disabled, placement.scope, scope, false)) return true;
      const { owner } = placement.scope;
      return owner !== undefined && this.isDisabled(owner, up(scope, segmentsOf(placement.scope)));
    });
  }

  isRequired(field: ValueField, scope: Path): boolean {
    const placement = this.tree.placement(field);
    return placement !== undefined && this.holds(field.required, placement.scope, scope, false);
  }

  /**
   * Remembers each answer per Component and scope. A Component in progress
   * answers `false`, so even a cycle the loader would reject cannot recurse
   * forever.
   */
  private memo(
    cache: Map<Component, Map<string, boolean>>,
    component: Component,
    scope: Path,
    compute: () => boolean,
  ): boolean {
    let byScope = cache.get(component);
    if (byScope === undefined) cache.set(component, (byScope = new Map()));
    const key = scope.join('.');
    const known = byScope.get(key);
    if (known !== undefined) return known;
    byScope.set(key, false);
    const result = compute();
    byScope.set(key, result);
    return result;
  }

  private holds(
    setting: boolean | Condition | undefined,
    scope: DataScope,
    path: Path,
    fallback: boolean,
  ): boolean {
    if (setting === undefined) return fallback;
    if (typeof setting === 'boolean') return setting;
    return this.test(setting, scope, path);
  }

  private test(condition: Condition, scope: DataScope, path: Path): boolean {
    if ('all' in condition) return condition.all.every((item) => this.test(item, scope, path));
    if ('any' in condition) return condition.any.some((item) => this.test(item, scope, path));
    if ('not' in condition) return !this.test(condition.not, scope, path);
    return compare(condition, this.read(condition, scope, path));
  }

  /** The value a leaf reads: empty when its Field is Inactive. */
  private read(leaf: ConditionLeaf, scope: DataScope, path: Path): unknown {
    const reference = this.reference(leaf, scope);
    if (reference === undefined) return undefined;
    const { target, drop, via } = reference;
    const targetScope = [...up(path, drop), ...via];
    if (!this.isVisible(target, targetScope) || this.isDisabled(target, targetScope)) {
      return undefined;
    }
    return at(this.input, [...targetScope, target.name]);
  }
}

const up = (path: Path, segments: number): Path =>
  path.slice(0, Math.max(0, path.length - segments));

/** The value at `path`, or `undefined` where the input has another shape. */
function at(input: unknown, path: Path): unknown {
  let current = input;
  for (const key of path) {
    if (typeof key === 'number') current = Array.isArray(current) ? current[key] : undefined;
    else current = isRecord(current) && Object.hasOwn(current, key) ? current[key] : undefined;
  }
  return current;
}

/**
 * Strict and case-sensitive, with no trimming or coercion. An empty or wrongly
 * typed value makes every comparison false; `neq` and `not_in` are always the
 * negation of `eq` and `in`.
 */
function compare(leaf: ConditionLeaf, value: unknown): boolean {
  switch (leaf.operator) {
    case 'empty':
      return isEmpty(value);
    case 'not_empty':
      return !isEmpty(value);
    case 'eq':
      return equals(value, leaf.value);
    case 'neq':
      return !equals(value, leaf.value);
    case 'in':
      return isIn(value, leaf.value);
    case 'not_in':
      return !isIn(value, leaf.value);
    case 'contains':
      return Array.isArray(value) && value.some((item) => item === leaf.value);
    case 'gt':
      return order(value, leaf.value) > 0;
    case 'gte':
      return order(value, leaf.value) >= 0;
    case 'lt':
      return order(value, leaf.value) < 0;
    case 'lte':
      return order(value, leaf.value) <= 0;
    default:
      return false;
  }
}

const equals = (value: unknown, expected: unknown): boolean =>
  !isEmpty(value) && value === expected;

const isIn = (value: unknown, list: unknown): boolean =>
  Array.isArray(list) && list.some((item) => equals(value, item));

/**
 * The sign of `value - expected` for two finite numbers or two dates, which
 * order as their `YYYY-MM-DD` strings; `NaN` for anything else.
 */
function order(value: unknown, expected: unknown): number {
  if (typeof value === 'number' && typeof expected === 'number') {
    return Number.isFinite(value) ? Math.sign(value - expected) : Number.NaN;
  }
  if (typeof value === 'string' && typeof expected === 'string' && v.is(dateSchema, value)) {
    return value < expected ? -1 : value > expected ? 1 : 0;
  }
  return Number.NaN;
}
