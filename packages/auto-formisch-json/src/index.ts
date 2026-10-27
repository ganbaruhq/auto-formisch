import * as v from 'valibot';
import {
  describeSchema,
  type FormDefinition,
  type FormSchema,
  type UISchema,
} from 'auto-formisch-core';

const ruleSchema = v.strictObject({
  type: v.picklist(['email', 'min_length', 'max_length', 'min_value', 'max_value']),
  requirement: v.optional(v.pipe(v.number(), v.finite())),
  message: v.optional(v.string()),
});
const definitionSchema = v.strictObject({
  version: v.literal(1),
  fields: v.record(
    v.string(),
    v.strictObject({
      type: v.picklist(['string', 'number', 'boolean']),
      optional: v.optional(v.boolean()),
      rules: v.array(ruleSchema),
    }),
  ),
  ui: v.record(
    v.string(),
    v.strictObject({
      label: v.optional(v.string()),
      description: v.optional(v.string()),
      placeholder: v.optional(v.string()),
      widget: v.optional(v.picklist(['text', 'email', 'number', 'checkbox', 'textarea'])),
    }),
  ),
});

export function fromDefinition(input: FormDefinition): { schema: FormSchema; ui: UISchema } {
  const definition = v.parse(definitionSchema, input);
  const entries: Record<string, v.GenericSchema> = Object.create(null);
  for (const [name, field] of Object.entries(definition.fields)) {
    let schema: v.GenericSchema =
      field.type === 'string' ? v.string() : field.type === 'number' ? v.number() : v.boolean();
    for (const rule of field.rules) {
      const allowed =
        field.type === 'string'
          ? ['email', 'min_length', 'max_length']
          : field.type === 'number'
            ? ['min_value', 'max_value']
            : [];
      if (!allowed.includes(rule.type)) throw new Error(`Invalid rule for ${name}`);
      if (
        rule.type !== 'email' &&
        (rule.requirement === undefined ||
          (rule.type.endsWith('length') &&
            (!Number.isInteger(rule.requirement) || rule.requirement < 0)))
      )
        throw new Error(`Invalid requirement for ${name}`);
      // Runtime checks above correlate the schema and action types.
      switch (rule.type) {
        case 'email':
          schema = v.pipe(schema as v.GenericSchema<string>, v.email(rule.message));
          break;
        case 'min_length':
          schema = v.pipe(
            schema as v.GenericSchema<string>,
            v.minLength(rule.requirement!, rule.message),
          );
          break;
        case 'max_length':
          schema = v.pipe(
            schema as v.GenericSchema<string>,
            v.maxLength(rule.requirement!, rule.message),
          );
          break;
        case 'min_value':
          schema = v.pipe(
            schema as v.GenericSchema<number>,
            v.minValue(rule.requirement!, rule.message),
          );
          break;
        case 'max_value':
          schema = v.pipe(
            schema as v.GenericSchema<number>,
            v.maxValue(rule.requirement!, rule.message),
          );
          break;
      }
    }
    entries[name] = field.optional ? v.optional(schema) : schema;
  }
  const schema = v.object(entries);
  describeSchema(schema, definition.ui);
  return { schema, ui: definition.ui };
}

export function serialize(schema: FormSchema, ui: UISchema = {}): string {
  const definition = describeSchema(schema, ui);
  fromDefinition(definition);
  return JSON.stringify(definition);
}

export function deserialize(json: string): { schema: FormSchema; ui: UISchema } {
  return fromDefinition(v.parse(definitionSchema, JSON.parse(json)));
}
