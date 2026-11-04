import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type AutoFormProps, type CompiledForm, type FormOutput } from './index';

afterEach(cleanup);

function setup(form: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} {...props} />);
  const user = userEvent.setup();
  return {
    user,
    onSubmit,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
    /** The output `onSubmit` received, after waiting for it. */
    submitted: async () => {
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      return onSubmit.mock.calls[0][0];
    },
  };
}

/** A form with one Field named `value`. */
const one = (type: string, field: object = {}) =>
  compile({ version: 1, components: [{ type, name: 'value', label: 'Value', ...field }] });

describe('AutoForm: number Field', () => {
  const input = () => screen.getByLabelText<HTMLInputElement>('Value');

  it('renders a native number input', () => {
    setup(one('number', { placeholder: 'Age' }));
    expect(input().type).toBe('number');
    expect(input().placeholder).toBe('Age');
    expect(input().value).toBe('');
  });

  it('submits what is typed as a number, including 0', async () => {
    for (const [typed, value] of [
      ['42', 42],
      ['0', 0],
      ['-1.5', -1.5],
    ] as const) {
      const { user, submit, submitted } = setup(one('number'));
      await user.type(input(), typed);
      await submit();
      expect(await submitted()).toEqual({ value });
      cleanup();
    }
  });

  it('submits a cleared input without its key', async () => {
    const { user, submit, submitted } = setup(one('number'));
    await user.type(input(), '5');
    await user.clear(input());
    await submit();
    expect(await submitted()).toEqual({});
  });
});

describe('AutoForm: number Field with text the browser cannot parse', () => {
  const input = () => screen.getByLabelText<HTMLInputElement>('Value');
  /** The texts of the Field's error region. */
  const errors = () => {
    const ids = (input().getAttribute('aria-describedby') ?? '').split(' ');
    const id = ids.find((each) => each.endsWith('-errors'));
    return id === undefined
      ? []
      : [...document.getElementById(id)!.children].map((child) => child.textContent);
  };
  /**
   * What a browser does for text such as "1e", "-" or ".": the input's value
   * is "" and `validity.badInput` is true, while the box still shows the text.
   */
  const typeUnparsable = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(input(), '1');
    Object.defineProperty(input(), 'validity', {
      configurable: true,
      value: { badInput: true },
    });
    fireEvent.change(input(), { target: { value: '' } });
  };

  for (const required of [true, false]) {
    it(`says "Enter a number" on ${required ? 'a required' : 'an optional'} Field, never dropping it`, async () => {
      const { user, submit, onSubmit } = setup(one('number', { required }));
      await typeUnparsable(user);
      await submit();
      await waitFor(() => expect(errors()).toEqual(['Enter a number']));
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(onSubmit).not.toHaveBeenCalled();
    });
  }

  it('takes its message from labels', async () => {
    const { user, submit } = setup(one('number'), { labels: { invalidNumber: 'Nhập một số' } });
    await typeUnparsable(user);
    await submit();
    await waitFor(() => expect(errors()).toEqual(['Nhập một số']));
  });

  it('submits once the text parses again', async () => {
    const { user, submit, submitted } = setup(one('number'));
    await typeUnparsable(user);
    Object.defineProperty(input(), 'validity', { configurable: true, value: { badInput: false } });
    fireEvent.change(input(), { target: { value: '15' } });
    await submit();
    expect(await submitted()).toEqual({ value: 15 });
  });
});

describe('AutoForm: choice Field', () => {
  const select = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Value' });
  const options = () => [...select().options].map((option) => option.textContent);

  it('renders a native select with an empty option first', () => {
    setup(
      one('choice', {
        placeholder: 'Pick one',
        choices: ['US', { value: 'VN', label: 'Viet Nam' }],
      }),
    );
    expect(select().tagName).toBe('SELECT');
    expect(select().multiple).toBe(false);
    expect(options()).toEqual(['Pick one', 'US', 'Viet Nam']);
    expect(select().selectedIndex).toBe(0);
  });

  it('submits the chosen value, keeping a number a number', async () => {
    const { user, submit, submitted } = setup(
      one('choice', {
        choices: [
          { value: 1, label: 'One' },
          { value: 2, label: 'Two' },
        ],
      }),
    );
    await user.selectOptions(select(), 'Two');
    expect(select().selectedIndex).toBe(2);
    await submit();
    expect(await submitted()).toEqual({ value: 2 });
  });

  it('submits a choice reset to the empty option without its key', async () => {
    const { user, submit, submitted } = setup(one('choice', { choices: ['a', 'b'] }));
    await user.selectOptions(select(), 'b');
    await user.selectOptions(select(), '');
    await submit();
    expect(await submitted()).toEqual({});
  });
});

describe('AutoForm: multi_choice Field', () => {
  const sizes = one('multi_choice', {
    choices: [{ value: 1, label: 'Small' }, { value: 2, label: 'Medium' }, 3],
  });
  const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

  it('renders one checkbox per choice inside a fieldset named by its legend', () => {
    setup(sizes);
    const group = screen.getByRole('group', { name: 'Value' });
    expect(group.tagName).toBe('FIELDSET');
    const boxes = screen.getAllByRole<HTMLInputElement>('checkbox');
    expect(boxes.map((element) => element.labels?.[0].textContent)).toEqual([
      'Small',
      'Medium',
      '3',
    ]);
    expect(boxes.every((element) => group.contains(element) && !element.checked)).toBe(true);
    expect(new Set(boxes.map((element) => element.id)).size).toBe(3);
  });

  it('submits the checked values in the order of choices', async () => {
    const { user, submit, submitted } = setup(sizes);
    await user.click(box('3'));
    await user.click(box('Small'));
    expect(box('Small').checked).toBe(true);
    await submit();
    expect(await submitted()).toEqual({ value: [1, 3] });
  });

  it('submits nothing checked without its key', async () => {
    const { user, submit, submitted } = setup(sizes);
    await user.click(box('Medium'));
    await user.click(box('Medium'));
    await submit();
    expect(await submitted()).toEqual({});
  });

  it('shows min_items on the Field and marks every checkbox invalid', async () => {
    const { user, submit, onSubmit } = setup(
      one('multi_choice', {
        choices: ['a', 'b', 'c'],
        rules: [{ type: 'min_items', requirement: 2, message: 'Pick two' }],
      }),
    );
    await user.click(box('b'));
    await submit();
    await screen.findByText('Pick two');
    for (const element of screen.getAllByRole('checkbox')) {
      expect(element.getAttribute('aria-invalid')).toBe('true');
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('AutoForm: date Field', () => {
  const input = () => screen.getByLabelText<HTMLInputElement>('Value');

  it('renders a native date input', () => {
    setup(one('date'));
    expect(input().type).toBe('date');
    expect(input().value).toBe('');
  });

  it('submits the date as YYYY-MM-DD', async () => {
    const { user, submit, submitted } = setup(one('date'));
    await user.type(input(), '2026-11-04');
    expect(input().value).toBe('2026-11-04');
    await submit();
    expect(await submitted()).toEqual({ value: '2026-11-04' });
  });

  it('shows a date Rule on the Field', async () => {
    const { user, submit, onSubmit } = setup(
      one('date', {
        rules: [{ type: 'min_value', requirement: '2027-01-01', message: 'Too early' }],
      }),
    );
    await user.type(input(), '2026-11-04');
    await submit();
    await screen.findByText('Too early');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a cleared date without its key', async () => {
    const { user, submit, submitted } = setup(one('date'));
    await user.type(input(), '2026-11-04');
    await user.clear(input());
    await submit();
    expect(await submitted()).toEqual({});
  });
});

describe('AutoForm and ~standard.validate agree on every value Field Type', () => {
  type User = ReturnType<typeof userEvent.setup>;
  interface Case {
    /** What the user does, and the input the server receives for the same values. */
    readonly act: (user: User) => Promise<void>;
    readonly input: Record<string, unknown>;
  }

  const byLabel = () => screen.getByLabelText<HTMLElement>('Value');
  const type = (text: string) => (user: User) => user.type(byLabel(), text);
  const click =
    (...names: string[]) =>
    async (user: User) => {
      for (const name of names) await user.click(screen.getByRole('checkbox', { name }));
    };
  const untouched = async () => {};

  const table: [string, CompiledForm, () => HTMLElement, Case[]][] = [
    [
      'text with url',
      one('text', { rules: [{ type: 'url', message: 'Enter a URL' }] }),
      byLabel,
      [
        { act: type('example'), input: { value: 'example' } },
        { act: type('https://example.com'), input: { value: 'https://example.com' } },
      ],
    ],
    [
      'number',
      one('number', {
        required: true,
        rules: [
          { type: 'integer', message: 'Whole numbers' },
          { type: 'min_value', requirement: 0 },
          { type: 'max_value', requirement: 10, message: 'At most 10' },
        ],
      }),
      byLabel,
      [
        { act: untouched, input: {} },
        { act: type('0'), input: { value: 0 } },
        { act: type('7'), input: { value: 7 } },
        { act: type('3.5'), input: { value: 3.5 } },
        { act: type('-1'), input: { value: -1 } },
        { act: type('10.5'), input: { value: 10.5 } },
      ],
    ],
    [
      'boolean',
      one('boolean', { required: true, rules: [{ type: 'accepted', message: 'Accept it' }] }),
      () => screen.getByRole('checkbox'),
      [
        { act: untouched, input: {} },
        { act: click('Value'), input: { value: true } },
        { act: click('Value', 'Value'), input: { value: false } },
      ],
    ],
    [
      'choice',
      one('choice', { required: true, choices: [1, { value: 2, label: 'Two' }] }),
      byLabel,
      [
        { act: untouched, input: {} },
        { act: (user) => user.selectOptions(byLabel(), 'Two'), input: { value: 2 } },
      ],
    ],
    [
      'multi_choice',
      one('multi_choice', {
        choices: ['a', 'b', 'c'],
        rules: [
          { type: 'min_items', requirement: 2, message: 'Pick two' },
          { type: 'max_items', requirement: 2 },
        ],
      }),
      () => screen.getAllByRole('checkbox')[0],
      [
        { act: untouched, input: {} },
        { act: click('b'), input: { value: ['b'] } },
        { act: click('c', 'a'), input: { value: ['a', 'c'] } },
        { act: click('a', 'b', 'c'), input: { value: ['a', 'b', 'c'] } },
      ],
    ],
    [
      'date',
      one('date', {
        rules: [
          { type: 'min_value', requirement: '2026-01-01', message: 'Too early' },
          { type: 'max_value', requirement: '2026-12-31' },
        ],
      }),
      byLabel,
      [
        { act: untouched, input: {} },
        { act: type('2026-06-30'), input: { value: '2026-06-30' } },
        { act: type('2025-12-31'), input: { value: '2025-12-31' } },
        { act: type('2027-01-01'), input: { value: '2027-01-01' } },
      ],
    ],
  ];

  for (const [name, form, control, cases] of table) {
    it(`covers both outcomes for ${name}`, () => {
      const outcomes = cases.map(({ input }) => form['~standard'].validate(input).issues);
      expect(outcomes.some((issues) => issues === undefined)).toBe(true);
      expect(outcomes.some((issues) => issues !== undefined)).toBe(true);
    });

    for (const { act, input } of cases) {
      it(`gives the same result for ${name} ${JSON.stringify(input)}`, async () => {
        const server = form['~standard'].validate(input);
        const { user, submit, submitted, onSubmit } = setup(form);
        await act(user);
        await submit();

        if (server.issues === undefined) {
          expect(await submitted()).toEqual(server.value);
          return;
        }
        await waitFor(() => expect(control().getAttribute('aria-invalid')).toBe('true'));
        const errorsId = control()
          .getAttribute('aria-describedby')!
          .split(' ')
          .find((id) => id.endsWith('-errors'))!;
        const shown = [...document.getElementById(errorsId)!.children].map((e) => e.textContent);
        expect(shown).toEqual(server.issues.map((issue) => issue.message));
        expect(server.issues.every((issue) => issue.path.join('.') === 'value')).toBe(true);
        expect(onSubmit).not.toHaveBeenCalled();
      });
    }
  }
});

describe('AutoForm: boolean Field', () => {
  const checkbox = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Value' });

  it('renders a native checkbox, unchecked', () => {
    setup(one('boolean'));
    expect(checkbox().type).toBe('checkbox');
    expect(checkbox().checked).toBe(false);
  });

  it('submits true when checked and false when unchecked again', async () => {
    const first = setup(one('boolean'));
    await first.user.click(checkbox());
    await first.submit();
    expect(await first.submitted()).toEqual({ value: true });
    cleanup();

    const second = setup(one('boolean', { required: true }));
    await second.user.click(checkbox());
    await second.user.click(checkbox());
    await second.submit();
    expect(await second.submitted()).toEqual({ value: false });
  });

  it('shows the accepted Rule on the Field', async () => {
    const { user, submit, onSubmit } = setup(
      one('boolean', { rules: [{ type: 'accepted', message: 'Accept the terms' }] }),
    );
    await user.click(checkbox());
    await user.click(checkbox());
    await submit();
    await waitFor(() => expect(checkbox().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Accept the terms')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
