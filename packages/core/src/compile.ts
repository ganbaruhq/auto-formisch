import * as v from 'valibot';
import type { TypedDefinition } from './builder/infer';
import { conditionsOf, type FormConditions } from './conditions';
import {
  rootComponents,
  type Component,
  type FieldNode,
  type FormDefinition,
  type RepeaterField,
  type ValueField,
} from './definition';
import { toFormErrors } from './errors';
import { builtinFieldTypes } from './field-types';
import { fieldsIn } from './fields';
import { defaultsOf, newRowOf, normalize, type NormalizedInput } from './initial';
import { loadDefinition } from './load';
import { getRequiredMessage, type RequiredMessage } from './messages';
import { withLocks, type Locks } from './locks';
import { MISSING, prep } from './prep';
import { ruleActions } from './rules';
import type { StandardSchemaV1 } from './standard';

/** The submitted value of a form compiled from JSON. */
export type FormOutput = Record<string, unknown>;

/**
 * The result of `compile`: the loaded Definition plus a self-sufficient schema.
 * It is itself a Standard Schema whose issues are `{message, path}`.
 */
export interface CompiledForm<TOutput extends FormOutput = FormOutput> extends StandardSchemaV1<
  Record<string, unknown>,
  TOutput
> {
  /** The loaded Definition. Frozen. */
  readonly definition: FormDefinition;
  /**
   * The Condition evaluator `prep` uses. A Renderer decides with it what is
   * shown, disabled and required, so the form cannot drift from validation.
   */
  readonly conditions: FormConditions;
  /**
   * The Locked Fields of this form instance and their values, set by `lock`;
   * empty for the result of `compile`. A Renderer shows these Fields read-only
   * and ignores their changes. `conditions`, `defaults`, `normalize` and
   * `schema` already put the Locked values in place of the input's.
   */
  readonly locked: ReadonlyMap<ValueField, unknown>;
  /**
   * The input a new form starts with, from the Definition's `default`s: every
   * `object` and Repeater in its full shape. A fresh copy on every read, so
   * `{ ...compiled.defaults, ...prefill }` is safe to hand to a form.
   */
  readonly defaults: Record<string, unknown>;
  /**
   * For a Renderer: the store's starting input for a record passed as
   * `initialInput`, which replaces every `default`. See `NormalizedInput`.
   */
  readonly normalize: (record: unknown) => NormalizedInput;
  /** For a Renderer: a new row of a Repeater of this form, from its template's defaults. */
  readonly newRow: (repeater: RepeaterField) => Record<string, unknown>;
  /**
   * The root pipe `skeleton -> prep -> typedObject` (ADR 0002), for Formisch
   * and for `v.safeParse` with a per-request config. Read errors from it only
   * as `{message, path}`, never as raw Valibot issues.
   */
  readonly schema: v.GenericSchema<Record<string, unknown>, TOutput>;
  readonly '~standard': Omit<
    StandardSchemaV1.Props<Record<string, unknown>, TOutput>,
    'validate'
  > & {
    /** Always synchronous: v1 schemas are sync. */
    readonly validate: (value: unknown) => StandardSchemaV1.Result<TOutput>;
  };
}

/**
 * Checks a Form Definition and compiles it into a self-sufficient schema that
 * gives a server the same result as the form.
 *
 * A Definition built by `form()` gives its inferred output type; JSON gives
 * `FormOutput`.
 *
 * @throws {DefinitionError} with every load error as `{message, path}`.
 */
export function compile<TOutput extends FormOutput>(
  input: TypedDefinition<TOutput>,
): CompiledForm<TOutput>;
export function compile(input: unknown): CompiledForm;
export function compile(input: unknown): CompiledForm {
  const definition = loadDefinition(input);
  return compiledForm(definition, conditionsOf(rootComponents(definition)), new Map());
}

/** What `lock` needs from a form that `compile` made. Not public. */
export interface CompiledInternals {
  /** The same form with these Locked Fields. */
  readonly relock: (locks: Locks) => CompiledForm;
  /** The typed value schema of a value Field of this form, without `rules`. */
  readonly valueSchema: (field: ValueField) => v.GenericSchema;
}

const internals = new WeakMap<object, CompiledInternals>();

/** The internals of a form from `compile` or `lock`; `undefined` for anything else. */
export const internalsOf = (form: unknown): CompiledInternals | undefined =>
  typeof form === 'object' && form !== null ? internals.get(form) : undefined;

const valueSchema = (field: ValueField): v.GenericSchema =>
  builtinFieldTypes.get(field.type)!.value(field);

/**
 * One compiled form. `base` evaluates the input as given; with `locks`, the
 * Locked values replace the input's before anything reads it (ADR 0003).
 */
function compiledForm(
  definition: FormDefinition,
  base: FormConditions,
  locks: Locks,
): CompiledForm {
  const conditions: FormConditions =
    locks.size === 0
      ? base
      : {
          readsValues: base.readsValues,
          evaluate: (input) => base.evaluate(withLocks(input, locks)),
        };
  const components = rootComponents(definition);
  const schema = buildSchema(definition, base, locks);
  const lockedPaths = new Set([...locks.values()].map(({ path }) => path.join('.')));
  const compiled: CompiledForm = {
    definition,
    conditions,
    locked: new Map([...locks].map(([field, { value }]) => [field, value])),
    // A getter, so every read is a fresh copy.
    get defaults() {
      return withLocks(defaultsOf(components), locks);
    },
    normalize: (record) => {
      const { input, warnings } = normalize(components, record);
      return {
        input: withLocks(input, locks),
        // A Locked value replaces whatever the record held there.
        warnings: warnings.filter(({ path }) => !lockedPaths.has(path.join('.'))),
      };
    },
    newRow: newRowOf,
    schema,
    '~standard': {
      version: 1,
      vendor: 'auto-formisch',
      validate: (value) => {
        const result = v.safeParse(schema, value);
        return result.success ? { value: result.output } : { issues: toFormErrors(result.issues) };
      },
    },
  };
  internals.set(compiled, {
    relock: (next) => compiledForm(definition, base, next),
    valueSchema,
  });
  return compiled;
}

/**
 * `v.pipe(skeleton, v.transform(prep), typedObject)`, per ADR 0002. `prep`
 * first writes the Locked values over the input, so a forged value drives no
 * Condition (ADR 0003).
 */
function buildSchema(
  definition: FormDefinition,
  conditions: FormConditions,
  locks: Locks,
): v.GenericSchema<Record<string, unknown>, FormOutput> {
  const components = rootComponents(definition);
  return v.pipe(
    skeletonOf(components),
    v.transform((input) => {
      const locked = withLocks(input, locks);
      return prep(components, conditions.evaluate(locked), locked, [], locks);
    }),
    typedObjectOf(components, locks),
  );
}

/**
 * The skeleton of one data scope. Value leaves are loosely typed, so Formisch
 * builds the right store and a wrongly typed Inactive value can't block
 * submission. An `object` or Repeater has real structure, so Formisch gives
 * every row its own Field stores, but never fails: a value of the wrong shape
 * passes through for `typedObject` to report.
 */
function skeletonOf(components: readonly Component[]) {
  return v.object(
    Object.fromEntries(fieldsIn(components).map((field) => [field.name, skeletonLeaf(field)])),
  );
}

function skeletonLeaf(field: FieldNode): v.GenericSchema {
  switch (field.type) {
    case 'object':
      return tolerant(skeletonOf(field.components));
    case 'repeater':
      return tolerant(v.array(skeletonOf(field.components)));
    default:
      return v.optional(v.unknown());
  }
}

const tolerant = (schema: v.GenericSchema): v.GenericSchema =>
  v.fallback(schema, (dataset?: { readonly value: unknown }) => dataset?.value);

function typedObjectOf(components: readonly Component[], locks: Locks) {
  return v.object(
    Object.fromEntries(fieldsIn(components).map((field) => [field.name, typedLeaf(field, locks)])),
  );
}

/**
 * A value Field: the required check, then the Field Type's value schema, then
 * its Rules. An `object` or Repeater: its own typed objects, then its Rules.
 * A Locked Field skips all of it: `lock` checked its type, and the
 * application answers for its value.
 */
function typedLeaf(field: FieldNode, locks: Locks): v.GenericSchema {
  switch (field.type) {
    // `undefined` only when Inactive (`INACTIVE`): nothing inside it runs.
    case 'object':
      return v.pipe(
        v.optional(typedObjectOf(field.components, locks)),
        v.transform((value) => value ?? {}),
      );
    case 'repeater':
      return v.pipe(
        v.optional(
          v.pipe(v.array(typedObjectOf(field.components, locks)), ...ruleActions(field.rules)),
        ),
        v.transform((rows) => rows ?? []),
      );
    default:
      if (locks.has(field)) return v.optional(v.unknown());
      return v.optional(
        v.pipe(
          v.unknown(),
          v.check((value) => value !== MISSING, requiredMessage(field)),
          valueSchema(field),
          ...ruleActions(field.rules),
        ),
      );
  }
}

/**
 * `requiredMessage`, then `setRequiredMessage` for the issue's language, then
 * `Required`. Always a message of the action's own, so neither Valibot's
 * defaults nor its specific, schema or global messages can show the symbol.
 */
const requiredMessage =
  (field: ValueField): RequiredMessage =>
  (issue) => {
    if (field.requiredMessage !== undefined) return field.requiredMessage;
    const message = getRequiredMessage(issue.lang);
    if (message === undefined) return 'Required';
    return typeof message === 'function' ? message(issue) : message;
  };
