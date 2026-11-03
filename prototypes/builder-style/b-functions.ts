// Style (b): Valibot-like functions + pipe. THROWAWAY prototype for AF-5.
import type { Condition, FormDefinition, InferShape, Node } from './shared';

// ---------------- library side ----------------

// A pipe item is plain data plus a phantom marker; Valibot uses the same split
// between validation actions (email, minLength) and metadata actions (title).
interface PipeItem<K extends string = string> {
  kind: K;
  apply(node: Node): void;
}

type HasKind<P extends readonly PipeItem[], K extends string> =
  Extract<P[number], PipeItem<K>> extends never ? false : true;

interface FieldBuilder<N extends string, V, P extends readonly PipeItem[]> {
  readonly '~types': {
    name: N;
    value: V;
    required: HasKind<P, 'required'>;
    conditional: HasKind<P, 'visible'>;
  };
  readonly node: Node;
}

interface LayoutBuilder<C extends readonly unknown[]> {
  readonly '~types': { children: C };
  readonly node: Node;
}

type AnyBuilder = { readonly node: Node };

function field(type: string, name: string, pipe: readonly PipeItem[] = [], extra: Partial<Node> = {}) {
  const node: Node = { type, name, rules: [], ...extra };
  for (const item of pipe) item.apply(node);
  return { node } as never;
}

// Each export below is independently tree-shakable.
export const required = (): PipeItem<'required'> => ({ kind: 'required', apply: (n) => void (n.required = true) });
export const label = (text: string): PipeItem<'label'> => ({ kind: 'label', apply: (n) => void (n.label = text) });
export const email = (message?: string): PipeItem<'email'> => ({
  kind: 'email',
  apply: (n) => void n.rules!.push({ type: 'email', ...(message ? { message } : {}) }),
});
export const minLength = (requirement: number): PipeItem<'min_length'> => ({
  kind: 'min_length',
  apply: (n) => void n.rules!.push({ type: 'min_length', requirement }),
});
export const visible = (condition: Condition): PipeItem<'visible'> => ({
  kind: 'visible',
  apply: (n) => void (n.visible = condition),
});

export function text<const N extends string, const P extends readonly PipeItem[] = []>(
  name: N,
  pipe?: P,
): FieldBuilder<N, string, P> {
  return field('text', name, pipe);
}

export function select<const N extends string, const O extends readonly string[], const P extends readonly PipeItem[] = []>(
  name: N,
  options: O,
  pipe?: P,
): FieldBuilder<N, O[number], P> {
  return field('select', name, pipe, { options });
}

export function toggle<const N extends string, const P extends readonly PipeItem[] = []>(
  name: N,
  pipe?: P,
): FieldBuilder<N, boolean, [...P, PipeItem<'required'>]> {
  // A toggle always submits true/false, so its key is always present.
  return field('toggle', name, pipe);
}

export function repeater<const N extends string, const C extends readonly AnyBuilder[], const P extends readonly PipeItem[] = []>(
  name: N,
  children: C,
  pipe?: P,
): FieldBuilder<N, InferShape<C>[], [...P, PipeItem<'required'>]> {
  return field('repeater', name, pipe, { children: children.map((c) => c.node) });
}

export function section<const C extends readonly AnyBuilder[]>(title: string, children: C): LayoutBuilder<C> {
  return { node: { type: 'section', label: title, children: children.map((c) => c.node) } } as never;
}

export function grid<const C extends readonly AnyBuilder[]>(columns: number, children: C): LayoutBuilder<C> {
  return { node: { type: 'grid', columns, children: children.map((c) => c.node) } } as never;
}

export function form<const C extends readonly AnyBuilder[]>(children: C) {
  const definition: FormDefinition = { version: 1, elements: children.map((c) => c.node) };
  return definition as FormDefinition & { readonly '~output': InferShape<C> };
}

export const eq = (field: string, value: unknown): Condition => ({ field, op: 'eq', value });

// Custom field type (AF-8 input): one factory call produces a typed builder function.
export function defineFieldType<V>() {
  return <T extends string>(type: T) =>
    <const N extends string, const P extends readonly PipeItem[] = []>(name: N, pipe?: P): FieldBuilder<N, V, P> =>
      field(type, name, pipe);
}
export const color = defineFieldType<`#${string}`>()('color');
