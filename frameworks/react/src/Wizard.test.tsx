import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getInput, setInput, submit } from '@formisch/react';
import {
  AutoForm,
  AutoFormError,
  compile,
  useAutoForm,
  type AutoFormProps,
  type AutoFormStore,
  type CompiledForm,
  type PageLayoutProps,
  type Wizard,
} from './index';
import { Page } from './layouts';

afterEach(cleanup);

function setup(form: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn();
  render(<AutoForm form={form} onSubmit={onSubmit} {...props} />);
  const user = userEvent.setup();
  const click = (name: string) => user.click(screen.getByRole('button', { name }));
  return { user, onSubmit, click, next: () => click('Next'), back: () => click('Back') };
}

const wizard = (...pages: unknown[]) => compile({ version: 1, pages });
const page = (label: string, components: unknown[], extra: object = {}) => ({
  type: 'page',
  label,
  ...extra,
  components,
});
const text = (name: string, extra: object = {}) => ({ type: 'text', name, label: name, ...extra });

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const queryInput = (label: string) => screen.queryByLabelText<HTMLInputElement>(label);
const group = (label: string) => screen.getByRole('group', { name: label });
const errorsOf = (label: string) =>
  (input(label).getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .map((id) => document.getElementById(id)!.textContent);
const focused = (element: () => HTMLElement) =>
  waitFor(() => expect(document.activeElement).toBe(element()));
const onPage = (label: string) => waitFor(() => expect(group(label)).toBeTruthy());

const twoPages = wizard(
  page('Contact', [text('name', { required: true }), text('nick')]),
  page('Address', [text('city', { required: true })]),
);

describe('Wizard: navigation', () => {
  it('mounts only the current Page, and "Next" stops on its errors', async () => {
    const { next } = setup(twoPages);
    expect(queryInput('city')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await next();
    await focused(() => input('name'));
    expect(errorsOf('name')).toEqual(['Required']);
    expect(queryInput('city')).toBeNull();
  });

  it('moves on once the Page is valid, focusing the new Page’s group', async () => {
    const { user, next } = setup(twoPages);
    await user.type(input('name'), 'Ada');
    await next();
    await focused(() => group('Address'));
    expect(group('Address').tabIndex).toBe(-1);
    expect(queryInput('name')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
  });

  it('"Back" keeps values and does not validate', async () => {
    const { user, next, back } = setup(twoPages);
    await user.type(input('name'), 'Ada');
    await next();
    await onPage('Address');
    await back();
    await focused(() => group('Contact'));
    expect(input('name').value).toBe('Ada');
    await next();
    await focused(() => group('Address'));
    expect(errorsOf('city')).toEqual([]);
  });
});

describe('Wizard: errors', () => {
  it('shows errors only on attempted Pages, though the store holds every Page’s', async () => {
    let wizardSeen: Wizard | null = null;
    const { user, next } = setup(twoPages, {
      layouts: {
        page: (props: PageLayoutProps) => {
          wizardSeen = props.wizard;
          return <Page {...props} />;
        },
      },
    });
    await user.type(input('nick'), 'x');
    await user.clear(input('nick'));
    // Typing validated the whole form, yet nothing shows before "Next".
    expect(errorsOf('name')).toEqual([]);
    expect(wizardSeen!.pages.map((item) => item.errorCount)).toEqual([0, 0]);
    await user.type(input('name'), 'Ada');
    await next();
    await onPage('Address');
    await user.type(input('city'), 'x');
    await user.clear(input('city'));
    expect(errorsOf('city')).toEqual([]);
    expect(wizardSeen!.pages).toEqual([
      { index: 0, label: 'Contact', errorCount: 0, isCurrent: false },
      { index: 1, label: 'Address', errorCount: 0, isCurrent: true },
    ]);
  });

  it('moves focus once per blocked step, never again while the user types', async () => {
    const { user, next } = setup(twoPages);
    await next();
    await focused(() => input('name'));
    await user.click(input('nick'));
    await user.type(input('nick'), 'abc');
    expect(document.activeElement).toBe(input('nick'));
  });

  it('revalidates an attempted Page as the user types', async () => {
    const { user, next } = setup(twoPages);
    await next();
    await focused(() => input('name'));
    await user.type(input('name'), 'A');
    expect(errorsOf('name')).toEqual([]);
    await user.clear(input('name'));
    await waitFor(() => expect(errorsOf('name')).toEqual(['Required']));
  });

  const lateError = wizard(
    page('Contact', [
      text('name'),
      text('taxId', { required: { field: 'kind', operator: 'eq', value: 'company' } }),
    ]),
    page('Kind', [text('kind')]),
    page('Done', [text('notes')]),
  );

  it('lets "Next" pass a new error on an earlier Page; the final submit opens that Page', async () => {
    const { user, next, click, onSubmit } = setup(lateError);
    await next();
    await onPage('Kind');
    await user.type(input('kind'), 'company');
    await next();
    await focused(() => group('Done'));
    await click('Submit');
    await focused(() => input('taxId'));
    expect(group('Contact')).toBeTruthy();
    expect(errorsOf('taxId')).toEqual(['Required']);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('stays on the last Page after a successful submit, with the whole form’s output', async () => {
    const { user, next, click, onSubmit } = setup(twoPages);
    await user.type(input('name'), 'Ada');
    await next();
    await onPage('Address');
    await user.type(input('city'), 'Hanoi');
    await click('Submit');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', city: 'Hanoi' }));
    expect(group('Address')).toBeTruthy();
  });
});

describe('Wizard: hidden Pages', () => {
  const branching = wizard(
    page('Kind', [text('kind')]),
    page('Company', [text('taxId', { required: true })], {
      visible: { field: 'kind', operator: 'eq', value: 'company' },
    }),
  );

  it('leave the navigation, so "Next" and "Submit" swap as values change', async () => {
    const { user, next, back, click, onSubmit } = setup(branching);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
    await user.type(input('kind'), 'company');
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    await next();
    await onPage('Company');
    await user.type(input('taxId'), '123');
    await back();
    await onPage('Kind');
    await user.clear(input('kind'));
    await user.type(input('kind'), 'person');
    await click('Submit');
    // The hidden Page's Field is Inactive: not validated and not submitted.
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ kind: 'person' }));
  });

  it('move the open Page on when it is hidden from outside, keeping its values', async () => {
    const store: { current?: AutoFormStore } = {};
    function WithStore() {
      store.current = useAutoForm(branching);
      return <AutoForm form={branching} store={store.current} onSubmit={vi.fn()} />;
    }
    render(<WithStore />);
    const user = userEvent.setup();
    await user.type(input('kind'), 'company');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await onPage('Company');
    await user.type(input('taxId'), '123');
    act(() => setInput(store.current!, { path: ['kind'], input: 'person' } as never));
    await onPage('Kind');
    await focused(() => group('Kind'));
    act(() => setInput(store.current!, { path: ['kind'], input: 'company' } as never));
    expect(group('Kind')).toBeTruthy();
    expect(getInput(store.current!)).toMatchObject({ taxId: '123' });
  });
});

/** Renders with an `actions` slot that keeps the latest `wizard` and `submit`. */
function withActions(form: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const seen: { wizard: Wizard | null; submit: () => void } = { wizard: null, submit: () => {} };
  const result = setup(form, {
    actions: ({ wizard, submit }) => {
      seen.wizard = wizard;
      seen.submit = submit;
      return <button type="submit">Go</button>;
    },
    ...props,
  });
  return { ...result, seen };
}

const threePages = wizard(
  page('A', [text('a', { required: true })]),
  page('B', [text('b', { required: true })]),
  page('C', [text('c')], { visible: { field: 'a', operator: 'neq', value: 'skip' } }),
  page('D', [text('d')]),
);

describe('Wizard: the wizard object', () => {
  it('lists shown Pages by their Definition index', async () => {
    const { user, seen } = withActions(threePages);
    expect(seen.wizard).toMatchObject({ isFirst: true, isLast: false });
    expect(seen.wizard!.pages.map((item) => item.index)).toEqual([0, 1, 2, 3]);
    await user.type(input('a'), 'skip');
    await waitFor(() => expect(seen.wizard!.pages.map((item) => item.index)).toEqual([0, 1, 3]));
  });

  it('goTo validates every Page on the way and stops at the first with errors', async () => {
    const { user, seen } = withActions(threePages);
    await user.type(input('a'), 'x');
    let moved: boolean | undefined;
    await act(async () => {
      moved = await seen.wizard!.goTo(3);
    });
    expect(moved).toBe(false);
    await focused(() => input('b'));
    expect(errorsOf('b')).toEqual(['Required']);
    expect(seen.wizard!.pages.map((item) => item.errorCount)).toEqual([0, 1, 0, 0]);
    await user.type(input('b'), 'y');
    await act(async () => {
      moved = await seen.wizard!.goTo(3);
    });
    expect(moved).toBe(true);
    await focused(() => group('D'));
    expect(seen.wizard).toMatchObject({ isFirst: false, isLast: true });
    await act(async () => {
      moved = await seen.wizard!.goTo(0);
    });
    expect(moved).toBe(true);
    await focused(() => group('A'));
  });

  it('goTo a hidden Page or an unknown index does nothing', async () => {
    const { user, seen } = withActions(threePages);
    await user.type(input('a'), 'skip');
    for (const index of [2, 9, -1]) {
      let moved: boolean | undefined;
      await act(async () => {
        moved = await seen.wizard!.goTo(index);
      });
      expect(moved).toBe(false);
    }
    expect(group('A')).toBeTruthy();
  });

  it('ignores commands while a step is pending, so a double click moves one Page', async () => {
    const { user, seen } = withActions(threePages);
    await user.type(input('a'), 'x');
    let results: boolean[] = [];
    await act(async () => {
      results = await Promise.all([seen.wizard!.next(), seen.wizard!.next()]);
    });
    expect(results).toEqual([true, false]);
    await focused(() => group('B'));
    await user.dblClick(screen.getByRole('button', { name: 'Go' }));
    await focused(() => input('b'));
  });

  it('is in the page Layout, whose default shows the label and description', async () => {
    const pages: number[][] = [];
    setup(
      wizard(page('Contact', [text('name')], { description: 'Who you are' }), page('More', [])),
      {
        layouts: {
          page: (props: PageLayoutProps) => {
            pages.push(props.wizard.pages.map((item) => item.index));
            return <Page {...props} />;
          },
        },
      },
    );
    expect(pages.at(-1)).toEqual([0, 1]);
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeTruthy();
    expect(screen.getByText('Who you are')).toBeTruthy();
  });

  it('takes "next" and "back" from labels', async () => {
    const { user } = setup(twoPages, { labels: { next: 'Tiếp', back: 'Quay lại' } });
    await user.type(input('name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Tiếp' }));
    await onPage('Address');
    expect(screen.getByRole('button', { name: 'Quay lại' }).getAttribute('type')).toBe('button');
  });
});

describe('Wizard: submitting', () => {
  it('runs "Next" on a native submit before the last Page, such as Enter', async () => {
    const { user, onSubmit } = setup(twoPages);
    await user.type(input('name'), 'Ada{Enter}');
    await focused(() => group('Address'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits for real from the actions slot’s submit(), on any Page', async () => {
    const { user, seen, onSubmit } = withActions(twoPages);
    await user.type(input('name'), 'Ada');
    act(() => seen.submit());
    // Validation fails on the Page not reached yet, which opens.
    await focused(() => input('city'));
    expect(errorsOf('city')).toEqual(['Required']);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('runs "Next" for Formisch’s submit(store) before the last Page', async () => {
    const store: { current?: AutoFormStore } = {};
    const onSubmit = vi.fn();
    function WithStore() {
      store.current = useAutoForm(twoPages);
      return <AutoForm form={twoPages} store={store.current} onSubmit={onSubmit} />;
    }
    render(<WithStore />);
    await userEvent.setup().type(input('name'), 'Ada');
    act(() => submit(store.current!));
    await focused(() => group('Address'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('opens the Page of a Field that onSubmit’s errors name; others go to the alert', async () => {
    const onSubmit = vi.fn(() => ({
      errors: [
        { message: 'Taken', path: ['name'] },
        { message: 'Server down', path: ['nowhere'] },
      ],
    }));
    const { user, next, click } = setup(twoPages, { onSubmit });
    await user.type(input('name'), 'Ada');
    await next();
    await onPage('Address');
    await user.type(input('city'), 'Hanoi');
    await click('Submit');
    await focused(() => input('name'));
    expect(errorsOf('name')).toEqual(['Taken']);
    expect(screen.getByRole('alert').textContent).toBe('Server down');
  });

  it('opens the Page, then the Tab, of the first error', async () => {
    const tabbed = wizard(
      page('One', [text('a')]),
      page('Two', [
        {
          type: 'tabs',
          components: [
            { type: 'tab', label: 'First', components: [text('b')] },
            { type: 'tab', label: 'Second', components: [text('c', { required: true })] },
          ],
        },
      ]),
      page('Three', [text('d')]),
    );
    const { seen } = withActions(tabbed);
    act(() => seen.submit());
    await focused(() => input('c'));
    expect(screen.getByRole('tab', { name: /^Second/ }).getAttribute('aria-selected')).toBe('true');
    expect(seen.wizard!.pages.map((item) => item.errorCount)).toEqual([0, 1, 0]);
  });

  it('keeps a Repeater’s rows on a Page that unmounts, and maps a row error to its Page', async () => {
    const rows = wizard(
      page('Rows', [
        { type: 'repeater', name: 'rows', components: [text('street', { required: true })] },
      ]),
      page('End', [text('end')]),
    );
    const { user, click, next, back, onSubmit } = setup(rows);
    await click('Add');
    await user.type(input('street'), 'Main');
    await click('Add');
    await next();
    await focused(() => screen.getAllByLabelText<HTMLInputElement>('street')[1]);
    await user.type(screen.getAllByLabelText('street')[1], 'Side');
    await next();
    await onPage('End');
    await back();
    await onPage('Rows');
    expect(screen.getAllByLabelText<HTMLInputElement>('street').map((el) => el.value)).toEqual([
      'Main',
      'Side',
    ]);
    await next();
    await onPage('End');
    await click('Submit');
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ rows: [{ street: 'Main' }, { street: 'Side' }] }),
    );
  });
});

describe('Wizard: Widgets and overrides', () => {
  it('checks every Page on mount, not just the open one', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const form = wizard(page('One', [text('a')]), page('Two', [text('b', { widget: 'nope' })]));
    let errors: unknown;
    try {
      render(<AutoForm form={form} onSubmit={() => {}} overrides={{ c: { label: 'C' } }} />);
    } catch (error) {
      errors = (error as AutoFormError).errors;
    } finally {
      consoleError.mockRestore();
    }
    expect(errors).toEqual([
      { message: 'No Field at "c"', path: ['overrides', 'c'] },
      {
        message: 'No Widget "nope" for the Field at "b"',
        path: ['pages', 1, 'components', 0, 'widget'],
      },
    ]);
  });

  it('shows a hidden-Widget Field’s errors in the alert only once its Page is attempted', async () => {
    const form = wizard(
      page('One', [text('a')]),
      page('Two', [text('id', { widget: 'hidden', required: true }), text('b')]),
    );
    const { user, next, click } = setup(form);
    await user.type(input('a'), 'x');
    expect(screen.getByRole('alert').textContent).toBe('');
    await next();
    await onPage('Two');
    expect(screen.getByRole('alert').textContent).toBe('');
    await click('Submit');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Required'));
  });

  it('seeds every Page from defaults, and from initialInput', async () => {
    const form = wizard(
      page('One', [text('a', { default: 'first' })]),
      page('Two', [text('b', { default: 'second' })]),
    );
    const { next } = setup(form);
    expect(input('a').value).toBe('first');
    await next();
    await onPage('Two');
    expect(input('b').value).toBe('second');
    cleanup();
    const edited = setup(form, { initialInput: { b: 'kept' } });
    await edited.next();
    await onPage('Two');
    expect(input('b').value).toBe('kept');
  });

  it('applies overrides to a Field on a later Page', async () => {
    const { user, next } = setup(twoPages, { overrides: { city: { label: 'Town' } } });
    await user.type(input('name'), 'Ada');
    await next();
    await onPage('Address');
    expect(input('Town')).toBeTruthy();
  });
});

describe('Wizard: parity with the server', () => {
  it('the server rejects what the last Page’s submit rejects, as one whole form', async () => {
    const form = wizard(
      page('Contact', [
        text('name'),
        text('taxId', { required: { field: 'kind', operator: 'eq', value: 'company' } }),
      ]),
      page('Kind', [text('kind')]),
    );
    const { user, next, click, onSubmit } = setup(form);
    await next();
    await onPage('Kind');
    await user.type(input('kind'), 'company');
    await click('Submit');
    await focused(() => input('taxId'));
    expect(onSubmit).not.toHaveBeenCalled();
    const shown = errorsOf('taxId');
    expect(form['~standard'].validate({ kind: 'company' })).toEqual({
      issues: [{ message: shown[0], path: ['taxId'] }],
    });
    // Fixing it on the client is what the server accepts, too.
    await user.type(input('taxId'), '123');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await onPage('Kind');
    await click('Submit');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [output] = onSubmit.mock.calls[0];
    expect(form['~standard'].validate({ kind: 'company', taxId: '123' })).toEqual({
      value: output,
    });
  });
});
