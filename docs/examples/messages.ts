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
import { validateForm, type CompiledForm } from '@auto-formisch/core';

// On the server, each request in its own language.
export function validateIn(form: CompiledForm, input: unknown, lang: string) {
  return validateForm(form, input, { lang }); // { value } or { errors: [{ message, path }] }
}
// #endregion per-request
