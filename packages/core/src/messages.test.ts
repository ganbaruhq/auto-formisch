import '@valibot/i18n/de';
import * as v from 'valibot';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { compile, deleteRequiredMessage, setRequiredMessage } from './index';

const required = (extra: object = {}) =>
  compile({
    version: 1,
    components: [{ type: 'text', name: 'name', required: true, ...extra }],
  });

/** A required Field `name` and an optional Field `code` with a `min_length` Rule. */
const form = (rule: object = {}, extra: object = {}) =>
  compile({
    version: 1,
    components: [
      { type: 'text', name: 'name', required: true, ...extra },
      { type: 'text', name: 'code', rules: [{ type: 'min_length', requirement: 3, ...rule }] },
    ],
  });

/** The messages of a server-side parse with a per-request config. */
const messages = async (schema: v.GenericSchema, input: unknown, config?: { lang?: string }) =>
  (await v.safeParseAsync(schema, input, config)).issues?.map((issue) => issue.message);

const validate = (compiled = form(), input: unknown = { code: 'a' }) =>
  compiled['~standard'].validate(input);

afterEach(() => {
  deleteRequiredMessage();
  deleteRequiredMessage('de');
  v.deleteGlobalConfig();
  v.deleteGlobalMessage();
  v.deleteSchemaMessage();
  v.deleteSpecificMessage(v.check);
  v.deleteSpecificMessage(v.minLength);
});

describe('messages: required', () => {
  it('is Required by default', () => {
    expect(validate(required(), {})).toEqual({
      issues: [{ message: 'Required', path: ['name'] }],
    });
  });

  it('uses the message set with setRequiredMessage', () => {
    setRequiredMessage('Please answer');
    expect(validate(required(), {})).toEqual({
      issues: [{ message: 'Please answer', path: ['name'] }],
    });
  });

  it('prefers requiredMessage in the Definition over setRequiredMessage', () => {
    setRequiredMessage('Please answer');
    expect(validate(required({ requiredMessage: 'Enter a name' }), {})).toEqual({
      issues: [{ message: 'Enter a name', path: ['name'] }],
    });
  });

  it('takes a message function, like Valibot', () => {
    setRequiredMessage((issue) => `Please answer (${issue.type})`);
    expect(validate(required(), {})).toEqual({
      issues: [{ message: 'Please answer (check)', path: ['name'] }],
    });
  });

  it('applies to a compiled form whatever the order of compile and setRequiredMessage', () => {
    const compiled = required();
    setRequiredMessage('Please answer');
    expect(validate(compiled, {}).issues?.[0].message).toBe('Please answer');
    deleteRequiredMessage();
    expect(validate(compiled, {}).issues?.[0].message).toBe('Required');
  });

  it('sets a message per language, read from the per-request lang', async () => {
    setRequiredMessage('Please answer');
    setRequiredMessage('Pflichtfeld', 'de');
    const { schema } = required();
    expect(await messages(schema, {}, { lang: 'de' })).toEqual(['Pflichtfeld']);
    expect(await messages(schema, {})).toEqual(['Please answer']);
  });

  it('falls back to Required, not to another language, like Valibot', async () => {
    setRequiredMessage('Pflichtfeld', 'de');
    const { schema } = required();
    expect(await messages(schema, {})).toEqual(['Required']);
    expect(await messages(schema, {}, { lang: 'fr' })).toEqual(['Required']);
    deleteRequiredMessage('de');
    setRequiredMessage('Please answer');
    expect(await messages(schema, {}, { lang: 'de' })).toEqual(['Required']);
  });

  it('reads the language of setGlobalConfig in ~standard.validate', () => {
    setRequiredMessage('Pflichtfeld', 'de');
    v.setGlobalConfig({ lang: 'de' });
    expect(validate(required(), {})).toEqual({
      issues: [{ message: 'Pflichtfeld', path: ['name'] }],
    });
  });

  it('is not changed by setGlobalMessage, which still reaches the Rules', () => {
    v.setGlobalMessage('Something is wrong');
    expect(validate(form(), { code: 'a' })).toEqual({
      issues: [
        { message: 'Required', path: ['name'] },
        { message: 'Something is wrong', path: ['code'] },
      ],
    });
  });

  it('is not changed by a specific message for v.check, the action required compiles to', () => {
    v.setSpecificMessage(v.check, 'Check failed');
    expect(validate(required(), {})).toEqual({
      issues: [{ message: 'Required', path: ['name'] }],
    });
  });
});

describe('messages: Rules and Field Types', () => {
  it('uses Valibot defaults when nothing is set', () => {
    expect(validate(form(), { name: 5, code: 'a' })).toEqual({
      issues: [
        { message: 'Invalid type: Expected string but received 5', path: ['name'] },
        { message: 'Invalid length: Expected >=3 but received 1', path: ['code'] },
      ],
    });
  });

  it('use the specific, then schema, then global messages of Valibot', () => {
    v.setGlobalMessage('Global');
    expect(validate(form(), { name: 5, code: 'a' }).issues?.map((i) => i.message)).toEqual([
      'Global',
      'Global',
    ]);
    v.setSchemaMessage('Schema');
    v.setSpecificMessage(v.minLength, 'Specific');
    expect(validate(form(), { name: 5, code: 'a' }).issues?.map((i) => i.message)).toEqual([
      'Schema',
      'Specific',
    ]);
  });

  it('prefer the Rule message in the Definition over every Valibot message', () => {
    v.setGlobalMessage('Global');
    v.setSchemaMessage('Schema');
    v.setSpecificMessage(v.minLength, 'Specific');
    expect(validate(form({ message: 'At least 3' }))).toEqual({
      issues: [
        { message: 'Required', path: ['name'] },
        { message: 'At least 3', path: ['code'] },
      ],
    });
  });

  it('take Valibot message functions with the requirement as a parameter', () => {
    v.setSpecificMessage(v.minLength, (issue) => `Tối thiểu ${issue.requirement}`, 'vi');
    v.setGlobalConfig({ lang: 'vi' });
    expect(validate().issues?.map((issue) => issue.message)).toEqual(['Required', 'Tối thiểu 3']);
  });
});

describe('messages: @valibot/i18n', () => {
  it('translates Valibot messages per request, and required never shows the symbol', async () => {
    const { schema } = form();
    expect(await messages(schema, { name: 5, code: 'a' }, { lang: 'de' })).toEqual([
      'Ungültiger Typ: string erwartet aber 5 erhalten',
      'Ungültige Länge: >=3 erwartet aber 1 erhalten',
    ]);
    expect(await messages(schema, { code: 'abc' }, { lang: 'de' })).toEqual(['Required']);
    expect(await messages(schema, { code: 'abc' })).toEqual(['Required']);
  });

  it('translates required with setRequiredMessage, and leaves ~standard.validate on the global lang', async () => {
    setRequiredMessage('Pflichtfeld', 'de');
    const compiled = form();
    expect(await messages(compiled.schema, { code: 'a' }, { lang: 'de' })).toEqual([
      'Pflichtfeld',
      'Ungültige Länge: >=3 erwartet aber 1 erhalten',
    ]);
    expect(validate(compiled).issues?.map((issue) => issue.message)).toEqual([
      'Required',
      'Invalid length: Expected >=3 but received 1',
    ]);
  });

  it('keeps the Definition messages over the translations', async () => {
    setRequiredMessage('Pflichtfeld', 'de');
    const { schema } = form({ message: 'Mindestens 3' }, { requiredMessage: 'Name fehlt' });
    expect(await messages(schema, { code: 'a' }, { lang: 'de' })).toEqual([
      'Name fehlt',
      'Mindestens 3',
    ]);
  });
});
