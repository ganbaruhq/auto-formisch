// #region setup
import * as v from 'valibot';
import '@valibot/i18n/de';
import { setRequiredMessage } from '@auto-formisch/core';

// Once, at startup, on the client and on the server.
setRequiredMessage('This field is required'); // when no language is set
setRequiredMessage('Pflichtfeld', 'de');
v.setSpecificMessage(v.minLength, (issue) => `Tối thiểu ${issue.requirement} ký tự`, 'vi');

// In the browser, Formisch reads the global language.
v.setGlobalConfig({ lang: 'de' });
// #endregion setup

// #region per-request
import type { CompiledForm, FormError } from '@auto-formisch/core';

// `~standard.validate` takes no language. To answer each request in its own,
// validate the Valibot schema with `lang` and convert its issues at once.
export function validateIn(form: CompiledForm, input: unknown, lang: string) {
  const result = v.safeParse(form.schema, input, { lang });
  if (result.success) return { value: result.output };
  const issues: FormError[] = result.issues.map((issue) => ({
    message: issue.message,
    path: (issue.path ?? []).map((item) =>
      typeof item.key === 'number' ? item.key : String(item.key),
    ),
  }));
  return { issues };
}
// #endregion per-request
