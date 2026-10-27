import { describe, expect, it } from 'vite-plus/test';
import * as v from 'valibot';
import { deserialize, serialize } from './index';
import { getFields } from 'auto-formisch-core';

describe('portable forms', () => {
  it('preserves validation, optional fields, and UI through JSON', () => {
    const schema = v.object({
      email: v.pipe(v.string(), v.email('Invalid email')),
      age: v.pipe(v.number(), v.minValue(18)),
      notes: v.optional(v.string()),
      consent: v.boolean(),
    });
    const restored = deserialize(serialize(schema, { email: { label: 'Email address' } }));
    const good = { email: 'a@example.com', age: 18, consent: true };
    expect(v.parse(restored.schema, good)).toEqual(good);
    for (const bad of [
      { ...good, email: 'bad' },
      { ...good, age: 17 },
      { ...good, consent: 'yes' },
    ])
      expect(v.safeParse(restored.schema, bad).success).toBe(false);
    expect(getFields(restored.schema, restored.ui)[0]).toMatchObject({
      label: 'Email address',
      widget: 'email',
    });
    expect(serialize(restored.schema, restored.ui)).toBe(
      serialize(schema, { email: { label: 'Email address' } }),
    );
  });
  it('rejects unsupported behavior rather than losing it', () => {
    expect(() =>
      serialize(
        v.object({
          name: v.pipe(
            v.string(),
            v.transform((value) => value.trim()),
          ),
        }),
      ),
    ).toThrow('Unsupported action');
    expect(() => serialize(v.object({ name: v.optional(v.string(), 'default') }))).toThrow(
      'default',
    );
    expect(() => serialize(v.object({ nested: v.object({}) }))).toThrow('Unsupported field');
    for (const name of ['__proto__', 'prototype', 'constructor'])
      expect(() => serialize(v.object({ [name]: v.string() }))).toThrow(
        `Reserved field name: ${name}`,
      );
  });
  it('rejects malformed and incompatible stored definitions', () => {
    expect(() => deserialize('{"version":2}')).toThrow();
    expect(() =>
      deserialize(
        JSON.stringify({
          version: 1,
          fields: { age: { type: 'number', rules: [{ type: 'email' }] } },
          ui: {},
        }),
      ),
    ).toThrow('Invalid rule');
    expect(() =>
      deserialize(
        JSON.stringify({
          version: 1,
          fields: { name: { type: 'string', rules: [{ type: 'min_length' }] } },
          ui: {},
        }),
      ),
    ).toThrow('Invalid requirement');
    expect(() =>
      deserialize(
        JSON.stringify({
          version: 1,
          fields: { email: { type: 'string', rules: [{ type: 'email', requirement: 5 }] } },
          ui: {},
        }),
      ),
    ).toThrow('Invalid requirement for email');
  });
  it('rejects reserved field names in stored definitions rather than dropping them', () => {
    for (const name of ['__proto__', 'prototype', 'constructor'])
      expect(() =>
        deserialize(`{"version":1,"fields":{"${name}":{"type":"string","rules":[]}},"ui":{}}`),
      ).toThrow(`Reserved field name: ${name}`);
    expect(() =>
      deserialize(
        '{"version":1,"fields":{"name":{"type":"string","rules":[]}},"ui":{"constructor":{"label":"Name"}}}',
      ),
    ).toThrow('Reserved field name: constructor');
  });
});

it('preserves validation when pipelines are composed', () => {
  const schema = v.object({ name: v.pipe(v.pipe(v.string(), v.minLength(2)), v.maxLength(5)) });
  const { schema: restored } = deserialize(serialize(schema));
  for (const name of ['x', 'Ada', 'too long']) {
    expect(v.safeParse(restored, { name }).success).toBe(v.safeParse(schema, { name }).success);
  }
});
