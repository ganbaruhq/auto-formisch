import { useState } from 'react';
import { AutoForm, compile } from '@auto-formisch/react';
import { record } from './record';

/**
 * A Repeater with three filled rows and a `min_items` of four, so a submit
 * fails on the Repeater itself and focuses its group. Rows move with the
 * default "Move up" / "Move down" buttons.
 */
const definition = {
  version: 1,
  components: [
    {
      type: 'repeater',
      name: 'people',
      label: 'People',
      description: 'At least four people.',
      rules: [{ type: 'min_items', requirement: 4, message: 'Add at least four people' }],
      components: [
        { type: 'text', name: 'name', label: 'Name', required: true },
        { type: 'number', name: 'age', label: 'Age' },
      ],
    },
  ],
};

const initialInput = {
  people: [
    { name: 'Ann', age: 31 },
    { name: 'Bob', age: 42 },
    { name: 'Cy', age: 23 },
  ],
};

export function RepeaterScenario() {
  const [form] = useState(() => compile(definition));
  return <AutoForm form={form} initialInput={initialInput} onSubmit={record} />;
}
