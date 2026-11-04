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
 * the store's input, so a Repeater reads as its rows and an `object` as its
 * Fields. Like a Condition, it reads an Inactive Field as empty
 * (`undefined`), whatever the store still holds.
 *
 * @throws when `path` names no Field from where the Widget renders.
 */
export function useFormValue<T = unknown>(path: string): T | undefined {
  const { store, conditions } = useRenderContext();
  const scope = useContext(DataScopeContext);
  if (scope === null) throw new Error('useFormValue must be called inside <AutoForm>');
  // The resolver Conditions use, so both read the same Field the same way.
  const found = conditions.locate(path, scope.path);
  if ('error' in found) throw new Error(`useFormValue("${path}"): ${found.error}`);
  const field = useField(store, { path: found.path as [string] });
  return found.active ? (field.input as T | undefined) : undefined;
}
