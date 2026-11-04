import { useId, useMemo } from 'react';
import { Form, useForm } from '@formisch/react';
import type { CompiledForm, FormOutput } from '@auto-formisch/core';
import { Components } from './Components';
import { RenderContext } from './context';
import { FieldWrapper } from './FieldWrapper';
import { defaultWidgets } from './widgets';

export interface AutoFormProps<TOutput extends FormOutput = FormOutput> {
  /** The result of `compile`. Change the form by changing the React `key`. */
  readonly form: CompiledForm<TOutput>;
  /** Called with the validated output, the full state of active Fields. */
  readonly onSubmit: (output: TOutput) => void | Promise<void>;
  /** Set on the `form` element, so buttons outside it can use `form="id"`. */
  readonly id?: string;
}

/**
 * Renders a compiled Form Definition on Formisch with native HTML and no
 * stylesheet. It validates on submit and revalidates on input.
 */
export function AutoForm<TOutput extends FormOutput = FormOutput>({
  form,
  onSubmit,
  id,
}: AutoFormProps<TOutput>) {
  const compiled = form as unknown as CompiledForm;
  const store = useForm({ schema: compiled.schema, validate: 'submit', revalidate: 'input' });
  const idPrefix = useId();
  const context = useMemo(
    () => ({ store, widgets: defaultWidgets, fieldWrapper: FieldWrapper, idPrefix }),
    [store, idPrefix],
  );

  return (
    <RenderContext value={context}>
      <Form of={store} id={id} onSubmit={(output) => onSubmit(output as TOutput)}>
        <Components components={compiled.definition.components} scope={[]} />
        <div role="alert">{store.errors?.join(' ')}</div>
        <button type="submit" disabled={store.isSubmitting}>
          Submit
        </button>
      </Form>
    </RenderContext>
  );
}
