import { createContext, useContext, useSyncExternalStore, type ComponentType } from 'react';
import type { FormStore } from '@formisch/react';
import type { CompiledForm, ConditionState } from '@auto-formisch/core';
import type { FieldWrapperProps, Labels, LayoutMap } from './contracts';
import type { WidgetResolver } from './resolve';
import type { FocusElements } from './submission';

/** What every rendered Component of one form reads. */
export interface RenderContext {
  readonly form: CompiledForm;
  readonly store: FormStore<CompiledForm['schema']>;
  /**
   * What the Conditions decide for the current input, from `prep`'s own
   * evaluator. Read it with `useCondition`, which re-renders a component only
   * when what it selects changes.
   */
  readonly conditions: ConditionSource;
  /** The Widget of a Field or Content, checked on mount. */
  readonly widgetOf: WidgetResolver;
  readonly layouts: LayoutMap;
  readonly fieldWrapper: ComponentType<FieldWrapperProps>;
  readonly labels: Labels;
  /** Prefix for element ids, unique per form instance. */
  readonly idPrefix: string;
  /** Where a Field's focusable element is kept, for focus after a failed submit. */
  readonly focusElements: FocusElements;
}

export const RenderContext = createContext<RenderContext | null>(null);

export function useRenderContext(): RenderContext {
  const context = useContext(RenderContext);
  if (context === null) throw new Error('Auto Formisch Components must render inside <AutoForm>');
  return context;
}

/**
 * The latest `ConditionState` of one form, kept outside React state: one
 * component re-evaluates it on input (`ConditionsProvider`), and each
 * Component subscribes to its own result through `useCondition`, so a
 * keystroke re-renders only the Components whose result changed (AF-36).
 */
export interface ConditionSource {
  readonly get: () => ConditionState;
  readonly subscribe: (listener: () => void) => () => void;
}

/** A source that holds `state` and tells its listeners when `set` replaces it. */
export function conditionSource(state: ConditionState) {
  let current = state;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Replaces the state; `notify` then tells the listeners. */
    set: (next: ConditionState) => {
      current = next;
    },
    notify: () => {
      for (const listener of listeners) listener();
    },
  };
}

/**
 * What `select` reads from the current Conditions, such as one Component's
 * `isVisible`. The component re-renders only when the selection changes, so
 * `select` must return a primitive or a value that is the same when equal.
 */
export function useSelectedCondition<T>(
  source: ConditionSource,
  select: (state: ConditionState) => T,
): T {
  const read = () => select(source.get());
  return useSyncExternalStore(source.subscribe, read, read);
}

/** `useSelectedCondition` on the source of the form this component renders in. */
export const useCondition = <T>(select: (state: ConditionState) => T): T =>
  useSelectedCondition(useRenderContext().conditions, select);
