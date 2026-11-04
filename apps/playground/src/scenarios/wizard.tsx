import { useState } from 'react';
import { setInput } from '@formisch/react';
import { AutoForm, compile, useAutoForm, type PageLayoutProps } from '@auto-formisch/react';
import { explode, record } from './record';

/**
 * A Wizard of three Pages. With `?hiddenError=1`, the first Page holds a
 * required Field shown with the `hidden` Widget and no value, so "Next" is
 * blocked by an error the user cannot fix. Controls outside the form run
 * "Next" through `form="id"` and hide the open Page through `setInput`. With
 * `?stepper=1`, a custom `page` Layout lists the Pages with their error counts.
 * With `?throwingRule=1`, "Name" has a custom Rule that throws on "boom".
 */
const definition = (hiddenError: boolean, throwingRule: boolean) => ({
  version: 1,
  pages: [
    {
      type: 'page',
      label: 'Account',
      description: 'Who you are.',
      components: [
        {
          type: 'text',
          name: 'name',
          label: 'Name',
          required: true,
          ...(throwingRule && { rules: [{ type: 'explode' }] }),
        },
        hiddenError
          ? { type: 'number', name: 'id', widget: 'hidden', required: true }
          : { type: 'number', name: 'id', widget: 'hidden', default: 7 },
        { type: 'boolean', name: 'skipDetails', label: 'Skip the details step' },
      ],
    },
    {
      type: 'page',
      label: 'Details',
      description: 'Where you live.',
      visible: { field: 'skipDetails', operator: 'neq', value: true },
      components: [
        { type: 'text', name: 'city', label: 'City', required: true },
        { type: 'text', name: 'street', label: 'Street' },
      ],
    },
    {
      type: 'page',
      label: 'Confirm',
      components: [
        {
          type: 'boolean',
          name: 'agree',
          label: 'I agree',
          rules: [{ type: 'accepted', message: 'Please agree' }],
        },
      ],
    },
  ],
});

function StepperPage({ node, wizard, children }: PageLayoutProps) {
  return (
    <>
      <ol aria-label="Steps">
        {wizard.pages.map((page) => (
          <li key={page.index} aria-current={page.isCurrent ? 'step' : undefined}>
            {page.label}
            {page.errorCount > 0 && ` (${page.errorCount})`}
          </li>
        ))}
      </ol>
      <h2>{node.label}</h2>
      {children}
    </>
  );
}

const stepperLayouts = { page: StepperPage };

export function WizardScenario() {
  const query = new URLSearchParams(location.search);
  const hiddenError = query.get('hiddenError') === '1';
  const stepper = query.get('stepper') === '1';
  const throwingRule = query.get('throwingRule') === '1';
  const [form] = useState(() =>
    compile(definition(hiddenError, throwingRule), { rules: [explode] }),
  );
  const store = useAutoForm(form);
  const hideDetails = () => setInput(store, { path: ['skipDetails'], input: true } as never);
  return (
    <>
      <AutoForm
        id="wizard-form"
        form={form}
        store={store}
        onSubmit={record}
        layouts={stepper ? stepperLayouts : undefined}
      />
      <hr />
      <p>Outside the form:</p>
      <button type="submit" form="wizard-form">
        Outside next
      </button>{' '}
      <button type="button" onClick={hideDetails}>
        Hide Details now
      </button>{' '}
      <button type="button" onClick={() => setTimeout(hideDetails, 1000)}>
        Hide Details in 1s
      </button>
    </>
  );
}
