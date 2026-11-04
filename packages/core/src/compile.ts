import * as v from 'valibot';
import { conditionsOf, type FormConditions } from './conditions';
import type { Component, FieldNode, FormDefinition, RuleNode, ValueField } from './definition';
import { toFormErrors } from './errors';
import { builtinFieldTypes } from './field-types';
import { fieldsIn } from './fields';
import { loadDefinition } from './load';
import { getRequiredMessage, type RequiredMessage } from './messages';
import { MISSING, prep } from './prep';
import { builtinRules } from './rules';
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
 * @throws {DefinitionError} with every load error as `{message, path}`.
 */
export function compile(input: unknown): CompiledForm {
  const definition = loadDefinition(input);
  const conditions = conditionsOf(definition.components);
  const schema = buildSchema(definition, conditions);
  return {
    definition,
    conditions,
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

/** `v.pipe(skeleton, v.transform(prep), typedObject)`, per ADR 0002. */
function buildSchema(
  definition: FormDefinition,
  conditions: FormConditions,
): v.GenericSchema<Record<string, unknown>, FormOutput> {
  const { components } = definition;
  return v.pipe(
    skeletonOf(components),
    v.transform((input) => prep(components, conditions.evaluate(input), input)),
    typedObjectOf(components),
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

function typedObjectOf(components: readonly Component[]) {
  return v.object(
    Object.fromEntries(fieldsIn(components).map((field) => [field.name, typedLeaf(field)])),
  );
}

/**
 * A value Field: the required check, then the Field Type's value schema, then
 * its Rules. An `object` or Repeater: its own typed objects, then its Rules.
 */
function typedLeaf(field: FieldNode): v.GenericSchema {
  switch (field.type) {
    // `undefined` only when Inactive (`INACTIVE`): nothing inside it runs.
    case 'object':
      return v.pipe(
        v.optional(typedObjectOf(field.components)),
        v.transform((value) => value ?? {}),
      );
    case 'repeater':
      return v.pipe(
        v.optional(v.pipe(v.array(typedObjectOf(field.components)), ...ruleActions(field.rules))),
        v.transform((rows) => rows ?? []),
      );
    default:
      return v.optional(
        v.pipe(
          v.unknown(),
          v.check((value) => value !== MISSING, requiredMessage(field)),
          builtinFieldTypes.get(field.type)!.value(field),
          ...ruleActions(field.rules),
        ),
      );
  }
}

const ruleActions = (rules: readonly RuleNode[] = []) =>
  rules.map((rule) => builtinRules.get(rule.type)!.action(rule.requirement, rule.message));

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
