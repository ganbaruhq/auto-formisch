import { it } from 'vitest';
import { act } from '@testing-library/react';
import * as v from 'valibot';
import { insert, setInput } from '@formisch/react';
import { compileC, compileD, compileE, isEmpty, omitUndef, type Node } from '../src/compile';
import { errs, kind, log, mount, runValidate, std } from '../src/harness';

const def = (tags: boolean): Node[] => [
  { kind: 'field', key: 'nick', type: 'string', rules: [{ type: 'minLength', n: 3, message: 'min3' }] },
  { kind: 'field', key: 'count', type: 'number', rules: [{ type: 'minValue', n: 0, message: 'min0' }] },
  { kind: 'field', key: 'agree', type: 'boolean' },
  ...(tags ? [{ kind: 'field', key: 'tags', type: 'string[]' } as Node] : []),
  { kind: 'object', key: 'profile', children: [{ kind: 'field', key: 'city', type: 'string', rules: [{ type: 'minLength', n: 2, message: 'min2' }] }] },
  { kind: 'repeater', key: 'addresses', template: [{ kind: 'field', key: 'street', type: 'string', rules: [{ type: 'minLength', n: 3, message: 'min3' }] }] },
];

const nick = () => v.pipe(v.string(), v.minLength(3, 'min3'));
const count = () => v.pipe(v.number(), v.minValue(0, 'min0'));
const city = () => v.pipe(v.string(), v.minLength(2, 'min2'));
const emptyBranch = () => v.pipe(v.custom(isEmpty), v.transform(() => undefined));

const handBuilt = (leaf: (s: any) => any, tags: boolean, wrap: (s: any) => any = (s) => s) =>
  wrap(v.object({
    nick: leaf(nick()), count: leaf(count()), agree: leaf(v.boolean()),
    ...(tags ? { tags: leaf(v.array(v.string())) } : {}),
    profile: v.object({ city: leaf(city()) }),
    addresses: v.array(v.object({ street: leaf(nick()) })),
  }));
const rootOmit = (s: any) => v.pipe(s, v.transform(omitUndef));
// Same, but object/array also get tolerated when null/missing, so A/B get their best shot at the object/repeater key rule.
const tolerantContainers = (leaf: (s: any) => any, tags: boolean) =>
  v.pipe(v.object({
    nick: leaf(nick()), count: leaf(count()), agree: leaf(v.boolean()),
    ...(tags ? { tags: leaf(v.array(v.string())) } : {}),
    profile: v.nullish(v.object({ city: leaf(city()) }), {}),
    addresses: v.nullish(v.array(v.object({ street: leaf(nick()) })), []),
  }), v.transform(omitUndef));

const candidates: Record<string, (tags: boolean) => any> = {
  'A0 optional(ruled) [baseline]': (t) => handBuilt((s) => v.optional(s), t),
  'A1 optional(union[literal(""),ruled])': (t) => handBuilt((s) => v.optional(v.union([v.literal(''), s])), t),
  'A2 optional(union[custom(isEmpty)->undefined,ruled]) + root omit': (t) => handBuilt((s) => v.optional(v.union([emptyBranch(), s])), t, rootOmit),
  'B1 optional(pipe(unknown,transform(empty->undefined),optional(ruled))) + root omit': (t) =>
    handBuilt((s) => v.optional(v.pipe(v.unknown(), v.transform((x) => (isEmpty(x) ? undefined : x)), v.optional(s))), t, rootOmit),
  'B2 optional(pipe(string,transform,optional(ruled))) string-first (all leaves)': (t) =>
    handBuilt((s) => v.optional(v.pipe(v.string(), v.transform((x) => (isEmpty(x) ? undefined : x)), v.optional(s))), t, rootOmit),
  'A2+ A2 with nullish(container, default) containers': (t) => tolerantContainers((s) => v.optional(v.union([emptyBranch(), s])), t),
  'B1+ B1 with nullish(container, default) containers': (t) =>
    tolerantContainers((s) => v.optional(v.pipe(v.unknown(), v.transform((x) => (isEmpty(x) ? undefined : x)), v.optional(s))), t),
  'G pipe(unknown,transform(normalise),object) root preprocess': (t) =>
    v.pipe(v.unknown(), v.transform(omitUndef), handBuilt((s) => v.optional(s), t)),
  'C skeleton + root rawTransform interpreter': (t) => compileC(def(t)),
  'D root v.lazy per-input schema': (t) => compileD(def(t)),
  'E skeleton -> transform(prep) -> typed object': (t) => compileE(def(t)),
};

const inputs: [string, unknown][] = [
  ['ruleErr', { nick: '', count: 0, agree: false, profile: { city: '  ' }, addresses: [{ street: '' }, { street: 'ab' }] }],
  ['allEmpty', { nick: '   ', count: null, agree: false, tags: [], profile: { city: '  ' }, addresses: [{ street: null }] }],
  ['zeroFalse', { count: 0, agree: false, profile: {}, addresses: [] }],
  ['missingKeys', {}],
  ['nullContainers', { profile: null, addresses: null }],
  ['noTrim', { nick: ' ab ', profile: { city: ' x ' }, addresses: [] }],
];

for (const [name, make] of Object.entries(candidates)) {
  it(name, async () => {
    log(`\n=== ${name}`);
    for (const t of [false, true]) {
      let form: any;
      try {
        form = mount(make(t), t ? { initialInput: { addresses: [{ street: '' }] } } : { initialInput: { addresses: [{ street: '' }, { street: '' }] } });
      } catch (e: any) { log(`formisch[tags=${t}] THROWS`, e.message); continue; }
      const paths: any[][] = [['nick'], ['count'], ...(t ? [['tags']] : []), ['profile'], ['profile', 'city'], ['addresses'], ['addresses', 0], ['addresses', 0, 'street']];
      log(`formisch[tags=${t}] accepted; kinds`, Object.fromEntries(paths.map((p) => [p.join('.'), kind(form, p)])));
      if (t) continue;
      try {
        act(() => {
          setInput(form, { path: ['nick'], input: 'ab' } as any);
          setInput(form, { path: ['profile', 'city'], input: 'x' } as any);
          setInput(form, { path: ['count'], input: -1 } as any);
          insert(form, { path: ['addresses'], initialInput: { street: 'zz' } } as any);
        });
        const r = await runValidate(form);
        log('formisch errors', {
          success: r.success,
          form: errs(form), nick: errs(form, ['nick']), count: errs(form, ['count']), city: errs(form, ['profile', 'city']),
          a0: errs(form, ['addresses', 0, 'street']), a1: errs(form, ['addresses', 1, 'street']), a2: errs(form, ['addresses', 2, 'street']),
          rawPaths: r.issues?.map((i: any) => i.path?.map((p: any) => p.key).join('.')),
        });
      } catch (e: any) { log('formisch validate THROWS', e.message); }
    }
    for (const [label, inp] of inputs) {
      try { log(`std ${label}`, std(make(false), inp)); } catch (e: any) { log(`std ${label} THROWS`, e.message); }
    }
    try { log('std tags=[] ', std(make(true), { tags: [], profile: {}, addresses: [] })); } catch (e: any) { log('std tags THROWS', e.message); }
  });
}
