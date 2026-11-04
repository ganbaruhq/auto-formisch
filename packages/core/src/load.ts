import * as v from 'valibot';
import { checkConditions } from './condition-check';
import {
  DEFINITION_VERSION,
  MAX_CONDITION_DEPTH,
  type Component,
  type Condition,
  type ConditionOperator,
  type FormDefinition,
  type RuleNode,
  type ValueField,
} from './definition';
import { builtinComponents, gridSize, type ComponentSpec } from './components';
import { DefinitionError, toFormErrors, type FormError, type PathKey } from './errors';
import { builtinFieldTypes, fieldKeys, type FieldTypeSpec } from './field-types';
import { isEmpty } from './empty';
import { builtinRules, ruleActions } from './rules';
import { REFERENCE, REFERENCE_SYNTAX } from './tree';

type Path = readonly PathKey[];
type Node = Record<string, unknown>;

/** Field `name`s already used in one data scope. Layouts share their parent's scope. */
type Scope = Set<string>;

/** What a Component's direct parent allows: its `type`, its grid, its child types. */
interface Parent {
  readonly type: string;
  /** The parent has a `columns` key, so its children may take `colSpan`. */
  readonly hasColumns: boolean;
  /** The parent's `columns`, when it is valid. */
  readonly columns?: number;
  /** The only child `type` the parent holds. */
  readonly only?: string;
}

const ROOT: Parent = { type: 'root', hasColumns: false };
/** The root's `pages`: Pages only, all in the root data scope. */
const PAGES: Parent = { type: 'pages', hasColumns: false, only: 'page' };

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const ROOT_KEYS = new Set(['$schema', 'version', 'components', 'pages']);
const RULE_KEYS = new Set(['type', 'requirement', 'message']);
/** The Condition keys of a value Field. An `object` or Repeater has no `required`. */
const CONDITION_KEYS: readonly string[] = ['visible', 'disabled', 'required'];
const GROUP_KEYS = ['all', 'any', 'not'] as const;
const LEAF_KEYS = new Set(['field', 'operator', 'value']);
const OPERATORS: ReadonlySet<string> = new Set<ConditionOperator>([
  'eq',
  'neq',
  'in',
  'not_in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'empty',
  'not_empty',
]);

/**
 * Checks an untrusted Form Definition and returns a frozen copy of it.
 *
 * Every problem is collected and thrown at once as a `DefinitionError`. The
 * copy holds only keys the loader checked, in the author's order, so a round
 * trip through JSON is byte-identical and nothing unchecked reaches `compile`.
 */
export function loadDefinition(input: unknown): FormDefinition {
  const loader = new Loader();
  const definition = loader.root(input);
  if (loader.errors.length > 0) throw new DefinitionError(loader.errors);
  return deepFreeze(definition as unknown as FormDefinition);
}

class Loader {
  readonly errors: FormError[] = [];
  /** The Definition path of every loaded Component, for errors found after reading. */
  private readonly paths = new Map<Component, Path>();

  root(input: unknown): Node | undefined {
    const node = this.object(input, []);
    if (node === undefined) return undefined;
    if (!has(node, 'version')) return this.fail(['version'], 'Missing key "version"');
    if (node.version !== DEFINITION_VERSION) {
      // Nothing else can be read under an unknown meaning.
      return this.fail(
        ['version'],
        `Unsupported version ${JSON.stringify(node.version)}; this package reads version ${DEFINITION_VERSION}`,
      );
    }
    this.unknownKeys(node, ROOT_KEYS, []);
    if (!has(node, 'components') && !has(node, 'pages')) {
      this.fail(['components'], 'Missing key "components" or "pages"');
    } else if (has(node, 'components') && has(node, 'pages')) {
      this.fail(['pages'], 'A Definition has "components" or "pages", not both');
    }
    return this.copy(node, ROOT_KEYS, (key, value) => {
      if (key === '$schema') return this.value(v.string(), value, ['$schema']);
      if (key === 'version') return value;
      const components = this.components(value, [key], new Set(), key === 'pages' ? PAGES : ROOT);
      if (key === 'pages' && Array.isArray(value) && value.length === 0) {
        this.fail(['pages'], 'A Wizard needs at least one "page"');
      }
      this.errors.push(...checkConditions(components, (component) => this.paths.get(component)!));
      return components;
    });
  }

  private components(input: unknown, path: Path, scope: Scope, parent: Parent): Component[] {
    const list = this.array(input, path) ?? [];
    return list.flatMap(
      (item, index) => this.component(item, [...path, index], scope, parent) ?? [],
    );
  }

  private component(
    input: unknown,
    path: Path,
    scope: Scope,
    parent: Parent,
  ): Component | undefined {
    const node = this.object(input, path);
    if (node === undefined) return undefined;
    if (!has(node, 'type')) return this.fail([...path, 'type'], 'Missing key "type"');
    const type = typeof node.type === 'string' ? node.type : undefined;
    const field = type === undefined ? undefined : builtinFieldTypes.get(type);
    const other = type === undefined ? undefined : builtinComponents.get(type);
    if (field === undefined && other === undefined) {
      return this.fail([...path, 'type'], `Unknown type ${JSON.stringify(node.type)}`);
    }
    // A misplaced node is still read, so that its own errors are reported too.
    if (parent.only !== undefined && type !== parent.only) {
      this.fail(
        [...path, 'type'],
        `Expected "${parent.only}" inside "${parent.type}", not "${type}"`,
      );
    } else if (other?.parent !== undefined && parent.type !== other.parent) {
      this.fail([...path, 'type'], `A "${type}" goes directly inside "${other.parent}"`);
    }
    const component =
      field !== undefined
        ? this.field(node, field, path, scope, parent)
        : this.layout(node, other!, path, scope, parent);
    this.paths.set(component, path);
    return component;
  }

  private field(
    node: Node,
    spec: FieldTypeSpec,
    path: Path,
    scope: Scope,
    parent: Parent,
  ): Component {
    const schemas: Readonly<Record<string, v.GenericSchema>> = { ...fieldKeys, ...spec.keys };
    const allowed = new Set([
      'type',
      'name',
      'rules',
      'colSpan',
      'default',
      ...CONDITION_KEYS,
      ...Object.keys(schemas),
    ]);
    this.unknownKeys(node, allowed, path);
    for (const key of ['name', ...(spec.requiredKeys ?? [])]) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    let rulesLoaded = true;
    const field = this.copy(node, allowed, (key, value) => {
      if (key === 'name') return this.name(value, [...path, key], scope);
      if (key === 'rules') {
        const errors = this.errors.length;
        const rules = this.rules(value, spec.type, [...path, key]);
        rulesLoaded = this.errors.length === errors;
        return rules;
      }
      if (key === 'colSpan') return this.colSpan(value, [...path, key], parent);
      // Checked once the keys it depends on, `choices` and `rules`, are read.
      if (key === 'type' || key === 'default') return value;
      if (CONDITION_KEYS.includes(key)) return this.setting(key, value, [...path, key]);
      return this.value(schemas[key], value, [...path, key]);
    });
    if (has(field, 'default')) {
      field.default = this.default(field, spec, rulesLoaded, [...path, 'default']);
    }
    return field as unknown as Component;
  }

  /**
   * A value Field's `default`: never empty, of the Field's type, and through
   * its Rules. Each check runs only once the keys it depends on have loaded.
   */
  private default(field: Node, spec: FieldTypeSpec, rulesLoaded: boolean, path: Path): unknown {
    const input = field.default;
    if (isEmpty(input)) return this.fail(path, 'A default cannot be empty');
    if ((spec.requiredKeys ?? []).some((key) => field[key] === undefined)) return undefined;
    const node = field as unknown as ValueField;
    const rules = rulesLoaded ? ruleActions(node.rules) : [];
    const value = this.value(v.pipe(v.unknown(), spec.value(node), ...rules), input, path);
    // A copy, so that freezing the Definition never freezes the caller's input.
    return Array.isArray(value) ? [...value] : value;
  }

  /**
   * A Layout or Content: no `name`, and children in the parent's data scope.
   * An `object` or `repeater`: a `name` in the parent's scope, and children in
   * a new one. A Repeater's template is the scope of every row.
   */
  private layout(
    node: Node,
    spec: ComponentSpec,
    path: Path,
    scope: Scope,
    parent: Parent,
  ): Component {
    const allowed = new Set(['type', 'visible', ...Object.keys(spec.keys)]);
    if (spec.field !== undefined) allowed.add('name').add('disabled');
    if (spec.field === 'rules') allowed.add('rules');
    if (spec.children !== undefined) allowed.add('components');
    // A type with a fixed parent, like `tab` in `tabs`, never sits in a grid.
    if (spec.parent === undefined) allowed.add('colSpan');
    this.unknownKeys(node, allowed, path);
    const required = [
      ...(spec.field !== undefined ? ['name'] : []),
      ...spec.required,
      ...(spec.children ? ['components'] : []),
    ];
    for (const key of required) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    const childScope = spec.field !== undefined ? new Set<string>() : scope;
    const hasColumns = Object.hasOwn(spec.keys, 'columns') && has(node, 'columns');
    const self: Parent = {
      type: spec.type,
      hasColumns,
      columns: hasColumns && v.is(gridSize, node.columns) ? node.columns : undefined,
      only: spec.children?.only,
    };
    return this.copy(node, allowed, (key, value) => {
      if (key === 'type') return value;
      if (key === 'name') return this.name(value, [...path, key], scope);
      if (key === 'rules') return this.rules(value, spec.type, [...path, key]);
      if (key === 'colSpan') return this.colSpan(value, [...path, key], parent);
      if (key === 'visible' || key === 'disabled') return this.setting(key, value, [...path, key]);
      if (key !== 'components') return this.value(spec.keys[key], value, [...path, key]);
      const children = this.components(value, [...path, key], childScope, self);
      if (spec.children?.nonEmpty === true && Array.isArray(value) && value.length === 0) {
        const child = self.only === undefined ? 'Component' : `"${self.only}"`;
        this.fail([...path, key], `A "${spec.type}" needs at least one ${child}`);
      }
      return children;
    }) as unknown as Component;
  }

  /** `visible` is a Condition; `disabled` and `required` are a boolean or a Condition. */
  private setting(key: string, input: unknown, path: Path): boolean | Condition | undefined {
    if (key !== 'visible' && typeof input === 'boolean') return input;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      const expected = key === 'visible' ? 'a Condition' : 'true, false or a Condition';
      return this.fail(path, `Expected ${expected}`);
    }
    return this.condition(input, path, 1);
  }

  /**
   * The shape of a Condition. Its references, operators and values are checked
   * once the whole tree is read, since a Condition may read a later Field.
   * Returns `undefined` if any part of it is wrong.
   */
  private condition(input: unknown, path: Path, depth: number): Condition | undefined {
    const node = this.object(input, path);
    if (node === undefined) return undefined;
    if (depth > MAX_CONDITION_DEPTH) {
      return this.fail(path, `A Condition nests at most ${MAX_CONDITION_DEPTH} levels`);
    }
    const groups = GROUP_KEYS.filter((key) => has(node, key));
    if (groups.length > 1) {
      return this.fail(path, `A Condition has one of "all", "any" and "not", not ${groups.length}`);
    }
    if (groups.length === 1) {
      const [key] = groups;
      this.unknownKeys(node, new Set([key]), path);
      if (key === 'not') {
        const inner = this.condition(node.not, [...path, key], depth + 1);
        return inner === undefined ? undefined : { not: inner };
      }
      const list = this.array(node[key], [...path, key]);
      if (list === undefined) return undefined;
      if (list.length === 0)
        return this.fail([...path, key], `"${key}" needs at least one Condition`);
      const items = list.map((item, index) =>
        this.condition(item, [...path, key, index], depth + 1),
      );
      if (items.includes(undefined)) return undefined;
      return { [key]: items } as unknown as Condition;
    }
    const errors = this.errors.length;
    this.unknownKeys(node, LEAF_KEYS, path);
    for (const key of ['field', 'operator']) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    const leaf = this.copy(node, LEAF_KEYS, (key, value) => {
      if (key === 'field') {
        if (typeof value === 'string' && REFERENCE.test(value)) return value;
        return this.fail([...path, key], REFERENCE_SYNTAX);
      }
      if (key === 'operator') {
        if (typeof value === 'string' && OPERATORS.has(value)) return value;
        return this.fail([...path, key], `Unknown operator ${JSON.stringify(value)}`);
      }
      // Checked against the Field it reads later. A copy, so that freezing the
      // Definition never freezes the caller's input.
      return Array.isArray(value) ? [...value] : value;
    });
    return this.errors.length === errors ? (leaf as unknown as Condition) : undefined;
  }

  /** `colSpan` is only meaningful inside a grid, and no wider than it. */
  private colSpan(input: unknown, path: Path, parent: Parent): number | undefined {
    const span = this.value(gridSize, input, path);
    if (span === undefined) return undefined;
    if (!parent.hasColumns) return this.fail(path, '"colSpan" needs "columns" on its parent');
    if (parent.columns !== undefined && span > parent.columns) {
      return this.fail(path, `"colSpan" ${span} is wider than the ${parent.columns} columns`);
    }
    return span;
  }

  private name(input: unknown, path: Path, scope: Scope): string | undefined {
    if (typeof input !== 'string' || !NAME.test(input)) {
      return this.fail(path, 'A name is letters, digits and _, and does not start with a digit');
    }
    if (RESERVED_NAMES.has(input)) return this.fail(path, `Reserved name "${input}"`);
    if (scope.has(input)) return this.fail(path, `Duplicate name "${input}"`);
    scope.add(input);
    return input;
  }

  /** The `rules` of a Field of type `fieldType`. */
  private rules(input: unknown, fieldType: string, path: Path): RuleNode[] {
    const list = this.array(input, path) ?? [];
    return list.flatMap((item, index) => this.rule(item, fieldType, [...path, index]) ?? []);
  }

  private rule(input: unknown, fieldType: string, path: Path): RuleNode | undefined {
    const node = this.object(input, path);
    if (node === undefined) return undefined;
    this.unknownKeys(node, RULE_KEYS, path);
    if (!has(node, 'type')) return this.fail([...path, 'type'], 'Missing key "type"');
    const spec = typeof node.type === 'string' ? builtinRules.get(node.type) : undefined;
    if (spec === undefined) {
      return this.fail([...path, 'type'], `Unknown Rule ${JSON.stringify(node.type)}`);
    }
    if (!spec.appliesTo.includes(fieldType)) {
      this.fail([...path, 'type'], `Rule "${spec.type}" does not apply to a "${fieldType}" Field`);
    }
    if (spec.requirement !== undefined && !has(node, 'requirement')) {
      this.fail([...path, 'requirement'], 'Missing key "requirement"');
    }
    return this.copy(node, RULE_KEYS, (key, value) => {
      if (key === 'message') return this.value(v.string(), value, [...path, key]);
      if (key !== 'requirement') return value;
      if (spec.requirement !== undefined) {
        const schema =
          typeof spec.requirement === 'function' ? spec.requirement(fieldType) : spec.requirement;
        return this.value(schema, value, [...path, key]);
      }
      return this.fail([...path, key], `Rule "${spec.type}" takes no requirement`);
    }) as unknown as RuleNode;
  }

  /** Copies the allowed keys of `node`, in order, each through `read`. */
  private copy(
    node: Node,
    allowed: ReadonlySet<string>,
    read: (key: string, value: unknown) => unknown,
  ): Node {
    const out: Node = {};
    for (const key of Object.keys(node)) {
      if (allowed.has(key)) out[key] = read(key, node[key]);
    }
    return out;
  }

  private value<T>(schema: v.GenericSchema<unknown, T>, input: unknown, path: Path): T | undefined {
    const result = v.safeParse(schema, input);
    if (result.success) return result.output;
    for (const error of toFormErrors(result.issues)) {
      this.errors.push({ message: error.message, path: [...path, ...error.path] });
    }
    return undefined;
  }

  private object(input: unknown, path: Path): Node | undefined {
    if (typeof input === 'object' && input !== null && !Array.isArray(input)) return input as Node;
    return this.fail(path, 'Expected an object');
  }

  private array(input: unknown, path: Path): readonly unknown[] | undefined {
    if (Array.isArray(input)) return input;
    return this.fail(path, 'Expected an array');
  }

  private unknownKeys(node: Node, allowed: ReadonlySet<string>, path: Path): void {
    for (const key of Object.keys(node)) {
      if (!allowed.has(key)) this.fail([...path, key], `Unknown key ${JSON.stringify(key)}`);
    }
  }

  private fail(path: Path, message: string): undefined {
    this.errors.push({ message, path });
    return undefined;
  }
}

const has = (node: Node, key: string): boolean => Object.hasOwn(node, key);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
