import { useId, useMemo, type ComponentType, type ReactNode } from 'react';
import { Form, submit } from '@formisch/react';
import type { CompiledForm, FormOutput } from '@auto-formisch/core';
import { Components } from './Components';
import { RenderContext, useRenderContext } from './context';
import { FieldWrapper } from './FieldWrapper';
import { defaultLayouts } from './layouts';
import type {
  ActionsProps,
  FieldWrapperProps,
  Labels,
  LayoutMap,
  Overrides,
  WidgetDeclaration,
  WidgetEntry,
  WidgetMap,
} from './contracts';
import { resolveWidgets } from './resolve';
import { useAutoForm, type AutoFormStore } from './useAutoForm';
import { DataScopeContext } from './useFormValue';
import { defaultWidgets } from './widgets';

export interface AutoFormProps<TOutput extends FormOutput = FormOutput> {
  /** The result of `compile`. Change the form by changing the React `key`. */
  readonly form: CompiledForm<TOutput>;
  /** Called with the validated output, the full state of active Fields. */
  readonly onSubmit: (output: TOutput) => void | Promise<void>;
  /**
   * The Formisch store from `useAutoForm(form)`, for an application that calls
   * Formisch itself. Without it, `<AutoForm>` creates its own.
   */
  readonly store?: AutoFormStore<TOutput>;
  /** Set on the `form` element, so buttons outside it can use `form="id"`. */
  readonly id?: string;
  /** Widgets by name, merged over the defaults. Looked up by `widget ?? type`. */
  readonly widgets?: WidgetMap;
  /** Layouts by `type`, merged over the defaults. */
  readonly layouts?: Partial<LayoutMap>;
  /** The frame around every value Field's Widget: label, description and errors. */
  readonly fieldWrapper?: ComponentType<FieldWrapperProps>;
  /**
   * Per-Field `widget`, `label`, `description` and `placeholder`, by data path.
   * They change presentation only, never validation.
   */
  readonly overrides?: Overrides;
  /** Wording of the default buttons, merged over the English defaults. */
  readonly labels?: Partial<Labels>;
  /** Draws the form's buttons in place of the default submit button. */
  readonly actions?: (props: ActionsProps) => ReactNode;
}

const defaultLabels: Labels = {
  submit: 'Submit',
  add: 'Add',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
};

/**
 * Renders a compiled Form Definition on Formisch with native HTML and no
 * stylesheet. It validates on submit and revalidates on input.
 */
export function AutoForm<TOutput extends FormOutput = FormOutput>(props: AutoFormProps<TOutput>) {
  const { store, ...rest } = props as AutoFormProps;
  return store === undefined ? <WithOwnStore {...rest} /> : <Rendered {...rest} store={store} />;
}

function WithOwnStore(props: Omit<AutoFormProps, 'store'>) {
  return <Rendered {...props} store={useAutoForm(props.form)} />;
}

function Rendered({
  form: compiled,
  store,
  onSubmit,
  id,
  widgets,
  layouts,
  fieldWrapper = FieldWrapper,
  overrides,
  labels,
  actions = DefaultActions,
}: AutoFormProps & { readonly store: AutoFormStore }) {
  const idPrefix = useId();
  const rootScope = useMemo(
    () => ({ path: [], components: compiled.definition.components, parent: null }),
    [compiled],
  );
  const context = useMemo(
    () => ({
      store,
      widgetOf: resolveWidgets(compiled.definition.components, widgetMap(widgets), overrides),
      layouts: { ...defaultLayouts, ...definedOnly(layouts) },
      fieldWrapper,
      labels: { ...defaultLabels, ...definedOnly(labels) },
      idPrefix,
    }),
    [compiled, store, idPrefix, widgets, layouts, fieldWrapper, overrides, labels],
  );

  return (
    <RenderContext value={context}>
      <Form of={store} id={id} onSubmit={(output) => onSubmit(output)}>
        <DataScopeContext value={rootScope}>
          <Components components={rootScope.components} scope={[]} />
        </DataScopeContext>
        <div role="alert">{store.errors?.join(' ')}</div>
        <Actions
          render={actions}
          isSubmitting={store.isSubmitting}
          submit={() => submit(store)}
          wizard={null}
        />
      </Form>
    </RenderContext>
  );
}

/** Renders the `actions` slot as a component of its own, so it may use hooks. */
function Actions({
  render,
  ...props
}: ActionsProps & { readonly render: AutoFormProps['actions'] & {} }) {
  return render(props);
}

/** The default action area: a submit button, disabled while submitting. */
function DefaultActions({ isSubmitting }: ActionsProps) {
  const { labels } = useRenderContext();
  return (
    <button type="submit" disabled={isSubmitting}>
      {labels.submit}
    </button>
  );
}

const entryOf = (declaration: WidgetDeclaration): WidgetEntry =>
  typeof declaration === 'object' && declaration !== null && 'component' in declaration
    ? declaration
    : { component: declaration };

/** The defaults with `widgets` merged over them, every value as an entry. */
function widgetMap(widgets: WidgetMap = {}): Readonly<Record<string, WidgetEntry>> {
  const merged: Record<string, WidgetEntry> = { ...defaultWidgets };
  for (const [name, declaration] of Object.entries(widgets)) {
    if (declaration !== undefined) merged[name] = entryOf(declaration as WidgetDeclaration);
  }
  return merged;
}

/** Drops keys set to `undefined`, so that they keep the default. */
const definedOnly = <T extends object>(map: T = {} as T): Partial<T> =>
  Object.fromEntries(Object.entries(map).filter(([, value]) => value !== undefined)) as Partial<T>;
