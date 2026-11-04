import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  compile,
  type AutoFormProps,
  type CompiledForm,
  type TabsLayoutProps,
} from './index';
import { Tabs } from './layouts';

afterEach(cleanup);

function setup(form: CompiledForm, onSubmit: AutoFormProps['onSubmit'] = vi.fn()) {
  render(<AutoForm form={form} onSubmit={onSubmit} />);
  const user = userEvent.setup();
  return {
    user,
    onSubmit,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
  };
}

const root = (...components: unknown[]) => compile({ version: 1, components });
const text = (name: string, label: string, extra: object = {}) => ({
  type: 'text',
  name,
  label,
  ...extra,
});

const input = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const focused = (element: () => HTMLElement) =>
  waitFor(() => expect(document.activeElement).toBe(element()));

describe('AutoForm: a failed submit', () => {
  it('opens the Tab of the first Field with an error and focuses it', async () => {
    const { submit } = setup(
      root({
        type: 'tabs',
        components: [
          { type: 'tab', label: 'Account', components: [text('email', 'Email')] },
          {
            type: 'tab',
            label: 'Address',
            components: [text('city', 'City', { required: true })],
          },
        ],
      }),
    );
    await submit();
    await focused(() => input('City'));
    expect(tab('Address').getAttribute('aria-selected')).toBe('true');
    expect(input('City').closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(false);
  });

  it('focuses the first error again on every failed submit', async () => {
    const { user, submit } = setup(root(text('a', 'A', { required: true }), text('b', 'B')));
    await submit();
    await focused(() => input('A'));
    await user.click(input('B'));
    await submit();
    await focused(() => input('A'));
  });

  it('opens nested Tabs on the way to the first error', async () => {
    const { submit } = setup(
      root({
        type: 'tabs',
        components: [
          { type: 'tab', label: 'Outer A', components: [text('a', 'A')] },
          {
            type: 'tab',
            label: 'Outer B',
            components: [
              {
                type: 'tabs',
                components: [
                  { type: 'tab', label: 'Inner A', components: [text('b', 'B')] },
                  {
                    type: 'tab',
                    label: 'Inner B',
                    components: [text('c', 'C', { required: true })],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    await submit();
    await focused(() => input('C'));
    expect(tab('Outer B').getAttribute('aria-selected')).toBe('true');
    expect(tab('Inner B').getAttribute('aria-selected')).toBe('true');
  });

  it('opens a Tab inside a Repeater row, in that row only', async () => {
    const { user, submit } = setup(
      root({
        type: 'repeater',
        name: 'people',
        label: 'People',
        components: [
          {
            type: 'tabs',
            components: [
              { type: 'tab', label: 'Name', components: [text('name', 'Name')] },
              {
                type: 'tab',
                label: 'Phone',
                components: [text('phone', 'Phone', { required: true })],
              },
            ],
          },
        ],
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const row = (n: number) => within(screen.getByRole('group', { name: `People ${n}` }));
    const phone = (n: number) => row(n).getByRole('textbox', { name: 'Phone', hidden: true });
    await user.type(phone(1), '123');
    await submit();
    await focused(() => phone(2));
    expect(
      row(2)
        .getByRole('tab', { name: /^Phone/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(row(1).getByRole('tab', { name: 'Name' }).getAttribute('aria-selected')).toBe('true');
  });

  it('skips a disabled Field, which cannot take focus', async () => {
    const { submit } = setup(
      root(text('code', 'Code', { disabled: true }), text('name', 'Name')),
      () => ({
        errors: [
          { message: 'Code expired', path: ['code'] },
          { message: 'Name taken', path: ['name'] },
        ],
      }),
    );
    await submit();
    await focused(() => input('Name'));
    expect(descriptionOf(input('Code'))).toEqual(['Code expired']);
  });

  it('focuses the same way when the actions slot submits', async () => {
    render(
      <AutoForm
        form={root(text('a', 'A'), text('b', 'B', { required: true }))}
        onSubmit={() => {}}
        actions={({ submit }) => (
          <button type="button" onClick={submit}>
            Send
          </button>
        )}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Send' }));
    await focused(() => input('B'));
  });

  it("focuses a Repeater whose own error comes first, before later Fields' errors", async () => {
    const { submit } = setup(
      root(
        {
          type: 'repeater',
          name: 'pets',
          label: 'Pets',
          rules: [{ type: 'min_items', requirement: 1, message: 'Add a pet' }],
          components: [text('kind', 'Kind')],
        },
        text('owner', 'Owner', { required: true }),
      ),
    );
    await submit();
    await focused(() => screen.getByRole('group', { name: 'Pets' }));
  });
});

describe('AutoForm: Tab error counts', () => {
  const form = root({
    type: 'tabs',
    components: [
      {
        type: 'tab',
        label: 'Account',
        components: [text('email', 'Email', { required: true })],
      },
      {
        type: 'tab',
        label: 'Address',
        components: [
          {
            type: 'section',
            components: [text('city', 'City', { required: true })],
          },
          {
            type: 'object',
            name: 'street',
            components: [text('line', 'Line', { required: true }), text('no', 'No')],
          },
        ],
      },
    ],
  });

  it('counts the Fields with errors per Tab, live', async () => {
    const seen: number[][] = [];
    function CountingTabs(props: TabsLayoutProps) {
      seen.push(props.tabs.map((item) => item.errorCount));
      return <Tabs {...props} />;
    }
    render(<AutoForm form={form} onSubmit={() => {}} layouts={{ tabs: CountingTabs }} />);
    const user = userEvent.setup();
    expect(seen.at(-1)).toEqual([0, 0]);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(seen.at(-1)).toEqual([1, 2]));
    await user.type(input('City'), 'Hanoi');
    await waitFor(() => expect(seen.at(-1)).toEqual([1, 1]));
  });

  it('shows the count after the label of a default Tab', async () => {
    const { user, submit } = setup(form);
    await submit();
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((element) => element.textContent)).toEqual([
        'Account (1)',
        'Address (2)',
      ]),
    );
    await user.type(input('Email'), 'a');
    await waitFor(() => expect(screen.getAllByRole('tab')[0].textContent).toBe('Account'));
  });
});

describe('AutoForm: revalidation after the first submit', () => {
  const form = root(
    { type: 'boolean', name: 'company', label: 'Company' },
    text('vat', 'VAT number', {
      required: { field: 'company', operator: 'eq', value: true },
      rules: [{ type: 'min_length', requirement: 4, message: 'Too short' }],
    }),
    text('name', 'Name', { required: true }),
  );
  const invalid = (label: string) => input(label).getAttribute('aria-invalid') === 'true';

  it('waits for the first submit before showing any error', async () => {
    const { user } = setup(form);
    await user.click(input('Company'));
    await user.type(input('VAT number'), 'ab');
    expect(invalid('VAT number')).toBe(false);
    expect(invalid('Name')).toBe(false);
  });

  it('revalidates a Field on its own input', async () => {
    const { user, submit } = setup(form);
    await user.type(input('VAT number'), 'ab');
    await submit();
    await waitFor(() => expect(invalid('VAT number')).toBe(true));
    await user.type(input('VAT number'), 'cd');
    await waitFor(() => expect(invalid('VAT number')).toBe(false));
    expect(invalid('Name')).toBe(true);
  });

  it('revalidates a Field when a Field its Condition refers to changes', async () => {
    const { user, submit } = setup(form);
    await user.click(input('Company'));
    await submit();
    await waitFor(() => expect(descriptionOf(input('VAT number'))).toEqual(['Required']));

    await user.click(input('Company'));
    await waitFor(() => expect(invalid('VAT number')).toBe(false));
    await user.click(input('Company'));
    await waitFor(() => expect(descriptionOf(input('VAT number'))).toEqual(['Required']));
  });
});

/** The text of every element that `aria-describedby` points at. */
const descriptionOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

const alertText = () =>
  [...screen.getByRole('alert').children].map((element) => element.textContent);

describe('AutoForm: errors returned by onSubmit', () => {
  const form = root(
    text('email', 'Email'),
    text('country', 'Country'),
    text('taxId', 'Tax ID', { visible: { field: 'country', operator: 'eq', value: 'VN' } }),
    {
      type: 'tabs',
      components: [
        { type: 'tab', label: 'Main', components: [text('note', 'Note')] },
        {
          type: 'tab',
          label: 'Pets',
          components: [
            {
              type: 'repeater',
              name: 'pets',
              label: 'Pets',
              components: [text('kind', 'Kind')],
            },
          ],
        },
      ],
    },
  );

  /** The input of the Kind Field in row `n` (from 1), shown or not. */
  const kind = (n: number) =>
    screen
      .getByRole('group', { name: `Pets ${n}`, hidden: true })
      .querySelector<HTMLInputElement>('input')!;

  async function addPets(user: ReturnType<typeof userEvent.setup>, count: number) {
    await user.click(tab('Pets'));
    for (let index = 0; index < count; index++) {
      await user.click(screen.getByRole('button', { name: 'Add' }));
    }
    await user.click(tab('Main'));
  }

  it('shows an error on the Field its path names and focuses it', async () => {
    const { user, submit } = setup(form, () => ({
      errors: [{ message: 'Already taken', path: ['email'] }],
    }));
    await user.type(input('Email'), 'ada@example.com');
    await submit();
    await focused(() => input('Email'));
    expect(input('Email').getAttribute('aria-invalid')).toBe('true');
    expect(descriptionOf(input('Email'))).toEqual(['Already taken']);
    expect(alertText()).toEqual([]);
  });

  it('opens the Tab of a Repeater row Field it names, and focuses the Field', async () => {
    const { user, submit } = setup(form, async () => ({
      errors: [{ message: 'Unknown kind', path: ['pets', 1, 'kind'] }],
    }));
    await addPets(user, 2);
    await submit();
    await focused(() => kind(2));
    expect(tab('Pets').getAttribute('aria-selected')).toBe('true');
    expect(descriptionOf(kind(2))).toEqual(['Unknown kind']);
    expect(kind(1).hasAttribute('aria-invalid')).toBe(false);
  });

  it('focuses the first Field with an error in Definition order, not in the order of the errors', async () => {
    const { user, submit } = setup(form, () => ({
      errors: [
        { message: 'Unknown kind', path: ['pets', 0, 'kind'] },
        { message: 'Bad note', path: ['note'] },
      ],
    }));
    await addPets(user, 1);
    await submit();
    await focused(() => input('Note'));
    expect(tab('Main').getAttribute('aria-selected')).toBe('true');
    expect(descriptionOf(kind(1))).toEqual(['Unknown kind']);
    expect(descriptionOf(input('Note'))).toEqual(['Bad note']);
  });

  it('puts errors it cannot place on a shown Field in the general error region', async () => {
    const { user, submit } = setup(form, () => ({
      errors: [
        { message: 'Server is busy', path: [] },
        { message: 'No such Field', path: ['nope'] },
        { message: 'Hidden Field', path: ['taxId'] },
        { message: 'No such row', path: ['pets', 0, 'kind'] },
        { message: 'A string index', path: ['pets', '0', 'kind'] },
        { message: 'Not a Field', path: ['email', 'x'] },
      ],
    }));
    await user.type(input('Email'), 'ada@example.com');
    await submit();
    await waitFor(() =>
      expect(alertText()).toEqual([
        'Server is busy',
        'No such Field',
        'Hidden Field',
        'No such row',
        'A string index',
        'Not a Field',
      ]),
    );
    expect(input('Email').hasAttribute('aria-invalid')).toBe(false);
  });

  it('accepts several errors for one Field, and a result without errors', async () => {
    const results = [
      {
        errors: [
          { message: 'One', path: ['email'] },
          { message: 'Two', path: ['email'] },
        ],
      },
      {},
    ];
    const { submit } = setup(form, () => results.shift());
    await submit();
    await waitFor(() => expect(descriptionOf(input('Email'))).toEqual(['OneTwo']));
    await submit();
    await waitFor(() => expect(input('Email').hasAttribute('aria-invalid')).toBe(false));
    expect(alertText()).toEqual([]);
  });

  it('shows the message of an error onSubmit throws in the alert region', async () => {
    const { submit } = setup(form, () => {
      throw new Error('Network down');
    });
    await submit();
    await waitFor(() => expect(alertText()).toEqual(['Network down']));
  });
});
