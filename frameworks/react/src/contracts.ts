import type { ComponentType, ReactNode, Ref } from 'react';
import type { FieldNode } from '@auto-formisch/core';

/**
 * Props the Renderer gives a Widget. A Widget draws only the control; the Field
 * Wrapper draws label, description and errors. A Widget calls `onChange` with
 * `undefined` when its value is empty, and converts values itself.
 */
export interface WidgetProps<V = unknown, N extends FieldNode = FieldNode> {
  readonly value: V | undefined;
  readonly onChange: (value: V | undefined) => void;
  /** Spread onto the focusable control. Formisch's `autoFocus` is never passed. */
  readonly inputProps: InputProps;
  /** Ready to display. */
  readonly errors: readonly string[];
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly node: N;
}

export interface InputProps {
  readonly id: string;
  readonly name: string;
  readonly ref: Ref<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement>;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly 'aria-invalid': true | undefined;
  readonly 'aria-describedby': string | undefined;
  readonly 'aria-required': true | undefined;
}

/** Props of the frame around every Widget. */
export interface FieldWrapperProps<N extends FieldNode = FieldNode> {
  readonly node: N;
  readonly label: string;
  readonly description: string | undefined;
  readonly errors: readonly string[];
  readonly required: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  /** Use `fieldset` / `legend` instead of `label htmlFor`. */
  readonly group: boolean;
  readonly labelFor: string;
  readonly descriptionId: string;
  readonly errorsId: string;
  readonly children: ReactNode;
}

/** A Widget map entry, looked up by `widget ?? type`. */
export interface WidgetEntry {
  readonly component: ComponentType<WidgetProps<any, any>>;
  /** The Widget is several controls, so the wrapper uses `fieldset` / `legend`. */
  readonly group?: boolean;
  /** The Field Types this Widget can present. */
  readonly appliesTo?: readonly string[];
}
