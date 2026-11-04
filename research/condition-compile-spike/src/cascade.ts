// Spike: cascade (hidden/disabled reads as empty), row-scope relative refs, load-time cycle check, stage-3 schema.
import * as v from 'valibot';
export const isEmpty = (x: unknown) => x === undefined || x === null || (typeof x === 'string' && x.trim() === '') || (Array.isArray(x) && x.length === 0);
export type C = { field: string; op: 'eq' | 'not_empty' | 'empty'; value?: unknown } | { all: C[] } | { any: C[] } | { not: C };
export type N = { type: string; name?: string; visible?: C; disabled?: boolean | C; required?: boolean | C; components?: N[] };
const CONTAINER = (n: N) => !!n.components && !n.name;

type Scope = { def: N[]; parent?: Scope; value: any; parentNodes: N[] };
const fieldsIn = (nodes: N[]): N[] => nodes.flatMap((n) => (CONTAINER(n) ? fieldsIn(n.components!) : [n]));
const ancestorsOf = (target: N, nodes: N[], trail: N[] = []): N[] | undefined => {
  for (const n of nodes) {
    if (n === target) return trail;
    if (CONTAINER(n)) { const f = ancestorsOf(target, n.components!, [...trail, n]); if (f) return f; }
  }
};
// `../a.b`: walk up data scopes, then descend through object Fields only.
function resolve(ref: string, nodes: N[], s?: Scope): { node: N; owner: N[]; scope?: Scope } | undefined {
  let rest = ref, ownerNodes = nodes, scope = s;
  while (rest.startsWith('../')) { rest = rest.slice(3); if (!scope?.parent) { if (!scope) return undefined; return undefined; } scope = scope.parent; ownerNodes = scope.def; }
  const segs = rest.split('.');
  let node: N | undefined;
  for (let i = 0; i < segs.length; i++) {
    node = fieldsIn(ownerNodes).find((f) => f.name === segs[i]);
    if (!node) return undefined;
    if (i < segs.length - 1) {
      if (node.type !== 'object') return undefined;
      const parentVal = scope!.value?.[segs[i]];
      scope = { def: node.components!, parent: scope, value: parentVal, parentNodes: ownerNodes };
      ownerNodes = node.components!;
    }
  }
  return { node: node!, owner: ownerNodes, scope };
}

function runtime() {
  const memo = new Map<string, boolean>();
  const ids = new WeakMap<object, number>(); let nid = 0;
  const id = (o: object) => { if (!ids.has(o)) ids.set(o, ++nid); return ids.get(o)!; };
  const evalC = (c: C, s: Scope): boolean => {
    if ('all' in c) return c.all.every((x) => evalC(x, s));
    if ('any' in c) return c.any.some((x) => evalC(x, s));
    if ('not' in c) return !evalC(c.not, s);
    const r = resolve(c.field, s.def, s)!;
    const val = active(r.node, r.scope!) ? r.scope!.value?.[r.node.name!] : undefined;
    return c.op === 'eq' ? val === c.value : c.op === 'empty' ? isEmpty(val) : !isEmpty(val);
  };
  const on = (c: boolean | C | undefined, s: Scope, d: boolean) => (c === undefined ? d : typeof c === 'boolean' ? c : evalC(c, s));
  // A Field is active when it and all enclosing Components in this form are visible and not disabled.
  function active(n: N, s: Scope): boolean {
    const key = `${id(n)}:${id(s)}`;
    if (memo.has(key)) return memo.get(key)!;
    const layouts = ancestorsOf(n, s.def) ?? [];
    let res = layouts.every((l) => on(l.visible, s, true)) && on(n.visible, s, true) && !on(n.disabled, s, false);
    if (res && s.parent) { const own = fieldsIn(s.parent.def).find((f) => f.components === s.def); if (own) res = active(own, s.parent); }
    memo.set(key, res);
    return res;
  }
  return { active, on };
}
const MISSING = Symbol('missing');
function prep(nodes: N[], val: any, s: Scope, rt: ReturnType<typeof runtime>): any {
  const out: any = {};
  for (const n of fieldsIn(nodes)) {
    const a = rt.active(n, s), x = s.value?.[n.name!];
    if (n.type === 'object') { const inner: Scope = { def: n.components!, parent: s, value: x && typeof x === 'object' ? x : {}, parentNodes: s.def }; out[n.name!] = a ? prep(n.components!, x, inner, rt) : {}; continue; }
    if (n.type === 'repeater') {
      out[n.name!] = !a || !Array.isArray(x) ? [] : x.map((row) => prep(n.components!, row, { def: n.components!, parent: s, value: row, parentNodes: s.def }, rt));
      continue;
    }
    if (!a) continue;
    if (isEmpty(x)) { if (rt.on(n.required, s, false)) out[n.name!] = MISSING; continue; }
    out[n.name!] = x;
  }
  return out;
}
const leaf = (t: string): any => (t === 'number' ? v.number() : v.string());
const skeleton = (nodes: N[]): any => Object.fromEntries(fieldsIn(nodes).map((n) => [n.name!, n.type === 'object' ? v.fallback(v.object(skeleton(n.components!)), (d: any) => d?.value) : n.type === 'repeater' ? v.fallback(v.array(v.object(skeleton(n.components!))), (d: any) => d?.value) : v.optional(v.unknown())]));
const final = (nodes: N[]): any => Object.fromEntries(fieldsIn(nodes).map((n) => [n.name!, n.type === 'object' ? v.object(final(n.components!)) : n.type === 'repeater' ? v.array(v.object(final(n.components!))) : v.optional((v.pipe as any)(v.unknown(), v.check((x) => x !== MISSING, 'required'), leaf(n.type)))]));
export const compile = (def: N[]): any => (v.pipe as any)(v.object(skeleton(def)), v.transform((x: any) => prep(def, x, { def, value: x, parentNodes: def }, runtime())), v.object(final(def)));

// Load-time: edges from `visible`/`disabled` refs and from container nesting; `required` adds none.
export function findCycle(def: N[]): string | null {
  const refs = (c: C | boolean | undefined): string[] => !c || typeof c === 'boolean' ? [] : 'all' in c ? c.all.flatMap(refs) : 'any' in c ? c.any.flatMap(refs) : 'not' in c ? refs(c.not) : [c.field];
  const graph = new Map<N, N[]>(); const label = new Map<N, string>();
  const walk = (nodes: N[], up: Scope | undefined, parent?: N) => {
    const s: Scope = { def: nodes, parent: up, value: undefined, parentNodes: nodes };
    const visit = (ns: N[], enclosing?: N) => { for (const n of ns) {
      label.set(n, n.name ?? n.type);
      const deps = [...refs(n.visible), ...refs(n.disabled)].map((r) => { const t = resolve(r, nodes, s); if (!t) throw new Error(`unknown ref ${r}`); return t.node; });
      graph.set(n, [...deps, ...(enclosing ? [enclosing] : [])]);
      if (CONTAINER(n)) visit(n.components!, n);
      else if (n.components) walk(n.components, s, n);
    } };
    visit(nodes, parent);
  };
  walk(def, undefined);
  const state = new Map<N, 1 | 2>();
  const dfs = (n: N, st: string[]): string | null => {
    if (state.get(n) === 1) return [...st, label.get(n)!].join(' -> ');
    if (state.get(n) === 2) return null;
    state.set(n, 1);
    for (const d of graph.get(n) ?? []) { const r = dfs(d, [...st, label.get(n)!]); if (r) return r; }
    state.set(n, 2); return null;
  };
  for (const n of graph.keys()) { const r = dfs(n, []); if (r) return r; }
  return null;
}
