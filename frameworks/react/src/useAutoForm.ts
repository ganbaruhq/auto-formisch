import { useRef, useState } from 'react';
import { useForm, type FormStore } from '@formisch/react';
import type { CompiledForm, FormOutput } from '@auto-formisch/core';
import { AutoFormError } from './AutoFormError';

/** The Formisch store of a compiled form. */
export type AutoFormStore<TOutput extends FormOutput = FormOutput> = FormStore<
  CompiledForm<TOutput>['schema']
>;

export interface AutoFormOptions {
  /**
   * An existing record to edit, read only at mount: change the React `key` to
   * switch record. It replaces every `default`; for a partial prefill pass
   * `{ ...form.defaults, ...prefill }`. Keys without a Field are dropped, and
   * a value of the wrong type for its Field starts empty, with a
   * `console.warn`.
   */
  readonly initialInput?: object;
}

/**
 * Creates the Formisch store `<AutoForm>` would create, so that the application
 * can call Formisch's `reset`, `setInput` or `submit` on it. Pass it to
 * `<AutoForm store>`. It validates on submit and revalidates on input.
 *
 * A Wizard's store validates the whole form on every input, so its errors,
 * `form.isValid` and `getDeepErrors` include those of Pages the user has not
 * reached yet, which `<AutoForm>` doesn't show. Formisch's `submit(store)` is
 * the form's native submit: before the last Page it moves to the next one.
 *
 * @throws {AutoFormError} when `form` changes without a remount.
 */
export function useAutoForm<TOutput extends FormOutput = FormOutput>(
  form: CompiledForm<TOutput>,
  options: AutoFormOptions = {},
): AutoFormStore<TOutput> {
  useSameForm(form);
  const [initialInput] = useState(() => startingInput(form, options.initialInput));
  return useForm({
    schema: form.schema,
    // The store's own copy, of a shape the schema accepts.
    initialInput: initialInput as never,
    validate: form.definition.pages !== undefined ? 'input' : 'submit',
    revalidate: 'input',
  });
}

/** The defaults, or the normalized record, with a warning per dropped value. */
function startingInput(form: CompiledForm, record: object | undefined): Record<string, unknown> {
  if (record === undefined) return form.defaults;
  const { input, warnings } = form.normalize(record);
  for (const { message, path } of warnings) {
    console.warn(`Auto Formisch: initialInput "${path.join('.')}": ${message}`);
  }
  return input;
}

/**
 * Throws when `form` is not the one this component mounted with. Formisch
 * would keep the first schema without a word.
 */
export function useSameForm(form: CompiledForm): void {
  const first = useRef(form);
  if (first.current !== form) {
    throw new AutoFormError([
      {
        message: 'The form changed without a remount; change the React key to switch form',
        path: ['form'],
      },
    ]);
  }
}
