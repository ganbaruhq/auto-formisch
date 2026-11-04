import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { StrictMode, useMemo, useState, type ReactElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  AutoFormError,
  compile,
  useAutoForm,
  type AutoFormProps,
  type CompiledForm,
  type FormOutput,
} from './index';

// Defaults, `initialInput` and the edit flow, through <AutoForm> (AF-11).

afterEach(cleanup);

function setup(form: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  const view = render(<AutoForm form={form} onSubmit={onSubmit} {...props} />);
  const user = userEvent.setup();
  return {
    ...view,
    user,
    onSubmit,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
    /** The output of the last successful submit. */
    submitted: async () => {
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      return onSubmit.mock.calls.at(-1)![0];
    },
  };
}

/** What rendering throws; fails if it renders. */
function renderError(element: ReactElement): unknown {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(element);
  } catch (error) {
    return error;
  } finally {
    consoleError.mockRestore();
  }
  throw new Error('Expected rendering to throw');
}

const root = (...components: unknown[]) => compile({ version: 1, components });
const input = (label: string, container: HTMLElement = document.body) =>
  within(container).getByLabelText<HTMLInputElement>(label);
const select = (label: string) => screen.getByLabelText<HTMLSelectElement>(label);
const group = (name: string) => screen.getByRole('group', { name });
const button = (name: string, container: HTMLElement) =>
  within(container).getAllByRole<HTMLButtonElement>('button', { name }).at(-1)!;
const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .flatMap((id) => [...document.getElementById(id)!.children].map((e) => e.textContent));
const alertText = () => [...screen.getByRole('alert').children].map((e) => e.textContent);

const profile = root(
  { type: 'text', name: 'name', label: 'Name', default: 'Ada' },
  { type: 'number', name: 'age', label: 'Age', default: 0 },
  { type: 'choice', name: 'country', label: 'Country', choices: ['VN', 'US'], default: 'VN' },
  { type: 'boolean', name: 'news', label: 'News', default: true },
  { type: 'text', name: 'note', label: 'Note' },
);

describe('default', () => {
  it('seeds a new form, which submits it', async () => {
    const { submit, submitted } = setup(profile);
    expect(input('Name').value).toBe('Ada');
    expect(input('Age').value).toBe('0');
    expect(select('Country').selectedOptions[0].textContent).toBe('VN');
    expect(input('News').checked).toBe(true);
    await submit();
    const output = await submitted();
    expect(output).toEqual({ name: 'Ada', age: 0, country: 'VN', news: true });
    // The server gets the same from the same input.
    expect(profile['~standard'].validate(profile.defaults)).toEqual({ value: output });
  });

  it('stays empty once the user clears it', async () => {
    const { user, submit, submitted } = setup(profile);
    await user.clear(input('Name'));
    await user.selectOptions(select('Country'), '');
    await submit();
    expect(await submitted()).toEqual({ age: 0, news: true });
  });

  it('does not satisfy required once cleared', async () => {
    const { user, submit, onSubmit } = setup(
      root({ type: 'text', name: 'name', label: 'Name', default: 'Ada', required: true }),
    );
    await user.clear(input('Name'));
    await submit();
    await waitFor(() => expect(errorsOf(input('Name'))).toEqual(['Required']));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the value of an Inactive Field, which comes back when it is active', async () => {
    const form = root(
      { type: 'boolean', name: 'company', label: 'Company' },
      {
        type: 'text',
        name: 'taxId',
        label: 'Tax ID',
        default: 'none',
        visible: { field: 'company', operator: 'eq', value: true },
      },
    );
    const { user, submit, submitted } = setup(form);
    expect(screen.queryByLabelText('Tax ID')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({});
    await user.click(input('Company'));
    expect(input('Tax ID').value).toBe('none');
  });
});

describe('Repeater default', () => {
  const lines = root({
    type: 'repeater',
    name: 'lines',
    label: 'Lines',
    default: [{}, { item: 'Pen' }],
    components: [
      { type: 'text', name: 'item', label: 'Item' },
      { type: 'number', name: 'qty', label: 'Qty', default: 1 },
    ],
  });
  const row = (index: number) => group(`Lines ${index + 1}`);

  it('starts with its rows, filled with the defaults of the row Fields', async () => {
    const { submit, submitted } = setup(lines);
    expect(input('Item', row(0)).value).toBe('');
    expect(input('Qty', row(0)).value).toBe('1');
    expect(input('Item', row(1)).value).toBe('Pen');
    await submit();
    expect(await submitted()).toEqual({
      lines: [{ qty: 1 }, { item: 'Pen', qty: 1 }],
    });
  });

  it('adds a row from the defaults of the row Fields, also after removing rows', async () => {
    const { user, submit, submitted } = setup(lines);
    await user.clear(input('Qty', row(1)));
    await user.click(button('Remove', row(1)));
    await user.click(button('Remove', row(0)));
    await user.click(button('Add', group('Lines')));
    await user.click(button('Add', group('Lines')));
    expect(input('Item', row(0)).value).toBe('');
    expect(input('Qty', row(1)).value).toBe('1');
    await submit();
    expect(await submitted()).toEqual({ lines: [{ qty: 1 }, { qty: 1 }] });
  });

  it('adds nested rows from their defaults', async () => {
    const form = root({
      type: 'repeater',
      name: 'orders',
      label: 'Orders',
      components: [
        {
          type: 'repeater',
          name: 'items',
          label: 'Items',
          default: [{}],
          components: [{ type: 'number', name: 'qty', label: 'Qty', default: 2 }],
        },
      ],
    });
    const { user, submit, submitted } = setup(form);
    await user.click(button('Add', group('Orders')));
    expect(input('Qty', group('Items 1')).value).toBe('2');
    await submit();
    expect(await submitted()).toEqual({ orders: [{ items: [{ qty: 2 }] }] });
  });
});

describe('initialInput', () => {
  const record = { name: 'Grace', note: 'Hi' };

  it('replaces every default, so a value the record lacks stays empty', async () => {
    const { submit, submitted } = setup(profile, { initialInput: record });
    expect(input('Name').value).toBe('Grace');
    expect(input('Age').value).toBe('');
    expect(select('Country').value).toBe('');
    await submit();
    expect(await submitted()).toEqual({ name: 'Grace', note: 'Hi' });
  });

  it('combines with compiled.defaults for a partial prefill', async () => {
    const { submit, submitted } = setup(profile, {
      initialInput: { ...profile.defaults, note: 'From the URL' },
    });
    await submit();
    expect(await submitted()).toEqual({
      name: 'Ada',
      age: 0,
      country: 'VN',
      news: true,
      note: 'From the URL',
    });
  });

  it('does not fill rows of the record from defaults, but a new row is filled', async () => {
    const form = root({
      type: 'repeater',
      name: 'lines',
      label: 'Lines',
      default: [{}],
      components: [
        { type: 'text', name: 'item', label: 'Item' },
        { type: 'number', name: 'qty', label: 'Qty', default: 1 },
      ],
    });
    const { user, submit, submitted } = setup(form, {
      initialInput: { lines: [{ item: 'Pen' }] },
    });
    await user.click(button('Add', group('Lines')));
    await submit();
    expect(await submitted()).toEqual({ lines: [{ item: 'Pen' }, { qty: 1 }] });
  });

  it('starts with no rows when the record has none', async () => {
    const form = root({
      type: 'repeater',
      name: 'lines',
      label: 'Lines',
      default: [{}],
      components: [{ type: 'text', name: 'item', label: 'Item' }],
    });
    const { submit, submitted } = setup(form, { initialInput: {} });
    expect(screen.queryByLabelText('Item')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({ lines: [] });
  });

  it('works through useAutoForm and <AutoForm store>', async () => {
    const onSubmit = vi.fn();
    function Edit() {
      const store = useAutoForm(profile, { initialInput: record });
      return <AutoForm form={profile} store={store} onSubmit={onSubmit} />;
    }
    render(<Edit />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(record));
  });

  it('throws when combined with store', () => {
    function Both() {
      const store = useAutoForm(profile);
      return <AutoForm form={profile} store={store} initialInput={record} onSubmit={() => {}} />;
    }
    const error = renderError(<Both />);
    expect(error).toBeInstanceOf(AutoFormError);
    expect((error as AutoFormError).errors).toEqual([
      {
        message: 'Pass "initialInput" to useAutoForm, not with "store"',
        path: ['initialInput'],
      },
    ]);
  });

  it('is read only at mount', async () => {
    const { rerender, submit, submitted, onSubmit } = setup(profile, { initialInput: record });
    rerender(<AutoForm form={profile} initialInput={{ name: 'Alan' }} onSubmit={onSubmit} />);
    expect(input('Name').value).toBe('Grace');
    await submit();
    expect(await submitted()).toEqual(record);
  });

  it('switches record when the key changes', async () => {
    const onSubmit = vi.fn();
    const records = [
      { id: 1, name: 'Grace' },
      { id: 2, name: 'Alan', note: 'x' },
    ];
    function Screen() {
      const [current, setCurrent] = useState(records[0]);
      const form = useMemo(() => profile, [current.id]);
      return (
        <>
          <button type="button" onClick={() => setCurrent(records[1])}>
            Next record
          </button>
          <AutoForm key={current.id} form={form} initialInput={current} onSubmit={onSubmit} />
        </>
      );
    }
    render(<Screen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next record' }));
    expect(input('Name').value).toBe('Alan');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Alan', note: 'x' }));
  });

  it('gives the store a copy, so a change to the record never reaches the form', async () => {
    const tags = root({
      type: 'multi_choice',
      name: 'tags',
      label: 'Tags',
      choices: ['a', 'b'],
    });
    const given = { tags: ['a'] };
    const { user, submit, submitted } = setup(tags, { initialInput: given });
    await user.click(screen.getByLabelText('b'));
    expect(given).toEqual({ tags: ['a'] });
    given.tags.push('x');
    await submit();
    expect(await submitted()).toEqual({ tags: ['a', 'b'] });
  });
});

describe('normalizing a record', () => {
  const form = root(
    { type: 'text', name: 'name', label: 'Name' },
    { type: 'number', name: 'age', label: 'Age' },
    {
      type: 'choice',
      name: 'country',
      label: 'Country',
      choices: ['VN', 'US'],
    },
    {
      type: 'text',
      name: 'code',
      label: 'Code',
      rules: [{ type: 'min_length', requirement: 3 }],
    },
    {
      type: 'object',
      name: 'address',
      label: 'Address',
      components: [{ type: 'text', name: 'city', label: 'City' }],
    },
    {
      type: 'repeater',
      name: 'lines',
      label: 'Lines',
      components: [{ type: 'text', name: 'item', label: 'Item' }],
    },
  );

  it('completes the shape and drops keys without a Field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { submit, submitted } = setup(form, {
      initialInput: { name: 'Ada', createdAt: '2024', lines: [{ item: 'Pen', id: 7 }, {}] },
    });
    await submit();
    expect(await submitted()).toEqual({ name: 'Ada', address: {}, lines: [{ item: 'Pen' }, {}] });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('empties a value of the wrong type with a warning, at a leaf or in the structure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { submit, submitted } = setup(form, {
      initialInput: { name: { first: 'Ada' }, age: '41', address: 'Hanoi', lines: 'Pen' },
    });
    expect(input('Name').value).toBe('');
    await submit();
    expect(await submitted()).toEqual({ address: {}, lines: [] });
    expect(warn.mock.calls.map((call) => call.join(' '))).toEqual([
      'Auto Formisch: initialInput "name": Expected a string, not an object; left empty',
      'Auto Formisch: initialInput "age": Expected a number, not a string; left empty',
      'Auto Formisch: initialInput "address": Expected an object, not a string; left empty',
      'Auto Formisch: initialInput "lines": Expected a list, not a string; left empty',
    ]);
    warn.mockRestore();
  });

  it('keeps a value outside the choices or breaking a Rule, so submitting reports it', async () => {
    const { submit, onSubmit } = setup(form, { initialInput: { country: 'FR', code: 'ab' } });
    await submit();
    await waitFor(() =>
      expect(errorsOf(select('Country'))).toEqual([
        'Invalid type: Expected ("VN" | "US") but received "FR"',
      ]),
    );
    expect(errorsOf(input('Code'))).toEqual(['Invalid length: Expected >=3 but received 2']);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('changing form', () => {
  it('throws when the form changes without a remount', () => {
    const first = root({ type: 'text', name: 'name', label: 'Name' });
    const second = root({ type: 'text', name: 'name', label: 'Name' });
    const view = render(<AutoForm form={first} onSubmit={() => {}} />);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let error: unknown;
    try {
      view.rerender(<AutoForm form={second} onSubmit={() => {}} />);
    } catch (thrown) {
      error = thrown;
    } finally {
      consoleError.mockRestore();
    }
    expect(error).toBeInstanceOf(AutoFormError);
    expect((error as AutoFormError).errors).toEqual([
      {
        message: 'The form changed without a remount; change the React key to switch form',
        path: ['form'],
      },
    ]);
  });

  it('throws from useAutoForm too, and not under StrictMode with the same form', () => {
    const first = root({ type: 'text', name: 'name', label: 'Name' });
    function Own({ form }: { readonly form: CompiledForm }) {
      const store = useAutoForm(form);
      return <AutoForm form={first} store={store} onSubmit={() => {}} />;
    }
    const view = render(
      <StrictMode>
        <Own form={first} />
      </StrictMode>,
    );
    expect(input('Name')).toBeDefined();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      view.rerender(
        <StrictMode>
          <Own form={root({ type: 'text', name: 'name' })} />
        </StrictMode>,
      ),
    ).toThrow(AutoFormError);
    consoleError.mockRestore();
  });
});

describe('the hidden Widget', () => {
  const contacts = root({
    type: 'repeater',
    name: 'contacts',
    label: 'Contacts',
    components: [
      { type: 'number', name: 'id', widget: 'hidden', required: true },
      { type: 'text', name: 'name', label: 'Name' },
    ],
  });
  const row = (index: number) => group(`Contacts ${index + 1}`);
  const record = {
    contacts: [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ],
  };

  it('keeps the value in the output with no Field Wrapper, and it follows its row', async () => {
    const { user, submit, submitted } = setup(contacts, { initialInput: record });
    expect(within(row(0)).getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByText('id')).toBeNull();
    await user.click(button('Move down', row(0)));
    await submit();
    expect(await submitted()).toEqual({
      contacts: [
        { id: 2, name: 'Grace' },
        { id: 1, name: 'Ada' },
      ],
    });
  });

  it('shows its errors in the general error region', async () => {
    const { user, submit, onSubmit } = setup(contacts, { initialInput: record });
    await user.click(button('Add', group('Contacts')));
    await submit();
    await waitFor(() => expect(alertText()).toEqual(['Required']));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(button('Remove', row(2)));
    await waitFor(() => expect(alertText()).toEqual([]));
  });

  it('puts an onSubmit error for it in the general error region', async () => {
    const { submit } = setup(contacts, {
      initialInput: record,
      onSubmit: () => ({ errors: [{ message: 'Not yours', path: ['contacts', 1, 'id'] }] }),
    });
    await submit();
    await waitFor(() => expect(alertText()).toEqual(['Not yours']));
  });

  it('applies only to a Field with one value', () => {
    const error = renderError(
      <AutoForm
        form={root({
          type: 'object',
          name: 'o',
          widget: 'hidden',
          components: [{ type: 'text', name: 'a' }],
        })}
        onSubmit={() => {}}
      />,
    );
    expect((error as AutoFormError).errors).toEqual([
      {
        message: 'Widget "hidden" does not apply to the "object" Field at "o"',
        path: ['components', 0, 'widget'],
      },
    ]);
  });

  it('can be chosen through overrides', async () => {
    const { submit, submitted } = setup(root({ type: 'text', name: 'ref', label: 'Ref' }), {
      initialInput: { ref: 'abc' },
      overrides: { ref: { widget: 'hidden' } },
    });
    expect(screen.queryByLabelText('Ref')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({ ref: 'abc' });
  });
});

describe('editing a record', () => {
  it('submits the full state of the active Fields', async () => {
    const form = root(
      { type: 'text', name: 'name', label: 'Name' },
      { type: 'text', name: 'nickname', label: 'Nickname' },
      { type: 'text', name: 'legacy', label: 'Legacy', disabled: true },
      { type: 'choice', name: 'country', label: 'Country', choices: ['VN', 'US'] },
    );
    const { user, submit, submitted } = setup(form, {
      initialInput: {
        name: 'Ada',
        nickname: 'A',
        legacy: 'old',
        country: 'VN',
        createdAt: '2024-01-01',
      },
    });
    await user.clear(input('Nickname'));
    await user.type(input('Name'), ' L.');
    await submit();
    expect(await submitted()).toEqual({ name: 'Ada L.', country: 'VN' });
  });
});
