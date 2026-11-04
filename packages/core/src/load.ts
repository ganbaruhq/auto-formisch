import * as v from 'valibot';
import {
  DEFINITION_VERSION,
  type Component,
  type FormDefinition,
  type RuleNode,
} from './definition';
import { builtinComponents, gridSize, type ComponentSpec } from './components';
import { DefinitionError, toFormErrors, type FormError, type PathKey } from './errors';
import { builtinFieldTypes, fieldKeys, type FieldTypeSpec } from './field-types';
import { builtinRules } from './rules';

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

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set(['__proto__', 'prototype', 'constructor']);
const ROOT_KEYS = new Set(['$schema', 'version', 'components']);
const RULE_KEYS = new Set(['type', 'requirement', 'message']);

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
    if (!has(node, 'components')) this.fail(['components'], 'Missing key "components"');
    return this.copy(node, ROOT_KEYS, (key, value) => {
      if (key === '$schema') return this.value(v.string(), value, ['$schema']);
      if (key === 'components') return this.components(value, ['components'], new Set(), ROOT);
      return value;
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
    if (field !== undefined) return this.field(node, field, path, scope, parent);
    return this.layout(node, other!, path, scope, parent);
  }

  private field(
    node: Node,
    spec: FieldTypeSpec,
    path: Path,
    scope: Scope,
    parent: Parent,
  ): Component {
    const schemas: Readonly<Record<string, v.GenericSchema>> = { ...fieldKeys, ...spec.keys };
    const allowed = new Set(['type', 'name', 'rules', 'colSpan', ...Object.keys(schemas)]);
    this.unknownKeys(node, allowed, path);
    for (const key of ['name', ...(spec.requiredKeys ?? [])]) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    return this.copy(node, allowed, (key, value) => {
      if (key === 'name') return this.name(value, [...path, key], scope);
      if (key === 'rules') return this.rules(value, spec, [...path, key]);
      if (key === 'colSpan') return this.colSpan(value, [...path, key], parent);
      if (key === 'type') return value;
      return this.value(schemas[key], value, [...path, key]);
    }) as unknown as Component;
  }

  /** A Layout or Content: no `name`, and children in the parent's data scope. */
  private layout(
    node: Node,
    spec: ComponentSpec,
    path: Path,
    scope: Scope,
    parent: Parent,
  ): Component {
    const allowed = new Set(['type', ...Object.keys(spec.keys)]);
    if (spec.children !== undefined) allowed.add('components');
    // A type with a fixed parent, like `tab` in `tabs`, never sits in a grid.
    if (spec.parent === undefined) allowed.add('colSpan');
    this.unknownKeys(node, allowed, path);
    for (const key of [...spec.required, ...(spec.children ? ['components'] : [])]) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    const hasColumns = Object.hasOwn(spec.keys, 'columns') && has(node, 'columns');
    const self: Parent = {
      type: spec.type,
      hasColumns,
      columns: hasColumns && v.is(gridSize, node.columns) ? node.columns : undefined,
      only: spec.children?.only,
    };
    return this.copy(node, allowed, (key, value) => {
      if (key === 'type') return value;
      if (key === 'colSpan') return this.colSpan(value, [...path, key], parent);
      if (key !== 'components') return this.value(spec.keys[key], value, [...path, key]);
      const children = this.components(value, [...path, key], scope, self);
      if (spec.children?.nonEmpty === true && Array.isArray(value) && value.length === 0) {
        const child = self.only === undefined ? 'Component' : `"${self.only}"`;
        this.fail([...path, key], `A "${spec.type}" needs at least one ${child}`);
      }
      return children;
    }) as unknown as Component;
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

  private rules(input: unknown, field: FieldTypeSpec, path: Path): RuleNode[] {
    const list = this.array(input, path) ?? [];
    return list.flatMap((item, index) => this.rule(item, field, [...path, index]) ?? []);
  }

  private rule(input: unknown, field: FieldTypeSpec, path: Path): RuleNode | undefined {
    const node = this.object(input, path);
    if (node === undefined) return undefined;
    this.unknownKeys(node, RULE_KEYS, path);
    if (!has(node, 'type')) return this.fail([...path, 'type'], 'Missing key "type"');
    const spec = typeof node.type === 'string' ? builtinRules.get(node.type) : undefined;
    if (spec === undefined) {
      return this.fail([...path, 'type'], `Unknown Rule ${JSON.stringify(node.type)}`);
    }
    if (!spec.appliesTo.includes(field.type)) {
      this.fail([...path, 'type'], `Rule "${spec.type}" does not apply to a "${field.type}" Field`);
    }
    if (spec.requirement !== undefined && !has(node, 'requirement')) {
      this.fail([...path, 'requirement'], 'Missing key "requirement"');
    }
    return this.copy(node, RULE_KEYS, (key, value) => {
      if (key === 'message') return this.value(v.string(), value, [...path, key]);
      if (key !== 'requirement') return value;
      if (spec.requirement !== undefined) {
        const schema =
          typeof spec.requirement === 'function' ? spec.requirement(field.type) : spec.requirement;
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
