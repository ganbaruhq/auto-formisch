/*
 * Type-level inference of a built form's output. Every Component the Builder
 * makes carries an optional `~types` that holds what inference needs and is
 * never present at runtime, so the Component stays plain Definition data.
 */

import type { FormDefinition } from '../definition';

/** What a single-value Field adds to its data scope. */
export interface ValueInfo<
  TName extends string = string,
  TValue = unknown,
  TRequired extends boolean = boolean,
  TInactive extends boolean = boolean,
> {
  readonly kind: 'value';
  readonly name: TName;
  readonly value: TValue;
  readonly required: TRequired;
  readonly inactive: TInactive;
}

/** An `object` (one record) or a Repeater (a list of them) built from `children`. */
export interface GroupInfo<
  TName extends string = string,
  TChildren extends readonly unknown[] = readonly unknown[],
  TList extends boolean = boolean,
  TInactive extends boolean = boolean,
> {
  readonly kind: 'group';
  readonly name: TName;
  readonly children: TChildren;
  readonly list: TList;
  readonly inactive: TInactive;
}

/** A Layout: its children's Fields belong to the enclosing data scope. */
export interface LayoutInfo<
  TChildren extends readonly unknown[] = readonly unknown[],
  TInactive extends boolean = boolean,
> {
  readonly kind: 'layout';
  readonly children: TChildren;
  readonly inactive: TInactive;
}

export type ComponentInfo = ValueInfo | GroupInfo | LayoutInfo;

/** Marks a built Component with what inference needs. */
export interface Typed<TInfo extends ComponentInfo> {
  /** Type-level only; never present at runtime. */
  readonly '~types'?: TInfo;
}

/**
 * A Form Definition that knows the output it validates to. `TDefinition` is
 * the kind of Definition: `form()` gives one with `components`, `wizard()`
 * one with `pages`.
 */
export type TypedDefinition<
  TOutput,
  TDefinition extends FormDefinition = FormDefinition,
> = TDefinition & {
  /** Type-level only; never present at runtime. */
  readonly '~types'?: { readonly output: TOutput };
};

/** The output type of a Definition built by `form()`. */
export type InferOutput<T> = T extends TypedDefinition<infer TOutput> ? TOutput : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type Or<A extends boolean, B extends boolean> = A extends true ? true : B;

/** One key of a data scope: its name, its value, and whether it is always present. */
interface Entry {
  readonly name: string;
  readonly value: unknown;
  readonly present: boolean;
}

/** The entries of `components`, Layouts flattened. `TInactive`: an ancestor may be Inactive. */
type EntriesOf<TComponents extends readonly unknown[], TInactive extends boolean> = {
  [K in keyof TComponents]: EntryOf<TComponents[K], TInactive>;
}[number];

// A Component not made by the Builder has no `~types` and adds no entry.
type EntryOf<TComponent, TInactive extends boolean> = TComponent extends {
  readonly '~types'?: infer TInfo;
}
  ? NonNullable<TInfo> extends infer I
    ? I extends LayoutInfo<infer C, infer LI>
      ? EntriesOf<C, Or<TInactive, LI>>
      : I extends ValueInfo<infer N, infer V, infer R, infer VI>
        ? {
            name: N;
            value: V;
            present: R extends true ? (Or<TInactive, VI> extends true ? false : true) : false;
          }
        : I extends GroupInfo<infer N, infer C, infer L, infer GI>
          ? {
              name: N;
              // An Inactive `object` or Repeater keeps its key, as `{}` or `[]`,
              // so only its Fields become optional.
              value: L extends true
                ? ShapeOf<C, Or<TInactive, GI>>[]
                : ShapeOf<C, Or<TInactive, GI>>;
              present: true;
            }
          : never
    : never
  : never;

/**
 * The output of one data scope: a key per Field, optional unless the Field is
 * required with no Condition on it or on any Component that holds it.
 */
export type ShapeOf<TComponents extends readonly unknown[], TInactive extends boolean = false> =
  EntriesOf<TComponents, TInactive> extends infer E extends Entry
    ? Simplify<
        { [F in E as F['present'] extends true ? F['name'] : never]: F['value'] } & {
          [F in E as F['present'] extends true ? never : F['name']]?: F['value'];
        }
      >
    : never;
