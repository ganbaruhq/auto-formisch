import { internalsOf, type CompiledForm, type FormOutput } from './compile';
import { rootComponents, type ValueField } from './definition';
import { isEmpty } from './empty';
import type { FormError, PathKey } from './errors';
import { shapeMessage } from './field-types';
import { copy } from './initial';
import { deepFreeze } from './load';
import type { LockedValue } from './locked-values';
import { resolve, treeOf } from './tree';

/** Thrown by `lock` for values it cannot lock. Carries every error at once. */
export class LockError extends Error {
  readonly errors: readonly FormError[];

  constructor(errors: readonly FormError[]) {
    super(
      `Invalid lock:\n${errors
        .map((error) => `- ${formatPath(error.path)}: ${error.message}`)
        .join('\n')}`,
    );
    this.name = 'LockError';
    this.errors = errors;
  }
}

const formatPath = (path: readonly PathKey[]) => (path.length === 0 ? '(root)' : path.join('.'));

/** Names joined by `.`: a data path through `object`s, with no `../` and no index. */
const DATA_PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Fixes the values of some Fields for one form instance, such as a value the
 * server knows for this record. The result works wherever `compile`'s does:
 * the Renderer shows these Fields read-only, and on the server their values
 * replace the input's before Conditions run, so a forged value changes
 * nothing. A Locked Field skips `required` and its Rules, but a Condition can
 * still make it Inactive. `lock` beats `initialInput` and `default`.
 *
 * Keys are data paths such as `address.country`, to single-value Fields
 * outside Repeaters. An empty value locks the Field empty. A value needs only
 * the JavaScript type of its Field, such as a string for a `choice`: a choice
 * since removed, or a value outside a Rule, locks as it is. Never pass a value
 * that came from the client, such as from the URL. Build the form once for
 * client and server, for instance in a `formFor(record)` function; on the
 * client a new result needs a new `key` on `AutoForm`.
 *
 * @throws {LockError} with every error as `{message, path}`, where `path` is
 *   the key of `values`: for a path to an `object`, a Repeater or a Field in
 *   one, an unknown path, a value of the wrong JavaScript type, or a form
 *   that is already Locked.
 */
export function lock<TOutput extends FormOutput>(
  compiled: CompiledForm<TOutput>,
  values: Readonly<Record<string, unknown>>,
): CompiledForm<TOutput> {
  const internals = internalsOf(compiled);
  if (internals === undefined) {
    throw new TypeError('lock: expected the result of compile');
  }
  if (compiled.locked.size > 0 || lockedForms.has(compiled)) {
    throw new LockError([
      { message: 'The form is already Locked; pass every value to one "lock" call', path: [] },
    ]);
  }
  if (typeof values !== 'object' || values === null || Array.isArray(values)) {
    throw new LockError([{ message: 'Expected an object of data paths and values', path: [] }]);
  }

  const tree = treeOf(rootComponents(compiled.definition));
  const errors: FormError[] = [];
  const locks = new Map<ValueField, LockedValue>();
  for (const key of Object.keys(values)) {
    const fail = (message: string) => errors.push({ message, path: [key] });
    if (!DATA_PATH.test(key)) {
      fail('Expected a data path such as "address.country"');
      continue;
    }
    const found = resolve(tree, key, tree.root);
    if ('error' in found) {
      fail(found.error);
      continue;
    }
    const field = found.target;
    if (field.type === 'object') {
      fail(`Cannot lock the object "${key}"; lock its Fields`);
      continue;
    }
    if (field.type === 'repeater') {
      fail(`Cannot lock the Repeater "${key}" or its rows`);
      continue;
    }
    const value = values[key];
    // Only the JavaScript type its Widget relies on: a record may hold a choice
    // since removed, or a value a Rule added later rejects (ADR 0003).
    const shape = internals.shape(field);
    if (!isEmpty(value) && !shape.is(value)) {
      fail(shapeMessage(shape.expected, value));
      continue;
    }
    locks.set(field, { path: key.split('.'), value: deepFreeze(copy(value)) });
  }
  if (errors.length > 0) throw new LockError(errors);

  const result = internals.relock(locks) as CompiledForm<TOutput>;
  lockedForms.add(result);
  return result;
}

/** Results of `lock`, so that locking one again throws even with no values. */
const lockedForms = new WeakSet<object>();
