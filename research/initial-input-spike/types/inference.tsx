// Compiled with `tsc --noEmit`. Expect-error lines document what TS rejects.
import * as v from 'valibot';
import { Field, useForm, type FormSchema } from '@formisch/react';

const skeleton = v.object({
  nick: v.optional(v.unknown()),
  rows: v.array(v.object({ street: v.optional(v.unknown()) })),
});
const final = v.object({
  nick: v.optional(v.pipe(v.string(), v.minLength(3))),
  rows: v.array(v.object({ street: v.optional(v.string()) })),
});
type Out = v.InferOutput<typeof final>;

const C = v.pipe(skeleton, v.rawTransform(({ dataset }) => dataset.value as unknown as Out));
const E = v.pipe(skeleton, v.transform((x) => x as unknown), final);

// Output inferred from last stage in both when the builder knows the static shape:
type COut = v.InferOutput<typeof C>; const cOut: COut = { rows: [] }; void cOut;
type EOut = v.InferOutput<typeof E>; const eOut: EOut = { nick: 'a', rows: [{ street: 'x' }] }; void eOut;
// @ts-expect-error nick is string|undefined at output
const eBad: EOut = { nick: 1, rows: [] }; void eBad;
// Input is the skeleton: leaves are unknown, so initialInput/getInput are not type-checked by Field type
type EIn = v.InferInput<typeof E>; const eIn: EIn = { nick: 123, rows: [{ street: {} }] }; void eIn;

export function Static() {
  const form = useForm({ schema: E, initialInput: { nick: 123 } });
  const good = <Field of={form} path={['rows', 0, 'street']}>{(f) => { const x: unknown = f.input; void x; return <></>; }}</Field>;
  // @ts-expect-error path is still checked against the skeleton
  const bad = <Field of={form} path={['nope']}>{() => <></>}</Field>;
  return [good, bad];
}

// Runtime-compiled Definition: the JSON path gives no static shape.
declare const dynamic: FormSchema;
export function Dynamic() {
  const form = useForm({ schema: dynamic });
  const x = <Field of={form} path={["anything", 0, "x"] as never}>{() => <></>}</Field>;
  return x;
}
declare const generic: v.GenericSchema<Record<string, unknown>>;
export function Dynamic2() {
  const form = useForm({ schema: generic });
  return <Field of={form} path={['anything'] as never}>{() => <></>}</Field>;
}
