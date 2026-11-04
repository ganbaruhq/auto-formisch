// Type tests for custom Field Types and Rules: `pnpm typecheck` checks the
// `expectTypeOf` and `@ts-expect-error` lines; the runtime tests only keep
// this file in the suite and make sure each negative case is a real call.
import * as v from 'valibot';
import { describe, expect, expectTypeOf, it } from 'vite-plus/test';
import {
  colSpan,
  columns,
  compile,
  defaultValue,
  defineFieldType,
  defineRule,
  description,
  disabled,
  email,
  form,
  label,
  minItems,
  notEmpty,
  number,
  placeholder,
  required,
  text,
  visible,
  widget,
  type CompiledForm,
  type CustomField,
  type InferFieldNode,
  type InferFieldValue,
  type InferOutput,
} from './index';

const rating = defineFieldType({
  type: 'rating',
  options: { max: v.number(), step: v.optional(v.number()) },
  schema: (node) => {
    expectTypeOf(node.max).toEqualTypeOf<number>();
    expectTypeOf(node.step).toEqualTypeOf<number | undefined>();
    return v.pipe(v.number(), v.maxValue(node.max));
  },
  conditionAs: 'number',
});

const place = defineFieldType({
  type: 'place',
  schema: v.object({ lat: v.number(), lng: v.number() }),
});

const startsWith = defineRule({
  type: 'starts_with',
  appliesTo: ['text'],
  requirement: v.string(),
  check: (value, requirement) => {
    expectTypeOf(value).toEqualTypeOf<string>();
    expectTypeOf(requirement).toEqualTypeOf<string>();
    return value.startsWith(requirement);
  },
});

const extensions = { fieldTypes: [rating, place], rules: [startsWith] };

describe('custom Field Type values in the Builder', () => {
  it('infers the value from the schema', () => {
    const built = form(
      [
        rating('score', { max: 5 }, [required()]),
        place('home'),
        place('work', [required(), visible(notEmpty('home'))]),
        text('code', [startsWith('VN')]),
      ],
      extensions,
    );
    type Output = {
      score: number;
      home?: { lat: number; lng: number };
      work?: { lat: number; lng: number };
      code?: string;
    };
    expectTypeOf<InferOutput<typeof built>>().toEqualTypeOf<Output>();
    expectTypeOf(compile(built, extensions)).toEqualTypeOf<CompiledForm<Output>>();
    expect(built.components).toHaveLength(4);
  });

  it('exposes the value and node types for a Widget', () => {
    expectTypeOf<InferFieldValue<typeof rating>>().toEqualTypeOf<number>();
    expectTypeOf<InferFieldValue<typeof place>>().toEqualTypeOf<{ lat: number; lng: number }>();
    expectTypeOf<InferFieldNode<typeof rating>['max']>().toEqualTypeOf<number>();
    expectTypeOf<InferFieldNode<typeof rating>['type']>().toEqualTypeOf<'rating'>();
    expectTypeOf(rating('s', { max: 5 })).toExtend<CustomField<'rating'>>();
  });

  it('takes metadata and settings, but no Rule, in its pipe', () => {
    const fine = [
      rating('a', { max: 5, step: 1 }, [
        label('A'),
        description('About A'),
        placeholder('Pick'),
        widget('stars'),
        colSpan(2),
        required(notEmpty('b')),
        disabled(),
        defaultValue(3),
      ]),
      place('b', [defaultValue({ lat: 1, lng: 2 })]),
    ];
    const wrong = [
      // @ts-expect-error options are required when the type has any
      rating('a'),
      // @ts-expect-error an option takes its schema's input
      rating('a', { max: '5' }),
      // @ts-expect-error an unknown option
      rating('a', { max: 5, min: 1 }),
      // @ts-expect-error a type without options takes none
      place('b', { lat: 1 }),
      // @ts-expect-error no built-in Rule fits a custom Field Type
      rating('a', { max: 5 }, [email()]),
      // @ts-expect-error no custom Rule fits a custom Field Type
      place('b', [startsWith('VN')]),
      // @ts-expect-error min_items is for multi_choice and Repeaters
      place('b', [minItems(1)]),
      // @ts-expect-error columns belongs to Layouts
      place('b', [columns(2)]),
      // @ts-expect-error a default of the type's value
      rating('a', { max: 5 }, [defaultValue('3')]),
    ];
    expect([...fine, ...wrong]).toHaveLength(11);
  });
});

describe('custom Rules in the Builder', () => {
  it('fit only the Field Types of appliesTo', () => {
    const between = defineRule({
      type: 'between',
      appliesTo: ['number', 'date'],
      requirement: v.tuple([v.number(), v.number()]),
      check: (value, [low, high]) => {
        expectTypeOf(value).toEqualTypeOf<number | string>();
        return typeof value === 'number' && value >= low && value <= high;
      },
    });
    const fine = [text('a', [startsWith('VN', 'Use VN')]), number('b', [between([1, 2])])];
    const wrong = [
      // @ts-expect-error starts_with applies to text only
      number('n', [startsWith('VN')]),
      // @ts-expect-error the requirement is a string
      text('t', [startsWith(5)]),
      // @ts-expect-error the requirement is required
      text('t', [startsWith()]),
    ];
    expect([...fine, ...wrong]).toHaveLength(5);
  });

  it('type check by the value of appliesTo', () => {
    const rule = () =>
      defineRule({
        type: 'odd',
        appliesTo: ['number'],
        // @ts-expect-error a number has no startsWith
        check: (value) => value.startsWith('x'),
      });
    expect(rule).toBeTypeOf('function');
  });
});

describe('defineFieldType', () => {
  // A schema that doesn't fit gives a result that nothing takes, so the first
  // use fails to compile; the check can't sit on the argument (see `Defined`).
  const length = defineFieldType({
    type: 'length',
    schema: v.pipe(
      v.string(),
      v.transform((value) => value.length),
    ),
  });
  const code = defineFieldType({ type: 'code', schema: v.string(), conditionAs: 'number' });
  const spot = defineFieldType({ type: 'spot', schema: v.object({}), conditionAs: 'text' });

  it('rejects a schema that transforms or holds no JSON value', () => {
    expectTypeOf(length).toEqualTypeOf<{
      readonly '~error': 'A Field Type schema only validates: its output type must be its input type';
    }>();
    const wrong = [
      // @ts-expect-error a transforming schema gives no Field Type
      () => compile({}, { fieldTypes: [length] }),
      // @ts-expect-error nor a Builder function
      () => length('a'),
      // @ts-expect-error a Date is no JSON value
      () => defineFieldType({ type: 'when', schema: v.date() }),
    ];
    expect(wrong).toHaveLength(3);
  });

  it('takes only a conditionAs row its value fits', () => {
    expectTypeOf(code).toEqualTypeOf<{
      readonly '~error': 'A "number" Condition row does not fit the value of the schema';
    }>();
    // @ts-expect-error an object has no row
    const wrong = () => compile({}, { fieldTypes: [spot] });
    const fine = [
      defineFieldType({ type: 'when', schema: v.string(), conditionAs: 'date' }),
      defineFieldType({ type: 'tags', schema: v.array(v.string()), conditionAs: 'multi_choice' }),
      defineFieldType({ type: 'flag', schema: v.literal(true), conditionAs: 'boolean' }),
    ];
    expect([wrong, ...fine]).toHaveLength(4);
  });
});
