import { it } from 'vitest';
import { act } from '@testing-library/react';
import * as v from 'valibot';
import { compileC, compileD, compileE, isEmpty, omitUndef, type Node } from '../src/compile';
import { errs, input, kind, log, mount, plain, runValidate, std } from '../src/harness';

const row = (type: any) => v.object({ type: v.string(), street: v.string() });

it('T1 forward(partialCheck) vs an issue on another Field', () => {
  log('\n=== T1 forward(partialCheck)');
  const s = v.pipe(
    v.object({ a: v.pipe(v.string(), v.minLength(3, 'a-min3')), b: v.string(), c: v.string() }),
    v.forward(v.partialCheck([['b'], ['c']], (i) => i.b === i.c, 'b!=c'), ['c']),
  );
  log('other Field a has a RULE issue, b!=c', std(s, { a: 'x', b: '1', c: '2' }));
  log('other Field a has a TYPE issue, b!=c', std(s, { a: 1, b: '1', c: '2' }));
  log('selected Field b has a TYPE issue', std(s, { a: 'xxx', b: 1, c: '2' }));
});

it('T2 forward(partialCheck) per-row', async () => {
  log('\n=== T2 per-row');
  // Row-level pipe: sibling only. Requirement only ever receives the row.
  let seen: unknown;
  const rowLevel = v.object({
    kind: v.string(),
    addresses: v.array(v.pipe(
      v.object({ type: v.string(), street: v.string() }),
      v.forward(v.partialCheck([['type'], ['street']], (r: any) => { seen = r; return r.type !== 'home' || r.street !== ''; }, 'street-req'), ['street']),
    )),
  });
  const inp = { kind: 'adult', addresses: [{ type: 'x', street: '' }, { type: 'x', street: '' }, { type: 'home', street: '' }] };
  log('row-level sibling condition', std(rowLevel, inp));
  log('row-level requirement arg (no access to kind)', seen);
  const f = mount(rowLevel, { initialInput: inp });
  await runValidate(f);
  log('  formisch addresses.2.street', errs(f, ['addresses', 2, 'street']));

  // Root-level `$` selection: can read outside + rows, but what path do we get?
  const rootDollar = v.pipe(
    v.object({ kind: v.string(), addresses: v.array(row(0)) }),
    v.partialCheck([['kind'], ['addresses', '$', 'street']], (i: any) => i.addresses.every((r: any) => i.kind !== 'adult' || r.street !== ''), 'root-$'),
  );
  log('root-level $ no forward', std(rootDollar, inp));
  const f2 = mount(rootDollar, { initialInput: inp });
  await runValidate(f2);
  log('  formisch form.errors / addresses.0.street', [errs(f2), errs(f2, ['addresses', 0, 'street'])]);

  // forward path cannot contain $ -> literal "$" key, and index is static
  const fwdDollar = v.pipe(
    v.object({ kind: v.string(), addresses: v.array(row(0)) }),
    v.forward(v.partialCheck([['kind'], ['addresses', '$', 'street']], () => false, 'fwd-$') as any, ['addresses', '$', 'street'] as any),
  );
  log('forward with $ in path', std(fwdDollar, inp));
  // Static index generated per possible row: works only with a row cap; 1 issue per generated action
  const fwdStatic = (v.pipe as any)(
    v.object({ kind: v.string(), addresses: v.array(row(0)) }),
    ...[0, 1, 2, 3].map((i) => v.forward(v.partialCheck([['kind'], ['addresses', i as any, 'street']] as any, (x: any) => x.addresses[i] === undefined || x.kind !== 'adult' || x.addresses[i].street !== '', `req-${i}`) as any, ['addresses', i, 'street'] as any)),
  );
  log('forward static idx (row cap 4, 3 rows)', std(fwdStatic, inp));
  log('forward static idx, 6 rows: rows 4,5 not covered', std(fwdStatic, { kind: 'adult', addresses: Array(6).fill({ type: 'x', street: '' }) }));
});

it('T3 rawCheck / rawTransform addIssue routing + type-failure interaction', async () => {
  log('\n=== T3 rawCheck/rawTransform');
  const pathTo = (ds: any, ...keys: any[]) => keys.map((key) => ({ type: 'unknown', origin: 'value', input: ds.value, key, value: undefined }));
  let rc = 0, rt = 0;
  const base = v.object({ kind: v.string(), age: v.optional(v.number()), addresses: v.array(v.object({ type: v.string(), street: v.string() })) });
  const checker = (counter: () => void) => ({ dataset, addIssue }: any) => {
    counter();
    log('   dataset.typed in action =', dataset.typed);
    (dataset.value.addresses ?? []).forEach((r: any, i: number) => {
      if (dataset.value.kind === 'adult' && r?.type === 'home' && r?.street === '') addIssue({ message: 'row-street-req', path: pathTo(dataset, 'addresses', i, 'street') });
    });
  };
  const sCheck = v.pipe(base, v.rawCheck(checker(() => rc++)));
  const sTrans = v.pipe(base, v.rawTransform((ctx: any) => { checker(() => rt++)(ctx); return ctx.dataset.value; }));
  const good = { kind: 'adult', addresses: [{ type: 'x', street: '' }, { type: 'x', street: '' }, { type: 'home', street: '' }] };
  log('rawCheck, no type issue', std(sCheck, good));
  log('rawTransform, no type issue', std(sTrans, good));
  const f = mount(sCheck, { initialInput: good });
  await runValidate(f);
  log('  formisch rawCheck field.errors addresses.2.street', errs(f, ['addresses', 2, 'street']), );
  log('  formisch rawCheck form.errors', errs(f));
  const f3 = mount(sTrans, { initialInput: good });
  await runValidate(f3);
  log('  formisch rawTransform field.errors addresses.2.street', errs(f3, ['addresses', 2, 'street']));

  const typedFail = { ...good, age: 'abc' };
  rc = 0; rt = 0;
  log('rawCheck WITH type issue on age', std(sCheck, typedFail)); log('  rawCheck runs', rc);
  log('rawTransform WITH type issue on age', std(sTrans, typedFail)); log('  rawTransform runs', rt);
});

it('T4 hidden Field holding wrong type', async () => {
  log('\n=== T4 hidden wrong type');
  const inp = { kind: 'child', age: 'abc', note: '' };
  const hiddenAge = (i: any) => i.kind !== 'adult';
  // typed leaf + rawCheck that wants to treat it as hidden
  const typed = v.pipe(v.object({ kind: v.string(), age: v.optional(v.number()), note: v.optional(v.string()) }), v.rawCheck(() => {}), v.transform((x: any) => { const { age, ...r } = x; return r; }));
  log('typed leaf + root transform(omit hidden)', std(typed, inp));
  // the union-empty leaf: hidden "abc" is non-empty so ruled branch applies
  const eb = () => v.pipe(v.custom(isEmpty), v.transform(() => undefined));
  const A2 = v.pipe(v.object({ kind: v.string(), age: v.optional(v.union([eb(), v.number()])) }), v.transform(omitUndef));
  log('A2 union leaf', std(A2, inp));
  const B1 = v.pipe(v.object({ kind: v.string(), age: v.optional(v.pipe(v.unknown(), v.transform((x) => (isEmpty(x) ? undefined : x)), v.optional(v.number()))) }), v.transform(omitUndef));
  log('B1 pipe leaf', std(B1, inp));
  const f = mount(B1, { initialInput: inp });
  const r = await runValidate(f);
  log('  formisch success/age errors', [r.success, errs(f, ['age'])]);
  // Does a type issue on hidden block unrelated rules? (rawCheck runs; forward partialCheck on others runs)
  const blocked = v.pipe(
    v.object({ kind: v.string(), age: v.optional(v.number()), a: v.string(), b: v.string() }),
    v.forward(v.partialCheck([['a'], ['b']], (i: any) => i.a === i.b, 'a!=b'), ['b']),
    v.transform((x) => x),
    v.check(() => false, 'after-transform-check'),
  );
  log('hidden type issue + partialCheck + transform + later check', std(blocked, { kind: 'child', age: 'abc', a: '1', b: '2' }));
  // hack: rawCheck drops issues on hidden paths by mutating dataset.issues
  const hack = v.pipe(
    v.object({ kind: v.string(), age: v.optional(v.pipe(v.number(), v.minValue(18, 'min18'))) }),
    v.rawCheck(({ dataset }: any) => {
      if (dataset.value.kind !== 'adult' && dataset.issues) {
        dataset.issues = dataset.issues.filter((i: any) => i.path?.[0]?.key !== 'age');
        if (!dataset.issues.length) { dataset.issues = undefined; dataset.typed = true; }
      }
    }),
    v.transform((x: any) => { if (x.kind !== 'adult') { const { age, ...rest } = x; return rest; } return x; }),
  );
  log('hack: rawCheck mutates dataset.issues', std(hack, inp));
  log('hack: visible age', std(hack, { kind: 'adult', age: 5 }));
  // variant: fine for one eq discriminator
  const variantS = v.variant('kind', [v.object({ kind: v.literal('adult'), age: v.number() }), v.object({ kind: v.literal('child') })]);
  log('variant hidden junk', std(variantS, inp));
  const vf = mount(variantS, { initialInput: inp });
  log('  variant kinds', [kind(vf, ['kind']), kind(vf, ['age']), input(vf)]);
});

const DEF: Node[] = [
  { kind: 'field', key: 'kind', type: 'string', required: true },
  { kind: 'field', key: 'contact', type: 'string' },
  { kind: 'field', key: 'age', type: 'number', required: true, visible: { op: 'eq', scope: 'root', path: ['kind'], value: 'adult' }, rules: [{ type: 'minValue', n: 18, message: 'min18' }] },
  { kind: 'field', key: 'email', type: 'string', required: { op: 'eq', scope: 'root', path: ['contact'], value: 'email' }, rules: [{ type: 'minLength', n: 5, message: 'min5' }] },
  { kind: 'field', key: 'locked', type: 'string', required: true, disabled: { op: 'eq', scope: 'root', path: ['kind'], value: 'child' } },
  { kind: 'object', key: 'group', visible: { op: 'eq', scope: 'root', path: ['kind'], value: 'adult' }, children: [{ kind: 'field', key: 'zip', type: 'string', required: true }] },
  { kind: 'repeater', key: 'addresses', template: [
    { kind: 'field', key: 'type', type: 'string' },
    { kind: 'field', key: 'street', type: 'string', required: { op: 'eq', scope: 'row', path: ['type'], value: 'home' }, rules: [{ type: 'minLength', n: 3, message: 'min3' }] },
    { kind: 'field', key: 'note', type: 'string', required: true, visible: { op: 'eq', scope: 'root', path: ['kind'], value: 'adult' } },
    { kind: 'field', key: 'secret', type: 'number', required: true, visible: { op: 'eq', scope: 'row', path: ['type'], value: 'work' } },
  ] },
  { kind: 'repeater', key: 'groups', template: [
    { kind: 'field', key: 'name', type: 'string' },
    { kind: 'repeater', key: 'members', template: [
      { kind: 'field', key: 'name', type: 'string', required: { op: 'eq', scope: 'root', path: ['kind'], value: 'adult' }, rules: [{ type: 'minLength', n: 2, message: 'min2' }] },
      { kind: 'field', key: 'title', type: 'string', visible: { op: 'notEmpty', scope: 'row', path: ['name'] } },
    ] },
  ] },
];
const scenarios: [string, any, boolean][] = [
  ['S1 child: everything hidden/disabled, hidden wrong types', { kind: 'child', age: 'abc', group: { zip: 123 }, locked: '', addresses: [{ type: 'other', street: '', note: '', secret: 'x' }], groups: [] }, true],
  ['S2 adult: required/rules per-row incl. nested repeater', { kind: 'adult', contact: 'email', addresses: [{ type: 'x', street: 'okay', note: 'n' }, { type: 'x', note: 'n' }, { type: 'home', street: '', note: '' }], groups: [{ name: 'g', members: [{ name: 'a', title: 't' }, { name: '', title: 'dropped' }] }] }, true],
  ['S3 adult: visible wrong type & rule fails on 0', { kind: 'adult', age: 'abc', email: 'a', locked: 'x', group: { zip: 'z' }, addresses: [{ type: 'work', secret: 'nope', note: 'n' }], groups: [] }, true],
  ['S4 adult valid; 0 is not empty', { kind: 'adult', age: 18, locked: ' l ', group: { zip: 'z' }, addresses: [{ type: 'work', secret: 0, note: 'n' }], groups: [{ name: ' ', members: [{ name: 'ab', title: 't' }] }] }, true],
  ['S5 server junk: visible repeater wrong shape', { kind: 'adult', age: 20, locked: 'x', group: 5, addresses: 'x', groups: [5] }, false],
  ['S6 server junk: hidden group wrong shape', { kind: 'child', group: 5, addresses: null }, false],
  ['S7 root null', null, false],
];
const norm = (x: any) => JSON.stringify(x);

for (const [name, compile] of Object.entries({ C: compileC, D: compileD, E: compileE })) {
  it(`T5 ${name} condition battery`, async () => {
    log(`\n=== T5 ${name}`);
    const schema = compile(DEF);
    for (const [label, inp, formisch] of scenarios) {
      let out: any;
      try { out = std(schema, inp); } catch (e: any) { out = `THROW ${e.message}`; }
      log(label, out);
      if (!formisch) continue;
      const f = mount(compile(DEF), { initialInput: inp });
      const r = await runValidate(f);
      const fIssues = r.issues ? plain(r.issues) : undefined;
      const same = norm(fIssues) === norm(out.issues) && norm(r.output) === norm(out.value ?? r.output);
      const routed = (fIssues ?? []).every((i: any) => (errs(f, i.path) as any)?.includes(i.message));
      log('   formisch: same-as-std/all-routed-to-field/form.errors/hidden-store-kept', [same, routed, errs(f), input(f, ['age'])]);
    }
    log('abortEarly', (() => { const r = v.safeParse(schema, scenarios[1][1], { abortEarly: true }); return plain(r.issues as any); })());
    log('abortPipeEarly', (() => { const r = v.safeParse(schema, scenarios[1][1], { abortPipeEarly: true }); return plain(r.issues as any)?.length; })());
  });
}

it('T6 routing edge cases in Formisch', async () => {
  log('\n=== T6 routing edge cases');
  const mk = (issuePath: any) => v.pipe(v.object({ a: v.optional(v.unknown()), rows: v.array(v.object({ x: v.optional(v.unknown()) })) }),
    v.rawCheck(({ addIssue }: any) => addIssue({ message: 'boom', path: issuePath })));
  const kp = (...keys: any[]) => keys.map((key) => ({ type: 'unknown', origin: 'value', input: {}, key, value: undefined }));
  for (const [label, p] of [
    ['undefined path', undefined], ['path: []', []], ['unknown field', kp('nope')], ['row beyond length', kp('rows', 9, 'x')], ['array itself', kp('rows')],
    ['deeper than value store', kp('a', 'b')], ['minimal {key} only', [{ key: 'a' }]],
  ] as [string, any][]) {
    const f = mount(mk(p), { initialInput: { rows: [{}] } });
    const r = await runValidate(f);
    log(label, { success: r.success, formErrors: errs(f), a: errs(f, ['a']), rows: errs(f, ['rows']), isValidFlag: f.isValid });
  }
});

it('T7 stage-2 union clash on multi-value', () => {
  log('\n=== T7 array vs value in union');
  try { mount(v.object({ tags: v.union([v.array(v.string()), v.literal('')]) })); log('accepted'); } catch (e: any) { log('throws', e.message); }
  try { mount(v.object({ tags: v.union([v.array(v.string()), v.custom(isEmpty)]) })); log('accepted'); } catch (e: any) { log('throws', e.message); }
});
