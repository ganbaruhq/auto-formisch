import * as v from 'valibot';
import type { Typed, ValueInfo } from './builder/infer';
import {
  apply,
  type CustomType,
  type HasEffect,
  type Pipe,
  type PipeItem,
  type ValueTypeName,
} from './builder/pipe';
import { builtinComponents } from './components';
import type { ChoiceValue, CustomField } from './definition';
import { builtinFieldTypes, fieldKeys, type FieldTypeSpec, type ValueShape } from './field-types';
import { builtinRules, type RuleSpec } from './rules';

/*
 * Custom Field Types and Rules (AF-8). Both are plain values passed to
 * `compile` and `form`; there is no global registry, so the result never
 * depends on import order. Neither holds anything of a Renderer, so a server
 * loads them with only Valibot.
 */

/** A value that survives `JSON.stringify` and `JSON.parse` unchanged. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

/**
 * The row of the Condition operator table a custom Field Type uses, from the
 * built-in type whose value it is like. Without one, a Condition can only
 * test it with `empty` and `not_empty`.
 */
export type ConditionAs = 'text' | 'number' | 'date' | 'boolean' | 'multi_choice';

/** The value of each built-in Field Type a custom Rule can apply to. */
export interface BuiltinValues {
  readonly text: string;
  readonly number: number;
  readonly boolean: boolean;
  readonly choice: ChoiceValue;
  readonly multi_choice: readonly ChoiceValue[];
  readonly date: string;
}

/** What each `conditionAs` row compares, so it can only name one that fits the value. */
interface ConditionValues {
  readonly text: string;
  readonly number: number;
  readonly date: string;
  readonly boolean: boolean;
  readonly multi_choice: readonly unknown[];
}

/** Why a `conditionAs` row doesn't fit the value, if it doesn't. */
type FitsRow<V, TRow extends ConditionAs> = [TRow] extends [never]
  ? never
  : [V] extends [ConditionValues[TRow]]
    ? never
    : `A "${TRow}" Condition row does not fit the value of the schema`;

/** The schemas of a custom Field Type's own keys, by key. */
export type FieldTypeOptions = Readonly<Record<string, v.GenericSchema>>;

type OptionalKeys<O extends FieldTypeOptions> = {
  [K in keyof O]: undefined extends v.InferInput<O[K]> ? K : never;
}[keyof O];

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The option values a Builder call takes, from their schemas' input. */
export type OptionsInput<O extends FieldTypeOptions> = Simplify<
  { readonly [K in Exclude<keyof O, OptionalKeys<O>>]: v.InferInput<O[K]> } & {
    readonly [K in OptionalKeys<O>]?: v.InferInput<O[K]>;
  }
>;

/** The option values a loaded node holds, from their schemas' output. */
export type OptionsOutput<O extends FieldTypeOptions> = Simplify<
  { readonly [K in Exclude<keyof O, OptionalKeys<O>>]: v.InferOutput<O[K]> } & {
    readonly [K in OptionalKeys<O>]?: v.InferOutput<O[K]>;
  }
>;

/** A built node of a custom Field Type. */
type BuiltCustom<
  TType extends string,
  O extends FieldTypeOptions,
  N extends string,
  V,
  P,
> = CustomField<TType, OptionsOutput<O>> &
  Typed<
    ValueInfo<
      N,
      V,
      P extends Pipe<CustomType, V> ? HasEffect<P, 'required'> : false,
      P extends Pipe<CustomType, V> ? HasEffect<P, 'inactive'> : false
    >
  >;

/**
 * A custom Field Type made by `defineFieldType`. Pass it to `compile` and
 * `form` in `fieldTypes`; call it like a built-in Builder function.
 */
export type FieldType<
  TType extends string = string,
  TValue = unknown,
  TOptions extends FieldTypeOptions = FieldTypeOptions,
> = FieldTypeBuilder<TType, TValue, TOptions> & {
  readonly type: TType;
  /** Internal: how the loader and `compile` read the type. */
  readonly '~fieldType': CustomFieldTypeSpec;
  /** Type-level only; never present at runtime. */
  readonly '~types'?: {
    readonly value: TValue;
    readonly node: CustomField<TType, OptionsOutput<TOptions>>;
  };
};

type FieldTypeBuilder<TType extends string, TValue, O extends FieldTypeOptions> = [
  keyof O,
] extends [never]
  ? <const N extends string, const P extends Pipe<CustomType, TValue> = []>(
      name: N,
      pipe?: P,
    ) => BuiltCustom<TType, O, N, TValue, P>
  : <const N extends string, const P extends Pipe<CustomType, TValue> = []>(
      name: N,
      options: OptionsInput<O>,
      pipe?: P,
    ) => BuiltCustom<TType, O, N, TValue, P>;

/** The value type of a custom Field Type, for its Widget's props. */
export type InferFieldValue<F> = F extends { readonly '~types'?: infer T }
  ? NonNullable<T> extends { readonly value: infer V }
    ? V
    : never
  : never;

/** The loaded node type of a custom Field Type, for its Widget's props. */
export type InferFieldNode<F> = F extends { readonly '~types'?: infer T }
  ? NonNullable<T> extends { readonly node: infer N }
    ? N
    : never
  : never;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** A Field Type schema: its value is JSON, so `v.date()` fails to compile. */
export type FieldTypeSchema = v.GenericSchema<any, JsonValue>;

/** Why a schema isn't a Field Type schema, if it isn't: it changes its value's type. */
type OnlyValidates<S extends v.GenericSchema> =
  Same<v.InferInput<S>, v.InferOutput<S>> extends true
    ? never
    : 'A Field Type schema only validates: its output type must be its input type';

/**
 * The Field Type, or, when the schema or `conditionAs` doesn't fit, an object
 * naming the problem, which neither `compile`, `form` nor a Builder call
 * takes. The check sits on the result because any check on the argument
 * stops TypeScript from inferring the schema a function returns.
 */
export type Defined<
  TType extends string,
  TSchema extends v.GenericSchema,
  TOptions extends FieldTypeOptions,
  TRow extends ConditionAs,
> = [OnlyValidates<TSchema> | FitsRow<v.InferOutput<TSchema>, TRow>] extends [never]
  ? FieldType<TType, v.InferOutput<TSchema>, TOptions>
  : { readonly '~error': OnlyValidates<TSchema> | FitsRow<v.InferOutput<TSchema>, TRow> };

/** What `defineFieldType` takes. */
export interface FieldTypeConfig<
  TType extends string,
  TOptions extends FieldTypeOptions,
  TSchema extends FieldTypeSchema,
  TRow extends ConditionAs = never,
> {
  /** The `type` in the Definition: `^[a-z][a-z0-9_]*$`, and no built-in name. */
  readonly type: TType;
  /**
   * The type's own keys, flat on the node beside `name` and `label`, each with
   * the schema that checks it on load. A key whose schema rejects `undefined`
   * must be present. Values must be JSON.
   */
  readonly options?: TOptions;
  /**
   * Validates the Field's value, and only validates: what it outputs is
   * ignored, so a transform has no effect. It never sees an empty or Inactive
   * value. A function builds it once per node on load, from the node's
   * options. Sync only.
   */
  readonly schema: TSchema | ((node: CustomField<TType, OptionsOutput<TOptions>>) => TSchema);
  /** The Condition operator table row the value uses; it must fit the value. */
  readonly conditionAs?: TRow;
}

/** How the loader reads a custom Field Type: a `FieldTypeSpec`, and how to build its schema. */
export interface CustomFieldTypeSpec extends FieldTypeSpec {
  readonly custom: {
    /** The application's schema for one node. May throw; checked by the loader. */
    readonly build: (node: CustomField) => unknown;
    /** The keys of its options, which the schema is built from. */
    readonly options: readonly string[];
    readonly conditionAs?: ConditionAs;
  };
}

const TYPE_NAME = /^[a-z][a-z0-9_]*$/;
const OPTION_KEY = /^[A-Za-z][A-Za-z0-9_]*$/;
/** Keys a built-in Component takes, which no option may reuse. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(fieldKeys),
  'type',
  'name',
  'placeholder',
  'colSpan',
  'default',
  'visible',
  'disabled',
  'required',
  'rules',
  'components',
  'choices',
  '__proto__',
  'prototype',
  'constructor',
]);
const CONDITION_AS: readonly string[] = [
  'text',
  'number',
  'date',
  'boolean',
  'multi_choice',
] satisfies ConditionAs[];
const VALUE_TYPES: readonly string[] = [
  'text',
  'number',
  'boolean',
  'choice',
  'multi_choice',
  'date',
] satisfies (keyof BuiltinValues)[];

/**
 * Registers a Field Type for values the built-ins don't cover. A Field of it
 * holds one JSON value; every error of its schema is shown on the Field's own
 * path, beside its `required` error. It takes no `rules`: constraints go in
 * the schema and options.
 *
 * Known limit: an async check is caught only where Valibot marks it async,
 * such as `v.pipe(v.string(), v.checkAsync(...))`, anywhere a schema nests
 * another. An async function given to a sync API such as `v.check` or
 * `v.custom`, or a schema inside `v.lazy`, can't be detected: its Promise
 * counts as valid.
 *
 * @throws {TypeError} at once for an invalid or built-in name, an option key
 * that is invalid or a built-in key, an async schema, or an unknown
 * `conditionAs`.
 */
export function defineFieldType<
  const TType extends string,
  const TOptions extends FieldTypeOptions = {},
  TSchema extends FieldTypeSchema = FieldTypeSchema,
  const TRow extends ConditionAs = never,
>(
  config: FieldTypeConfig<TType, TOptions, TSchema, TRow>,
): Defined<TType, TSchema, TOptions, TRow> {
  const {
    type,
    options = {},
    schema,
    conditionAs,
  } = config as FieldTypeConfig<string, FieldTypeOptions, FieldTypeSchema, ConditionAs>;
  checkName(type, 'Field Type');
  for (const [key, option] of Object.entries(options)) {
    if (!OPTION_KEY.test(key) || RESERVED_KEYS.has(key)) {
      throw new TypeError(`Field Type "${type}" cannot take the option "${key}"`);
    }
    checkSchema(option, `The option "${key}" of Field Type "${type}"`);
  }
  if (typeof schema !== 'function') checkSchema(schema, `The schema of Field Type "${type}"`);
  if (conditionAs !== undefined && !CONDITION_AS.includes(conditionAs)) {
    throw new TypeError(
      `Field Type "${type}" has the unknown conditionAs ${JSON.stringify(conditionAs)}`,
    );
  }
  const keys = Object.fromEntries(
    Object.entries(options).map(([key, option]) => [key, json(option)]),
  );
  const spec: CustomFieldTypeSpec = {
    type,
    keys: { placeholder: v.string(), ...keys },
    requiredKeys: Object.keys(options).filter((key) => !v.is(options[key], undefined)),
    value: () => {
      throw new Error('A custom Field Type schema is built by the loader');
    },
    custom: {
      build: (node) => (typeof schema === 'function' ? schema(node) : schema),
      options: Object.keys(options),
      conditionAs,
    },
  };
  const builder = (name: string, second?: unknown, third?: unknown) => {
    const [values, pipe] =
      Array.isArray(second) || second === undefined ? [{}, second] : [second, third];
    return apply({ type, name, ...(values as object) }, pipe as Pipe<CustomType> | undefined);
  };
  return Object.assign(builder, { type, '~fieldType': spec }) as never;
}

/**
 * A custom Rule made by `defineRule`. Pass it to `compile` and `form` in
 * `rules`; call it to put the Rule in a Builder pipe.
 */
export type Rule<
  TType extends string = string,
  TAppliesTo extends ValueTypeName = ValueTypeName,
  TArgs extends readonly unknown[] = readonly unknown[],
> = ((...args: TArgs) => PipeItem<TAppliesTo>) & {
  readonly type: TType;
  /** Internal: how the loader and `compile` read the Rule. */
  readonly '~rule': RuleSpec;
};

type CheckMessage = v.ErrorMessage<v.CheckIssue<unknown>>;

/** What `defineRule` takes. */
interface RuleConfig<TType extends string, TAppliesTo extends readonly ValueTypeName[]> {
  /** The Rule's `type` in the Definition: `^[a-z][a-z0-9_]*$`, and no built-in name. */
  readonly type: TType;
  /** The built-in value Field Types the Rule may be declared on. */
  readonly appliesTo: TAppliesTo;
  /** The default message; a Rule's `message` in the Definition replaces it. */
  readonly message?: CheckMessage;
}

/**
 * Registers a Rule that combines with the built-in ones on a built-in value
 * Field, such as a pattern: the official replacement for a `regex` Rule.
 * `check` runs sync, only on a non-empty value of the Field's type. A
 * ReDoS-prone pattern in it is the application's risk, on every server that
 * validates the form.
 *
 * @throws {TypeError} at once for an invalid or built-in name, an empty or
 * unknown `appliesTo`, an async requirement schema or an async `check`.
 */
export function defineRule<
  const TType extends string,
  const TAppliesTo extends readonly [ValueTypeName, ...ValueTypeName[]],
  TRequirement extends v.GenericSchema,
>(
  config: RuleConfig<TType, TAppliesTo> & {
    /** Checks the Definition's `requirement` on load. It must be JSON. */
    readonly requirement: TRequirement;
    readonly check: (
      value: BuiltinValues[TAppliesTo[number]],
      requirement: v.InferOutput<TRequirement>,
    ) => boolean;
  },
): Rule<TType, TAppliesTo[number], [requirement: v.InferInput<TRequirement>, message?: string]>;
export function defineRule<
  const TType extends string,
  const TAppliesTo extends readonly [ValueTypeName, ...ValueTypeName[]],
>(
  config: RuleConfig<TType, TAppliesTo> & {
    readonly requirement?: undefined;
    readonly check: (value: BuiltinValues[TAppliesTo[number]]) => boolean;
  },
): Rule<TType, TAppliesTo[number], [message?: string]>;
export function defineRule(
  config: RuleConfig<string, readonly ValueTypeName[]> & {
    readonly requirement?: v.GenericSchema;
    readonly check: (value: any, requirement?: any) => boolean;
  },
): Rule<string, any, any> {
  const { type, appliesTo, requirement, check, message: fallback } = config;
  checkName(type, 'Rule');
  if (
    !Array.isArray(appliesTo) ||
    appliesTo.length === 0 ||
    appliesTo.some((target) => !VALUE_TYPES.includes(target))
  ) {
    throw new TypeError(
      `Rule "${type}" must apply to built-in value Field Types (${VALUE_TYPES.join(', ')})`,
    );
  }
  if (requirement !== undefined) checkSchema(requirement, `The requirement of Rule "${type}"`);
  if (typeof check !== 'function' || isAsyncFunction(check)) {
    throw new TypeError(`The check of Rule "${type}" must be a sync function`);
  }
  const spec: RuleSpec = {
    type,
    appliesTo,
    requirement: requirement === undefined ? undefined : json(requirement),
    action: (value, message) =>
      v.check((input) => {
        const result: unknown = check(input, value);
        // A Promise or anything else is a bug, never a pass.
        if (typeof result !== 'boolean') {
          throw new TypeError(
            `The check of Rule "${type}" returned ${typeOf(result)}, not a boolean`,
          );
        }
        return result;
      }, message ?? fallback),
  };
  const item = (...args: unknown[]) => {
    const [value, message] = requirement === undefined ? [undefined, args[0]] : args;
    return {
      '~action': {
        kind: 'rule',
        rule: {
          type,
          ...(value === undefined ? {} : { requirement: value }),
          ...(message === undefined ? {} : { message }),
        },
      },
    };
  };
  return Object.assign(item, { type, '~rule': spec }) as never;
}

function checkName(name: unknown, what: string): void {
  if (typeof name !== 'string' || !TYPE_NAME.test(name)) {
    throw new TypeError(
      `A ${what} name is lowercase letters, digits and _, starting with a letter: ${JSON.stringify(name)}`,
    );
  }
  if (isBuiltinName(name)) throw new TypeError(`"${name}" is a built-in name`);
}

/** Built-in Field Types, Layouts, Content and Rules share one set of names. */
const isBuiltinName = (name: string): boolean =>
  builtinFieldTypes.has(name) || builtinComponents.has(name) || builtinRules.has(name);

/** Throws unless `schema` is a sync Valibot schema. */
export function checkSchema(schema: unknown, what: string): void {
  if (!isValibot(schema) || (schema as { kind: string }).kind !== 'schema') {
    throw new TypeError(`${what} is not a Valibot schema`);
  }
  if (isAsync(schema)) throw new TypeError(`${what} is async; only sync schemas are supported`);
}

/** The keys under which a Valibot schema or action holds other schemas or actions. */
const NESTED = ['pipe', 'wrapped', 'item', 'items', 'options', 'entries', 'key', 'value', 'rest'];

const isValibot = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { kind?: unknown }).kind === 'string' &&
  typeof (value as { '~run'?: unknown })['~run'] === 'function';

/**
 * Whether Valibot marks the schema, or anything nested in it, async. Valibot
 * does not mark a sync pipe that holds an async action, so the walk looks in.
 */
function isAsync(schema: unknown, seen = new Set<unknown>()): boolean {
  if (!isValibot(schema) || seen.has(schema)) return false;
  seen.add(schema);
  if (schema.async === true) return true;
  return NESTED.some((key) => {
    const nested = schema[key];
    const children = Array.isArray(nested)
      ? nested
      : key === 'entries' && typeof nested === 'object' && nested !== null
        ? Object.values(nested)
        : [nested];
    return children.some((child) => isAsync(child, seen));
  });
}

const isAsyncFunction = (fn: unknown): boolean =>
  Object.prototype.toString.call(fn) === '[object AsyncFunction]';

const typeOf = (value: unknown): string =>
  value === null
    ? 'null'
    : typeof value === 'object' && 'then' in value
      ? 'a Promise'
      : typeof value;

/** The schema, then a check that its output is JSON, then a copy of it to freeze. */
const json = (schema: v.GenericSchema): v.GenericSchema =>
  v.pipe(
    schema,
    v.check((value) => isJson(value), 'Expected a JSON value'),
    v.transform(copyJson),
  );

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every((item) => item === undefined || isJson(item));
}

/**
 * A custom Field Type's schema as `compile` runs it: every issue moves to the
 * Field's own path, since the Field is one value in a Renderer's store and an
 * issue on a part of it would show nowhere. The value passes on unchanged.
 * It is a schema, so a failed `required` check stops the pipe before it.
 */
export const collapsed = (schema: v.GenericSchema): v.GenericSchema =>
  v.pipe(
    v.unknown(),
    v.rawCheck(({ dataset, config, addIssue }) => {
      // In the language and with the settings of the whole parse.
      const result = v.safeParse(schema, dataset.value, config as v.Config<v.BaseIssue<unknown>>);
      if (result.success) return;
      for (const issue of result.issues) {
        addIssue({
          message: issue.message,
          input: issue.input,
          expected: issue.expected ?? undefined,
          received: issue.received,
        });
      }
    }),
  );

/**
 * The JavaScript type a custom Field Type's schema expects: a value passes when
 * the schema reports no type issue, only failed constraints such as
 * `v.maxValue`, which stop no Widget from showing it.
 */
export const customShape = (type: string, schema: v.GenericSchema): ValueShape => ({
  is: (value) => {
    const { issues } = v.safeParse(schema, value);
    return issues === undefined || issues.every((issue) => issue.kind !== 'schema');
  },
  expected: `a value of the Field Type "${type}"`,
});

/** A copy, so that freezing the Definition never freezes the caller's input. */
export function copyJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyJson);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item)]));
  }
  return value;
}
