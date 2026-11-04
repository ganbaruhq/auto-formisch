import { renderHook, act } from '@testing-library/react';
import { useForm, getErrors, getInput, validate } from '@formisch/react';
import { INTERNAL, getFieldStore } from '@formisch/react/internals';

export const plain = (issues: any[] | undefined) =>
  issues?.map((i) => ({ message: i.message, path: i.path ? i.path.map((p: any) => (typeof p === 'object' ? p.key : p)) : undefined }));

export const std = (schema: any, input: unknown) => {
  const r = schema['~standard'].validate(input);
  if (r instanceof Promise) throw new Error('async');
  return r.issues ? { issues: plain(r.issues as any) } : { value: r.value };
};

export function mount(schema: any, opts: any = {}) {
  const { result } = renderHook(() => useForm({ schema, ...opts } as any));
  return result.current as any;
}
export const kind = (form: any, path: any[]) => {
  try { return getFieldStore(form[INTERNAL], path)?.kind ?? '(no store)'; } catch (e: any) { return `THROW ${e.message}`; }
};
export const errs = (form: any, path?: any[]) => {
  try { return path ? getErrors(form, { path } as any) : getErrors(form); } catch (e: any) { return `THROW ${e.message}`; }
};
export const input = (form: any, path?: any[]) => (path ? getInput(form, { path } as any) : getInput(form));
export async function runValidate(form: any) {
  let result: any;
  await act(async () => { result = await validate(form); });
  return result;
}
export const log = (label: string, x?: unknown) =>
  process.stdout.write(`${label}${x === undefined ? '' : ' ' + JSON.stringify(x, (_k, val) => (val === undefined ? '<undefined>' : typeof val === 'symbol' ? val.toString() : val))}\n`);
