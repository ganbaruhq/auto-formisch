import { it, expect } from 'vitest';
import { compile, findCycle, type N } from '../src/cascade';
const run = (d: N[], i: any) => { const r: any = compile(d)['~standard'].validate(i); return r.issues ? { issues: r.issues.map((x: any) => [x.message, x.path.map((p: any) => (typeof p === 'object' ? p.key : p)).join('.')]) } : { value: r.value }; };
const t = (name: string, o: any = {}) => ({ type: 'text', name, ...o });
it('chain, defined in reverse order', () => {
  const d: N[] = [t('c', { visible: { field: 'b', op: 'eq', value: 'x' }, required: true }), t('b', { visible: { field: 'a', op: 'eq', value: 'y' } }), t('a')];
  expect(run(d, { a: 'no', b: 'x' })).toEqual({ value: { a: 'no' } });
  expect(run(d, { a: 'y', b: 'x' })).toEqual({ issues: [['required', 'c']] });
});
it('hidden driver reads empty for required', () => {
  const d: N[] = [t('k'), t('a', { visible: { field: 'k', op: 'eq', value: 'on' } }), t('b', { required: { field: 'a', op: 'not_empty' } })];
  expect(run(d, { k: 'no', a: 'v' })).toEqual({ value: { k: 'no' } });
});
it('mutual required: at least one', () => {
  const d: N[] = [t('a', { required: { field: 'b', op: 'empty' } }), t('b', { required: { field: 'a', op: 'empty' } })];
  expect(findCycle(d)).toBeNull();
  expect(run(d, {})).toEqual({ issues: [['required', 'a'], ['required', 'b']] });
  expect(run(d, { a: 'x' })).toEqual({ value: { a: 'x' } });
});
it('cycles rejected', () => {
  expect(findCycle([t('a', { visible: { field: 'b', op: 'empty' } }), t('b', { visible: { field: 'a', op: 'empty' } })])).toBeTruthy();
  expect(findCycle([t('a', { disabled: { field: 'b', op: 'not_empty' } }), t('b', { disabled: { field: 'a', op: 'not_empty' } })])).toBeTruthy();
  expect(findCycle([t('a', { visible: { field: 'a', op: 'empty' } })])).toBeTruthy();
  expect(findCycle([{ type: 'section', visible: { field: 'x', op: 'empty' }, components: [t('x')] }])).toBeTruthy();
  expect(findCycle([{ type: 'repeater', name: 'r', visible: { field: 'k', op: 'empty' }, components: [t('s', { visible: { field: '../k', op: 'empty' } })] }, t('k')])).toBeNull();
  expect(findCycle([t('k', { visible: { field: 'o.x', op: 'empty' } }), { type: 'object', name: 'o', components: [t('x', { visible: { field: '../k', op: 'empty' } })] }])).toBeTruthy();
});
it('rows: sibling and outer, per row', () => {
  const d: N[] = [t('mode'), { type: 'repeater', name: 'r', components: [t('kind'), t('s', { required: { all: [{ field: 'kind', op: 'eq', value: 'home' }, { field: '../mode', op: 'eq', value: 'strict' }] } })] }];
  expect(run(d, { mode: 'strict', r: [{ kind: 'x' }, { kind: 'home' }, { kind: 'home', s: 'ok' }] })).toEqual({ issues: [['required', 'r.1.s']] });
  expect(run(d, { mode: 'off', r: [{ kind: 'home' }] })).toEqual({ value: { mode: 'off', r: [{ kind: 'home' }] } });
});
it('hidden/disabled containers keep empty key; children inherit', () => {
  const d: N[] = [t('k'), { type: 'object', name: 'o', visible: { field: 'k', op: 'eq', value: 'on' }, components: [t('x', { required: true })] }, { type: 'repeater', name: 'r', disabled: { field: 'k', op: 'eq', value: 'lock' }, components: [t('s', { required: true })] }, t('dep', { required: { field: 'r', op: 'not_empty' } })];
  expect(run(d, { k: 'lock', o: { x: 'v' }, r: [{ s: 'v' }] })).toEqual({ value: { k: 'lock', o: {}, r: [] } });
  expect(run(d, { k: 'on', o: {}, r: [{}] })).toEqual({ issues: [['required', 'o.x'], ['required', 'r.0.s'], ['required', 'dep']] });
});
it('forged disabled driver cannot switch off required', () => {
  const d: N[] = [t('plan', { disabled: true }), t('card', { required: { not: { field: 'plan', op: 'eq', value: 'free' } } })];
  expect(run(d, { plan: 'free' })).toEqual({ issues: [['required', 'card']] });
});
it('hidden Layout hides its Fields, driver of others', () => {
  const d: N[] = [t('k'), { type: 'section', visible: { field: 'k', op: 'eq', value: 'on' }, components: [t('a', { required: true })] }, t('b', { required: { field: 'a', op: 'not_empty' } })];
  expect(run(d, { k: 'off', a: 'v' })).toEqual({ value: { k: 'off' } });
});
