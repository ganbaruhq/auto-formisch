import * as v from 'valibot';
import type { Component, FieldNode, FormDefinition } from './definition';
import { toFormErrors } from './errors';
import { builtinFieldTypes } from './field-types';
import { loadDefinition } from './load';
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
  const schema = buildSchema(definition);
  return {
    definition,
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

/** The Fields of one data scope, in Definition order. Layouts add no path, so they flatten. */
function fieldsIn(components: readonly Component[]): FieldNode[] {
  return components.flatMap((component) => {
    switch (component.type) {
      case 'section':
      case 'tabs':
      case 'tab':
        return fieldsIn(component.components);
      case 'content':
        return [];
      default:
        return [component];
    }
  });
}

/** `v.pipe(skeleton, v.transform(prep), typedObject)`, per ADR 0002. */
function buildSchema(
  definition: FormDefinition,
): v.GenericSchema<Record<string, unknown>, FormOutput> {
  const fields = fieldsIn(definition.components);
  // Loosely typed leaves, so Formisch builds the right store and a wrongly
  // typed Inactive value can't block submission. Multi-value, object and
  // Repeater Fields will need real structure here, wrapped to never fail.
  const skeleton = v.object(
    Object.fromEntries(fields.map((field) => [field.name, v.optional(v.unknown())])),
  );
  const typedObject = v.object(
    Object.fromEntries(fields.map((field) => [field.name, typedLeaf(field)])),
  );
  return v.pipe(
    skeleton,
    v.transform((input) => prep(fields, input)),
    typedObject,
  );
}

/** Required check, then the Field Type's value schema, then its Rules. */
function typedLeaf(field: FieldNode): v.GenericSchema {
  const spec = builtinFieldTypes.get(field.type)!;
  const rules = (field.rules ?? []).map((rule) =>
    builtinRules.get(rule.type)!.action(rule.requirement, rule.message),
  );
  return v.optional(
    v.pipe(
      v.unknown(),
      v.check((value) => value !== MISSING, requiredMessage(field)),
      spec.value(field),
      ...rules,
    ),
  );
}

// `setRequiredMessage` slots in between the two.
const requiredMessage = (field: FieldNode): string => field.requiredMessage ?? 'Required';
