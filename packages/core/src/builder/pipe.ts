import type { RuleNode } from '../definition';

/** The built-in Field Types that hold one value. */
export type ValueTypeName = 'text' | 'number' | 'boolean' | 'choice' | 'multi_choice' | 'date';

/**
 * The target of a pipe item on a Field of a custom Field Type, whatever its
 * name. Only metadata and settings list it; no Rule does.
 */
export type CustomType = '~custom';

/** The Field Types that hold one value: the built-in ones and any custom one. */
export type ValueType = ValueTypeName | CustomType;

/** Every Field Type. */
export type FieldType = ValueType | 'object' | 'repeater';

/** Every built-in Component `type` the Fluent Builder makes. */
export type ComponentType = FieldType | 'section' | 'tabs' | 'tab' | 'page' | 'content';

/** What a pipe item does to the inferred output of the Component it sits on. */
export type PipeEffect =
  /** The Field must always have a value, so its key is always present. */
  | 'required'
  /** A Condition or setting may make the Component Inactive, so its Fields may be absent. */
  | 'inactive';

/** What a pipe item writes onto its Component when the Builder applies it. */
export type PipeAction =
  | { readonly kind: 'set'; readonly keys: Readonly<Record<string, unknown>> }
  /** Adds a Rule, and sets `widget` to `widget` unless the pipe sets one. */
  | { readonly kind: 'rule'; readonly rule: RuleNode; readonly widget?: string };

/**
 * One item of a Builder pipe, like a Valibot action: Rules, metadata and
 * Conditions alike. It only exists while the Builder runs; the Component it
 * sits on holds plain data.
 *
 * `TTarget` lists the Component types it applies to; `TValue` is the value it
 * writes for the Field's value, if any; `TEffect` what it does to the inferred
 * output. All three are type-level only.
 */
export interface PipeItem<
  TTarget extends string = string,
  TValue = never,
  TEffect extends PipeEffect = never,
> {
  /** Type-level only; never present at runtime. */
  readonly '~types'?: {
    // A function type, so that an item for more targets fits a pipe for fewer.
    readonly target: (type: TTarget) => void;
    readonly value: TValue;
    readonly effect: TEffect;
  };
  readonly '~action': PipeAction;
}

/** A pipe for a Component of type `T` whose value is `V`. */
export type Pipe<T extends string, V = never> = readonly PipeItem<T, V, PipeEffect>[];

/** Any pipe, for constraints that only read its effects. */
export type AnyPipe = readonly PipeItem<any, any, any>[];

/** Whether an item of `P` has the effect `E`. */
export type HasEffect<P extends AnyPipe, E extends PipeEffect> = E extends NonNullable<
  P[number]['~types']
>['effect']
  ? true
  : false;

export const set = <I extends PipeItem<any, any, any>>(keys: Record<string, unknown>): I =>
  ({ '~action': { kind: 'set', keys } }) as I;

/**
 * Builds a Component: `head` first, then each pipe item in order (a later key
 * wins, Rules add up), then `tail`. Nothing but data is left on the result.
 */
export function apply(
  head: Readonly<Record<string, unknown>>,
  pipe: readonly PipeItem<any, any, any>[] = [],
  tail: Readonly<Record<string, unknown>> = {},
): any {
  const node: Record<string, unknown> = { ...head };
  const rules: RuleNode[] = [];
  let widget: string | undefined;
  for (const { '~action': action } of pipe) {
    if (action.kind === 'set') Object.assign(node, action.keys);
    else {
      rules.push(action.rule);
      widget ??= action.widget;
    }
  }
  if (widget !== undefined && node.widget === undefined) node.widget = widget;
  if (rules.length > 0) node.rules = rules;
  return Object.assign(node, tail);
}
