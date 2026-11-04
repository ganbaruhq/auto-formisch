import { Component, type ReactNode, type Ref } from 'react';
import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  AutoFormError,
  compile,
  defineFieldType,
  defineRule,
  eq,
  form,
  label,
  number,
  required,
  text,
  visible,
  type AutoFormProps,
  type CompiledForm,
  type FormOutput,
  type InferFieldNode,
  type InferFieldValue,
  type WidgetProps,
} from './index';

// Custom Field Types and Rules (AF-29) in <AutoForm>, with their own Widgets.

afterEach(cleanup);

const rating = defineFieldType({
  type: 'rating',
  options: { max: v.pipe(v.number(), v.integer(), v.minValue(1)) },
  schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
  conditionAs: 'number',
});

/** A row of radio buttons, one per star, typed from the Field Type. */
function Stars({
  value,
  onChange,
  inputProps,
  node,
}: WidgetProps<InferFieldValue<typeof rating>, InferFieldNode<typeof rating>>) {
  const { id, ref, ...aria } = inputProps;
  return (
    <div role="radiogroup" id={id} aria-label={node.label ?? node.name} {...aria}>
      {Array.from({ length: node.max }, (_, index) => index + 1).map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          ref={star === 1 ? (ref as Ref<HTMLButtonElement>) : undefined}
          onClick={() => onChange(value === star ? undefined : star)}
        >
          {star} stars
        </button>
      ))}
    </div>
  );
}

function setup(compiled: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={compiled} onSubmit={onSubmit} {...props} />);
  const user = userEvent.setup();
  return {
    user,
    onSubmit,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
    submitted: async () => {
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      return onSubmit.mock.calls[0][0];
    },
  };
}

/** The texts of the Field's error region, which its control describes itself by. */
const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .flatMap((id) => [...document.getElementById(id)!.children].map((child) => child.textContent));

describe('AutoForm: custom Field Type', () => {
  const definition = form(
    [
      rating('score', { max: 5 }, [label('Score'), required()]),
      text('why', [label('Why so low?'), required(), visible(eq('score', 1))]),
    ],
    { fieldTypes: [rating] },
  );
  const compiled = compile(definition, { fieldTypes: [rating] });

  it('renders the Widget supplied for its type and submits its value', async () => {
    const { user, submit, submitted } = setup(compiled, { widgets: { rating: Stars } });
    expect(screen.getByRole('radiogroup', { name: 'Score' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    await submit();
    expect(await submitted()).toEqual({ score: 4 });
  });

  it('shows Required on the Field, through the Field Wrapper', async () => {
    const { submit, onSubmit } = setup(compiled, { widgets: { rating: Stars } });
    await submit();
    const group = screen.getByRole('radiogroup', { name: 'Score' });
    await waitFor(() => expect(errorsOf(group)).toEqual(['Required']));
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('drives a Condition through its conditionAs row', async () => {
    const { user, submit, submitted } = setup(compiled, { widgets: { rating: Stars } });
    expect(screen.queryByLabelText('Why so low?')).toBeNull();
    await user.click(screen.getByRole('radio', { name: '1 stars' }));
    await user.type(screen.getByLabelText('Why so low?'), 'Slow');
    await submit();
    expect(await submitted()).toEqual({ score: 1, why: 'Slow' });
  });

  it('throws on mount without a Widget for its type', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<AutoForm form={compiled} onSubmit={() => {}} />)).toThrow(AutoFormError);
    } finally {
      consoleError.mockRestore();
    }
  });

  // Formisch catches the error of a submit and shows its message in the
  // general error region; the form is not stuck submitting.
  it('never submits when its schema throws', async () => {
    const failing = defineFieldType({
      type: 'failing',
      options: { max: v.number() },
      schema: v.pipe(
        v.number(),
        v.check(() => {
          throw new Error('bug in the schema');
        }),
      ),
    });
    const broken = compile(
      { version: 1, components: [{ type: 'failing', name: 'score', label: 'Score', max: 3 }] },
      { fieldTypes: [failing] },
    );
    const { user, submit, onSubmit } = setup(broken, { widgets: { failing: Stars } });
    await user.click(screen.getByRole('radio', { name: '2 stars' }));
    await submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('bug in the schema'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Submit' }).disabled).toBe(false);
  });
});

describe('AutoForm: custom Rule', () => {
  const startsWith = defineRule({
    type: 'starts_with',
    appliesTo: ['text'],
    requirement: v.string(),
    check: (value, requirement) => value.startsWith(requirement),
    message: 'Wrong prefix',
  });

  it('shows its error beside the built-in Rules on the Field', async () => {
    const compiled = compile(
      form([text('code', [label('Code'), startsWith('VN'), required()])], { rules: [startsWith] }),
      { rules: [startsWith] },
    );
    const { user, submit, submitted } = setup(compiled);
    await user.type(screen.getByLabelText('Code'), 'US1');
    await submit();
    await waitFor(() => expect(errorsOf(screen.getByLabelText('Code'))).toEqual(['Wrong prefix']));
    await user.clear(screen.getByLabelText('Code'));
    await user.type(screen.getByLabelText('Code'), 'VN1');
    await submit();
    expect(await submitted()).toEqual({ code: 'VN1' });
  });
});

describe('AutoForm: a custom Rule that throws in a Wizard step', () => {
  /** Throws once armed, so typing the value before is no problem. */
  const armed = { value: false };
  const buggy = defineRule({
    type: 'buggy',
    appliesTo: ['text'],
    check: () => {
      if (armed.value) throw new Error('bug in the check');
      return true;
    },
  });
  const steps = compile(
    {
      version: 1,
      pages: [
        {
          type: 'page',
          label: 'One',
          components: [{ type: 'text', name: 'code', label: 'Code', rules: [{ type: 'buggy' }] }],
        },
        { type: 'page', label: 'Two', components: [{ type: 'text', name: 'other' }] },
      ],
    },
    { rules: [buggy] },
  );

  afterEach(() => {
    armed.value = false;
  });

  class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
    state: { error?: Error } = {};
    static getDerivedStateFromError(error: Error) {
      return { error };
    }
    render() {
      return this.state.error ? <p>Crashed: {this.state.error.message}</p> : this.props.children;
    }
  }

  it('reaches an error boundary from the Next button, and never moves on', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSubmit = vi.fn();
    render(
      <Boundary>
        <AutoForm form={steps} onSubmit={onSubmit} />
      </Boundary>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Code'), 'x');
    armed.value = true;
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('Crashed: bug in the check')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects wizard.next() and goTo() with the error, keeping the Page and no general error', async () => {
    const settled: Promise<unknown>[] = [];
    // Caught at once, so the rejection is never unhandled.
    const record = (step: Promise<boolean>) => settled.push(step.catch((error: unknown) => error));
    const actions: AutoFormProps['actions'] = ({ wizard }) => (
      <>
        <button type="button" onClick={() => record(wizard!.next())}>
          Mine next
        </button>
        <button type="button" onClick={() => record(wizard!.goTo(1))}>
          Mine to two
        </button>
      </>
    );
    const { user } = setup(steps, { actions });
    await user.type(screen.getByLabelText('Code'), 'x');
    armed.value = true;
    await user.click(screen.getByRole('button', { name: 'Mine next' }));
    await user.click(screen.getByRole('button', { name: 'Mine to two' }));
    const errors = await Promise.all(settled);
    expect(errors.map((error) => (error as Error).message)).toEqual([
      'bug in the check',
      'bug in the check',
    ]);
    expect(screen.getByRole('group', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('');
  });
});

/**
 * The built-in `text` Field Type rewritten with `defineFieldType`, and a
 * Widget an application would write for it, through the whole pipeline: the
 * Builder, `compile`, `<AutoForm>` and the server.
 */
describe('AutoForm: text rewritten with defineFieldType', () => {
  const myText = defineFieldType({ type: 'my_text', schema: v.string(), conditionAs: 'text' });

  function PlainInput({
    value,
    onChange,
    inputProps,
    node,
  }: WidgetProps<string, InferFieldNode<typeof myText>>) {
    return (
      <input
        {...inputProps}
        type="text"
        placeholder={node.placeholder}
        value={value ?? ''}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      />
    );
  }

  const build = (type: 'text' | 'my_text') => {
    const field = (type === 'text' ? text : myText) as typeof text;
    return compile(
      form(
        [
          field('name', [label('Name'), required()]),
          number('age', [label('Age'), visible(eq('name', 'Ada'))]),
          field('note', [label('Note'), required(eq('name', 'Ada'))]),
        ],
        { fieldTypes: [myText] },
      ),
      { fieldTypes: [myText] },
    );
  };

  const cases: { typed: Partial<Record<'Name' | 'Age' | 'Note', string>> }[] = [
    { typed: {} },
    { typed: { Name: '   ' } },
    { typed: { Name: 'Ada' } },
    { typed: { Name: 'Ada', Age: '36', Note: 'Hi' } },
    { typed: { Name: 'Grace' } },
  ];

  it('gives the same output and errors as the built-in text, and as the server', async () => {
    for (const { typed } of cases) {
      const results = [];
      for (const type of ['text', 'my_text'] as const) {
        const compiled = build(type);
        const { user, submit, onSubmit } = setup(compiled, { widgets: { my_text: PlainInput } });
        const input: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(typed)) {
          await user.type(screen.getByLabelText(name), value);
          input[name.toLowerCase()] = name === 'Age' ? Number(value) : value;
        }
        await submit();
        const server = compiled['~standard'].validate(input);
        if ('value' in server) {
          await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(server.value));
        } else {
          for (const issue of server.issues!) {
            const name = String(issue.path[0]);
            const control = screen.getByLabelText(name[0].toUpperCase() + name.slice(1));
            await waitFor(() => expect(errorsOf(control)).toEqual([issue.message]));
          }
          expect(onSubmit).not.toHaveBeenCalled();
        }
        results.push(server);
        cleanup();
      }
      expect(results[1]).toEqual(results[0]);
    }
  });
});
