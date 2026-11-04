import * as v from 'valibot';
import { describe, expect, it } from 'vite-plus/test';
import { compile } from './index';

const validate = (definition: unknown, input: unknown) =>
  compile(definition)['~standard'].validate(input);

describe('compile: one text Field', () => {
  const definition = { version: 1, components: [{ type: 'text', name: 'name' }] };

  it('accepts a text value and returns it as output', () => {
    expect(validate(definition, { name: 'Ada' })).toEqual({ value: { name: 'Ada' } });
  });

  it('is optional by default, and an empty value drops its key', () => {
    for (const input of [{}, { name: undefined }, { name: null }, { name: '' }, { name: '  \n' }]) {
      expect(validate(definition, input)).toEqual({ value: {} });
    }
  });

  it('keeps the whitespace of a value that has content', () => {
    expect(validate(definition, { name: ' Ada ' })).toEqual({ value: { name: ' Ada ' } });
  });

  it('drops keys the Definition does not declare', () => {
    expect(validate(definition, { name: 'Ada', isAdmin: true })).toEqual({
      value: { name: 'Ada' },
    });
  });

  it('rejects a value of the wrong type with an error on the Field', () => {
    expect(validate(definition, { name: 5 })).toEqual({
      issues: [{ message: 'Invalid type: Expected string but received 5', path: ['name'] }],
    });
  });

  it('rejects input that is not an object at the root', () => {
    const result = validate(definition, 'Ada');
    expect(result.issues).toHaveLength(1);
    expect(result.issues?.[0].path).toEqual([]);
  });
});

describe('compile: schema', () => {
  const compiled = compile({
    version: 1,
    components: [{ type: 'text', name: 'name', required: true }],
  });

  it('is a three-stage root pipe whose last stage is the typed object (ADR 0002)', () => {
    const schema = compiled.schema as unknown as v.SchemaWithPipe<
      [v.GenericSchema, v.GenericPipeItem, v.ObjectSchema<v.ObjectEntries, undefined>]
    >;
    expect(schema.pipe).toHaveLength(3);
    expect(schema.pipe[1]).toMatchObject({ kind: 'transformation', type: 'transform' });
    expect(Object.keys(schema.pipe[2].entries)).toEqual(['name']);
  });

  it('gives the same result through Valibot as through the Standard Schema', () => {
    expect(v.safeParse(compiled.schema, { name: 'Ada' }).output).toEqual({ name: 'Ada' });
    expect(compiled.schema['~standard'].validate({ name: 'Ada' })).toMatchObject({
      value: { name: 'Ada' },
    });
    const result = v.safeParse(compiled.schema, { name: '' });
    expect(result.success).toBe(false);
    expect(result.issues?.map((issue) => issue.message)).toEqual(['Required']);
  });
});

describe('compile: Rules on a text Field', () => {
  const field = (rules: unknown[], extra: object = {}) => ({
    version: 1,
    components: [{ type: 'text', name: 'value', rules, ...extra }],
  });

  it('email accepts an address and rejects anything else', () => {
    const definition = field([{ type: 'email', message: 'Enter an email' }]);
    expect(validate(definition, { value: 'ada@example.com' })).toEqual({
      value: { value: 'ada@example.com' },
    });
    expect(validate(definition, { value: 'ada' })).toEqual({
      issues: [{ message: 'Enter an email', path: ['value'] }],
    });
  });

  it('min_length and max_length bound the length', () => {
    const definition = field([
      { type: 'min_length', requirement: 2, message: 'Too short' },
      { type: 'max_length', requirement: 4, message: 'Too long' },
    ]);
    expect(validate(definition, { value: 'a' })).toEqual({
      issues: [{ message: 'Too short', path: ['value'] }],
    });
    expect(validate(definition, { value: 'abcde' })).toEqual({
      issues: [{ message: 'Too long', path: ['value'] }],
    });
    for (const value of ['ab', 'abcd']) {
      expect(validate(definition, { value })).toEqual({ value: { value } });
    }
  });

  it('reports every failing Rule', () => {
    const definition = field([
      { type: 'min_length', requirement: 3, message: 'Too short' },
      { type: 'email', message: 'Enter an email' },
    ]);
    expect(validate(definition, { value: 'a' })).toEqual({
      issues: [
        { message: 'Too short', path: ['value'] },
        { message: 'Enter an email', path: ['value'] },
      ],
    });
  });

  it("falls back to Valibot's message when the Rule has none", () => {
    expect(validate(field([{ type: 'min_length', requirement: 3 }]), { value: 'a' })).toEqual({
      issues: [{ message: 'Invalid length: Expected >=3 but received 1', path: ['value'] }],
    });
  });

  it('skips Rules on an empty value', () => {
    const definition = field([{ type: 'min_length', requirement: 3 }, { type: 'email' }]);
    expect(validate(definition, { value: '' })).toEqual({ value: {} });
  });

  it('reports Required, not the Rules, on an empty required value', () => {
    const definition = field([{ type: 'email', message: 'Enter an email' }], { required: true });
    expect(validate(definition, { value: ' ' })).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });
});

describe('compile: required', () => {
  const definition = {
    version: 1,
    components: [{ type: 'text', name: 'name', required: true }],
  };

  it('reports a missing or empty value as Required on the Field', () => {
    for (const input of [{}, { name: null }, { name: '' }, { name: '   ' }]) {
      expect(validate(definition, input)).toEqual({
        issues: [{ message: 'Required', path: ['name'] }],
      });
    }
  });

  it('treats 0 as a value, not as empty', () => {
    expect(validate(definition, { name: 0 })).toEqual({
      issues: [{ message: 'Invalid type: Expected string but received 0', path: ['name'] }],
    });
  });

  it('uses requiredMessage when the Definition gives one', () => {
    const custom = {
      version: 1,
      components: [{ type: 'text', name: 'name', required: true, requiredMessage: 'Enter a name' }],
    };
    expect(validate(custom, {})).toEqual({
      issues: [{ message: 'Enter a name', path: ['name'] }],
    });
  });

  it('accepts a value with content', () => {
    expect(validate(definition, { name: 'Ada' })).toEqual({ value: { name: 'Ada' } });
  });
});
