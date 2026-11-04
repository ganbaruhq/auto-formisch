// #region builder
import {
  all,
  choice,
  compile,
  eq,
  form,
  isEmpty,
  label,
  required,
  text,
  visible,
} from '@auto-formisch/core';

export const signup = form([
  choice('kind', ['person', 'company'], [label('I am'), required()]),
  choice('country', ['VN', 'US'], [label('Country')]),
  text('taxId', [
    label('Tax ID'),
    required(),
    visible(all(eq('kind', 'company'), eq('country', 'VN'))),
  ]),
  text('email', [label('Email'), required(isEmpty('phone'))]),
  text('phone', [label('Phone'), required(isEmpty('email'))]),
]);
// { kind: 'person' | 'company'; country?: 'VN' | 'US'; taxId?: string; email?: string; phone?: string }
// #endregion builder

// #region forged
const signupForm = compile(signup);

export const forged = signupForm['~standard'].validate({
  kind: 'person',
  taxId: 'forged',
  email: 'ada@example.com',
});
// { value: { kind: 'person', email: 'ada@example.com' } }: taxId is Inactive, so it is dropped.
// #endregion forged
