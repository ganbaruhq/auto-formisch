import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { setInput } from '@formisch/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  compile,
  lock,
  useAutoForm,
  type AutoFormProps,
  type CompiledForm,
  type FieldWrapperProps,
  type FormOutput,
  type WidgetProps,
} from './index';

// Locked Fields through <AutoForm> (AF-11, ADR 0003).

afterEach(cleanup);

function setup(form: CompiledForm, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} {...props} />);
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
const control = <E extends HTMLElement = HTMLInputElement>(label: string) =>
  screen.getByLabelText<E>(label);

/** `type` drives a required `taxId` that only companies have. */
const company = () =>
  root(
    { type: 'choice', name: 'type', label: 'Type', choices: ['person', 'company'] },
    {
      type: 'text',
      name: 'taxId',
      label: 'Tax ID',
      visible: { field: 'type', operator: 'eq', value: 'company' },
      required: true,
    },
  );

describe('a Locked Field', () => {
  it('shows text, number and date with native readonly, and keeps the value', async () => {
    const form = lock(
      root(
        { type: 'text', name: 'name', label: 'Name' },
        { type: 'number', name: 'age', label: 'Age' },
        { type: 'date', name: 'born', label: 'Born' },
      ),
      { name: 'Ada', age: 36, born: '1815-12-10' },
    );
    const { user, submit, submitted } = setup(form);
    for (const [label, value] of [
      ['Name', 'Ada'],
      ['Age', '36'],
      ['Born', '1815-12-10'],
    ]) {
      expect(control(label).readOnly).toBe(true);
      expect(control(label).disabled).toBe(false);
      expect(control(label).value).toBe(value);
    }
    await user.type(control('Name'), 'x');
    await user.type(control('Age'), '1');
    expect(control('Name').value).toBe('Ada');
    await submit();
    expect(await submitted()).toEqual({ name: 'Ada', age: 36, born: '1815-12-10' });
  });

  it('shows select, radio, checkbox and multi-choice with native disabled', async () => {
    const form = lock(
      root(
        { type: 'choice', name: 'kind', label: 'Kind', choices: ['a', 'b'] },
        { type: 'choice', name: 'size', label: 'Size', widget: 'radio', choices: ['s', 'm'] },
        { type: 'boolean', name: 'agree', label: 'Agree' },
        { type: 'boolean', name: 'on', label: 'On', widget: 'toggle' },
        { type: 'multi_choice', name: 'tags', label: 'Tags', choices: ['x', 'y'] },
        {
          type: 'multi_choice',
          name: 'more',
          label: 'More',
          widget: 'multi_select',
          choices: ['x', 'y'],
        },
      ),
      { kind: 'b', size: 'm', agree: true, on: false, tags: ['y'], more: ['x'] },
    );
    const { user, submit, submitted } = setup(form);
    const controls = [
      control<HTMLSelectElement>('Kind'),
      ...screen.getAllByRole<HTMLInputElement>('radio'),
      control('Agree'),
      control('On'),
      ...screen.getAllByRole<HTMLInputElement>('checkbox', { name: /^[xy]$/ }),
      control<HTMLSelectElement>('More'),
    ];
    expect(controls).toHaveLength(8);
    for (const element of controls) expect(element.disabled).toBe(true);
    expect(control<HTMLSelectElement>('Kind').value).toBe('1');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'm' }).checked).toBe(true);
    expect(control('Agree').checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'y' }).checked).toBe(true);
    await user.click(control('Agree'));
    await submit();
    expect(await submitted()).toEqual({
      kind: 'b',
      size: 'm',
      agree: true,
      on: false,
      tags: ['y'],
      more: ['x'],
    });
  });

  it('cannot be changed by a Widget that ignores readOnly', async () => {
    const Careless = ({ value, onChange, inputProps }: WidgetProps<string>) => (
      <input {...inputProps} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    );
    const form = lock(
      root(
        { type: 'text', name: 'type', label: 'Type', widget: 'careless' },
        {
          type: 'text',
          name: 'taxId',
          label: 'Tax ID',
          visible: { field: 'type', operator: 'eq', value: 'company' },
        },
      ),
      { type: 'company' },
    );
    const { user, submit, submitted } = setup(form, { widgets: { careless: Careless } });
    await user.clear(control('Type'));
    await user.type(control('Type'), 'person');
    expect(control('Type').value).toBe('company');
    expect(control('Tax ID')).toBeDefined();
    await user.type(control('Tax ID'), 'X1');
    await submit();
    expect(await submitted()).toEqual({ type: 'company', taxId: 'X1' });
  });

  it('beats initialInput and default, and drives Conditions', async () => {
    const form = lock(
      root(
        {
          type: 'choice',
          name: 'type',
          label: 'Type',
          choices: ['person', 'company'],
          default: 'person',
        },
        { type: 'text', name: 'note', label: 'Note', default: 'n' },
        {
          type: 'text',
          name: 'taxId',
          label: 'Tax ID',
          visible: { field: 'type', operator: 'eq', value: 'company' },
          required: true,
        },
      ),
      { type: 'company', note: undefined },
    );
    setup(form);
    expect(control<HTMLSelectElement>('Type').value).toBe('1');
    expect(control('Note').value).toBe('');
    expect(screen.getByLabelText('Tax ID')).toBeDefined();
    cleanup();

    const { submit, submitted, user } = setup(form, {
      initialInput: { type: 'person', note: 'old', taxId: 'X1' },
    });
    expect(control<HTMLSelectElement>('Type').value).toBe('1');
    expect(control('Note').value).toBe('');
    await user.type(control('Tax ID'), '2');
    await submit();
    expect(await submitted()).toEqual({ type: 'company', taxId: 'X12' });
  });

  it('reads the Locked value for Conditions, whatever the store holds', async () => {
    const form = lock(company(), { type: 'company' });
    function Screen() {
      const store = useAutoForm(form);
      return (
        <>
          <AutoForm form={form} store={store} onSubmit={onSubmit} />
          <button
            type="button"
            onClick={() => setInput(store, { path: ['type'], input: 'person' } as never)}
          >
            Forge
          </button>
        </>
      );
    }
    const onSubmit = vi.fn<(output: FormOutput) => void>();
    render(<Screen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Forge' }));
    expect(control<HTMLSelectElement>('Type').value).toBe('1');
    await user.type(control('Tax ID'), 'X1');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ type: 'company', taxId: 'X1' });
  });

  it('is left out while a Condition makes it Inactive', async () => {
    const form = lock(
      root(
        { type: 'boolean', name: 'show', label: 'Show' },
        {
          type: 'text',
          name: 'code',
          label: 'Code',
          visible: { field: 'show', operator: 'eq', value: true },
        },
      ),
      { code: 'L' },
    );
    const { user, submit, submitted, onSubmit } = setup(form);
    expect(screen.queryByLabelText('Code')).toBeNull();
    await submit();
    expect(await submitted()).toEqual({});
    await user.click(control('Show'));
    expect(control('Code').value).toBe('L');
    await submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toEqual({ show: true, code: 'L' });
  });

  it('tells the Field Wrapper, and is never required', () => {
    const seen: FieldWrapperProps[] = [];
    const Wrapper = (props: FieldWrapperProps) => {
      seen.push(props);
      return (
        <label htmlFor={props.labelFor}>
          {props.label}
          {props.children}
        </label>
      );
    };
    const form = lock(
      root(
        { type: 'text', name: 'name', label: 'Name', required: true },
        { type: 'text', name: 'other', label: 'Other' },
      ),
      { name: undefined },
    );
    setup(form, { fieldWrapper: Wrapper });
    const last = (name: string) => seen.filter((props) => props.node.name === name).at(-1)!;
    expect(last('name')).toMatchObject({ readOnly: true, required: false, disabled: false });
    expect(last('other')).toMatchObject({ readOnly: false });
    expect(control('Name').getAttribute('aria-required')).toBeNull();
  });
});

describe('AutoForm and ~standard.validate agree on the same lock result', () => {
  type User = ReturnType<typeof userEvent.setup>;
  interface Case {
    readonly name: string;
    readonly form: CompiledForm;
    /** What the user does. Each Field is labelled by its `name`. */
    readonly act: (user: User) => Promise<void>;
    /** What a client sends the server for the same intent, forged values included. */
    readonly body: Record<string, unknown>;
  }

  const named = (type: string, name: string, extra: object = {}) => ({
    type,
    name,
    label: name,
    ...extra,
  });
  const typeInto = (label: string, text: string) => (user: User) =>
    user.type(screen.getByLabelText(label), text);

  const tax = lock(
    root(
      named('choice', 'type', { choices: ['person', 'company'] }),
      named('text', 'taxId', {
        required: true,
        visible: { field: 'type', operator: 'eq', value: 'company' },
      }),
    ),
    { type: 'company' },
  );
  const strict = lock(
    root(
      named('text', 'code', { required: true, rules: [{ type: 'min_length', requirement: 5 }] }),
      named('text', 'name', { required: true }),
    ),
    { code: 'ab' },
  );
  const nested = lock(
    root(
      named('object', 'address', {
        components: [
          named('text', 'country'),
          named('text', 'state', {
            required: true,
            visible: { field: 'country', operator: 'eq', value: 'US' },
          }),
        ],
      }),
    ),
    { 'address.country': 'US' },
  );
  const inactive = lock(
    root(
      named('boolean', 'show'),
      named('text', 'code', { visible: { field: 'show', operator: 'eq', value: true } }),
    ),
    { code: 'L' },
  );

  const cases: Case[] = [
    {
      name: 'a forged driver with the Field it shows filled',
      form: tax,
      act: typeInto('taxId', 'X1'),
      body: { type: 'person', taxId: 'X1' },
    },
    {
      name: 'a forged driver with the Field it shows empty',
      form: tax,
      act: async () => {},
      body: { type: 'person' },
    },
    {
      name: 'a Locked value that breaks its Rules',
      form: strict,
      act: typeInto('name', 'n'),
      body: { code: 'abcdef', name: 'n' },
    },
    {
      name: 'a required Field next to a Locked one',
      form: strict,
      act: async () => {},
      body: { code: 'abcdef' },
    },
    {
      name: 'a Locked Field in an object',
      form: nested,
      act: async () => {},
      body: { address: { country: 'VN' } },
    },
    {
      name: 'a Locked Field made Inactive',
      form: inactive,
      act: async () => {},
      body: { code: 'forged' },
    },
  ];

  for (const { name, form, act, body } of cases) {
    it(name, async () => {
      const { user, submit, submitted, onSubmit } = setup(form);
      await act(user);
      await submit();
      const result = form['~standard'].validate(body);
      if (result.issues === undefined) {
        expect(await submitted()).toEqual(result.value);
        return;
      }
      expect(result.issues.length).toBeGreaterThan(0);
      await waitFor(() => {
        for (const issue of result.issues!) {
          expect(errorsOf(screen.getByLabelText(String(issue.path.at(-1))))).toContain(
            issue.message,
          );
        }
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  }
});

const errorsOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter((id) => id.endsWith('-errors'))
    .flatMap((id) => [...document.getElementById(id)!.children].map((e) => e.textContent));
