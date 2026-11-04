import type { ComponentType, ReactNode, Ref, RefCallback } from 'react';
import type {
  BooleanField,
  ChoiceField,
  ChoiceValue,
  ContentNode,
  CustomField,
  DateField,
  MultiChoiceField,
  NumberField,
  ObjectField,
  PageLayout,
  RepeaterField,
  SectionLayout,
  TabLayout,
  TextField,
  ValueField,
} from '@auto-formisch/core';

/**
 * Props the Renderer gives a value Field's Widget. A Widget draws only the
 * control; the Field Wrapper draws label, description and errors. A Widget
 * calls `onChange` with `undefined` when its value is empty, and converts
 * values itself. A custom Field Type's Widget takes
 * `WidgetProps<InferFieldValue<typeof type>, InferFieldNode<typeof type>>`.
 */
export interface WidgetProps<V = unknown, N extends ValueField | CustomField = ValueField> {
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
export interface FieldWrapperProps<N extends ValueField | CustomField = ValueField> {
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
  /**
   * Put on the element that takes focus when a failed submit stops at the
   * Repeater's own errors, such as `min_items`. It must be focusable.
   */
  readonly focusRef: RefCallback<HTMLElement>;
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
  /** How many Fields in the Tab show errors now, so a closed Tab can say so. */
  readonly errorCount: number;
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

/** One shown Page as the Wizard's navigation sees it. */
export interface WizardPage {
  /** Its index in the Definition's `pages`, the same whichever Pages are hidden. */
  readonly index: number;
  readonly label: string;
  /** How many Fields on the Page show errors: always 0 until the Page is attempted. */
  readonly errorCount: number;
  readonly isCurrent: boolean;
}

/**
 * Navigation of a Wizard, for the `actions` slot and the `page` Layout.
 * Going forward validates the Pages on the way and stops at the first one with
 * errors; going back never validates. While a step or a submit is pending,
 * every command is ignored. Custom code that throws while validating is a
 * bug: `next` and `goTo` reject with its error.
 */
export interface Wizard {
  /** The shown Pages only, in order. Use the position here for "Step 2 of 3". */
  readonly pages: readonly WizardPage[];
  readonly isFirst: boolean;
  readonly isLast: boolean;
  /** Moves to the next shown Page; `false` when errors or a pending command stop it. */
  readonly next: () => Promise<boolean>;
  /** Moves to the previous shown Page, keeping values and validating nothing. */
  readonly back: () => void;
  /**
   * Moves to the Page at `index` in the Definition's `pages`. Forward, it
   * validates every Page from the current one up to the target; `false` for
   * a hidden Page, an unknown index, or errors on the way.
   */
  readonly goTo: (index: number) => Promise<boolean>;
}

/**
 * Props of the `page` Layout. The Renderer wraps it in a focusable
 * `role="group"` named by the Page's label, and focuses that on a Page change.
 */
export interface PageLayoutProps {
  readonly node: PageLayout;
  readonly children: ReactNode;
  readonly wizard: Wizard;
}

/** The Layouts the Renderer uses, by `type`. */
export interface LayoutMap {
  readonly section: ComponentType<LayoutProps<SectionLayout>>;
  readonly tabs: ComponentType<TabsLayoutProps>;
  readonly tab: ComponentType<LayoutProps<TabLayout>>;
  readonly page: ComponentType<PageLayoutProps>;
}

/**
 * A Widget map entry with its options. A bare component is the same as
 * `{ component }`.
 */
export interface WidgetEntry<P = any> {
  readonly component: ComponentType<P>;
  /** The Widget is several controls, so the wrapper uses `fieldset` / `legend`. */
  readonly group?: boolean;
  /**
   * The Field (or Content) types this Widget can present. Checked on mount;
   * without it, any type may use the Widget.
   */
  readonly appliesTo?: readonly string[];
}

/** A Widget map value: a component, or an entry with options. */
export type WidgetDeclaration<P = any> = ComponentType<P> | WidgetEntry<P>;

/** The props of the Widget presenting each built-in type. */
export interface WidgetPropsByType {
  readonly text: WidgetProps<string, TextField>;
  readonly number: WidgetProps<number, NumberField>;
  readonly boolean: WidgetProps<boolean, BooleanField>;
  readonly choice: WidgetProps<ChoiceValue, ChoiceField>;
  readonly multi_choice: WidgetProps<readonly ChoiceValue[], MultiChoiceField>;
  readonly date: WidgetProps<string, DateField>;
  readonly object: ObjectProps;
  readonly repeater: RepeaterProps;
  readonly content: ContentProps;
}

/**
 * The `widgets` prop, merged over the default Widgets. A Field or Content uses
 * the entry named by its `widget ?? type`. An entry named after a built-in type
 * must take that type's props.
 */
export type WidgetMap = {
  readonly [K in keyof WidgetPropsByType]?: WidgetDeclaration<WidgetPropsByType[K]>;
} & { readonly [name: string]: WidgetDeclaration };

/**
 * What `overrides` may change on one Field: presentation only, so validation
 * stays the same as on the server. `widget` must name a Widget in the map.
 */
export interface FieldOverride {
  readonly widget?: string;
  readonly label?: string;
  readonly description?: string;
  readonly placeholder?: string;
}

/**
 * The `overrides` prop, by data path without Repeater indices, such as
 * `'address.city'` or `'pets.kind'` for every row of `pets`. Layouts have no
 * path, so they can't be overridden.
 */
export type Overrides = Readonly<Record<string, FieldOverride>>;

/**
 * The wording of the default buttons, as plain strings. `submit`, `next` and
 * `back` are the default action area's; the others are the default Repeater
 * Widget's.
 */
export interface Labels {
  readonly submit: string;
  /** A Wizard's button to the next Page, in place of `submit` before the last one. */
  readonly next: string;
  /** A Wizard's button to the previous Page. */
  readonly back: string;
  readonly add: string;
  readonly remove: string;
  readonly moveUp: string;
  readonly moveDown: string;
}

/** What the `actions` slot gets to draw the form's buttons. */
export interface ActionsProps {
  readonly isSubmitting: boolean;
  /**
   * Validates and submits the whole form. In a Wizard it is always a real
   * submit, even before the last Page, unlike the form's native submit.
   */
  readonly submit: () => void;
  /** Wizard navigation; always `null` for a form without Pages. */
  readonly wizard: Wizard | null;
}
