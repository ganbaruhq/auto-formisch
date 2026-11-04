import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError, type RepeaterField } from './index';

const validate = (definition: unknown, input: unknown) =>
  compile(definition)['~standard'].validate(input);

/** Compiles a Definition that must fail, and returns its load errors. */
function loadErrors(definition: unknown): readonly FormError[] {
  try {
    compile(definition);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

const root = (...components: unknown[]) => ({ version: 1, components });
const text = (name: string, extra: object = {}) => ({ type: 'text', name, ...extra });
const object = (name: string, components: unknown[], extra: object = {}) => ({
  type: 'object',
  name,
  components,
  ...extra,
});
const repeater = (name: string, components: unknown[], extra: object = {}) => ({
  type: 'repeater',
  name,
  components,
  ...extra,
});

describe('object', () => {
  const address = root(object('address', [text('street'), text('city')]));

  it('nests its Fields under its name', () => {
    expect(validate(address, { address: { street: 'Main St', city: 'Hanoi' } })).toEqual({
      value: { address: { street: 'Main St', city: 'Hanoi' } },
    });
  });

  it('always keeps its key, as {} when nothing in it has a value', () => {
    for (const input of [{}, { address: undefined }, { address: null }, { address: {} }]) {
      expect(validate(address, input)).toEqual({ value: { address: {} } });
    }
    expect(validate(address, { address: { street: ' ' } })).toEqual({ value: { address: {} } });
  });

  it('reports a required Field inside it at its nested path', () => {
    const required = root(object('address', [text('street', { required: true }), text('city')]));
    expect(validate(required, {})).toEqual({
      issues: [{ message: 'Required', path: ['address', 'street'] }],
    });
  });

  it('rejects a value that is not an object at its own path', () => {
    for (const value of ['Main St', 5, true]) {
      const result = validate(address, { address: value });
      expect(result.issues?.map((issue) => issue.path)).toEqual([['address']]);
    }
  });

  it('drops keys its Components do not declare', () => {
    expect(validate(address, { address: { street: 'Main St', other: 1 } })).toEqual({
      value: { address: { street: 'Main St' } },
    });
  });

  it('nests inside another object and through Layouts', () => {
    const nested = root(
      object('person', [
        { type: 'section', label: 'Name', components: [text('name', { required: true })] },
        object('address', [text('city', { rules: [{ type: 'min_length', requirement: 2 }] })]),
      ]),
    );
    expect(validate(nested, {})).toEqual({
      issues: [{ message: 'Required', path: ['person', 'name'] }],
    });
    expect(validate(nested, { person: { name: 'Ada', address: { city: 'H' } } })).toEqual({
      issues: [
        {
          message: 'Invalid length: Expected >=2 but received 1',
          path: ['person', 'address', 'city'],
        },
      ],
    });
    expect(validate(nested, { person: { name: 'Ada' } })).toEqual({
      value: { person: { name: 'Ada', address: {} } },
    });
  });
});

describe('repeater', () => {
  const addresses = root(repeater('addresses', [text('street', { required: true }), text('city')]));

  it('outputs its rows as a list of objects', () => {
    const input = { addresses: [{ street: 'Main St', city: 'Hanoi' }, { street: 'High St' }] };
    expect(validate(addresses, input)).toEqual({ value: input });
  });

  it('always keeps its key, as [] when it has no rows', () => {
    for (const input of [{}, { addresses: undefined }, { addresses: null }, { addresses: [] }]) {
      expect(validate(addresses, input)).toEqual({ value: { addresses: [] } });
    }
  });

  it('normalizes each row like its own form', () => {
    expect(
      validate(addresses, { addresses: [{ street: 'Main St', city: ' ', other: 1 }] }),
    ).toEqual({ value: { addresses: [{ street: 'Main St' }] } });
  });

  it('reports errors at plain key paths into rows', () => {
    expect(
      validate(addresses, { addresses: [{ street: 'Main St' }, { city: 'Hanoi' }, {}] }),
    ).toEqual({
      issues: [
        { message: 'Required', path: ['addresses', 1, 'street'] },
        { message: 'Required', path: ['addresses', 2, 'street'] },
      ],
    });
  });

  it('rejects a value that is not a list, and a row that is not an object', () => {
    expect(
      validate(addresses, { addresses: 'Main St' }).issues?.map((issue) => issue.path),
    ).toEqual([['addresses']]);
    expect(
      validate(addresses, { addresses: [{ street: 'Main St' }, 'High St', null] }).issues?.map(
        (issue) => issue.path,
      ),
    ).toEqual([
      ['addresses', 1],
      ['addresses', 2],
    ]);
  });

  it('nests: a Repeater inside a Repeater row, inside an object', () => {
    const orders = root(
      object('customer', [
        repeater('orders', [
          text('ref', { required: true }),
          repeater('lines', [text('sku', { required: true })], {
            rules: [{ type: 'min_items', requirement: 1, message: 'Add a line' }],
          }),
        ]),
      ]),
    );
    expect(validate(orders, {})).toEqual({ value: { customer: { orders: [] } } });
    expect(
      validate(orders, {
        customer: { orders: [{ ref: 'A', lines: [{ sku: 'x' }] }, { ref: 'B' }, { lines: [{}] }] },
      }),
    ).toEqual({
      issues: [
        { message: 'Add a line', path: ['customer', 'orders', 1, 'lines'] },
        { message: 'Required', path: ['customer', 'orders', 2, 'ref'] },
        { message: 'Required', path: ['customer', 'orders', 2, 'lines', 0, 'sku'] },
      ],
    });
    const valid = { customer: { orders: [{ ref: 'A', lines: [{ sku: 'x' }, { sku: 'y' }] }] } };
    expect(validate(orders, valid)).toEqual({ value: valid });
  });
});

describe('repeater: min_items and max_items', () => {
  const list = (rules: unknown[]) => root(repeater('items', [text('name')], { rules }));

  it('min_items counts rows and reports at the Repeater path', () => {
    const form = list([{ type: 'min_items', requirement: 2 }]);
    expect(validate(form, {})).toEqual({
      issues: [{ message: 'Invalid length: Expected >=2 but received 0', path: ['items'] }],
    });
    expect(validate(form, { items: [{ name: 'a' }] }).issues).toEqual([
      { message: 'Invalid length: Expected >=2 but received 1', path: ['items'] },
    ]);
    expect(validate(form, { items: [{}, {}] })).toEqual({ value: { items: [{}, {}] } });
  });

  it('max_items counts rows, even rows with no values', () => {
    const form = list([{ type: 'max_items', requirement: 1, message: 'One at most' }]);
    expect(validate(form, { items: [{ name: 'a' }] })).toEqual({
      value: { items: [{ name: 'a' }] },
    });
    expect(validate(form, { items: [{ name: 'a' }, {}] })).toEqual({
      issues: [{ message: 'One at most', path: ['items'] }],
    });
  });

  it('reports row errors and its own Rules together once every row is well formed', () => {
    const form = root(
      repeater('items', [text('name', { required: true })], {
        rules: [{ type: 'max_items', requirement: 1 }],
      }),
    );
    expect(validate(form, { items: [{ name: 'a' }, { name: 'b' }] }).issues).toEqual([
      { message: 'Invalid length: Expected <=1 but received 2', path: ['items'] },
    ]);
    expect(validate(form, { items: [{ name: 'a' }, {}] }).issues).toEqual([
      { message: 'Required', path: ['items', 1, 'name'] },
    ]);
  });
});

describe('object and repeater: round trip', () => {
  const definition = root(
    {
      type: 'section',
      columns: 2,
      components: [
        object('address', [text('street', { required: true }), text('city')], {
          label: 'Address',
          description: 'Where we deliver.',
          widget: 'address',
          colSpan: 2,
        }),
      ],
    },
    repeater(
      'contacts',
      [
        text('name', { required: true }),
        repeater('phones', [text('number', { required: true })], {
          label: 'Phones',
          rules: [{ type: 'max_items', requirement: 3 }],
        }),
      ],
      {
        label: 'Contacts',
        rules: [
          { type: 'min_items', requirement: 1, message: 'Add a contact' },
          { type: 'max_items', requirement: 5 },
        ],
      },
    ),
  );
  const inputs = [
    {},
    { address: { street: 'Main St' }, contacts: [{ name: 'Ada' }] },
    { address: { city: 'Hue' }, contacts: [{ name: 'Ada', phones: [{}, { number: '1' }] }] },
    { address: 'x', contacts: [{ name: ' ', other: 1 }, 5] },
  ];

  it('keeps every key of a stored Definition unchanged', () => {
    const stored = JSON.stringify(definition);
    expect(JSON.stringify(compile(JSON.parse(stored)).definition)).toBe(stored);
  });

  it('validates the same way after a JSON round trip', () => {
    const original = compile(definition);
    const restored = compile(JSON.parse(JSON.stringify(original.definition)));
    for (const input of inputs) {
      expect(restored['~standard'].validate(input)).toEqual(original['~standard'].validate(input));
    }
    expect(original['~standard'].validate(inputs[1])).toEqual({
      value: { address: { street: 'Main St' }, contacts: [{ name: 'Ada', phones: [] }] },
    });
  });

  it('freezes nested Components', () => {
    const contacts = compile(definition).definition.components![1] as RepeaterField;
    expect(Object.isFrozen(contacts)).toBe(true);
    expect(Object.isFrozen(contacts.components)).toBe(true);
    expect(Object.isFrozen(contacts.components[1])).toBe(true);
  });
});

describe('object and repeater: rejected on load', () => {
  it('has no required: both always keep their key', () => {
    for (const make of [object, repeater]) {
      expect(
        loadErrors(root(make('group', [text('a')], { required: true, requiredMessage: 'x' }))),
      ).toEqual([
        { message: 'Unknown key "required"', path: ['components', 0, 'required'] },
        { message: 'Unknown key "requiredMessage"', path: ['components', 0, 'requiredMessage'] },
      ]);
    }
  });

  it('needs a name and a non-empty list of components', () => {
    expect(loadErrors(root({ type: 'object' }))).toEqual([
      { message: 'Missing key "name"', path: ['components', 0, 'name'] },
      { message: 'Missing key "components"', path: ['components', 0, 'components'] },
    ]);
    expect(loadErrors(root(repeater('rows', [])))).toEqual([
      {
        message: 'A "repeater" needs at least one Component',
        path: ['components', 0, 'components'],
      },
    ]);
    expect(loadErrors(root(object('address', [])))).toEqual([
      { message: 'A "object" needs at least one Component', path: ['components', 0, 'components'] },
    ]);
  });

  it('checks its name like any Field name', () => {
    expect(
      loadErrors(root(object('__proto__', [text('a')]), repeater('1rows', [text('a')]))),
    ).toEqual([
      { message: 'Reserved name "__proto__"', path: ['components', 0, 'name'] },
      {
        message: 'A name is letters, digits and _, and does not start with a digit',
        path: ['components', 1, 'name'],
      },
    ]);
  });

  it('rejects keys that only a value Field or a Layout takes', () => {
    expect(
      loadErrors(root(object('a', [text('x')], { placeholder: 'p', columns: 2, rules: [] }))),
    ).toEqual([
      { message: 'Unknown key "placeholder"', path: ['components', 0, 'placeholder'] },
      { message: 'Unknown key "columns"', path: ['components', 0, 'columns'] },
      { message: 'Unknown key "rules"', path: ['components', 0, 'rules'] },
    ]);
  });

  it('takes only Rules that apply to a Repeater, each checked', () => {
    expect(
      loadErrors(
        root(
          repeater('rows', [text('x')], {
            rules: [
              { type: 'min_length', requirement: 1 },
              { type: 'min_items' },
              { type: 'max_items', requirement: -1 },
              { type: 'regex', requirement: '.' },
            ],
          }),
        ),
      ),
    ).toEqual([
      {
        message: 'Rule "min_length" does not apply to a "repeater" Field',
        path: ['components', 0, 'rules', 0, 'type'],
      },
      { message: 'Missing key "requirement"', path: ['components', 0, 'rules', 1, 'requirement'] },
      {
        message: 'Invalid value: Expected >=0 but received -1',
        path: ['components', 0, 'rules', 2, 'requirement'],
      },
      { message: 'Unknown Rule "regex"', path: ['components', 0, 'rules', 3, 'type'] },
    ]);
  });

  it('reports errors of nested Components at their nested path', () => {
    expect(
      loadErrors(root(repeater('rows', [object('a', [text('x', { requried: true })])]))),
    ).toEqual([
      {
        message: 'Unknown key "requried"',
        path: ['components', 0, 'components', 0, 'components', 0, 'requried'],
      },
    ]);
  });
});

describe('object and repeater: data scopes', () => {
  it('each object and each Repeater row is its own scope for name uniqueness', () => {
    const definition = root(
      text('name'),
      object('home', [text('name'), object('geo', [text('name')])]),
      object('work', [text('name')]),
      repeater('rows', [text('name'), repeater('rows', [text('name')])]),
    );
    expect(validate(definition, {})).toEqual({
      value: { home: { geo: {} }, work: {}, rows: [] },
    });
  });

  it('an object or Repeater name is unique in its parent scope', () => {
    expect(
      loadErrors(root(text('home'), object('home', [text('a')]), repeater('home', [text('a')]))),
    ).toEqual([
      { message: 'Duplicate name "home"', path: ['components', 1, 'name'] },
      { message: 'Duplicate name "home"', path: ['components', 2, 'name'] },
    ]);
  });

  it('a name is unique within one object or row, across its Layouts', () => {
    expect(
      loadErrors(
        root(
          object('home', [text('city'), { type: 'section', components: [text('city')] }]),
          repeater('rows', [
            {
              type: 'tabs',
              components: [
                { type: 'tab', label: 'A', components: [text('x')] },
                { type: 'tab', label: 'B', components: [text('x')] },
              ],
            },
          ]),
        ),
      ),
    ).toEqual([
      {
        message: 'Duplicate name "city"',
        path: ['components', 0, 'components', 1, 'components', 0, 'name'],
      },
      {
        message: 'Duplicate name "x"',
        path: ['components', 1, 'components', 0, 'components', 1, 'components', 0, 'name'],
      },
    ]);
  });
});
