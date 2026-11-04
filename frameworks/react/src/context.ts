import { createContext, useContext, type ComponentType } from 'react';
import type { FormStore } from '@formisch/react';
import type { CompiledForm } from '@auto-formisch/core';
import type { FieldWrapperProps, LayoutMap, WidgetEntry } from './contracts';

/** What every rendered Component of one form reads. */
export interface RenderContext {
  readonly store: FormStore<CompiledForm['schema']>;
  readonly widgets: Readonly<Record<string, WidgetEntry>>;
  readonly layouts: LayoutMap;
  readonly fieldWrapper: ComponentType<FieldWrapperProps>;
  /** Prefix for element ids, unique per form instance. */
  readonly idPrefix: string;
}

export const RenderContext = createContext<RenderContext | null>(null);

export function useRenderContext(): RenderContext {
  const context = useContext(RenderContext);
  if (context === null) throw new Error('Auto Formisch Components must render inside <AutoForm>');
  return context;
}
