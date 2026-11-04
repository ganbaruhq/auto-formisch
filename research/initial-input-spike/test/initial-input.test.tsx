// Probes for initialInput / dirty / reset / schema defaults / schema identity, under real useForm + jsdom.
// `see` logs observed values (results-initial-input.txt is the evidence); the `expect` calls pin the
// facts the report relies on, written after reading the log.
import { describe, it, expect, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, renderHook, act, cleanup, fireEvent, screen } from '@testing-library/react';
import * as v from 'valibot';
import {
  Field, FieldArray, Form, useForm, useField, getInput, setInput, reset, move, swap, insert, remove,
  isDirty, isEdited, isTouched, getDirtyInput, getDirtyPaths, getDeepErrorEntries, setErrors, handleSubmit,
} from '@formisch/react';
import { INTERNAL } from '@formisch/react/internals';
import { compileE, type Node } from '../src/compile';
import { std, log } from '../src/harness';

afterEach(cleanup);
const see = log;
const useRH = (schema: any, opts: any = {}) => renderHook(() => useForm({ schema, ...opts } as any)).result.current as any;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const A = (f: () => void) => act(() => { f(); });

const DEF: Node[] = [
  { kind: 'field', key: 'name', type: 'string' },
  { kind: 'field', key: 'tags', type: 'string[]' },
  { kind: 'object', key: 'meta', children: [{ kind: 'field', key: 'note', type: 'string' }] },
  { kind: 'repeater', key: 'addresses', template: [
    { kind: 'field', key: 'street', type: 'string' },
    { kind: 'repeater', key: 'phones', template: [{ kind: 'field', key: 'num', type: 'string' }] },
  ] },
];
const WITH_ID: Node[] = [{ kind: 'repeater', key: 'rows', template: [
  { kind: 'field', key: 'id', type: 'number' },
  { kind: 'field', key: 'street', type: 'string' },
] }];
const NO_ID: Node[] = [{ kind: 'repeater', key: 'rows', template: [{ kind: 'field', key: 'street', type: 'string' }] }];

async function submit(form: any) {
  let out: any = '<handler not called>';
  await act(async () => { await handleSubmit(form, (o: any) => { out = o; })(); });
  return { out, errors: getDeepErrorEntries(form), rootErrors: form.errors };
}
const items = (form: any, path: any[]) => {
  let s = form[INTERNAL];
  for (const k of path) s = s.children[k];
  return s.items.value.length;
};
const store = (form: any, path: any[] = []) => {
  let s = form[INTERNAL];
  for (const k of path) s = s?.children?.[k];
  return s;
};
const snap = (form: any) => ({
  input: getInput(form), isDirty: isDirty(form), formIsDirty: form.isDirty, dirtyInput: getDirtyInput(form), dirtyPaths: getDirtyPaths(form),
  touched: isTouched(form), edited: isEdited(form), submitted: form.isSubmitted, errors: getDeepErrorEntries(form),
});

// ---------------------------------------------------------------------------------------------
describe('Q1 keys with no Field', () => {
  it('undeclared keys, top-level, nested, in rows', async () => {
    log('\n=== Q1');
    const schema = compileE(NO_ID.concat([{ kind: 'field', key: 'name', type: 'string' }, { kind: 'object', key: 'meta', children: [{ kind: 'field', key: 'note', type: 'string' }] }]));
    const init = { name: 'n', extraTop: 1, meta: { note: 'k', extraNested: 2 }, rows: [{ id: 7, street: 'x' }, { id: 8, street: 'y' }] };
    const form = useRH(schema, { initialInput: init });
    const rootKeys = Object.keys(store(form).children);
    const rowKeys = Object.keys(store(form, ['rows', 0]).children);
    see('store root children', rootKeys);
    see('store row children', rowKeys);
    see('store meta children', Object.keys(store(form, ['meta']).children));
    see('getInput', getInput(form));
    const sub = await submit(form);
    see('onSubmit output', sub);
    see('direct validate', std(schema, init));
    let r: any;
    try { r = getInput(form, { path: ['rows', 0, 'id'] } as any); } catch (e: any) { r = `THROW ${e.message}`; }
    see('getInput at path rows.0.id', r);
    A(() => move(form, { path: ['rows'], from: 0, to: 1 } as any));
    see('after move getInput', getInput(form));
    A(() => swap(form, { path: ['rows'], at: 0, and: 1 } as any));
    see('after swap getInput', getInput(form));

    expect(rootKeys).not.toContain('extraTop');
    expect(rowKeys).toEqual(['street']);
    expect(getInput(form)).toEqual({ rows: [{ street: 'x' }, { street: 'y' }], name: 'n', meta: { note: 'k' } });
    expect(sub.out).toEqual({ rows: [{ street: 'x' }, { street: 'y' }], name: 'n', meta: { note: 'k' } });
    expect(std(schema, init)).toEqual({ value: { rows: [{ street: 'x' }, { street: 'y' }], name: 'n', meta: { note: 'k' } } });
  });

  it('control: id declared as a Field in the row schema, no <Field> rendered', async () => {
    const schema = compileE(WITH_ID);
    const form = useRH(schema, { initialInput: { rows: [{ id: 7, street: 'x' }, { id: 8, street: 'y' }, { id: 9, street: 'z' }] } });
    see('control getInput', getInput(form));
    A(() => move(form, { path: ['rows'], from: 0, to: 2 } as any));
    see('control after move 0->2', getInput(form));
    see('control dirty after move', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    const sub1 = await submit(form);
    see('control submit after move', sub1);
    A(() => swap(form, { path: ['rows'], at: 0, and: 1 } as any));
    see('control after swap 0,1', getInput(form));
    A(() => move(form, { path: ['rows'], from: 2, to: 0 } as any));
    see('control after move back 2->0', { input: getInput(form), dirty: isDirty(form) });
    const sub2 = await submit(form);
    see('control submit', sub2);
    expect(sub1.out).toEqual({ rows: [{ id: 8, street: 'y' }, { id: 9, street: 'z' }, { id: 7, street: 'x' }] });
    expect(sub2.out.rows.map((x: any) => x.id).sort()).toEqual([7, 8, 9]);
  });

  it('control: looseObject root and rows', async () => {
    const leaf = v.optional(v.unknown());
    const schema: any = v.looseObject({ a: leaf, rows: v.array(v.looseObject({ b: leaf })) });
    const init = { a: 1, x: 2, rows: [{ b: 1, y: 2 }] };
    const form = useRH(schema, { initialInput: init });
    see('loose store getInput', getInput(form));
    see('loose submit', await submit(form));
    see('loose direct', std(schema, init));
    expect(getInput(form)).toEqual({ a: 1, rows: [{ b: 1 }] });
    expect((std(schema, init) as any).value).toEqual(init);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q2 repeaters', () => {
  const init = { name: 'n', addresses: [
    { street: 's0', phones: [{ num: 'p00' }, { num: 'p01' }] },
    { street: 's1', phones: [] },
    { street: 's2', phones: [{ num: 'p20' }] },
  ] };
  it('initial rows, nested, reset row count', async () => {
    log('\n=== Q2');
    const schema = compileE(DEF);
    const form = useRH(schema, { initialInput: init });
    see('rows items count', { top: items(form, ['addresses']), n0: items(form, ['addresses', 0, 'phones']), n1: items(form, ['addresses', 1, 'phones']), n2: items(form, ['addresses', 2, 'phones']) });
    see('getInput', getInput(form));
    see('dirty', isDirty(form));
    see('submit', await submit(form));
    expect(items(form, ['addresses'])).toBe(3);
    expect(items(form, ['addresses', 0, 'phones'])).toBe(2);
    expect((getInput(form) as any).addresses).toEqual(init.addresses);

    // shrink, top and nested
    A(() => reset(form, { initialInput: { addresses: [{ street: 'a', phones: [{ num: 'q' }] }] } } as any));
    see('after reset to 1 row', snap(form));
    expect((getInput(form) as any).addresses).toEqual([{ street: 'a', phones: [{ num: 'q' }] }]);
    // grow beyond stale children
    const four = { addresses: [0, 1, 2, 3].map((i) => ({ street: `g${i}`, phones: Array.from({ length: i }, (_, j) => ({ num: `g${i}${j}` })) })) };
    A(() => reset(form, { initialInput: four } as any));
    see('after reset to 4 rows', snap(form));
    expect((getInput(form) as any).addresses).toEqual(four.addresses);
    expect(isDirty(form)).toBe(false);
    see('submit after grow', await submit(form));
    // reset without config returns to the most recent baseline, not the mount-time one
    A(() => setInput(form, { path: ['addresses', 0, 'street'], input: 'edit' } as any));
    A(() => reset(form));
    see('plain reset after re-seed', getInput(form));
    expect((getInput(form) as any).addresses).toEqual(four.addresses);
    // zero rows then stale-slot behaviour on insert/setInput
    A(() => reset(form, { initialInput: { addresses: [] } } as any));
    see('reset to 0 rows', snap(form));
    A(() => insert(form, { path: ['addresses'] } as any));
    see('insert into 0 rows (stale child reused)', snap(form));
    expect((getInput(form) as any).addresses).toEqual([{ street: undefined, phones: [] }]);
    A(() => reset(form, { initialInput: { addresses: [] } } as any));
    A(() => setInput(form, { path: ['addresses'], input: [{ street: 'g0' }, { street: 'new' }] } as any));
    see('setInput grow over stale children', snap(form));
  });

  it('rendered DOM follows a row-count change on reset', async () => {
    const schema = compileE(DEF);
    const h: any = {};
    function App() {
      const form = useForm({ schema, initialInput: init } as any) as any;
      h.form = form;
      return (
        <Form of={form} onSubmit={() => {}}>
          <FieldArray of={form} path={['addresses'] as any}>
            {(arr: any) => arr.items.map((id: string, i: number) => (
              <div key={id}>
                <Field of={form} path={['addresses', i, 'street'] as any}>
                  {(f: any) => <input data-testid="street" {...f.props} value={f.input ?? ''} />}
                </Field>
                <FieldArray of={form} path={['addresses', i, 'phones'] as any}>
                  {(p: any) => p.items.map((pid: string, j: number) => (
                    <Field key={pid} of={form} path={['addresses', i, 'phones', j, 'num'] as any}>
                      {(f: any) => <input data-testid="num" {...f.props} value={f.input ?? ''} />}
                    </Field>
                  ))}
                </FieldArray>
              </div>
            ))}
          </FieldArray>
        </Form>
      );
    }
    render(<App />);
    const dom = () => ({ s: screen.queryAllByTestId('street').map((x: any) => x.value), n: screen.queryAllByTestId('num').map((x: any) => x.value) });
    see('DOM mount', dom());
    expect(dom()).toEqual({ s: ['s0', 's1', 's2'], n: ['p00', 'p01', 'p20'] });
    A(() => reset(h.form, { initialInput: { addresses: [{ street: 'a', phones: [{ num: 'q' }] }] } } as any));
    see('DOM after reset to 1', dom());
    expect(dom()).toEqual({ s: ['a'], n: ['q'] });
    A(() => reset(h.form, { initialInput: { addresses: [{ street: 'b', phones: [] }, { street: 'c', phones: [{ num: 'r' }, { num: 't' }] }] } } as any));
    see('DOM after reset to 2', dom());
    expect(dom()).toEqual({ s: ['b', 'c'], n: ['r', 't'] });
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q3 wrongly typed initialInput', () => {
  const schema = () => compileE(DEF);
  const cases: [string, any][] = [
    ['leaf number for text', { name: 42 }],
    ['repeater number', { addresses: 5 }],
    ['repeater object', { addresses: { a: 1 } }],
    ['repeater object with length', { addresses: { length: 2 } }],
    ['repeater string', { addresses: 'abc' }],
    ['repeater true', { addresses: true }],
    ['repeater null', { addresses: null }],
    ['repeater row is number', { addresses: [5, { street: 'ok' }] }],
    ['repeater row is array', { addresses: [['z']] }],
    ['multi number', { tags: 5 }],
    ['multi string', { tags: 'abc' }],
    ['multi object', { tags: { a: 1 } }],
    ['multi with number elements', { tags: [1, 2] }],
    ['object given number', { meta: 5 }],
    ['object given array', { meta: ['x'] }],
    ['leaf object for text', { name: { x: 1 } }],
  ];
  it('table', async () => {
    log('\n=== Q3');
    for (const [label, init] of cases) {
      let form: any;
      try { form = useRH(schema(), { initialInput: init }); } catch (e: any) { see(`[${label}] THROW at init`, e.message); continue; }
      see(`[${label}] store getInput`, getInput(form));
      see(`[${label}] dirty`, isDirty(form));
      see(`[${label}] submit`, await submit(form));
      see(`[${label}] direct validate of same raw value`, std(schema(), init));
    }
    const f1 = useRH(schema(), { initialInput: { addresses: 5 } });
    expect((getInput(f1) as any).addresses).toEqual([]);
    expect((await submit(f1)).out.addresses).toEqual([]);
    expect((std(schema(), { addresses: 5 }) as any).issues).toBeTruthy();
    const f2 = useRH(schema(), { initialInput: { tags: 'abc' } });
    expect((getInput(f2) as any).tags).toEqual(['a', 'b', 'c']);
    const f3 = useRH(schema(), { initialInput: { addresses: 'abc' } });
    expect(items(f3, ['addresses'])).toBe(3);
    const f4 = useRH(schema(), { initialInput: { name: 42 } });
    expect((getInput(f4) as any).name).toBe(42);
    const s4 = await submit(f4);
    expect(s4.out).toBe('<handler not called>');
    expect(s4.errors[0].path).toEqual(['name']);
  });
  it('same shapes through reset and setInput', async () => {
    for (const [label, cfg] of [
      ['reset repeater number', { addresses: 5 }], ['reset repeater string', { addresses: 'abc' }], ['reset multi string', { tags: 'abc' }], ['reset leaf number', { name: 42 }],
    ] as [string, any][]) {
      const form = useRH(schema(), { initialInput: { addresses: [{ street: 'a' }], tags: ['t'] } });
      try { A(() => reset(form, { initialInput: cfg } as any)); see(`[${label}]`, snap(form)); } catch (e: any) { see(`[${label}] THROW`, e.message); }
    }
    for (const [label, path, input] of [
      ['setInput repeater number', ['addresses'], 5], ['setInput repeater string', ['addresses'], 'abc'], ['setInput multi number', ['tags'], 5], ['setInput multi string', ['tags'], 'xy'], ['setInput object number', ['meta'], 5],
    ] as [string, any[], any][]) {
      const form = useRH(schema(), { initialInput: { addresses: [{ street: 'a' }, { street: 'b' }], tags: ['t'] } });
      try { A(() => setInput(form, { path, input } as any)); see(`[${label}]`, { input: getInput(form), dirty: isDirty(form) }); } catch (e: any) { see(`[${label}] THROW`, e.message); }
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q4 dirty with array/object values', () => {
  const leaf = v.optional(v.unknown());
  // custom-type style: value kind leaf, compiled style three-stage pipe
  const schema: any = v.pipe(v.object({ geo: leaf, list: leaf, txt: leaf }), v.transform((x: any) => x), v.object({ geo: leaf, list: leaf, txt: leaf }));
  const mountBoth = (s: any, path: any[], init: any) =>
    renderHook(() => { const form = useForm({ schema: s, initialInput: init } as any) as any; const field = useField(form, { path } as any) as any; return { form, field }; }).result;

  it('value-kind leaf', async () => {
    log('\n=== Q4 leaf (value kind)');
    const geo = { lat: 1, nested: { a: [1] } };
    const list = [1, { x: 2 }];
    const r = mountBoth(schema, ['geo'], { geo, list, txt: 't' });
    const q = () => ({
      isDirtyForm: isDirty(r.current.form), formProp: r.current.form.isDirty, isDirtyField: isDirty(r.current.form, { path: ['geo'] } as any), fieldProp: r.current.field.isDirty,
      edited: isEdited(r.current.form), dirtyInput: getDirtyInput(r.current.form), dirtyPaths: getDirtyPaths(r.current.form), sameRefAsInit: getInput(r.current.form, { path: ['geo'] } as any) === geo,
    });
    see('store kind', store(r.current.form, ['geo']).kind);
    see('after init', q());
    expect(q().isDirtyForm).toBe(false);
    expect(q().sameRefAsInit).toBe(true);
    A(() => setInput(r.current.form, { path: ['geo'], input: structuredClone(geo) } as any));
    see('setInput deep-equal new object', q());
    expect(q().isDirtyField).toBe(true);
    A(() => r.current.field.onChange(geo));
    see('field.onChange same ref as initial', q());
    expect(q().isDirtyField).toBe(false);
    A(() => r.current.field.onChange(structuredClone(geo)));
    see('field.onChange deep-equal new object', q());
    expect(r.current.field.isDirty).toBe(true);
    A(() => r.current.field.onChange({ lat: 2 }));
    see('real edit', q());
    A(() => r.current.field.onChange(structuredClone(geo)));
    see('restore deep-equal', q());
    expect(q().isDirtyField).toBe(true);
    A(() => reset(r.current.form));
    see('reset(form)', q());
    expect(q().sameRefAsInit).toBe(true);
    expect(q().isDirtyField).toBe(false);
    // list leaf (array value in a value-kind leaf)
    A(() => setInput(r.current.form, { path: ['list'], input: structuredClone(list) } as any));
    see('array value leaf, deep-equal new', { dirty: isDirty(r.current.form, { path: ['list'] } as any), kind: store(r.current.form, ['list']).kind });
    expect(isDirty(r.current.form, { path: ['list'] } as any)).toBe(true);
    A(() => reset(r.current.form));
    // aliasing: mutate the object read out of the store
    (getInput(r.current.form, { path: ['geo'] } as any) as any).lat = 999;
    see('mutated the ref read from store', { caller: geo.lat, dirty: isDirty(r.current.form) });
    A(() => reset(r.current.form));
    see('reset after mutation', getInput(r.current.form, { path: ['geo'] } as any));
    expect(geo.lat).toBe(999);
  });

  it('value-kind leaf: empty baselines', () => {
    const r = mountBoth(schema, ['geo'], {});
    const d = () => isDirty(r.current.form, { path: ['geo'] } as any);
    see('no initial: dirty', d());
    for (const [label, val] of [['""', ''], ['NaN', NaN], ['null', null], ['[]', []], ['{}', {}], ['0', 0], ['undefined', undefined]] as [string, any][]) {
      A(() => r.current.field.onChange(val));
      see(`baseline undefined, onChange(${label}) dirty`, d());
    }
    const s = mountBoth(schema, ['geo'], { geo: 'x' });
    A(() => s.current.field.onChange(''));
    see('baseline "x", onChange("") dirty', isDirty(s.current.form));
    A(() => s.current.field.onChange(undefined));
    see('baseline "x", onChange(undefined) dirty', isDirty(s.current.form));
  });

  it('multi_choice real array structure', async () => {
    log('\n=== Q4 multi_choice (array kind)');
    const sc = compileE([{ kind: 'field', key: 'tags', type: 'string[]' }]);
    const tags = ['a', 'b'];
    const r = mountBoth(sc, ['tags'], { tags });
    const q = () => ({
      isDirtyForm: isDirty(r.current.form), formProp: r.current.form.isDirty, isDirtyField: isDirty(r.current.form, { path: ['tags'] } as any), fieldProp: r.current.field.isDirty,
      input: getInput(r.current.form, { path: ['tags'] } as any), dirtyInput: getDirtyInput(r.current.form), dirtyPaths: getDirtyPaths(r.current.form),
    });
    see('store kind', store(r.current.form, ['tags']).kind);
    see('after init', q());
    see('getInput ref === init', getInput(r.current.form, { path: ['tags'] } as any) === tags);
    expect(q().isDirtyField).toBe(false);
    A(() => setInput(r.current.form, { path: ['tags'], input: ['a', 'b'] } as any));
    see('setInput deep-equal new array', q());
    expect(q().isDirtyField).toBe(false);
    A(() => r.current.field.onChange(['b', 'a']));
    see('reorder via onChange', q());
    expect(q().isDirtyField).toBe(true);
    A(() => r.current.field.onChange(['a', 'b']));
    see('restore order', q());
    expect(q().isDirtyField).toBe(false);
    A(() => r.current.field.onChange(['a']));
    see('shrink', q());
    expect(q().isDirtyField).toBe(true);
    A(() => r.current.field.onChange(['a', 'b']));
    see('restore after shrink', q());
    expect(q().isDirtyField).toBe(false);
    A(() => r.current.field.onChange(['a', 'b', 'c']));
    see('grow', q());
    A(() => r.current.field.onChange(['a', 'b']));
    see('restore after grow', q());
    expect(q().isDirtyField).toBe(false);
    A(() => r.current.field.onChange(['x', 'y']));
    A(() => reset(r.current.form));
    see('reset(form)', q());
    expect(q().input).toEqual(['a', 'b']);
    expect(q().isDirtyField).toBe(false);
    A(() => swap(r.current.form, { path: ['tags'], at: 0, and: 1 } as any));
    see('swap', q());
    expect(q().isDirtyField).toBe(true);
    A(() => swap(r.current.form, { path: ['tags'], at: 0, and: 1 } as any));
    see('swap back', q());
    A(() => setInput(r.current.form, { path: ['tags'], input: ['b', 'a'] } as any));
    see('after swaps then setInput reorder', q());
    A(() => reset(r.current.form));
    A(() => { remove(r.current.form, { path: ['tags'], at: 1 } as any); insert(r.current.form, { path: ['tags'], at: 1, initialInput: 'b' } as any); });
    see('remove then insert same value', q());
  });

  it('multi_choice with object elements, empty baseline, nullish', () => {
    const sc = compileE([{ kind: 'field', key: 'tags', type: 'string[]' }]);
    const r = mountBoth(sc, ['tags'], { tags: [{ id: 1 }] });
    A(() => r.current.field.onChange([{ id: 1 }]));
    see('object elements, deep-equal new', { dirty: r.current.field.isDirty, kind: store(r.current.form, ['tags', 0]).kind });
    expect(r.current.field.isDirty).toBe(true);
    const e = mountBoth(sc, ['tags'], {});
    see('no initial, store', { input: getInput(e.current.form), dirty: e.current.field.isDirty });
    A(() => e.current.field.onChange(['a']));
    see('no initial, set [a]', e.current.field.isDirty);
    A(() => e.current.field.onChange([]));
    see('no initial, back to []', e.current.field.isDirty);
    A(() => e.current.field.onChange(undefined));
    see('no initial, onChange(undefined)', { input: getInput(e.current.form), dirty: e.current.field.isDirty, st: store(e.current.form, ['tags']).input.value });
    const opt: any = v.object({ tags: v.optional(v.array(v.unknown())) });
    const o = mountBoth(opt, ['tags'], {});
    see('v.optional(array), no initial', { input: getInput(o.current.form), dirty: o.current.field.isDirty });
    A(() => o.current.field.onChange([]));
    see('v.optional(array), set []', { input: getInput(o.current.form), dirty: o.current.field.isDirty });
    A(() => o.current.field.onChange(undefined));
    see('v.optional(array), back to undefined', { input: getInput(o.current.form), dirty: o.current.field.isDirty });
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q5 reset with initialInput and keep flags', () => {
  const schema = () => compileE([
    { kind: 'field', key: 'name', type: 'string', rules: [{ type: 'minLength', n: 3, message: 'min3' }] },
    { kind: 'field', key: 'other', type: 'string' },
    { kind: 'repeater', key: 'rows', template: [{ kind: 'field', key: 'street', type: 'string' }] },
  ]);
  const start = { name: 'orig', other: 'o', rows: [{ street: 's0' }, { street: 's1' }] };
  const next = { name: 'seed', other: 'p', rows: [{ street: 'n0' }, { street: 'n1' }] };
  const nextLong = { name: 'seed', other: 'p', rows: [{ street: 'n0' }, { street: 'n1' }, { street: 'n2' }] };
  const nextShort = { name: 'seed', other: 'p', rows: [{ street: 'n0' }] };

  // Dirties everything: failed submit (errors + submitted), an edited leaf and a moved row.
  async function dirtied(init = start) {
    const form = useRH(schema(), { initialInput: init });
    A(() => setInput(form, { path: ['name'], input: 'x' } as any));
    A(() => setInput(form, { path: ['rows', 0, 'street'], input: 'edit' } as any));
    await submit(form);
    A(() => setErrors(form, { path: ['other'], errors: ['manual'] } as any));
    return form;
  }

  it('flag table', async () => {
    log('\n=== Q5');
    const before = await dirtied();
    see('before reset', snap(before));
    const configs: [string, any][] = [
      ['no flags, no initialInput', {}],
      ['initialInput', { initialInput: next }],
      ['initialInput+keepInput', { initialInput: next, keepInput: true }],
      ['initialInput+keepTouched', { initialInput: next, keepTouched: true }],
      ['initialInput+keepEdited', { initialInput: next, keepEdited: true }],
      ['initialInput+keepErrors', { initialInput: next, keepErrors: true }],
      ['initialInput+keepSubmitted', { initialInput: next, keepSubmitted: true }],
      ['all keep', { initialInput: next, keepInput: true, keepTouched: true, keepEdited: true, keepErrors: true, keepSubmitted: true }],
      ['keepInput only (no initialInput)', { keepInput: true }],
      ['keepInput, longer rows', { initialInput: nextLong, keepInput: true }],
      ['keepInput, shorter rows', { initialInput: nextShort, keepInput: true }],
      ['initialInput partial', { initialInput: { name: 'seed' } }],
      ['initialInput: undefined', { initialInput: undefined }],
    ];
    const out: Record<string, any> = {};
    for (const [label, cfg] of configs) {
      const form = await dirtied();
      A(() => reset(form, cfg));
      out[label] = { ...snap(form), form };
      see(`[${label}]`, snap(form));
      see(`   rows counts`, { items: items(form, ['rows']), start: store(form, ['rows']).startItems.value.length, initial: store(form, ['rows']).initialItems.value.length });
    }
    expect(out['initialInput'].input).toEqual(next);
    expect(out['initialInput'].isDirty).toBe(false);
    expect(out['initialInput'].errors).toEqual([]);
    expect(out['initialInput'].submitted).toBe(false);
    expect(out['initialInput+keepTouched'].touched).toBe(true);
    expect(out['initialInput+keepEdited'].edited).toBe(true);
    expect(out['initialInput+keepSubmitted'].submitted).toBe(true);
    expect(out['initialInput+keepErrors'].errors.length).toBeGreaterThan(0);
    expect(out['initialInput+keepInput'].input.name).toBe('x');
    expect(out['initialInput+keepInput'].isDirty).toBe(true);
  });

  it('baseline after re-seed, getDirtyInput, repeaters', async () => {
    const form = useRH(schema(), { initialInput: start });
    A(() => reset(form, { initialInput: next } as any));
    A(() => setInput(form, { path: ['name'], input: 'orig' } as any));
    see('edit to OLD baseline', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    expect(getDirtyInput(form)).toEqual({ name: 'orig' });
    A(() => setInput(form, { path: ['name'], input: 'seed' } as any));
    see('edit to NEW baseline', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    expect(isDirty(form)).toBe(false);
    A(() => setInput(form, { path: ['rows', 1, 'street'], input: 'zz' } as any));
    see('edit row 1', { dirty: isDirty(form), dirtyInput: getDirtyInput(form), paths: getDirtyPaths(form) });
    expect(getDirtyInput(form)).toEqual({ rows: [{ street: 'n0' }, { street: 'zz' }] });
    expect(getDirtyPaths(form)).toEqual([]);
    A(() => setInput(form, { path: ['rows', 1, 'street'], input: 'n1' } as any));
    see('restore row 1', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    expect(isDirty(form)).toBe(false);
    A(() => move(form, { path: ['rows'], from: 0, to: 1 } as any));
    see('move rows', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    expect(getDirtyInput(form)).toEqual({ rows: [{ street: 'n1' }, { street: 'n0' }] });
    A(() => move(form, { path: ['rows'], from: 1, to: 0 } as any));
    see('move back', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    expect(isDirty(form)).toBe(false);
    A(() => insert(form, { path: ['rows'], initialInput: { street: 'added' } } as any));
    see('insert after re-seed', { dirty: isDirty(form), dirtyInput: getDirtyInput(form) });
    A(() => remove(form, { path: ['rows'], at: 2 } as any));
    see('remove inserted', { dirty: isDirty(form), dirtyInput: getDirtyInput(form), input: getInput(form) });
    expect(isDirty(form)).toBe(false);
  });

  it('keepInput with rows: moved order, row count mismatch, follow-up', async () => {
    const f = useRH(schema(), { initialInput: start });
    A(() => move(f, { path: ['rows'], from: 0, to: 1 } as any));
    A(() => reset(f, { keepInput: true }));
    see('moved, keepInput, no initialInput', { ...snap(f) });
    A(() => reset(f));
    see('  then plain reset', getInput(f));

    const g = useRH(schema(), { initialInput: start });
    A(() => reset(g, { initialInput: next, keepInput: true } as any));
    see('unedited, re-seed, keepInput (same row count)', { ...snap(g) });
    expect(getInput(g)).toEqual(start);
    expect(isDirty(g)).toBe(true);
    A(() => reset(g));
    see('  then plain reset', { ...snap(g) });
    expect(getInput(g)).toEqual(next);

    const l = useRH(schema(), { initialInput: start });
    A(() => reset(l, { initialInput: nextLong, keepInput: true } as any));
    see('re-seed longer keepInput', { ...snap(l) });
    expect(items(l, ['rows'])).toBe(2);
    A(() => setInput(l, { path: ['rows'], input: nextLong.rows } as any));
    see('  then setInput to exactly new baseline', { ...snap(l) });
    A(() => reset(l));
    see('  then plain reset', { ...snap(l) });

    const s = useRH(schema(), { initialInput: start });
    A(() => reset(s, { initialInput: nextShort, keepInput: true } as any));
    see('re-seed shorter keepInput', { ...snap(s) });
    expect(items(s, ['rows'])).toBe(2);
    A(() => reset(s));
    see('  then plain reset', { ...snap(s) });

    const c = useRH(schema(), { initialInput: start });
    A(() => reset(c, { initialInput: nextShort } as any));
    A(() => setInput(c, { path: ['rows'], input: [{ street: 'n0' }, { street: 's1' }] } as any));
    see('shrink reset, setInput regrow with value of the discarded row', { ...snap(c), leafDirty: isDirty(c, { path: ['rows', 1, 'street'] } as any), leafStart: store(c, ['rows', 1, 'street']).startInput.value });
    A(() => reset(c));
    A(() => setInput(c, { path: ['rows'], input: [{ street: 'n0' }] } as any));
    see('  then back to baseline', { dirty: isDirty(c), dirtyInput: getDirtyInput(c) });
  });

  it('field-level reset with initialInput', async () => {
    const form = useRH(schema(), { initialInput: start });
    A(() => setInput(form, { path: ['name'], input: 'x' } as any));
    A(() => setInput(form, { path: ['other'], input: 'y' } as any));
    A(() => reset(form, { path: ['name'], initialInput: 'fresh' } as any));
    see('field reset: name re-seeded, other untouched', { ...snap(form) });
    A(() => reset(form, { path: ['rows'], initialInput: [{ street: 'only' }] } as any));
    see('field reset rows', { ...snap(form) });
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q6 schema-level default', () => {
  const dflt = () => v.optional(v.string(), 'VN');
  const loose = () => v.optional(v.unknown());
  const looseD = () => v.optional(v.unknown(), 'VN');
  const id = (x: any) => x;
  const dropEmpty = (x: any) => { const o: any = {}; for (const k of Object.keys(x)) if (x[k] !== undefined && x[k] !== '') o[k] = x[k]; return o; };
  const variants: [string, any][] = [
    ['plain v.object, optional(string,VN)', v.object({ c: dflt() })],
    ['pipe: default on skeleton+typed, identity prep', (v.pipe as any)(v.object({ c: looseD() }), v.transform(id), v.object({ c: dflt() }))],
    ['pipe: default on skeleton only, identity prep', (v.pipe as any)(v.object({ c: looseD() }), v.transform(id), v.object({ c: v.optional(v.string()) }))],
    ['pipe: default on typed only, identity prep', (v.pipe as any)(v.object({ c: loose() }), v.transform(id), v.object({ c: dflt() }))],
    ['pipe: default on typed only, prep drops empty', (v.pipe as any)(v.object({ c: loose() }), v.transform(dropEmpty), v.object({ c: dflt() }))],
    ['pipe: default on skeleton only, prep drops empty', (v.pipe as any)(v.object({ c: looseD() }), v.transform(dropEmpty), v.object({ c: v.optional(v.string()) }))],
  ];
  it('table', async () => {
    log('\n=== Q6');
    for (const [label, schema] of variants) {
      const form = useRH(schema);
      const row: any = { initial: store(form, ['c']).input.value, initialDirty: isDirty(form), direct_absent: std(schema, {}) };
      row.submitUntouched = (await submit(form)).out;
      A(() => setInput(form, { path: ['c'], input: undefined } as any));
      row.afterClearStore = store(form, ['c']).input.value; row.afterClearDirty = isDirty(form); row.afterClearDirtyInput = getDirtyInput(form);
      row.submitAfterClearUndefined = (await submit(form)).out;
      row.direct_undefined = std(schema, { c: undefined });
      A(() => setInput(form, { path: ['c'], input: '' } as any));
      row.submitAfterEmptyString = (await submit(form)).out;
      A(() => reset(form));
      row.afterPlainReset = store(form, ['c']).input.value;
      A(() => reset(form, { initialInput: {} } as any));
      row.afterResetInitialEmpty = store(form, ['c']).input.value; row.afterResetInitialEmptyDirty = isDirty(form);
      row.submitAfterResetInitialEmpty = (await submit(form)).out;
      see(`[${label}]`, row);
    }
    const plain = useRH(v.object({ c: dflt() }));
    expect(getInput(plain)).toEqual({ c: 'VN' });
    A(() => setInput(plain, { path: ['c'], input: undefined } as any));
    expect((await submit(plain)).out).toEqual({ c: 'VN' });
  });
  it('with initialInput, and default in repeater rows', async () => {
    const s: any = v.object({ c: dflt() });
    see('initialInput {c:undefined}', getInput(useRH(s, { initialInput: { c: undefined } })));
    see('initialInput {c:"US"}', getInput(useRH(s, { initialInput: { c: 'US' } })));
    see('initialInput {c:""} ', getInput(useRH(s, { initialInput: { c: '' } })));
    const rows: any = v.object({ rows: v.array(v.object({ c: dflt(), n: v.optional(v.string()) })) });
    const f = useRH(rows);
    A(() => insert(f, { path: ['rows'] } as any));
    see('first insert (new child store)', getInput(f));
    expect(getInput(f)).toEqual({ rows: [{ c: 'VN', n: undefined }] });
    A(() => remove(f, { path: ['rows'], at: 0 } as any));
    A(() => insert(f, { path: ['rows'] } as any));
    see('insert after remove (reused child store)', getInput(f));
    expect(getInput(f)).toEqual({ rows: [{ c: undefined, n: undefined }] });
    see('  submit of that row', await submit(f));
  });
});

// ---------------------------------------------------------------------------------------------
describe('Q7 schema identity', () => {
  const leaf = () => v.optional(v.unknown());
  const skeleton: any = v.object({ name: leaf(), type: leaf() });
  const typed: any = v.object({ name: v.optional(v.string()), type: v.picklist(['company', 'person']) });
  const prepA = (x: any) => ({ ...x, type: 'company' });
  const prepB = (x: any) => ({ ...x, type: 'person' });
  const build = (p: any): any => (v.pipe as any)(skeleton, v.transform(p), typed);

  function setup(getSchema: () => any, opts: any = {}) {
    return renderHook(({ s }: any) => useForm({ schema: s, ...opts } as any), { initialProps: { s: getSchema() } });
  }

  it('per-render schema identity vs stable', async () => {
    log('\n=== Q7');
    const stable = build(prepA);
    const r1 = setup(() => stable, { initialInput: { name: 'n' } });
    const f1 = r1.result.current as any;
    r1.rerender({ s: stable });
    see('stable: same form object across rerender', r1.result.current === f1);
    see('stable: submit', await submit(r1.result.current));

    let runs = 0;
    const r2 = renderHook(({ p }: any) => useForm({ schema: build((x: any) => { runs++; return p(x); }), initialInput: { name: 'n' } } as any), { initialProps: { p: prepA } });
    const f2 = r2.result.current as any;
    A(() => setInput(f2, { path: ['name'], input: 'edited' } as any));
    r2.rerender({ p: prepB });
    see('per-render: same form object, input preserved', { same: r2.result.current === f2, input: getInput(r2.result.current as any) });
    const sub = await submit(r2.result.current);
    see('per-render: rerendered with prepB, submit uses', sub);
    expect(r2.result.current).toBe(f2);
    expect(sub.out.type).toBe('company');

    // New initialInput on rerender also ignored; new shape not reachable
    const r3 = renderHook(({ s, i }: any) => useForm({ schema: s, initialInput: i } as any), { initialProps: { s: stable, i: { name: 'one' } } });
    r3.rerender({ s: stable, i: { name: 'two' } });
    see('rerender with new initialInput', getInput(r3.result.current as any));
    expect(getInput(r3.result.current as any)).toEqual({ name: 'one', type: undefined });
    const r4 = renderHook(({ s }: any) => { const form = useForm({ schema: s } as any) as any; return form; }, { initialProps: { s: stable } });
    r4.rerender({ s: v.object({ name: leaf(), type: leaf(), extra: leaf() }) });
    let thrown: any = 'no throw';
    try { getInput(r4.result.current as any, { path: ['extra'] } as any); } catch (e: any) { thrown = e.message; }
    see('new schema adds key, reading path', { thrown, keys: Object.keys(store(r4.result.current, []).children) });
    const orig = console.error; console.error = () => {};
    try {
      let t2: any = 'no throw';
      const Comp = ({ s }: any) => { const form = useForm({ schema: s } as any) as any; const f = useField(form, { path: [Object.keys(s.entries).at(-1)] } as any) as any; return <i>{String(f.input)}</i>; };
      const { rerender } = render(<Comp s={stable} />);
      try { rerender(<Comp s={v.object({ name: leaf(), extra: leaf() })} />); } catch (e: any) { t2 = e.message; }
      see('useField for a key only in the later schema', t2);
    } finally { console.error = orig; }
  });

  it('shared skeleton/typed, two prep closures, forged input', async () => {
    const a = build(prepA);
    const b = build(prepB);
    see('shared parts identity', { skeletonSame: a.pipe[0] === b.pipe[0], typedSame: a.pipe[2] === b.pipe[2], rootDiffer: a !== b, rootType: a.type });
    const forged = { name: 'n', type: 'person' };
    const forgedJunk = { name: 'n', type: 'hacker' };
    const fa = useRH(a, { initialInput: forged });
    const fb = useRH(b, { initialInput: { name: 'n', type: 'company' } });
    const fa2 = useRH(a, { initialInput: forgedJunk });
    const subs = { a: await submit(fa), b: await submit(fb), aJunk: await submit(fa2) };
    const dir = { a: std(a, forged), b: std(b, { name: 'n', type: 'company' }), aJunk: std(a, forgedJunk), aAbsent: std(a, { name: 'n' }) };
    see('useForm submit, forged initialInput', subs);
    see('store still holds forged', { a: getInput(fa), aJunk: getInput(fa2) });
    see('direct validate', dir);
    expect(subs.a.out).toEqual({ name: 'n', type: 'company' });
    expect(subs.b.out).toEqual({ name: 'n', type: 'person' });
    expect(dir.a).toEqual({ value: { name: 'n', type: 'company' } });
    expect(dir.b).toEqual({ value: { name: 'n', type: 'person' } });
    expect(subs.aJunk.out).toEqual({ name: 'n', type: 'company' });
    // forge at runtime through setInput, then interleave A and B on shared parts
    A(() => setInput(fa, { path: ['type'], input: 'person' } as any));
    see('setInput forged then submit A', await submit(fa));
    see('interleaved', [std(a, {}), std(b, {}), std(a, {}), (await submit(fb)).out, (await submit(fa)).out, std(b, {})]);
    // type not in the skeleton at all: prep injects, Field does not exist
    const sk2: any = v.object({ name: leaf() });
    const c = (v.pipe as any)(sk2, v.transform(prepA), typed);
    const fc = useRH(c, { initialInput: { name: 'n', type: 'person' } });
    const sc = await submit(fc);
    see('type absent from skeleton, forged: store/submit/direct', { store: getInput(fc), submit: sc, direct: std(c, { name: 'n', type: 'person' }) });
    expect(sc.out).toEqual({ name: 'n', type: 'company' });
    // both forms mounted side by side from shared parts
    const dual: any = {};
    function Both() { dual.a = useForm({ schema: a, initialInput: { name: 'A' } } as any); dual.b = useForm({ schema: b, initialInput: { name: 'B' } } as any); return null; }
    render(<Both />);
    see('two forms mounted together', [(await submit(dual.a)).out, (await submit(dual.b)).out]);
  });

  it('remount via key with a new schema', async () => {
    const a = build(prepA);
    const b = build(prepB);
    const c: any = (v.pipe as any)(v.object({ other: leaf(), rows: v.fallback(v.array(v.object({ s: leaf() })), (d: any) => d?.value) }), v.transform((x: any) => x), v.object({ other: v.optional(v.string()), rows: v.array(v.object({ s: v.optional(v.string()) })) }));
    const h: any = { subs: [] };
    function Inner({ schema, init, path }: any) {
      const form = useForm({ schema, initialInput: init } as any) as any;
      h.form = form;
      return (
        <Form of={form} onSubmit={(o: any) => { h.subs.push(o); }} data-testid="form">
          <Field of={form} path={[path] as any}>{(f: any) => <input data-testid="f" {...f.props} value={f.input ?? ''} />}</Field>
        </Form>
      );
    }
    const errs: any[] = [];
    const orig = console.error; console.error = (...x: any[]) => { errs.push(String(x[0]).slice(0, 120)); };
    const { rerender } = render(<Inner key="a" schema={a} init={{ name: 'one' }} path="name" />);
    const f0 = h.form;
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'typed' } });
    A(() => { fireEvent.submit(screen.getByTestId('form')); });
    await flush();
    see('key a: submit', h.subs.at(-1));
    rerender(<Inner key="b" schema={b} init={{ name: 'two' }} path="name" />);
    see('key b: new form, DOM value, dirty', { newForm: h.form !== f0, dom: (screen.getByTestId('f') as any).value, dirty: h.form.isDirty });
    A(() => { fireEvent.submit(screen.getByTestId('form')); });
    await flush();
    see('key b: submit', h.subs.at(-1));
    rerender(<Inner key="c" schema={c} init={{ other: 'o', rows: [{ s: 'r' }] }} path="other" />);
    see('key c (different shape): DOM, input', { dom: (screen.getByTestId('f') as any).value, input: getInput(h.form) });
    A(() => { fireEvent.submit(screen.getByTestId('form')); });
    await flush();
    see('key c: submit', h.subs.at(-1));
    see('old form still readable, submit after unmount', { input: getInput(f0), sub: (await submit(f0)).out });
    see('console.error during remounts', errs);
    console.error = orig;
    expect(h.subs).toEqual([{ name: 'typed', type: 'company' }, { name: 'two', type: 'person' }, { other: 'o', rows: [{ s: 'r' }] }]);
    expect(errs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Follow-ups: omitted keys on reset vs mount, DOM with wrong types, StrictMode', () => {
  const sc = () => compileE(DEF);
  const strict = (): any => v.object({ name: v.optional(v.string()), tags: v.array(v.string()), meta: v.object({ note: v.optional(v.string()) }), rows: v.array(v.object({ s: v.optional(v.string()), sub: v.array(v.string()) })) });

  it('omitted structure: mount vs reset', async () => {
    log('\n=== Follow-ups');
    const m = useRH(strict(), { initialInput: { rows: [{ s: 'a' }] } });
    see('strict schema, mount omitting keys: input', getInput(m));
    const sm = await submit(m);
    see('strict schema, mount omitting keys: submit', sm);
    const r = useRH(strict(), { initialInput: { rows: [{ s: 'a' }] } });
    A(() => reset(r, { initialInput: { rows: [{ s: 'a' }] } } as any));
    see('strict schema, reset with same value: input', getInput(r));
    const sr = await submit(r);
    see('strict schema, reset with same value: submit', sr);
    expect(sm.out).not.toBe('<handler not called>');
    expect(sr.out).toBe('<handler not called>');

    const e = useRH(sc(), { initialInput: { name: 'n', tags: ['t'], meta: { note: 'k' } } });
    A(() => reset(e, { initialInput: { name: 'n' } } as any));
    see('compiled, reset omitting tags/meta', getInput(e));
    expect((getInput(e) as any).tags).toBeUndefined();
    expect((getInput(e) as any).meta).toBeUndefined();
    A(() => setInput(e, { path: ['meta', 'note'], input: 'x' } as any));
    see('  edit meta.note', { input: getInput(e), dirty: isDirty(e), dirtyInput: getDirtyInput(e) });
    A(() => setInput(e, { path: ['meta', 'note'], input: undefined } as any));
    see('  restore meta.note to undefined', { input: getInput(e), dirty: isDirty(e), dirtyInput: getDirtyInput(e) });
    A(() => setInput(e, { path: ['tags'], input: [] } as any));
    see('  set tags []', { input: getInput(e), dirty: isDirty(e), dirtyInput: getDirtyInput(e) });

    const f = useRH(sc(), { initialInput: { name: 'n', tags: ['t'], meta: { note: 'k' } } });
    A(() => reset(f, { initialInput: { name: 'n', tags: [], meta: {}, addresses: [] } } as any));
    A(() => setInput(f, { path: ['meta', 'note'], input: 'x' } as any));
    A(() => setInput(f, { path: ['meta', 'note'], input: undefined } as any));
    see('control: full-shape reset, edit then restore meta.note', { input: getInput(f), dirty: isDirty(f) });

    const m2 = useRH(sc(), { initialInput: { name: 'n' } });
    A(() => setInput(m2, { path: ['meta', 'note'], input: 'x' } as any));
    A(() => setInput(m2, { path: ['meta', 'note'], input: undefined } as any));
    see('control: mount omitting meta, edit then restore meta.note', { input: getInput(m2), dirty: isDirty(m2) });
  });

  it('reset with initialInput: undefined / {}', async () => {
    const f = useRH(sc(), { initialInput: { name: 'n' } });
    A(() => reset(f, { initialInput: undefined } as any));
    see('after initialInput undefined: getInput', getInput(f) === undefined ? '<undefined>' : getInput(f));
    const s = await submit(f);
    see('  submit', s);
    see('  direct validate of undefined', std(sc(), undefined));
    expect(getInput(f)).toBeUndefined();
    A(() => setInput(f, { path: ['name'], input: 'x' } as any));
    see('  setInput leaf afterwards', getInput(f));
    const g = useRH(sc(), { initialInput: { name: 'n' } });
    A(() => reset(g, { initialInput: {} } as any));
    see('after initialInput {}: getInput', getInput(g));
    const h = useRH(sc(), { initialInput: { name: 'n' } });
    A(() => reset(h, {} as any));
    see('after {} config (no key): getInput', getInput(h));
  });

  it('DOM with wrongly typed leaf', async () => {
    const hold: any = {};
    function App({ init }: any) {
      const form = useForm({ schema: sc(), initialInput: init } as any) as any;
      hold.form = form;
      return (
        <Form of={form} onSubmit={() => {}}>
          <Field of={form} path={['name'] as any}>{(f: any) => <input data-testid="n" {...f.props} value={f.input ?? ''} />}</Field>
          <Field of={form} path={['tags'] as any}>{(f: any) => <i data-testid="t">{JSON.stringify(f.input)}</i>}</Field>
        </Form>
      );
    }
    const orig = console.error; const errs: any[] = []; console.error = (...x: any[]) => { errs.push(String(x[0]).slice(0, 100)); };
    const u = render(<App init={{ name: 42, tags: 'abc' }} />);
    see('DOM number leaf + string multi', { value: (screen.getByTestId('n') as any).value, tags: screen.getByTestId('t').textContent });
    fireEvent.change(screen.getByTestId('n'), { target: { value: '43' } });
    see('after typing', { store: getInput(hold.form), type: typeof (getInput(hold.form) as any).name });
    u.unmount();
    render(<App init={{ name: { x: 1 } }} />);
    see('DOM object leaf', (screen.getByTestId('n') as any).value);
    see('console.error', errs);
    console.error = orig;
  });

  it('StrictMode mount', async () => {
    const hold: any = {};
    let ran = 0;
    const schema: any = (v.pipe as any)(v.object({ a: v.optional(v.unknown()) }), v.transform((x: any) => { ran++; return x; }), v.object({ a: v.optional(v.string()) }));
    function App() { hold.form = useForm({ schema, initialInput: { a: 'x' } } as any); return null; }
    render(<StrictMode><App /></StrictMode>);
    const s = await submit(hold.form);
    see('StrictMode submit', { s, prepRuns: ran });
    expect(s.out).toEqual({ a: 'x' });
  });
});
