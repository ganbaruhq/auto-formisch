import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, useFormValue, type WidgetProps } from './index';

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
  render(
    <AutoForm
      form={compile({ version: 1, components })}
      onSubmit={() => {}}
      widgets={{ echo: Echo }}
    />,
  );
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

  for (const [path, message] of [
    ['missing', 'useFormValue("missing"): no Field "missing"'],
    ['../country', 'useFormValue("../country"): "../" goes above the root'],
    ['pets.kind', 'useFormValue("pets.kind"): "pets" is a Repeater; read it whole'],
    ['country.code', 'useFormValue("country.code"): "country" has no Fields'],
    ['pets.0', 'useFormValue("pets.0"): "pets" is a Repeater; read it whole'],
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
