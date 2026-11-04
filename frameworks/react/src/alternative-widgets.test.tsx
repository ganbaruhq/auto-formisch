import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutoForm, compile, type CompiledForm, type FormOutput } from './index';

afterEach(cleanup);

function setup(form: CompiledForm) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={form} onSubmit={onSubmit} />);
  const user = userEvent.setup();
  return {
    user,
    submit: () => user.click(screen.getByRole('button', { name: 'Submit' })),
    submitted: async () => {
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      return onSubmit.mock.calls[0][0];
    },
  };
}

/** A form with one Field named `value`, presented by `widget`. */
const one = (type: string, widget: string, field: object = {}) =>
  compile({ version: 1, components: [{ type, name: 'value', label: 'Value', widget, ...field }] });

const numbers = { choices: [{ value: 1, label: 'One' }, { value: 2, label: 'Two' }, 3] };

describe('text Widgets', () => {
  for (const [widget, tag, type] of [
    ['textarea', 'TEXTAREA', 'textarea'],
    ['email', 'INPUT', 'email'],
    ['url', 'INPUT', 'url'],
    ['password', 'INPUT', 'password'],
  ] as const) {
    it(`"${widget}" renders a ${type} control that emits undefined when emptied`, async () => {
      const { user, submit, submitted } = setup(one('text', widget, { placeholder: 'Write' }));
      const control = screen.getByLabelText<HTMLInputElement>('Value');
      expect(control.tagName).toBe(tag);
      expect(control.type).toBe(type);
      expect(control.placeholder).toBe('Write');
      await user.type(control, 'a');
      await user.clear(control);
      await submit();
      expect(await submitted()).toEqual({});
    });

    it(`"${widget}" submits what is typed`, async () => {
      const { user, submit, submitted } = setup(one('text', widget));
      await user.type(screen.getByLabelText('Value'), 'a@b.co');
      await submit();
      expect(await submitted()).toEqual({ value: 'a@b.co' });
    });
  }

  it('keeps line breaks in a textarea', async () => {
    const { user, submit, submitted } = setup(one('text', 'textarea'));
    await user.type(screen.getByLabelText('Value'), 'one{Enter}two');
    await submit();
    expect(await submitted()).toEqual({ value: 'one\ntwo' });
  });
});

describe('"toggle"', () => {
  it('is a checkbox with the switch role that submits true and false', async () => {
    const { user, submit, submitted } = setup(one('boolean', 'toggle'));
    const toggle = screen.getByRole('switch', { name: 'Value' });
    expect((toggle as HTMLInputElement).type).toBe('checkbox');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await user.click(toggle);
    await submit();
    expect(await submitted()).toEqual({ value: false });
  });
});

describe('"radio"', () => {
  it('is a named group of radios that keeps number values', async () => {
    const { user, submit, submitted } = setup(one('choice', 'radio', numbers));
    const group = screen.getByRole('group', { name: 'Value' });
    expect(group.tagName).toBe('FIELDSET');
    const radios = screen.getAllByRole<HTMLInputElement>('radio');
    expect(radios.map((radio) => radio.labels?.[0].textContent)).toEqual(['One', 'Two', '3']);
    expect(radios.every((radio) => !radio.checked)).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Two' }));
    await submit();
    expect(await submitted()).toEqual({ value: 2 });
  });

  it('marks the radio group required and invalid, and describes it by the errors', async () => {
    const { submit } = setup(one('choice', 'radio', { ...numbers, required: true }));
    const radios = screen.getByRole('radiogroup', { name: 'Value' });
    expect(radios.getAttribute('aria-required')).toBe('true');
    expect(radios.hasAttribute('aria-invalid')).toBe(false);
    await submit();
    await waitFor(() => expect(radios.getAttribute('aria-invalid')).toBe('true'));
    const describedBy = radios.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)?.textContent).toBe('Required');
  });

  it('takes focus on its first radio after a failed submit', async () => {
    const { submit } = setup(one('choice', 'radio', { ...numbers, required: true }));
    await submit();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'One' })),
    );
  });
});

describe('"multi_select"', () => {
  it('is a multiple select that emits values in choices order, or undefined', async () => {
    const { user, submit, submitted } = setup(one('multi_choice', 'multi_select', numbers));
    const select = screen.getByLabelText<HTMLSelectElement>('Value');
    expect(select.tagName).toBe('SELECT');
    expect(select.multiple).toBe(true);
    await user.selectOptions(select, ['3', 'One']);
    await submit();
    expect(await submitted()).toEqual({ value: [1, 3] });
  });

  it('submits no key once every option is deselected', async () => {
    const { user, submit, submitted } = setup(one('multi_choice', 'multi_select', numbers));
    const select = screen.getByLabelText<HTMLSelectElement>('Value');
    await user.selectOptions(select, ['Two']);
    await user.deselectOptions(select, ['Two']);
    await submit();
    expect(await submitted()).toEqual({});
  });
});

describe('alternative Widgets and appliesTo', () => {
  for (const [widget, type] of [
    ['textarea', 'number'],
    ['email', 'date'],
    ['url', 'choice'],
    ['password', 'boolean'],
    ['toggle', 'text'],
    ['radio', 'multi_choice'],
    ['multi_select', 'choice'],
  ] as const) {
    it(`"${widget}" does not apply to a "${type}" Field`, () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const extra = type.includes('choice') ? numbers : {};
      expect(() =>
        render(<AutoForm form={one(type, widget, extra)} onSubmit={() => {}} />),
      ).toThrow(`Widget "${widget}" does not apply to the "${type}" Field at "value"`);
      consoleError.mockRestore();
    });
  }
});
