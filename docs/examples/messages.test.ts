// @vitest-environment node
import { describe, expect, it } from 'vite-plus/test';
import { compile, form, minLength, required, text } from '@auto-formisch/core';
import { validateIn } from './messages';

// Importing the example registers its messages; this file runs in its own module scope.

const name = compile(form([text('name', [required(), minLength(3)])]));

describe('validation messages', () => {
  it('uses the registered required message by language', () => {
    expect(validateIn(name, {}, 'de')).toEqual({
      issues: [{ message: 'Pflichtfeld', path: ['name'] }],
    });
    // No fallback between languages, nor to the message set with no language.
    expect(validateIn(name, {}, 'en')).toEqual({
      issues: [{ message: 'Required', path: ['name'] }],
    });
  });

  it('uses Valibot messages per request, and its technical defaults otherwise', () => {
    expect(validateIn(name, { name: 'Al' }, 'vi').issues).toEqual([
      { message: 'Tối thiểu 3 ký tự', path: ['name'] },
    ]);
    expect(validateIn(name, { name: 'Al' }, 'en').issues).toEqual([
      { message: 'Invalid length: Expected >=3 but received 2', path: ['name'] },
    ]);
    expect(validateIn(name, { name: 'Ada' }, 'vi')).toEqual({ value: { name: 'Ada' } });
  });

  it('uses the global language in ~standard.validate', () => {
    expect(name['~standard'].validate({}).issues).toEqual([
      { message: 'Pflichtfeld', path: ['name'] },
    ]);
  });
});
