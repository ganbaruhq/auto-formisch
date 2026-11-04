import type { FieldNode } from './definition';
import { isEmpty } from './empty';

/**
 * Marks a required Field whose value is empty. `typedObject` turns it into the
 * required error, so the symbol never reaches a consumer (ADR 0002).
 */
export const MISSING: unique symbol = Symbol('auto-formisch.missing');

/**
 * The `prep` stage: normalizes the skeleton's output before `typedObject` runs
 * types and Rules. An empty Field drops its key, or becomes `MISSING` when it
 * is required; keys the Definition doesn't declare are already gone.
 *
 * Conditions and Inactive Fields belong here, with an evaluator the Renderer
 * shares (ADR 0002).
 */
export function prep(
  fields: readonly FieldNode[],
  input: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field.name];
    if (!isEmpty(value)) output[field.name] = value;
    else if (field.required === true) output[field.name] = MISSING;
  }
  return output;
}
