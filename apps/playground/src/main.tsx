import { useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { AutoForm, compile, type FormOutput } from '@auto-formisch/react';
import { FieldsScenario, HiddenScenario } from './scenarios/fields';
import { FormischScenario } from './scenarios/formisch';
import { LargeForm, LargeWizard } from './scenarios/large';
import { LockedScenario } from './scenarios/locked';
import { RepeaterScenario } from './scenarios/repeater';
import { TabsScenario } from './scenarios/tabs';
import { WizardScenario } from './scenarios/wizard';
import { WorkerScenario } from './scenarios/worker-scenario';
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

function Basic() {
  const [submission, setSubmission] = useState<FormOutput | null>(null);
  return (
    <>
      <p>One Form Definition. The same validation on the client and the server.</p>
      <AutoForm form={form} onSubmit={setSubmission} />
      <h2>Submission</h2>
      <pre>{JSON.stringify(submission, null, 2)}</pre>
      <details>
        <summary>Form Definition</summary>
        <pre>{JSON.stringify(form.definition, null, 2)}</pre>
      </details>
    </>
  );
}

/** Scenarios by `?s=` name, for trying a behaviour by hand or from a browser script. */
const scenarios: Record<string, { readonly title: string; readonly component: ComponentType }> = {
  basic: { title: 'Basic', component: Basic },
  large: { title: 'Large form with Rules', component: LargeForm },
  'large-wizard': { title: 'Large Wizard with Rules', component: LargeWizard },
  wizard: { title: 'Wizard', component: WizardScenario },
  tabs: { title: 'Tabs', component: TabsScenario },
  repeater: { title: 'Repeater', component: RepeaterScenario },
  locked: { title: 'Locked Fields', component: LockedScenario },
  fields: { title: 'Native controls', component: FieldsScenario },
  hidden: { title: 'Hidden Widget error', component: HiddenScenario },
  formisch: { title: 'Formisch probes', component: FormischScenario },
  worker: { title: 'Core in a Worker', component: WorkerScenario },
};

function App() {
  const name = new URLSearchParams(location.search).get('s') ?? 'basic';
  const scenario = scenarios[name] ?? scenarios.basic;
  const Scenario = scenario.component;
  return (
    <main>
      <h1>Auto Formisch: {scenario.title}</h1>
      <nav aria-label="Scenarios">
        {Object.entries(scenarios).map(([key, { title }]) => (
          <a key={key} href={`?s=${key}`} aria-current={key === name ? 'page' : undefined}>
            {title}
          </a>
        ))}
      </nav>
      <Scenario />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
