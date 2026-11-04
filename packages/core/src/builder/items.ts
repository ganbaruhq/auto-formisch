import type { Condition, RuleNode } from '../definition';
import {
  set,
  type ComponentType,
  type CustomType,
  type FieldType,
  type PipeItem,
  type ValueType,
} from './pipe';

/*
 * Pipe items for metadata, settings and Conditions. Like Valibot's `title` and
 * `description`, they sit in the pipe beside the Rules.
 */

export const label = (text: string): PipeItem<FieldType | 'section'> => set({ label: text });

export const description = (text: string): PipeItem<FieldType | 'section' | 'tab'> =>
  set({ description: text });

export const placeholder = (text: string): PipeItem<'text' | 'number' | 'choice' | CustomType> =>
  set({ placeholder: text });

/** The Widget that presents this Field or Content, instead of the one named by its `type`. */
export const widget = (name: string): PipeItem<FieldType | 'content'> => set({ widget: name });

/** Lays out the direct children in this many grid columns. */
export const columns = (count: number): PipeItem<'section' | 'tab'> => set({ columns: count });

/** Grid columns this Component spans, inside a Layout that sets `columns`. */
export const colSpan = (count: number): PipeItem<Exclude<ComponentType, 'tab'>> =>
  set({ colSpan: count });

/** Shown, and so active, only while `condition` holds. */
export const visible = (condition: Condition): PipeItem<ComponentType, never, 'inactive'> =>
  set({ visible: condition });

/**
 * Disabled, and so Inactive, always or while `condition` holds. Disables the
 * Fields of an `object` or Repeater too.
 */
export const disabled = (condition?: Condition): PipeItem<FieldType, never, 'inactive'> =>
  set({ disabled: condition ?? true });

/**
 * The Field must have a value: always, or while `condition` holds. `message`
 * replaces the default required message.
 */
export function required(message?: string): PipeItem<ValueType, never, 'required'>;
export function required(condition: Condition, message?: string): PipeItem<ValueType>;
export function required(
  first?: string | Condition,
  message?: string,
): PipeItem<ValueType, never, any> {
  if (first === undefined || typeof first === 'string') {
    return set(
      first === undefined ? { required: true } : { required: true, requiredMessage: first },
    );
  }
  return set(
    message === undefined ? { required: first } : { required: first, requiredMessage: message },
  );
}

/**
 * The value a new form starts with, as the JSON key `default`. It only seeds
 * the form: a value the user clears stays empty, and the server never fills it.
 */
export const defaultValue = <const V>(value: V): PipeItem<ValueType, V> => set({ default: value });

/*
 * Rules. Each applies only to the Field Types its JSON Rule does, so a Rule on
 * the wrong Field fails to compile.
 */

const rule = (type: string, requirement?: unknown, message?: string): RuleNode => ({
  type,
  ...(requirement === undefined ? {} : { requirement }),
  ...(message === undefined ? {} : { message }),
});

const ruleItem = <I extends PipeItem<any>>(node: RuleNode, hint?: string): I =>
  ({ '~action': { kind: 'rule', rule: node, widget: hint } }) as I;

/** An email address. Also presents the Field with the `email` Widget, unless the pipe names one. */
export const email = (message?: string): PipeItem<'text'> =>
  ruleItem(rule('email', undefined, message), 'email');

/** An absolute URL. Also presents the Field with the `url` Widget, unless the pipe names one. */
export const url = (message?: string): PipeItem<'text'> =>
  ruleItem(rule('url', undefined, message), 'url');

export const minLength = (requirement: number, message?: string): PipeItem<'text'> =>
  ruleItem(rule('min_length', requirement, message));

export const maxLength = (requirement: number, message?: string): PipeItem<'text'> =>
  ruleItem(rule('max_length', requirement, message));

/** At least `requirement`: a number on a `number` Field, a `YYYY-MM-DD` date on a `date` Field. */
export function minValue(requirement: number, message?: string): PipeItem<'number'>;
export function minValue(requirement: string, message?: string): PipeItem<'date'>;
export function minValue(requirement: number | string, message?: string): PipeItem<any> {
  return ruleItem(rule('min_value', requirement, message));
}

/** At most `requirement`: a number on a `number` Field, a `YYYY-MM-DD` date on a `date` Field. */
export function maxValue(requirement: number, message?: string): PipeItem<'number'>;
export function maxValue(requirement: string, message?: string): PipeItem<'date'>;
export function maxValue(requirement: number | string, message?: string): PipeItem<any> {
  return ruleItem(rule('max_value', requirement, message));
}

export const integer = (message?: string): PipeItem<'number'> =>
  ruleItem(rule('integer', undefined, message));

/** The `boolean` Field is `true`. */
export const accepted = (message?: string): PipeItem<'boolean'> =>
  ruleItem(rule('accepted', undefined, message));

/** At least `requirement` choices on a `multi_choice` Field, or rows on a Repeater. */
export const minItems = (
  requirement: number,
  message?: string,
): PipeItem<'multi_choice' | 'repeater'> => ruleItem(rule('min_items', requirement, message));

/** At most `requirement` choices on a `multi_choice` Field, or rows on a Repeater. */
export const maxItems = (
  requirement: number,
  message?: string,
): PipeItem<'multi_choice' | 'repeater'> => ruleItem(rule('max_items', requirement, message));
