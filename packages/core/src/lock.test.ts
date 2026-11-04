import { describe, expect, it } from 'vite-plus/test';
import { compile, lock, LockError, type CompiledForm, type FormError } from './index';

// Locked Fields on the server: `lock`, then `~standard.validate` (AF-11, ADR 0003).

const root = (...components: unknown[]) => compile({ version: 1, components });

/** `type` drives a required `taxId` that only companies have. */
const company = () =>
  root(
    { type: 'choice', name: 'type', choices: ['person', 'company'] },
    {
      type: 'text',
      name: 'taxId',
      visible: { field: 'type', operator: 'eq', value: 'company' },
      required: true,
    },
  );

describe('lock on the server', () => {
  it('overwrites a forged value before Conditions run', () => {
    const form = lock(company(), { type: 'company' });
    expect(form['~standard'].validate({ type: 'person' })).toEqual({
      issues: [{ message: 'Required', path: ['taxId'] }],
    });
    expect(form['~standard'].validate({ type: 'person', taxId: 'X1' })).toEqual({
      value: { type: 'company', taxId: 'X1' },
    });
  });

  it('locks a Field inside an object by its data path', () => {
    const form = lock(
      root({
        type: 'object',
        name: 'address',
        components: [
          { type: 'text', name: 'country' },
          {
            type: 'text',
            name: 'state',
            visible: { field: 'country', operator: 'eq', value: 'US' },
            required: true,
          },
        ],
      }),
      { 'address.country': 'US' },
    );
    expect(form['~standard'].validate({ address: { country: 'VN' } })).toEqual({
      issues: [{ message: 'Required', path: ['address', 'state'] }],
    });
    expect(form['~standard'].validate({})).toEqual({
      issues: [{ message: 'Required', path: ['address', 'state'] }],
    });
    // A forged `object` of another shape cannot hide the Locked value.
    expect(form['~standard'].validate({ address: 'x' })).toEqual({
      issues: [{ message: 'Required', path: ['address', 'state'] }],
    });
    expect(form['~standard'].validate({ address: { country: 'VN', state: 'CA' } })).toEqual({
      value: { address: { country: 'US', state: 'CA' } },
    });
  });

  it('locks a Field empty with an empty value', () => {
    for (const empty of [undefined, null, '', '  ']) {
      const form = lock(company(), { type: empty });
      expect(form['~standard'].validate({ type: 'company' })).toEqual({ value: {} });
    }
  });

  it('skips required and Rules on a Locked Field', () => {
    const form = lock(
      root(
        {
          type: 'text',
          name: 'code',
          required: true,
          rules: [{ type: 'min_length', requirement: 5 }],
        },
        { type: 'number', name: 'age', required: true },
      ),
      { code: 'ab', age: undefined },
    );
    expect(form['~standard'].validate({})).toEqual({ value: { code: 'ab' } });
    expect(form['~standard'].validate({ code: 'abcdef', age: 3 })).toEqual({
      value: { code: 'ab' },
    });
  });

  it('lets a Condition make a Locked Field Inactive', () => {
    const form = lock(
      root(
        { type: 'boolean', name: 'show' },
        {
          type: 'text',
          name: 'hiddenOne',
          visible: { field: 'show', operator: 'eq', value: true },
        },
        {
          type: 'section',
          visible: { field: 'show', operator: 'eq', value: true },
          components: [{ type: 'text', name: 'inSection' }],
        },
        {
          type: 'object',
          name: 'group',
          disabled: { field: 'show', operator: 'neq', value: true },
          components: [{ type: 'text', name: 'inGroup' }],
        },
        {
          type: 'text',
          name: 'echo',
          visible: { field: 'hiddenOne', operator: 'eq', value: 'L' },
          required: true,
        },
      ),
      { hiddenOne: 'L', inSection: 'S', 'group.inGroup': 'G' },
    );
    expect(form['~standard'].validate({ hiddenOne: 'L' })).toEqual({ value: { group: {} } });
    expect(form['~standard'].validate({ show: true })).toEqual({
      issues: [{ message: 'Required', path: ['echo'] }],
    });
    expect(form['~standard'].validate({ show: true, echo: 'e' })).toEqual({
      value: { show: true, hiddenOne: 'L', inSection: 'S', group: { inGroup: 'G' }, echo: 'e' },
    });
  });

  it('accepts every single-value Field Type', () => {
    const form = lock(
      root(
        { type: 'text', name: 'text' },
        { type: 'number', name: 'number' },
        { type: 'boolean', name: 'boolean' },
        { type: 'choice', name: 'choice', choices: [1, 2] },
        { type: 'multi_choice', name: 'multi', choices: ['a', 'b'] },
        { type: 'date', name: 'date' },
      ),
      { text: 't', number: 0, boolean: false, choice: 2, multi: ['b'], date: '2024-02-29' },
    );
    expect(form['~standard'].validate({})).toEqual({
      value: { text: 't', number: 0, boolean: false, choice: 2, multi: ['b'], date: '2024-02-29' },
    });
  });

  it('accepts a value of the right JavaScript type that its Field would reject', () => {
    // A record saved before a choice was removed, a limit tightened or a Rule added.
    const form = lock(
      root(
        { type: 'choice', name: 'plan', choices: ['basic', 'pro'] },
        { type: 'number', name: 'seats', rules: [{ type: 'max_value', requirement: 10 }] },
        { type: 'multi_choice', name: 'tags', choices: [1, 2] },
        { type: 'date', name: 'born' },
        { type: 'text', name: 'code', rules: [{ type: 'min_length', requirement: 5 }] },
      ),
      { plan: 'legacy', seats: 50, tags: [3, 3], born: '2024-02-30', code: 'ab' },
    );
    expect(form['~standard'].validate({})).toEqual({
      value: { plan: 'legacy', seats: 50, tags: [3, 3], born: '2024-02-30', code: 'ab' },
    });
  });

  it('copies the values it locks', () => {
    const values = { multi: ['a'] };
    const form = lock(root({ type: 'multi_choice', name: 'multi', choices: ['a', 'b'] }), values);
    values.multi.push('b');
    const first = form['~standard'].validate({}) as { value: { multi: string[] } };
    expect(first.value).toEqual({ multi: ['a'] });
    first.value.multi.push('b');
    expect(form['~standard'].validate({})).toEqual({ value: { multi: ['a'] } });
  });

  it('locks a Field on a Wizard Page, driving a Field on another Page', () => {
    const form = lock(
      compile({
        version: 1,
        pages: [
          {
            type: 'page',
            label: 'Type',
            components: [{ type: 'choice', name: 'type', choices: ['person', 'company'] }],
          },
          {
            type: 'page',
            label: 'Company',
            visible: { field: 'type', operator: 'eq', value: 'company' },
            components: [{ type: 'text', name: 'taxId', required: true }],
          },
        ],
      }),
      { type: 'company' },
    );
    expect(form['~standard'].validate({ type: 'person' })).toEqual({
      issues: [{ message: 'Required', path: ['taxId'] }],
    });
    expect(form.defaults).toEqual({ type: 'company' });
  });

  it('leaves the compiled form as it was', () => {
    const compiled = company();
    const form = lock(compiled, { type: 'company' });
    expect(form.definition).toBe(compiled.definition);
    expect(compiled.locked.size).toBe(0);
    expect(compiled['~standard'].validate({ type: 'person' })).toEqual({
      value: { type: 'person' },
    });
    expect(lock(compiled, { type: 'person' })['~standard'].validate({})).toEqual({
      value: { type: 'person' },
    });
  });
});

describe('lock rejects', () => {
  function lockErrors(form: CompiledForm, values: unknown): readonly FormError[] {
    try {
      lock(form, values as never);
    } catch (error) {
      expect(error).toBeInstanceOf(LockError);
      return (error as LockError).errors;
    }
    throw new Error('Expected lock to throw');
  }

  const form = () =>
    root(
      { type: 'text', name: 'name' },
      { type: 'number', name: 'age' },
      { type: 'choice', name: 'kind', choices: ['a', 'b'] },
      { type: 'multi_choice', name: 'tags', choices: [1, 2] },
      { type: 'date', name: 'born' },
      { type: 'object', name: 'address', components: [{ type: 'text', name: 'country' }] },
      { type: 'repeater', name: 'items', components: [{ type: 'text', name: 'title' }] },
    );

  it('paths that are not single-value Fields outside Repeaters, all at once', () => {
    expect(
      lockErrors(form(), {
        address: {},
        items: [],
        'items.title': 'x',
        missing: 1,
        'address.street': 'x',
        'name.first': 'x',
        '../name': 'x',
        'items.0.title': 'x',
      }),
    ).toEqual([
      { message: 'Cannot lock the object "address"; lock its Fields', path: ['address'] },
      { message: 'Cannot lock the Repeater "items" or its rows', path: ['items'] },
      {
        message: '"items.title" goes inside the rows of the Repeater "items"',
        path: ['items.title'],
      },
      { message: 'No Field "missing"', path: ['missing'] },
      { message: 'No Field "address.street"', path: ['address.street'] },
      { message: '"name" has no Fields', path: ['name.first'] },
      { message: 'Expected a data path such as "address.country"', path: ['../name'] },
      { message: 'Expected a data path such as "address.country"', path: ['items.0.title'] },
    ]);
  });

  it('a value of the wrong JavaScript type for its Field', () => {
    expect(
      lockErrors(form(), {
        name: 5,
        age: '5',
        kind: true,
        tags: 'a',
        born: 20240229,
        'address.country': ['VN'],
      }),
    ).toEqual([
      { message: 'Expected a string, not a number', path: ['name'] },
      { message: 'Expected a number, not a string', path: ['age'] },
      { message: 'Expected a string or a number, not a boolean', path: ['kind'] },
      { message: 'Expected a list of strings or numbers, not a string', path: ['tags'] },
      { message: 'Expected a string, not a number', path: ['born'] },
      { message: 'Expected a string, not a list', path: ['address.country'] },
    ]);
  });

  it('a form that is already Locked', () => {
    const locked = lock(form(), { name: 'Ada' });
    const already = [
      { message: 'The form is already Locked; pass every value to one "lock" call', path: [] },
    ];
    expect(lockErrors(locked, { age: 1 })).toEqual(already);
    expect(lockErrors(lock(form(), {}), { age: 1 })).toEqual(already);
  });

  it('values that are not an object', () => {
    for (const values of [null, ['name'], 'name']) {
      expect(lockErrors(form(), values)).toEqual([
        { message: 'Expected an object of data paths and values', path: [] },
      ]);
    }
  });

  it('anything but a compiled form', () => {
    expect(() => lock({ ...form() }, {})).toThrow('lock: expected the result of compile');
  });
});

describe('lock for a Renderer', () => {
  it('lists the Locked Fields by their declared nodes', () => {
    const compiled = company();
    const [type, taxId] = compiled.definition.components!;
    const form = lock(compiled, { type: 'company' });
    expect(form.locked.get(type as never)).toBe('company');
    expect(form.locked.has(taxId as never)).toBe(false);
    expect(lock(compiled, { type: undefined }).locked.has(type as never)).toBe(true);
  });

  it('evaluates Conditions with the Locked values', () => {
    const compiled = company();
    const taxId = compiled.definition.components![1];
    const form = lock(compiled, { type: 'company' });
    expect(form.conditions.evaluate({ type: 'person' }).isVisible(taxId, [])).toBe(true);
    expect(form.conditions.evaluate(undefined).isVisible(taxId, [])).toBe(true);
    expect(compiled.conditions.evaluate({ type: 'person' }).isVisible(taxId, [])).toBe(false);
  });

  it('beats default in defaults, which stays a fresh copy', () => {
    const form = lock(
      root(
        { type: 'multi_choice', name: 'tags', choices: ['a', 'b'], default: ['a'] },
        { type: 'text', name: 'note', default: 'n' },
        {
          type: 'object',
          name: 'address',
          components: [{ type: 'text', name: 'country', default: 'VN' }],
        },
      ),
      { tags: ['b'], 'address.country': undefined },
    );
    const defaults = form.defaults;
    expect(defaults).toEqual({ tags: ['b'], note: 'n', address: { country: undefined } });
    (defaults.tags as string[]).push('a');
    expect(form.defaults.tags).toEqual(['b']);
  });

  it('beats initialInput in normalize, with no warning for the Locked value', () => {
    const form = lock(
      root(
        { type: 'text', name: 'type' },
        { type: 'text', name: 'name' },
        { type: 'object', name: 'address', components: [{ type: 'text', name: 'country' }] },
      ),
      { type: 'company', 'address.country': 'VN' },
    );
    expect(form.normalize({ type: 5, name: 7, address: { country: 'US' } })).toEqual({
      input: { type: 'company', address: { country: 'VN' } },
      warnings: [{ message: 'Expected a string, not a number; left empty', path: ['name'] }],
    });
  });
});
