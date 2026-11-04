import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, type FormError } from './index';

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

/** A Definition with one Field named `value`. */
const one = (type: string, field: object = {}) => ({
  version: 1,
  components: [{ type, name: 'value', ...field }],
});

describe('number Field', () => {
  it('accepts a finite number, including 0, and returns it', () => {
    for (const value of [0, -1.5, 42]) {
      expect(validate(one('number'), { value })).toEqual({ value: { value } });
    }
  });

  it('treats 0 as a value of a required Field', () => {
    expect(validate(one('number', { required: true }), { value: 0 })).toEqual({
      value: { value: 0 },
    });
  });

  it('drops an empty value and reports Required when required', () => {
    expect(validate(one('number'), { value: null })).toEqual({ value: {} });
    expect(validate(one('number', { required: true }), {})).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('rejects a numeric string, NaN and Infinity', () => {
    expect(validate(one('number'), { value: '5' })).toEqual({
      issues: [{ message: 'Invalid type: Expected number but received "5"', path: ['value'] }],
    });
    for (const value of [Number.NaN, Infinity]) {
      expect(validate(one('number'), { value }).issues?.map((issue) => issue.path)).toEqual([
        ['value'],
      ]);
    }
  });

  it('takes a placeholder', () => {
    expect(compile(one('number', { placeholder: 'Age' })).definition.components[0]).toMatchObject({
      placeholder: 'Age',
    });
  });
});

describe('Rules on a number Field', () => {
  it('integer rejects a fraction', () => {
    const definition = one('number', { rules: [{ type: 'integer', message: 'Whole numbers' }] });
    expect(validate(definition, { value: 3 })).toEqual({ value: { value: 3 } });
    expect(validate(definition, { value: 3.5 })).toEqual({
      issues: [{ message: 'Whole numbers', path: ['value'] }],
    });
  });

  it('min_value and max_value bound the value, inclusive', () => {
    const definition = one('number', {
      rules: [
        { type: 'min_value', requirement: 0, message: 'Too small' },
        { type: 'max_value', requirement: 10 },
      ],
    });
    for (const value of [0, 10]) {
      expect(validate(definition, { value })).toEqual({ value: { value } });
    }
    expect(validate(definition, { value: -1 })).toEqual({
      issues: [{ message: 'Too small', path: ['value'] }],
    });
    expect(validate(definition, { value: 11 })).toEqual({
      issues: [{ message: 'Invalid value: Expected <=10 but received 11', path: ['value'] }],
    });
  });

  it('skips Rules on an empty value', () => {
    const definition = one('number', { rules: [{ type: 'min_value', requirement: 5 }] });
    expect(validate(definition, {})).toEqual({ value: {} });
  });

  it('takes a finite number as the requirement of min_value and max_value', () => {
    const at = ['components', 0, 'rules', 0, 'requirement'];
    for (const requirement of ['5', '2026-01-01', Infinity, null]) {
      for (const type of ['min_value', 'max_value']) {
        const errors = loadErrors(one('number', { rules: [{ type, requirement }] }));
        expect(errors.map((error) => error.path)).toEqual([at]);
      }
    }
  });

  it('rejects integer with a requirement', () => {
    expect(loadErrors(one('number', { rules: [{ type: 'integer', requirement: 1 }] }))).toEqual([
      {
        message: 'Rule "integer" takes no requirement',
        path: ['components', 0, 'rules', 0, 'requirement'],
      },
    ]);
  });
});

describe('boolean Field', () => {
  it('accepts true and false, and false is not empty', () => {
    for (const value of [true, false]) {
      expect(validate(one('boolean', { required: true }), { value })).toEqual({
        value: { value },
      });
    }
  });

  it('drops an empty value and reports Required when required', () => {
    expect(validate(one('boolean'), {})).toEqual({ value: {} });
    expect(validate(one('boolean', { required: true }), { value: null })).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('rejects anything but a boolean', () => {
    expect(validate(one('boolean'), { value: 'true' })).toEqual({
      issues: [{ message: 'Invalid type: Expected boolean but received "true"', path: ['value'] }],
    });
  });

  it('accepted requires true', () => {
    const definition = one('boolean', {
      required: true,
      rules: [{ type: 'accepted', message: 'Accept the terms' }],
    });
    expect(validate(definition, { value: true })).toEqual({ value: { value: true } });
    expect(validate(definition, { value: false })).toEqual({
      issues: [{ message: 'Accept the terms', path: ['value'] }],
    });
    expect(validate(definition, {})).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('does not take a placeholder', () => {
    expect(loadErrors(one('boolean', { placeholder: 'x' }))).toEqual([
      { message: 'Unknown key "placeholder"', path: ['components', 0, 'placeholder'] },
    ]);
  });
});

describe('choice Field', () => {
  const countries = one('choice', { choices: ['US', { value: 'VN', label: 'Viet Nam' }] });

  it('accepts a listed value, given as a primitive or as {value, label}', () => {
    for (const value of ['US', 'VN']) {
      expect(validate(countries, { value })).toEqual({ value: { value } });
    }
  });

  it('rejects a value outside the list', () => {
    expect(validate(countries, { value: 'FR' })).toEqual({
      issues: [
        { message: 'Invalid type: Expected ("US" | "VN") but received "FR"', path: ['value'] },
      ],
    });
    expect(validate(countries, { value: 'Viet Nam' }).issues?.[0].path).toEqual(['value']);
  });

  it('keeps number values as numbers', () => {
    const sizes = one('choice', { choices: [1, { value: 2, label: 'Two' }] });
    expect(validate(sizes, { value: 2 })).toEqual({ value: { value: 2 } });
    expect(validate(sizes, { value: '2' }).issues?.[0].path).toEqual(['value']);
  });

  it('drops an empty value and reports Required when required', () => {
    expect(validate(countries, { value: '' })).toEqual({ value: {} });
    const required = one('choice', { choices: ['US'], required: true });
    expect(validate(required, { value: ' ' })).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('takes a placeholder', () => {
    expect(loadErrors(one('choice', { choices: ['US'], placeholder: 5 }))).toEqual([
      {
        message: 'Invalid type: Expected string but received 5',
        path: ['components', 0, 'placeholder'],
      },
    ]);
  });
});

describe('choices', () => {
  const at = (...path: (string | number)[]) => ['components', 0, 'choices', ...path];
  const errorsOf = (choices: unknown) => loadErrors(one('choice', { choices }));

  it('is required', () => {
    expect(loadErrors(one('choice'))).toEqual([{ message: 'Missing key "choices"', path: at() }]);
  });

  it('is a non-empty array', () => {
    expect(errorsOf('US')).toEqual([{ message: 'Expected an array', path: at() }]);
    expect(errorsOf([])).toEqual([{ message: 'Expected at least one choice', path: at() }]);
  });

  it('holds strings, finite numbers or {value, label?}', () => {
    for (const choice of [true, null, Infinity, ['US'], { label: 'US' }]) {
      expect(errorsOf([choice]).map((error) => error.path)).toEqual([
        Object.hasOwn(Object(choice), 'label') ? at(0, 'value') : at(0),
      ]);
    }
    expect(errorsOf([{ value: 'US', lable: 'United States' }])).toEqual([
      { message: 'Unknown key "lable"', path: at(0, 'lable') },
    ]);
    expect(errorsOf([{ value: 'US', label: 5 }])).toEqual([
      { message: 'Expected a string', path: at(0, 'label') },
    ]);
  });

  it('rejects an empty value, which could never be submitted', () => {
    expect(errorsOf(['US', ' '])).toEqual([
      { message: 'A choice value cannot be empty', path: at(1) },
    ]);
    expect(errorsOf([{ value: '' }])).toEqual([
      { message: 'A choice value cannot be empty', path: at(0, 'value') },
    ]);
  });

  it('rejects a duplicate value, however it is written', () => {
    expect(errorsOf(['US', { value: 'US', label: 'United States' }])).toEqual([
      { message: 'Duplicate choice value "US"', path: at(1, 'value') },
    ]);
    expect(errorsOf([1, 1])).toEqual([{ message: 'Duplicate choice value 1', path: at(1) }]);
  });

  it('does not mix string and number values', () => {
    expect(errorsOf(['1', 2, { value: 3 }])).toEqual([
      { message: 'Choice values are all strings or all numbers', path: at(1) },
      { message: 'Choice values are all strings or all numbers', path: at(2, 'value') },
    ]);
  });
});

describe('multi_choice Field', () => {
  const tags = one('multi_choice', { choices: ['a', 'b', { value: 'c', label: 'C' }] });

  it('accepts listed values and returns them in the order given', () => {
    expect(validate(tags, { value: ['c', 'a'] })).toEqual({ value: { value: ['c', 'a'] } });
  });

  it('treats [] as empty: the key is dropped, or Required when required', () => {
    expect(validate(tags, { value: [] })).toEqual({ value: {} });
    const required = one('multi_choice', { choices: ['a'], required: true });
    expect(validate(required, { value: [] })).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('reports an unlisted value on the Field itself', () => {
    expect(validate(tags, { value: ['a', 'x'] })).toEqual({
      issues: [
        { message: 'Invalid type: Expected ("a" | "b" | "c") but received "x"', path: ['value'] },
      ],
    });
  });

  it('rejects a value that is not an array, and a repeated value', () => {
    expect(validate(tags, { value: 'a' })).toEqual({
      issues: [{ message: 'Invalid type: Expected Array but received "a"', path: ['value'] }],
    });
    expect(validate(tags, { value: ['a', 'a'] })).toEqual({
      issues: [{ message: 'Duplicate value "a"', path: ['value'] }],
    });
  });

  it('keeps number values as numbers', () => {
    const sizes = one('multi_choice', { choices: [1, 2] });
    expect(validate(sizes, { value: [2, 1] })).toEqual({ value: { value: [2, 1] } });
    expect(validate(sizes, { value: ['1'] }).issues?.map((issue) => issue.path)).toEqual([
      ['value'],
    ]);
  });

  it('requires choices', () => {
    expect(loadErrors(one('multi_choice'))).toEqual([
      { message: 'Missing key "choices"', path: ['components', 0, 'choices'] },
    ]);
  });

  it('min_items and max_items bound how many are chosen', () => {
    const definition = one('multi_choice', {
      choices: ['a', 'b', 'c'],
      rules: [
        { type: 'min_items', requirement: 2, message: 'Pick at least two' },
        { type: 'max_items', requirement: 2 },
      ],
    });
    expect(validate(definition, { value: ['a', 'b'] })).toEqual({ value: { value: ['a', 'b'] } });
    expect(validate(definition, { value: ['a'] })).toEqual({
      issues: [{ message: 'Pick at least two', path: ['value'] }],
    });
    expect(validate(definition, { value: ['a', 'b', 'c'] })).toEqual({
      issues: [{ message: 'Invalid length: Expected <=2 but received 3', path: ['value'] }],
    });
    expect(validate(definition, { value: [] })).toEqual({ value: {} });
  });

  it('takes a non-negative integer as the requirement of min_items and max_items', () => {
    for (const requirement of [-1, 1.5, '2']) {
      for (const type of ['min_items', 'max_items']) {
        const errors = loadErrors(
          one('multi_choice', { choices: ['a'], rules: [{ type, requirement }] }),
        );
        expect(errors.map((error) => error.path)).toEqual([
          ['components', 0, 'rules', 0, 'requirement'],
        ]);
      }
    }
  });
});

describe('date Field', () => {
  it('accepts a YYYY-MM-DD calendar date and returns the string', () => {
    for (const value of ['2026-11-04', '2024-02-29']) {
      expect(validate(one('date'), { value })).toEqual({ value: { value } });
    }
  });

  it('rejects any other string, a date that does not exist, and a Date object', () => {
    for (const value of ['2026-11-4', '04/11/2026', '2026-11-04T10:00', '2026-13-01']) {
      expect(validate(one('date'), { value })).toEqual({
        issues: [{ message: `Invalid date: Received "${value}"`, path: ['value'] }],
      });
    }
    for (const value of ['2026-02-29', '2026-04-31']) {
      expect(validate(one('date'), { value })).toEqual({
        issues: [{ message: `Invalid date: Received "${value}"`, path: ['value'] }],
      });
    }
    expect(validate(one('date'), { value: new Date() }).issues?.[0].path).toEqual(['value']);
  });

  it('drops an empty value and reports Required when required', () => {
    expect(validate(one('date'), { value: '' })).toEqual({ value: {} });
    expect(validate(one('date', { required: true }), {})).toEqual({
      issues: [{ message: 'Required', path: ['value'] }],
    });
  });

  it('min_value and max_value bound the date, inclusive', () => {
    const definition = one('date', {
      rules: [
        { type: 'min_value', requirement: '2026-01-01', message: 'Too early' },
        { type: 'max_value', requirement: '2026-12-31' },
      ],
    });
    for (const value of ['2026-01-01', '2026-12-31']) {
      expect(validate(definition, { value })).toEqual({ value: { value } });
    }
    expect(validate(definition, { value: '2025-12-31' })).toEqual({
      issues: [{ message: 'Too early', path: ['value'] }],
    });
    expect(validate(definition, { value: '2027-01-01' })).toEqual({
      issues: [
        {
          message: 'Invalid value: Expected <="2026-12-31" but received "2027-01-01"',
          path: ['value'],
        },
      ],
    });
  });

  it('takes a YYYY-MM-DD date as the requirement of min_value and max_value', () => {
    for (const requirement of [20260101, '2026-1-1', '2026-02-30', null]) {
      for (const type of ['min_value', 'max_value']) {
        const errors = loadErrors(one('date', { rules: [{ type, requirement }] }));
        expect(errors.map((error) => error.path)).toEqual([
          ['components', 0, 'rules', 0, 'requirement'],
        ]);
      }
    }
  });
});

describe('url Rule', () => {
  const definition = one('text', { rules: [{ type: 'url', message: 'Enter a URL' }] });

  it('accepts an absolute URL', () => {
    for (const value of ['https://example.com/a?b=c', 'mailto:ada@example.com']) {
      expect(validate(definition, { value })).toEqual({ value: { value } });
    }
  });

  it('rejects anything else', () => {
    for (const value of ['example.com', '/relative', 'not a url']) {
      expect(validate(definition, { value })).toEqual({
        issues: [{ message: 'Enter a URL', path: ['value'] }],
      });
    }
  });

  it('takes no requirement', () => {
    expect(loadErrors(one('text', { rules: [{ type: 'url', requirement: 'https' }] }))).toEqual([
      {
        message: 'Rule "url" takes no requirement',
        path: ['components', 0, 'rules', 0, 'requirement'],
      },
    ]);
  });
});

/** One Field of every built-in value type, using every key and Rule each takes. */
const everyType = {
  version: 1,
  components: [
    {
      type: 'text',
      name: 'website',
      label: 'Website',
      placeholder: 'https://',
      rules: [
        { type: 'url', message: 'Enter a URL' },
        { type: 'max_length', requirement: 200 },
      ],
    },
    {
      type: 'number',
      name: 'age',
      label: 'Age',
      description: 'In years',
      placeholder: '18',
      required: true,
      requiredMessage: 'Enter your age',
      rules: [
        { type: 'integer' },
        { type: 'min_value', requirement: 18 },
        { type: 'max_value', requirement: 130 },
      ],
    },
    {
      type: 'boolean',
      name: 'terms',
      label: 'I accept the terms',
      widget: 'checkbox',
      required: true,
      rules: [{ type: 'accepted', message: 'Accept the terms' }],
    },
    {
      type: 'choice',
      name: 'country',
      placeholder: 'Pick one',
      choices: ['US', { value: 'VN', label: 'Viet Nam' }],
    },
    {
      type: 'multi_choice',
      name: 'sizes',
      choices: [{ value: 1, label: 'Small' }, 2, 3],
      rules: [
        { type: 'min_items', requirement: 1 },
        { type: 'max_items', requirement: 2 },
      ],
    },
    {
      type: 'date',
      name: 'start',
      rules: [
        { type: 'min_value', requirement: '2026-01-01' },
        { type: 'max_value', requirement: '2026-12-31', message: 'This year only' },
      ],
    },
  ],
};

const inputs = [
  {},
  { age: 0, terms: false },
  { age: 30, terms: true },
  {
    website: 'example',
    age: 17.5,
    terms: true,
    country: 'FR',
    sizes: [1, 2, 3],
    start: '2027-01-01',
  },
  { website: 'https://a.b', age: 30, terms: true, country: 'VN', sizes: [3], start: '2026-06-30' },
  { age: '30', terms: 'yes', country: ['US'], sizes: 1, start: '2026-02-30' },
];

describe('Form Definition with every value Field Type: round trip', () => {
  it('keeps every key of a stored Definition unchanged', () => {
    const stored = JSON.stringify(everyType);
    expect(JSON.stringify(compile(JSON.parse(stored)).definition)).toBe(stored);
  });

  it('validates the same way after a JSON round trip', () => {
    const original = compile(everyType);
    const restored = compile(JSON.parse(JSON.stringify(original.definition)));
    for (const input of inputs) {
      expect(restored['~standard'].validate(input)).toEqual(original['~standard'].validate(input));
    }
  });

  it('validates every Field at once, each error on its own path', () => {
    expect(validate(everyType, inputs[2])).toEqual({ value: { age: 30, terms: true } });
    expect(validate(everyType, inputs[4])).toEqual({ value: inputs[4] });
    expect(validate(everyType, inputs[3]).issues?.map((issue) => issue.path.join('.'))).toEqual([
      'website',
      'age',
      'age',
      'country',
      'sizes',
      'start',
    ]);
  });
});

describe('Form Definition with value Field Types: rejected on load', () => {
  it('checks the name of every Field Type', () => {
    for (const component of everyType.components) {
      for (const name of ['constructor', '1a']) {
        const errors = loadErrors({ version: 1, components: [{ ...component, name }] });
        expect(errors.map((error) => error.path)).toEqual([['components', 0, 'name']]);
      }
    }
  });

  it('keeps names unique across Field Types', () => {
    expect(
      loadErrors({
        version: 1,
        components: [
          { type: 'number', name: 'value' },
          { type: 'date', name: 'value' },
        ],
      }),
    ).toEqual([{ message: 'Duplicate name "value"', path: ['components', 1, 'name'] }]);
  });

  it('reports every problem at once, each with its path', () => {
    expect(
      loadErrors({
        version: 1,
        components: [
          {
            type: 'number',
            name: 'age',
            rules: [{ type: 'email' }, { type: 'min_value', requirement: '1' }],
          },
          { type: 'boolean', name: 'age', placeholder: 'x' },
          { type: 'choice', name: 'country', choices: ['US', 'US', 1] },
          { type: 'multi_choice', name: 'tags' },
          {
            type: 'date',
            name: 'start',
            rules: [{ type: 'max_value', requirement: '2026-02-30' }],
          },
        ],
      }),
    ).toEqual([
      {
        message: 'Rule "email" does not apply to a "number" Field',
        path: ['components', 0, 'rules', 0, 'type'],
      },
      {
        message: 'Invalid type: Expected number but received "1"',
        path: ['components', 0, 'rules', 1, 'requirement'],
      },
      { message: 'Unknown key "placeholder"', path: ['components', 1, 'placeholder'] },
      { message: 'Duplicate name "age"', path: ['components', 1, 'name'] },
      { message: 'Duplicate choice value "US"', path: ['components', 2, 'choices', 1] },
      {
        message: 'Choice values are all strings or all numbers',
        path: ['components', 2, 'choices', 2],
      },
      { message: 'Missing key "choices"', path: ['components', 3, 'choices'] },
      {
        message: 'Invalid date: Received "2026-02-30"',
        path: ['components', 4, 'rules', 0, 'requirement'],
      },
    ]);
  });
});

describe('a Rule on a Field Type it does not apply to', () => {
  const cases: [fieldType: string, rule: { type: string; requirement?: unknown }][] = [
    ['text', { type: 'integer' }],
    ['text', { type: 'min_value', requirement: 1 }],
    ['number', { type: 'email' }],
    ['number', { type: 'url' }],
    ['date', { type: 'url' }],
    ['number', { type: 'min_length', requirement: 1 }],
    ['number', { type: 'accepted' }],
    ['text', { type: 'accepted' }],
    ['boolean', { type: 'email' }],
    ['boolean', { type: 'integer' }],
    ['boolean', { type: 'min_value', requirement: 1 }],
    ['text', { type: 'min_items', requirement: 1 }],
    ['number', { type: 'max_items', requirement: 1 }],
    ['multi_choice', { type: 'min_length', requirement: 1 }],
    ['multi_choice', { type: 'accepted' }],
    ['date', { type: 'integer' }],
    ['date', { type: 'min_length', requirement: 1 }],
    ['choice', { type: 'email' }],
    ['choice', { type: 'min_items', requirement: 1 }],
  ];

  for (const [fieldType, rule] of cases) {
    it(`rejects ${rule.type} on a ${fieldType} Field`, () => {
      const choices = fieldType.endsWith('choice') ? { choices: ['a'] } : {};
      expect(loadErrors(one(fieldType, { ...choices, rules: [rule] }))).toEqual([
        {
          message: `Rule "${rule.type}" does not apply to a "${fieldType}" Field`,
          path: ['components', 0, 'rules', 0, 'type'],
        },
      ]);
    });
  }
});
