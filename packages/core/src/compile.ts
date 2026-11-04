import * as v from 'valibot';
import type { TypedDefinition } from './builder/infer';
import { conditionsOf, type FormConditions } from './conditions';
import {
  rootComponents,
  type Component,
  type FieldNode,
  type FormDefinition,
  type RepeaterField,
  type RuleNode,
  type ValueField,
} from './definition';
import { toFormErrors } from './errors';
import { fieldsIn } from './fields';
import { defaultsOf, newRowOf, normalize, type NormalizedInput } from './initial';
import { load } from './load';
import { getRequiredMessage, type RequiredMessage } from './messages';
import { MISSING, prep } from './prep';
import { registryOf, type LoadOptions, type Registry } from './registry';
import { ruleActions, type RuleAction } from './rules';
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
 * `FormOutput`. `options` lists the custom Field Types and Rules it may use;
 * any other unknown `type` is a load error.
 *
 * @throws {DefinitionError} with every load error as `{message, path}`.
 * @throws {TypeError} for invalid `options`, such as a name registered twice.
 */
export function compile<TOutput extends FormOutput>(
  input: TypedDefinition<TOutput>,
  options?: LoadOptions,
): CompiledForm<TOutput>;
export function compile(input: unknown, options?: LoadOptions): CompiledForm;
export function compile(input: unknown, options?: LoadOptions): CompiledForm {
  const registry = registryOf(options);
  const { definition, valueSchemas } = load(input, registry);
  const components = rootComponents(definition);
  const conditions = conditionsOf(components);
  const schema = buildSchema(definition, conditions, { registry, valueSchemas });
  return {
    definition,
    conditions,
    get defaults() {
      return defaultsOf(components);
    },
    normalize: (record) => normalize(components, record),
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
}

/** What the typed stage needs from the load: the Rules it knew and each Field's value schema. */
interface Typing {
  readonly registry: Registry;
  readonly valueSchemas: ReadonlyMap<Component, v.GenericSchema>;
}

/** `v.pipe(skeleton, v.transform(prep), typedObject)`, per ADR 0002. */
function buildSchema(
  definition: FormDefinition,
  conditions: FormConditions,
  typing: Typing,
): v.GenericSchema<Record<string, unknown>, FormOutput> {
  const components = rootComponents(definition);
  return v.pipe(
    skeletonOf(components),
    v.transform((input) => prep(components, conditions.evaluate(input), input)),
    typedObjectOf(components, typing),
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

function typedObjectOf(components: readonly Component[], typing: Typing) {
  return v.object(
    Object.fromEntries(fieldsIn(components).map((field) => [field.name, typedLeaf(field, typing)])),
  );
}

/**
 * A value Field: the required check, then the Field Type's value schema, then
 * its Rules. An `object` or Repeater: its own typed objects, then its Rules.
 * A custom Field Type is a value Field with no Rules.
 */
function typedLeaf(field: FieldNode, typing: Typing): v.GenericSchema {
  const rules = (list: readonly RuleNode[] | undefined): RuleAction[] =>
    ruleActions(list, typing.registry.rules);
  switch (field.type) {
    // `undefined` only when Inactive (`INACTIVE`): nothing inside it runs.
    case 'object':
      return v.pipe(
        v.optional(typedObjectOf(field.components, typing)),
        v.transform((value) => value ?? {}),
      );
    case 'repeater':
      return v.pipe(
        v.optional(v.pipe(v.array(typedObjectOf(field.components, typing)), ...rules(field.rules))),
        v.transform((rows) => rows ?? []),
      );
    default:
      return v.optional(
        v.pipe(
          v.unknown(),
          v.check((value) => value !== MISSING, requiredMessage(field)),
          // Built on load for every value Field of a Definition that loaded.
          typing.valueSchemas.get(field)!,
          ...rules(field.rules),
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
