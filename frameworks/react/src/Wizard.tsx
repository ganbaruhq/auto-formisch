import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { getDeepErrorEntries, getInput, handleSubmit, useField, validate } from '@formisch/react';
import {
  pageOf,
  shownPages,
  type CompiledForm,
  type FormOutput,
  type PageLayout,
  type PathKey,
} from '@auto-formisch/core';
import { Components } from './Components';
import { useRenderContext, useSelectedCondition, type ConditionSource } from './context';
import type { Wizard } from './contracts';
import type { AutoFormStore } from './useAutoForm';

/**
 * Whether the Fields rendered below show their errors. A Wizard shows them
 * only on Pages that were attempted: validated on the way forward, or by a
 * submit. Everywhere else they always show.
 */
export const ShowErrorsContext = createContext(true);

/** What the Renderer keeps for a Wizard: the current Page, the attempted ones, focus. */
interface WizardController {
  readonly compiled: CompiledForm;
  readonly pages: readonly PageLayout[];
  /** The shown Pages, by index in `pages`. Never empty: the cycle check sees to it. */
  readonly shown: readonly number[];
  /** The index of the Page that is open. Always one of `shown`. */
  readonly current: number;
  readonly attempted: ReadonlySet<number>;
  readonly wrapper: RefObject<HTMLDivElement | null>;
  readonly next: () => Promise<boolean>;
  readonly back: () => void;
  readonly goTo: (index: number) => Promise<boolean>;
}

const WizardContext = createContext<WizardController | null>(null);

/** How a Page change, or a failed step, moves focus once it has rendered. */
type FocusRequest =
  /** To the new Page's group, so a screen reader reads the new context. */
  | { readonly to: 'page' }
  /** To the first Field with an error on the open Page. */
  | { readonly to: 'error' }
  /** To the new Page's group, but only if focus was lost with the Page that closed. */
  | { readonly to: 'page-if-lost' };

/** The last shown Page before `index`, if there is one. */
const previous = (shown: readonly number[], index: number): number | undefined =>
  shown.filter((page) => page < index).at(-1);

/** The open Page: `current` while it is shown, else the next shown one, else the previous. */
const openPage = (current: number, shown: readonly number[]): number =>
  shown.includes(current)
    ? current
    : (shown.find((index) => index > current) ?? previous(shown, current) ?? current);

/**
 * The Page each error entry of the store sits on, `undefined` for one no Page
 * holds. `root` is the path of the root Field, `[]`, when a render reads it.
 */
const errorPages = (compiled: CompiledForm, store: AutoFormStore, root?: readonly PathKey[]) =>
  getDeepErrorEntries(store, { path: root } as never).map((entry) => pageOf(compiled, entry.path));

interface WizardOptions {
  readonly compiled: CompiledForm;
  readonly store: AutoFormStore;
  readonly conditions: ConditionSource;
  /** Marks a submit attempt, as the form's capture handler does for a regular form. */
  readonly attempt: () => void;
  /** Runs `onSubmit` with the validated output and places the errors it returns. */
  readonly handle: (output: FormOutput) => Promise<void>;
  /** Moves focus to the first Field with an error that is rendered. */
  readonly focusFirstError: () => void;
}

/**
 * The Wizard state of a form with Pages, or `null` for one without. Kept by
 * the component that owns the `<form>`, so that the native submit, the
 * `actions` slot and the `page` Layout all drive the same Wizard.
 */
export function useWizardController({
  compiled,
  store,
  conditions,
  attempt,
  handle,
  focusFirstError,
}: WizardOptions) {
  const pages = compiled.definition.pages;
  const shownKey = useSelectedCondition(conditions, (state) =>
    (pages ?? []).flatMap((page, index) => (state.isVisible(page, []) ? [index] : [])).join(),
  );
  const shown = useMemo(() => (shownKey === '' ? [] : shownKey.split(',').map(Number)), [shownKey]);
  const [current, setCurrent] = useState(() => shown[0] ?? 0);
  const [attempted, setAttempted] = useState<ReadonlySet<number>>(() => new Set());
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  // What async commands read: they must see the Page they started from, not
  // the one of the render that created them.
  const currentRef = useRef(current);
  const pending = useRef(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const open = pages === undefined ? current : openPage(current, shown);

  const move = (index: number, focus: FocusRequest) => {
    currentRef.current = index;
    setCurrent(index);
    setFocusRequest(focus);
  };

  // The open Page was hidden, by `setInput` or `reset`: it stays closed even
  // if it comes back.
  useEffect(() => {
    if (open !== current) move(open, { to: 'page-if-lost' });
  });

  useEffect(() => {
    if (focusRequest === null) return;
    if (focusRequest.to === 'error') focusFirstError();
    else if (focusRequest.to === 'page') wrapper.current?.focus();
    else if (document.activeElement === null || document.activeElement === document.body) {
      wrapper.current?.focus();
    }
  }, [focusRequest, focusFirstError]);

  if (pages === undefined) return null;

  /** The shown Pages and the open one, as the store holds them now. */
  const now = () => {
    const visible = shownPages(compiled, getInput(store));
    return { visible, from: openPage(currentRef.current, visible) };
  };
  const isBusy = () => pending.current || store.isSubmitting;

  const goTo = async (target: number): Promise<boolean> => {
    if (isBusy()) return false;
    const { visible, from } = now();
    if (!visible.includes(target)) return false;
    if (target <= from) {
      if (target < from) move(target, { to: 'page' });
      return true;
    }
    pending.current = true;
    // Never rejects: custom code that throws while validating is rethrown
    // during render by the store (`useAutoForm`), and fails the validation.
    await validate(store);
    pending.current = false;
    const steps = visible.filter((index) => index >= from && index < target);
    setAttempted((previous) => new Set([...previous, ...steps]));
    const onPages = errorPages(compiled, store);
    // An error no Page holds shows in the general region, and blocks every step.
    if (onPages.includes(undefined)) return false;
    const blocked = steps.find((index) => onPages.includes(index));
    if (blocked !== undefined) {
      move(blocked, { to: 'error' });
      return false;
    }
    move(target, { to: 'page' });
    return true;
  };

  const next = () => {
    const { visible, from } = now();
    const target = visible.find((index) => index > from);
    return target === undefined ? Promise.resolve(false) : goTo(target);
  };

  const back = () => {
    const { visible, from } = now();
    const target = previous(visible, from);
    if (target !== undefined) void goTo(target);
  };

  /** Validates and submits the whole form, whichever Page is open. */
  const submit = () => {
    setAttempted(new Set(pages.map((_, index) => index)));
    attempt();
    void handleSubmit(store, handle)();
  };

  return {
    controller: {
      compiled,
      pages,
      shown,
      current: open,
      attempted,
      wrapper,
      next,
      back,
      goTo,
    } satisfies WizardController,
    submit,
    /**
     * The form's native submit (Enter, a submit button, `form="id"`): "Next"
     * before the last Page, a real submit on it. It runs before Formisch's own
     * handler, which it stops.
     */
    onSubmitCapture: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const { visible, from } = now();
      if (from === visible.at(-1)) submit();
      else void next();
    },
    /** After a failed submit: opens the first shown Page with an error, then focuses it. */
    openFirstError: () => {
      const onPages = errorPages(compiled, store);
      const { visible } = now();
      const first = visible.find((index) => onPages.includes(index));
      move(first ?? currentRef.current, { to: 'error' });
    },
  };
}

export const WizardProvider = WizardContext;

/**
 * Whether the errors of the Field at a data path show: always outside a
 * Wizard; in one, once the Page holding the Field was attempted. For errors
 * shown away from their Field, such as the `hidden` Widget's.
 */
export function useShowsErrorsAt(): (path: readonly PathKey[]) => boolean {
  const controller = useContext(WizardContext);
  if (controller === null) return () => true;
  const { compiled, attempted } = controller;
  return (path) => {
    const page = pageOf(compiled, path);
    return page === undefined || attempted.has(page);
  };
}

/**
 * The `wizard` object of the `actions` slot and the `page` Layout, or `null`
 * for a form without Pages. Its error counts are live: the calling component
 * re-renders when the store's errors change.
 */
export function useWizard(): Wizard | null {
  const controller = useContext(WizardContext);
  const { store } = useRenderContext();
  // A Formisch hook, so that the errors read below subscribe this component.
  // They read through its result: Formisch marks `useField` free of side
  // effects, so a production bundle drops a call whose result is unused.
  const root = useField(store, { path: [] as never });
  if (controller === null) return null;
  const { compiled, pages, shown, current, attempted, next, back, goTo } = controller;
  const onPages = errorPages(compiled, store, root.path);
  const position = shown.indexOf(current);
  return {
    pages: shown.map((index) => ({
      index,
      label: pages[index].label,
      errorCount: attempted.has(index) ? onPages.filter((page) => page === index).length : 0,
      isCurrent: index === current,
    })),
    isFirst: position === 0,
    isLast: position === shown.length - 1,
    next,
    back,
    goTo,
  };
}

/**
 * The open Page, inside the focusable group that names it. Only this Page is
 * mounted; the values and errors of the others stay in the store.
 */
export function CurrentPage() {
  const controller = useContext(WizardContext)!;
  const { pages, current, attempted, wrapper } = controller;
  const node = pages[current];
  return (
    <div key={current} ref={wrapper} role="group" tabIndex={-1} aria-label={node.label}>
      <ShowErrorsContext value={attempted.has(current)}>
        <PageLayoutWithWizard node={node}>
          <Components components={node.components} scope={[]} columns={node.columns} />
        </PageLayoutWithWizard>
      </ShowErrorsContext>
    </div>
  );
}

/**
 * The `page` Layout with a live `wizard`. Its `children` come from the parent,
 * so a change of error counts re-renders the Layout, not the Page's Fields.
 */
function PageLayoutWithWizard({
  node,
  children,
}: {
  readonly node: PageLayout;
  readonly children: ReactNode;
}) {
  const { layouts } = useRenderContext();
  const wizard = useWizard()!;
  const Page = layouts.page;
  return (
    <Page node={node} wizard={wizard}>
      {children}
    </Page>
  );
}
