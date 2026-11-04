// Spike for AF-10. A minimal Wizard harness that implements the decisions, driven through real Formisch.
import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as v from 'valibot';
import * as F from '@formisch/react';
import { Form, useField, useForm } from '@formisch/react';
import { compile, fieldsOf, findCycle, isVisible, type N } from './wizard-cascade';

const log = (tag: string, val?: unknown) => console.log(`OBS ${tag} ${JSON.stringify(val)}`);
const tick = (ms = 10) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
let unhandled: string[] = [];
const onUnhandled = (e: any) => unhandled.push(String(e?.message ?? e));
process.on('unhandledRejection', onUnhandled);
afterAll(() => void process.off('unhandledRejection', onUnhandled));
beforeEach(() => void (unhandled = []));
afterEach(cleanup);

const text = (name: string, extra: Partial<N> = {}): N => ({ type: 'text', name, ...extra });
const DEF: N[] = [
  { type: 'page', components: [text('name', { required: true }), text('taxId', { required: { field: 'hasCompany', op: 'eq', value: 'yes' } })] },
  { type: 'page', components: [text('hasCompany'), text('city', { required: true }), text('wantExtra')] },
  { type: 'page', visible: { field: 'wantExtra', op: 'not_empty' }, components: [text('extra', { required: true })] },
  { type: 'page', components: [{ type: 'repeater', name: 'rows', components: [text('street', { required: true })] }] },
];
const INITIAL = { rows: [{ street: '' }] };

function W({ form, path, show, leakAutoFocus }: any) {
  const field: any = useField(form, { path });
  const { autoFocus, ...props } = field.props;
  const errors = show ? (field.errors ?? []) : [];
  return (
    <label>
      {path.join('.')}
      <input
        {...props}
        {...(leakAutoFocus ? { autoFocus } : {})}
        aria-label={path.join('.')}
        value={field.input ?? ''}
        onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
      />
      {errors.map((m: string) => (
        <span key={m} data-testid={`err-${path.join('.')}`}>
          {m}
        </span>
      ))}
    </label>
  );
}

function Wizard({ def, form, onSubmit, api, leakAutoFocus }: any) {
  const names = useMemo(() => fieldsOf(def).map((n) => n.name!), [def]);
  // Subscribes to every root Field, because `getInput` in render can be stale (AF-9).
  const roots = names.map((n) => useField(form, { path: [n] } as any) as any);
  const input = Object.fromEntries(names.map((n, i) => [n, roots[i].input]));
  const visible = def.map((p: N, i: number) => (isVisible(def, p, input) ? i : -1)).filter((i: number) => i >= 0);
  const pageOf = (path: any[]) => def.findIndex((p: N) => fieldsOf(p.components!).some((f) => f.name === path[0]));

  const [cur, setCur] = useState(0);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [focusReq, setFocusReq] = useState<any>(null);
  const pending = useRef(false);
  const force = useRef(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  // Q4: the open Page was hidden from outside: next visible, else previous visible.
  const effective = visible.includes(cur) ? cur : (visible.find((i: number) => i > cur) ?? visible.filter((i: number) => i < cur).at(-1) ?? -1);
  useEffect(() => {
    if (effective !== cur) {
      setCur(effective);
      setFocusReq({ wrapper: true });
    }
  }, [effective, cur]);
  useEffect(() => {
    if (!focusReq) return;
    if (focusReq.path) F.focus(form, { path: focusReq.path });
    else wrapper.current?.focus();
  }, [focusReq]);
  useLayoutEffect(() => void (mounted.current = true), []);

  const firstError = (entries: { path: any[] }[], pages: number[]) => {
    for (const p of pages) {
      const hit = entries.find((e) => pageOf(e.path) === p);
      if (hit) return { page: p, path: hit.path };
    }
    return null;
  };

  const goTo = async (target: number) => {
    if (pending.current || form.isSubmitting || !visible.includes(target)) return false;
    if (target <= effective) {
      setCur(target);
      setFocusReq({ wrapper: true });
      return true;
    }
    pending.current = true;
    try {
      const result: any = await F.validate(form);
      const pages = visible.filter((i: number) => i >= effective && i < target);
      setAttempted((s) => new Set([...s, ...pages]));
      const entries = (result.issues ?? []).map((i: any) => ({ path: i.path?.map((p: any) => p.key) ?? [] }));
      const stray = entries.filter((e: any) => pageOf(e.path) < 0);
      if (stray.length) {
        setFormErrors(['stray']);
        return false;
      }
      const hit = firstError(entries, pages);
      if (hit) {
        setCur(hit.page);
        setFocusReq({ path: hit.path });
        return false;
      }
      setCur(target);
      setFocusReq({ wrapper: true });
      return true;
    } catch (error: any) {
      setFormErrors([String(error.message)]);
      return false;
    } finally {
      pending.current = false;
    }
  };
  const idx = visible.indexOf(effective);
  const isLast = idx === visible.length - 1;

  const realSubmit = async () => {
    let called = false;
    let serverErrors: any[] = [];
    await F.handleSubmit(form, async (output: any) => {
      called = true;
      serverErrors = (await onSubmit?.(output))?.errors ?? [];
    })();
    setAttempted(new Set(def.map((_: N, i: number) => i)));
    if (!called) {
      const hit = firstError(F.getDeepErrorEntries(form) as any, visible);
      if (hit) {
        setCur(hit.page);
        setFocusReq({ path: hit.path });
      }
      return;
    }
    const placed = serverErrors.filter((x) => visible.includes(pageOf(x.path)));
    setFormErrors(serverErrors.filter((x) => !placed.includes(x)).map((x) => x.message));
    for (const x of placed) F.setErrors(form, { path: x.path, errors: [x.message] } as any);
    const hit = firstError(placed, visible);
    if (hit) {
      setCur(hit.page);
      setFocusReq({ path: hit.path });
    }
  };
  // `<Form>` always wires handleSubmit on bubble; the capture handler takes over and stops it.
  const onSubmitCapture = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const forced = force.current;
    force.current = false;
    if (!forced && !isLast) return void goTo(visible[idx + 1]);
    return void realSubmit();
  };

  const wizard = {
    pages: visible.map((i: number) => ({
      index: i,
      isCurrent: i === effective,
      errorCount: attempted.has(i) ? (F.getDeepErrorEntries(form) as any[]).filter((x) => pageOf(x.path) === i).length : 0,
    })),
    isFirst: idx === 0,
    isLast,
    next: () => goTo(visible[idx + 1]),
    back: () => (idx > 0 ? void goTo(visible[idx - 1]) : undefined),
    goTo,
  };
  api.wizard = wizard;
  api.cur = effective;
  api.attempted = attempted;
  api.submit = () => {
    force.current = true;
    F.submit(form);
  };

  const page = def[effective];
  const paths = (n: N): any[] => (n.type === 'repeater' ? [[n.name, 0, ...[n.components![0].name]]] : [[n.name]]);
  return (
    <Form of={form} onSubmit={() => {}} onSubmitCapture={onSubmitCapture} id="f" data-testid="form">
      {formErrors.length > 0 && <div role="alert">{formErrors.join(',')}</div>}
      <div role="group" tabIndex={-1} ref={wrapper} data-testid="wrapper" key={effective}>
        {page &&
          fieldsOf(page.components!)
            .flatMap(paths)
            .map((path) => <W key={path.join('.')} form={form} path={path} show={attempted.has(effective)} leakAutoFocus={leakAutoFocus} />)}
      </div>
      {!wizard.isFirst && (
        <button type="button" onClick={wizard.back}>
          back
        </button>
      )}
      <button type="submit">{isLast ? 'send' : 'next'}</button>
    </Form>
  );
}

function Host({ onSubmit, api, schema, def = DEF, wizardKey, strict, ...rest }: any) {
  const compiled = useMemo(() => schema ?? compile(def), []);
  const form: any = useForm({ schema: compiled, validate: 'input', initialInput: INITIAL } as any);
  api.form = form;
  return <Wizard key={wizardKey} def={def} form={form} onSubmit={onSubmit} api={api} {...rest} />;
}
const mount = (props: any = {}) => {
  const api: any = {};
  const utils = render(<Host api={api} {...props} />);
  return { api, user: userEvent.setup(), ...utils };
};
const field = (n: string) => screen.getByLabelText(n) as HTMLInputElement;
const err = (n: string) => screen.queryByTestId(`err-${n}`);
const store = (api: any) => (F.getDeepErrorEntries(api.form) as any[]).map((e) => e.path.join('.'));

describe('AF-10', () => {
  it('Q1: next blocks on the current Page only; store also holds errors of later Pages', async () => {
    const { api, user } = mount();
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(0);
    expect(err('name')?.textContent).toBe('required');
    expect(document.activeElement).toBe(field('name'));
    expect(store(api)).toEqual(expect.arrayContaining(['name', 'city', 'rows.0.street']));
    expect(api.form.isValid).toBe(false);
    log('Q1 store after blocked next', store(api));
  });

  it('Q1: same under StrictMode', async () => {
    const api: any = {};
    render(
      <StrictMode>
        <Host api={api} />
      </StrictMode>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('next'));
    await tick();
    expect(document.activeElement).toBe(field('name'));
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(1);
  });

  it('Q1: errors clear and return while typing, before any submit', async () => {
    const { api, user } = mount();
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('name'), 'a');
    await tick();
    expect(err('name')).toBeNull();
    expect(api.form.isSubmitted).toBe(false);
    await user.clear(field('name'));
    await tick();
    expect(err('name')?.textContent).toBe('required');
  });

  it('Q1: never-attempted Page shows no error though the store has one', async () => {
    const { api, user } = mount();
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(1);
    expect(store(api)).toContain('city');
    expect(err('city')).toBeNull();
    expect(screen.getByTestId('wrapper')).toBe(document.activeElement);
    await user.type(field('hasCompany'), 'x');
    await tick();
    expect(err('city')).toBeNull();
    log('Q1 errorCount per Page', api.wizard.pages);
  });

  it('autoFocus: forwarding field.props.autoFocus steals focus on the new Page; omitting it does not', async () => {
    const seen: Record<string, string | undefined> = {};
    for (const leakAutoFocus of [true, false]) {
      const def: N[] = [{ type: 'page', components: [text('a')] }, { type: 'page', components: [text('b', { required: true })] }];
      function Probe() {
        const form: any = useForm({ schema: compile(def), validate: 'input' } as any);
        const [show, setShow] = useState(false);
        return (
          <Form of={form} onSubmit={() => {}}>
            {show ? <W key="b" form={form} path={['b']} show={false} leakAutoFocus={leakAutoFocus} /> : <W key="a" form={form} path={['a']} show={false} />}
            <button type="button" onClick={async () => { await F.validate(form); setShow(true); }}>
              flip
            </button>
          </Form>
        );
      }
      const user = userEvent.setup();
      const { unmount } = render(<Probe />);
      await user.click(screen.getByText('flip'));
      await tick();
      seen[String(leakAutoFocus)] = `${document.activeElement?.tagName}:${(document.activeElement as any)?.name}`;
      unmount();
    }
    log('autoFocus activeElement by leak', seen);
    expect(seen.true).toBe('INPUT:["b"]');
    expect(seen.false).toBe('BUTTON:');
  });

  it('Q2/Q5: late error on an earlier Page does not block next; submit jumps back and focuses', async () => {
    const onSubmit = () => { throw new Error('must not run'); };
    const { api, user } = mount({ onSubmit });
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('hasCompany'), 'yes');
    await user.type(field('city'), 'c');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(3);
    expect(store(api)).toContain('taxId');
    expect(api.wizard.pages[0].errorCount).toBe(1);
    await user.type(field('rows.0.street'), 's');
    await user.click(screen.getByText('send'));
    await tick();
    expect(api.cur).toBe(0);
    expect(err('taxId')?.textContent).toBe('required');
    expect(document.activeElement).toBe(field('taxId'));
    expect(api.form.errors).toBeNull();
  });

  it('Q3: back does not validate and keeps values; goTo stops at the first failing Page', async () => {
    const { api, user } = mount();
    await user.type(field('name'), 'a');
    let r: any;
    await act(async () => { r = await api.wizard.goTo(3); });
    await tick();
    expect(r).toBe(false);
    expect(api.cur).toBe(1);
    expect(document.activeElement).toBe(field('city'));
    await user.click(screen.getByText('back'));
    await tick();
    expect(api.cur).toBe(0);
    expect(field('name').value).toBe('a');
    expect(screen.getByTestId('wrapper')).toBe(document.activeElement);
    await act(async () => { r = await api.wizard.goTo(2); });
    expect(r).toBe(false);
    expect(api.cur).toBe(0);
  });

  it('Q4: hidden Page leaves navigation, re-enters when shown, and its value survives', async () => {
    const out: any[] = [];
    const { api, user } = mount({ onSubmit: (o: any) => void out.push(o) });
    expect(api.wizard.pages.map((p: any) => p.index)).toEqual([0, 1, 3]);
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('city'), 'c');
    await user.type(field('wantExtra'), 'y');
    await tick();
    expect(api.wizard.pages.map((p: any) => p.index)).toEqual([0, 1, 2, 3]);
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(2);
    await user.type(field('extra'), 'keep');
    await user.click(screen.getByText('back'));
    await tick();
    await user.clear(field('wantExtra'));
    await tick();
    expect(api.wizard.pages.map((p: any) => p.index)).toEqual([0, 1, 3]);
    expect(F.getInput(api.form, { path: ['extra'] } as any)).toBe('keep');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(3);
    await user.type(field('rows.0.street'), 's');
    await user.click(screen.getByText('send'));
    await tick();
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty('extra');
    log('Q4 output', out[0]);
  });

  it('Q4: open Page hidden from outside moves to next visible, else previous', async () => {
    const { api, user } = mount({ def: DEF.slice(0, 3) });
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('city'), 'c');
    await user.type(field('wantExtra'), 'y');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(2);
    act(() => F.setInput(api.form, { path: ['wantExtra'], input: undefined } as any));
    await tick();
    expect(api.cur).toBe(1);
    expect(screen.getByTestId('wrapper')).toBe(document.activeElement);
  });

  it('Q4: every Page hidden needs a cycle, so the cycle check rules it out', () => {
    const self: N[] = [{ type: 'page', visible: { field: 'a', op: 'not_empty' }, components: [text('a')] }];
    const mutual: N[] = [
      { type: 'page', visible: { field: 'b', op: 'not_empty' }, components: [text('a')] },
      { type: 'page', visible: { field: 'a', op: 'not_empty' }, components: [text('b')] },
    ];
    const viaField: N[] = [
      { type: 'page', visible: { field: 'b', op: 'not_empty' }, components: [text('a')] },
      { type: 'page', visible: { field: 'c', op: 'not_empty' }, components: [text('b')] },
      { type: 'page', components: [text('c', { visible: { field: 'a', op: 'not_empty' } })] },
    ];
    log('Q4 cycles', [findCycle(self), findCycle(mutual), findCycle(viaField)]);
    expect(findCycle(self)).toBeTruthy();
    expect(findCycle(mutual)).toBeTruthy();
    expect(findCycle(viaField)).toBeTruthy();
    expect(findCycle(DEF)).toBeNull();
  });

  it('Q5: Enter on a middle Page runs next, not submit; submit() forces a real submit', async () => {
    const calls: any[] = [];
    const { api, user } = mount({ onSubmit: (o: any) => void calls.push(o) });
    await user.type(field('name'), 'a{Enter}');
    await tick();
    expect(api.cur).toBe(1);
    expect(api.form.isSubmitted).toBe(false);
    expect(err('city')).toBeNull();
    act(() => api.submit());
    await tick();
    expect(api.form.isSubmitted).toBe(true);
    expect(api.cur).toBe(1);
    expect(err('city')?.textContent).toBe('required');
    expect(document.activeElement).toBe(field('city'));
    expect(calls).toHaveLength(0);
  });

  it('Escape hatch: F.submit(store) on a middle Page goes through the capture handler as next', async () => {
    const { api, user } = mount();
    await user.type(field('name'), 'a');
    act(() => F.submit(api.form));
    await tick();
    expect(api.form.isSubmitted).toBe(false);
    expect(api.cur).toBe(1);
  });

  it('Q5: server errors open the Page of an Active Field; unknown path goes to the alert', async () => {
    const { api, user } = mount({
      onSubmit: () => ({ errors: [{ message: 'taken', path: ['city'] }, { message: 'general', path: ['nope'] }] }),
    });
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('city'), 'c');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('rows.0.street'), 's');
    await user.click(screen.getByText('send'));
    await tick();
    expect(api.cur).toBe(1);
    expect(err('city')?.textContent).toBe('taken');
    expect(document.activeElement).toBe(field('city'));
    expect(screen.getByRole('alert').textContent).toBe('general');
    await user.type(field('hasCompany'), 'n');
    await tick();
    log('Q5 server error after typing another Field', err('city')?.textContent ?? null);
    expect(err('city')).toBeNull();
  });

  it('Q6: values survive unmount; repeater row error maps to its Page through path[0]', async () => {
    const { api, user } = mount();
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.type(field('city'), 'c');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(3);
    await user.click(screen.getByText('send'));
    await tick();
    expect(api.cur).toBe(3);
    expect(err('rows.0.street')?.textContent).toBe('required');
    expect(document.activeElement).toBe(field('rows.0.street'));
    await user.click(screen.getByText('back'));
    await tick();
    expect(field('city').value).toBe('c');
  });

  it('Q8: a double click on next moves one Page', async () => {
    const { api, user } = mount();
    await user.type(field('name'), 'a');
    const btn = screen.getByText('next');
    await act(async () => {
      btn.click();
      btn.click();
    });
    await tick();
    expect(api.cur).toBe(1);
  });

  it('Q12: reset keeps the Page and attempted set; changing key resets the Wizard', async () => {
    const api: any = {};
    const { rerender } = render(<Host api={api} wizardKey={1} />);
    const user = userEvent.setup();
    await user.type(field('name'), 'a');
    await user.click(screen.getByText('next'));
    await tick();
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.attempted.has(1)).toBe(true);
    act(() => F.reset(api.form));
    await tick();
    expect(api.cur).toBe(1);
    expect(api.attempted.has(1)).toBe(true);
    rerender(<Host api={api} wizardKey={2} />);
    await tick();
    expect(api.cur).toBe(0);
    expect(api.attempted.size).toBe(0);
    expect(field('name').value).toBe('');
  });

  it('Cost: a throwing custom Rule rejects on the first keystroke, before any submit', async () => {
    const schema = v.object({
      name: v.optional(v.pipe(v.unknown(), v.check((x) => { if (x === 'boom') throw new Error('boom-rule'); return true; }))),
      b: v.optional(v.unknown()),
    });
    const def: N[] = [{ type: 'page', components: [text('name')] }, { type: 'page', components: [text('b')] }];
    const { api, user } = mount({ def, schema });
    await user.type(field('name'), 'boom');
    await tick();
    log('Cost throw on keystroke', { unhandled, isSubmitted: api.form.isSubmitted });
    expect(unhandled).toContain('boom-rule');
    await user.click(screen.getByText('next'));
    await tick();
    expect(api.cur).toBe(0);
    expect(screen.getByRole('alert').textContent).toBe('boom-rule');
    expect(api.form.isValidating).toBe(false);
  });

  it('Cost: rough time for one full parse per keystroke', async () => {
    const rows: any[] = [];
    for (const size of [50, 200, 500]) {
      const names = Array.from({ length: size }, (_, i) => `f${i}`);
      const def: N[] = [{ type: 'page', components: names.map((n, i) => text(n, { required: i % 2 === 0, visible: i > 0 && i % 5 === 0 ? { field: `f${i - 1}`, op: 'not_empty' } : undefined })) }];
      const schema = compile(def);
      const input = Object.fromEntries(names.map((n) => [n, 'x']));
      const runs: number[] = [];
      for (let i = 0; i < 30; i++) {
        const t = performance.now();
        await v.safeParseAsync(schema, input);
        runs.push(performance.now() - t);
      }
      runs.sort((a, b) => a - b);
      rows.push({ size, medianMs: Number(runs[15].toFixed(2)), maxMs: Number(runs[29].toFixed(2)) });
    }
    log('Cost parse ms', rows);
    expect(rows).toHaveLength(3);
  });
});
