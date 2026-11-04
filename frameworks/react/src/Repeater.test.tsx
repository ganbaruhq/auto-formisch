import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type CompiledForm, type FormOutput } from './index';

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

const group = (name: string, container: HTMLElement = document.body) =>
  within(container).getByRole('group', { name });
const input = (label: string, container: HTMLElement) =>
  within(container).getByLabelText<HTMLInputElement>(label);
/**
 * The button of `container` itself. A Repeater's and a row's own buttons come
 * after their children, so they are the last ones with that name.
 */
const button = (name: string, container: HTMLElement) =>
  within(container).getAllByRole<HTMLButtonElement>('button', { name }).at(-1)!;
/** The texts of the errors that describe `element`. */
const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .flatMap((id) => [...document.getElementById(id)!.children].map((e) => e.textContent));

describe('AutoForm: object', () => {
  const address = root({
    type: 'object',
    name: 'address',
    label: 'Address',
    description: 'Where we deliver.',
    components: [text('street', 'Street', { required: true }), text('city', 'City')],
  });

  it('renders its Fields in a group named by its label, with its description', () => {
    setup(address);
    const fieldset = group('Address');
    expect(fieldset.tagName).toBe('FIELDSET');
    expect(input('Street', fieldset).tagName).toBe('INPUT');
    const description = document.getElementById(fieldset.getAttribute('aria-describedby')!);
    expect(description?.textContent).toBe('Where we deliver.');
  });

  it('submits its Fields nested under its name', async () => {
    const { user, submit, submitted } = setup(address);
    await user.type(input('Street', group('Address')), 'Main St');
    await submit();
    expect(await submitted()).toEqual({ address: { street: 'Main St' } });
  });

  it('shows the error of a Field inside it on that Field', async () => {
    const { submit, onSubmit } = setup(address);
    await submit();
    await waitFor(() => expect(errorsOf(input('Street', group('Address')))).toEqual(['Required']));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits {} when nothing in it has a value', async () => {
    const optional = root({ type: 'object', name: 'address', components: [text('city', 'City')] });
    const { submit, submitted } = setup(optional);
    // Without a label, the group is named by `name`.
    expect(group('address')).toBeDefined();
    await submit();
    expect(await submitted()).toEqual({ address: {} });
  });
});

describe('AutoForm: repeater', () => {
  const contacts = (extra: object = {}) =>
    root({
      type: 'repeater',
      name: 'contacts',
      label: 'Contacts',
      components: [text('name', 'Name', { required: true }), text('email', 'Email')],
      ...extra,
    });
  const rows = () => within(group('Contacts')).queryAllByRole('group', { name: /^Contacts \d+$/ });
  const row = (index: number) => group(`Contacts ${index + 1}`);

  it('starts with no rows and submits []', async () => {
    const { submit, submitted } = setup(contacts());
    expect(rows()).toEqual([]);
    await submit();
    expect(await submitted()).toEqual({ contacts: [] });
  });

  it('adds rows, each a group with the Fields of the template', async () => {
    const { user, submit, submitted } = setup(contacts());
    await user.click(button('Add', group('Contacts')));
    await user.click(button('Add', group('Contacts')));
    expect(rows()).toHaveLength(2);
    await user.type(input('Name', row(0)), 'Ada');
    await user.type(input('Name', row(1)), 'Grace');
    await user.type(input('Email', row(1)), 'grace@example.com');
    await submit();
    expect(await submitted()).toEqual({
      contacts: [{ name: 'Ada' }, { name: 'Grace', email: 'grace@example.com' }],
    });
  });

  it('removes a row and keeps the values of the others', async () => {
    const { user, submit, submitted } = setup(contacts());
    for (const name of ['Ada', 'Grace', 'Alan']) {
      await user.click(button('Add', group('Contacts')));
      await user.type(input('Name', row(rows().length - 1)), name);
    }
    await user.click(button('Remove', row(1)));
    expect(rows()).toHaveLength(2);
    expect(input('Name', row(0)).value).toBe('Ada');
    expect(input('Name', row(1)).value).toBe('Alan');
    await submit();
    expect(await submitted()).toEqual({ contacts: [{ name: 'Ada' }, { name: 'Alan' }] });
  });

  it('moves a row up or down, and its values go with it', async () => {
    const { user, submit, submitted } = setup(contacts());
    for (const name of ['Ada', 'Grace', 'Alan']) {
      await user.click(button('Add', group('Contacts')));
      await user.type(input('Name', row(rows().length - 1)), name);
    }
    expect(button('Move up', row(0)).disabled).toBe(true);
    expect(button('Move down', row(2)).disabled).toBe(true);
    await user.click(button('Move down', row(0)));
    await user.click(button('Move up', row(2)));
    expect(rows().map((element) => input('Name', element).value)).toEqual(['Grace', 'Alan', 'Ada']);
    await submit();
    expect(await submitted()).toEqual({
      contacts: [{ name: 'Grace' }, { name: 'Alan' }, { name: 'Ada' }],
    });
  });

  it('keeps focus on the moved row, on its other move button at an edge', async () => {
    const { user } = setup(contacts());
    for (const name of ['Ada', 'Grace', 'Alan']) {
      await user.click(button('Add', group('Contacts')));
      await user.type(input('Name', row(rows().length - 1)), name);
    }
    const nameOf = (element: Element | null) =>
      input('Name', element!.closest<HTMLElement>('[role="group"]')!).value;
    const press = async (name: string, at: number) => {
      button(name, row(at)).focus();
      await user.keyboard('{Enter}');
    };

    // Grace moves to the top, where Move up turns disabled: focus on Move down.
    await press('Move up', 1);
    await waitFor(() => expect(document.activeElement).toBe(button('Move down', row(0))));
    expect(nameOf(document.activeElement)).toBe('Grace');
    // Down again: the same button keeps focus.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(button('Move down', row(1))));
    expect(nameOf(document.activeElement)).toBe('Grace');
    // To the bottom, where Move down turns disabled: focus on Move up.
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(button('Move up', row(2))));
    expect(nameOf(document.activeElement)).toBe('Grace');
    expect(rows().map((element) => input('Name', element).value)).toEqual(['Ada', 'Alan', 'Grace']);
  });

  it('keeps errors with their row after a reorder', async () => {
    const { user, submit, onSubmit } = setup(contacts());
    await user.click(button('Add', group('Contacts')));
    await user.click(button('Add', group('Contacts')));
    await user.type(input('Email', row(0)), 'no-name@example.com');
    await user.type(input('Name', row(1)), 'Grace');
    await submit();
    await waitFor(() => expect(errorsOf(input('Name', row(0)))).toEqual(['Required']));
    expect(errorsOf(input('Name', row(1)))).toEqual([]);

    await user.click(button('Move down', row(0)));
    expect(input('Name', row(0)).value).toBe('Grace');
    expect(errorsOf(input('Name', row(0)))).toEqual([]);
    expect(input('Email', row(1)).value).toBe('no-name@example.com');
    expect(errorsOf(input('Name', row(1)))).toEqual(['Required']);
    expect(input('Name', row(1)).getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows min_items and max_items errors on the Repeater, and stops adding at max_items', async () => {
    const { user, submit, onSubmit } = setup(
      contacts({
        rules: [
          { type: 'min_items', requirement: 1, message: 'Add a contact' },
          { type: 'max_items', requirement: 2 },
        ],
      }),
    );
    await submit();
    await waitFor(() => expect(errorsOf(group('Contacts'))).toEqual(['Add a contact']));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(button('Add', group('Contacts')));
    await user.click(button('Add', group('Contacts')));
    expect(button('Add', group('Contacts')).disabled).toBe(true);
    await user.type(input('Name', row(0)), 'Ada');
    await user.type(input('Name', row(1)), 'Grace');
    await waitFor(() => expect(errorsOf(group('Contacts'))).toEqual([]));
  });

  it('does not block removing a row below min_items; the error comes on validation', async () => {
    const { user, submit, submitted, onSubmit } = setup(
      contacts({ rules: [{ type: 'min_items', requirement: 1, message: 'Add a contact' }] }),
    );
    await user.click(button('Add', group('Contacts')));
    await user.type(input('Name', row(0)), 'Ada');
    await user.click(button('Remove', row(0)));
    expect(rows()).toEqual([]);
    await submit();
    await waitFor(() => expect(errorsOf(group('Contacts'))).toEqual(['Add a contact']));
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(button('Add', group('Contacts')));
    await user.type(input('Name', row(0)), 'Grace');
    await submit();
    expect(await submitted()).toEqual({ contacts: [{ name: 'Grace' }] });
  });
});

describe('AutoForm: nested repeater', () => {
  const orders = root({
    type: 'repeater',
    name: 'orders',
    label: 'Orders',
    components: [
      text('ref', 'Reference'),
      {
        type: 'repeater',
        name: 'lines',
        label: 'Lines',
        components: [text('sku', 'SKU', { required: true })],
      },
    ],
  });
  const order = (index: number) => group(`Orders ${index + 1}`);
  const line = (orderIndex: number, index: number) =>
    group(`Lines ${index + 1}`, group('Lines', order(orderIndex)));

  it('adds, removes and reorders rows of a Repeater inside a row', async () => {
    const { user, submit, submitted } = setup(orders);
    await user.click(button('Add', group('Orders')));
    await user.click(button('Add', group('Orders')));
    await user.type(input('Reference', order(0)), 'A');
    await user.type(input('Reference', order(1)), 'B');
    for (const sku of ['x', 'y', 'z']) {
      await user.click(button('Add', group('Lines', order(0))));
      const lines = within(group('Lines', order(0))).getAllByRole('group');
      await user.type(input('SKU', lines.at(-1)!), sku);
    }
    await user.click(button('Add', group('Lines', order(1))));
    await user.type(input('SKU', line(1, 0)), 'w');

    await user.click(button('Remove', line(0, 1)));
    await user.click(button('Move up', line(0, 1)));
    await user.click(button('Move down', order(0)));
    await submit();
    expect(await submitted()).toEqual({
      orders: [
        { ref: 'B', lines: [{ sku: 'w' }] },
        { ref: 'A', lines: [{ sku: 'z' }, { sku: 'x' }] },
      ],
    });
  });

  it('keeps errors with their inner row when the outer row moves', async () => {
    const { user, submit } = setup(orders);
    await user.click(button('Add', group('Orders')));
    await user.click(button('Add', group('Orders')));
    await user.type(input('Reference', order(1)), 'B');
    await user.click(button('Add', group('Lines', order(1))));
    await user.click(button('Add', group('Lines', order(1))));
    await user.type(input('SKU', line(1, 1)), 'y');
    await submit();
    await waitFor(() => expect(errorsOf(input('SKU', line(1, 0)))).toEqual(['Required']));

    await user.click(button('Move up', order(1)));
    expect(input('Reference', order(0)).value).toBe('B');
    expect(errorsOf(input('SKU', line(0, 0)))).toEqual(['Required']);
    expect(input('SKU', line(0, 1)).value).toBe('y');
    expect(errorsOf(input('SKU', line(0, 1)))).toEqual([]);
  });
});

describe('AutoForm and ~standard.validate agree on nested output', () => {
  type User = ReturnType<typeof userEvent.setup>;
  const form = root(
    {
      type: 'object',
      name: 'customer',
      label: 'Customer',
      components: [
        text('name', 'Name', { required: true }),
        {
          type: 'repeater',
          name: 'phones',
          label: 'Phones',
          rules: [{ type: 'max_items', requirement: 3 }],
          components: [
            text('number', 'Number', { rules: [{ type: 'min_length', requirement: 3 }] }),
          ],
        },
      ],
    },
    {
      type: 'repeater',
      name: 'notes',
      label: 'Notes',
      rules: [{ type: 'min_items', requirement: 1 }],
      components: [text('body', 'Body', { required: true })],
    },
  );
  const add = (user: User, name: string, container?: HTMLElement) =>
    user.click(button('Add', group(name, container)));
  const cases: { act: (user: User) => Promise<void>; input: unknown }[] = [
    { act: async () => {}, input: {} },
    {
      act: async (user) => {
        await user.type(input('Name', group('Customer')), 'Ada');
        await add(user, 'Notes');
        await user.type(input('Body', group('Notes 1')), 'Hello');
      },
      input: { customer: { name: 'Ada' }, notes: [{ body: 'Hello' }] },
    },
    {
      act: async (user) => {
        await user.type(input('Name', group('Customer')), 'Ada');
        await add(user, 'Phones', group('Customer'));
        await add(user, 'Phones', group('Customer'));
        await user.type(input('Number', group('Phones 2')), '12');
        await add(user, 'Notes');
      },
      input: { customer: { name: 'Ada', phones: [{}, { number: '12' }] }, notes: [{}] },
    },
    {
      act: async (user) => {
        await user.type(input('Name', group('Customer')), 'Ada');
        await add(user, 'Phones', group('Customer'));
        await add(user, 'Phones', group('Customer'));
        await user.type(input('Number', group('Phones 1')), '123');
        await user.type(input('Number', group('Phones 2')), '456');
        await user.click(button('Move down', group('Phones 1')));
        await add(user, 'Notes');
        await user.type(input('Body', group('Notes 1')), 'Hi');
      },
      input: {
        customer: { name: 'Ada', phones: [{ number: '456' }, { number: '123' }] },
        notes: [{ body: 'Hi' }],
      },
    },
  ];

  for (const [index, { act, input: serverInput }] of cases.entries()) {
    it(`case ${index}`, async () => {
      const { user, submit, onSubmit } = setup(form);
      await act(user);
      await submit();
      const expected = form['~standard'].validate(serverInput);
      if (expected.issues === undefined) {
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expected.value));
        return;
      }
      expect(expected.issues.length).toBeGreaterThan(0);
      // Every server error shows on the Field or Repeater at its path.
      await waitFor(() => {
        for (const issue of expected.issues!) {
          expect(errorsOf(elementAt(issue.path))).toContain(issue.message);
        }
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  }

  /** The control or Repeater group the Renderer shows for a data path. */
  function elementAt(path: readonly (string | number)[]): HTMLElement {
    const labels: Record<string, string> = {
      customer: 'Customer',
      name: 'Name',
      phones: 'Phones',
      number: 'Number',
      notes: 'Notes',
      body: 'Body',
    };
    let container: HTMLElement = document.body;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const next = path[i + 1];
      const label = labels[key as string];
      if (typeof next === 'number') {
        container = group(`${label} ${next + 1}`, group(label, container));
        i++;
      } else if (i === path.length - 1) {
        const field = within(container).queryByLabelText<HTMLElement>(label);
        return field ?? group(label, container);
      } else {
        container = group(label, container);
      }
    }
    return container;
  }
});
