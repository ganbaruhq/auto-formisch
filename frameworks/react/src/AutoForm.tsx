import { useId, useMemo } from 'react';
import { Form, getInput, useForm } from '@formisch/react';
import type { CompiledForm, FormOutput } from '@auto-formisch/core';
import { Components } from './Components';
import { RenderContext } from './context';
import { FieldWrapper } from './FieldWrapper';
import { defaultLayouts } from './layouts';
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
  // Read here, in the component that owns `useForm`, so that this render
  // subscribes to the input and every change re-evaluates the Conditions. Only
  // a form with Conditions reads it, so a form without them never re-renders
  // as a whole on input.
  const { conditions } = compiled;
  const input = conditions.readsValues ? getInput(store) : undefined;
  const state = useMemo(() => conditions.evaluate(input), [conditions, input]);
  const context = useMemo(
    () => ({
      store,
      conditions: state,
      widgets: defaultWidgets,
      layouts: defaultLayouts,
      fieldWrapper: FieldWrapper,
      idPrefix,
    }),
    [store, state, idPrefix],
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
