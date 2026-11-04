import type { Component } from './definition';
import { isEmpty } from './empty';
import { fieldsIn, isRecord } from './fields';

/**
 * Marks a required Field whose value is empty. `typedObject` turns it into the
 * required error, so the symbol never reaches a consumer (ADR 0002).
 */
export const MISSING: unique symbol = Symbol('auto-formisch.missing');

/**
 * The `prep` stage: normalizes the skeleton's output before `typedObject` runs
 * types and Rules. An empty value Field drops its key, or becomes `MISSING`
 * when it is required; keys the Definition doesn't declare are already gone.
 * An `object` always keeps its key, as `{}` at least, and a Repeater as `[]`;
 * each row is normalized like its own small form. A value of the wrong shape
 * is kept, so that `typedObject` reports it.
 *
 * Conditions and Inactive Fields belong here, with an evaluator the Renderer
 * shares (ADR 0002).
 */
export function prep(components: readonly Component[], input: unknown): Record<string, unknown> {
  const source = isRecord(input) ? input : {};
  const output: Record<string, unknown> = {};
  for (const field of fieldsIn(components)) {
    const value = source[field.name];
    switch (field.type) {
      case 'object':
        output[field.name] =
          isEmpty(value) || isRecord(value) ? prep(field.components, value) : value;
        break;
      case 'repeater':
        output[field.name] = isEmpty(value)
          ? []
          : Array.isArray(value)
            ? value.map((row) => (isRecord(row) ? prep(field.components, row) : row))
            : value;
        break;
      default:
        if (!isEmpty(value)) output[field.name] = value;
        else if (field.required === true) output[field.name] = MISSING;
    }
  }
  return output;
}
