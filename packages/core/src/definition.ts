/**
 * The Form Definition format, version 1.
 *
 * These types describe a Definition that has passed the loader. Add a new
 * Component `type` by adding its node type here, to the `Component` union, and
 * to the loader's table in `field-types.ts` (Fields) or `layouts.ts` (Layouts,
 * Content).
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
  /** Grid columns this Field spans; only inside a Layout that sets `columns`. */
  readonly colSpan?: number;
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

/** A group of Components, optionally labelled and laid out in a grid. Adds no data path. */
export interface SectionLayout {
  readonly type: 'section';
  readonly label?: string;
  readonly description?: string;
  /** Lays out the direct children in this many grid columns. */
  readonly columns?: number;
  readonly colSpan?: number;
  readonly components: readonly Component[];
}

/** A set of Tabs. Only one is shown, but every Tab stays mounted and validated. */
export interface TabsLayout {
  readonly type: 'tabs';
  readonly colSpan?: number;
  readonly components: readonly TabLayout[];
}

/** One Tab, directly inside `tabs`. Adds no data path. */
export interface TabLayout {
  readonly type: 'tab';
  readonly label: string;
  readonly description?: string;
  readonly columns?: number;
  readonly components: readonly Component[];
}

/** A Component that only arranges other Components. */
export type LayoutNode = SectionLayout | TabsLayout | TabLayout;

/** Fixed plain text. Never read as HTML or Markdown. */
export interface ContentNode {
  readonly type: 'content';
  readonly text: string;
  /** Presentation only, looked up in the Renderer's Widget map like a Field's. */
  readonly widget?: string;
  readonly colSpan?: number;
}

/** Any node in a Form Definition's tree. */
export type Component = FieldNode | LayoutNode | ContentNode;

/** A loaded, version 1 Form Definition. */
export interface FormDefinition {
  readonly $schema?: string;
  readonly version: typeof DEFINITION_VERSION;
  readonly components: readonly Component[];
}
