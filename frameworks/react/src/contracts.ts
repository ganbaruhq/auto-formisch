import type { ComponentType, ReactNode, Ref } from 'react';
import type { ContentNode, FieldNode, SectionLayout, TabLayout } from '@auto-formisch/core';

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

/** Props of a Content Widget. It shows `node.text` as plain text, never as HTML. */
export interface ContentProps {
  readonly node: ContentNode;
}

/**
 * Props of the `section` and `tab` Layouts. `children` already holds the grid
 * when the node sets `columns`.
 */
export interface LayoutProps<N extends SectionLayout | TabLayout = SectionLayout | TabLayout> {
  readonly node: N;
  readonly children: ReactNode;
}

/** One Tab as the `tabs` Layout sees it. `children` is the rendered `tab` Layout. */
export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly children: ReactNode;
}

/**
 * Props of the `tabs` Layout. The Renderer keeps the active Tab; the Layout
 * must keep every Tab's `children` mounted, so their values stay validated.
 */
export interface TabsLayoutProps {
  readonly tabs: readonly TabItem[];
  readonly activeKey: string;
  readonly onActiveChange: (key: string) => void;
}

/** The Layouts the Renderer uses, by `type`. */
export interface LayoutMap {
  readonly section: ComponentType<LayoutProps<SectionLayout>>;
  readonly tabs: ComponentType<TabsLayoutProps>;
  readonly tab: ComponentType<LayoutProps<TabLayout>>;
}

/** A Widget map entry, looked up by `widget ?? type` for Fields and Content. */
export interface WidgetEntry {
  readonly component: ComponentType<WidgetProps<any, any>>;
  /** The Widget is several controls, so the wrapper uses `fieldset` / `legend`. */
  readonly group?: boolean;
  /** The Field Types this Widget can present. */
  readonly appliesTo?: readonly string[];
}
