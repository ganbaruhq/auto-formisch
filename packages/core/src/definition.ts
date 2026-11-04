/**
 * The Form Definition format, version 1.
 *
 * These types describe a Definition that has passed the loader. Add a new
 * Component `type` by adding its node type here, to the `Component` union, and
 * to the loader's table in `field-types.ts` (Fields) or a sibling table
 * (Layouts, Content).
 */

/** The only Form Definition format version this package reads. */
export const DEFINITION_VERSION = 1;

/** A serializable validation constraint declared on a Field. */
export interface RuleNode {
  readonly type: string;
  readonly requirement?: unknown;
  readonly message?: string;
}

/** Keys shared by every Field. */
export interface FieldBase {
  readonly type: string;
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly widget?: string;
  readonly required?: boolean;
  readonly requiredMessage?: string;
  readonly rules?: readonly RuleNode[];
}

/** A single-line or multi-line text value. */
export interface TextField extends FieldBase {
  readonly type: 'text';
  readonly placeholder?: string;
}

/** A finite number. */
export interface NumberField extends FieldBase {
  readonly type: 'number';
  readonly placeholder?: string;
}

/** `true` or `false`; `false` is a value, not empty. */
export interface BooleanField extends FieldBase {
  readonly type: 'boolean';
}

/** The submitted value of one choice. One list never mixes strings and numbers. */
export type ChoiceValue = string | number;

/** One option of a `choice` or `multi_choice` Field. */
export type Choice = ChoiceValue | { readonly value: ChoiceValue; readonly label?: string };

/** One value from a fixed list of `choices`. */
export interface ChoiceField extends FieldBase {
  readonly type: 'choice';
  readonly choices: readonly Choice[];
  readonly placeholder?: string;
}

/** Any number of distinct values from a fixed list of `choices`. */
export interface MultiChoiceField extends FieldBase {
  readonly type: 'multi_choice';
  readonly choices: readonly Choice[];
}

/** A calendar date as a `YYYY-MM-DD` string, with no time or time zone. */
export interface DateField extends FieldBase {
  readonly type: 'date';
}

/** Any Field this package knows. */
export type FieldNode =
  | TextField
  | NumberField
  | BooleanField
  | ChoiceField
  | MultiChoiceField
  | DateField;

/** Any node in a Form Definition's tree. */
export type Component = FieldNode;

/** A loaded, version 1 Form Definition. */
export interface FormDefinition {
  readonly $schema?: string;
  readonly version: typeof DEFINITION_VERSION;
  readonly components: readonly Component[];
}
