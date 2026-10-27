import { useId, type ReactNode } from 'react';
import { Field, Form, useForm, type SubmitHandler } from '@formisch/react';
import { getFields, type FormField, type FormSchema, type UISchema } from 'auto-formisch-core';

export interface AutoFormProps {
  schema: FormSchema;
  ui?: UISchema;
  onSubmit: SubmitHandler<FormSchema>;
  submitLabel?: string;
  children?: ReactNode;
}

/** Flat primitive object forms. Remount with a new key when replacing the schema. */
export function AutoForm({
  schema,
  ui,
  onSubmit,
  submitLabel = 'Submit',
  children,
}: AutoFormProps) {
  const fields = getFields(schema, ui);
  const form = useForm({
    schema,
    initialInput: Object.fromEntries(
      fields.map((field) => [field.name, field.type === 'boolean' ? false : undefined]),
    ),
  });
  const id = useId();
  return (
    <Form of={form} onSubmit={onSubmit}>
      {fields.map((definition: FormField) => (
        <Field key={definition.name} of={form} path={[definition.name]}>
          {(field) => {
            const fieldId = `${id}-${definition.name}`;
            const inputProps = {
              ...field.props,
              id: fieldId,
              required: definition.required,
              'aria-invalid': !!field.errors?.length,
              'aria-describedby': `${fieldId}-help ${fieldId}-errors`,
            };
            return (
              <div>
                <label htmlFor={fieldId}>{definition.label}</label>
                {definition.type === 'boolean' ? (
                  <input {...inputProps} type="checkbox" checked={field.input === true} />
                ) : definition.widget === 'textarea' ? (
                  <textarea
                    {...inputProps}
                    placeholder={definition.placeholder}
                    value={String(field.input ?? '')}
                  />
                ) : (
                  <input
                    {...inputProps}
                    type={
                      definition.type === 'number'
                        ? 'number'
                        : definition.widget === 'email'
                          ? 'email'
                          : 'text'
                    }
                    placeholder={definition.placeholder}
                    value={String(field.input ?? '')}
                    onChange={(event) =>
                      field.onChange(
                        definition.type === 'number'
                          ? event.currentTarget.value === ''
                            ? undefined
                            : event.currentTarget.valueAsNumber
                          : event.currentTarget.value,
                      )
                    }
                  />
                )}
                <div id={`${fieldId}-help`}>{definition.description}</div>
                <div id={`${fieldId}-errors`} aria-live="polite">
                  {field.errors?.join(' ')}
                </div>
              </div>
            );
          }}
        </Field>
      ))}
      <div role="alert">{form.errors?.join(' ')}</div>
      <button type="submit" disabled={form.isSubmitting}>
        {submitLabel}
      </button>
      {children}
    </Form>
  );
}
export type { FormField, UISchema } from 'auto-formisch-core';
