import { createContext, useContext, type ComponentType } from 'react';
import type { FormStore } from '@formisch/react';
import type { CompiledForm, ConditionState } from '@auto-formisch/core';
import type { FieldWrapperProps, Labels, LayoutMap } from './contracts';
import type { WidgetResolver } from './resolve';
import type { FocusElements } from './submission';

/** What every rendered Component of one form reads. */
export interface RenderContext {
  readonly form: CompiledForm;
  readonly store: FormStore<CompiledForm['schema']>;
  /** What the Conditions decide for the current input, from `prep`'s own evaluator. */
  readonly conditions: ConditionState;
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
