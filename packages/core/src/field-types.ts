import * as v from 'valibot';
import { choicesSchema, choiceValue } from './choices';
import { dateSchema } from './date';
import type { ChoiceField, FieldNode, MultiChoiceField } from './definition';

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
  /** Keys of `keys` that the Field must have. */
  readonly requiredKeys?: readonly string[];
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

const number: FieldTypeSpec = {
  type: 'number',
  keys: { placeholder: v.string() },
  value: () => v.pipe(v.number(), v.finite()),
};

const boolean: FieldTypeSpec = {
  type: 'boolean',
  keys: {},
  value: () => v.boolean(),
};

const choice: FieldTypeSpec = {
  type: 'choice',
  keys: { choices: choicesSchema, placeholder: v.string() },
  requiredKeys: ['choices'],
  value: (node) => v.picklist((node as ChoiceField).choices.map(choiceValue)),
};

const multiChoice: FieldTypeSpec = {
  type: 'multi_choice',
  keys: { choices: choicesSchema },
  requiredKeys: ['choices'],
  value: (node) => {
    const listed = v.picklist((node as MultiChoiceField).choices.map(choiceValue));
    // The Field is one value in the store, so every error stays on its own path
    // rather than on an item the Renderer has no Field for.
    return v.pipe(
      v.array(v.unknown()),
      v.rawCheck(({ dataset, config, addIssue }) => {
        if (!dataset.typed) return;
        const seen = new Set<unknown>();
        for (const item of dataset.value) {
          // In the language of the whole parse.
          const result = v.safeParse(listed, item, { lang: config.lang });
          if (!result.success) addIssue({ message: result.issues[0].message, input: item });
          else if (seen.has(item)) addIssue({ message: `Duplicate value ${JSON.stringify(item)}` });
          seen.add(item);
        }
      }),
    );
  },
};

const date: FieldTypeSpec = {
  type: 'date',
  keys: {},
  value: () => dateSchema,
};

export const builtinFieldTypes: ReadonlyMap<string, FieldTypeSpec> = new Map(
  [text, number, boolean, choice, multiChoice, date].map((spec) => [spec.type, spec]),
);
