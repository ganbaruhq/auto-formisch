import * as v from 'valibot';
import { dateSchema } from './date';
import type { RuleNode } from './definition';

/** A Valibot action that a Rule compiles to, run after the Field's value schema. */
export type RuleAction = v.PipeAction<any, any, v.BaseIssue<unknown>>;

/**
 * How `core` loads and compiles one built-in Rule.
 *
 * To add a Rule, add an entry to `builtinRules`. Its `appliesTo` lists the
 * Field Types it may be declared on; the loader rejects it anywhere else.
 */
export interface RuleSpec<TRequirement = any> {
  readonly type: string;
  readonly appliesTo: readonly string[];
  /**
   * Validates `requirement` on load, given the Field's type when it depends on
   * it. A Rule without one takes no `requirement`.
   */
  readonly requirement?:
    | v.GenericSchema<unknown, TRequirement>
    | ((fieldType: string) => v.GenericSchema<unknown, TRequirement>);
  /** Builds the action. `message` is the Rule's own, or `undefined` for Valibot's. */
  readonly action: (requirement: TRequirement, message: string | undefined) => RuleAction;
}

const length = v.pipe(v.number(), v.integer(), v.minValue(0));

const email: RuleSpec<undefined> = {
  type: 'email',
  appliesTo: ['text'],
  action: (_, message) => v.email(message),
};

/** Any absolute URL the platform's `URL` parses, whatever its scheme. */
const url: RuleSpec<undefined> = {
  type: 'url',
  appliesTo: ['text'],
  action: (_, message) => v.url(message),
};

const minLength: RuleSpec<number> = {
  type: 'min_length',
  appliesTo: ['text'],
  requirement: length,
  action: (requirement, message) => v.minLength(requirement, message),
};

const maxLength: RuleSpec<number> = {
  type: 'max_length',
  appliesTo: ['text'],
  requirement: length,
  action: (requirement, message) => v.maxLength(requirement, message),
};

/** The requirement of `min_value` and `max_value`: a value of the Field's own type. */
const bound = (fieldType: string): v.GenericSchema<unknown, number | string> =>
  fieldType === 'date' ? dateSchema : v.pipe(v.number(), v.finite());

// A date is a `YYYY-MM-DD` string, so comparing strings compares dates.
const minValue: RuleSpec<number | string> = {
  type: 'min_value',
  appliesTo: ['number', 'date'],
  requirement: bound,
  action: (requirement, message) => v.minValue(requirement, message),
};

const maxValue: RuleSpec<number | string> = {
  type: 'max_value',
  appliesTo: ['number', 'date'],
  requirement: bound,
  action: (requirement, message) => v.maxValue(requirement, message),
};

const integer: RuleSpec<undefined> = {
  type: 'integer',
  appliesTo: ['number'],
  action: (_, message) => v.integer(message),
};

const accepted: RuleSpec<undefined> = {
  type: 'accepted',
  appliesTo: ['boolean'],
  action: (_, message) => v.value(true, message),
};

const minItems: RuleSpec<number> = {
  type: 'min_items',
  appliesTo: ['multi_choice', 'repeater'],
  requirement: length,
  action: (requirement, message) => v.minLength(requirement, message),
};

const maxItems: RuleSpec<number> = {
  type: 'max_items',
  appliesTo: ['multi_choice', 'repeater'],
  requirement: length,
  action: (requirement, message) => v.maxLength(requirement, message),
};

export const builtinRules: ReadonlyMap<string, RuleSpec> = new Map(
  [email, url, minLength, maxLength, minValue, maxValue, integer, accepted, minItems, maxItems].map(
    (spec) => [spec.type, spec],
  ),
);

/**
 * The loaded `rules` as one action, or none when there are none, from the
 * Rules the load knew. They run in Definition order and stop at the first
 * that fails, so a Field shows one Rule error at a time, and a custom Rule
 * after a failed `max_length` never sees an overlong value.
 */
export const ruleActions = (
  rules: readonly RuleNode[] = [],
  specs: ReadonlyMap<string, RuleSpec> = builtinRules,
): RuleAction[] =>
  rules.length === 0
    ? []
    : [
        untilFirstFailure(
          rules.map((rule) => specs.get(rule.type)!.action(rule.requirement, rule.message)),
        ),
      ];

/** A Rule's action: every Rule only validates. */
type Validation = v.BaseValidation<any, any, v.BaseIssue<unknown>>;

/** One validation action that runs `actions` in order up to the first that adds an issue. */
function untilFirstFailure(actions: readonly RuleAction[]): Validation {
  return {
    kind: 'validation',
    type: 'rules',
    reference: untilFirstFailure as (...args: any[]) => Validation,
    async: false,
    expects: null,
    '~run'(dataset, config) {
      let current = dataset;
      for (const action of actions as readonly Validation[]) {
        const before = current.issues?.length ?? 0;
        current = action['~run'](current, config);
        if ((current.issues?.length ?? 0) > before) break;
      }
      return current;
    },
  };
}
