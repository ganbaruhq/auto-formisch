import * as v from 'valibot';

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
  /** Validates `requirement` on load. A Rule without one takes no `requirement`. */
  readonly requirement?: v.GenericSchema<unknown, TRequirement>;
  /** Builds the action. `message` is the Rule's own, or `undefined` for Valibot's. */
  readonly action: (requirement: TRequirement, message: string | undefined) => RuleAction;
}

const length = v.pipe(v.number(), v.integer(), v.minValue(0));

const email: RuleSpec<undefined> = {
  type: 'email',
  appliesTo: ['text'],
  action: (_, message) => v.email(message),
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

export const builtinRules: ReadonlyMap<string, RuleSpec> = new Map(
  [email, minLength, maxLength].map((spec) => [spec.type, spec]),
);
