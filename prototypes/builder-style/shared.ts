// Shared pieces for both builder sketches. THROWAWAY prototype for AF-5.
// The node shape is provisional (AF-6 decides the real Form Definition shape);
// the condition AST follows the AF-3 research recommendation.

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: 'eq' | 'neq' | 'in' | 'empty' | 'notEmpty'; value?: unknown };

export interface Node {
  type: string;
  name?: string;
  label?: string;
  required?: boolean;
  visible?: Condition;
  rules?: { type: string; requirement?: unknown; message?: string }[];
  options?: readonly string[];
  columns?: number;
  children?: Node[];
}

export interface FormDefinition {
  version: 1;
  elements: Node[];
}

// ---------- type-level helpers shared by both styles ----------

/** Phantom type carried by every Field builder. */
export interface FieldTypes {
  name: string;
  value: unknown;
  required: boolean;
  conditional: boolean;
}
/** Phantom type carried by every Layout builder. */
export interface LayoutTypes {
  children: readonly unknown[];
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Collect field phantom types, flattening through Layouts (Layouts add no data path). */
export type FieldsOf<C extends readonly unknown[]> = C[number] extends infer X
  ? X extends { '~types': infer T }
    ? T extends LayoutTypes
      ? FieldsOf<T['children']>
      : T extends FieldTypes
        ? T
        : never
    : never
  : never;

/**
 * A key is guaranteed present only when it is required AND not conditional:
 * a hidden field may be absent from the submission (exact rule is AF-7's call).
 */
export type InferShape<C extends readonly unknown[]> = Simplify<
  {
    [F in FieldsOf<C> as F['required'] extends true
      ? F['conditional'] extends true
        ? never
        : F['name']
      : never]: F['value'];
  } & {
    [F in FieldsOf<C> as F['required'] extends true
      ? F['conditional'] extends true
        ? F['name']
        : never
      : F['name']]?: F['value'];
  }
>;

/** Compile-time assertion helper. */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
export function assertType<_T extends true>() {}

/** What both sample forms must infer for onSubmit. */
export interface ExpectedOutput {
  name: string;
  email: string;
  country: 'VN' | 'US';
  taxId?: string;
  addresses: { street: string; city?: string }[];
  newsletter: boolean;
}
