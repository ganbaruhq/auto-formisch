// Type tests for the Fluent Builder: `pnpm typecheck` checks the
// `expectTypeOf` and `@ts-expect-error` lines; the runtime tests only keep
// this file in the suite and make sure each negative case is a real call.
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import {
  accepted,
  all,
  boolean,
  choice,
  colSpan,
  columns,
  compile,
  content,
  date,
  defaultValue,
  description,
  disabled,
  email,
  eq,
  form,
  grid,
  gt,
  integer,
  isIn,
  label,
  maxItems,
  minItems,
  minLength,
  minValue,
  multiChoice,
  notEmpty,
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
  type CompiledForm,
  type InferOutput,
} from './index';

describe('output inference', () => {
  const signup = form([
    section('Contact', [
      grid(2, [
        text('name', [label('Full name'), required()]),
        text('email', [email(), required('Enter your email')]),
      ]),
    ]),
    choice('country', ['VN', { value: 'US', label: 'United States' }], [required()]),
    text('taxId', [required(), visible(eq('country', 'VN'))]),
    number('age', [integer()]),
    boolean('newsletter'),
    multiChoice('tags', ['news', 'offers']),
    date('birthday', [required(gt('age', 18))]),
    object('address', [text('street', [required()]), text('city')], [visible(notEmpty('country'))]),
    repeater('pets', [text('kind', [required()]), number('legs', [disabled(eq('kind', 'fish'))])]),
    tabs([tab('More', [text('notes', [required()])], [visible(eq('country', 'US'))])]),
    content('Thank you'),
  ]);

  type Signup = {
    name: string;
    email: string;
    country: 'VN' | 'US';
    taxId?: string;
    age?: number;
    newsletter?: boolean;
    tags?: ('news' | 'offers')[];
    birthday?: string;
    address: { street?: string; city?: string };
    pets: { kind: string; legs?: number }[];
    notes?: string;
  };

  it('infers the output of form() and compile()', () => {
    expectTypeOf<InferOutput<typeof signup>>().toEqualTypeOf<Signup>();
    expectTypeOf(compile(signup)).toEqualTypeOf<CompiledForm<Signup>>();
    expect(compile(signup).definition).toEqual(signup);
  });

  it('makes a required Field optional when a Condition or setting may make it Inactive', () => {
    const conditional = form([
      text('driver'),
      text('shown', [required(), visible(notEmpty('driver'))]),
      text('off', [required(), disabled()]),
      text('sometimes', [required(notEmpty('driver'))]),
      section([text('inSection', [required()])], [visible(notEmpty('driver'))]),
      object('group', [text('inObject', [required()])], [disabled(notEmpty('driver'))]),
      repeater('rows', [text('inRow', [required()])], [visible(notEmpty('driver'))]),
    ]);
    expectTypeOf<InferOutput<typeof conditional>>().toEqualTypeOf<{
      driver?: string;
      shown?: string;
      off?: string;
      sometimes?: string;
      inSection?: string;
      group: { inObject?: string };
      rows: { inRow?: string }[];
    }>();
  });

  it('types number choices and a JSON Definition', () => {
    const sizes = form([choice('size', [1, 2, 3], [required()]), multiChoice('extra', [10, 20])]);
    expectTypeOf<InferOutput<typeof sizes>>().toEqualTypeOf<{
      size: 1 | 2 | 3;
      extra?: (10 | 20)[];
    }>();
    // Loaded JSON has no type to infer from.
    expectTypeOf(compile({ version: 1, components: [] })).toEqualTypeOf<CompiledForm>();
  });
});

describe('pipe items are typed by the Field they sit on', () => {
  it('accepts every item where its JSON key or Rule applies', () => {
    const fine = form([
      text('a', [
        label('A'),
        description('About A'),
        placeholder('a'),
        widget('textarea'),
        url(),
        minLength(1),
        defaultValue('https://example.com'),
      ]),
      number('b', [minValue(0), defaultValue(1)]),
      date('c', [minValue('2024-01-01'), defaultValue('2024-02-02')]),
      boolean('d', [accepted(), defaultValue(true)]),
      choice('e', ['x', 'y'], [placeholder('Pick'), defaultValue('x')]),
      multiChoice('f', ['x', 'y'], [minItems(1), defaultValue(['y'])]),
      repeater('g', [text('h')], [minItems(1), maxItems(3), label('G')]),
      section([text('i', [colSpan(2)])], [columns(2), label('S')]),
      content('Note', [widget('callout'), visible(notEmpty('a'))]),
    ]);
    expect(fine.components).toHaveLength(9);
  });

  it('rejects an item on a Field it does not apply to', () => {
    const wrong = [
      // @ts-expect-error an email Rule on a boolean Field
      boolean('agree', [email()]),
      // @ts-expect-error accepted is for boolean Fields
      text('name', [accepted()]),
      // @ts-expect-error min_length is for text Fields
      number('age', [minLength(1)]),
      // @ts-expect-error a date bound is a date, not a number
      date('day', [minValue(5)]),
      // @ts-expect-error a number bound is a number, not a date
      number('count', [minValue('2024-01-01')]),
      // @ts-expect-error placeholder is not a key of a boolean Field
      boolean('flag', [placeholder('x')]),
      // @ts-expect-error columns belongs to Layouts
      text('note', [columns(2)]),
      // @ts-expect-error a Repeater has no required
      repeater('rows', [text('x')], [required()]),
      // @ts-expect-error min_items is for multi_choice and Repeaters
      object('group', [text('x')], [minItems(1)]),
      // @ts-expect-error a Layout has no required
      section([text('x')], [required()]),
      // @ts-expect-error Content is never disabled
      content('Note', [disabled()]),
    ];
    expect(wrong).toHaveLength(11);
  });

  it('rejects a default of the wrong value', () => {
    const wrong = [
      // @ts-expect-error a text default is a string
      text('name', [defaultValue(5)]),
      // @ts-expect-error a choice default is one of the choices
      choice('country', ['VN', 'US'], [defaultValue('FR')]),
      // @ts-expect-error a multi_choice default lists choices
      multiChoice('tags', ['a', 'b'], [defaultValue(['c'])]),
      // @ts-expect-error a boolean default is a boolean
      boolean('flag', [defaultValue('yes')]),
    ];
    expect(wrong).toHaveLength(4);
  });

  it('rejects an empty Condition group or list', () => {
    // @ts-expect-error a group needs at least one Condition
    const group = () => all();
    // @ts-expect-error `in` needs at least one value
    const list = () => isIn('country', []);
    expect([group, list]).toHaveLength(2);
  });
});
