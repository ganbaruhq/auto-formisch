import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError } from './index';

// `default` of a single-value Field. Seeding the store and Repeater rows are
// the Renderer's and AF-26's part; here only loading and the schema.

function loadErrors(definition: unknown): readonly FormError[] {
  try {
    compile(definition);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

const one = (field: object) => ({ version: 1, components: [{ name: 'value', ...field }] });

describe('default', () => {
  it('loads a default of the Field type and round-trips through JSON', () => {
    const definitions = [
      one({ type: 'text', default: 'Ada' }),
      one({ type: 'number', default: 0 }),
      one({ type: 'boolean', default: false }),
      one({ type: 'choice', choices: ['VN', 'US'], default: 'VN' }),
      one({ type: 'multi_choice', choices: [1, 2], default: [2] }),
      one({ type: 'date', default: '2024-02-29' }),
    ];
    for (const definition of definitions) {
      const loaded = compile(definition).definition;
      expect(loaded).toEqual(definition);
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(definition));
    }
  });

  it('stays out of the schema: an empty submission stays empty', () => {
    const compiled = compile(one({ type: 'text', default: 'Ada', required: true }));
    expect(compiled['~standard'].validate({})).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('never freezes the caller input', () => {
    const list = [2];
    compile(one({ type: 'multi_choice', choices: [1, 2], default: list }));
    expect(Object.isFrozen(list)).toBe(false);
  });

  it('rejects a default of the wrong type, outside the choices, or breaking a Rule', () => {
    expect(loadErrors(one({ type: 'text', default: 5 }))).toEqual([
      {
        message: 'Invalid type: Expected string but received 5',
        path: ['components', 0, 'default'],
      },
    ]);
    expect(loadErrors(one({ type: 'choice', choices: ['VN'], default: 'FR' }))).toEqual([
      {
        message: 'Invalid type: Expected "VN" but received "FR"',
        path: ['components', 0, 'default'],
      },
    ]);
    expect(
      loadErrors(
        one({ type: 'text', default: 'Al', rules: [{ type: 'min_length', requirement: 3 }] }),
      ),
    ).toEqual([
      {
        message: 'Invalid length: Expected >=3 but received 2',
        path: ['components', 0, 'default'],
      },
    ]);
  });

  it('rejects an empty default', () => {
    for (const field of [
      { type: 'text', default: '  ' },
      { type: 'text', default: null },
      { type: 'multi_choice', choices: ['a'], default: [] },
    ]) {
      expect(loadErrors(one(field))).toEqual([
        { message: 'A default cannot be empty', path: ['components', 0, 'default'] },
      ]);
    }
  });

  it('is reported with the other load errors', () => {
    expect(loadErrors(one({ type: 'number', default: 'x', label: 1 }))).toEqual([
      { message: 'Invalid type: Expected string but received 1', path: ['components', 0, 'label'] },
      {
        message: 'Invalid type: Expected number but received "x"',
        path: ['components', 0, 'default'],
      },
    ]);
  });

  it('is not a key of an object', () => {
    const child = [{ type: 'text', name: 'x' }];
    expect(loadErrors(one({ type: 'object', components: child, default: {} }))).toEqual([
      { message: 'Unknown key "default"', path: ['components', 0, 'default'] },
    ]);
  });
});

describe('Repeater default', () => {
  const rows = (extra: object, components: object[] = [{ type: 'text', name: 'a' }]) =>
    one({ type: 'repeater', components, ...extra });
  const at = (...path: (string | number)[]) => ['components', 0, 'default', ...path];

  it('loads a non-empty list of rows and round-trips through JSON', () => {
    const definition = rows({ default: [{}, { a: 'x' }] });
    const loaded = compile(definition).definition;
    expect(loaded).toEqual(definition);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(definition));
  });

  it('checks rows against the template, through Layouts, objects and nested Repeaters', () => {
    const template = [
      { type: 'section', components: [{ type: 'number', name: 'qty' }] },
      { type: 'object', name: 'o', components: [{ type: 'text', name: 'b' }] },
      { type: 'repeater', name: 'inner', components: [{ type: 'boolean', name: 'c' }] },
    ];
    const definition = rows(
      { default: [{ qty: 2, o: { b: 'y' }, inner: [{ c: false }] }] },
      template,
    );
    expect(compile(definition).definition).toEqual(definition);
  });

  it('rejects a default that is not a non-empty list of rows', () => {
    expect(loadErrors(rows({ default: {} }))).toEqual([
      { message: 'Expected an array', path: at() },
    ]);
    expect(loadErrors(rows({ default: [] }))).toEqual([
      { message: 'A default cannot be empty', path: at() },
    ]);
    expect(loadErrors(rows({ default: ['x', null] }))).toEqual([
      { message: 'Expected an object', path: at(0) },
      { message: 'Expected an object', path: at(1) },
    ]);
  });

  it('rejects unknown keys, wrong types, empty values and broken Rules in rows', () => {
    const template = [
      { type: 'text', name: 'a', rules: [{ type: 'min_length', requirement: 2 }] },
      { type: 'object', name: 'o', components: [{ type: 'number', name: 'n' }] },
      { type: 'repeater', name: 'inner', components: [{ type: 'boolean', name: 'c' }] },
    ];
    expect(
      loadErrors(
        rows(
          {
            default: [
              { a: 'x', b: 1 },
              { a: 5, o: { n: 'one', m: 1 } },
              { a: '  ', o: [], inner: [{ c: 'no' }] },
            ],
          },
          template,
        ),
      ),
    ).toEqual([
      { message: 'Invalid length: Expected >=2 but received 1', path: at(0, 'a') },
      { message: 'Unknown key "b"', path: at(0, 'b') },
      { message: 'Invalid type: Expected string but received 5', path: at(1, 'a') },
      { message: 'Invalid type: Expected number but received "one"', path: at(1, 'o', 'n') },
      { message: 'Unknown key "m"', path: at(1, 'o', 'm') },
      { message: 'A default cannot be empty', path: at(2, 'a') },
      { message: 'Expected an object', path: at(2, 'o') },
      { message: 'Invalid type: Expected boolean but received "no"', path: at(2, 'inner', 0, 'c') },
    ]);
  });

  it('lets a row hold an empty list for a nested Repeater, still checked by its Rules', () => {
    const inner = (rules: object = {}) => [
      { type: 'repeater', name: 'inner', components: [{ type: 'text', name: 'c' }], ...rules },
    ];
    const definition = rows({ default: [{ inner: [] }, { inner: [{ c: 'x' }] }] }, inner());
    const compiled = compile(definition);
    expect(compiled.definition).toEqual(definition);
    expect(compiled.defaults).toEqual({ value: [{ inner: [] }, { inner: [{ c: 'x' }] }] });
    expect(
      loadErrors(
        rows(
          { default: [{ inner: [] }] },
          inner({ rules: [{ type: 'min_items', requirement: 1 }] }),
        ),
      ),
    ).toEqual([{ message: 'Invalid length: Expected >=1 but received 0', path: at(0, 'inner') }]);
  });

  it('passes the Repeater Rules as a whole', () => {
    const limited = (count: number) =>
      rows({
        rules: [
          { type: 'min_items', requirement: 2 },
          { type: 'max_items', requirement: 3 },
        ],
        default: Array.from({ length: count }, () => ({})),
      });
    expect(compile(limited(2)).definition.components).toHaveLength(1);
    expect(loadErrors(limited(1))).toEqual([
      { message: 'Invalid length: Expected >=2 but received 1', path: at() },
    ]);
    expect(loadErrors(limited(4))).toEqual([
      { message: 'Invalid length: Expected <=3 but received 4', path: at() },
    ]);
  });

  it('never freezes the caller input', () => {
    const row = { a: 'x' };
    const list = [row];
    compile(rows({ default: list }));
    expect(Object.isFrozen(list)).toBe(false);
    expect(Object.isFrozen(row)).toBe(false);
  });

  it('stays out of the schema: a submission without rows has none', () => {
    expect(compile(rows({ default: [{ a: 'x' }] }))['~standard'].validate({})).toEqual({
      value: { value: [] },
    });
  });
});

describe('compiled.defaults', () => {
  const definition = {
    version: 1,
    components: [
      { type: 'text', name: 'name' },
      { type: 'choice', name: 'country', choices: ['VN', 'US'], default: 'VN' },
      {
        type: 'section',
        components: [{ type: 'multi_choice', name: 'tags', choices: ['a', 'b'], default: ['b'] }],
      },
      {
        type: 'text',
        name: 'taxId',
        default: 'none',
        visible: { field: 'country', operator: 'eq', value: 'US' },
      },
      {
        type: 'object',
        name: 'address',
        components: [
          { type: 'text', name: 'city', default: 'Hanoi' },
          { type: 'object', name: 'geo', components: [{ type: 'number', name: 'lat' }] },
        ],
      },
      { type: 'repeater', name: 'empty', components: [{ type: 'text', name: 'x' }] },
      {
        type: 'repeater',
        name: 'lines',
        default: [{}, { item: 'pen', notes: [{ text: 'blue' }] }],
        components: [
          { type: 'text', name: 'item' },
          { type: 'number', name: 'qty', default: 1 },
          {
            type: 'repeater',
            name: 'notes',
            default: [{}],
            components: [{ type: 'text', name: 'text', default: '-' }],
          },
        ],
      },
    ],
  };

  it('is the full shape a new form starts with, Inactive Fields included', () => {
    expect(compile(definition).defaults).toEqual({
      country: 'VN',
      tags: ['b'],
      taxId: 'none',
      address: { city: 'Hanoi', geo: {} },
      empty: [],
      lines: [
        { qty: 1, notes: [{ text: '-' }] },
        { item: 'pen', qty: 1, notes: [{ text: 'blue' }] },
      ],
    });
  });

  it('returns a fresh copy on every read', () => {
    const compiled = compile(definition);
    const first = compiled.defaults as {
      tags: string[];
      address: { city: string };
      lines: { qty: number }[];
    };
    first.tags.push('a');
    first.address.city = 'Hue';
    first.lines[0].qty = 9;
    first.lines.pop();
    const second = compiled.defaults;
    expect(second).not.toBe(first);
    expect(second).toEqual(compile(definition).defaults);
    expect(Object.isFrozen(second)).toBe(false);
  });

  it('is an empty object for a form without defaults', () => {
    expect(compile(one({ type: 'text' })).defaults).toEqual({});
  });
});
