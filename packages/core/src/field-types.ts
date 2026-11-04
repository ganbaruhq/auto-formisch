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
  /**
   * The JavaScript type of a value, which its Widget can rely on. A starting
   * value of another type is dropped; one of this type is kept even when
   * `value` would reject it, so that submitting reports it. A custom Field
   * Type has none: the loader derives one per node from its schema.
   */
  readonly shape?: ValueShape;
}

/** A Field Type's JavaScript value type, and how to name it in a warning. */
export interface ValueShape {
  readonly is: (value: unknown) => boolean;
  /** Such as `a string`. */
  readonly expected: string;
}

/** Why a value is not of the `expected` JavaScript type, such as `Expected a string, not a number`. */
export const shapeMessage = (expected: string, value: unknown): string =>
  `Expected ${expected}, not ${describe(value)}`;

const describe = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
};

const isString = (value: unknown) => typeof value === 'string';
const isChoiceValue = (value: unknown) =>
  typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/**
 * Keys every value Field takes beside `type`, `name`, `rules` and the
 * Condition keys `visible`, `disabled` and `required`, with their schemas.
 */
export const fieldKeys: Readonly<Record<string, v.GenericSchema>> = {
  label: v.string(),
  description: v.string(),
  // Presentation only: core never validates by `widget`; the Renderer checks the name.
  widget: v.string(),
  requiredMessage: v.string(),
};

const text: FieldTypeSpec = {
  type: 'text',
  keys: { placeholder: v.string() },
  value: () => v.string(),
  shape: { is: isString, expected: 'a string' },
};

const number: FieldTypeSpec = {
  type: 'number',
  keys: { placeholder: v.string() },
  value: () => v.pipe(v.number(), v.finite()),
  shape: {
    is: (value) => typeof value === 'number' && Number.isFinite(value),
    expected: 'a number',
  },
};

const boolean: FieldTypeSpec = {
  type: 'boolean',
  keys: {},
  value: () => v.boolean(),
  shape: { is: (value) => typeof value === 'boolean', expected: 'a boolean' },
};

const choice: FieldTypeSpec = {
  type: 'choice',
  keys: { choices: choicesSchema, placeholder: v.string() },
  requiredKeys: ['choices'],
  value: (node) => v.picklist((node as ChoiceField).choices.map(choiceValue)),
  shape: { is: isChoiceValue, expected: 'a string or a number' },
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
  shape: {
    is: (value) => Array.isArray(value) && value.every(isChoiceValue),
    expected: 'a list of strings or numbers',
  },
};

const date: FieldTypeSpec = {
  type: 'date',
  keys: {},
  value: () => dateSchema,
  shape: { is: isString, expected: 'a string' },
};

export const builtinFieldTypes: ReadonlyMap<string, FieldTypeSpec> = new Map(
  [text, number, boolean, choice, multiChoice, date].map((spec) => [spec.type, spec]),
);
