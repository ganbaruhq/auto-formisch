/**
 * The Form Definition format, version 1.
 *
 * These types describe a Definition that has passed the loader. Add a new
 * Component `type` by adding its node type here, to the `Component` union, and
 * to the loader's table in `field-types.ts` (value Fields) or `components.ts`
 * (`object`, `repeater`, Layouts, Content).
 */

/** The only Form Definition format version this package reads. */
export const DEFINITION_VERSION = 1;

/** A serializable validation constraint declared on a Field. */
export interface RuleNode {
  readonly type: string;
  readonly requirement?: unknown;
  readonly message?: string;
}

/**
 * A Condition operator. Which ones a leaf may use depends on the `type` of the
 * Field it reads; `in` and `not_in` take a non-empty list, `empty` and
 * `not_empty` take no `value`.
 */
export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'empty'
  | 'not_empty';

/**
 * A Condition leaf: compares the value of one Field with a literal. `field` is
 * a reference relative to the data scope of the Component that holds the
 * Condition: `../` steps first, then `name`s joined by `.`, never an index.
 */
export interface ConditionLeaf {
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value?: unknown;
}

/** True when every Condition is; never empty. */
export interface AllCondition {
  readonly all: readonly Condition[];
}

/** True when at least one Condition is; never empty. */
export interface AnyCondition {
  readonly any: readonly Condition[];
}

export interface NotCondition {
  readonly not: Condition;
}

/**
 * A serializable predicate over Field values, nested at most
 * `MAX_CONDITION_DEPTH` levels. A Field that is Inactive reads as empty.
 */
export type Condition = ConditionLeaf | AllCondition | AnyCondition | NotCondition;

/** The most levels a Condition nests, its leaves included. */
export const MAX_CONDITION_DEPTH = 8;

/** Keys shared by every Field. */
export interface FieldBase {
  readonly type: string;
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly widget?: string;
  /** Grid columns this Field spans; only inside a Layout that sets `columns`. */
  readonly colSpan?: number;
  /** Shown, and so active, only while this holds. */
  readonly visible?: Condition;
  /**
   * Disabled, and so Inactive, when `true` or while this holds. Disables the
   * Fields of an `object` or Repeater too.
   */
  readonly disabled?: boolean | Condition;
}

/** Keys shared by every Field that holds one value rather than child Fields. */
export interface ValueFieldBase extends FieldBase {
  /** Must have a value when `true` or while this holds. Not inherited by children. */
  readonly required?: boolean | Condition;
  readonly requiredMessage?: string;
  readonly rules?: readonly RuleNode[];
  /**
   * The value a new form starts with: non-empty, of the Field's type, and
   * through its Rules. It seeds the form only and stays out of the schema.
   */
  readonly default?: unknown;
}

/** A single-line or multi-line text value. */
export interface TextField extends ValueFieldBase {
  readonly type: 'text';
  readonly placeholder?: string;
  readonly default?: string;
}

/** A finite number. */
export interface NumberField extends ValueFieldBase {
  readonly type: 'number';
  readonly placeholder?: string;
  readonly default?: number;
}

/** `true` or `false`; `false` is a value, not empty. */
export interface BooleanField extends ValueFieldBase {
  readonly type: 'boolean';
  readonly default?: boolean;
}

/** The submitted value of one choice. One list never mixes strings and numbers. */
export type ChoiceValue = string | number;

/** One option of a `choice` or `multi_choice` Field. */
export type Choice = ChoiceValue | { readonly value: ChoiceValue; readonly label?: string };

/** One value from a fixed list of `choices`. */
export interface ChoiceField extends ValueFieldBase {
  readonly type: 'choice';
  readonly choices: readonly Choice[];
  readonly placeholder?: string;
  readonly default?: ChoiceValue;
}

/** Any number of distinct values from a fixed list of `choices`. */
export interface MultiChoiceField extends ValueFieldBase {
  readonly type: 'multi_choice';
  readonly choices: readonly Choice[];
  readonly default?: readonly ChoiceValue[];
}

/** A calendar date as a `YYYY-MM-DD` string, with no time or time zone. */
export interface DateField extends ValueFieldBase {
  readonly type: 'date';
  readonly default?: string;
}

/** Any Field that holds one value. */
export type ValueField =
  | TextField
  | NumberField
  | BooleanField
  | ChoiceField
  | MultiChoiceField
  | DateField;

/**
 * Nested data: the values of its Fields, under its `name`. It has no
 * `required` and always keeps its key, as `{}` when nothing in it has a value.
 * Its Components are their own data scope.
 */
export interface ObjectField extends FieldBase {
  readonly type: 'object';
  readonly components: readonly Component[];
}

/**
 * A list of rows, each an object built from the same template of Components.
 * It has no `required` and always keeps its key, as `[]` when it has no rows;
 * `min_items: 1` asks for at least one. Each row is its own data scope.
 */
export interface RepeaterField extends FieldBase {
  readonly type: 'repeater';
  readonly rules?: readonly RuleNode[];
  /** The template of one row. */
  readonly components: readonly Component[];
}

/** Any Field this package knows. */
export type FieldNode = ValueField | ObjectField | RepeaterField;

/**
 * A Field of a custom Field Type registered with `defineFieldType`: one JSON
 * value, the type's own options as flat keys, and no `rules`.
 *
 * It is not a member of `Component`, whose members are told apart by `type`.
 * A Definition compiled with custom Field Types holds these wherever a value
 * Field may sit; code that switches on `type` reaches them in its default
 * branch, as a value Field.
 */
export type CustomField<TType extends string = string, TOptions extends object = {}> = Omit<
  ValueFieldBase,
  'rules' | 'type'
> & {
  readonly type: TType;
  readonly placeholder?: string;
} & TOptions;

/** A group of Components, optionally labelled and laid out in a grid. Adds no data path. */
export interface SectionLayout {
  readonly type: 'section';
  readonly visible?: Condition;
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
  readonly visible?: Condition;
  readonly colSpan?: number;
  readonly components: readonly TabLayout[];
}

/** One Tab, directly inside `tabs`. Adds no data path. */
export interface TabLayout {
  readonly type: 'tab';
  readonly visible?: Condition;
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
  readonly visible?: Condition;
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
