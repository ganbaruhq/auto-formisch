import '@valibot/i18n/de';
import * as v from 'valibot';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AutoForm,
  compile,
  deleteRequiredMessage,
  setRequiredMessage,
  type FormOutput,
} from './index';

afterEach(() => {
  cleanup();
  deleteRequiredMessage();
  deleteRequiredMessage('de');
  v.deleteGlobalConfig();
  v.deleteGlobalMessage();
});

/** A required Field `Name` and an optional Field `Code` with a `min_length` Rule. */
const form = (extra: object = {}) =>
  compile({
    version: 1,
    components: [
      { type: 'text', name: 'name', label: 'Name', required: true, ...extra },
      {
        type: 'text',
        name: 'code',
        label: 'Code',
        rules: [{ type: 'min_length', requirement: 3 }],
      },
    ],
  });

/** Types `code`, submits, and returns the errors each Field shows, in order. */
async function submitWith(compiled: ReturnType<typeof form>, code: string) {
  const onSubmit = vi.fn<(output: FormOutput) => void>();
  render(<AutoForm form={compiled} onSubmit={onSubmit} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Code'), code);
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await waitFor(() => expect(errorsOf('Name')).not.toEqual([]));
  expect(onSubmit).not.toHaveBeenCalled();
  return { name: errorsOf('Name'), code: errorsOf('Code') };
}

/** The error messages a Field shows, read through its `aria-describedby`. */
const errorsOf = (label: string) => {
  const ids = screen.getByLabelText(label).getAttribute('aria-describedby') ?? '';
  const region = ids
    .split(' ')
    .map((id) => document.getElementById(id))
    .find((element) => element?.id.endsWith('-errors'));
  return [...(region?.children ?? [])].map((child) => child.textContent);
};

/** What the server gives for the same input, per Field. */
const serverErrors = (compiled: ReturnType<typeof form>, code: string) => {
  const issues = compiled['~standard'].validate({ code }).issues ?? [];
  const at = (name: string) => issues.filter((i) => i.path[0] === name).map((i) => i.message);
  return { name: at('name'), code: at('code') };
};

describe('messages in a Formisch form', () => {
  it('shows Required, never the internal symbol, with @valibot/i18n on the global lang', async () => {
    v.setGlobalConfig({ lang: 'de' });
    const compiled = form();
    const shown = await submitWith(compiled, 'a');
    expect(shown).toEqual({
      name: ['Required'],
      code: ['Ungültige Länge: >=3 erwartet aber 1 erhalten'],
    });
    expect(document.body.textContent).not.toContain('symbol');
    expect(shown).toEqual(serverErrors(compiled, 'a'));
  });

  it('shows the setRequiredMessage of the global lang, as the server does', async () => {
    setRequiredMessage('Please answer');
    setRequiredMessage('Pflichtfeld', 'de');
    v.setGlobalConfig({ lang: 'de' });
    const compiled = form();
    const shown = await submitWith(compiled, 'a');
    expect(shown.name).toEqual(['Pflichtfeld']);
    expect(shown).toEqual(serverErrors(compiled, 'a'));
  });

  it('keeps requiredMessage over setRequiredMessage, and required out of setGlobalMessage', async () => {
    setRequiredMessage('Please answer');
    v.setGlobalMessage('Something is wrong');
    const compiled = form({ requiredMessage: 'Enter your name' });
    const shown = await submitWith(compiled, 'a');
    expect(shown).toEqual({ name: ['Enter your name'], code: ['Something is wrong'] });
    expect(shown).toEqual(serverErrors(compiled, 'a'));
  });
});
