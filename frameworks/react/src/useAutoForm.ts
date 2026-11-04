import { useForm, type FormStore } from '@formisch/react';
import type { CompiledForm, FormOutput } from '@auto-formisch/core';

/** The Formisch store of a compiled form. */
export type AutoFormStore<TOutput extends FormOutput = FormOutput> = FormStore<
  CompiledForm<TOutput>['schema']
>;

/**
 * Creates the Formisch store `<AutoForm>` would create, so that the application
 * can call Formisch's `reset`, `setInput` or `submit` on it. Pass it to
 * `<AutoForm store>`. It validates on submit and revalidates on input.
 *
 * A Wizard's store validates the whole form on every input, so its errors,
 * `form.isValid` and `getDeepErrors` include those of Pages the user has not
 * reached yet, which `<AutoForm>` doesn't show. Formisch's `submit(store)` is
 * the form's native submit: before the last Page it moves to the next one.
 */
export function useAutoForm<TOutput extends FormOutput = FormOutput>(
  form: CompiledForm<TOutput>,
): AutoFormStore<TOutput> {
  return useForm({
    schema: form.schema,
    validate: form.definition.pages !== undefined ? 'input' : 'submit',
    revalidate: 'input',
  });
}
