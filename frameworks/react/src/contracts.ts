import type { ComponentType, ReactNode, Ref } from 'react';
import type {
  ContentNode,
  ObjectField,
  RepeaterField,
  SectionLayout,
  TabLayout,
  ValueField,
} from '@auto-formisch/core';

/**
 * Props the Renderer gives a value Field's Widget. A Widget draws only the
 * control; the Field Wrapper draws label, description and errors. A Widget
 * calls `onChange` with `undefined` when its value is empty, and converts
 * values itself.
 */
export interface WidgetProps<V = unknown, N extends ValueField = ValueField> {
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

/** Props of the frame around every value Field's Widget. */
export interface FieldWrapperProps<N extends ValueField = ValueField> {
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

/**
 * Props of an `object` Widget. It has no Field Wrapper: it names the group of
 * its `children`, the rendered Components, itself.
 */
export interface ObjectProps {
  readonly children: ReactNode;
  readonly disabled: boolean;
  readonly node: ObjectField;
}

/** One Repeater row as its Widget sees it. */
export interface RepeaterRow {
  /** Stable across reorders: use it as the React `key`, never `index`. */
  readonly key: string;
  readonly index: number;
  /** The rendered Components of the row template. */
  readonly children: ReactNode;
  readonly remove: () => void;
  /** Moves this row to `index`, shifting the rows in between. */
  readonly moveTo: (index: number) => void;
}

/**
 * Props of a Repeater Widget. It has no Field Wrapper: it names its group and
 * shows `errors`, the Repeater's own (such as `min_items`), itself. Removing a
 * row is never blocked by `min_items`; the error comes on validation.
 */
export interface RepeaterProps {
  readonly rows: readonly RepeaterRow[];
  readonly add: () => void;
  /** `false` while disabled, or once there are `max_items` rows. */
  readonly canAdd: boolean;
  readonly disabled: boolean;
  /** Ready to display. */
  readonly errors: readonly string[];
  readonly node: RepeaterField;
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

/**
 * A Widget map entry, looked up by `widget ?? type` for Fields and Content.
 * Its props depend on what it presents: a value Field, an `object`, a
 * Repeater or Content.
 */
export interface WidgetEntry {
  readonly component:
    | ComponentType<WidgetProps<any, any>>
    | ComponentType<ObjectProps>
    | ComponentType<RepeaterProps>
    | ComponentType<ContentProps>;
  /** The Widget is several controls, so the wrapper uses `fieldset` / `legend`. */
  readonly group?: boolean;
  /** The Field Types this Widget can present. */
  readonly appliesTo?: readonly string[];
}
