import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reset, setInput, submit } from '@formisch/react';
import {
  AutoForm,
  AutoFormError,
  compile,
  useAutoForm,
  type AutoFormProps,
  type FormOutput,
  type WidgetProps,
} from './index';

afterEach(cleanup);

const root = (...components: unknown[]) => compile({ version: 1, components });

function setup(form: ReturnType<typeof compile>, props: Partial<AutoFormProps> = {}) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} {...props} />);
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

/** The errors `<AutoForm>` throws on mount; fails if it mounts. */
function mountErrors(form: ReturnType<typeof compile>, props: Partial<AutoFormProps> = {}) {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<AutoForm form={form} onSubmit={() => {}} {...props} />);
  } catch (error) {
    expect(error).toBeInstanceOf(AutoFormError);
    return (error as AutoFormError).errors;
  } finally {
    consoleError.mockRestore();
  }
  throw new Error('Expected <AutoForm> to throw on mount');
}

/** A replacement text Widget: an upper-casing input marked with `data-widget`. */
function Shouting({ value, onChange, inputProps }: WidgetProps<string>) {
  return (
    <input
      {...inputProps}
      data-widget="shouting"
      value={value ?? ''}
      onChange={(event) => onChange(event.currentTarget.value.toUpperCase() || undefined)}
    />
  );
}

describe('widgets', () => {
  it('replaces the Widget of a type and keeps the other defaults', async () => {
    const form = root(
      { type: 'text', name: 'name', label: 'Name' },
      { type: 'number', name: 'age', label: 'Age' },
    );
    const { user, submit, submitted } = setup(form, { widgets: { text: Shouting } });
    const name = screen.getByLabelText<HTMLInputElement>('Name');
    expect(name.dataset.widget).toBe('shouting');
    expect(screen.getByLabelText<HTMLInputElement>('Age').type).toBe('number');
    await user.type(name, 'ada');
    await user.type(screen.getByLabelText('Age'), '36');
    await submit();
    expect(await submitted()).toEqual({ name: 'ADA', age: 36 });
  });

  it('takes an entry whose group option names the Widget with fieldset and legend', () => {
    const form = root({ type: 'text', name: 'name', label: 'Name' });
    setup(form, { widgets: { text: { component: Shouting, group: true } } });
    const group = screen.getByRole('group', { name: 'Name' });
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('[data-widget="shouting"]')).not.toBeNull();
  });
});

describe('fieldWrapper', () => {
  it('replaces the frame of every value Field and keeps the default Widgets', () => {
    const form = root(
      { type: 'text', name: 'name', label: 'Name', description: 'Full name', required: true },
      { type: 'number', name: 'age' },
    );
    setup(form, {
      fieldWrapper: ({ label, description, required, labelFor, children }) => (
        <div data-wrapper>
          <label htmlFor={labelFor}>
            {label}
            {required && ' *'}
          </label>
          <small>{description}</small>
          {children}
        </div>
      ),
    });
    expect(screen.getByLabelText<HTMLInputElement>('Name *').type).toBe('text');
    expect(screen.getByLabelText<HTMLInputElement>('age').type).toBe('number');
    expect(document.querySelectorAll('[data-wrapper]')).toHaveLength(2);
    expect(screen.getByText('Full name').tagName).toBe('SMALL');
  });
});

describe('layouts', () => {
  it('replaces one Layout and keeps the other defaults', () => {
    const form = root(
      { type: 'section', label: 'Profile', components: [{ type: 'text', name: 'name' }] },
      {
        type: 'tabs',
        components: [{ type: 'tab', label: 'More', components: [{ type: 'text', name: 'bio' }] }],
      },
    );
    setup(form, {
      layouts: {
        section: ({ node, children }) => (
          <section aria-label={node.label}>
            <h2>{node.label}</h2>
            {children}
          </section>
        ),
      },
    });
    const section = screen.getByRole('region', { name: 'Profile' });
    expect(section.querySelector('input')).toBe(screen.getByLabelText('name'));
    expect(screen.getByRole('tab', { name: 'More' })).toBeDefined();
  });
});

describe('the Widget check on mount', () => {
  it('reports every unknown Widget name at once, including Components not rendered', () => {
    const form = root(
      { type: 'text', name: 'bio', widget: 'rich_text' },
      {
        type: 'tabs',
        components: [
          { type: 'tab', label: 'One', components: [{ type: 'text', name: 'a' }] },
          {
            type: 'tab',
            label: 'Two',
            components: [{ type: 'content', text: 'Hi', widget: 'markdown' }],
          },
        ],
      },
      // No rows, so its template is never rendered.
      {
        type: 'repeater',
        name: 'items',
        components: [
          {
            type: 'object',
            name: 'meta',
            widget: 'card',
            components: [{ type: 'date', name: 'on', widget: 'calendar' }],
          },
        ],
      },
    );
    expect(mountErrors(form)).toEqual([
      {
        message: 'No Widget "rich_text" for the Field at "bio"',
        path: ['components', 0, 'widget'],
      },
      {
        message: 'No Widget "markdown" for a Content Component',
        path: ['components', 1, 'components', 1, 'components', 0, 'widget'],
      },
      {
        message: 'No Widget "card" for the Field at "items.meta"',
        path: ['components', 2, 'components', 0, 'widget'],
      },
      {
        message: 'No Widget "calendar" for the Field at "items.meta.on"',
        path: ['components', 2, 'components', 0, 'components', 0, 'widget'],
      },
    ]);
  });

  it('accepts a widget name the widgets prop adds', () => {
    const form = root({ type: 'text', name: 'bio', label: 'Bio', widget: 'shouting' });
    setup(form, { widgets: { shouting: Shouting } });
    expect(screen.getByLabelText<HTMLInputElement>('Bio').dataset.widget).toBe('shouting');
  });

  it('lists every error in the thrown message', () => {
    const form = root({ type: 'text', name: 'bio', widget: 'rich_text' });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<AutoForm form={form} onSubmit={() => {}} />)).toThrow(
      'components.0.widget: No Widget "rich_text" for the Field at "bio"',
    );
    consoleError.mockRestore();
  });

  it('reports a Widget whose appliesTo leaves out the type', () => {
    const form = root(
      { type: 'text', name: 'bio', widget: 'number' },
      { type: 'content', text: 'Hi', widget: 'text' },
      { type: 'number', name: 'age' },
    );
    expect(
      // A text Widget under `number` is also a type error; this checks the runtime guard.
      mountErrors(form, {
        widgets: { number: { component: Shouting as never, appliesTo: ['text'] } },
      }),
    ).toEqual([
      {
        message: 'Widget "text" does not apply to a Content Component',
        path: ['components', 1, 'widget'],
      },
      {
        message: 'Widget "number" does not apply to the "number" Field at "age"',
        path: ['components', 2, 'type'],
      },
    ]);
    expect(mountErrors(form)).toEqual([
      {
        message: 'Widget "number" does not apply to the "text" Field at "bio"',
        path: ['components', 0, 'widget'],
      },
      {
        message: 'Widget "text" does not apply to a Content Component',
        path: ['components', 1, 'widget'],
      },
    ]);
  });

  it('lets a Widget without appliesTo present any type', () => {
    const form = root({ type: 'number', name: 'age', label: 'Age', widget: 'shouting' });
    setup(form, { widgets: { shouting: Shouting } });
    expect(screen.getByLabelText<HTMLInputElement>('Age').dataset.widget).toBe('shouting');
  });
});

describe('overrides', () => {
  const profile = root(
    {
      type: 'text',
      name: 'name',
      label: 'Name',
      description: 'As on your passport',
      placeholder: 'Ada',
      required: true,
      rules: [{ type: 'min_length', requirement: 2 }],
    },
    {
      type: 'object',
      name: 'address',
      components: [{ type: 'text', name: 'city', label: 'City' }],
    },
    {
      type: 'repeater',
      name: 'pets',
      label: 'Pets',
      components: [{ type: 'text', name: 'kind', label: 'Kind' }],
    },
  );

  it('changes widget, label, description and placeholder by data path', async () => {
    const { user } = setup(profile, {
      widgets: { shouting: Shouting },
      overrides: {
        name: { label: 'Full name', description: 'Any name', placeholder: 'Grace' },
        'address.city': { widget: 'shouting', label: 'Town' },
        pets: { label: 'Animals' },
        'pets.kind': { label: 'Species' },
      },
    });
    const name = screen.getByLabelText<HTMLInputElement>('Full name');
    expect(name.placeholder).toBe('Grace');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Any name',
    );
    expect(screen.getByLabelText<HTMLInputElement>('Town').dataset.widget).toBe('shouting');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    // Every row of a Repeater takes the override of its template.
    expect(screen.getByRole('group', { name: 'Animals 1' })).toBeDefined();
    expect(screen.getByLabelText('Species')).toBeDefined();
  });

  it('never changes validation', async () => {
    const { user, submit, onSubmit } = setup(profile, {
      overrides: { name: { label: 'Full name' } },
    });
    await submit();
    const name = screen.getByLabelText('Full name');
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('Required')).toBeDefined();
    await user.type(name, 'A');
    await waitFor(() =>
      expect(
        screen.getByText(profile['~standard'].validate({ name: 'A' }).issues![0].message),
      ).toBeDefined(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports unknown paths, unknown keys and unfit Widgets on mount', () => {
    const overrides = {
      email: { label: 'Email' },
      'pets.0.kind': { label: 'Kind' },
      name: { required: false, label: 'Name' },
      'address.city': { widget: 'calendar' },
      pets: { widget: 'text' },
    };
    expect(mountErrors(profile, { overrides: overrides as never })).toEqual([
      { message: 'No Field at "email"', path: ['overrides', 'email'] },
      { message: 'No Field at "pets.0.kind"', path: ['overrides', 'pets.0.kind'] },
      { message: 'Unknown key "required"', path: ['overrides', 'name', 'required'] },
      {
        message: 'No Widget "calendar" for the Field at "address.city"',
        path: ['overrides', 'address.city', 'widget'],
      },
      {
        message: 'Widget "text" does not apply to the "repeater" Field at "pets"',
        path: ['overrides', 'pets', 'widget'],
      },
    ]);
  });
});

describe('labels', () => {
  const pets = root({
    type: 'repeater',
    name: 'pets',
    label: 'Pets',
    components: [{ type: 'text', name: 'kind' }],
  });

  it('changes the wording of the submit and Repeater buttons', async () => {
    const onSubmit = vi.fn();
    render(
      <AutoForm
        form={pets}
        onSubmit={onSubmit}
        labels={{ submit: 'Gửi', add: 'Thêm', remove: 'Xóa', moveUp: 'Lên', moveDown: 'Xuống' }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    await user.click(screen.getByRole('button', { name: 'Thêm' }));
    expect(screen.getAllByRole('button', { name: 'Lên' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Xuống' })).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Xóa' })[0]);
    expect(screen.getAllByRole('group', { name: /^Pets \d$/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ pets: [{}] }));
  });

  it('keeps the default wording for labels it leaves out', () => {
    render(<AutoForm form={pets} onSubmit={() => {}} labels={{ add: 'New pet' }} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'New pet' })).toBeDefined();
  });
});

describe('actions', () => {
  const form = root({ type: 'text', name: 'name', label: 'Name', required: true });

  it('replaces the action area and submits through the real submit', async () => {
    let finish = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const contexts: unknown[] = [];
    render(
      <AutoForm
        form={form}
        onSubmit={onSubmit}
        actions={({ isSubmitting, submit, wizard }) => {
          contexts.push(wizard);
          return (
            <button type="button" onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? 'Saving' : 'Save'}
            </button>
          );
        }}
      />,
    );
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(contexts.every((wizard) => wizard === null)).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const saving = await screen.findByRole('button', { name: 'Saving' });
    expect((saving as HTMLButtonElement).disabled).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' });
    finish();
    await screen.findByRole('button', { name: 'Save' });
  });

  it('renders the actions inside the form, after the form error region', () => {
    render(<AutoForm form={form} onSubmit={() => {}} actions={() => <output>Mine</output>} />);
    const formElement = document.querySelector('form')!;
    expect(formElement.lastElementChild?.textContent).toBe('Mine');
    expect(formElement.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('useAutoForm', () => {
  const form = root(
    { type: 'text', name: 'name', label: 'Name', required: true },
    {
      type: 'object',
      name: 'address',
      components: [{ type: 'text', name: 'city', label: 'City' }],
    },
  );

  function Screen({ onSubmit }: { readonly onSubmit: (output: FormOutput) => void }) {
    const store = useAutoForm(form);
    return (
      <>
        <AutoForm form={form} store={store} onSubmit={onSubmit} />
        <button type="button" onClick={() => setInput(store, { path: ['name'], input: 'Ada' })}>
          Fill
        </button>
        <button
          type="button"
          // Nested paths of a JSON Definition can't be typed against its schema.
          onClick={() => setInput(store, { path: ['address', 'city'], input: 'Hanoi' } as never)}
        >
          Fill city
        </button>
        <button type="button" onClick={() => reset(store)}>
          Reset
        </button>
        <button type="button" onClick={() => submit(store)}>
          Send
        </button>
      </>
    );
  }

  it('gives the application the Formisch store that <AutoForm> renders', async () => {
    const onSubmit = vi.fn();
    render(<Screen onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    await user.click(screen.getByRole('button', { name: 'Fill city' }));
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Ada');
    expect(screen.getByLabelText<HTMLInputElement>('City').value).toBe('Hanoi');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', address: { city: 'Hanoi' } }),
    );
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('');
  });

  it('validates on submit and revalidates on input, like the store <AutoForm> makes', async () => {
    const onSubmit = vi.fn();
    render(<Screen onSubmit={onSubmit} />);
    const user = userEvent.setup();
    const name = screen.getByLabelText('Name');
    await user.type(name, 'A');
    await user.clear(name);
    expect(name.hasAttribute('aria-invalid')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
    await user.type(name, 'A');
    await waitFor(() => expect(name.hasAttribute('aria-invalid')).toBe(false));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
