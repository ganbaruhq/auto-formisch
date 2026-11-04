import { useState } from 'react';
import { AutoForm, compile, lock } from '@auto-formisch/react';
import { record } from './record';

/**
 * Locked Fields of every default Widget, between editable ones. With
 * `?serverError=1`, `onSubmit` returns an error on the Locked "Plan".
 */
const definition = {
  version: 1,
  components: [
    { type: 'text', name: 'first', label: 'First (editable)' },
    { type: 'text', name: 'account', label: 'Account', description: 'Set by your company.' },
    { type: 'number', name: 'seats', label: 'Seats' },
    { type: 'date', name: 'since', label: 'Customer since' },
    { type: 'text', name: 'middle', label: 'Middle (editable)' },
    { type: 'choice', name: 'plan', label: 'Plan', choices: ['free', 'pro', 'team'] },
    {
      type: 'choice',
      name: 'region',
      label: 'Region',
      widget: 'radio',
      choices: ['eu', 'us'],
    },
    { type: 'boolean', name: 'verified', label: 'Verified' },
    { type: 'boolean', name: 'active', label: 'Active', widget: 'toggle' },
    { type: 'multi_choice', name: 'roles', label: 'Roles', choices: ['admin', 'billing'] },
    {
      type: 'multi_choice',
      name: 'langs',
      label: 'Languages',
      widget: 'multi_select',
      choices: ['en', 'vi', 'de'],
    },
    { type: 'text', name: 'last', label: 'Last (editable)' },
  ],
};

export function LockedScenario() {
  const serverError = new URLSearchParams(location.search).get('serverError') === '1';
  const [form] = useState(() =>
    lock(compile(definition), {
      account: 'ACME-42',
      seats: 12,
      since: '2021-03-04',
      plan: 'pro',
      region: 'eu',
      verified: true,
      active: true,
      roles: ['billing'],
      langs: ['en', 'vi'],
    }),
  );
  return (
    <AutoForm
      form={form}
      onSubmit={(output) => {
        record(output);
        if (serverError) return { errors: [{ message: 'Plan not available', path: ['plan'] }] };
      }}
    />
  );
}
