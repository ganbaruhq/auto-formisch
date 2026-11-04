import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type FormOutput } from './index';

afterEach(cleanup);

const emailForm = compile({
  version: 1,
  components: [
    {
      type: 'text',
      name: 'email',
      label: 'Email address',
      description: 'We never share it.',
      placeholder: 'ada@example.com',
      required: true,
      rules: [{ type: 'email', message: 'Enter a valid email' }],
    },
  ],
});

function setup(form = emailForm) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} />);
  return {
    user: userEvent.setup(),
    onSubmit,
    input: () => screen.getByLabelText<HTMLInputElement>('Email address'),
    submit: () => screen.getByRole('button', { name: 'Submit' }),
  };
}

/** The text of every element that `aria-describedby` points at. */
const descriptionOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

describe('AutoForm: a text Field', () => {
  it('renders a native text input inside a Field Wrapper', () => {
    const { input } = setup();
    expect(input().tagName).toBe('INPUT');
    expect(input().type).toBe('text');
    expect(input().placeholder).toBe('ada@example.com');
    expect(input().value).toBe('');
    expect(descriptionOf(input())).toEqual(['We never share it.']);
  });

  it('marks a required Field with aria-required rather than native required', () => {
    const { input } = setup();
    expect(input().getAttribute('aria-required')).toBe('true');
    expect(input().required).toBe(false);
  });

  it('names a Field without a label by its name', () => {
    setup(compile({ version: 1, components: [{ type: 'text', name: 'nickname' }] }));
    expect(screen.getByLabelText('nickname').tagName).toBe('INPUT');
  });

  it('calls onSubmit with the output', async () => {
    const { user, onSubmit, input, submit } = setup();
    await user.type(input(), 'ada@example.com');
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ email: 'ada@example.com' });
  });

  it('validates on submit and shows the errors on the Field', async () => {
    const { user, onSubmit, input, submit } = setup();
    expect(input().hasAttribute('aria-invalid')).toBe(false);
    await user.click(submit());
    await waitFor(() => expect(input().getAttribute('aria-invalid')).toBe('true'));
    expect(descriptionOf(input())).toEqual(['We never share it.', 'Required']);
    expect(screen.getByText('Required').closest('[aria-live="polite"]')).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not show errors before the first submit', async () => {
    const { user, input } = setup();
    await user.type(input(), 'ada');
    expect(input().hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByText('Enter a valid email')).toBeNull();
  });

  it('revalidates on input after a failed submit', async () => {
    const { user, input, submit } = setup();
    await user.type(input(), 'ada');
    await user.click(submit());
    await screen.findByText('Enter a valid email');
    await user.type(input(), '@example.com');
    await waitFor(() => expect(screen.queryByText('Enter a valid email')).toBeNull());
    expect(input().hasAttribute('aria-invalid')).toBe(false);
  });

  it('submits an emptied optional Field without its key', async () => {
    const form = compile({
      version: 1,
      components: [{ type: 'text', name: 'email', label: 'Email address' }],
    });
    const { user, onSubmit, input, submit } = setup(form);
    await user.type(input(), 'ada');
    await user.clear(input());
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({});
  });

  it('throws for a widget name it has no Widget for', () => {
    const form = compile({
      version: 1,
      components: [{ type: 'text', name: 'bio', widget: 'rich_text' }],
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AutoForm form={form} onSubmit={() => {}} />)).toThrow(
      'No Widget "rich_text" for the Field at "bio"',
    );
    consoleError.mockRestore();
  });

  it('puts the id on the form element', () => {
    render(<AutoForm form={emailForm} id="profile" onSubmit={() => {}} />);
    expect(document.querySelector('form')?.id).toBe('profile');
  });
});

describe('AutoForm and ~standard.validate agree', () => {
  const form = compile({
    version: 1,
    components: [
      {
        type: 'text',
        name: 'code',
        label: 'Code',
        required: true,
        rules: [
          { type: 'min_length', requirement: 3, message: 'At least 3 characters' },
          { type: 'max_length', requirement: 8, message: 'At most 8 characters' },
          { type: 'email' },
        ],
      },
    ],
  });

  // Typed into the input; `undefined` means the input is left untouched.
  const typed = [undefined, '   ', 'ab', 'abcdefghi', 'a@b.c', 'a@b.co', ' a@b.co '];

  it('covers both outcomes', () => {
    const outcomes = typed.map(
      (text) => form['~standard'].validate(text === undefined ? {} : { code: text }).issues,
    );
    expect(outcomes.filter((issues) => issues === undefined)).toHaveLength(1);
    expect(outcomes.some((issues) => issues !== undefined && issues.length > 1)).toBe(true);
  });

  for (const text of typed) {
    it(`gives the same result for ${JSON.stringify(text)}`, async () => {
      const server = form['~standard'].validate(text === undefined ? {} : { code: text });

      const onSubmit = vi.fn<(output: FormOutput) => void>();
      render(<AutoForm form={form} onSubmit={onSubmit} />);
      const user = userEvent.setup();
      const input = screen.getByLabelText<HTMLInputElement>('Code');
      if (text !== undefined) await user.type(input, text);
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      if (server.issues === undefined) {
        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0]).toEqual(server.value);
      } else {
        await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'));
        const errorsId = input.getAttribute('aria-describedby')!;
        const shown = [...document.getElementById(errorsId)!.children].map((e) => e.textContent);
        expect(shown).toEqual(server.issues.map((issue) => issue.message));
        expect(server.issues.every((issue) => issue.path.join('.') === 'code')).toBe(true);
        expect(onSubmit).not.toHaveBeenCalled();
      }
    });
  }
});
