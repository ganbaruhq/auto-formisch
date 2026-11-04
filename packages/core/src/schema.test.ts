import Ajv from 'ajv';
import { describe, expect, it } from 'vite-plus/test';
import pkg from '../package.json';
import schema from '../schema/v1.json';
import { builtinComponents } from './components';
import { builtinFieldTypes, fieldKeys } from './field-types';
import { invalidDefinitions, SCHEMA_URL, validDefinitions } from './fixtures/definitions';
import { compile, DefinitionError, type FormError } from './index';
import { builtinRules } from './rules';

// Strict about keywords, so a typo in the schema fails here rather than being
// ignored by editors; not about Ajv's own style rules for `type`.
const ajv = new Ajv({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
const matchesSchema = ajv.compile(schema);

type Node = Record<string, unknown>;
type SchemaNode = { [key: string]: any };
const definitions = schema.definitions as Record<string, SchemaNode>;

/** The load errors of a Definition, or `[]` when it loads. */
function loadErrors(definition: unknown): readonly FormError[] {
  try {
    compile(definition);
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
}

/** Both the loader and the JSON Schema reject `definition`. */
function expectBothReject(definition: unknown) {
  expect(loadErrors(definition)).not.toEqual([]);
  expect(matchesSchema(definition)).toBe(false);
}

/** Every Component of a Definition, through `components` and `pages`. */
function* componentsOf(node: unknown): Generator<Node> {
  if (typeof node !== 'object' || node === null) return;
  const { components, pages } = node as Node;
  for (const list of [components, pages]) {
    if (!Array.isArray(list)) continue;
    for (const child of list as Node[]) {
      yield child;
      yield* componentsOf(child);
    }
  }
}

const valid = Object.values(validDefinitions);
const validComponents = valid.flatMap((definition) => [...componentsOf(definition)]);

const builtinTypes = [...builtinFieldTypes.keys(), ...builtinComponents.keys()];

/** The JSON Schema of a built-in `type`. */
function schemaOf(type: string): SchemaNode {
  if (type === 'tab' || type === 'page') return definitions[type];
  const branch = definitions.component.allOf.find(
    (entry: SchemaNode) => entry.if?.properties?.type?.const === type,
  );
  expect(branch, `the JSON Schema has no branch for "${type}"`).toBeDefined();
  return definitions[branch.then.$ref.replace('#/definitions/', '')];
}

/** A minimal valid Definition holding one `node` of each built-in type. */
function holding(type: string): { definition: Node; node: Node } {
  const node: Node = { type };
  if (builtinFieldTypes.has(type)) node.name = 'value';
  if (type === 'choice' || type === 'multi_choice') node.choices = ['a', 'b'];
  if (type === 'object' || type === 'repeater') {
    node.name = 'value';
    node.components = [{ type: 'text', name: 'x' }];
  }
  if (type === 'section' || type === 'tab' || type === 'page') node.components = [];
  if (type === 'tab') node.label = 'Tab';
  if (type === 'content') node.text = 'Hi';
  if (type === 'tabs') node.components = [{ type: 'tab', label: 'Tab', components: [] }];
  if (type === 'page') return { definition: { version: 1, pages: [node] }, node };
  if (type === 'tab') {
    return { definition: { version: 1, components: [{ type: 'tabs', components: [node] }] }, node };
  }
  return { definition: { version: 1, components: [node] }, node };
}

describe('The published JSON Schema agrees with the loader', () => {
  it.each(Object.entries(validDefinitions))('accepts the valid Definition %s', (_, definition) => {
    expect(loadErrors(definition)).toEqual([]);
    expect(matchesSchema(definition), ajv.errorsText(matchesSchema.errors)).toBe(true);
  });

  it.each(invalidDefinitions.map((fixture) => [fixture.name, fixture] as const))(
    'rejects the invalid Definition %s',
    (_, fixture) => {
      const messages = loadErrors(fixture.definition).map((error) => error.message);
      expect(messages).toContain(fixture.error);
      // A loader-only mistake must pass the schema, so tightening the schema
      // moves the fixture out of the loader-only list.
      expect(matchesSchema(fixture.definition)).toBe(fixture.loaderOnly !== undefined);
    },
  );

  it.each(builtinTypes)('describes the keys of a "%s", as the fixtures use them', (type) => {
    const used = new Set(
      validComponents.filter((node) => node.type === type).flatMap((node) => Object.keys(node)),
    );
    const own = builtinFieldTypes.get(type)?.keys ?? builtinComponents.get(type)!.keys;
    const loaderKeys = Object.keys(builtinFieldTypes.has(type) ? { ...fieldKeys, ...own } : own);
    // A key the loader takes but no fixture uses would go unchecked.
    expect([...used]).toEqual(expect.arrayContaining(loaderKeys));
    expect(Object.keys(schemaOf(type).properties).sort()).toEqual([...used].sort());
  });

  it.each(builtinTypes)('requires the same keys of a "%s" as the loader', (type) => {
    expect(loadErrors(holding(type).definition)).toEqual([]);
    for (const key of Object.keys(holding(type).node)) {
      const { definition, node } = holding(type);
      delete node[key];
      const loaderRequires = loadErrors(definition).length > 0;
      expect(matchesSchema(definition), `without "${key}"`).toBe(!loaderRequires);
    }
  });

  it.each(builtinTypes)('rejects an unknown key on a "%s"', (type) => {
    const { definition, node } = holding(type);
    node.unknown = true;
    expectBothReject(definition);
  });

  const ruleUses = new Set(
    validComponents.flatMap((node) =>
      ((node.rules as Node[] | undefined) ?? []).map((rule) => `${rule.type} on ${node.type}`),
    ),
  );
  const ruleCases = [...builtinRules.values()].flatMap((spec) =>
    spec.appliesTo.map((type) => [spec.type, type] as const),
  );

  it.each(ruleCases)('takes the Rule "%s" on a "%s" Field in a fixture', (rule, type) => {
    expect(ruleUses).toContain(`${rule} on ${type}`);
  });

  const typesWithRules = [...builtinFieldTypes.keys(), 'repeater'];
  const misplacedRules = [...builtinRules.values()].flatMap((spec) =>
    typesWithRules
      .filter((type) => !spec.appliesTo.includes(type))
      .map((type) => [spec.type, type] as const),
  );

  it.each(misplacedRules)('rejects the Rule "%s" on a "%s" Field', (rule, type) => {
    const sample = validComponents
      .flatMap((node) => (node.rules as Node[] | undefined) ?? [])
      .find((item) => item.type === rule)!;
    const { definition, node } = holding(type);
    node.rules = [sample];
    expectBothReject(definition);
  });

  it.each(definitions.conditionLeaf.properties.operator.enum as string[])(
    'takes the operator "%s" in a fixture',
    (operator) => {
      expect(JSON.stringify(valid)).toContain(`"operator":"${operator}"`);
    },
  );
});

describe('The published JSON Schema', () => {
  it('is draft-07, and only references definitions with no keywords beside "$ref"', () => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    // Draft-07 editors ignore keywords beside "$ref"; Ajv would not, so this
    // test would pass on a schema that editors read differently.
    const visit = (node: unknown, at: string) => {
      if (typeof node !== 'object' || node === null) return;
      if ('$ref' in node) expect(Object.keys(node), at).toEqual(['$ref']);
      for (const [key, child] of Object.entries(node)) visit(child, `${at}/${key}`);
    };
    visit(schema, '#');
  });

  it('is published at the location Definitions reference, inside the package', () => {
    expect(schema.$id).toBe(SCHEMA_URL);
    expect(SCHEMA_URL.endsWith(`/${pkg.name}/schema/v1.json`)).toBe(true);
    expect(pkg.files).toContain('schema');
  });

  it('lets compile load a Definition that names it in $schema', () => {
    const compiled = compile({
      $schema: SCHEMA_URL,
      version: 1,
      components: [{ type: 'text', name: 'name', required: true }],
    });
    expect(compiled.definition.$schema).toBe(SCHEMA_URL);
    expect(compiled['~standard'].validate({ name: 'Ada' })).toEqual({ value: { name: 'Ada' } });
  });
});
