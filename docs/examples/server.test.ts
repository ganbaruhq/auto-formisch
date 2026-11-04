// @vitest-environment node
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import {
  compile,
  defineRule,
  DefinitionError,
  LockError,
  lock,
  type InferOutput,
} from '@auto-formisch/core';
import { companies, customers, saved } from './app';
import contactJson from './contact.json';
import conditionsJson from './conditions.json';
import repeaterJson from './repeater.json';
import { contact, type Contact } from './contact-builder';
import { handleContact } from './contact-server';
import { forged, signup } from './conditions';
import { customerForm, updateCustomer } from './edit-record';
import { extensions, review, stored } from './extensions';
import { formFor, updateCompany } from './lock';
import { signupForm } from './wizard';

// The server-side doc examples run with no DOM, like a server or Worker.

const post = (body: unknown) =>
  new Request('https://example.com/api/contact', { method: 'POST', body: JSON.stringify(body) });

describe('getting started', () => {
  it('runs with no DOM', () => {
    expect(typeof document).toBe('undefined');
  });

  it('builds the same Definition with the Fluent Builder as in JSON', () => {
    const { $schema, ...json } = contactJson;
    expect($schema).toBe('https://cdn.jsdelivr.net/npm/@auto-formisch/core/schema/v1.json');
    expect(contact).toEqual(json);
    expectTypeOf<Contact>().toEqualTypeOf<{
      name: string;
      email: string;
      topic?: 'sales' | 'support';
      message?: string;
    }>();
  });

  it('validates a submission on the server', async () => {
    const accepted = await handleContact(post({ name: 'Ada', email: 'ada@example.com', x: 1 }));
    expect(accepted.status).toBe(204);
    expect(saved.at(-1)).toEqual({ name: 'Ada', email: 'ada@example.com' });

    const rejected = await handleContact(post({ name: ' ', email: 'ada' }));
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toEqual({
      errors: [
        { message: 'Required', path: ['name'] },
        { message: 'Enter a valid email address', path: ['email'] },
      ],
    });
  });

  it('rejects a mistyped key with every error and its path', () => {
    const errors = (() => {
      try {
        compile({ version: 1, components: [{ type: 'text', name: 'email', requried: true }] });
      } catch (error) {
        if (error instanceof DefinitionError) return error.errors;
      }
    })();
    expect(errors).toEqual([
      { message: 'Unknown key "requried"', path: ['components', 0, 'requried'] },
    ]);
  });
});

describe('Conditions', () => {
  it('writes the JSON example with the Fluent Builder', () => {
    expect(signup).toEqual(conditionsJson);
    expectTypeOf<InferOutput<typeof signup>>().toEqualTypeOf<{
      kind: 'person' | 'company';
      country?: 'VN' | 'US';
      taxId?: string;
      email?: string;
      phone?: string;
    }>();
  });

  it('drops a value forged into an Inactive Field', () => {
    expect(forged).toEqual({ value: { kind: 'person', email: 'ada@example.com' } });
  });

  it('requires one of two Fields and the visible Tax ID', () => {
    const result = compile(conditionsJson)['~standard'].validate({
      kind: 'company',
      country: 'VN',
    });
    expect(result.issues).toEqual([
      { message: 'Required', path: ['taxId'] },
      { message: 'Required', path: ['email'] },
      { message: 'Required', path: ['phone'] },
    ]);
    expect(
      compile(conditionsJson)['~standard'].validate({ kind: 'person', phone: '0123' }),
    ).toEqual({ value: { kind: 'person', phone: '0123' } });
  });
});

describe('Repeaters', () => {
  const form = compile(repeaterJson);

  it('starts with one row and reads ../ from a row', () => {
    expect(form.defaults).toEqual({ addresses: [{}] });
    expect(
      form['~standard'].validate({
        country: 'US',
        addresses: [{ street: 'Main St', ward: 'forged', billing: true, vatNumber: 'X1' }],
      }),
    ).toEqual({
      value: {
        country: 'US',
        addresses: [{ street: 'Main St', billing: true, vatNumber: 'X1' }],
      },
    });
  });

  it('puts row errors on plain key paths, and Rules on the Repeater', () => {
    expect(
      form['~standard'].validate({ addresses: [{ street: 'Main St' }, { billing: true }] }).issues,
    ).toEqual([
      { message: 'Required', path: ['addresses', 1, 'street'] },
      { message: 'Required', path: ['addresses', 1, 'vatNumber'] },
    ]);
    expect(form['~standard'].validate({ addresses: [] }).issues).toEqual([
      { message: 'Add at least one address', path: ['addresses'] },
    ]);
  });
});

describe('Wizard', () => {
  it('validates as one whole form on the server', () => {
    const result = signupForm['~standard'].validate({ email: 'ada@example.com', plan: 'team' });
    expect(result.issues).toEqual([
      { message: 'Required', path: ['team'] },
      { message: 'Accept the terms to continue', path: ['terms'] },
    ]);
    expect(
      signupForm['~standard'].validate({
        email: 'ada@example.com',
        plan: 'free',
        team: 'forged',
        terms: true,
      }),
    ).toEqual({ value: { email: 'ada@example.com', plan: 'free', terms: true } });
  });
});

describe('editing a record', () => {
  it('replaces the managed keys on save, so a cleared value stays cleared', () => {
    customers.set('c1', {
      id: 'c1',
      createdAt: '2026-01-01',
      name: 'Ada',
      country: 'VN',
      contacts: [{ id: 'k1', email: 'ada@example.com' }],
    });
    expect(updateCustomer('c1', { name: 'Ada L.', contacts: [] })).toEqual({ status: 204 });
    expect(customers.get('c1')).toEqual({
      id: 'c1',
      createdAt: '2026-01-01',
      name: 'Ada L.',
      contacts: [],
    });
    expect(updateCustomer('c1', { contacts: [{}] })).toEqual({
      status: 422,
      errors: [
        { message: 'Required', path: ['name'] },
        { message: 'Required', path: ['contacts', 0, 'email'] },
      ],
    });
  });

  it('starts a new form from the defaults', () => {
    expect(customerForm.defaults).toEqual({ country: 'VN', contacts: [] });
  });
});

describe('Locked Fields', () => {
  it('replaces a forged value before Conditions run', () => {
    companies.set('p1', { id: 'p1', type: 'person' });
    // A person forges `type: company`: the stored type wins, so `taxId` is Inactive.
    expect(updateCompany('p1', { type: 'company', name: 'Ada', taxId: 'X' })).toEqual({
      status: 204,
    });
    expect(companies.get('p1')).toEqual({ id: 'p1', type: 'person', name: 'Ada' });

    companies.set('c1', { id: 'c1', type: 'company' });
    expect(updateCompany('c1', { type: 'person', name: 'Acme' })).toEqual({
      status: 422,
      errors: [{ message: 'Required', path: ['taxId'] }],
    });
  });

  it('throws a LockError for a value its Field rejects', () => {
    expect(() => formFor({ id: 'x', type: 'robot' as 'person' })).toThrow(LockError);
    expect(() => lock(formFor({ id: 'x', type: 'person' }), {})).toThrow(LockError);
  });
});

describe('custom Field Types and Rules', () => {
  it('validates with the registered types on the server', () => {
    expect(review['~standard'].validate({ score: 6, code: 'US1' }).issues).toEqual([
      { message: 'Invalid value: Expected <=5 but received 6', path: ['score'] },
      { message: 'Wrong prefix', path: ['code'] },
    ]);
    expect(stored['~standard'].validate({ score: 4, code: 'VN1' })).toEqual({
      value: { score: 4, code: 'VN1' },
    });
  });

  it('throws on load without the registrations', () => {
    expect(() => compile(stored.definition)).toThrow(DefinitionError);
    expect(() => compile(stored.definition, extensions)).not.toThrow();
  });
});

// The sharp edges the docs call out, held to what they say.
describe('Before you ship', () => {
  const validate = (definition: unknown, input: unknown) =>
    compile(definition)['~standard'].validate(input);

  it('lets `url` accept any scheme', () => {
    const site = {
      version: 1,
      components: [{ type: 'text', name: 'site', rules: [{ type: 'url' }] }],
    };
    expect(validate(site, { site: 'javascript:alert(1)' })).toEqual({
      value: { site: 'javascript:alert(1)' },
    });
  });

  it('lets `accepted` without `required` pass an empty checkbox', () => {
    const terms = (required: boolean) => ({
      version: 1,
      components: [{ type: 'boolean', name: 'terms', required, rules: [{ type: 'accepted' }] }],
    });
    expect(validate(terms(false), {})).toEqual({ value: {} });
    expect(validate(terms(true), {}).issues).toEqual([{ message: 'Required', path: ['terms'] }]);
  });

  it('runs a custom Rule even when a max_length beside it fails', () => {
    let calls = 0;
    const counted = defineRule({
      type: 'counted',
      appliesTo: ['text'],
      check: () => {
        calls++;
        return true;
      },
    });
    const code = compile(
      {
        version: 1,
        components: [
          {
            type: 'text',
            name: 'code',
            rules: [{ type: 'max_length', requirement: 3 }, { type: 'counted' }],
          },
        ],
      },
      { rules: [counted] },
    );
    expect(code['~standard'].validate({ code: 'x'.repeat(10) }).issues).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('shows Valibot defaults as technical messages', () => {
    const name = { version: 1, components: [{ type: 'text', name: 'name' }] };
    expect(validate(name, { name: 5 }).issues).toEqual([
      { message: 'Invalid type: Expected string but received 5', path: ['name'] },
    ]);
  });

  it('reads a list submitted for an object as an empty object', () => {
    const address = {
      version: 1,
      components: [
        { type: 'object', name: 'address', components: [{ type: 'text', name: 'city' }] },
      ],
    };
    expect(validate(address, { address: ['x'] })).toEqual({ value: { address: {} } });
  });

  it('rejects an empty nested Repeater list in a default row', () => {
    const nested = (row: object) => ({
      version: 1,
      components: [
        {
          type: 'repeater',
          name: 'outer',
          default: [row],
          components: [
            { type: 'repeater', name: 'inner', components: [{ type: 'text', name: 'x' }] },
          ],
        },
      ],
    });
    expect(() => compile(nested({ inner: [] }))).toThrow(DefinitionError);
    expect(compile(nested({})).defaults).toEqual({ outer: [{ inner: [] }] });
  });

  it('rejects any version but 1', () => {
    expect(() => compile({ version: 2, components: [] })).toThrow(
      'Unsupported version 2; this package reads version 1',
    );
  });
});
