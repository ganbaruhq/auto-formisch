import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as v from 'valibot';
import * as F from '@formisch/react';
import { Field, FieldArray, Form, useForm } from '@formisch/react';

const schema = v.object({ items: v.array(v.object({ name: v.string() })) });
let form: any;
function App() {
  form = useForm({
    schema,
    initialInput: { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] },
  });
  return (
    <Form of={form} onSubmit={() => {}}>
      <FieldArray of={form} path={['items']}>
        {(fa: any) => (
          <div>
            {fa.items.map((id: string, i: number) => (
              <Field key={id} of={form} path={['items', i, 'name']}>
                {(s: any) => <input {...s.props} value={s.input ?? ''} />}
              </Field>
            ))}
          </div>
        )}
      </FieldArray>
    </Form>
  );
}
const cases: [string, number, (f: any) => void][] = [
  ['move 0->2 focus moved', 0, (f) => F.move(f, { path: ['items'], from: 0, to: 2 })],
  ['move 2->0 focus moved', 2, (f) => F.move(f, { path: ['items'], from: 2, to: 0 })],
  ['move 0->1 focus moved', 0, (f) => F.move(f, { path: ['items'], from: 0, to: 1 })],
  ['move 2->0 focus other (row0)', 0, (f) => F.move(f, { path: ['items'], from: 2, to: 0 })],
  ['swap 0,2 focus 0', 0, (f) => F.swap(f, { path: ['items'], at: 0, and: 2 })],
  ['swap 0,2 focus 2', 2, (f) => F.swap(f, { path: ['items'], at: 0, and: 2 })],
  ['remove 1 focus 2', 2, (f) => F.remove(f, { path: ['items'], at: 1 })],
];
const out: any[] = [];
const wait = () => new Promise((r) => setTimeout(r, 30));
(async () => {
  for (const [label, idx, op] of cases) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(<App />));
    await wait();
    const el = host.querySelectorAll('input')[idx] as HTMLInputElement;
    el.focus();
    const before = document.activeElement === el;
    let blurs = 0;
    el.addEventListener('blur', () => blurs++);
    flushSync(() => op(form));
    await wait();
    out.push({
      label,
      before,
      value: el.value,
      stillFocused: document.activeElement === el,
      active: document.activeElement?.tagName,
      blurs,
      order: [...host.querySelectorAll('input')].map((i) => i.value).join(),
    });
    root.unmount();
    host.remove();
  }
  document.body.innerHTML = '<pre id="result">' + JSON.stringify(out) + '</pre>';
})().catch((e) => {
  document.body.innerHTML = '<pre id="result">ERR ' + e + '</pre>';
});
