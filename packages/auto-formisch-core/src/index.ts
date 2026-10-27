import type * as v from 'valibot';

export type FormSchema = v.GenericSchema<Record<string, unknown>>;
export type Widget = 'text' | 'email' | 'number' | 'checkbox' | 'textarea';
export interface FieldUI {
  label?: string;
  description?: string;
  placeholder?: string;
  widget?: Widget;
}
export type UISchema = Record<string, FieldUI>;
export interface Rule {
  type: 'email' | 'min_length' | 'max_length' | 'min_value' | 'max_value';
  requirement?: number;
  message?: string;
}
export interface FieldDefinition {
  type: 'string' | 'number' | 'boolean';
  optional?: boolean;
  rules: Rule[];
}
export interface FormDefinition {
  version: 1;
  fields: Record<string, FieldDefinition>;
  ui: UISchema;
}
export interface FormField extends FieldUI {
  name: string;
  type: FieldDefinition['type'];
  required: boolean;
}

function inspect(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Expected a Valibot schema');
  return value as Record<string, unknown>;
}

function pipelineActions(node: Record<string, unknown>): unknown[] {
  const pipeline = node.pipe as unknown[] | undefined;
  return pipeline ? [...pipelineActions(inspect(pipeline[0])), ...pipeline.slice(1)] : [];
}

/** A deliberately limited, lossless codec. Unsupported behavior must never disappear. */
export function describeSchema(schema: FormSchema, ui: UISchema = {}): FormDefinition {
  const root = inspect(schema);
  if (root.type !== 'object' || root.pipe || root.async || root.message !== undefined)
    throw new Error('Only unpiped object roots are supported');
  const fields: Record<string, FieldDefinition> = Object.create(null);
  for (const [name, raw] of Object.entries(inspect(root.entries))) {
    let node = inspect(raw);
    const optional = node.type === 'optional';
    if (node.async) throw new Error(`Async schemas are unsupported: ${name}`);
    if (optional) {
      if (node.default !== undefined || node.pipe)
        throw new Error(`Unsupported optional default or pipeline: ${name}`);
      node = inspect(node.wrapped);
    }
    if (!['string', 'number', 'boolean'].includes(String(node.type)))
      throw new Error(`Unsupported field: ${name} (${String(node.type)})`);
    if (node.message !== undefined)
      throw new Error(`Custom base messages cannot be serialized: ${name}`);
    const rules: Rule[] = [];
    for (const action of pipelineActions(node)) {
      const item = inspect(action);
      const type = item.type as Rule['type'];
      const allowed =
        node.type === 'string'
          ? ['email', 'min_length', 'max_length']
          : node.type === 'number'
            ? ['min_value', 'max_value']
            : [];
      if (
        item.async ||
        !allowed.includes(type) ||
        (item.message !== undefined && typeof item.message !== 'string')
      )
        throw new Error(`Unsupported action: ${name} (${String(type)})`);
      rules.push({
        type,
        ...(type !== 'email' ? { requirement: item.requirement as number } : {}),
        ...(item.message !== undefined ? { message: item.message as string } : {}),
      });
    }
    fields[name] = {
      type: node.type as FieldDefinition['type'],
      ...(optional ? { optional: true } : {}),
      rules,
    };
  }
  for (const name of Object.keys(ui)) {
    if (!Object.hasOwn(fields, name)) throw new Error(`Unknown UI field: ${name}`);
    const widget = ui[name].widget;
    const allowed =
      fields[name].type === 'string'
        ? ['text', 'email', 'textarea']
        : fields[name].type === 'number'
          ? ['number']
          : ['checkbox'];
    if (widget && !allowed.includes(widget))
      throw new Error(`Incompatible widget: ${name} (${widget})`);
  }
  return { version: 1, fields, ui };
}

export function getFields(schema: FormSchema, ui: UISchema = {}): FormField[] {
  const definition = describeSchema(schema, ui);
  return Object.entries(definition.fields).map(([name, field]) => ({
    name,
    type: field.type,
    required: !field.optional,
    label: name,
    widget:
      field.type === 'boolean'
        ? 'checkbox'
        : field.type === 'number'
          ? 'number'
          : field.rules.some((rule) => rule.type === 'email')
            ? 'email'
            : 'text',
    ...ui[name],
  }));
}
