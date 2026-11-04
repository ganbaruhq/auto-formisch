import { useEffect, useState } from 'react';
import {
  getDeepErrorEntries,
  getInput,
  insert,
  isDirty,
  remove,
  reset,
  useForm,
  validate,
} from '@formisch/react';
import { AutoForm, compile, type AutoFormStore } from '@auto-formisch/react';
import { record } from './record';

/**
 * Formisch behaviours the spec left open, probed on a compiled schema in a
 * real browser: `validate: 'initial'` with `reset`, `reset` with `keepInput`
 * when nested row counts differ, and `insert` after `remove`. The stores are
 * rendered through `<AutoForm store>`, so the DOM shows the rows too. Results
 * are written to `#probes` as JSON.
 */
const definition = {
  version: 1,
  components: [
    { type: 'text', name: 'a', label: 'A', required: true },
    {
      type: 'repeater',
      name: 'rows',
      label: 'Rows',
      components: [
        { type: 'text', name: 't', label: 'T', required: true },
        {
          type: 'repeater',
          name: 'inner',
          label: 'Inner',
          components: [{ type: 'text', name: 'u', label: 'U', required: true }],
        },
      ],
    },
  ],
};

const start = {
  a: 'x',
  rows: [
    { t: 'r1', inner: [{ u: 'a' }, { u: 'b' }] },
    { t: 'r2', inner: [] },
    { t: 'r3', inner: [{ u: 'c' }] },
  ],
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
const errors = (store: AutoFormStore) =>
  getDeepErrorEntries(store).map((entry) => `${entry.path.join('.')}: ${entry.errors.join('; ')}`);
/** How many outer and inner rows the DOM shows, by their text inputs. */
const rowsInDom = (id: string) => ({
  rows: document.querySelectorAll(`#${id} input[id$=".t"]`).length,
  inner: [...document.querySelectorAll<HTMLInputElement>(`#${id} input[id$=".u"]`)].map(
    (element) => element.value,
  ),
});

type Results = Record<string, unknown>;

function useStore(form: ReturnType<typeof compile>, mode: 'initial' | 'submit') {
  return useForm({
    schema: form.schema,
    initialInput: structuredClone(start) as never,
    validate: mode,
    revalidate: 'input',
  }) as unknown as AutoFormStore;
}

export function FormischScenario() {
  const [form] = useState(() => compile(definition));
  const initialStore = useStore(form, 'initial');
  const keepStore = useStore(form, 'submit');
  const insertStore = useStore(form, 'submit');
  const [results, setResults] = useState<Results | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const out: Results = {};
      await settle();
      // validate: 'initial', then reset to an invalid record, then to a valid one.
      out.initialOnMount = errors(initialStore);
      reset(initialStore, {
        initialInput: {
          a: '',
          rows: [
            { t: '', inner: [] },
            { t: 'ok', inner: [{ u: '' }] },
          ],
        },
      } as never);
      await settle();
      out.initialAfterResetInvalid = errors(initialStore);
      out.initialAfterResetInvalidInput = getInput(initialStore);
      reset(initialStore, { initialInput: structuredClone(start) } as never);
      await settle();
      out.initialAfterResetValid = errors(initialStore);
      reset(initialStore);
      await settle();
      out.initialAfterPlainReset = errors(initialStore);

      // keepInput with nested row counts that differ from the new initial input.
      reset(keepStore, {
        initialInput: { a: 'n', rows: [{ t: 'n1', inner: [{ u: 'z' }] }] },
        keepInput: true,
      } as never);
      await settle();
      out.keepInputInput = getInput(keepStore);
      out.keepInputIsDirty = isDirty(keepStore);
      out.keepInputDomRows = rowsInDom('keep');
      out.keepInputValidate = await validate(keepStore).then((result) => result.success);
      out.keepInputErrors = errors(keepStore);
      // The same with equal top-level row counts but different inner counts.
      reset(keepStore, {
        initialInput: {
          a: 'n',
          rows: [
            { t: 'q1', inner: [] },
            { t: 'q2', inner: [{ u: 'y' }, { u: 'y2' }] },
            { t: 'q3', inner: [] },
          ],
        },
        keepInput: true,
      } as never);
      await settle();
      out.keepInputEqualRowsInput = getInput(keepStore);
      out.keepInputEqualRowsDomRows = rowsInDom('keep');

      // insert after remove, with and without explicit values.
      remove(insertStore, { path: ['rows'], at: 2 } as never);
      await settle();
      insert(insertStore, { path: ['rows'] } as never);
      await settle();
      out.insertWithoutValues = getInput(insertStore);
      remove(insertStore, { path: ['rows'], at: 2 } as never);
      await settle();
      insert(insertStore, { path: ['rows'], initialInput: { t: '', inner: [] } } as never);
      await settle();
      out.insertWithValues = getInput(insertStore);
      out.insertWithValuesDom = [
        ...document.querySelectorAll<HTMLInputElement>('#insert input[type="text"]'),
      ].map((element) => element.value);
      if (!cancelled) {
        setResults(out);
        record(out);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialStore, keepStore, insertStore]);

  return (
    <>
      <h2>validate: 'initial'</h2>
      <div id="initial">
        <AutoForm form={form} store={initialStore} onSubmit={() => {}} />
      </div>
      <h2>reset with keepInput</h2>
      <div id="keep">
        <AutoForm form={form} store={keepStore} onSubmit={() => {}} />
      </div>
      <h2>insert after remove</h2>
      <div id="insert">
        <AutoForm form={form} store={insertStore} onSubmit={() => {}} />
      </div>
      <h2>Results</h2>
      <pre id="probes">{results === null ? 'running' : JSON.stringify(results, null, 2)}</pre>
    </>
  );
}
