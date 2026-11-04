import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  choice,
  compile,
  email,
  eq,
  form,
  label,
  repeater,
  required,
  text,
  visible,
  type AutoFormProps,
} from './index';

afterEach(cleanup);

const signup = compile(
  form([
    text('email', [label('Email'), email('Enter a valid email'), required()]),
    choice('country', ['VN', 'US'], [label('Country'), required()]),
    text('taxId', [label('Tax ID'), required(), visible(eq('country', 'VN'))]),
    repeater('pets', [text('kind', [label('Kind')])], [label('Pets')]),
  ]),
);

type Signup = {
  email: string;
  country: 'VN' | 'US';
  taxId?: string;
  pets: { kind?: string }[];
};

describe('AutoForm with a Fluent Builder form', () => {
  it('types onSubmit with the inferred output', () => {
    expectTypeOf<AutoFormProps<Signup>['onSubmit']>().parameter(0).toEqualTypeOf<Signup>();
    const element = (
      <AutoForm
        form={signup}
        onSubmit={(output) => {
          expectTypeOf(output).toEqualTypeOf<Signup>();
          // @ts-expect-error `taxId` may be absent while hidden
          output.taxId.toUpperCase();
        }}
      />
    );
    expect(element.props.form).toBe(signup);
  });

  it('renders, shows Fields by their Conditions, and submits the output', async () => {
    const onSubmit = vi.fn<(output: Signup) => void>();
    render(<AutoForm form={signup} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    expect(screen.getByLabelText<HTMLInputElement>('Email').type).toBe('email');
    expect(screen.queryByLabelText('Tax ID')).toBeNull();
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.selectOptions(screen.getByLabelText('Country'), 'US');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      email: 'ada@example.com',
      country: 'US',
      pets: [],
    });
  });
});
