import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Form, submit, useField } from '@formisch/react';
import type { CompiledForm, ConditionState, FormOutput } from '@auto-formisch/core';
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
import {
  firstErrorTarget,
  FocusTargetContext,
  keyOf,
  placeErrors,
  type FocusElements,
  type FocusTarget,
  type SubmitResult,
} from './submission';
import { useAutoForm, type AutoFormStore } from './useAutoForm';
import { DataScopeContext } from './useFormValue';
import { defaultWidgets } from './widgets';

export interface AutoFormProps<TOutput extends FormOutput = FormOutput> {
  /** The result of `compile`. Change the form by changing the React `key`. */
  readonly form: CompiledForm<TOutput>;
  /**
   * Called with the validated output, the full state of active Fields. It may
   * return `{ errors: [{ message, path }] }`, such as the server's: each error
   * shows on the shown Field its path names, every other one in the form's
   * general error region. A thrown error's `message` shows there too.
   */
  readonly onSubmit: (output: TOutput) => SubmitResult | Promise<SubmitResult>;
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
  const focusElements = useRef<FocusElements>(new Map()).current;
  const rootScope = useMemo(
    () => ({ path: [], components: compiled.definition.components, parent: null }),
    [compiled],
  );
  const base = useMemo(
    () => ({
      store,
      widgetOf: resolveWidgets(compiled.definition.components, widgetMap(widgets), overrides),
      layouts: { ...defaultLayouts, ...definedOnly(layouts) },
      fieldWrapper,
      labels: { ...defaultLabels, ...definedOnly(labels) },
      idPrefix,
      focusElements,
    }),
    [compiled, store, idPrefix, focusElements, widgets, layouts, fieldWrapper, overrides, labels],
  );
  const conditions = useConditions(compiled, store);
  const context = useMemo(() => ({ ...base, conditions }), [base, conditions]);
  const { attempt, handle, focusTarget } = useSubmission(compiled, store, onSubmit, focusElements);

  return (
    <RenderContext value={context}>
      <FocusTargetContext value={focusTarget}>
        <Form of={store} id={id} onSubmitCapture={attempt} onSubmit={handle}>
          <DataScopeContext value={rootScope}>
            <Components components={rootScope.components} scope={[]} />
          </DataScopeContext>
          <div role="alert">
            {store.errors?.map((error, index) => (
              <div key={index}>{error}</div>
            ))}
          </div>
          <Actions
            render={actions}
            isSubmitting={store.isSubmitting}
            submit={() => submit(store)}
            wizard={null}
          />
        </Form>
      </FocusTargetContext>
    </RenderContext>
  );
}

interface Attempt {
  /** Validation passed, so `onSubmit` ran. */
  reached: boolean;
  /** `onSubmit` returned errors. */
  rejected: boolean;
}

/**
 * Runs `onSubmit` and places the errors it returns. Once a submit attempt that
 * failed validation, or whose `onSubmit` returned errors, has settled, it asks
 * for focus on the first Field with an error in Definition order: the Tabs on
 * its way open first, then the element is focused.
 *
 * Formisch calls the handler only when validation passes, so an attempt is
 * marked in the capture phase, before Formisch handles the event, and is
 * settled on the first render where the store is no longer submitting.
 */
function useSubmission(
  compiled: CompiledForm,
  store: AutoFormStore,
  onSubmit: AutoFormProps['onSubmit'],
  focusElements: FocusElements,
) {
  const pending = useRef<Attempt | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const isSubmitting = store.isSubmitting;

  useEffect(() => {
    const attempt = pending.current;
    if (attempt === null || isSubmitting) return;
    pending.current = null;
    if (attempt.reached && !attempt.rejected) return;
    setFocusTarget(firstErrorTarget(compiled, store, focusElements));
  });

  useEffect(() => {
    if (focusTarget !== null) focusElements.get(keyOf(focusTarget.path))?.focus();
  }, [focusTarget, focusElements]);

  return {
    focusTarget,
    attempt: () => {
      pending.current = { reached: false, rejected: false };
    },
    handle: async (output: FormOutput) => {
      const attempt = pending.current;
      if (attempt !== null) attempt.reached = true;
      const result = await onSubmit(output);
      const errors = typeof result === 'object' && result !== null ? result.errors : undefined;
      if (errors !== undefined && errors.length > 0) {
        placeErrors(compiled, store, errors);
        if (attempt !== null) attempt.rejected = true;
      }
    },
  };
}

/**
 * What the Conditions decide for the current input, with the evaluator `prep`
 * uses. The whole input is read through a Formisch hook of this component, so
 * that this render subscribes to it whoever owns the store, and every change
 * re-evaluates. A form without Conditions never reads it, so it never
 * re-renders as a whole on input.
 */
function useConditions(compiled: CompiledForm, store: AutoFormStore): ConditionState {
  // The root path `[]` names the whole form, which the schema's path type
  // cannot express.
  const root = useField(store, { path: [] as never });
  const { conditions } = compiled;
  const input = conditions.readsValues ? root.input : undefined;
  return useMemo(() => conditions.evaluate(input), [conditions, input]);
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
