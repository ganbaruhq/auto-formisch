import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AutoForm, compile, type FormOutput } from '@auto-formisch/react';
import './style.css';

// A stored Form Definition: plain JSON, checked and compiled once, outside React.
const definition = {
  version: 1,
  components: [
    {
      type: 'text',
      name: 'email',
      label: 'Email address',
      description: 'We only use it to reply to you.',
      placeholder: 'ada@example.com',
      required: true,
      requiredMessage: 'Enter your email address',
      rules: [
        { type: 'email', message: 'Enter a valid email address' },
        { type: 'max_length', requirement: 254 },
      ],
    },
  ],
};

const form = compile(definition);

function App() {
  const [submission, setSubmission] = useState<FormOutput | null>(null);
  return (
    <main>
      <h1>Auto Formisch</h1>
      <p>One Form Definition. The same validation on the client and the server.</p>
      <AutoForm form={form} onSubmit={setSubmission} />
      <h2>Submission</h2>
      <pre>{JSON.stringify(submission, null, 2)}</pre>
      <details>
        <summary>Form Definition</summary>
        <pre>{JSON.stringify(form.definition, null, 2)}</pre>
      </details>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
