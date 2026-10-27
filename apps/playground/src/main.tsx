import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildForm } from 'auto-formisch-builder';
import { serialize } from 'auto-formisch-json';
import { AutoForm } from 'auto-formisch-react';
import './style.css';
const { schema, ui } = buildForm({
  version: 1,
  fields: {
    email: { type: 'string', rules: [{ type: 'email', message: 'Enter a valid email address' }] },
    guests: { type: 'number', rules: [{ type: 'min_value', requirement: 1 }] },
    notes: { type: 'string', optional: true, rules: [] },
    newsletter: { type: 'boolean', rules: [] },
  },
  ui: {
    email: { label: 'Email address' },
    guests: { label: 'Number of guests' },
    notes: { label: 'Notes', widget: 'textarea' },
    newsletter: { label: 'Receive updates' },
  },
});
function App() {
  const [result, setResult] = useState<unknown>(null);
  return (
    <main>
      <h1>Auto Formisch</h1>
      <p>Portable definitions. Valibot validation. Formisch state.</p>
      <AutoForm
        schema={schema}
        ui={ui}
        onSubmit={(values) => {
          setResult(values);
        }}
      />
      <h2>Submission</h2>
      <pre>{JSON.stringify(result, null, 2)}</pre>
      <details>
        <summary>Portable form JSON</summary>
        <pre>{JSON.stringify(JSON.parse(serialize(schema, ui)), null, 2)}</pre>
      </details>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
