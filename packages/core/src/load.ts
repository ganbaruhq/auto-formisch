import * as v from 'valibot';
import {
  DEFINITION_VERSION,
  type Component,
  type FormDefinition,
  type RuleNode,
} from './definition';
import { DefinitionError, toFormErrors, type FormError, type PathKey } from './errors';
import { builtinFieldTypes, fieldKeys, type FieldTypeSpec } from './field-types';
import { builtinRules } from './rules';

type Path = readonly PathKey[];
type Node = Record<string, unknown>;

/** Field `name`s already used in one data scope. Layouts share their parent's scope. */
type Scope = Set<string>;

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
      if (key === 'components') return this.components(value, ['components'], new Set());
      return value;
    });
  }

  private components(input: unknown, path: Path, scope: Scope): Component[] {
    const list = this.array(input, path) ?? [];
    return list.flatMap((item, index) => this.component(item, [...path, index], scope) ?? []);
  }

  private component(input: unknown, path: Path, scope: Scope): Component | undefined {
    const node = this.object(input, path);
    if (node === undefined) return undefined;
    if (!has(node, 'type')) return this.fail([...path, 'type'], 'Missing key "type"');
    // Layouts and Content get their own tables beside the Field Types.
    const field = typeof node.type === 'string' ? builtinFieldTypes.get(node.type) : undefined;
    if (field !== undefined) return this.field(node, field, path, scope);
    return this.fail([...path, 'type'], `Unknown type ${JSON.stringify(node.type)}`);
  }

  private field(node: Node, spec: FieldTypeSpec, path: Path, scope: Scope): Component {
    const schemas: Readonly<Record<string, v.GenericSchema>> = { ...fieldKeys, ...spec.keys };
    const allowed = new Set(['type', 'name', 'rules', ...Object.keys(schemas)]);
    this.unknownKeys(node, allowed, path);
    for (const key of ['name', ...(spec.requiredKeys ?? [])]) {
      if (!has(node, key)) this.fail([...path, key], `Missing key "${key}"`);
    }
    return this.copy(node, allowed, (key, value) => {
      if (key === 'name') return this.name(value, [...path, key], scope);
      if (key === 'rules') return this.rules(value, spec, [...path, key]);
      if (key === 'type') return value;
      return this.value(schemas[key], value, [...path, key]);
    }) as unknown as Component;
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
