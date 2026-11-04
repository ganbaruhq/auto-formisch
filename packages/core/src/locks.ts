import type { ValueField } from './definition';
import { isRecord } from './fields';
import { copy } from './initial';

/** One Locked Field: its data path, through `object`s only, and its value. */
export interface Lock {
  readonly path: readonly string[];
  /** Frozen. `undefined` locks the Field empty. */
  readonly value: unknown;
}

/** The Locked Fields of one form instance, by the loaded Definition's nodes. */
export type Locks = ReadonlyMap<ValueField, Lock>;

/**
 * `input` with every Locked value written over whatever it holds there, as a
 * fresh copy: `input` itself is never changed. An `object` on the way that is
 * not a plain object is replaced, so the Locked value is always in place.
 */
export function withLocks(input: unknown, locks: Locks): Record<string, unknown> {
  let result: Record<string, unknown> = isRecord(input) ? { ...input } : {};
  for (const { path, value } of locks.values()) result = setAt(result, path, value);
  return result;
}

function setAt(
  record: Readonly<Record<string, unknown>>,
  [name, ...rest]: readonly string[],
  value: unknown,
): Record<string, unknown> {
  if (rest.length === 0) return { ...record, [name]: copy(value) };
  const inner = record[name];
  return { ...record, [name]: setAt(isRecord(inner) ? inner : {}, rest, value) };
}
