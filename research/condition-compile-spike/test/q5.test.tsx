import { it } from 'vitest';
import { render, fireEvent, act, cleanup, screen } from '@testing-library/react';
import { Field, Form, useForm, getErrors } from '@formisch/react';
import { compileC, compileE, type Node } from '../src/compile';
import { log } from '../src/harness';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const DEF: Node[] = [
  { kind: 'field', key: 'a', type: 'string', required: true, rules: [{ type: 'minLength', n: 3, message: 'a-min3' }] },
  { kind: 'field', key: 'b', type: 'string', required: true },
];
function Two({ schema, cfg, onSub, handle }: any) {
  const form = useForm({ schema, ...cfg } as any) as any;
  handle.form = form;
  return (
    <Form of={form} onSubmit={onSub} data-testid="form">
      {['a', 'b'].map((k) => (
        <Field key={k} of={form} path={[k] as any}>
          {(f: any) => <input data-testid={k} {...f.props} value={f.input ?? ''} />}
        </Field>
      ))}
    </Form>
  );
}
const modes = ['initial', 'touch', 'input', 'change', 'blur', 'submit'] as const;

for (const [cname, compile] of Object.entries({ C: compileC, E: compileE })) {
  it(`mode table ${cname}`, async () => {
    log(`\n=== Q5 mode table ${cname}: [rootRuns, aErrors, bErrors] after each DOM event on field a only`);
    for (const validateMode of modes) {
      let runs = 0;
      const handle: any = {};
      const schema = compile(DEF, { onRun: () => runs++ });
      render(<Two schema={schema} cfg={{ validate: validateMode, revalidate: 'input' }} handle={handle} onSub={() => {}} />);
      await flush();
      const snap = () => [runs, getErrors(handle.form, { path: ['a'] } as any), getErrors(handle.form, { path: ['b'] } as any)];
      const out: any = { mount: snap() };
      const a = screen.getByTestId('a');
      fireEvent.focus(a); await flush(); out.focus = snap();
      fireEvent.change(a, { target: { value: 'x' } }); await flush(); out.change = snap();
      fireEvent.blur(a); await flush(); out.blur = snap();
      fireEvent.change(a, { target: { value: 'xyz' } }); await flush(); out.change2_afterErrors = snap();
      fireEvent.submit(screen.getByTestId('form')); await flush(); out.submit = snap();
      fireEvent.change(screen.getByTestId('b'), { target: { value: 'q' } }); await flush(); out.changeB_afterSubmit = snap();
      log(`validate=${validateMode}`, out);
      cleanup();
    }
  });
}

const DEP: Node[] = [
  { kind: 'field', key: 'a', type: 'string' },
  { kind: 'field', key: 'b', type: 'string', required: true, visible: { op: 'eq', scope: 'root', path: ['a'], value: 'show' } },
];
it('stale dependent error when the driver has no error of its own', async () => {
  log('\n=== Q5 stale dependent error (validate=blur, revalidate=input)');
  for (const [cname, compile] of Object.entries({ C: compileC, E: compileE })) {
    for (const cfg of [{ validate: 'blur', revalidate: 'input' }, { validate: 'submit', revalidate: 'input' }] as any[]) {
      let runs = 0;
      const handle: any = {};
      render(<Two schema={compile(DEP, { onRun: () => runs++ })} cfg={cfg} handle={handle} onSub={() => {}} />);
      await flush();
      const a = screen.getByTestId('a');
      const be = () => [runs, getErrors(handle.form, { path: ['b'] } as any)];
      fireEvent.change(a, { target: { value: 'show' } }); await flush();
      if (cfg.validate === 'blur') fireEvent.blur(a); else fireEvent.submit(screen.getByTestId('form'));
      await flush();
      const shown = be();
      fireEvent.change(a, { target: { value: 'hide' } }); await flush();
      const afterToggle = be();
      fireEvent.blur(a); await flush();
      log(`${cname} ${cfg.validate}`, { shown, afterToggleNoBlur: afterToggle, afterBlur: be() });
      cleanup();
    }
  }
});

it('revalidate table (validate=submit, after a failed submit)', async () => {
  log('\n=== Q5 revalidate table: runs after each DOM event, post-submit, field a only');
  for (const revalidate of ['touch', 'input', 'change', 'blur', 'submit'] as const) {
    let runs = 0; const handle: any = {};
    render(<Two schema={compileE(DEF, { onRun: () => runs++ })} cfg={{ validate: 'submit', revalidate }} handle={handle} onSub={() => {}} />);
    fireEvent.submit(screen.getByTestId('form')); await flush();
    const out: any = { submit: runs };
    const a = screen.getByTestId('a');
    fireEvent.focus(a); await flush(); out.focus = runs;
    fireEvent.change(a, { target: { value: 'x' } }); await flush(); out.change = runs;
    fireEvent.blur(a); await flush(); out.blur = runs;
    log(`revalidate=${revalidate}`, out);
    cleanup();
  }
});
