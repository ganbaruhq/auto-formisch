import type { CustomFieldTypeSpec, FieldType, Rule } from './extensions';
import { builtinFieldTypes, type FieldTypeSpec } from './field-types';
import { builtinRules, type RuleSpec } from './rules';

/** The custom Field Types and Rules a Definition may use, passed to `compile` and `form`. */
export interface LoadOptions {
  /** Made by `defineFieldType`. */
  readonly fieldTypes?: readonly Pick<FieldType, '~fieldType'>[];
  /** Made by `defineRule`. */
  readonly rules?: readonly Pick<Rule, '~rule'>[];
}

/** The Field Types and Rules one load and compile know: the built-ins and the custom ones. */
export interface Registry {
  readonly fieldTypes: ReadonlyMap<string, FieldTypeSpec | CustomFieldTypeSpec>;
  readonly rules: ReadonlyMap<string, RuleSpec>;
}

export const builtins: Registry = { fieldTypes: builtinFieldTypes, rules: builtinRules };

export const isCustom = (spec: FieldTypeSpec): spec is CustomFieldTypeSpec => 'custom' in spec;

/**
 * The built-ins plus `options`. Nothing is kept between calls.
 *
 * @throws {TypeError} for an entry not made by `defineFieldType` or
 * `defineRule`, or a name used twice across both lists.
 */
export function registryOf(options: LoadOptions = {}): Registry {
  const { fieldTypes = [], rules = [] } = options;
  if (fieldTypes.length === 0 && rules.length === 0) return builtins;
  const names = new Set<string>();
  const unique = (type: string) => {
    if (names.has(type)) throw new TypeError(`"${type}" is registered twice`);
    names.add(type);
  };
  const types = new Map<string, FieldTypeSpec | CustomFieldTypeSpec>(builtinFieldTypes);
  for (const fieldType of fieldTypes) {
    const spec = (fieldType as Partial<FieldType>)?.['~fieldType'];
    if (spec === undefined) throw new TypeError('Pass Field Types made by defineFieldType');
    unique(spec.type);
    types.set(spec.type, spec);
  }
  const ruleSpecs = new Map<string, RuleSpec>(builtinRules);
  for (const rule of rules) {
    const spec = (rule as Partial<Rule>)?.['~rule'];
    if (spec === undefined) throw new TypeError('Pass Rules made by defineRule');
    unique(spec.type);
    ruleSpecs.set(spec.type, spec);
  }
  return { fieldTypes: types, rules: ruleSpecs };
}
