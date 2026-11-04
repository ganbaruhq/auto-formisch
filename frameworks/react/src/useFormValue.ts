import { createContext, useContext } from 'react';
import { useField } from '@formisch/react';
import type { Component, PathKey } from '@auto-formisch/core';
import { useRenderContext } from './context';

/**
 * One data scope as rendered: the root, an `object`, or one Repeater row.
 * Layouts add none.
 */
export interface DataScope {
  /** The scope's data path in the store, with Repeater indices. */
  readonly path: readonly PathKey[];
  /** The Components of the scope, as in the Definition. */
  readonly components: readonly Component[];
  readonly parent: DataScope | null;
}

export const DataScopeContext = createContext<DataScope | null>(null);

/**
 * Reads the current value of another Field, for a Widget whose presentation
 * depends on it. `path` has the syntax of a Condition reference: leading
 * `../` to leave the current data scope (from a Repeater row, to the scope
 * holding the Repeater), then names joined by dots, with no index. It reads
 * the value the way a Condition does: an Inactive Field as empty
 * (`undefined`), whatever the store still holds; a Locked Field as its Locked
 * value; and an `object` or a Repeater's rows without their Inactive Fields.
 * The calling component re-renders on every input of the form.
 *
 * @throws when `path` names no Field from where the Widget renders.
 */
export function useFormValue<T = unknown>(path: string): T | undefined {
  const { form, store } = useRenderContext();
  const scope = useContext(DataScopeContext);
  if (scope === null) throw new Error('useFormValue must be called inside <AutoForm>');
  // The whole input, so that an `object` read as a whole follows every Field
  // in it, and their Conditions. The root path `[]` names the whole form,
  // which the schema's path type cannot express.
  const root = useField(store, { path: [] as never });
  const state = form.conditions.evaluate(root.input);
  // The resolver Conditions use, so both read the same Field the same way.
  const found = state.locate(path, scope.path);
  if ('error' in found) throw new Error(`useFormValue("${path}"): ${found.error}`);
  return state.valueOf(found) as T | undefined;
}
