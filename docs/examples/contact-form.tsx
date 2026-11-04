// #region client
import { AutoForm, compile, type FormOutput, type SubmitResult } from '@auto-formisch/react';
import definition from './contact.json';

// Compile once, outside render.
const form = compile(definition);

async function send(output: FormOutput): Promise<SubmitResult> {
  const response = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(output),
  });
  // The server's `{ errors: [{ message, path }] }` shows on the Fields.
  if (response.status === 422) return response.json();
  // A thrown error's message shows in the form's general error region.
  if (!response.ok) throw new Error('Your message could not be sent. Try again later.');
}

export function ContactForm() {
  return <AutoForm form={form} onSubmit={send} />;
}
// #endregion client
