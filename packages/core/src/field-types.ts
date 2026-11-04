import * as v from 'valibot';
import type { FieldNode } from './definition';

/**
 * How `core` loads and compiles one built-in Field Type.
 *
 * To add a single-value Field Type, add its node type to `definition.ts` and an
 * entry to `builtinFieldTypes`. Its Rules declare `appliesTo` in `rules.ts`.
 */
export interface FieldTypeSpec {
  readonly type: string;
  /** Keys this type takes beside `type`, `name`, `rules` and `fieldKeys`. */
  readonly keys: Readonly<Record<string, v.GenericSchema>>;
  /** The typed value schema. It never sees an empty or Inactive value. */
  readonly value: (node: FieldNode) => v.GenericSchema;
}

/** Keys every Field takes beside `type`, `name` and `rules`, with their schemas. */
export const fieldKeys: Readonly<Record<string, v.GenericSchema>> = {
  label: v.string(),
  description: v.string(),
  // Presentation only: core never validates by `widget`; the Renderer checks the name.
  widget: v.string(),
  required: v.boolean(),
  requiredMessage: v.string(),
};

const text: FieldTypeSpec = {
  type: 'text',
  keys: { placeholder: v.string() },
  value: () => v.string(),
};

export const builtinFieldTypes: ReadonlyMap<string, FieldTypeSpec> = new Map(
  [text].map((spec) => [spec.type, spec]),
);
