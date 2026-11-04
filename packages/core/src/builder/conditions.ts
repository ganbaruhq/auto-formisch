import type {
  AllCondition,
  AnyCondition,
  ChoiceValue,
  Condition,
  ConditionLeaf,
  NotCondition,
} from '../definition';

/*
 * Condition helpers. Each returns the Condition's JSON as is. A reference is a
 * string relative to the data scope of the Component that holds the Condition
 * (`../` steps, then names joined by `.`); `form()` checks it, since nothing
 * can check it before the whole form exists.
 */

/** A literal a Field's value can equal. */
export type Literal = ChoiceValue | boolean;

/** A literal that orders: a number, or a `YYYY-MM-DD` date. */
export type Bound = number | string;

const leaf = (field: string, operator: ConditionLeaf['operator'], value: unknown) =>
  ({ field, operator, value }) as ConditionLeaf;

/** True when every Condition is. */
export const all = (...conditions: readonly [Condition, ...Condition[]]): AllCondition => ({
  all: conditions,
});

/** True when at least one Condition is. */
export const any = (...conditions: readonly [Condition, ...Condition[]]): AnyCondition => ({
  any: conditions,
});

export const not = (condition: Condition): NotCondition => ({ not: condition });

export const eq = (field: string, value: Literal): ConditionLeaf => leaf(field, 'eq', value);

/** Always the negation of `eq`, so true while `field` is empty. */
export const neq = (field: string, value: Literal): ConditionLeaf => leaf(field, 'neq', value);

/** `field` equals one of `values`. The JSON operator `in`. */
export const isIn = (field: string, values: readonly [Literal, ...Literal[]]): ConditionLeaf =>
  leaf(field, 'in', values);

/** The JSON operator `not_in`; true while `field` is empty. */
export const notIn = (field: string, values: readonly [Literal, ...Literal[]]): ConditionLeaf =>
  leaf(field, 'not_in', values);

export const gt = (field: string, value: Bound): ConditionLeaf => leaf(field, 'gt', value);
export const gte = (field: string, value: Bound): ConditionLeaf => leaf(field, 'gte', value);
export const lt = (field: string, value: Bound): ConditionLeaf => leaf(field, 'lt', value);
export const lte = (field: string, value: Bound): ConditionLeaf => leaf(field, 'lte', value);

/** A `multi_choice` Field holds `value`. Not a substring test. */
export const contains = (field: string, value: ChoiceValue): ConditionLeaf =>
  leaf(field, 'contains', value);

/** The JSON operator `empty`. */
export const isEmpty = (field: string): ConditionLeaf => ({ field, operator: 'empty' });

/** The JSON operator `not_empty`. */
export const notEmpty = (field: string): ConditionLeaf => ({ field, operator: 'not_empty' });
