import { describe, expect, it } from 'vite-plus/test';
import { compile, DefinitionError, lock, type FormError } from './index';

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
const eq = (field: string, value: unknown) => ({ field, operator: 'eq', value });

describe('visible', () => {
  const form = root(
    text('country'),
    text('taxId', { required: true, visible: eq('country', 'VN') }),
  );

  it('validates and outputs a visible Field', () => {
    expect(validate(form, { country: 'VN' })).toEqual({
      issues: [{ message: 'Required', path: ['taxId'] }],
    });
    expect(validate(form, { country: 'VN', taxId: '123' })).toEqual({
      value: { country: 'VN', taxId: '123' },
    });
  });

  it('neither validates nor outputs a hidden Field', () => {
    expect(validate(form, { country: 'US' })).toEqual({ value: { country: 'US' } });
    expect(validate(form, { country: 'US', taxId: 5 })).toEqual({ value: { country: 'US' } });
  });
});

const leaf = (field: string, operator: string, value?: unknown) =>
  value === undefined ? { field, operator } : { field, operator, value };

/**
 * Whether `condition`, reading a Field of `driver`'s type, holds for `input`:
 * the Field it shows is required and has no value, so it fails only when shown.
 * A driver of the wrong type fails on its own path, which is ignored here.
 */
function holds(driver: object, condition: unknown, input: Record<string, unknown>): boolean {
  const form = root(
    { name: 'driver', ...driver },
    text('shown', { required: true, visible: condition }),
  );
  const result = validate(form, input);
  return result.issues?.some((issue) => issue.path[0] === 'shown') ?? false;
}

describe('operators', () => {
  const textDriver = { type: 'text' };
  const choiceDriver = { type: 'choice', choices: ['a', 'b', 'c'] };
  const numberDriver = { type: 'number' };
  const dateDriver = { type: 'date' };
  const booleanDriver = { type: 'boolean' };
  const tagsDriver = { type: 'multi_choice', choices: ['red', 'green'] };

  it('compares text strictly: case-sensitive, untrimmed, no coercion', () => {
    expect(holds(textDriver, leaf('driver', 'eq', 'VN'), { driver: 'VN' })).toBe(true);
    expect(holds(textDriver, leaf('driver', 'eq', 'VN'), { driver: 'vn' })).toBe(false);
    expect(holds(textDriver, leaf('driver', 'eq', 'VN'), { driver: ' VN' })).toBe(false);
    expect(holds(textDriver, leaf('driver', 'neq', 'VN'), { driver: 'US' })).toBe(true);
    expect(holds(textDriver, leaf('driver', 'neq', 'VN'), { driver: 'VN' })).toBe(false);
  });

  it('tests a choice against a list with in and not_in', () => {
    const inList = leaf('driver', 'in', ['a', 'b']);
    const notInList = leaf('driver', 'not_in', ['a', 'b']);
    expect(holds(choiceDriver, inList, { driver: 'b' })).toBe(true);
    expect(holds(choiceDriver, inList, { driver: 'c' })).toBe(false);
    expect(holds(choiceDriver, notInList, { driver: 'c' })).toBe(true);
    expect(holds(choiceDriver, notInList, { driver: 'a' })).toBe(false);
  });

  it('orders numbers and dates with gt, gte, lt and lte', () => {
    const cases: [string, unknown, unknown, boolean][] = [
      ['gt', 18, 19, true],
      ['gt', 18, 18, false],
      ['gte', 18, 18, true],
      ['gte', 18, 17, false],
      ['lt', 18, 17, true],
      ['lt', 18, 18, false],
      ['lte', 18, 18, true],
      ['lte', 18, 19, false],
    ];
    for (const [operator, value, driver, expected] of cases) {
      expect(holds(numberDriver, leaf('driver', operator, value), { driver })).toBe(expected);
    }
    expect(holds(dateDriver, leaf('driver', 'gt', '2024-01-31'), { driver: '2024-02-01' })).toBe(
      true,
    );
    expect(holds(dateDriver, leaf('driver', 'lte', '2024-01-31'), { driver: '2024-02-01' })).toBe(
      false,
    );
    expect(holds(numberDriver, leaf('driver', 'eq', 0), { driver: 0 })).toBe(true);
  });

  it('compares a boolean, where false is a value', () => {
    expect(holds(booleanDriver, leaf('driver', 'eq', false), { driver: false })).toBe(true);
    expect(holds(booleanDriver, leaf('driver', 'eq', true), { driver: false })).toBe(false);
    expect(holds(booleanDriver, leaf('driver', 'not_empty'), { driver: false })).toBe(true);
  });

  it('tests an item of a multi_choice with contains', () => {
    const red = leaf('driver', 'contains', 'red');
    expect(holds(tagsDriver, red, { driver: ['green', 'red'] })).toBe(true);
    expect(holds(tagsDriver, red, { driver: ['green'] })).toBe(false);
  });

  it('tests emptiness with the one definition of empty', () => {
    for (const driver of [undefined, null, '', '  ', []]) {
      expect(holds(textDriver, leaf('driver', 'empty'), { driver })).toBe(true);
      expect(holds(textDriver, leaf('driver', 'not_empty'), { driver })).toBe(false);
    }
    expect(holds(numberDriver, leaf('driver', 'empty'), { driver: 0 })).toBe(false);
  });

  it('tests a Repeater for rows with empty and not_empty', () => {
    const items = { type: 'repeater', components: [text('name')] };
    expect(holds(items, leaf('driver', 'not_empty'), { driver: [{ name: 'a' }] })).toBe(true);
    expect(holds(items, leaf('driver', 'empty'), { driver: [] })).toBe(true);
    expect(holds(items, leaf('driver', 'empty'), {})).toBe(true);
  });

  it('makes every comparison false for an empty value, and neq and not_in true', () => {
    const comparisons: [object, unknown][] = [
      [textDriver, leaf('driver', 'eq', 'a')],
      [choiceDriver, leaf('driver', 'in', ['a'])],
      [numberDriver, leaf('driver', 'gt', 0)],
      [numberDriver, leaf('driver', 'gte', 0)],
      [numberDriver, leaf('driver', 'lt', 0)],
      [numberDriver, leaf('driver', 'lte', 0)],
      [tagsDriver, leaf('driver', 'contains', 'red')],
    ];
    for (const [driver, condition] of comparisons) {
      expect(holds(driver, condition, {})).toBe(false);
    }
    expect(holds(textDriver, leaf('driver', 'neq', 'a'), { driver: ' ' })).toBe(true);
    expect(holds(choiceDriver, leaf('driver', 'not_in', ['a']), {})).toBe(true);
  });

  it('makes every comparison false for a value of the wrong type', () => {
    expect(holds(numberDriver, leaf('driver', 'eq', 5), { driver: '5' })).toBe(false);
    expect(holds(numberDriver, leaf('driver', 'gt', 1), { driver: '5' })).toBe(false);
    expect(holds(numberDriver, leaf('driver', 'lt', 1), { driver: '0' })).toBe(false);
    expect(holds(dateDriver, leaf('driver', 'gt', '2024-01-01'), { driver: 'zzz' })).toBe(false);
    expect(holds(dateDriver, leaf('driver', 'lt', '2024-01-01'), { driver: 20240101 })).toBe(false);
    expect(holds(booleanDriver, leaf('driver', 'eq', true), { driver: 'true' })).toBe(false);
    expect(holds(tagsDriver, leaf('driver', 'contains', 'red'), { driver: 'red' })).toBe(false);
    expect(holds(numberDriver, leaf('driver', 'neq', 5), { driver: '5' })).toBe(true);
  });
});

describe('all, any and not', () => {
  const driver = { type: 'number' };
  const between = { all: [leaf('driver', 'gte', 1), leaf('driver', 'lte', 3)] };
  const outside = { any: [leaf('driver', 'lt', 1), leaf('driver', 'gt', 3)] };

  it('combine Conditions', () => {
    expect([0, 1, 3, 4].map((value) => holds(driver, between, { driver: value }))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect([0, 1, 3, 4].map((value) => holds(driver, outside, { driver: value }))).toEqual([
      true,
      false,
      false,
      true,
    ]);
    expect(holds(driver, { not: between }, { driver: 4 })).toBe(true);
    expect(holds(driver, { not: between }, { driver: 2 })).toBe(false);
  });

  it('nest at most 8 levels deep, the leaf included', () => {
    const deep = (levels: number) => {
      let condition: unknown = leaf('driver', 'eq', 1);
      for (let level = 1; level < levels; level++) condition = { all: [condition] };
      return root({ type: 'number', name: 'driver' }, text('shown', { visible: condition }));
    };
    expect(() => compile(deep(8))).not.toThrow();
    const path = ['components', 1, 'visible', ...Array(8).fill(['all', 0]).flat()];
    expect(loadErrors(deep(9))).toEqual([{ message: 'A Condition nests at most 8 levels', path }]);
  });

  it('reject an empty group, two groups in one object, and unknown keys', () => {
    const form = (visible: unknown) =>
      root({ type: 'number', name: 'driver' }, text('shown', { visible }));
    const at = ['components', 1, 'visible'];
    expect(loadErrors(form({ all: [] }))).toEqual([
      { message: '"all" needs at least one Condition', path: [...at, 'all'] },
    ]);
    expect(loadErrors(form({ any: [] }))).toEqual([
      { message: '"any" needs at least one Condition', path: [...at, 'any'] },
    ]);
    expect(
      loadErrors(form({ all: [leaf('driver', 'empty')], not: leaf('driver', 'empty') })),
    ).toEqual([{ message: 'A Condition has one of "all", "any" and "not", not 2', path: at }]);
    expect(loadErrors(form({ not: leaf('driver', 'empty'), also: 1 }))).toEqual([
      { message: 'Unknown key "also"', path: [...at, 'also'] },
    ]);
    expect(loadErrors(form({ ...leaf('driver', 'eq', 1), vaule: 1 }))).toEqual([
      { message: 'Unknown key "vaule"', path: [...at, 'vaule'] },
    ]);
    expect(loadErrors(form({ field: 'driver' }))).toEqual([
      { message: 'Missing key "operator"', path: [...at, 'operator'] },
    ]);
    expect(loadErrors(form({ all: 'x' }))).toEqual([
      { message: 'Expected an array', path: [...at, 'all'] },
    ]);
    expect(loadErrors(form(true))).toEqual([{ message: 'Expected a Condition', path: at }]);
    expect(loadErrors(form(leaf('driver', 'equals', 1)))).toEqual([
      { message: 'Unknown operator "equals"', path: [...at, 'operator'] },
    ]);
  });
});

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
const section = (components: unknown[], extra: object = {}) => ({
  type: 'section',
  components,
  ...extra,
});

describe('references', () => {
  it('read Fields through Layouts and into objects', () => {
    const form = root(
      section([object('address', [text('country')])]),
      text('state', { required: true, visible: eq('address.country', 'US') }),
    );
    expect(validate(form, { address: { country: 'US' } })).toEqual({
      issues: [{ message: 'Required', path: ['state'] }],
    });
    expect(validate(form, { address: { country: 'VN' } })).toEqual({
      value: { address: { country: 'VN' } },
    });
  });

  it('read the Fields of the own row, and outer Fields through ../, per row', () => {
    const form = root(
      text('mode'),
      repeater('items', [
        { type: 'choice', name: 'kind', choices: ['book', 'other'] },
        text('isbn', { required: true, visible: eq('kind', 'book') }),
        text('note', { required: true, visible: eq('../mode', 'detailed') }),
      ]),
    );
    const input = {
      items: [{ kind: 'book' }, { kind: 'other', isbn: 'x' }, { kind: 'book', isbn: '1' }],
    };
    expect(validate(form, input)).toEqual({
      issues: [{ message: 'Required', path: ['items', 0, 'isbn'] }],
    });
    expect(validate(form, { ...input, mode: 'detailed' })).toEqual({
      issues: [
        { message: 'Required', path: ['items', 0, 'isbn'] },
        { message: 'Required', path: ['items', 0, 'note'] },
        { message: 'Required', path: ['items', 1, 'note'] },
        { message: 'Required', path: ['items', 2, 'note'] },
      ],
    });
    const valid = {
      items: [
        { kind: 'book', isbn: '1' },
        { kind: 'other', isbn: 'x' },
      ],
    };
    expect(validate(form, valid)).toEqual({
      value: { items: [{ kind: 'book', isbn: '1' }, { kind: 'other' }] },
    });
  });

  it('climb out of nested Repeaters and objects one data scope per ../', () => {
    const form = root(
      text('level'),
      repeater('groups', [
        text('level'),
        object('meta', [
          repeater('rows', [
            text('a', { required: true, visible: eq('../../level', 'group') }),
            text('b', { required: true, visible: eq('../../../level', 'root') }),
          ]),
        ]),
      ]),
    );
    const input = {
      level: 'root',
      groups: [{ level: 'group', meta: { rows: [{}] } }, { meta: { rows: [{}] } }],
    };
    expect(validate(form, input).issues).toEqual([
      { message: 'Required', path: ['groups', 0, 'meta', 'rows', 0, 'a'] },
      { message: 'Required', path: ['groups', 0, 'meta', 'rows', 0, 'b'] },
      { message: 'Required', path: ['groups', 1, 'meta', 'rows', 0, 'b'] },
    ]);
  });

  it('reject a missing Field, a step above the root, a path into a Repeater or a value', () => {
    const form = root(
      text('name'),
      repeater('items', [text('x', { visible: leaf('../../name', 'empty') })]),
      text('a', { visible: leaf('nope', 'empty') }),
      text('b', { visible: leaf('items.x', 'empty') }),
      text('c', { visible: leaf('name.first', 'empty') }),
      object('o', [text('d', { visible: leaf('o', 'empty') })]),
    );
    expect(loadErrors(form)).toEqual([
      {
        message: '"../../name" goes above the root',
        path: ['components', 1, 'components', 0, 'visible', 'field'],
      },
      { message: 'No Field "nope"', path: ['components', 2, 'visible', 'field'] },
      {
        message: '"items.x" goes inside the rows of the Repeater "items"',
        path: ['components', 3, 'visible', 'field'],
      },
      { message: '"name" has no Fields', path: ['components', 4, 'visible', 'field'] },
      // A name is looked up in the scope of the Condition, here the object's own.
      { message: 'No Field "o"', path: ['components', 5, 'components', 0, 'visible', 'field'] },
    ]);
  });

  it('reject a reference that is not ../ steps and names', () => {
    for (const field of ['items.0.x', './name', 'name.', '', '../', 'a/b', 5]) {
      const form = root(text('name'), text('x', { visible: { field, operator: 'empty' } }));
      expect(loadErrors(form)).toEqual([
        {
          message: 'A reference is "../" steps, then names joined by "."',
          path: ['components', 1, 'visible', 'field'],
        },
      ]);
    }
  });

  it('reject an operator the Field type has no use for, and a value that does not fit', () => {
    const form = root(
      text('name'),
      { type: 'number', name: 'age' },
      { type: 'boolean', name: 'ok' },
      { type: 'choice', name: 'tier', choices: ['a', 'b'] },
      { type: 'multi_choice', name: 'tags', choices: ['x'] },
      { type: 'date', name: 'day' },
      object('o', [text('p')]),
      repeater('r', [text('q')]),
      text('t', {
        visible: {
          all: [
            leaf('name', 'gt', 'a'),
            leaf('ok', 'in', [true]),
            leaf('tags', 'eq', 'x'),
            leaf('tier', 'contains', 'a'),
            leaf('r', 'eq', 1),
            leaf('o', 'empty'),
            leaf('name', 'eq', 5),
            leaf('name', 'eq', ' '),
            leaf('age', 'gt', '18'),
            leaf('tier', 'eq', 'c'),
            leaf('tags', 'contains', 'y'),
            leaf('day', 'lt', '2024-02-30'),
            leaf('ok', 'eq', 'true'),
            { field: 'name', operator: 'empty', value: 'x' },
            leaf('name', 'eq'),
            leaf('tier', 'in', []),
            leaf('tier', 'not_in', 'a'),
            leaf('tier', 'in', ['a', 'z']),
          ],
        },
      }),
    );
    const at = (index: number, ...rest: (string | number)[]) => [
      'components',
      8,
      'visible',
      'all',
      index,
      ...rest,
    ];
    expect(loadErrors(form)).toEqual([
      { message: 'Operator "gt" does not apply to a "text" Field', path: at(0, 'operator') },
      { message: 'Operator "in" does not apply to a "boolean" Field', path: at(1, 'operator') },
      {
        message: 'Operator "eq" does not apply to a "multi_choice" Field',
        path: at(2, 'operator'),
      },
      {
        message: 'Operator "contains" does not apply to a "choice" Field',
        path: at(3, 'operator'),
      },
      { message: 'Operator "eq" does not apply to a "repeater" Field', path: at(4, 'operator') },
      { message: 'Operator "empty" does not apply to a "object" Field', path: at(5, 'operator') },
      { message: 'Expected a string', path: at(6, 'value') },
      { message: 'Use "empty" to test for no value', path: at(7, 'value') },
      { message: 'Invalid type: Expected number but received "18"', path: at(8, 'value') },
      { message: 'Expected one of the choices of the Field, not "c"', path: at(9, 'value') },
      { message: 'Expected one of the choices of the Field, not "y"', path: at(10, 'value') },
      { message: 'Invalid date: Received "2024-02-30"', path: at(11, 'value') },
      { message: 'Invalid type: Expected boolean but received "true"', path: at(12, 'value') },
      { message: 'Operator "empty" takes no value', path: at(13, 'value') },
      { message: 'Missing key "value"', path: at(14, 'value') },
      { message: 'Expected at least one value', path: at(15, 'value') },
      { message: 'Expected a list', path: at(16, 'value') },
      { message: 'Expected one of the choices of the Field, not "z"', path: at(17, 'value', 1) },
    ]);
  });
});

describe('Inactive Fields', () => {
  const show = leaf('show', 'eq', true);
  const toggle = { type: 'boolean', name: 'show' };
  const strict = (name: string) =>
    text(name, { required: true, rules: [{ type: 'min_length', requirement: 3 }] });

  it('are hidden or disabled through any Component around them', () => {
    const form = root(
      toggle,
      section([strict('inSection')], { visible: show }),
      {
        type: 'tabs',
        components: [{ type: 'tab', label: 'T', visible: show, components: [strict('inTab')] }],
      },
      object('o', [strict('inObject')], { disabled: { not: show } }),
      repeater('r', [strict('inRow')], { visible: show }),
    );
    const input = { inSection: 'x', inTab: 'x', o: { inObject: 'x' }, r: [{ inRow: 'x' }] };
    expect(validate(form, input)).toEqual({ value: { o: {}, r: [] } });
    expect(validate(form, { ...input, show: true }).issues?.map((issue) => issue.path)).toEqual([
      ['inSection'],
      ['inTab'],
      ['o', 'inObject'],
      ['r', 0, 'inRow'],
    ]);
  });

  it('are skipped whatever their value, even of the wrong type', () => {
    const form = root(
      text('a', { disabled: true, required: true }),
      object('o', [{ type: 'number', name: 'n', required: true }], { disabled: true }),
      repeater('r', [text('t')], {
        disabled: true,
        rules: [{ type: 'min_items', requirement: 1 }],
      }),
    );
    expect(validate(form, { a: 5, o: { n: 'x' }, r: 'not rows' })).toEqual({
      value: { o: {}, r: [] },
    });
  });

  it('keep the key of an Inactive object or Repeater as {} or [], at any depth', () => {
    const form = root(
      object('outer', [object('inner', [text('t')]), repeater('rows', [text('t')])], {
        disabled: true,
      }),
      object('active', [object('inner', [text('t')], { visible: leaf('../hide', 'empty') })]),
      text('hide'),
    );
    expect(validate(form, { outer: { inner: { t: 'x' } }, hide: 'y' })).toEqual({
      value: { outer: {}, active: { inner: {} }, hide: 'y' },
    });
  });

  it('read as empty, so hiding cascades whatever the declaration order', () => {
    const form = root(
      text('c', { required: true, visible: leaf('b', 'not_empty') }),
      text('b', { visible: leaf('a', 'eq', 'on') }),
      text('a'),
    );
    expect(validate(form, { a: 'on', b: 'x' }).issues).toEqual([
      { message: 'Required', path: ['c'] },
    ]);
    expect(validate(form, { a: 'off', b: 'x' })).toEqual({ value: { a: 'off' } });
  });

  it('read as empty when Inactive through an object or Repeater around them', () => {
    const form = root(
      toggle,
      object('o', [text('inner')], { visible: show }),
      text('a', { required: true, visible: leaf('o.inner', 'not_empty') }),
      repeater('r', [text('x')], { disabled: { not: show } }),
      text('b', { required: true, visible: leaf('r', 'not_empty') }),
    );
    expect(validate(form, { show: true, o: { inner: 'x' }, r: [{}] }).issues).toEqual([
      { message: 'Required', path: ['a'] },
      { message: 'Required', path: ['b'] },
    ]);
    expect(validate(form, { o: { inner: 'x' }, r: [{}] })).toEqual({ value: { o: {}, r: [] } });
  });

  it('ignore a forged value, so a client cannot switch a Condition with it', () => {
    const form = root(
      { type: 'choice', name: 'plan', choices: ['free', 'paid'], disabled: true },
      text('company', { visible: leaf('plan', 'eq', 'paid') }),
      text('card', { required: { not: leaf('plan', 'eq', 'free') } }),
    );
    // `plan` is disabled, so it reads as empty: `card` is required and `company` hidden.
    expect(validate(form, { plan: 'free', company: 'ACME' })).toEqual({
      issues: [{ message: 'Required', path: ['card'] }],
    });
    expect(validate(form, { plan: 'paid', company: 'ACME', card: '4111' })).toEqual({
      value: { card: '4111' },
    });
  });
});

describe('required and disabled', () => {
  it('make a Field required while a Condition holds', () => {
    const form = root(
      { type: 'number', name: 'age' },
      text('guardian', { required: leaf('age', 'lt', 18) }),
    );
    expect(validate(form, { age: 12 }).issues).toEqual([
      { message: 'Required', path: ['guardian'] },
    ]);
    expect(validate(form, { age: 30 })).toEqual({ value: { age: 30 } });
  });

  it('accept "at least one of these two" as a mutual required, which is no cycle', () => {
    const form = root(
      text('email', { required: leaf('phone', 'empty') }),
      text('phone', { required: leaf('email', 'empty') }),
    );
    expect(validate(form, {}).issues).toEqual([
      { message: 'Required', path: ['email'] },
      { message: 'Required', path: ['phone'] },
    ]);
    expect(validate(form, { phone: '123' })).toEqual({ value: { phone: '123' } });
  });

  it('make a Field Inactive while disabled', () => {
    const form = root(
      { type: 'boolean', name: 'same' },
      text('billing', { required: true, disabled: leaf('same', 'eq', true) }),
    );
    expect(validate(form, { same: true, billing: 'x' })).toEqual({ value: { same: true } });
    expect(validate(form, { same: false }).issues).toEqual([
      { message: 'Required', path: ['billing'] },
    ]);
  });

  it('sit only where they apply', () => {
    const form = root(
      section([text('a')], { disabled: true }),
      object('o', [text('b')], { required: true }),
      { type: 'content', text: 'Hi', disabled: true },
    );
    expect(loadErrors(form)).toEqual([
      { message: 'Unknown key "disabled"', path: ['components', 0, 'disabled'] },
      { message: 'Unknown key "required"', path: ['components', 1, 'required'] },
      { message: 'Unknown key "disabled"', path: ['components', 2, 'disabled'] },
    ]);
  });
});

describe('cycles', () => {
  it('reject a cycle through visible or disabled', () => {
    const form = root(
      text('a', { visible: leaf('b', 'empty') }),
      text('b', { disabled: leaf('a', 'empty') }),
    );
    expect(loadErrors(form)).toEqual([
      {
        message: 'A Condition cycle through "visible" or "disabled": "a" -> "b" -> "a"',
        path: ['components', 0],
      },
    ]);
  });

  it('reject a Field that hides itself, and a Component that reads a Field inside it', () => {
    const form = root(
      text('a', { visible: leaf('a', 'empty') }),
      section([text('b')], { visible: leaf('b', 'empty') }),
      object('o', [text('c')], { disabled: leaf('o.c', 'empty') }),
      repeater('r', [text('d', { visible: leaf('../r', 'not_empty') })]),
    );
    expect(loadErrors(form)).toEqual([
      {
        message: 'A Condition cycle through "visible" or "disabled": "a" -> "a"',
        path: ['components', 0],
      },
      {
        message:
          'A Condition cycle through "visible" or "disabled": the "section" at components.1 -> "b" -> the "section" at components.1',
        path: ['components', 1],
      },
      {
        message: 'A Condition cycle through "visible" or "disabled": "o" -> "o.c" -> "o"',
        path: ['components', 2],
      },
    ]);
  });

  it('accept a chain that reads in one direction only', () => {
    const form = root(
      text('a'),
      text('b', { visible: leaf('a', 'not_empty') }),
      text('c', { visible: leaf('b', 'not_empty'), disabled: leaf('a', 'eq', 'x') }),
      text('d', { required: leaf('d', 'empty') }),
    );
    expect(() => compile(form)).not.toThrow();
  });
});

describe('locate', () => {
  const compiled = compile(
    root(
      { type: 'boolean', name: 'off' },
      repeater('items', [text('a'), text('b', { visible: leaf('a', 'not_empty') })], {
        disabled: leaf('off', 'eq', true),
      }),
    ),
  );
  const locate = (input: unknown, reference: string, scope: (string | number)[]) => {
    const found = compiled.conditions.evaluate(input).locate(reference, scope);
    return 'error' in found ? found : { path: found.path, active: found.active };
  };

  it('finds a Field from a data scope, and whether it is active', () => {
    const input = { items: [{ a: 'x' }, {}] };
    expect(locate(input, 'b', ['items', 0])).toEqual({ path: ['items', 0, 'b'], active: true });
    expect(locate(input, 'b', ['items', 1])).toEqual({ path: ['items', 1, 'b'], active: false });
    expect(locate(input, '../off', ['items', 1])).toEqual({ path: ['off'], active: true });
    expect(locate({ ...input, off: true }, 'a', ['items', 0])).toEqual({
      path: ['items', 0, 'a'],
      active: false,
    });
    expect(locate(input, 'items', [])).toEqual({ path: ['items'], active: true });
  });

  it('says why a reference leads nowhere', () => {
    expect(locate({}, 'items.a', [])).toEqual({
      error: '"items.a" goes inside the rows of the Repeater "items"',
    });
    expect(locate({}, 'items.0', [])).toEqual({
      error: 'A reference is "../" steps, then names joined by "."',
    });
    expect(locate({}, 'a', ['items'])).toEqual({ error: 'No data scope at "items"' });
  });
});

describe('valueOf', () => {
  const compiled = compile(
    root(
      { type: 'boolean', name: 'off' },
      object('box', [text('a'), text('b', { disabled: leaf('../off', 'eq', true) })]),
      repeater('items', [text('kind'), text('age', { visible: leaf('kind', 'eq', 'dog') })]),
      text('plan'),
    ),
  );
  const valueOf = (form: typeof compiled, input: unknown, reference: string) => {
    const state = form.conditions.evaluate(input);
    const found = state.locate(reference, []);
    if ('error' in found) throw new Error(found.error);
    return state.valueOf(found);
  };
  const input = {
    off: true,
    box: { a: 'A', b: 'B', other: 1 },
    items: [{ kind: 'dog', age: 3 }, { kind: 'cat', age: 9 }, 'odd'],
    plan: 'free',
  };

  it('reads an object and Repeater rows without their Inactive Fields', () => {
    expect(valueOf(compiled, input, 'box')).toEqual({ a: 'A' });
    expect(valueOf(compiled, { ...input, off: false }, 'box')).toEqual({ a: 'A', b: 'B' });
    expect(valueOf(compiled, input, 'items')).toEqual([
      { kind: 'dog', age: 3 },
      { kind: 'cat' },
      'odd',
    ]);
    expect(valueOf(compiled, input, 'box.b')).toBeUndefined();
    expect(valueOf(compiled, input, 'plan')).toBe('free');
  });

  it('reads a Locked Field as its Locked value', () => {
    const locked = lock(compiled, { plan: 'pro', 'box.a': 'L' });
    expect(valueOf(locked, input, 'plan')).toBe('pro');
    expect(valueOf(locked, input, 'box')).toEqual({ a: 'L' });
  });
});

describe('evaluation', () => {
  const form = root(
    { type: 'number', name: 'n' },
    { type: 'multi_choice', name: 'tags', choices: ['a'] },
    object('o', [text('t')]),
    repeater('r', [text('x', { visible: leaf('../o.t', 'eq', 'y') })]),
    text('shown', {
      visible: {
        any: [leaf('n', 'gt', 1), leaf('tags', 'contains', 'a'), leaf('o.t', 'eq', 'y')],
      },
    }),
  );

  it('never throws, whatever the input', () => {
    const odd = [
      undefined,
      null,
      5,
      'x',
      [],
      [1, 2],
      { n: { deep: [] } },
      { o: 'x', r: 'y' },
      { o: [], r: [null, 5, 'z', [{}]] },
      { tags: { 0: 'a' }, o: { t: ['y'] } },
      { n: Number.NaN, tags: 'a', r: [{ x: { toString: 1 } }] },
      Object.create(null),
    ];
    for (const input of odd) {
      expect(() => validate(form, input)).not.toThrow();
      const state = compile(form).conditions.evaluate(input);
      const components = compile(form).definition.components!;
      for (const component of components) {
        expect(() => state.isVisible(component, [])).not.toThrow();
        expect(() => state.isVisible(component, ['r', 99, 'zz'])).not.toThrow();
      }
    }
  });
});

describe('the loaded Definition', () => {
  it('round-trips Conditions through JSON byte for byte', () => {
    const definition = root(
      { type: 'choice', name: 'tier', choices: ['a', 'b'] },
      repeater(
        'r',
        [
          text('x', {
            visible: { all: [leaf('../tier', 'in', ['a', 'b']), { not: leaf('y', 'empty') }] },
            required: { any: [leaf('y', 'eq', 'z')] },
            disabled: false,
          }),
          text('y'),
        ],
        { visible: leaf('tier', 'not_empty'), disabled: leaf('tier', 'eq', 'b') },
      ),
      section([{ type: 'content', text: 'Hi', visible: leaf('tier', 'eq', 'a') }], {
        visible: leaf('tier', 'neq', 'b'),
      }),
    );
    const json = JSON.stringify(definition);
    const loaded = compile(JSON.parse(json)).definition;
    expect(JSON.stringify(loaded)).toBe(json);
    expect(JSON.stringify(compile(JSON.parse(JSON.stringify(loaded))).definition)).toBe(json);
  });

  it('never freezes the caller input', () => {
    const list = ['a'];
    compile(
      root(
        { type: 'choice', name: 'tier', choices: ['a', 'b'] },
        text('x', { visible: leaf('tier', 'in', list) }),
      ),
    );
    expect(Object.isFrozen(list)).toBe(false);
  });

  it('reports every Condition error at once, with the other load errors', () => {
    expect(
      loadErrors(
        root(
          text('a', { visible: leaf('missing', 'empty'), label: 1 }),
          text('b', { visible: { all: [] }, required: 'yes' }),
        ),
      ),
    ).toEqual([
      { message: 'Invalid type: Expected string but received 1', path: ['components', 0, 'label'] },
      { message: '"all" needs at least one Condition', path: ['components', 1, 'visible', 'all'] },
      { message: 'Expected true, false or a Condition', path: ['components', 1, 'required'] },
      { message: 'No Field "missing"', path: ['components', 0, 'visible', 'field'] },
    ]);
  });
});
