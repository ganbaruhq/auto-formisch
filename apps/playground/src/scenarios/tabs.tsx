import { useState } from 'react';
import { AutoForm, compile } from '@auto-formisch/react';
import { record } from './record';

/**
 * Tabs whose second Tab holds the first required Fields, followed by a
 * required Field outside the Tabs. A failed submit with the first Tab open
 * must open "Billing" and focus its first Field.
 */
const definition = {
  version: 1,
  components: [
    { type: 'text', name: 'title', label: 'Title' },
    {
      type: 'tabs',
      components: [
        {
          type: 'tab',
          label: 'General',
          components: [{ type: 'text', name: 'a1', label: 'Nickname' }],
        },
        {
          type: 'tab',
          label: 'Billing',
          description: 'Where the invoice goes.',
          components: [
            { type: 'text', name: 'b1', label: 'Company', required: true },
            { type: 'number', name: 'b2', label: 'Seats', required: true },
          ],
        },
        {
          type: 'tab',
          label: 'Notes',
          components: [{ type: 'text', name: 'n1', label: 'Note', widget: 'textarea' }],
        },
      ],
    },
    { type: 'text', name: 'c', label: 'Contact email', required: true },
  ],
};

export function TabsScenario() {
  const [form] = useState(() => compile(definition));
  return <AutoForm form={form} onSubmit={record} />;
}
