import type { ConditionState } from './conditions';
import type { Component } from './definition';
import { isEmpty } from './empty';
import type { PathKey } from './errors';
import { fieldsIn, isRecord } from './fields';
import type { LockedValues } from './locked-values';

/**
 * Marks a required Field whose value is empty. `typedObject` turns it into the
 * required error, so the symbol never reaches a consumer (ADR 0002).
 */
export const MISSING: unique symbol = Symbol('auto-formisch.missing');

/**
 * The value of an Inactive `object` or Repeater. `typedObject` skips its
 * children and Rules and outputs `{}` or `[]`, so the key always stays. It is
 * `undefined` under a key that is present, which Valibot runs the optional
 * schema on but nothing else on.
 */
export const INACTIVE = undefined;

/**
 * The `prep` stage: normalizes the skeleton's output before `typedObject` runs
 * types and Rules. `state` holds what the Conditions decide for this input,
 * and `scope` is the data path of `components`.
 *
 * An Inactive Field contributes nothing: a value Field drops its key, an
 * `object` or Repeater becomes `INACTIVE`, whatever they hold. An active,
 * empty value Field drops its key, or becomes `MISSING` when it is required.
 * An active `object` always keeps its key, as `{}` at least, and a Repeater as
 * `[]`; each row is normalized like its own small form. A value of the wrong
 * shape is kept, so that `typedObject` reports it. Keys the Definition doesn't
 * declare are already gone. A Locked Field in `locks` is never `MISSING`: it
 * skips `required`.
 */
export function prep(
  components: readonly Component[],
  state: ConditionState,
  input: unknown,
  scope: readonly PathKey[] = [],
  locks?: LockedValues,
): Record<string, unknown> {
  const source = isRecord(input) ? input : {};
  const output: Record<string, unknown> = {};
  for (const field of fieldsIn(components)) {
    const value = source[field.name];
    const active = state.isVisible(field, scope) && !state.isDisabled(field, scope);
    const path = [...scope, field.name];
    switch (field.type) {
      case 'object':
        output[field.name] = !active
          ? INACTIVE
          : // A list, even an empty one, is of the wrong shape.
            !Array.isArray(value) && (isEmpty(value) || isRecord(value))
            ? prep(field.components, state, value, path, locks)
            : value;
        break;
      case 'repeater':
        output[field.name] = !active
          ? INACTIVE
          : isEmpty(value)
            ? []
            : Array.isArray(value)
              ? value.map((row, index) =>
                  isRecord(row) ? prep(field.components, state, row, [...path, index], locks) : row,
                )
              : value;
        break;
      default:
        if (!active) break;
        if (!isEmpty(value)) output[field.name] = value;
        else if (!locks?.has(field) && state.isRequired(field, scope)) {
          output[field.name] = MISSING;
        }
    }
  }
  return output;
}
