import { useState } from 'react';
import { AutoForm, compile } from '@auto-formisch/react';
import { record } from './record';

/**
 * Native control behaviours: partial typing in a number input, errors after a
 * failed submit, and an `initialInput` that keeps values of the right type
 * that are still invalid: an impossible date and a choice that was removed.
 */
const definition = {
  version: 1,
  components: [
    {
      type: 'number',
      name: 'amount',
      label: 'Amount',
      required: true,
      rules: [{ type: 'min_value', requirement: 1 }],
    },
    {
      type: 'text',
      name: 'code',
      label: 'Code',
      required: true,
      rules: [{ type: 'min_length', requirement: 3 }],
    },
    { type: 'date', name: 'when', label: 'When' },
    { type: 'choice', name: 'size', label: 'Size', choices: ['s', 'm'] },
  ],
};

export function FieldsScenario() {
  const [form] = useState(() => compile(definition));
  return (
    <AutoForm
      form={form}
      initialInput={{ when: '2024-02-30', size: 'xl' }}
      onSubmit={(output) => record(output)}
    />
  );
}

/** A regular form whose only error is on a Field shown with the `hidden` Widget. */
const hiddenDefinition = {
  version: 1,
  components: [
    { type: 'text', name: 'note', label: 'Note' },
    { type: 'number', name: 'id', widget: 'hidden', required: true },
  ],
};

export function HiddenScenario() {
  const [form] = useState(() => compile(hiddenDefinition));
  return <AutoForm form={form} onSubmit={record} />;
}
