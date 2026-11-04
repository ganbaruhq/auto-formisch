import { it } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { Field, FieldArray, Form, useForm, useField, getErrors, getDeepErrors, getInput, insert, remove, setInput, reset, move } from '@formisch/react';
import * as v from 'valibot';
import { compileC, compileE, evalCond, type Node } from '../src/compile';
import { log, mount, runValidate, std } from '../src/harness';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const kindAdult = { op: 'eq', scope: 'root', path: ['kind'], value: 'adult' } as const;

const DEF: Node[] = [
  { kind: 'field', key: 'kind', type: 'string', required: true },
  { kind: 'layout', visible: kindAdult, children: [
    { kind: 'field', key: 'age', type: 'number', required: true, rules: [{ type: 'minValue', n: 18, message: 'min18' }] },
  ] },
  { kind: 'field', key: 'bio', type: 'string', required: true, visible: kindAdult, rules: [{ type: 'minLength', n: 3, message: 'bio-min3' }] },
  { kind: 'field', key: 'tags', type: 'string[]' },
  { kind: 'repeater', key: 'addresses', template: [
    { kind: 'field', key: 'type', type: 'string' },
    { kind: 'field', key: 'street', type: 'string', required: { op: 'eq', scope: 'row', path: ['type'], value: 'home' }, rules: [{ type: 'minLength', n: 3, message: 'street-min3' }] },
    { kind: 'field', key: 'note', type: 'string', required: true, visible: kindAdult },
  ] },
];

function Input({ form, path, id, type }: any) {
  const f = useField(form, { path }) as any;
  return (
    <>
      <input data-testid={id} type={type ?? 'text'} {...f.props} value={f.input ?? ''} />
      <span data-testid={`${id}-err`}>{f.errors?.join('|') ?? ''}</span>
    </>
  );
}
function App({ schema, handle, onSub, cfg }: any) {
  const form = useForm({ schema, ...cfg } as any) as any;
  handle.form = form;
  const root = getInput(form); // same Condition evaluator as the schema; subscribes render to the store
  return (
    <Form of={form} onSubmit={onSub} data-testid="form">
      <Input form={form} path={['kind']} id="kind" />
      {evalCond(kindAdult, { root }) && <Input form={form} path={['bio']} id="bio" />}
      {evalCond(kindAdult, { root }) && <Input form={form} path={['age']} id="age" type="number" />}
      <Field of={form} path={['tags'] as any}>
        {(f: any) => (
          <>
            <select multiple data-testid="tags" {...f.props} value={f.input ?? []}>
              <option value="x">x</option><option value="y">y</option>
            </select>
            <span data-testid="tags-err">{f.errors?.join('|') ?? ''}</span>
          </>
        )}
      </Field>
      <FieldArray of={form} path={['addresses'] as any}>
        {(arr: any) => (
          <>
            <span data-testid="rows-err">{arr.errors?.join('|') ?? ''}</span>
            {arr.items.map((id: string, i: number) => (
              <div key={id}>
                <Input form={form} path={['addresses', i, 'type']} id={`r${i}-type`} />
                <Input form={form} path={['addresses', i, 'street']} id={`r${i}-street`} />
                {evalCond(kindAdult, { root }) && <Input form={form} path={['addresses', i, 'note']} id={`r${i}-note`} />}
              </div>
            ))}
          </>
        )}
      </FieldArray>
      <span data-testid="form-err">{form.errors?.join('|') ?? ''}</span>
    </Form>
  );
}
const txt = (id: string) => screen.getByTestId(id).textContent;
const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

for (const [name, compile] of Object.entries({ C: compileC, E: compileE })) {
  it(`E2E ${name}`, async () => {
    log(`\n=== E2E ${name}`);
    const handle: any = {};
    const submits: any[] = [];
    render(<App schema={compile(DEF)} handle={handle} onSub={(o: any) => submits.push(o)} cfg={{ initialInput: { addresses: [{}, {}, {}] } }} />);
    await flush();
    const form = handle.form;
    log('initial bio/age mounted', [!!screen.queryByTestId('bio'), !!screen.queryByTestId('age')]);
    type('kind', 'adult'); await flush();
    log('after kind=adult bio/age mounted', [!!screen.queryByTestId('bio'), !!screen.queryByTestId('age')]);
    type('bio', 'my bio');
    type('r2-type', 'home');
    await flush();
    fireEvent.submit(screen.getByTestId('form')); await flush();
    log('submit errors DOM', { kind: txt('kind-err'), bio: txt('bio-err'), age: txt('age-err'), r0street: txt('r0-street-err'), r2street: txt('r2-street-err'), r0note: txt('r0-note-err'), form: txt('form-err'), activeElement: (document.activeElement as any)?.dataset?.testid, submits: submits.length });
    // number input via native props -> what type lands in the store?
    type('age', '25'); await flush();
    log('age native <input type=number> store value + error', [getInput(form, { path: ['age'] } as any), txt('age-err')]);
    act(() => setInput(form, { path: ['age'], input: 25 } as any)); await flush();
    log('age after setInput(25)', [getInput(form, { path: ['age'] } as any), txt('age-err')]);
    // Hide: bio unmounts, value stays in store, errors clear, output drops it
    type('bio', 'x'); await flush();
    log('bio x error', txt('bio-err'));
    type('kind', 'child'); await flush();
    log('after hide: mounted/store/errors', [!!screen.queryByTestId('bio'), getInput(form, { path: ['bio'] } as any), getErrors(form, { path: ['bio'] } as any), getErrors(form, { path: ['age'] } as any), getErrors(form, { path: ['addresses', 0, 'note'] } as any)]);
    act(() => setInput(form, { path: ['age'], input: 'not-a-number' } as any)); await flush();
    log('hidden age wrongly typed, errors', getErrors(form, { path: ['age'] } as any));
    type('r2-street', 'main st'); await flush();
    fireEvent.submit(screen.getByTestId('form')); await flush();
    log('submit output while hidden', submits.at(-1));
    log('store still has hidden', getInput(form));
    type('kind', 'adult'); await flush();
    log('after show again: bio DOM value / age store', [(screen.getByTestId('bio') as any).value, getInput(form, { path: ['age'] } as any), txt('bio-err'), txt('age-err')]);
    // row ops: errors follow row
    log('before remove: r2 err / r0 note err', [txt('r2-street-err'), txt('r0-note-err')]);
    type('r2-street', 'x'); await flush();
    log('r2 street-min3', txt('r2-street-err'));
    act(() => remove(form, { path: ['addresses'], at: 1 } as any)); await flush();
    log('after remove row1: r1 street err (was r2)', [txt('r1-street-err'), (screen.getByTestId('r1-street') as any).value]);
    act(() => insert(form, { path: ['addresses'], at: 0, initialInput: { type: 'home' } } as any)); await flush();
    log('after insert row0 type=home: r0/r2 street err', [txt('r0-street-err'), txt('r2-street-err')]);
    log('array field errors', txt('rows-err'));
    // multi-select via real DOM with array kind
    const sel = screen.getByTestId('tags') as HTMLSelectElement;
    sel.options[0].selected = true; sel.options[1].selected = true;
    fireEvent.change(sel); await flush();
    log('multi-select store (array kind)', getInput(form, { path: ['tags'] } as any));
    sel.options[0].selected = false; sel.options[1].selected = false;
    fireEvent.change(sel); await flush();
    log('multi-select deselected store', getInput(form, { path: ['tags'] } as any));
    act(() => reset(form)); await flush();
    log('after reset', getInput(form));
    cleanup();
  });
}

it('multi-value: wrong item in array-kind Field: where does the error land', async () => {
  log('\n=== multi-value item error');
  const d: Node[] = [{ kind: 'field', key: 'tags', type: 'string[]' }];
  for (const [n, c] of Object.entries({ C: compileC, E: compileE })) {
    log(`${n} std`, std(c(d), { tags: ['a', 1] }));
    const f = mount(c(d), { initialInput: { tags: ['a', 1] } });
    await runValidate(f);
    log(`${n} formisch tags / tags.1 / deep`, [getErrors(f, { path: ['tags'] } as any), getErrors(f, { path: ['tags', 1] } as any), getDeepErrors(f, { path: ['tags'] } as any)]);
  }
});

it('E: scope and contract probes', () => {
  log('\n=== E probes');
  const adultHidden = { op: 'eq', scope: 'root', path: ['k'], value: 'x' } as const;
  const inRow: Node[] = [
    { kind: 'field', key: 'k', type: 'string' },
    { kind: 'repeater', key: 'rows', template: [
      { kind: 'field', key: 't', type: 'string' },
      { kind: 'layout', visible: { op: 'eq', scope: 'row', path: ['t'], value: 'y' }, children: [{ kind: 'field', key: 'inLayout', type: 'string', required: true }] },
      { kind: 'object', key: 'sub', children: [{ kind: 'field', key: 'deep', type: 'string', required: { op: 'eq', scope: 'row', path: ['t'], value: 'y' } }] },
    ] },
  ];
  for (const [n, c] of Object.entries({ C: compileC, E: compileE }))
    log(`${n} layout+object inside row, row-scope cond`, std(c(inRow), { rows: [{ t: 'n' }, { t: 'y' }] }));
  const chain: Node[] = [
    { kind: 'field', key: 'k', type: 'string' },
    { kind: 'field', key: 'a', type: 'string', visible: adultHidden },
    { kind: 'field', key: 'b', type: 'string', required: { op: 'eq', scope: 'root', path: ['a'], value: 'v' } },
    { kind: 'field', key: 'c', type: 'string', required: { op: 'notEmpty', scope: 'root', path: ['k'] } },
  ];
  log('E Condition reading a HIDDEN Field (spike evaluates against raw input)', std(compileE(chain), { k: 'no', a: 'v' }));
  log('E Condition notEmpty on whitespace driver', std(compileE(chain), { k: '   ' }));
  const r = (compileE([{ kind: 'field', key: 'x', type: 'string', required: true }]) as any)['~standard'].validate({});
  log('E required-sentinel issue fields', { type: r.issues[0].type, received: r.issues[0].received, inputType: typeof r.issues[0].input, pathValueType: typeof r.issues[0].path[0].value });
  log('E extra keys stripped', std(compileE([{ kind: 'field', key: 'x', type: 'string' }]), { x: 'a', evil: 1 }));
});

it('B1 multi-value via value-kind store (native select multiple)', async () => {
  log('\n=== B1 multi-select with value-kind store');
  const s = v.object({ tags: v.optional(v.pipe(v.unknown(), v.transform((x) => x), v.optional(v.array(v.string())))) });
  const handle: any = {};
  function B() {
    const form = useForm({ schema: s } as any) as any; handle.form = form;
    return <Field of={form} path={['tags'] as any}>{(f: any) => <select multiple data-testid="t" {...f.props}><option value="x">x</option><option value="y">y</option></select>}</Field>;
  }
  render(<B />);
  const sel = screen.getByTestId('t') as HTMLSelectElement;
  sel.options[0].selected = true; sel.options[1].selected = true;
  fireEvent.change(sel); await flush();
  log('store', getInput(handle.form, { path: ['tags'] } as any));
  cleanup();
});
