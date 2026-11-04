import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { act, cleanup, render, screen } from '@testing-library/react';
import { setInput } from '@formisch/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  compile,
  lock,
  useAutoForm,
  useFormValue,
  type AutoFormStore,
  type CompiledForm,
  type WidgetProps,
} from './index';

afterEach(cleanup);

/** A text Widget that shows the value at `node.placeholder`, read with `useFormValue`. */
function Echo({ value, onChange, inputProps, node }: WidgetProps<string>) {
  const other = useFormValue(String((node as { placeholder?: string }).placeholder));
  return (
    <>
      <input
        {...inputProps}
        value={value ?? ''}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      />
      <output htmlFor={inputProps.id}>{JSON.stringify(other) ?? 'nothing'}</output>
    </>
  );
}

/** A text Field shown by `Echo`, reading `path`. */
const echo = (name: string, path: string) => ({
  type: 'text',
  name,
  label: name,
  widget: 'echo',
  placeholder: path,
});
const text = (name: string) => ({ type: 'text', name, label: name });

const echoOf = (label: string) =>
  screen
    .getByLabelText(label)
    .parentElement!.querySelector(`output[for="${screen.getByLabelText(label).id}"]`)!.textContent;

function setup(...components: unknown[]) {
  return setupForm(compile({ version: 1, components }));
}

function setupForm(form: CompiledForm) {
  render(<AutoForm form={form} onSubmit={() => {}} widgets={{ echo: Echo }} />);
  return userEvent.setup();
}

describe('useFormValue', () => {
  it('reads a sibling Field, through Layouts, and follows its changes', async () => {
    const user = setup({ type: 'section', components: [text('country')] }, echo('city', 'country'));
    expect(echoOf('city')).toBe('nothing');
    await user.type(screen.getByLabelText('country'), 'VN');
    expect(echoOf('city')).toBe('"VN"');
  });

  it('reads inside an object, and out of it with ../', async () => {
    const user = setup(text('country'), {
      type: 'object',
      name: 'address',
      components: [text('zip'), echo('inner', 'zip'), echo('outer', '../country')],
    });
    await user.type(screen.getByLabelText('zip'), '100');
    await user.type(screen.getByLabelText('country'), 'VN');
    expect(echoOf('inner')).toBe('"100"');
    expect(echoOf('outer')).toBe('"VN"');
  });

  it('reads within its own Repeater row, and out of the row with ../', async () => {
    const user = setup(text('currency'), {
      type: 'repeater',
      name: 'lines',
      label: 'Lines',
      components: [text('price'), echo('total', 'price'), echo('unit', '../currency')],
    });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    const [first, second] = screen.getAllByLabelText('price');
    await user.type(first, '5');
    await user.type(second, '7');
    await user.type(screen.getByLabelText('currency'), 'VND');
    const echoes = [...document.querySelectorAll('output')].map((output) => output.textContent);
    expect(echoes).toEqual(['"5"', '"VND"', '"7"', '"VND"']);
  });

  it('reads an object or Repeater as a whole, and a nested Field by dotted path', async () => {
    const user = setup(
      { type: 'object', name: 'address', components: [text('zip')] },
      { type: 'repeater', name: 'pets', components: [text('kind')] },
      echo('zip_echo', 'address.zip'),
      echo('pets_echo', 'pets'),
    );
    await user.type(screen.getByLabelText('zip'), '1');
    expect(echoOf('zip_echo')).toBe('"1"');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(echoOf('pets_echo')).toBe('[{}]');
  });

  it('reads an Inactive Field as empty, like a Condition, whatever it still holds', async () => {
    const user = setup(
      { type: 'boolean', name: 'off', label: 'off' },
      text('shown'),
      {
        type: 'text',
        name: 'hidden',
        label: 'hidden',
        visible: { field: 'shown', operator: 'not_empty' },
      },
      {
        type: 'object',
        name: 'box',
        disabled: { field: 'off', operator: 'eq', value: true },
        components: [text('inner')],
      },
      echo('hidden_echo', 'hidden'),
      echo('inner_echo', 'box.inner'),
    );
    await user.type(screen.getByLabelText('shown'), 'x');
    await user.type(screen.getByLabelText('hidden'), 'h');
    await user.type(screen.getByLabelText('inner'), 'i');
    expect(echoOf('hidden_echo')).toBe('"h"');
    expect(echoOf('inner_echo')).toBe('"i"');
    await user.clear(screen.getByLabelText('shown'));
    await user.click(screen.getByLabelText('off'));
    expect(echoOf('hidden_echo')).toBe('nothing');
    expect(echoOf('inner_echo')).toBe('nothing');
  });

  it('reads an object or Repeater rows without their Inactive Fields, like a Condition', async () => {
    const user = setup(
      { type: 'boolean', name: 'off', label: 'off' },
      {
        type: 'object',
        name: 'address',
        components: [
          text('city'),
          {
            type: 'text',
            name: 'zip',
            label: 'zip',
            disabled: { field: '../off', operator: 'eq', value: true },
          },
        ],
      },
      {
        type: 'repeater',
        name: 'pets',
        label: 'Pets',
        components: [
          text('kind'),
          {
            type: 'text',
            name: 'age',
            label: 'age',
            visible: { field: 'kind', operator: 'eq', value: 'dog' },
          },
        ],
      },
      echo('address_echo', 'address'),
      echo('pets_echo', 'pets'),
    );
    await user.type(screen.getByLabelText('city'), 'Hue');
    await user.type(screen.getByLabelText('zip'), '53');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.type(screen.getByLabelText('kind'), 'dog');
    await user.type(screen.getByLabelText('age'), '3');
    expect(echoOf('address_echo')).toBe('{"city":"Hue","zip":"53"}');
    expect(echoOf('pets_echo')).toBe('[{"kind":"dog","age":"3"}]');
    await user.click(screen.getByLabelText('off'));
    await user.clear(screen.getByLabelText('kind'));
    await user.type(screen.getByLabelText('kind'), 'cat');
    expect(echoOf('address_echo')).toBe('{"city":"Hue"}');
    expect(echoOf('pets_echo')).toBe('[{"kind":"cat"}]');
  });

  it('reads a Locked Field as its Locked value, also inside an object', async () => {
    const form = lock(
      compile({
        version: 1,
        components: [
          text('plan'),
          { type: 'object', name: 'account', components: [text('owner')] },
          echo('plan_echo', 'plan'),
          echo('account_echo', 'account'),
        ],
      }),
      { plan: 'pro', 'account.owner': 'Ada' },
    );
    let store: AutoFormStore | undefined;
    function Host() {
      store = useAutoForm(form);
      return <AutoForm form={form} store={store} onSubmit={() => {}} widgets={{ echo: Echo }} />;
    }
    render(<Host />);
    // The store holds a forged value; the Locked one still wins.
    act(() => setInput(store!, { path: ['plan'], input: 'free' } as never));
    act(() => setInput(store!, { path: ['account', 'owner'], input: 'Eve' } as never));
    expect(echoOf('plan_echo')).toBe('"pro"');
    expect(echoOf('account_echo')).toBe('{"owner":"Ada"}');
  });

  for (const [path, message] of [
    ['missing', 'useFormValue("missing"): No Field "missing"'],
    ['../country', 'useFormValue("../country"): "../country" goes above the root'],
    [
      'pets.kind',
      'useFormValue("pets.kind"): "pets.kind" goes inside the rows of the Repeater "pets"',
    ],
    ['country.code', 'useFormValue("country.code"): "country" has no Fields'],
    ['pets.0', 'useFormValue("pets.0"): A reference is "../" steps, then names joined by "."'],
  ] as const) {
    it(`throws for ${path}`, () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() =>
        setup(
          text('country'),
          { type: 'repeater', name: 'pets', components: [text('kind')] },
          echo('x', path),
        ),
      ).toThrow(message);
      consoleError.mockRestore();
    });
  }
});
