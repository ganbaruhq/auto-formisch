import { createContext, useContext } from 'react';
import { useField } from '@formisch/react';
import type { Component, FieldNode, PathKey } from '@auto-formisch/core';
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
 * Fields.
 *
 * @throws when `path` names no Field from where the Widget renders.
 */
export function useFormValue<T = unknown>(path: string): T | undefined {
  const { store } = useRenderContext();
  const scope = useContext(DataScopeContext);
  if (scope === null) throw new Error('useFormValue must be called inside <AutoForm>');
  const field = useField(store, { path: resolve(scope, path) as [string] });
  return field.input as T | undefined;
}

/** The store path of a Condition-style reference from `scope`. */
function resolve(from: DataScope, reference: string): PathKey[] {
  const fail = (reason: string) => new Error(`useFormValue("${reference}"): ${reason}`);
  let scope = from;
  let rest = reference;
  while (rest.startsWith('../')) {
    if (scope.parent === null) throw fail('"../" goes above the root');
    scope = scope.parent;
    rest = rest.slice(3);
  }
  const names = rest.split('.');
  let components = scope.components;
  for (const [index, name] of names.entries()) {
    const field = fieldsIn(components).find((node) => node.name === name);
    if (field === undefined) throw fail(`no Field "${names.slice(0, index + 1).join('.')}"`);
    if (index === names.length - 1) break;
    if (field.type === 'repeater') throw fail(`"${name}" is a Repeater; read it whole`);
    if (field.type !== 'object') throw fail(`"${name}" has no Fields`);
    components = field.components;
  }
  return [...scope.path, ...names];
}

/** The Fields of one data scope: Layouts flatten, Content has none. */
const fieldsIn = (components: readonly Component[]): FieldNode[] =>
  components.flatMap((node) => {
    switch (node.type) {
      case 'section':
      case 'tabs':
      case 'tab':
        return fieldsIn(node.components);
      case 'content':
        return [];
      default:
        return [node];
    }
  });
