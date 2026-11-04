import { StrictMode, memo, useEffect, useRef, useState } from 'react';
import { afterAll, afterEach, beforeEach, describe, it, vi } from 'vite-plus/test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as v from 'valibot';
import * as F from '@formisch/react';
import { Field, FieldArray, Form, useField, useFieldArray, useForm } from '@formisch/react';

const log = (tag: string, val?: unknown) => console.log(`OBS ${tag} ${JSON.stringify(val)}`);
const sleep = (ms = 20) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
let unhandled: string[] = [];
const onUnhandled = (e: any) => unhandled.push(String(e?.message ?? e));
process.on('unhandledRejection', onUnhandled);
afterAll(() => {
  process.off('unhandledRejection', onUnhandled);
});
beforeEach(() => {
  unhandled = [];
});
afterEach(cleanup);

function Host({ schema, cfg, onSubmit, capture }: any) {
  const form: any = useForm({ schema, ...cfg });
  capture(form);
  return (
    <Form of={form} onSubmit={onSubmit} id="f">
      <Field of={form} path={['a']}>
        {(field: any) => <input aria-label="a" {...field.props} value={field.input ?? ''} />}
      </Field>
      <output data-testid="flags">{`${form.isSubmitting}|${form.isValidating}`}</output>
      <button>go</button>
    </Form>
  );
}
const flags = (f: any) => ({
  isSubmitting: f.isSubmitting,
  isValidating: f.isValidating,
  isSubmitted: f.isSubmitted,
  errors: f.errors,
  isValid: f.isValid,
  dom: screen.getByTestId('flags').textContent,
});

describe('Q1', () => {
  const schemas: Record<string, () => any> = {
    checkAsync: () =>
      v.objectAsync({
        a: v.pipeAsync(
          v.string(),
          v.checkAsync(async () => {
            await new Promise((r) => setTimeout(r, 30));
            throw new Error('boom-checkAsync');
          }),
        ),
      }),
    rawCheckAsync: () =>
      v.pipeAsync(
        v.objectAsync({ a: v.string() }),
        v.rawCheckAsync(async () => {
          await new Promise((r) => setTimeout(r, 30));
          throw new Error('boom-rawCheckAsync');
        }),
      ),
    syncCheck: () =>
      v.object({
        a: v.pipe(
          v.string(),
          v.check(() => {
            throw new Error('boom-syncCheck');
          }),
        ),
      }),
  };
  for (const [name, mk] of Object.entries(schemas)) {
    it(`validation throws on submit: ${name}`, async () => {
      let f: any;
      const onSubmit = vi.fn();
      render(
        <Host
          schema={mk()}
          cfg={{ initialInput: { a: 'x' } }}
          onSubmit={onSubmit}
          capture={(x: any) => (f = x)}
        />,
      );
      fireEvent.submit(document.querySelector('form')!);
      await sleep(5);
      log(`Q1 ${name} during`, flags(f));
      await sleep(80);
      log(`Q1 ${name} after`, { ...flags(f), onSubmit: onSubmit.mock.calls.length, unhandled });
    });
  }
  it('validate(form) rejects to caller; on-input and initial validation are not caught', async () => {
    let throwIt = true;
    const schema = v.objectAsync({
      a: v.pipeAsync(
        v.string(),
        v.checkAsync(async () => {
          if (throwIt) throw new Error('boom');
          return true;
        }),
      ),
    });
    let f: any;
    const onSubmit = vi.fn();
    render(
      <Host
        schema={schema}
        cfg={{ initialInput: { a: 'x' } }}
        onSubmit={onSubmit}
        capture={(x: any) => (f = x)}
      />,
    );
    const res = await act(() =>
      F.validate(f).then(
        (r: any) => 'resolved:' + JSON.stringify(r.success),
        (e: any) => 'rejected:' + e.message,
      ),
    );
    log('Q1 validate() direct', { res, ...flags(f), unhandled });

    // submit throws, then revalidate on input (isSubmitted = true)
    fireEvent.submit(document.querySelector('form')!);
    await sleep(20);
    unhandled = [];
    fireEvent.change(screen.getByLabelText('a'), { target: { value: 'xy' } });
    await sleep(20);
    log('Q1 revalidate-on-input throw', { ...flags(f), unhandled });
    // recovery
    throwIt = false;
    fireEvent.submit(document.querySelector('form')!);
    await sleep(20);
    log('Q1 recovery resubmit', { ...flags(f), onSubmit: onSubmit.mock.calls.length, unhandled });
  });
  it('validate:initial throw', async () => {
    let f: any;
    render(
      <Host
        schema={schemas.checkAsync()}
        cfg={{ validate: 'initial', initialInput: { a: 'x' } }}
        onSubmit={vi.fn()}
        capture={(x: any) => (f = x)}
      />,
    );
    await sleep(80);
    log('Q1 validate:initial throw', { ...flags(f), unhandled });
  });
  it('validate:input throw', async () => {
    let f: any;
    render(
      <Host
        schema={schemas.checkAsync()}
        cfg={{ validate: 'input', initialInput: { a: 'x' } }}
        onSubmit={vi.fn()}
        capture={(x: any) => (f = x)}
      />,
    );
    fireEvent.change(screen.getByLabelText('a'), { target: { value: 'xy' } });
    await sleep(80);
    log('Q1 validate:input throw', { ...flags(f), unhandled });
  });
  const handlers: Record<string, () => any> = {
    syncThrow: () => {
      throw new Error('handler-sync');
    },
    asyncReject: async () => {
      throw new Error('handler-async');
    },
    throwString: () => {
      throw 'plain-string';
    },
  };
  for (const [name, h] of Object.entries(handlers)) {
    it(`onSubmit throws: ${name}`, async () => {
      let f: any;
      const onSubmit = vi.fn(h);
      render(
        <Host
          schema={v.object({ a: v.string() })}
          cfg={{ initialInput: { a: 'x' } }}
          onSubmit={onSubmit}
          capture={(x: any) => (f = x)}
        />,
      );
      fireEvent.submit(document.querySelector('form')!);
      await sleep(20);
      log(`Q1 onSubmit ${name}`, { ...flags(f), onSubmit: onSubmit.mock.calls.length, unhandled });
    });
  }
  it('flag during slow onSubmit, double submit', async () => {
    let f: any;
    const release: any[] = [];
    const onSubmit = vi.fn(() => new Promise<void>((r) => release.push(r)));
    render(
      <Host
        schema={v.object({ a: v.string() })}
        cfg={{ initialInput: { a: 'x' } }}
        onSubmit={onSubmit}
        capture={(x: any) => (f = x)}
      />,
    );
    fireEvent.submit(document.querySelector('form')!);
    await sleep(10);
    log('Q1 slow onSubmit during', flags(f));
    fireEvent.submit(document.querySelector('form')!);
    await sleep(10);
    log('Q1 double submit', { calls: onSubmit.mock.calls.length, ...flags(f) });
    await act(async () => release[0]());
    await sleep(5);
    log('Q1 first handler done, second pending', flags(f));
    await act(async () => release[1]());
    await sleep(5);
    log('Q1 both done', flags(f));
  });
  it('typing during async submit validation', async () => {
    let f: any;
    const schema = v.objectAsync({
      a: v.pipeAsync(
        v.string(),
        v.checkAsync(async () => {
          await new Promise((r) => setTimeout(r, 30));
          return true;
        }),
      ),
    });
    const onSubmit = vi.fn();
    render(
      <Host
        schema={schema}
        cfg={{ initialInput: { a: 'x' } }}
        onSubmit={onSubmit}
        capture={(x: any) => (f = x)}
      />,
    );
    fireEvent.submit(document.querySelector('form')!);
    await sleep(5);
    fireEvent.change(screen.getByLabelText('a'), { target: { value: 'xy' } });
    await sleep(100);
    log('Q1 typing during submit validation', {
      onSubmit: onSubmit.mock.calls.length,
      ...flags(f),
      unhandled,
    });
  });
  it('never-resolving validation then reset', async () => {
    let f: any;
    const schema = v.objectAsync({
      a: v.pipeAsync(
        v.string(),
        v.checkAsync(() => new Promise<boolean>(() => {})),
      ),
    });
    render(
      <Host
        schema={schema}
        cfg={{ initialInput: { a: 'x' } }}
        onSubmit={vi.fn()}
        capture={(x: any) => (f = x)}
      />,
    );
    fireEvent.submit(document.querySelector('form')!);
    await sleep(30);
    log('Q1 hang', flags(f));
    act(() => F.reset(f));
    log('Q1 hang after reset', flags(f));
  });
});

const nodeIds = new WeakMap<Element, number>();
let nodeSeq = 0;
const nodeId = (el: Element) => {
  if (!nodeIds.has(el)) nodeIds.set(el, ++nodeSeq);
  return nodeIds.get(el);
};
let localSeq = 0;
function Row({ form, index, id, uncontrolled }: any) {
  const [local] = useState(() => ++localSeq);
  return (
    <Field of={form} path={['items', index, 'name']}>
      {(field: any) => (
        <div
          data-testid="row"
          data-local={local}
          data-key={id}
          data-touched={field.isTouched}
          data-dirty={field.isDirty}
          data-edited={field.isEdited}
          data-errors={JSON.stringify(field.errors)}
        >
          <input
            {...field.props}
            {...(uncontrolled ? {} : { value: field.input ?? '' })}
            aria-label={`row${local}`}
          />
        </div>
      )}
    </Field>
  );
}
function Rows({ capture, onSubmit = () => {}, uncontrolled = false, schema }: any) {
  const form: any = useForm({
    schema:
      schema ??
      v.object({ items: v.array(v.object({ name: v.pipe(v.string(), v.minLength(2, 'short')) })) }),
    initialInput: { items: [{ name: 'a0' }, { name: 'b0' }, { name: 'c0' }] },
  });
  capture(form);
  return (
    <Form of={form} onSubmit={onSubmit}>
      <FieldArray of={form} path={['items']}>
        {(fa: any) => (
          <div>
            {fa.items.map((id: string, i: number) => (
              <Row key={id} form={form} index={i} id={id} uncontrolled={uncontrolled} />
            ))}
          </div>
        )}
      </FieldArray>
    </Form>
  );
}
const snap = () =>
  screen.queryAllByTestId('row').map((r) => {
    const i = r.querySelector('input')!;
    return {
      value: i.value,
      name: i.name,
      node: nodeId(i),
      local: r.dataset.local,
      touched: r.dataset.touched,
      dirty: r.dataset.dirty,
      edited: r.dataset.edited,
      errors: r.dataset.errors,
      active: document.activeElement === i,
      key: r.dataset.key?.slice(0, 6),
    };
  });
const setup = (props: any = {}) => {
  let f: any;
  render(<Rows {...props} capture={(x: any) => (f = x)} />);
  return () => f;
};

describe('Q2', () => {
  it('state through move/swap/remove/insert/reset', async () => {
    const user = userEvent.setup();
    const form = setup();
    const inputs = () => screen.getAllByTestId('row').map((r) => r.querySelector('input')!);
    await user.type(inputs()[0], 'X');
    act(() => F.setErrors(form(), { path: ['items', 1, 'name'], errors: ['server-b'] }));
    log('Q2 start', snap());
    act(() => F.move(form(), { path: ['items'], from: 0, to: 2 }));
    log('Q2 move 0->2', snap());
    log('Q2 getInput', F.getInput(form()));
    act(() => F.swap(form(), { path: ['items'], at: 0, and: 2 }));
    log('Q2 swap 0<->2', snap());
    log('Q2 getInput', F.getInput(form()));
    act(() => F.remove(form(), { path: ['items'], at: 1 }));
    log('Q2 remove 1', snap());
    log('Q2 getInput', F.getInput(form()));
    log('Q2 array flags', {
      dirty: F.isDirty(form(), { path: ['items'] }),
      touched: F.isTouched(form(), { path: ['items'] }),
    });
    act(() => F.insert(form(), { path: ['items'], initialInput: { name: 'new' } }));
    log('Q2 insert at end', snap());
    act(() => F.reset(form()));
    log('Q2 reset', snap());
    log('Q2 reset getInput', F.getInput(form()));
  });
  for (const [label, focusIdx, op] of [
    [
      'move first->last, focused moved row',
      0,
      (f: any) => F.move(f, { path: ['items'], from: 0, to: 2 }),
    ],
    [
      'move last->first, focused moved row',
      2,
      (f: any) => F.move(f, { path: ['items'], from: 2, to: 0 }),
    ],
    ['move 0->1, focus row 0', 0, (f: any) => F.move(f, { path: ['items'], from: 0, to: 1 })],
    [
      'move 2->0, focus unmoved row 0',
      0,
      (f: any) => F.move(f, { path: ['items'], from: 2, to: 0 }),
    ],
    ['swap 0<->2, focus 0', 0, (f: any) => F.swap(f, { path: ['items'], at: 0, and: 2 })],
    ['swap 0<->2, focus 2', 2, (f: any) => F.swap(f, { path: ['items'], at: 0, and: 2 })],
    ['remove middle, focus last', 2, (f: any) => F.remove(f, { path: ['items'], at: 1 })],
    ['remove middle, focus removed', 1, (f: any) => F.remove(f, { path: ['items'], at: 1 })],
  ] as const) {
    it(`focus: ${label}`, async () => {
      const form = setup();
      const el = screen.getAllByTestId('row')[focusIdx].querySelector('input')!;
      const local = screen.getAllByTestId('row')[focusIdx].dataset.local;
      act(() => el.focus());
      act(() => op(form()));
      const activeRow = (document.activeElement as HTMLElement)?.closest?.(
        '[data-testid=row]',
      ) as HTMLElement | null;
      log(`Q2 focus ${label}`, {
        wasLocal: local,
        sameNodeConnected: el.isConnected,
        activeTag: document.activeElement?.tagName,
        activeLocal: activeRow?.dataset.local ?? null,
        rows: snap().map((r) => [r.local, r.value]),
      });
    });
  }
  it('focus(path) + shouldFocus after reorder', async () => {
    const form = setup();
    const rows = () => screen.getAllByTestId('row');
    const byValue = (s: string) => rows().find((r) => r.querySelector('input')!.value === s)!;
    fireEvent.change(byValue('b0').querySelector('input')!, { target: { value: 'b' } });
    await sleep();
    act(() => F.move(form(), { path: ['items'], from: 1, to: 2 }));
    act(() => F.focus(form(), { path: ['items', 2, 'name'] }));
    log('Q2 focus(path items.2) active value', (document.activeElement as any)?.value);
    act(() => (document.activeElement as any)?.blur());
    await act(() => F.validate(form(), { shouldFocus: true }));
    log('Q2 validate shouldFocus active value', {
      active: (document.activeElement as any)?.value,
      snap: snap(),
    });
    act(() => F.remove(form(), { path: ['items'], at: 0 }));
    act(() => (document.activeElement as any)?.blur());
    await act(() => F.validate(form(), { shouldFocus: true }));
    log('Q2 after remove, shouldFocus', {
      active: (document.activeElement as any)?.value,
      snap: snap(),
    });
    await sleep();
  });
  it('post-submit: real validation errors and setErrors under revalidation', async () => {
    const form = setup();
    const rows = () => screen.getAllByTestId('row');
    fireEvent.change(rows()[0].querySelector('input')!, { target: { value: 'a' } });
    fireEvent.submit(document.querySelector('form')!);
    await sleep();
    log('Q2 post-submit', snap());
    act(() => F.setErrors(form(), { path: ['items', 2, 'name'], errors: ['server-c'] }));
    log('Q2 + setErrors c', snap());
    act(() => F.move(form(), { path: ['items'], from: 0, to: 2 }));
    log('Q2 move (sync, before revalidate settles)', snap());
    await sleep();
    log('Q2 move (after revalidate)', snap());
  });
  it('uncontrolled with keys', async () => {
    const form = setup({ uncontrolled: true });
    log('Q2 uncontrolled initial', snap());
    act(() => F.move(form(), { path: ['items'], from: 0, to: 2 }));
    log('Q2 uncontrolled move', snap());
    log('Q2 uncontrolled getInput', F.getInput(form()));
  });
});

function Probe({ form, path, out }: any) {
  const field: any = useField(form, { path });
  out.current = field;
  return null;
}
describe('Q3', () => {
  it('shape', async () => {
    let f: any;
    const out: any = { current: null };
    let renderArg: any;
    let faOut: any;
    function A() {
      const form: any = useForm({
        schema: v.object({ a: v.string(), list: v.array(v.string()) }),
        initialInput: { a: 'x', list: ['p'] },
      });
      f = form;
      function FA() {
        faOut = useFieldArray(form, { path: ['list'] });
        return null;
      }
      return (
        <Form of={form} onSubmit={() => {}}>
          <Probe form={form} path={['a']} out={out} />
          <FA />
          <Field of={form} path={['a']}>
            {(s: any) => {
              renderArg = s;
              return <input {...s.props} value={s.input} />;
            }}
          </Field>
        </Form>
      );
    }
    render(<A />);
    const desc = (o: any) =>
      Object.fromEntries(
        Object.entries(Object.getOwnPropertyDescriptors(o)).map(([k, d]: any) => [
          k,
          d.get ? 'getter' : typeof d.value,
        ]),
      );
    log('Q3 useField', desc(out.current));
    log('Q3 useField.props', {
      ...desc(out.current.props),
      values: { name: out.current.props.name, autoFocus: out.current.props.autoFocus },
    });
    log('Q3 Field arg', desc(renderArg));
    log('Q3 useFieldArray', desc(faOut));
    log('Q3 useForm', desc(f));
    log('Q3 exports', Object.keys(F).sort());
  });
  it('Widget is normal component with hooks; onChange; touched; props without value', async () => {
    let f: any;
    const seen: any[] = [];
    function Widget({ form, path }: any) {
      const field: any = useField(form, { path });
      const [n, setN] = useState(0);
      const ref = useRef(0);
      useEffect(() => {
        ref.current++;
      });
      seen.push({
        input: field.input,
        touched: field.isTouched,
        dirty: field.isDirty,
        edited: field.isEdited,
        n,
      });
      return (
        <button
          type="button"
          onClick={() => {
            field.onChange('from-onChange');
            setN(n + 1);
          }}
        >
          widget:{String(field.input)}
        </button>
      );
    }
    function A() {
      const form: any = useForm({
        schema: v.object({ a: v.pipe(v.string(), v.minLength(100, 'too short')), u: v.string() }),
        initialInput: { a: 'x', u: 'init' },
      });
      f = form;
      return (
        <Form of={form} onSubmit={() => {}}>
          <Widget form={form} path={['a']} />
          <Field of={form} path={['u']}>
            {(s: any) => <input aria-label="u" {...s.props} />}
          </Field>
        </Form>
      );
    }
    render(
      <StrictMode>
        <A />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button'));
    await sleep();
    log('Q3 Widget text', screen.getByRole('button').textContent);
    log('Q3 Widget last render', seen.at(-1));
    log(
      'Q3 uncontrolled props-only DOM value (initial "init")',
      (screen.getByLabelText('u') as HTMLInputElement).value,
    );
    fireEvent.submit(document.querySelector('form')!);
    await sleep();
    log('Q3 Widget w/o ref after failed submit', {
      errors: F.getErrors(f, { path: ['a'] }),
      active: document.activeElement?.tagName,
      text: screen.getByRole('button').textContent,
    });
  });
  it('subscriptions', async () => {
    let f: any;
    const r = { parent: 0, siblingField: 0, plain: 0, plainFirst: 0, hookCond: 0, objCond: 0 };
    const vals: any = {};
    function PlainFirst({ form }: any) {
      r.plainFirst++;
      vals.plainFirst = F.getInput(form, { path: ['a'] });
      return null;
    }
    function PlainAfterField({ form }: any) {
      r.plain++;
      vals.plain = F.getInput(form, { path: ['a'] });
      return null;
    }
    function HookCond({ form }: any) {
      r.hookCond++;
      const a: any = useField(form, { path: ['a'] });
      vals.hookCond = a.input;
      return a.input === 'yes' ? <i data-testid="shown">shown</i> : null;
    }
    function ObjCond({ form }: any) {
      r.objCond++;
      const o: any = useField(form, { path: ['o'] });
      vals.objCond = o.input;
      return null;
    }
    const Stable = memo(function S({ form }: any) {
      return <HookCond form={form} />;
    });
    function A() {
      r.parent++;
      const form: any = useForm({
        schema: v.object({ a: v.string(), b: v.string(), o: v.object({ x: v.string() }) }),
        initialInput: { a: '', b: '', o: { x: '1' } },
      });
      f = form;
      return (
        <Form of={form} onSubmit={() => {}}>
          <PlainFirst form={form} />
          <Field of={form} path={['a']}>
            {(s: any) => <input aria-label="a" {...s.props} value={s.input ?? ''} />}
          </Field>
          <Field of={form} path={['b']}>
            {(s: any) => {
              r.siblingField++;
              return <input aria-label="b" {...s.props} value={s.input ?? ''} />;
            }}
          </Field>
          <PlainAfterField form={form} />
          <Stable form={form} />
          <ObjCond form={form} />
        </Form>
      );
    }
    render(<A />);
    const r0 = { ...r };
    fireEvent.change(screen.getByLabelText('a'), { target: { value: 'yes' } });
    await sleep();
    log('Q3 renders init', r0);
    log('Q3 renders after typing a=yes', r);
    log('Q3 vals seen in render', vals);
    log('Q3 shown', !!screen.queryByTestId('shown'));
    log('Q3 getInput outside render', F.getInput(f, { path: ['a'] }));
    const before = { ...r };
    act(() => F.setInput(f, { path: ['o', 'x'], input: '2' }));
    await sleep();
    log('Q3 nested set', { before: before.objCond, after: r.objCond, objCond: vals.objCond });
    const b2 = { ...r };
    act(() => F.setInput(f, { path: ['b'], input: 'zzz' }));
    await sleep();
    log(
      'Q3 set b (unrelated to Conditions): deltas',
      Object.fromEntries(Object.keys(r).map((k) => [k, (r as any)[k] - (b2 as any)[k]])),
    );
  });
  it('strict mode useField condition', async () => {
    function Cond({ form }: any) {
      const a: any = useField(form, { path: ['a'] });
      return <i data-testid="v">{String(a.input)}</i>;
    }
    function A() {
      const form: any = useForm({ schema: v.object({ a: v.string() }), initialInput: { a: '0' } });
      return (
        <Form of={form} onSubmit={() => {}}>
          <Field of={form} path={['a']}>
            {(s: any) => <input aria-label="a" {...s.props} value={s.input ?? ''} />}
          </Field>
          <Cond form={form} />
        </Form>
      );
    }
    render(
      <StrictMode>
        <A />
      </StrictMode>,
    );
    fireEvent.change(screen.getByLabelText('a'), { target: { value: '1' } });
    await sleep();
    fireEvent.change(screen.getByLabelText('a'), { target: { value: '2' } });
    await sleep();
    log('Q3 strict cond', screen.getByTestId('v').textContent);
  });
  it('unmounted field keeps value and still validates', async () => {
    let f: any;
    let setShow: any;
    const onSubmit = vi.fn();
    function A() {
      const [show, s] = useState(true);
      setShow = s;
      const form: any = useForm({
        schema: v.object({ a: v.pipe(v.string(), v.minLength(3, 'short')), b: v.string() }),
        initialInput: { a: '', b: 'b' },
      });
      f = form;
      return (
        <Form of={form} onSubmit={onSubmit}>
          {show ? (
            <Field of={form} path={['a']}>
              {(s: any) => <input aria-label="a" {...s.props} value={s.input ?? ''} />}
            </Field>
          ) : null}
          <Field of={form} path={['b']}>
            {(s: any) => <input aria-label="b" {...s.props} value={s.input ?? ''} />}
          </Field>
        </Form>
      );
    }
    render(<A />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('a'), 'ab');
    act(() => setShow(false));
    await sleep();
    const st = () => ({
      input: F.getInput(f, { path: ['a'] }),
      touched: F.isTouched(f, { path: ['a'] }),
      dirty: F.isDirty(f, { path: ['a'] }),
      errors: F.getErrors(f, { path: ['a'] }),
      formInput: F.getInput(f),
    });
    log('Q3 unmounted state', st());
    fireEvent.submit(document.querySelector('form')!);
    await sleep();
    log('Q3 unmounted invalid submit', {
      ...st(),
      onSubmit: onSubmit.mock.calls.length,
      active: document.activeElement?.tagName,
      deep: F.getDeepErrorEntries(f),
      formValid: f.isValid,
    });
    act(() => F.setInput(f, { path: ['a'], input: 'abc' }));
    await sleep();
    fireEvent.submit(document.querySelector('form')!);
    await sleep();
    log('Q3 unmounted valid submit output', { calls: onSubmit.mock.calls.map((c) => c[0]) });
    act(() => F.setInput(f, { path: ['a'], input: 'abcd' }));
    act(() => setShow(true));
    await sleep();
    log('Q3 remount', { dom: (screen.getByLabelText('a') as HTMLInputElement).value, ...st() });
  });
  it('invalid path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function A() {
      const form: any = useForm({ schema: v.object({ a: v.string() }) });
      useField(form, { path: ['nope'] });
      return null;
    }
    let msg = 'no throw';
    try {
      render(<A />);
    } catch (e: any) {
      msg = e.message;
    }
    spy.mockRestore();
    log('Q3 useField invalid path', msg);
  });
});

describe('Q4', () => {
  function App({ capture, onSubmit, schema, initialInput }: any) {
    const form: any = useForm({ schema, initialInput });
    capture(form);
    return (
      <>
        <button form="ext" data-testid="ext-attr">
          ext
        </button>
        <button type="button" data-testid="ext-method" onClick={() => F.submit(form)}>
          m
        </button>
        <button
          type="button"
          data-testid="ext-hs"
          onClick={F.handleSubmit(form, onSubmit) as any}
        >
          h
        </button>
        <Form of={form} onSubmit={onSubmit} id="ext">
          <Field of={form} path={['a']}>
            {(s: any) => <input aria-label="a" {...s.props} value={s.input ?? ''} />}
          </Field>
          <Field of={form} path={['b']}>
            {(s: any) => <input aria-label="b" {...s.props} value={s.input ?? ''} />}
          </Field>
        </Form>
      </>
    );
  }
  it('external submit', async () => {
    let f: any;
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <App
        capture={(x: any) => (f = x)}
        onSubmit={onSubmit}
        schema={v.object({ a: v.string(), b: v.string() })}
        initialInput={{ a: '1', b: '2' }}
      />,
    );
    for (const id of ['ext-attr', 'ext-method', 'ext-hs']) {
      onSubmit.mockClear();
      await user.click(screen.getByTestId(id));
      await sleep();
      log(`Q4 ${id}`, {
        calls: onSubmit.mock.calls.length,
        arg0: onSubmit.mock.calls[0]?.[0],
        arg1Type: (onSubmit.mock.calls[0] as any)?.[1]?.type ?? null,
      });
    }
    onSubmit.mockClear();
    await act(async () => (F.handleSubmit(f, onSubmit) as any)());
    log('Q4 handleSubmit()() no event', {
      calls: onSubmit.mock.calls.length,
      args: onSubmit.mock.calls[0]?.length,
    });
  });
  it('validate is whole-form; setErrors, getDirtyPaths, misc', async () => {
    let f: any;
    render(
      <App
        capture={(x: any) => (f = x)}
        onSubmit={vi.fn()}
        schema={v.object({
          a: v.pipe(v.string(), v.minLength(2, 'a short')),
          b: v.pipe(v.string(), v.minLength(2, 'b short')),
        })}
        initialInput={{ a: 'x', b: 'y' }}
      />,
    );
    const r: any = await act(() => F.validate(f));
    log('Q4 validate result', {
      success: r?.success,
      issues: r?.issues?.map((i: any) => i.message),
      a: F.getErrors(f, { path: ['a'] }),
      b: F.getErrors(f, { path: ['b'] }),
      deep: F.getDeepErrors(f),
      entries: F.getDeepErrorEntries(f),
      first: F.getDeepError(f),
      entry: F.getDeepErrorEntry(f),
    });
    fireEvent.change(screen.getByLabelText('a'), { target: { value: 'zz' } });
    await sleep();
    log('Q4 getDirtyPaths after edit', {
      paths: F.getDirtyPaths(f),
      dirtyInput: F.getDirtyInput(f),
      isDirtyA: F.isDirty(f, { path: ['a'] }),
      pick: F.pickDirty(f, { from: { a: 'zz', b: 'y' } }),
    });
    act(() => F.setErrors(f, { path: ['b'], errors: ['server'] }));
    act(() => F.setErrors(f, { errors: ['form-level'] }));
    log('Q4 setErrors', { b: F.getErrors(f, { path: ['b'] }), form: f.errors, isValid: f.isValid });
    fireEvent.submit(document.querySelector('form')!);
    await sleep();
    log('Q4 setErrors then submit', { b: F.getErrors(f, { path: ['b'] }), form: f.errors });
    act(() => F.setErrors(f, { path: ['a'], errors: ['server-a'] }));
    fireEvent.change(screen.getByLabelText('b'), { target: { value: 'ok' } });
    await sleep();
    log('Q4 setErrors a, then after-submit typing in b', {
      a: F.getErrors(f, { path: ['a'] }),
      b: F.getErrors(f, { path: ['b'] }),
    });
    act(() => F.focus(f, { path: ['b'] }));
    log('Q4 focus(b)', (document.activeElement as any)?.getAttribute('aria-label'));
  });
  it('submit after Form unmounted', async () => {
    let f: any;
    const onSubmit = vi.fn();
    function A() {
      const form: any = useForm({ schema: v.object({}) });
      f = form;
      const [show, setShow] = useState(true);
      return (
        <>
          <button data-testid="toggle" onClick={() => setShow(!show)}>
            t
          </button>
          {show ? <Form of={form} onSubmit={onSubmit} /> : null}
        </>
      );
    }
    render(<A />);
    fireEvent.click(screen.getByTestId('toggle'));
    await sleep();
    let msg = 'no throw';
    try {
      F.submit(f);
    } catch (e: any) {
      msg = e.message + ' / ' + e.name;
    }
    await sleep();
    log('Q4 submit after Form unmount', { msg, calls: onSubmit.mock.calls.length });
  });
});

describe('Q3b plain getInput reactivity', () => {
  it('plain child after a Field, no hook of its own', async () => {
    const r = { parent: 0, fieldB: 0, plain: 0 };
    let seen: any;
    function Plain({ form }: any) {
      r.plain++;
      seen = F.getInput(form, { path: ['a'] });
      return <i data-testid="p">{String(seen)}</i>;
    }
    function A() {
      r.parent++;
      const form: any = useForm({
        schema: v.object({ a: v.string(), b: v.string() }),
        initialInput: { a: '0', b: '' },
      });
      return (
        <Form of={form} onSubmit={() => {}}>
          <Field of={form} path={['a']}>
            {(s: any) => <input aria-label="a" {...s.props} value={s.input ?? ''} />}
          </Field>
          <Field of={form} path={['b']}>
            {(s: any) => {
              r.fieldB++;
              return <input aria-label="b" {...s.props} value={s.input ?? ''} />;
            }}
          </Field>
          <Plain form={form} />
        </Form>
      );
    }
    render(<A />);
    const r0 = { ...r };
    fireEvent.change(screen.getByLabelText('a'), { target: { value: '1' } });
    await sleep();
    log('Q3b plain after Field', { r0, r, dom: screen.getByTestId('p').textContent });
  });
  it('plain child directly under useForm owner', async () => {
    const r = { parent: 0, plain: 0 };
    function Plain({ form }: any) {
      r.plain++;
      return <i data-testid="p">{String(F.getInput(form, { path: ['a'] }))}</i>;
    }
    let f: any;
    function A() {
      r.parent++;
      const form: any = useForm({ schema: v.object({ a: v.string() }), initialInput: { a: '0' } });
      f = form;
      return <Plain form={form} />;
    }
    render(<A />);
    act(() => F.setInput(f, { path: ['a'], input: '1' }));
    await sleep();
    log('Q3b plain under owner', { r, dom: screen.getByTestId('p').textContent });
  });
  it('getInput read inside useEffect is not reactive', async () => {
    let f: any;
    let effects = 0;
    function Eff({ form }: any) {
      useField(form, { path: ['b'] });
      useEffect(() => {
        effects++;
        F.getInput(form, { path: ['a'] });
      });
      return null;
    }
    function A() {
      const form: any = useForm({
        schema: v.object({ a: v.string(), b: v.string() }),
        initialInput: { a: '0', b: '' },
      });
      f = form;
      return <Eff form={form} />;
    }
    render(<A />);
    const e0 = effects;
    act(() => F.setInput(f, { path: ['a'], input: '1' }));
    await sleep();
    log('Q3b effect read', { e0, effects });
  });
  it('whole-form getInput from a hook-owning component', async () => {
    let f: any;
    const seen: any[] = [];
    function Cond({ form }: any) {
      useField(form, { path: ['a'] });
      seen.push(JSON.stringify(F.getInput(form)));
      return null;
    }
    const M = memo(Cond);
    function A() {
      const form: any = useForm({
        schema: v.object({ a: v.string(), b: v.string() }),
        initialInput: { a: '0', b: '' },
      });
      f = form;
      return <M form={form} />;
    }
    render(<A />);
    act(() => F.setInput(f, { path: ['b'], input: 'z' }));
    await sleep();
    log('Q3b useField + getInput(form)', seen);
  });
});
