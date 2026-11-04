import { createContext, useContext, type ComponentType } from 'react';
import type { FormStore } from '@formisch/react';
import type { CompiledForm } from '@auto-formisch/core';
import type { FieldWrapperProps, Labels, LayoutMap } from './contracts';
import type { WidgetResolver } from './resolve';

/** What every rendered Component of one form reads. */
export interface RenderContext {
  readonly store: FormStore<CompiledForm['schema']>;
  /** The Widget of a Field or Content, checked on mount. */
  readonly widgetOf: WidgetResolver;
  readonly layouts: LayoutMap;
  readonly fieldWrapper: ComponentType<FieldWrapperProps>;
  readonly labels: Labels;
  /** Prefix for element ids, unique per form instance. */
  readonly idPrefix: string;
}

export const RenderContext = createContext<RenderContext | null>(null);

export function useRenderContext(): RenderContext {
  const context = useContext(RenderContext);
  if (context === null) throw new Error('Auto Formisch Components must render inside <AutoForm>');
  return context;
}
