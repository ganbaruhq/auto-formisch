import * as v from 'valibot';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  boolean,
  compile,
  defaultValue,
  defineFieldType,
  defineRule,
  DefinitionError,
  disabled,
  eq,
  form,
  gt,
  isEmpty,
  isIn,
  lock,
  LockError,
  label,
  minLength,
  neq,
  number,
  object,
  placeholder,
  repeater,
  required,
  text,
  visible,
  type FormError,
  type LoadOptions,
} from './index';

// Custom Field Types and Rules (AF-29), through `compile` and `~standard.validate`.

const rating = defineFieldType({
  type: 'rating',
  options: { max: v.pipe(v.number(), v.integer(), v.minValue(1)) },
  schema: (node) => v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(node.max)),
  conditionAs: 'number',
});

/** One JSON value made of parts, with no `conditionAs`. */
const place = defineFieldType({
  type: 'place',
  schema: v.object({
    lat: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
    lng: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
  }),
});

const startsWith = defineRule({
  type: 'starts_with',
  appliesTo: ['text'],
  requirement: v.string(),
  check: (value, requirement) => value.startsWith(requirement),
  message: 'Wrong prefix',
});

const extensions: LoadOptions = { fieldTypes: [rating, place], rules: [startsWith] };

const validate = (definition: unknown, input: unknown, options: LoadOptions = extensions) =>
  compile(definition, options)['~standard'].validate(input);

/** Compiles a Definition that must fail, and returns its load errors. */
function loadErrors(definition: unknown, options: LoadOptions = extensions): readonly FormError[] {
  try {
    compile(definition, options);
  } catch (error) {
    expect(error).toBeInstanceOf(DefinitionError);
    return (error as DefinitionError).errors;
  }
  throw new Error('Expected the Definition to be rejected');
}

const root = (...components: object[]) => ({ version: 1, components });
const score = (extra: object = {}) => ({ type: 'rating', name: 'score', max: 5, ...extra });

describe('custom Field Type', () => {
  it('validates its value with its schema, built from the node', () => {
    expect(validate(root(score()), { score: 4 })).toEqual({ value: { score: 4 } });
    expect(validate(root(score()), { score: 6 })).toEqual({
      issues: [{ message: 'Invalid value: Expected <=5 but received 6', path: ['score'] }],
    });
  });

  it('builds the schema once per node on load', () => {
    const build = vi.fn(() => v.string());
    const counted = defineFieldType({ type: 'counted', schema: build });
    const compiled = compile(
      root(
        { type: 'counted', name: 'a' },
        { type: 'counted', name: 'b', visible: { field: 'a', operator: 'not_empty' } },
      ),
      { fieldTypes: [counted] },
    );
    compiled['~standard'].validate({ a: 'x', b: 'y' });
    compiled['~standard'].validate({ a: 'x' });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('round-trips through JSON, options included', () => {
    const definition = root(
      score({ label: 'Score', placeholder: 'Pick one', required: true, default: 3 }),
      { type: 'place', name: 'home', default: { lat: 1, lng: 2 } },
    );
    const loaded = compile(definition, extensions).definition;
    expect(loaded).toEqual(definition);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(definition));
  });

  it('holds any JSON value in one Field and outputs it unchanged', () => {
    const tags = defineFieldType({ type: 'tags', schema: v.array(v.string()) });
    const options = { fieldTypes: [tags, place] };
    const definition = root({ type: 'tags', name: 'tags' }, { type: 'place', name: 'home' });
    expect(validate(definition, { tags: ['a', 'b'], home: { lat: 1, lng: 2 } }, options)).toEqual({
      value: { tags: ['a', 'b'], home: { lat: 1, lng: 2 } },
    });
  });

  it('collapses every error of its schema to the Field path', () => {
    expect(
      validate(root({ type: 'place', name: 'home' }), { home: { lat: 91, lng: 'x' } }),
    ).toEqual({
      issues: [
        { message: 'Invalid value: Expected <=90 but received 91', path: ['home'] },
        { message: 'Invalid type: Expected number but received "x"', path: ['home'] },
      ],
    });
  });

  it('runs its schema in the language of the whole parse', () => {
    const word = defineFieldType({
      type: 'word',
      schema: v.string((issue) => (issue.lang === 'de' ? 'Kein Text' : 'Not text')),
    });
    const compiled = compile(root({ type: 'word', name: 'w' }), { fieldTypes: [word] });
    const result = v.safeParse(compiled.schema, { w: 1 }, { lang: 'de' });
    expect(result.issues?.map((issue) => issue.message)).toEqual(['Kein Text']);
  });

  it('only validates: a transform in its schema has no effect', () => {
    const trimmed = defineFieldType({ type: 'trimmed', schema: v.pipe(v.string(), v.trim()) });
    expect(
      validate(root({ type: 'trimmed', name: 'code' }), { code: ' a ' }, { fieldTypes: [trimmed] }),
    ).toEqual({ value: { code: ' a ' } });
  });

  it('uses the core definition of empty and shows only Required next to its schema', () => {
    expect(validate(root(score()), { score: null })).toEqual({ value: {} });
    expect(validate(root(score({ required: true })), {})).toEqual({
      issues: [{ message: 'Required', path: ['score'] }],
    });
    expect(validate(root(score({ requiredMessage: 'Rate it', required: true })), {})).toEqual({
      issues: [{ message: 'Rate it', path: ['score'] }],
    });
    // An empty list is empty; an empty object is a value.
    const tags = defineFieldType({ type: 'tags', schema: v.array(v.string()) });
    expect(
      validate(
        root({ type: 'tags', name: 't', required: true }),
        { t: [] },
        { fieldTypes: [tags] },
      ),
    ).toEqual({ issues: [{ message: 'Required', path: ['t'] }] });
    expect(validate(root({ type: 'place', name: 'home' }), { home: {} }).issues).toHaveLength(2);
  });

  it('is not validated while Inactive', () => {
    const definition = root(
      { type: 'boolean', name: 'rated' },
      score({ required: true, visible: { field: 'rated', operator: 'eq', value: true } }),
    );
    expect(validate(definition, { score: 99 })).toEqual({ value: {} });
    expect(validate(definition, { rated: true, score: 99 }).issues).toHaveLength(1);
  });

  it('checks its options on load: present, of their schema, and nothing unknown', () => {
    expect(
      loadErrors(
        root(
          { type: 'rating', name: 'a' },
          score({ name: 'b', max: 0 }),
          score({ name: 'c', maxx: 5 }),
          score({ name: 'd', max: '5' }),
        ),
      ),
    ).toEqual([
      { message: 'Missing key "max"', path: ['components', 0, 'max'] },
      { message: 'Invalid value: Expected >=1 but received 0', path: ['components', 1, 'max'] },
      { message: 'Unknown key "maxx"', path: ['components', 2, 'maxx'] },
      {
        message: 'Invalid type: Expected number but received "5"',
        path: ['components', 3, 'max'],
      },
    ]);
  });

  it('takes an option whose schema accepts undefined as optional', () => {
    const stars = defineFieldType({
      type: 'stars',
      options: { max: v.optional(v.number()) },
      schema: (node) => v.pipe(v.number(), v.maxValue(node.max ?? 5)),
    });
    expect(validate(root({ type: 'stars', name: 's' }), { s: 6 }, { fieldTypes: [stars] })).toEqual(
      { issues: [{ message: 'Invalid value: Expected <=5 but received 6', path: ['s'] }] },
    );
    expect(
      validate(root({ type: 'stars', name: 's', max: 10 }), { s: 6 }, { fieldTypes: [stars] }),
    ).toEqual({ value: { s: 6 } });
  });

  it('rejects option values that are not JSON', () => {
    const dated = defineFieldType({
      type: 'dated',
      options: { since: v.any() },
      schema: v.string(),
    });
    expect(
      loadErrors(root({ type: 'dated', name: 'd', since: new Date(0) }), { fieldTypes: [dated] }),
    ).toEqual([{ message: 'Expected a JSON value', path: ['components', 0, 'since'] }]);
  });

  it('takes no rules: its constraints go in its schema and options', () => {
    expect(loadErrors(root(score({ rules: [{ type: 'integer' }] })))).toEqual([
      { message: 'Unknown key "rules"', path: ['components', 0, 'rules'] },
    ]);
  });

  it('reports a schema that throws at its node, and keeps checking the others', () => {
    const broken = defineFieldType({
      type: 'broken',
      schema: () => {
        throw new Error('no max');
      },
    });
    expect(
      loadErrors(root({ type: 'broken', name: 'a' }, { type: 'text', name: 'b', label: 1 }), {
        fieldTypes: [broken],
      }),
    ).toEqual([
      {
        message: 'Field Type "broken" could not build its schema: no max',
        path: ['components', 0],
      },
      { message: 'Invalid type: Expected string but received 1', path: ['components', 1, 'label'] },
    ]);
  });

  it('skips the schema while its options are wrong', () => {
    const build = vi.fn(() => v.number());
    const sized = defineFieldType({ type: 'sized', options: { size: v.number() }, schema: build });
    loadErrors(root({ type: 'sized', name: 'a', size: 'x', default: 1 }), { fieldTypes: [sized] });
    expect(build).not.toHaveBeenCalled();
  });

  it('checks its default with its schema, collapsed to the default', () => {
    expect(
      loadErrors(
        root(score({ name: 'a', default: 9 }), score({ name: 'b', default: '' }), {
          type: 'place',
          name: 'c',
          default: { lat: 99, lng: 0 },
        }),
      ),
    ).toEqual([
      {
        message: 'Invalid value: Expected <=5 but received 9',
        path: ['components', 0, 'default'],
      },
      { message: 'A default cannot be empty', path: ['components', 1, 'default'] },
      {
        message: 'Invalid value: Expected <=90 but received 99',
        path: ['components', 2, 'default'],
      },
    ]);
  });
});

describe('lock on a custom Field Type', () => {
  const rated = root(score({ required: true }), {
    type: 'text',
    name: 'why',
    required: true,
    visible: { field: 'score', operator: 'lt', value: 3 },
  });

  it('checks the value with the type schema, collapsed to the data path', () => {
    try {
      lock(compile(rated, extensions), { score: 9 });
      throw new Error('Expected lock to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LockError);
      expect((error as LockError).errors).toEqual([
        { message: 'Invalid value: Expected <=5 but received 9', path: ['score'] },
      ]);
    }
  });

  it('overwrites a forged value before Conditions run, and outputs the Locked one', () => {
    const locked = lock(compile(rated, extensions), { score: 2 });
    expect(locked['~standard'].validate({ score: 5 })).toEqual({
      issues: [{ message: 'Required', path: ['why'] }],
    });
    expect(locked['~standard'].validate({ score: 5, why: 'Slow' })).toEqual({
      value: { score: 2, why: 'Slow' },
    });
  });

  it('locks an object value of a custom Field Type', () => {
    const locked = lock(compile(root({ type: 'place', name: 'home' }), extensions), {
      home: { lat: 1, lng: 2 },
    });
    expect(locked['~standard'].validate({ home: { lat: 0, lng: 0 } })).toEqual({
      value: { home: { lat: 1, lng: 2 } },
    });
  });
});

describe('custom Field Type in Conditions', () => {
  const driven = (condition: object) =>
    root(score(), { type: 'text', name: 'why', required: true, visible: condition });

  it('uses the operators of its conditionAs row', () => {
    const definition = driven({ field: 'score', operator: 'lt', value: 3 });
    expect(validate(definition, { score: 2 }).issues).toHaveLength(1);
    expect(validate(definition, { score: 4 })).toEqual({ value: { score: 4 } });
    expect(loadErrors(driven({ field: 'score', operator: 'contains', value: 3 }))).toEqual([
      {
        message: 'Operator "contains" does not apply to a "rating" Field',
        path: ['components', 1, 'visible', 'operator'],
      },
    ]);
  });

  it('checks a Condition value with the type schema', () => {
    expect(loadErrors(driven({ field: 'score', operator: 'eq', value: 9 }))).toEqual([
      {
        message: 'Invalid value: Expected <=5 but received 9',
        path: ['components', 1, 'visible', 'value'],
      },
    ]);
    expect(loadErrors(driven({ field: 'score', operator: 'in', value: [1, 'x'] }))).toEqual([
      {
        message: 'Invalid type: Expected number but received "x"',
        path: ['components', 1, 'visible', 'value', 1],
      },
    ]);
  });

  it('takes only empty and not_empty without conditionAs', () => {
    const definition = (operator: string) =>
      root(
        { type: 'place', name: 'home' },
        { type: 'text', name: 'x', visible: { field: 'home', operator } },
      );
    expect(compile(definition('not_empty'), extensions).definition.components).toHaveLength(2);
    expect(loadErrors(definition('eq'))).toEqual([
      {
        message: 'Operator "eq" does not apply to a "place" Field',
        path: ['components', 1, 'visible', 'operator'],
      },
    ]);
  });

  it('tests a list with contains when it reads as multi_choice', () => {
    const tags = defineFieldType({
      type: 'tags',
      schema: v.array(v.string()),
      conditionAs: 'multi_choice',
    });
    const definition = (value: unknown) =>
      root(
        { type: 'tags', name: 'tags' },
        {
          type: 'text',
          name: 'why',
          required: true,
          visible: { field: 'tags', operator: 'contains', value },
        },
      );
    expect(validate(definition('vip'), { tags: ['vip'] }, { fieldTypes: [tags] }).issues).toEqual([
      { message: 'Required', path: ['why'] },
    ]);
    expect(validate(definition('vip'), { tags: ['x'] }, { fieldTypes: [tags] })).toEqual({
      value: { tags: ['x'] },
    });
    expect(loadErrors(definition({}), { fieldTypes: [tags] })).toEqual([
      {
        message: 'Expected a string, number or boolean',
        path: ['components', 1, 'visible', 'value'],
      },
    ]);
  });
});

describe('custom Rule', () => {
  const code = (rules: object[], extra: object = {}) =>
    root({ type: 'text', name: 'code', rules, ...extra });

  it('checks a value with its requirement and its message', () => {
    const definition = code([{ type: 'starts_with', requirement: 'VN' }]);
    expect(validate(definition, { code: 'VN-1' })).toEqual({ value: { code: 'VN-1' } });
    expect(validate(definition, { code: 'US-1' })).toEqual({
      issues: [{ message: 'Wrong prefix', path: ['code'] }],
    });
  });

  it('takes the message of the Definition first', () => {
    expect(
      validate(code([{ type: 'starts_with', requirement: 'VN', message: 'Use VN' }]), {
        code: 'x',
      }),
    ).toEqual({ issues: [{ message: 'Use VN', path: ['code'] }] });
  });

  it('combines with built-in Rules, all errors on the Field path', () => {
    const definition = code([
      { type: 'min_length', requirement: 5 },
      { type: 'starts_with', requirement: 'VN' },
    ]);
    expect(validate(definition, { code: 'US' })).toEqual({
      issues: [
        { message: 'Invalid length: Expected >=5 but received 2', path: ['code'] },
        { message: 'Wrong prefix', path: ['code'] },
      ],
    });
  });

  it('runs only on a non-empty value of the Field type', () => {
    const check = vi.fn(() => true);
    const spied = defineRule({ type: 'spied', appliesTo: ['text'], check });
    const definition = code([{ type: 'spied' }], { required: true });
    for (const input of [{}, { code: '  ' }, { code: 5 }]) {
      expect(validate(definition, input, { rules: [spied] }).issues).toHaveLength(1);
    }
    expect(check).not.toHaveBeenCalled();
    validate(definition, { code: 'a' }, { rules: [spied] });
    expect(check).toHaveBeenCalledWith('a', undefined);
  });

  it('checks its requirement on load, and its place', () => {
    const noRequirement = defineRule({
      type: 'upper',
      appliesTo: ['text'],
      check: (value) => value === value.toUpperCase(),
    });
    expect(
      loadErrors(
        root(
          { type: 'text', name: 'a', rules: [{ type: 'starts_with' }] },
          { type: 'text', name: 'b', rules: [{ type: 'starts_with', requirement: 1 }] },
          { type: 'text', name: 'c', rules: [{ type: 'upper', requirement: 1 }] },
          { type: 'number', name: 'd', rules: [{ type: 'starts_with', requirement: 'x' }] },
        ),
        { rules: [startsWith, noRequirement] },
      ),
    ).toEqual([
      { message: 'Missing key "requirement"', path: ['components', 0, 'rules', 0, 'requirement'] },
      {
        message: 'Invalid type: Expected string but received 1',
        path: ['components', 1, 'rules', 0, 'requirement'],
      },
      {
        message: 'Rule "upper" takes no requirement',
        path: ['components', 2, 'rules', 0, 'requirement'],
      },
      {
        message: 'Rule "starts_with" does not apply to a "number" Field',
        path: ['components', 3, 'rules', 0, 'type'],
      },
    ]);
  });

  it('checks a default too', () => {
    expect(
      loadErrors(code([{ type: 'starts_with', requirement: 'VN' }], { default: 'US' })),
    ).toEqual([{ message: 'Wrong prefix', path: ['components', 0, 'default'] }]);
  });

  it('applies to choice, multi_choice and date with their value types', () => {
    const even = defineRule({
      type: 'even',
      appliesTo: ['number', 'multi_choice'],
      check: (value) => (typeof value === 'number' ? value % 2 === 0 : value.length % 2 === 0),
    });
    const definition = root(
      { type: 'number', name: 'n', rules: [{ type: 'even' }] },
      { type: 'multi_choice', name: 'm', choices: [1, 2, 3], rules: [{ type: 'even' }] },
    );
    expect(validate(definition, { n: 2, m: [1, 3] }, { rules: [even] })).toEqual({
      value: { n: 2, m: [1, 3] },
    });
    expect(
      validate(definition, { n: 3, m: [1] }, { rules: [even] }).issues?.map((issue) => issue.path),
    ).toEqual([['n'], ['m']]);
  });
});

describe('registration', () => {
  it('is explicit: nothing carries over between calls', () => {
    compile(root(score()), extensions);
    expect(loadErrors(root(score()), {})).toEqual([
      { message: 'Unknown type "rating"', path: ['components', 0, 'type'] },
    ]);
    expect(
      loadErrors(
        root({ type: 'text', name: 'a', rules: [{ type: 'starts_with', requirement: 'x' }] }),
        {},
      ),
    ).toEqual([
      { message: 'Unknown Rule "starts_with"', path: ['components', 0, 'rules', 0, 'type'] },
    ]);
  });

  it('reports an unregistered type once and keeps checking the other nodes', () => {
    expect(
      loadErrors(
        root(
          { type: 'colour', name: 'a', anything: true, visible: { field: 'b', operator: 'eq' } },
          { type: 'text', name: 'b', bogus: 1 },
        ),
      ),
    ).toEqual([
      { message: 'Unknown type "colour"', path: ['components', 0, 'type'] },
      { message: 'Unknown key "bogus"', path: ['components', 1, 'bogus'] },
    ]);
  });

  it('rejects invalid and built-in names at once', () => {
    for (const type of [
      'Rating',
      '1star',
      'star-rating',
      '',
      'text',
      'section',
      'tab',
      'email',
      'page',
    ]) {
      expect(() => defineFieldType({ type, schema: v.string() })).toThrow(TypeError);
      expect(() => defineRule({ type, appliesTo: ['text'], check: () => true })).toThrow(TypeError);
    }
  });

  it('rejects a name registered twice, across both lists', () => {
    const again = defineFieldType({ type: 'rating', schema: v.number() });
    const sameAsType = defineRule({ type: 'place', appliesTo: ['text'], check: () => true });
    expect(() => compile(root(), { fieldTypes: [rating, again] })).toThrow(
      new TypeError('"rating" is registered twice'),
    );
    expect(() => compile(root(), { fieldTypes: [place], rules: [sameAsType] })).toThrow(TypeError);
    expect(() => compile(root(), { rules: [startsWith, startsWith] })).toThrow(TypeError);
  });

  it('rejects anything not made by defineFieldType or defineRule', () => {
    expect(() =>
      compile(root(), { fieldTypes: [{ type: 'fake', schema: v.string() }] as never }),
    ).toThrow(TypeError);
    expect(() => compile(root(), { rules: [{ type: 'fake' }] as never })).toThrow(TypeError);
  });

  it('rejects invalid or built-in option keys', () => {
    for (const key of [
      'label',
      'required',
      'rules',
      'default',
      'placeholder',
      'choices',
      '1x',
      '__proto__',
    ]) {
      expect(() =>
        defineFieldType({ type: 'odd', options: { [key]: v.string() }, schema: v.string() }),
      ).toThrow(TypeError);
    }
  });

  it('rejects async schemas, options, requirements and checks at once', () => {
    const asyncCheck = v.checkAsync(async () => true) as never;
    const asyncSchemas = [
      v.pipe(v.string(), asyncCheck),
      v.pipeAsync(
        v.string(),
        v.checkAsync(async () => true),
      ),
      v.object({ a: v.pipe(v.string(), asyncCheck) }),
      v.optional(v.array(v.pipe(v.string(), asyncCheck))),
      v.union([v.number(), v.pipe(v.string(), asyncCheck)]),
    ] as never[];
    for (const schema of asyncSchemas) {
      expect(() => defineFieldType({ type: 'slow', schema })).toThrow(/async/);
      expect(() =>
        defineFieldType({ type: 'slow', options: { x: schema }, schema: v.string() }),
      ).toThrow(/async/);
      expect(() =>
        defineRule({ type: 'slow', appliesTo: ['text'], requirement: schema, check: () => true }),
      ).toThrow(/async/);
    }
    expect(() =>
      defineRule({ type: 'slow', appliesTo: ['text'], check: (async () => true) as never }),
    ).toThrow(TypeError);
  });

  it('rejects an async schema built from a node when the Definition loads', () => {
    const slow = defineFieldType({
      type: 'slow',
      schema: () => v.pipe(v.string(), v.checkAsync(async () => true) as never) as never,
    });
    expect(() => compile(root({ type: 'slow', name: 'a' }), { fieldTypes: [slow] })).toThrow(
      new TypeError('The schema of Field Type "slow" is async; only sync schemas are supported'),
    );
  });

  it('rejects an unknown conditionAs and appliesTo', () => {
    expect(() =>
      defineFieldType({ type: 'odd', schema: v.string(), conditionAs: 'choice' as never }),
    ).toThrow(TypeError);
    for (const appliesTo of [[], ['object'], ['repeater'], ['rating']]) {
      expect(() =>
        defineRule({ type: 'odd', appliesTo: appliesTo as never, check: () => true }),
      ).toThrow(TypeError);
    }
  });
});

describe('custom code that throws while validating', () => {
  const failing = defineFieldType({
    type: 'failing',
    schema: v.pipe(
      v.string(),
      v.check(() => {
        throw new Error('bug in the schema');
      }),
    ),
  });

  it('propagates from a Field Type schema', () => {
    const compiled = compile(root({ type: 'failing', name: 'a' }), { fieldTypes: [failing] });
    expect(() => compiled['~standard'].validate({ a: 'x' })).toThrow('bug in the schema');
    expect(() => v.safeParse(compiled.schema, { a: 'x' })).toThrow('bug in the schema');
  });

  it('propagates from a Rule check', () => {
    const buggy = defineRule({
      type: 'buggy',
      appliesTo: ['text'],
      check: () => {
        throw new Error('bug in the check');
      },
    });
    const compiled = compile(root({ type: 'text', name: 'a', rules: [{ type: 'buggy' }] }), {
      rules: [buggy],
    });
    expect(() => compiled['~standard'].validate({ a: 'x' })).toThrow('bug in the check');
  });

  it('never counts a check that returns a Promise or no boolean as passed', () => {
    for (const result of [Promise.resolve(true), undefined, 'yes']) {
      const odd = defineRule({ type: 'odd', appliesTo: ['text'], check: () => result as never });
      const compiled = compile(root({ type: 'text', name: 'a', rules: [{ type: 'odd' }] }), {
        rules: [odd],
      });
      expect(() => compiled['~standard'].validate({ a: 'x' })).toThrow(TypeError);
    }
  });
});

describe('custom Field Types and Rules in the Fluent Builder', () => {
  const color = defineFieldType({ type: 'color', schema: v.pipe(v.string(), v.hexColor()) });

  it('builds the same Definition as the JSON, checked by the same loader', () => {
    const built = form(
      [
        rating('score', { max: 5 }, [label('Score'), required(), defaultValue(3)]),
        color('accent', [placeholder('#fff'), visible(gt('score', 2))]),
        text('code', [startsWith('VN', 'Use VN'), minLength(3)]),
      ],
      { fieldTypes: [rating, color], rules: [startsWith] },
    );
    expect(built).toEqual(
      root(
        { type: 'rating', name: 'score', max: 5, label: 'Score', required: true, default: 3 },
        {
          type: 'color',
          name: 'accent',
          placeholder: '#fff',
          visible: { field: 'score', operator: 'gt', value: 2 },
        },
        {
          type: 'text',
          name: 'code',
          rules: [
            { type: 'starts_with', requirement: 'VN', message: 'Use VN' },
            { type: 'min_length', requirement: 3 },
          ],
        },
      ),
    );
    const compiled = compile(built, { fieldTypes: [rating, color], rules: [startsWith] });
    expect(compiled['~standard'].validate({ score: 4, accent: 'red', code: 'US1' })).toEqual({
      issues: [
        { message: 'Invalid hex color: Received "red"', path: ['accent'] },
        { message: 'Use VN', path: ['code'] },
      ],
    });
  });

  it('throws in form() for a type or Rule it was not given', () => {
    expect(() => form([rating('score', { max: 5 })])).toThrow(DefinitionError);
    expect(() => form([text('code', [startsWith('VN')])], { fieldTypes: [rating] })).toThrow(
      DefinitionError,
    );
  });

  it('puts a Rule with no requirement in a pipe with only its message', () => {
    const upper = defineRule({
      type: 'upper',
      appliesTo: ['text'],
      check: (value) => value === value.toUpperCase(),
    });
    expect(text('a', [upper()]).rules).toEqual([{ type: 'upper' }]);
    expect(text('a', [upper('Capitals')]).rules).toEqual([{ type: 'upper', message: 'Capitals' }]);
  });
});

/**
 * The built-in `text` Field Type, rewritten with only the public interface,
 * so a gap in it shows here. It has no Rules: a custom type takes none.
 */
const myText = defineFieldType({ type: 'my_text', schema: v.string(), conditionAs: 'text' });

describe('text rewritten with defineFieldType', () => {
  /** The same form, with `type` as the type of its text Fields. */
  const signup = (type: 'text' | 'my_text') =>
    root(
      { type, name: 'name', label: 'Name', placeholder: 'Ada', required: true, default: 'Ada' },
      { type: 'boolean', name: 'company' },
      {
        type,
        name: 'vat',
        requiredMessage: 'VAT number needed',
        required: { field: 'company', operator: 'eq', value: true },
        visible: { field: 'name', operator: 'neq', value: 'skip' },
      },
      {
        type: 'object',
        name: 'address',
        components: [{ type, name: 'city', disabled: { field: '../vat', operator: 'empty' } }],
      },
      {
        type: 'repeater',
        name: 'pets',
        components: [
          { type, name: 'kind', required: true },
          {
            type: 'number',
            name: 'legs',
            visible: { field: 'kind', operator: 'in', value: ['cat', 'dog'] },
          },
        ],
      },
    );

  const inputs: unknown[] = [
    {},
    { name: '   ' },
    { name: 5 },
    { name: 'Grace', company: true },
    { name: 'skip', company: true, vat: 'x' },
    { name: 'Grace', company: true, vat: 'VN1', address: { city: 'Hue' } },
    {
      name: 'Grace',
      address: { city: 'Hue' },
      pets: [{ kind: 'cat', legs: 4 }, { kind: 'fish', legs: 0 }, {}],
    },
    { name: 'Grace', pets: [{ kind: 1 }], extra: 'dropped' },
  ];

  it('loads like text, from the Builder and JSON alike, and round-trips', () => {
    const json = signup('my_text');
    const loaded = compile(json, { fieldTypes: [myText] }).definition;
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(json));
    const built = form(
      [
        myText('name', [label('Name'), placeholder('Ada'), required(), defaultValue('Ada')]),
        boolean('company'),
        myText('vat', [
          required(eq('company', true), 'VAT number needed'),
          visible(neq('name', 'skip')),
        ]),
        object('address', [myText('city', [disabled(isEmpty('../vat'))])]),
        repeater('pets', [
          myText('kind', [required()]),
          number('legs', [visible(isIn('kind', ['cat', 'dog']))]),
        ]),
      ],
      { fieldTypes: [myText] },
    );
    expect(built).toEqual(json);
  });

  it('validates every input exactly as the built-in text does', () => {
    const builtin = compile(signup('text'));
    const custom = compile(signup('my_text'), { fieldTypes: [myText] });
    const results = inputs.map((input) => custom['~standard'].validate(input));
    expect(results).toEqual(inputs.map((input) => builtin['~standard'].validate(input)));
    // The table holds both outcomes.
    expect(results.some((result) => 'value' in result)).toBe(true);
    expect(results.some((result) => 'issues' in result)).toBe(true);
  });

  it('rejects the same broken Definitions as text', () => {
    const broken = (type: string) =>
      root(
        { type, name: 'a', default: '  ', placeholder: 1, requird: true },
        { type: 'text', name: 'b', visible: { field: 'a', operator: 'gt', value: 'x' } },
        { type: 'text', name: 'c', visible: { field: 'a', operator: 'eq', value: '' } },
        { type: 'text', name: 'd', visible: { field: 'a', operator: 'in', value: [1] } },
      );
    const builtin = loadErrors(broken('text'));
    const custom = loadErrors(broken('my_text'), { fieldTypes: [myText] });
    expect(custom).toEqual(
      builtin.map((error) => ({
        path: error.path,
        message: error.message
          .replace('"text"', '"my_text"')
          // The built-in text has its own Condition value message; a custom
          // type's comes from its schema.
          .replace(/^Expected a string$/, 'Invalid type: Expected string but received 1'),
      })),
    );
  });
});
