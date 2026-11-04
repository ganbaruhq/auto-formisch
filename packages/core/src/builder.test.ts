import { describe, expect, it } from 'vite-plus/test';
import {
  accepted,
  all,
  any,
  boolean,
  choice,
  colSpan,
  columns,
  compile,
  contains,
  content,
  date,
  defaultValue,
  DefinitionError,
  description,
  disabled,
  email,
  eq,
  form,
  grid,
  gt,
  gte,
  integer,
  isEmpty,
  isIn,
  label,
  lt,
  lte,
  maxItems,
  maxLength,
  maxValue,
  minItems,
  minLength,
  minValue,
  multiChoice,
  neq,
  not,
  notEmpty,
  notIn,
  number,
  object,
  placeholder,
  repeater,
  required,
  section,
  tab,
  tabs,
  text,
  url,
  visible,
  widget,
  type FormError,
} from './index';

/** Builder output must survive storage as JSON unchanged. */
const throughJson = (value: unknown) => JSON.parse(JSON.stringify(value));

/** The load errors `build` throws; fails if it throws nothing. */
function errorsOf(build: () => unknown): readonly FormError[] {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

describe('form', () => {
  it('builds the plain Definition that JSON would hold', () => {
    const built = form([text('name')]);
    const json = { version: 1, components: [{ type: 'text', name: 'name' }] };
    expect(built).toEqual(json);
    expect(throughJson(built)).toEqual(built);
  });

  it('throws the errors loading the same JSON throws, such as a broken Condition reference', () => {
    const json = {
      version: 1,
      components: [
        { type: 'text', name: 'taxId', visible: { field: 'country', operator: 'eq', value: 'VN' } },
      ],
    };
    const errors = errorsOf(() => form([text('taxId', [visible(eq('country', 'VN'))])]));
    expect(errors).toEqual([
      { message: 'No Field "country"', path: ['components', 0, 'visible', 'field'] },
    ]);
    expect(errorsOf(() => compile(json))).toEqual(errors);
  });

  it('reports every error at once, with the same paths as JSON', () => {
    const errors = errorsOf(() =>
      form([
        text('name'),
        text('name'),
        section([text('note', [colSpan(2)])]),
        repeater('rows', [text('x', [visible(eq('../missing', 'a'))])]),
        text('a', [disabled(eq('b', 'x'))]),
        text('b', [disabled(eq('a', 'x'))]),
      ]),
    );
    expect(errors).toEqual([
      { message: 'Duplicate name "name"', path: ['components', 1, 'name'] },
      {
        message: '"colSpan" needs "columns" on its parent',
        path: ['components', 2, 'components', 0, 'colSpan'],
      },
      {
        message: 'No Field "missing"',
        path: ['components', 3, 'components', 0, 'visible', 'field'],
      },
      {
        message: 'A Condition cycle through "visible" or "disabled": "a" -> "b" -> "a"',
        path: ['components', 4],
      },
    ]);
  });

  it('returns frozen data and leaves the built Components unfrozen', () => {
    const field = text('tags');
    const built = form([field]);
    expect(Object.isFrozen(built.components[0])).toBe(true);
    expect(Object.isFrozen(field)).toBe(false);
  });
});

describe('Components, Rules, metadata and Conditions', () => {
  const built = form([
    section('Contact', [
      grid(2, [
        text('name', [label('Full name'), placeholder('Ada'), required('Enter a name')]),
        text('email', [email('Not an email'), required(), colSpan(2)]),
      ]),
    ]),
    choice(
      'country',
      ['VN', { value: 'US', label: 'United States' }],
      [widget('radio'), defaultValue('VN')],
    ),
    text('taxId', [
      visible(all(eq('country', 'VN'), notEmpty('name'))),
      required(gt('age', 17), 'Needed for adults'),
      minLength(5),
      maxLength(12),
    ]),
    number('age', [integer(), minValue(0), maxValue(130), description('In years')]),
    boolean('terms', [accepted('Please accept')]),
    multiChoice('tags', ['news', 'offers'], [minItems(1), maxItems(2)]),
    date('start', [minValue('2024-01-01'), maxValue('2030-12-31'), required(isEmpty('age'))]),
    text('site', [url(), widget('text')]),
    object(
      'address',
      [text('street'), text('city', [required(notEmpty('street'))])],
      [disabled(neq('country', 'VN'))],
    ),
    repeater(
      'pets',
      [
        choice('kind', ['cat', 'fish']),
        number('legs', [disabled(any(eq('kind', 'fish'), isIn('../country', ['US'])))]),
      ],
      [minItems(1), label('Pets')],
    ),
    tabs([
      tab('More', [text('notes', [visible(not(contains('tags', 'news')))])], [columns(1)]),
      tab('Even more', [
        text('a', [disabled(notIn('country', ['VN']))]),
        text('b', [visible(gte('age', 1)), disabled(lt('age', 0)), required(lte('age', 9))]),
      ]),
    ]),
    content('Thank you', [visible(eq('terms', true))]),
  ]);

  const json = {
    version: 1,
    components: [
      {
        type: 'section',
        label: 'Contact',
        components: [
          {
            type: 'section',
            columns: 2,
            components: [
              {
                type: 'text',
                name: 'name',
                label: 'Full name',
                placeholder: 'Ada',
                required: true,
                requiredMessage: 'Enter a name',
              },
              {
                type: 'text',
                name: 'email',
                widget: 'email',
                required: true,
                colSpan: 2,
                rules: [{ type: 'email', message: 'Not an email' }],
              },
            ],
          },
        ],
      },
      {
        type: 'choice',
        name: 'country',
        choices: ['VN', { value: 'US', label: 'United States' }],
        widget: 'radio',
        default: 'VN',
      },
      {
        type: 'text',
        name: 'taxId',
        visible: {
          all: [
            { field: 'country', operator: 'eq', value: 'VN' },
            { field: 'name', operator: 'not_empty' },
          ],
        },
        required: { field: 'age', operator: 'gt', value: 17 },
        requiredMessage: 'Needed for adults',
        rules: [
          { type: 'min_length', requirement: 5 },
          { type: 'max_length', requirement: 12 },
        ],
      },
      {
        type: 'number',
        name: 'age',
        description: 'In years',
        rules: [
          { type: 'integer' },
          { type: 'min_value', requirement: 0 },
          { type: 'max_value', requirement: 130 },
        ],
      },
      { type: 'boolean', name: 'terms', rules: [{ type: 'accepted', message: 'Please accept' }] },
      {
        type: 'multi_choice',
        name: 'tags',
        choices: ['news', 'offers'],
        rules: [
          { type: 'min_items', requirement: 1 },
          { type: 'max_items', requirement: 2 },
        ],
      },
      {
        type: 'date',
        name: 'start',
        required: { field: 'age', operator: 'empty' },
        rules: [
          { type: 'min_value', requirement: '2024-01-01' },
          { type: 'max_value', requirement: '2030-12-31' },
        ],
      },
      { type: 'text', name: 'site', widget: 'text', rules: [{ type: 'url' }] },
      {
        type: 'object',
        name: 'address',
        disabled: { field: 'country', operator: 'neq', value: 'VN' },
        components: [
          { type: 'text', name: 'street' },
          {
            type: 'text',
            name: 'city',
            required: { field: 'street', operator: 'not_empty' },
          },
        ],
      },
      {
        type: 'repeater',
        name: 'pets',
        label: 'Pets',
        rules: [{ type: 'min_items', requirement: 1 }],
        components: [
          { type: 'choice', name: 'kind', choices: ['cat', 'fish'] },
          {
            type: 'number',
            name: 'legs',
            disabled: {
              any: [
                { field: 'kind', operator: 'eq', value: 'fish' },
                { field: '../country', operator: 'in', value: ['US'] },
              ],
            },
          },
        ],
      },
      {
        type: 'tabs',
        components: [
          {
            type: 'tab',
            label: 'More',
            columns: 1,
            components: [
              {
                type: 'text',
                name: 'notes',
                visible: { not: { field: 'tags', operator: 'contains', value: 'news' } },
              },
            ],
          },
          {
            type: 'tab',
            label: 'Even more',
            components: [
              {
                type: 'text',
                name: 'a',
                disabled: { field: 'country', operator: 'not_in', value: ['VN'] },
              },
              {
                type: 'text',
                name: 'b',
                visible: { field: 'age', operator: 'gte', value: 1 },
                disabled: { field: 'age', operator: 'lt', value: 0 },
                required: { field: 'age', operator: 'lte', value: 9 },
              },
            ],
          },
        ],
      },
      {
        type: 'content',
        text: 'Thank you',
        visible: { field: 'terms', operator: 'eq', value: true },
      },
    ],
  };

  it('deep-equals the equivalent JSON Definition and survives JSON serialization', () => {
    expect(built).toEqual(json);
    expect(throughJson(built)).toEqual(json);
    expect(compile(throughJson(built)).definition).toEqual(json);
  });

  it('validates exactly as the JSON Definition does', () => {
    const fromBuilder = compile(built)['~standard'];
    const fromJson = compile(json)['~standard'];
    const inputs = [
      {},
      { name: 'Ada', email: 'ada@example.com', country: 'VN', age: 30, terms: true },
      { email: 'nope', country: 'VN', name: 'Ada', age: 30, taxId: '123' },
      { country: 'US', address: { street: 'Main' }, pets: [{ kind: 'fish', legs: 4 }] },
      { start: '2020-01-01', tags: ['news', 'offers', 'news'], site: 'example' },
    ];
    for (const input of inputs) {
      expect(fromBuilder.validate(input)).toEqual(fromJson.validate(input));
    }
    expect(fromBuilder.validate(inputs[2])).toMatchObject({
      issues: expect.arrayContaining([
        { message: 'Not an email', path: ['email'] },
        { message: 'Invalid length: Expected >=5 but received 3', path: ['taxId'] },
      ]),
    });
  });
});

describe('pipe items', () => {
  it('set required, with or without a Condition and a message', () => {
    expect([
      text('a', [required()]),
      text('b', [required('Say something')]),
      text('c', [required(notEmpty('a'))]),
      text('d', [required(notEmpty('a'), 'Say d')]),
    ]).toEqual([
      { type: 'text', name: 'a', required: true },
      { type: 'text', name: 'b', required: true, requiredMessage: 'Say something' },
      { type: 'text', name: 'c', required: { field: 'a', operator: 'not_empty' } },
      {
        type: 'text',
        name: 'd',
        required: { field: 'a', operator: 'not_empty' },
        requiredMessage: 'Say d',
      },
    ]);
  });

  it('set disabled always, or by a Condition', () => {
    expect([text('a', [disabled()]), text('b', [disabled(isEmpty('a'))])]).toEqual([
      { type: 'text', name: 'a', disabled: true },
      { type: 'text', name: 'b', disabled: { field: 'a', operator: 'empty' } },
    ]);
  });

  it('apply in order, so a later key wins and Rules add up', () => {
    expect(text('a', [label('One'), minLength(1), label('Two'), maxLength(9)])).toEqual({
      type: 'text',
      name: 'a',
      label: 'Two',
      rules: [
        { type: 'min_length', requirement: 1 },
        { type: 'max_length', requirement: 9 },
      ],
    });
  });

  it('give email and url their Widget only when the pipe names none', () => {
    expect(text('a', [email()])).toMatchObject({ widget: 'email' });
    expect(text('b', [url()])).toMatchObject({ widget: 'url' });
    expect(text('c', [widget('textarea'), email()])).toMatchObject({ widget: 'textarea' });
    expect(text('d', [email(), widget('textarea')])).toMatchObject({ widget: 'textarea' });
  });

  it('build section with or without a label, and grid as a section with columns', () => {
    expect([section([text('a')]), grid(3, [text('b')], [label('Grid')])]).toEqual([
      { type: 'section', components: [{ type: 'text', name: 'a' }] },
      { type: 'section', columns: 3, label: 'Grid', components: [{ type: 'text', name: 'b' }] },
    ]);
  });
});
