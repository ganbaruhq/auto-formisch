// #region form
import {
  AutoForm,
  choice,
  compile,
  defaultValue,
  form,
  label,
  repeater,
  required,
  text,
  useAutoForm,
  widget,
  type InferOutput,
} from '@auto-formisch/react';
import { customers, type Customer } from './app';

const customer = form([
  text('name', [label('Name'), required()]),
  choice('country', ['VN', 'US'], [label('Country'), defaultValue('VN')]),
  repeater('contacts', [
    // Keeps each row's id with no UI, so the server can match rows after a reorder.
    text('id', [widget('hidden')]),
    text('email', [label('Email'), required()]),
  ]),
]);
export type CustomerOutput = InferOutput<typeof customer>;

export const customerForm = compile(customer);
// #endregion form

// #region edit
// Edit a stored record. `initialInput` is read only at mount, so a new key switches record.
export function EditCustomer(props: {
  record: Customer;
  onSave: (output: CustomerOutput) => void;
}) {
  return (
    <AutoForm
      key={props.record.id}
      form={customerForm}
      initialInput={props.record}
      onSubmit={props.onSave}
    />
  );
}

// A new record with some values known in advance, such as from the URL.
export function NewCustomer(props: {
  prefill: Partial<CustomerOutput>;
  onSave: (output: CustomerOutput) => void;
}) {
  const initialInput = { ...customerForm.defaults, ...props.prefill };
  return <AutoForm form={customerForm} initialInput={initialInput} onSubmit={props.onSave} />;
}
// #endregion edit

// #region replace
export function updateCustomer(id: string, body: unknown) {
  const stored = customers.get(id);
  if (stored === undefined) return { status: 404 };
  const result = customerForm['~standard'].validate(body);
  if (result.issues) return { status: 422, errors: result.issues };
  // Replace every key the Definition manages; keep only the application's own keys.
  customers.set(id, { id: stored.id, createdAt: stored.createdAt, ...result.value });
  return { status: 204 };
}
// #endregion replace

// #region dirty
// The parent gives this component `key={record.id}`: `useAutoForm` reads `initialInput` once.
export function EditWithWarning(props: {
  record: Customer;
  onSave: (output: CustomerOutput) => void;
}) {
  const store = useAutoForm(customerForm, { initialInput: props.record });
  return (
    <>
      {store.isDirty && <p role="status">You have unsaved changes.</p>}
      <AutoForm form={customerForm} store={store} onSubmit={props.onSave} />
    </>
  );
}
// #endregion dirty
