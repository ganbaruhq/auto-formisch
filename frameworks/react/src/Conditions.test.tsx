import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setInput } from '@formisch/react';
import {
  AutoForm,
  compile,
  useAutoForm,
  type AutoFormStore,
  type CompiledForm,
  type FormOutput,
} from './index';

afterEach(cleanup);

function setup(form: CompiledForm) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} />);
  const user = userEvent.setup();
  return {
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

const root = (...components: unknown[]) => compile({ version: 1, components });
const text = (name: string, label: string, extra: object = {}) => ({
  type: 'text',
  name,
  label,
  ...extra,
});
const leaf = (field: string, operator: string, value?: unknown) =>
  value === undefined ? { field, operator } : { field, operator, value };

const query = (label: string) => screen.queryByLabelText<HTMLInputElement>(label);
const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);

describe('AutoForm: visible', () => {
  const form = root(
    text('country', 'Country'),
    text('taxId', 'Tax ID', { required: true, visible: leaf('country', 'eq', 'VN') }),
  );

  it('shows a Field only while its Condition holds', async () => {
    const { user } = setup(form);
    expect(query('Tax ID')).toBeNull();
    await user.type(input('Country'), 'VN');
    expect(query('Tax ID')).not.toBeNull();
    await user.type(input('Country'), 'X');
    expect(query('Tax ID')).toBeNull();
  });

  it('brings a hidden value back when its Field reappears, but never submits it', async () => {
    const { user, submit, submitted } = setup(form);
    await user.type(input('Country'), 'VN');
    await user.type(input('Tax ID'), '123');
    await user.type(input('Country'), 'X');
    await submit();
    expect(await submitted()).toEqual({ country: 'VNX' });
    await user.type(input('Country'), '{Backspace}');
    expect(input('Tax ID').value).toBe('123');
  });

  it('leaves a hidden Component out of the grid, so it takes no cell', async () => {
    const grid = root({
      type: 'section',
      columns: 2,
      components: [
        text('a', 'A', { visible: leaf('b', 'not_empty') }),
        text('b', 'B'),
        text('c', 'C', { colSpan: 2 }),
      ],
    });
    const { user } = setup(grid);
    const cells = () => [...input('B').closest('[style*="grid-template-columns"]')!.children];
    expect(cells().map((cell) => cell.querySelector('input')!.id.split('-').at(-1))).toEqual([
      'b',
      'c',
    ]);
    await user.type(input('B'), 'x');
    expect(cells()).toHaveLength(3);
  });

  it('hides Layouts and Content with what they hold, and drops a hidden Tab', async () => {
    const form = root(
      { type: 'boolean', name: 'more', label: 'More' },
      {
        type: 'section',
        label: 'Extra',
        visible: leaf('more', 'eq', true),
        components: [text('a', 'A')],
      },
      { type: 'content', text: 'Read this', visible: leaf('more', 'eq', true) },
      {
        type: 'tabs',
        components: [
          { type: 'tab', label: 'One', components: [text('b', 'B')] },
          {
            type: 'tab',
            label: 'Two',
            visible: leaf('more', 'eq', true),
            components: [text('c', 'C')],
          },
        ],
      },
    );
    const { user } = setup(form);
    expect(query('A')).toBeNull();
    expect(screen.queryByText('Read this')).toBeNull();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['One']);
    expect(query('C')).toBeNull();
    await user.click(input('More'));
    expect(screen.getByRole('group', { name: 'Extra' })).toBeDefined();
    expect(screen.getByText('Read this')).toBeDefined();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['One', 'Two']);
  });

  it('opens the first shown Tab when the open one is hidden', async () => {
    const form = root(
      { type: 'boolean', name: 'skip', label: 'Skip' },
      {
        type: 'tabs',
        components: [
          {
            type: 'tab',
            label: 'One',
            visible: leaf('skip', 'neq', true),
            components: [text('b', 'B')],
          },
          { type: 'tab', label: 'Two', components: [text('c', 'C')] },
        ],
      },
    );
    const { user } = setup(form);
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('One');
    await user.click(input('Skip'));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Two']);
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Two');
  });

  it('hides along a chain: a hidden Field reads as empty, whatever it still holds', async () => {
    const form = root(
      { type: 'boolean', name: 'on', label: 'On' },
      text('b', 'B', { visible: leaf('on', 'eq', true) }),
      text('c', 'C', { visible: leaf('b', 'not_empty') }),
    );
    const { user, submit, submitted } = setup(form);
    await user.click(input('On'));
    await user.type(input('B'), 'x');
    await user.type(input('C'), 'y');
    await user.click(input('On'));
    expect(query('B')).toBeNull();
    expect(query('C')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({ on: false });
  });

  it('follows the input of a store the application owns', async () => {
    const form = root(
      text('country', 'Country'),
      text('taxId', 'Tax ID', { visible: leaf('country', 'eq', 'VN') }),
    );
    let owned: AutoFormStore | undefined;
    function Owner() {
      const store = useAutoForm(form);
      owned = store;
      return <AutoForm form={form} store={store} onSubmit={() => {}} />;
    }
    render(<Owner />);
    const user = userEvent.setup();
    expect(query('Tax ID')).toBeNull();
    await user.type(input('Country'), 'VN');
    expect(query('Tax ID')).not.toBeNull();
    // A change the application makes through Formisch, not through a Widget.
    act(() => setInput(owned!, { path: ['country'] as never, input: 'US' as never }));
    expect(query('Tax ID')).toBeNull();
  });
});

describe('AutoForm: disabled and required', () => {
  it('disables a Field natively and leaves it out of validation and output', async () => {
    const form = root(
      { type: 'boolean', name: 'same', label: 'Same address' },
      text('billing', 'Billing', { required: true, disabled: leaf('same', 'eq', true) }),
    );
    const { user, submit, submitted } = setup(form);
    await user.type(input('Billing'), 'Main St');
    await user.click(input('Same address'));
    expect(input('Billing').disabled).toBe(true);
    expect(input('Billing').getAttribute('aria-required')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({ same: true });
    await user.click(input('Same address'));
    expect(input('Billing').disabled).toBe(false);
    expect(input('Billing').value).toBe('Main St');
  });

  it('disables every Field of a disabled object', async () => {
    const form = root(
      { type: 'boolean', name: 'lock', label: 'Lock' },
      {
        type: 'object',
        name: 'address',
        label: 'Address',
        disabled: leaf('lock', 'eq', true),
        components: [text('street', 'Street', { required: true })],
      },
    );
    const { user, submit, submitted } = setup(form);
    await user.click(input('Lock'));
    const fieldset = screen.getByRole<HTMLFieldSetElement>('group', { name: 'Address' });
    expect(fieldset.disabled).toBe(true);
    expect(input('Street').disabled).toBe(true);
    await submit();
    expect(await submitted()).toEqual({ lock: true, address: {} });
  });

  it('turns off adding, removing and reordering rows of a disabled Repeater', async () => {
    const form = root(
      { type: 'boolean', name: 'lock', label: 'Lock' },
      {
        type: 'repeater',
        name: 'items',
        label: 'Items',
        disabled: leaf('lock', 'eq', true),
        rules: [{ type: 'min_items', requirement: 3 }],
        components: [text('name', 'Name')],
      },
    );
    const { user, submit, submitted } = setup(form);
    const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name });
    await user.click(button('Add'));
    await user.click(button('Add'));
    await user.click(input('Lock'));
    expect(button('Add').disabled).toBe(true);
    for (const name of ['Remove', 'Move up', 'Move down']) {
      expect(
        screen.getAllByRole<HTMLButtonElement>('button', { name }).every((b) => b.disabled),
      ).toBe(true);
    }
    expect(screen.getAllByLabelText<HTMLInputElement>('Name').every((i) => i.disabled)).toBe(true);
    await submit();
    expect(await submitted()).toEqual({ lock: true, items: [] });
  });

  it('marks a Field required while its Condition holds', async () => {
    const form = root(
      { type: 'number', name: 'age', label: 'Age' },
      text('guardian', 'Guardian', { required: leaf('age', 'lt', 18) }),
    );
    const { user, submit, onSubmit } = setup(form);
    expect(input('Guardian').getAttribute('aria-required')).toBeNull();
    await user.type(input('Age'), '12');
    expect(input('Guardian').getAttribute('aria-required')).toBe('true');
    await submit();
    await waitFor(() => expect(input('Guardian').getAttribute('aria-invalid')).toBe('true'));
    expect(onSubmit).not.toHaveBeenCalled();
    // Revalidated as the driver changes after the first submit.
    await user.clear(input('Age'));
    await user.type(input('Age'), '30');
    await waitFor(() => expect(input('Guardian').getAttribute('aria-invalid')).toBeNull());
  });
});

describe('AutoForm: Conditions in Repeater rows', () => {
  it('evaluates each row on its own, and outer Fields through ../', async () => {
    const form = root(
      { type: 'boolean', name: 'detailed', label: 'Detailed' },
      {
        type: 'repeater',
        name: 'items',
        label: 'Items',
        components: [
          { type: 'boolean', name: 'gift', label: 'Gift' },
          text('message', 'Message', { visible: leaf('gift', 'eq', true) }),
          text('note', 'Note', { visible: leaf('../detailed', 'eq', true) }),
        ],
      },
    );
    const { user, submit, submitted } = setup(form);
    const add = screen.getByRole('button', { name: 'Add' });
    await user.click(add);
    await user.click(add);
    const row = (n: number) => screen.getByRole('group', { name: `Items ${n}` });
    await user.click(within(row(2)).getByLabelText('Gift'));
    expect(within(row(1)).queryByLabelText('Message')).toBeNull();
    await user.type(within(row(2)).getByLabelText('Message'), 'Hi');
    expect(screen.queryAllByLabelText('Note')).toHaveLength(0);
    await user.click(input('Detailed'));
    expect(screen.getAllByLabelText('Note')).toHaveLength(2);
    // The row's values and Conditions go with it when it moves.
    await user.click(within(row(2)).getByRole('button', { name: 'Move up' }));
    expect(within(row(1)).getByLabelText<HTMLInputElement>('Message').value).toBe('Hi');
    expect(within(row(2)).queryByLabelText('Message')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({
      detailed: true,
      items: [{ gift: true, message: 'Hi' }, {}],
    });
  });
});

describe('AutoForm and ~standard.validate agree on Conditions', () => {
  type User = ReturnType<typeof userEvent.setup>;
  interface Case {
    readonly name: string;
    readonly form: CompiledForm;
    /** What the user does. Each Field is labelled by its `name`. */
    readonly act: (user: User) => Promise<void>;
    /** What the store holds afterwards, hidden and disabled values included. */
    readonly input: Record<string, unknown>;
  }

  const named = (type: string, name: string, extra: object = {}) => ({
    type,
    name,
    label: name,
    ...extra,
  });
  const typeInto = (label: string, text: string, container?: HTMLElement) => (user: User) =>
    user.type(within(container ?? document.body).getByLabelText(label), text);
  const click = (label: string) => (user: User) => user.click(input(label));
  const steps =
    (...actions: ((user: User) => Promise<void>)[]) =>
    async (user: User) => {
      for (const action of actions) await action(user);
    };
  const row = (n: number) => screen.getByRole('group', { name: `items ${n}` });

  const taxForm = root(
    named('text', 'country'),
    named('text', 'taxId', { required: true, visible: leaf('country', 'eq', 'VN') }),
  );
  const chain = root(
    named('boolean', 'on'),
    named('text', 'b', { required: true, visible: leaf('on', 'eq', true) }),
    named('text', 'c', { required: true, visible: leaf('b', 'not_empty') }),
  );
  const plan = root(
    named('boolean', 'lock'),
    named('text', 'plan', { disabled: leaf('lock', 'eq', true) }),
    named('text', 'card', { required: { not: leaf('plan', 'eq', 'free') } }),
  );
  const contact = root(
    named('text', 'email', { required: leaf('phone', 'empty') }),
    named('text', 'phone', { required: leaf('email', 'empty') }),
  );
  const rows = root(
    named('text', 'mode'),
    named('repeater', 'items', {
      components: [
        named('boolean', 'gift'),
        named('text', 'message', { required: true, visible: leaf('gift', 'eq', true) }),
        named('text', 'note', { required: true, visible: leaf('../mode', 'eq', 'detailed') }),
      ],
    }),
  );
  const address = root(
    named('boolean', 'same'),
    named('object', 'address', {
      disabled: leaf('same', 'eq', true),
      components: [named('text', 'street', { required: true })],
    }),
  );

  const cases: Case[] = [
    {
      name: 'a hidden Field',
      form: taxForm,
      act: typeInto('country', 'US'),
      input: { country: 'US' },
    },
    {
      name: 'a shown, required Field',
      form: taxForm,
      act: typeInto('country', 'VN'),
      input: { country: 'VN' },
    },
    {
      name: 'a hidden value that stays in the store',
      form: taxForm,
      act: steps(typeInto('country', 'VN'), typeInto('taxId', '1'), typeInto('country', 'X')),
      input: { country: 'VNX', taxId: '1' },
    },
    {
      name: 'a chain hidden by its first Field',
      form: chain,
      act: steps(click('on'), typeInto('b', 'x'), typeInto('c', 'y'), click('on')),
      input: { on: false, b: 'x', c: 'y' },
    },
    {
      name: 'a chain shown by its first Field',
      form: chain,
      act: steps(click('on'), typeInto('b', 'x')),
      input: { on: true, b: 'x' },
    },
    {
      name: 'a disabled value that would switch a Condition',
      form: plan,
      act: steps(typeInto('plan', 'free'), click('lock')),
      input: { lock: true, plan: 'free' },
    },
    {
      name: 'an active value that switches a Condition',
      form: plan,
      act: typeInto('plan', 'free'),
      input: { plan: 'free' },
    },
    { name: 'at least one of two, neither given', form: contact, act: async () => {}, input: {} },
    {
      name: 'at least one of two, one given',
      form: contact,
      act: typeInto('phone', '123'),
      input: { phone: '123' },
    },
    {
      name: 'Repeater rows on their own and through ../',
      form: rows,
      act: steps(
        (user) => user.click(screen.getByRole('button', { name: 'Add' })),
        (user) => user.click(screen.getByRole('button', { name: 'Add' })),
        (user) => user.click(within(row(2)).getByLabelText('gift')),
        typeInto('mode', 'detailed'),
        (user) => user.type(within(row(1)).getByLabelText('note'), 'n'),
      ),
      input: { mode: 'detailed', items: [{ note: 'n' }, { gift: true }] },
    },
    {
      name: 'a disabled object',
      form: address,
      act: steps(typeInto('street', ' '), click('same')),
      input: { same: true, address: { street: ' ' } },
    },
    {
      name: 'an active object',
      form: address,
      act: typeInto('street', ' '),
      input: { address: { street: ' ' } },
    },
  ];

  for (const { name, form, act, input: stored } of cases) {
    it(name, async () => {
      const { user, submit, submitted, onSubmit } = setup(form);
      await act(user);
      await submit();
      const result = form['~standard'].validate(stored);
      if (result.issues === undefined) {
        expect(await submitted()).toEqual(result.value);
        return;
      }
      expect(result.issues.length).toBeGreaterThan(0);
      await waitFor(() => {
        for (const issue of result.issues!) {
          expect(errorsOf(elementAt(issue.path))).toContain(issue.message);
        }
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  }

  /** The control the Renderer shows for a data path; Fields are labelled by name. */
  function elementAt(path: readonly (string | number)[]): HTMLElement {
    let container: HTMLElement = document.body;
    for (let i = 0; i < path.length - 1; i++) {
      const key = String(path[i]);
      const next = path[i + 1];
      container = within(container).getByRole('group', { name: key });
      if (typeof next === 'number') {
        container = within(container).getByRole('group', { name: `${key} ${next + 1}` });
        i++;
      }
    }
    return within(container).getByLabelText(String(path.at(-1)));
  }
});

/** The texts of the errors that describe `element`. */
const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .flatMap((id) => [...document.getElementById(id)!.children].map((e) => e.textContent));
