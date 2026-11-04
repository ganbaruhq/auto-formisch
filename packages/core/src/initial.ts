import type { Component, RepeaterField } from './definition';
import { isEmpty } from './empty';
import type { PathKey } from './errors';
import { builtinFieldTypes } from './field-types';
import { fieldsIn, isRecord } from './fields';

/*
 * The input a form starts with. Defaults seed the store only and never enter
 * the schema, so a value the user clears stays empty.
 */

type Row = Record<string, unknown>;

/**
 * The input a new form starts with: every `object` and Repeater in its full
 * shape, each value Field with a `default` set to it, each Repeater with its
 * `default` rows. A fresh copy on every call.
 */
export const defaultsOf = (components: readonly Component[]): Row => withDefaults(components, {});

/** A new row of `repeater`, from the defaults of its template's Fields. */
export const newRowOf = (repeater: RepeaterField): Row => defaultsOf(repeater.components);

/**
 * `given`, a row or `object` value from a loaded Repeater default, with the
 * defaults of the Fields it leaves out.
 */
function withDefaults(components: readonly Component[], given: Readonly<Row>): Row {
  const out: Row = {};
  for (const field of fieldsIn(components)) {
    const has = Object.hasOwn(given, field.name);
    const value = given[field.name];
    switch (field.type) {
      case 'object':
        out[field.name] = withDefaults(field.components, isRecord(value) ? value : {});
        break;
      case 'repeater': {
        const rows = has ? value : field.default;
        out[field.name] = Array.isArray(rows)
          ? rows.map((row: unknown) => withDefaults(field.components, isRecord(row) ? row : {}))
          : [];
        break;
      }
      default: {
        const start = has ? value : field.default;
        if (start !== undefined) out[field.name] = copy(start);
      }
    }
  }
  return out;
}

/** A starting value that was dropped, and why. */
export interface InputWarning {
  readonly message: string;
  readonly path: readonly PathKey[];
}

/** What a form starts with for a record, and the values of it that were dropped. */
export interface NormalizedInput {
  readonly input: Record<string, unknown>;
  readonly warnings: readonly InputWarning[];
}

/**
 * The input a form starts with for `record`, such as one saved under an older
 * Definition. Every `object` and Repeater gets its full shape, keys without a
 * Field are dropped, and a value of the wrong JavaScript type for its Field,
 * at a leaf or in the structure, becomes empty with a warning. A value of the
 * right type is kept even outside `choices` or breaking a Rule, so that
 * submitting reports it. No `default` is applied, not even to missing keys.
 */
export function normalize(components: readonly Component[], record: unknown): NormalizedInput {
  const warnings: InputWarning[] = [];
  const drop = (path: readonly PathKey[], expected: string, value: unknown) => {
    warnings.push({ message: `Expected ${expected}, not ${describe(value)}; left empty`, path });
  };

  const scope = (list: readonly Component[], value: unknown, path: readonly PathKey[]): Row => {
    if (!isRecord(value)) {
      if (!isEmpty(value)) drop(path, 'an object', value);
      return scope(list, {}, path);
    }
    const out: Row = {};
    for (const field of fieldsIn(list)) {
      const at = [...path, field.name];
      const given = Object.hasOwn(value, field.name) ? value[field.name] : undefined;
      switch (field.type) {
        case 'object':
          out[field.name] = scope(field.components, given, at);
          break;
        case 'repeater':
          if (Array.isArray(given)) {
            out[field.name] = given.map((row, index) =>
              scope(field.components, row, [...at, index]),
            );
          } else {
            if (!isEmpty(given)) drop(at, 'a list', given);
            out[field.name] = [];
          }
          break;
        default: {
          const { shape } = builtinFieldTypes.get(field.type)!;
          // A type with no shape keeps every value but an empty one.
          if (shape?.is(given) ?? !isEmpty(given)) out[field.name] = copy(given);
          else if (shape !== undefined && !isEmpty(given)) drop(at, shape.expected, given);
        }
      }
    }
    return out;
  };

  return { input: scope(components, record, []), warnings };
}

const describe = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
};

/**
 * A deep copy of a JSON value, so that a Widget that changes an array or
 * object in place never changes the Definition or another form.
 */
export function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  if (isRecord(value)) {
    const out: Row = {};
    for (const key of Object.keys(value)) {
      // A JSON object may hold an own `__proto__`; keep it as a plain key.
      Object.defineProperty(out, key, {
        value: copy(value[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out as T;
  }
  return value;
}
