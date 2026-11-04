import * as v from 'valibot';
import { choiceValue } from './choices';
import { dateSchema } from './date';
import type {
  ChoiceField,
  Component,
  Condition,
  ConditionLeaf,
  ConditionOperator,
  FieldNode,
  MultiChoiceField,
} from './definition';
import { isEmpty } from './empty';
import { toFormErrors, type FormError, type PathKey } from './errors';
import { resolve, treeOf, type FormTree } from './tree';

type Path = readonly PathKey[];

/** The operators a Condition may use on a Field `type`, and the schema of its `value`. */
interface ConditionType {
  readonly operators: readonly ConditionOperator[];
  readonly value?: (field: FieldNode) => v.GenericSchema;
}

const presence: readonly ConditionOperator[] = ['empty', 'not_empty'];
const equality: readonly ConditionOperator[] = ['eq', 'neq', 'in', 'not_in', ...presence];
const ordered: readonly ConditionOperator[] = [...equality, 'gt', 'gte', 'lt', 'lte'];

const choices = (field: FieldNode) =>
  v.picklist(
    (field as ChoiceField | MultiChoiceField).choices.map(choiceValue),
    (issue) => `Expected one of the choices of the Field, not ${issue.received}`,
  );

/** The operator table of AF-7. An `object` has no operators. */
const conditionTypes: ReadonlyMap<string, ConditionType> = new Map([
  [
    'text',
    {
      operators: equality,
      value: () =>
        v.pipe(
          v.string('Expected a string'),
          v.check((value) => !isEmpty(value), 'Use "empty" to test for no value'),
        ),
    },
  ],
  ['choice', { operators: equality, value: choices }],
  ['number', { operators: ordered, value: () => v.pipe(v.number(), v.finite()) }],
  ['date', { operators: ordered, value: () => dateSchema }],
  ['boolean', { operators: ['eq', 'neq', ...presence], value: () => v.boolean() }],
  ['multi_choice', { operators: ['contains', ...presence], value: choices }],
  ['repeater', { operators: presence }],
  ['object', { operators: [] }],
]);

/** The keys that hold Conditions, and whether they decide whether a Field is Inactive. */
const SETTINGS = [
  ['visible', true],
  ['disabled', true],
  ['required', false],
] as const;

/**
 * Checks what the loader could not check while reading: that each reference
 * names a Field in reach, that its operator applies to that Field's type and
 * its `value` fits, and that no Component depends on itself through `visible`
 * or `disabled`. `required` only reads values, so "at least one of these two"
 * is no cycle.
 */
export function checkConditions(
  components: readonly Component[],
  pathOf: (component: Component) => Path,
): FormError[] {
  const tree = treeOf(components);
  const errors: FormError[] = [];
  /** What each Component's being Inactive depends on: its parent and what it reads. */
  const dependencies = new Map<Component, Component[]>();
  for (const component of tree.components) {
    const placement = tree.placement(component)!;
    const depends = placement.parent === undefined ? [] : [placement.parent];
    for (const [key, decidesInactive] of SETTINGS) {
      const setting = (component as Partial<Record<typeof key, unknown>>)[key];
      if (typeof setting !== 'object' || setting === null) continue;
      for (const [leaf, path] of leavesOf(setting as Condition, [...pathOf(component), key])) {
        const reference = resolve(tree, leaf.field, placement.scope);
        if ('error' in reference) {
          errors.push({ message: reference.error, path: [...path, 'field'] });
          continue;
        }
        errors.push(...checkLeaf(leaf, reference.target, path));
        if (decidesInactive) depends.push(reference.target);
      }
    }
    dependencies.set(component, depends);
  }
  errors.push(...cycles(tree, dependencies, pathOf));
  return errors;
}

function* leavesOf(condition: Condition, path: Path): Generator<[ConditionLeaf, Path]> {
  if ('all' in condition) {
    for (const [index, item] of condition.all.entries())
      yield* leavesOf(item, [...path, 'all', index]);
  } else if ('any' in condition) {
    for (const [index, item] of condition.any.entries())
      yield* leavesOf(item, [...path, 'any', index]);
  } else if ('not' in condition) {
    yield* leavesOf(condition.not, [...path, 'not']);
  } else {
    yield [condition, path];
  }
}

function checkLeaf(leaf: ConditionLeaf, target: FieldNode, path: Path): FormError[] {
  const type = conditionTypes.get(target.type);
  if (type === undefined || !type.operators.includes(leaf.operator)) {
    return [
      {
        message: `Operator "${leaf.operator}" does not apply to a "${target.type}" Field`,
        path: [...path, 'operator'],
      },
    ];
  }
  const hasValue = Object.hasOwn(leaf, 'value');
  if (presence.includes(leaf.operator)) {
    return hasValue
      ? [{ message: `Operator "${leaf.operator}" takes no value`, path: [...path, 'value'] }]
      : [];
  }
  if (!hasValue) return [{ message: 'Missing key "value"', path: [...path, 'value'] }];
  const item = type.value!(target);
  const schema =
    leaf.operator === 'in' || leaf.operator === 'not_in'
      ? v.pipe(v.array(item, 'Expected a list'), v.minLength(1, 'Expected at least one value'))
      : item;
  const result = v.safeParse(schema, leaf.value);
  if (result.success) return [];
  return toFormErrors(result.issues).map((error) => ({
    message: error.message,
    path: [...path, 'value', ...error.path],
  }));
}

/** One error per cycle, at the Component where it is found. */
function cycles(
  tree: FormTree,
  dependencies: ReadonlyMap<Component, readonly Component[]>,
  pathOf: (component: Component) => Path,
): FormError[] {
  const errors: FormError[] = [];
  const done = new Set<Component>();
  const trail: Component[] = [];
  const visit = (component: Component) => {
    if (done.has(component)) return;
    const start = trail.indexOf(component);
    if (start >= 0) {
      const loop = [...trail.slice(start), component].map((item) => labelOf(tree, item, pathOf));
      errors.push({
        message: `A Condition cycle through "visible" or "disabled": ${loop.join(' -> ')}`,
        path: pathOf(component),
      });
      return;
    }
    trail.push(component);
    for (const next of dependencies.get(component) ?? []) visit(next);
    trail.pop();
    done.add(component);
  };
  for (const component of tree.components) visit(component);
  return errors;
}

/** A Field by its data path from the root, without indexes; anything else by its type and place. */
function labelOf(tree: FormTree, component: Component, pathOf: (c: Component) => Path): string {
  if (!('name' in component)) return `the "${component.type}" at ${pathOf(component).join('.')}`;
  const names = [component.name];
  for (let scope = tree.placement(component)?.scope; scope?.owner; scope = scope.parent) {
    names.unshift(scope.owner.name);
  }
  return `"${names.join('.')}"`;
}
