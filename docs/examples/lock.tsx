// #region shared
// company-form.ts: used by both the client and the server.
import {
  choice,
  compile,
  eq,
  form,
  label,
  lock,
  required,
  text,
  visible,
} from '@auto-formisch/core';
import type { Company } from './app';

const companyForm = compile(
  form([
    choice('type', ['person', 'company'], [label('Type')]),
    text('name', [label('Name'), required()]),
    text('taxId', [label('Tax ID'), required(), visible(eq('type', 'company'))]),
  ]),
);

// `company` comes from the database, never from the request or the URL.
export const formFor = (company: Company) => lock(companyForm, { type: company.type });
// #endregion shared

// #region server
import { companies } from './app';

export function updateCompany(id: string, body: unknown) {
  const stored = companies.get(id);
  if (stored === undefined) return { status: 404 };
  // The stored `type` replaces whatever the body holds, before Conditions run.
  const result = formFor(stored)['~standard'].validate(body);
  if (result.issues) return { status: 422, errors: result.issues };
  companies.set(id, { id: stored.id, ...result.value, type: stored.type });
  return { status: 204 };
}
// #endregion server

// #region client
import { useMemo } from 'react';
import { AutoForm, type FormOutput } from '@auto-formisch/react';

export function EditCompany(props: { company: Company; onSave: (output: FormOutput) => void }) {
  const { company } = props;
  // A new lock result needs a new key, so both follow the record's id.
  const form = useMemo(() => formFor(company), [company.id]);
  return <AutoForm key={company.id} form={form} initialInput={company} onSubmit={props.onSave} />;
}
// #endregion client
