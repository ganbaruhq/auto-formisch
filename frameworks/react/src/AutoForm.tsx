import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Form, getErrors, getInput, submit, useField } from '@formisch/react';
import type { CompiledForm, Component, FormOutput, PathKey, ValueField } from '@auto-formisch/core';
import { Components } from './Components';
import { conditionSource, RenderContext, useRenderContext, type ConditionSource } from './context';
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
import { resolveWidgets, type WidgetResolver } from './resolve';
import {
  firstErrorTarget,
  FocusTargetContext,
  isHiddenWidget,
  keyOf,
  namedError,
  placeErrors,
  presentedHidden,
  shownFields,
  type FocusElements,
  type FocusTarget,
  type SubmitResult,
} from './submission';
import { AutoFormError } from './AutoFormError';
import { useAutoForm, useSameForm, type AutoFormStore } from './useAutoForm';
import { DataScopeContext } from './useFormValue';
import {
  CurrentPage,
  useShowsErrorsAt,
  useWizard,
  useWizardController,
  WizardProvider,
} from './Wizard';
import { defaultWidgets } from './widgets';

export interface AutoFormProps<TOutput extends FormOutput = FormOutput> {
  /**
   * The result of `compile` or `lock`. Change the form by changing the React
   * `key`; a new `form` without a remount throws, so memoize one you derive.
   */
  readonly form: CompiledForm<TOutput>;
  /**
   * Called with the validated output, the full state of active Fields. It may
   * return `{ errors: [{ message, path }] }`, such as the server's: each error
   * shows on the shown Field its path names, every other one in the form's
   * general error region. A thrown error's `message` shows there too.
   * Custom code that throws while validating, such as a buggy custom Rule, is
   * a bug instead: it is rethrown during render, for an error boundary, and
   * `onSubmit` is never called.
   */
  readonly onSubmit: (output: TOutput) => SubmitResult | Promise<SubmitResult>;
  /**
   * The Formisch store from `useAutoForm(form)`, for an application that calls
   * Formisch itself. Without it, `<AutoForm>` creates its own.
   */
  readonly store?: AutoFormStore<TOutput>;
  /**
   * An existing record to edit, read only at mount: change the React `key` to
   * switch record. It replaces every `default`; for a partial prefill pass
   * `{ ...form.defaults, ...prefill }`. Keys without a Field are dropped, and
   * a value of the wrong type for its Field starts empty, with a
   * `console.warn`. With `store`, pass it to `useAutoForm` instead.
   */
  readonly initialInput?: object;
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
  next: 'Next',
  back: 'Back',
  add: 'Add',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  invalidNumber: 'Enter a number',
};

/**
 * Renders a compiled Form Definition on Formisch with native HTML and no
 * stylesheet. It validates on submit and revalidates on input. A Wizard shows
 * one Page at a time and validates on input, but shows only the errors of the
 * Pages already attempted.
 */
export function AutoForm<TOutput extends FormOutput = FormOutput>(props: AutoFormProps<TOutput>) {
  const { store, initialInput, ...rest } = props as AutoFormProps;
  if (store === undefined) return <WithOwnStore {...rest} initialInput={initialInput} />;
  if (initialInput !== undefined) {
    throw new AutoFormError([
      {
        message: 'Pass "initialInput" to useAutoForm, not with "store"',
        path: ['initialInput'],
      },
    ]);
  }
  return <Rendered {...rest} store={store} />;
}

function WithOwnStore({ initialInput, ...props }: Omit<AutoFormProps, 'store'>) {
  return <Rendered {...props} store={useAutoForm(props.form, { initialInput })} />;
}

type RenderedProps = Omit<AutoFormProps, 'initialInput'> & { readonly store: AutoFormStore };

function Rendered(props: RenderedProps) {
  useSameForm(props.form);
  const [source] = useState(() => conditionSource(props.form.conditions.evaluate(undefined)));
  return (
    <ConditionsProvider compiled={props.form} store={props.store} source={source}>
      <RenderedForm {...props} conditions={source} />
    </ConditionsProvider>
  );
}

/**
 * Keeps the form's `ConditionSource` up to date. It re-renders on every input
 * of a form with Conditions, but its `children` come from its parent, so they
 * don't: each Component re-renders only when its own Condition result changes.
 * The state is replaced during render, so the Components that render in the
 * same pass read it, and the others are told once it commits.
 */
function ConditionsProvider({
  compiled,
  store,
  source,
  children,
}: {
  readonly compiled: CompiledForm;
  readonly store: AutoFormStore;
  readonly source: ReturnType<typeof conditionSource>;
  readonly children: ReactNode;
}) {
  // The root path `[]` names the whole form, which the schema's path type
  // cannot express. Reading its input subscribes this component to all of it.
  const root = useField(store, { path: [] as never });
  const { conditions } = compiled;
  if (conditions.readsValues) source.set(conditions.evaluate(root.input));
  useLayoutEffect(() => {
    if (conditions.readsValues) source.notify();
  });
  return children;
}

function RenderedForm({
  form: compiled,
  store,
  conditions,
  onSubmit,
  id,
  widgets,
  layouts,
  fieldWrapper = FieldWrapper,
  overrides,
  labels,
  actions = DefaultActions,
}: RenderedProps & { readonly conditions: ConditionSource }) {
  // A Formisch hook, so that the store's root errors and `isSubmitting`, read
  // below, re-render this component.
  const root = useField(store, { path: [] as never });
  const idPrefix = useId();
  const focusElements = useRef<FocusElements>(new Map()).current;
  const rootScope = useMemo(
    () => ({
      path: [],
      components: compiled.definition.pages ?? compiled.definition.components,
      parent: null,
    }),
    [compiled],
  );
  const base = useMemo(
    () => ({
      form: compiled,
      store,
      widgetOf: resolveWidgets(compiled.definition, widgetMap(widgets), overrides),
      layouts: { ...defaultLayouts, ...definedOnly(layouts) },
      fieldWrapper,
      labels: { ...defaultLabels, ...definedOnly(labels) },
      conditions,
      idPrefix,
      focusElements,
    }),
    [
      compiled,
      store,
      conditions,
      idPrefix,
      focusElements,
      widgets,
      layouts,
      fieldWrapper,
      overrides,
      labels,
    ],
  );
  const hasHidden = useMemo(() => hasHiddenWidget(compiled, base.widgetOf), [compiled, base]);
  useEffect(() => {
    if (!hasHidden) return;
    for (const path of unfillableHidden(compiled, base.widgetOf, getInput(store))) {
      console.warn(
        `Auto Formisch: "${path}" uses the hidden Widget and is required, but has no default; a user can never fill it in`,
      );
    }
    // On mount only, like the initialInput warnings.
  }, []);
  // A Wizard opens the Page of the first error before focusing it.
  const openFirstError = useRef<(() => void) | null>(null);
  const { attempt, handle, focusTarget, focusFirstError } = useSubmission(
    compiled,
    store,
    base.widgetOf,
    onSubmit,
    focusElements,
    openFirstError,
  );
  const wizard = useWizardController({
    compiled,
    store,
    conditions,
    attempt,
    handle,
    focusFirstError,
  });
  openFirstError.current = wizard?.openFirstError ?? null;

  return (
    <RenderContext value={base}>
      <WizardProvider value={wizard?.controller ?? null}>
        <FocusTargetContext value={focusTarget}>
          <Form
            of={store}
            id={id}
            onSubmitCapture={wizard?.onSubmitCapture ?? attempt}
            onSubmit={handle}
          >
            <DataScopeContext value={rootScope}>
              {wizard !== null ? (
                <CurrentPage />
              ) : (
                <Components components={rootScope.components} scope={[]} />
              )}
            </DataScopeContext>
            <div role="alert">
              {root.errors?.map((error, index) => (
                <div key={index}>{error}</div>
              ))}
              {hasHidden && <HiddenWidgetErrors />}
            </div>
            <Actions
              render={actions}
              isSubmitting={store.isSubmitting}
              submit={wizard?.submit ?? (() => submit(store))}
            />
          </Form>
        </FocusTargetContext>
      </WizardProvider>
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
  widgetOf: WidgetResolver,
  onSubmit: AutoFormProps['onSubmit'],
  focusElements: FocusElements,
  /** Replaces focusing the first error, such as a Wizard's opening its Page first. */
  onFailed: { readonly current: (() => void) | null },
) {
  const pending = useRef<Attempt | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const isSubmitting = store.isSubmitting;

  useEffect(() => {
    const attempt = pending.current;
    if (attempt === null || isSubmitting) return;
    pending.current = null;
    if (attempt.reached && !attempt.rejected) return;
    if (onFailed.current !== null) onFailed.current();
    else setFocusTarget(firstErrorTarget(compiled, store, widgetOf, focusElements));
  });

  useEffect(() => {
    if (focusTarget !== null) focusElements.get(keyOf(focusTarget.path))?.focus();
  }, [focusTarget, focusElements]);

  const focusFirstError = useCallback(
    () => setFocusTarget(firstErrorTarget(compiled, store, widgetOf, focusElements)),
    [compiled, store, widgetOf, focusElements],
  );

  return {
    focusTarget,
    focusFirstError,
    attempt: () => {
      pending.current = { reached: false, rejected: false };
    },
    handle: async (output: FormOutput) => {
      const attempt = pending.current;
      if (attempt !== null) attempt.reached = true;
      const result = await onSubmit(output);
      const errors = typeof result === 'object' && result !== null ? result.errors : undefined;
      if (errors !== undefined && errors.length > 0) {
        placeErrors(compiled, store, widgetOf, errors);
        if (attempt !== null) attempt.rejected = true;
      }
    },
  };
}

/** Whether any value Field of the form, in any row template, uses the `hidden` Widget. */
function hasHiddenWidget(compiled: CompiledForm, widgetOf: WidgetResolver): boolean {
  const any = (components: readonly Component[]): boolean =>
    components.some((node) => {
      if (node.type === 'content') return false;
      if (node.type === 'object' || node.type === 'repeater') return any(node.components);
      if ('components' in node) return any(node.components);
      return isHiddenWidget(widgetOf(node).node);
    });
  return any(compiled.definition.pages ?? compiled.definition.components);
}

/**
 * The data paths, without row indexes, of the `hidden`-Widget Fields that are
 * required and have no `default`: the user can never give them a value. One
 * outside a Repeater is fine while the starting input holds its value, as an
 * edited record does; one in a Repeater's rows is not, since Add starts a row
 * without it.
 */
function unfillableHidden(
  compiled: CompiledForm,
  widgetOf: WidgetResolver,
  input: unknown,
): string[] {
  const found: string[] = [];
  const walk = (components: readonly Component[], path: readonly string[], value: unknown) => {
    const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
      PathKey,
      unknown
    >;
    for (const node of components) {
      if (node.type === 'content') continue;
      if (node.type === 'object') walk(node.components, [...path, node.name], record[node.name]);
      else if (node.type === 'repeater') walk(node.components, [...path, node.name], undefined);
      else if ('components' in node) walk(node.components, path, value);
      else if (
        isHiddenWidget(widgetOf(node).node) &&
        node.required !== undefined &&
        node.required !== false &&
        node.default === undefined &&
        !compiled.locked.has(node) &&
        isBlank(record[node.name])
      ) {
        found.push([...path, node.name].join('.'));
      }
    }
  };
  walk(compiled.definition.pages ?? compiled.definition.components, [], input);
  return found;
}

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/**
 * The errors of the shown Fields that the `hidden` Widget presents, which
 * have no Field Wrapper to show them, in Definition order.
 */
function HiddenWidgetErrors() {
  const { form, store, widgetOf, conditions: source } = useRenderContext();
  // A Formisch hook makes this component re-render when what it reads below
  // changes: the rows of the form, and the errors of those Fields.
  const root = useField(store, { path: [] as never });
  // On a Wizard, only the errors of attempted Pages show.
  const showsErrorsAt = useShowsErrorsAt();
  // Up to date: the `ConditionsProvider` re-renders first on the same input.
  const fields = shownFields(
    form.definition.pages ?? form.definition.components,
    source.get(),
    root.input,
    presentedHidden(widgetOf),
  );
  return fields.flatMap(({ path, node, hidden }) =>
    hidden && showsErrorsAt(path)
      ? (getErrors(store, { path } as never) ?? []).map((error, index) => (
          <div key={`${keyOf(path)}#${index}`}>
            {namedError(widgetOf(node as ValueField).node as ValueField, error)}
          </div>
        ))
      : [],
  );
}

/**
 * Renders the `actions` slot as a component of its own, so it may use hooks,
 * and so that live Wizard error counts re-render only the buttons.
 */
function Actions({
  render,
  ...props
}: Omit<ActionsProps, 'wizard'> & { readonly render: AutoFormProps['actions'] & {} }) {
  const wizard = useWizard();
  return render({ ...props, wizard });
}

/**
 * The default action area: a submit button, disabled while submitting. In a
 * Wizard it reads "Next" before the last Page, and a "Back" button that never
 * submits comes first on every Page but the first.
 */
function DefaultActions({ isSubmitting, wizard }: ActionsProps) {
  const { labels } = useRenderContext();
  return (
    <>
      {wizard !== null && !wizard.isFirst && (
        <button type="button" onClick={wizard.back}>
          {labels.back}
        </button>
      )}
      <button type="submit" disabled={isSubmitting}>
        {wizard !== null && !wizard.isLast ? labels.next : labels.submit}
      </button>
    </>
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
