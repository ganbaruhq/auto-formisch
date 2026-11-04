// Spike-only mini "Form Definition" and the candidate compile strategies that take a definition.
import * as v from 'valibot';

export const isEmpty = (x: unknown) =>
  x === undefined || x === null || (typeof x === 'string' && x.trim() === '') || (Array.isArray(x) && x.length === 0);

export const omitUndef = (x: any): any => {
  if (Array.isArray(x)) return x.map(omitUndef);
  if (x && typeof x === 'object') {
    const o: any = {};
    for (const k of Object.keys(x)) if (x[k] !== undefined) o[k] = omitUndef(x[k]);
    return o;
  }
  return x;
};

export type Cond =
  | { op: 'eq'; scope: 'root' | 'row'; path: string[]; value: unknown }
  | { op: 'notEmpty'; scope: 'root' | 'row'; path: string[] };
export type Rule = { type: 'minLength' | 'minValue'; n: number; message: string };
export type Node =
  | { kind: 'field'; key: string; type: 'string' | 'number' | 'boolean' | 'string[]'; required?: boolean | Cond; visible?: Cond; disabled?: Cond; rules?: Rule[] }
  | { kind: 'layout'; visible?: Cond; children: Node[] }
  | { kind: 'object'; key: string; visible?: Cond; children: Node[] }
  | { kind: 'repeater'; key: string; visible?: Cond; template: Node[] };

type Ctx = { root: any; row?: any };
export function evalCond(c: Cond, ctx: Ctx): boolean {
  let cur = c.scope === 'row' ? ctx.row : ctx.root;
  for (const k of c.path) cur = cur?.[k];
  return c.op === 'eq' ? cur === c.value : !isEmpty(cur);
}
const on = (c: boolean | Cond | undefined, ctx: Ctx, dflt: boolean) =>
  c === undefined ? dflt : typeof c === 'boolean' ? c : evalCond(c, ctx);

export const leafType = (t: string): any =>
  t === 'string' ? v.string() : t === 'number' ? v.number() : t === 'boolean' ? v.boolean() : v.array(v.string());
const ruleAction = (r: Rule): any => (r.type === 'minLength' ? v.minLength(r.n, r.message) : v.minValue(r.n, r.message));
export const leafSchema = (n: any): any =>
  n.rules?.length ? (v.pipe as any)(leafType(n.type), ...n.rules.map(ruleAction)) : leafType(n.type);

// Stage 1, shared by C and E: Formisch-facing skeleton. Never fails below root.
// v.fallback with an identity callback returns the raw input instead of an issue, on wrong shape
const tolerant = (s: any) => v.fallback(s, (ds: any) => ds?.value);
const flat = (nodes: Node[]): any[] => nodes.flatMap((n) => (n.kind === 'layout' ? flat(n.children) : [n]));
export const skeletonOf = (nodes: Node[]): any =>
  Object.fromEntries(
    flat(nodes).map((n) => [
      n.key,
      n.kind === 'object'
        ? tolerant(v.object(skeletonOf(n.children)))
        : n.kind === 'repeater'
          ? tolerant(v.array(v.object(skeletonOf(n.template))))
          : n.type === 'string[]'
            ? tolerant(v.array(v.unknown()))
            : v.optional(v.unknown()),
    ]),
  );

// ---- C: root rawTransform interpreter; per-Field Valibot leaf schemas run by the interpreter -----
const REQ = 'required';
function walkC(nodes: Node[], obj: any, ctx: Ctx, base: any[], addIssue: any, config: any): any {
  const out: any = {};
  const src = obj && typeof obj === 'object' ? obj : {};
  for (const n of nodes) {
    if (n.kind === 'layout') { if (on(n.visible, ctx, true)) Object.assign(out, walkC(n.children, obj, ctx, base, addIssue, config)); continue; }
    const val = src[n.key];
    const item = { type: 'object', origin: 'value', input: src, key: n.key, value: val };
    const path = [...base, item];
    if (!on(n.visible, ctx, true)) continue;
    if (n.kind === 'object') {
      if (!isEmpty(val) && (typeof val !== 'object' || Array.isArray(val))) { addIssue({ message: 'expected object', path }); continue; }
      out[n.key] = walkC(n.children, val, ctx, path, addIssue, config);
    } else if (n.kind === 'repeater') {
      if (!isEmpty(val) && !Array.isArray(val)) { addIssue({ message: 'expected array', path }); continue; }
      out[n.key] = ((val ?? []) as any[]).map((row, i) => {
        const p = [...path, { type: 'array', origin: 'value', input: val, key: i, value: row }];
        if (!row || typeof row !== 'object' || Array.isArray(row)) { addIssue({ message: 'expected object', path: p }); return undefined; }
        return walkC(n.template, row, { root: ctx.root, row }, p, addIssue, config);
      });
    } else {
      if (on(n.disabled, ctx, false)) continue; // ASSUMPTION: disabled behaves like hidden for validation/output
      if (isEmpty(val)) { if (on(n.required, ctx, false)) addIssue({ message: REQ, path }); continue; }
      const r = v.safeParse(leafSchema(n), val, config);
      if (r.success) out[n.key] = r.output;
      else for (const iss of r.issues as any[]) addIssue({ message: iss.message, path: iss.path ? [...path, ...iss.path] : path });
    }
  }
  return out;
}
export const compileC = (def: Node[], hooks?: { onRun?: () => void }): any =>
  v.pipe(
    v.object(skeletonOf(def)),
    v.rawTransform(({ dataset, addIssue, config }: any) => {
      hooks?.onRun?.();
      return walkC(def, dataset.value, { root: dataset.value }, [], addIssue, config);
    }),
  );

// ---- E: skeleton -> normalise/prune transform -> real static typed Valibot schema -----
const MISSING = Symbol('required-missing');
function prep(nodes: Node[], obj: any, ctx: Ctx): any {
  const out: any = {};
  const src = obj && typeof obj === 'object' ? obj : {};
  for (const n of nodes) {
    if (n.kind === 'layout') { if (on(n.visible, ctx, true)) Object.assign(out, prep(n.children, obj, ctx)); continue; }
    const val = src[n.key];
    if (!on(n.visible, ctx, true)) continue;
    if (n.kind === 'object') {
      out[n.key] = !isEmpty(val) && (typeof val !== 'object' || Array.isArray(val)) ? val : prep(n.children, val, ctx);
    } else if (n.kind === 'repeater') {
      out[n.key] = isEmpty(val) ? [] : !Array.isArray(val) ? val
        : val.map((row) => (row && typeof row === 'object' && !Array.isArray(row) ? prep(n.template, row, { root: ctx.root, row }) : row));
    } else {
      if (on(n.disabled, ctx, false)) continue;
      if (isEmpty(val)) { if (on(n.required, ctx, false)) out[n.key] = MISSING; continue; }
      out[n.key] = val;
    }
  }
  return out;
}
const finalEntries = (nodes: Node[]): any =>
  Object.fromEntries(
    flat(nodes).map((n) => [
      n.key,
      n.kind === 'object'
        ? v.optional(v.object(finalEntries(n.children)))
        : n.kind === 'repeater'
          ? v.optional(v.array(v.object(finalEntries(n.template))))
          : v.optional(
              (v.pipe as any)(
                v.unknown(),
                v.check((x) => x !== MISSING, REQ),
                leafType(n.type),
                ...(n.rules ?? []).map(ruleAction),
              ),
            ),
    ]),
  );
export const compileE = (def: Node[], hooks?: { onRun?: () => void }): any =>
  (v.pipe as any)(
    v.object(skeletonOf(def)),
    v.transform((x: any) => { hooks?.onRun?.(); return prep(def, x, { root: x }); }),
    v.object(finalEntries(def)),
  );

// ---- D: root v.lazy, schema rebuilt from the input on every validation ----
const dropped = () => v.pipe(v.optional(v.any()), v.transform(() => undefined));
function entriesD(nodes: Node[], obj: any, ctx: Ctx): any {
  const src = obj && typeof obj === 'object' ? obj : {};
  return Object.fromEntries(nodes.map((n) => {
    const val = src[n.key];
    if (!on(n.visible, ctx, true)) return [n.key, dropped()];
    if (n.kind === 'object') {
      return [n.key, isEmpty(val)
        ? v.pipe(v.nullish(v.any(), {}), v.transform(() => ({})), v.object(entriesD(n.children, {}, ctx)))
        : v.object(entriesD(n.children, val, ctx))];
    }
    if (n.kind === 'repeater') {
      if (isEmpty(val)) return [n.key, v.pipe(v.nullish(v.any(), []), v.transform(() => []))];
      if (!Array.isArray(val)) return [n.key, v.array(v.any())];
      return [n.key, v.tuple(val.map((row) => v.object(entriesD(n.template, row, { root: ctx.root, row }))) as any)];
    }
    if (on(n.disabled, ctx, false)) return [n.key, dropped()];
    if (isEmpty(val)) return [n.key, on(n.required, ctx, false) ? v.optional(v.custom(() => false, REQ), '') : dropped()];
    return [n.key, leafSchema(n)];
  }));
}
export const compileD = (def: Node[], hooks?: { onRun?: () => void }): any =>
  v.lazy((input: any) => {
    if (input === undefined) return v.object(skeletonOf(def)); // Formisch store walk: getter(undefined)
    hooks?.onRun?.();
    return v.pipe(v.object(entriesD(def, input, { root: input })), v.transform(omitUndef));
  });
