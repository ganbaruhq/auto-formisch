import type {
  BooleanField,
  Choice,
  ChoiceField,
  Component,
  ContentNode,
  CustomField,
  DateField,
  MultiChoiceField,
  NumberField,
  ObjectField,
  RepeaterField,
  SectionLayout,
  TabLayout,
  TabsLayout,
  TextField,
} from '../definition';
import { DEFINITION_VERSION } from '../definition';
import { loadDefinition } from '../load';
import { registryOf, type LoadOptions } from '../registry';
import type { GroupInfo, LayoutInfo, ShapeOf, Typed, TypedDefinition, ValueInfo } from './infer';
import { apply, type AnyPipe, type HasEffect, type Pipe } from './pipe';

/** A Component a Builder function takes as a child, including a custom Field Type's Field. */
type Child = Component | CustomField;

/*
 * Component functions. Each returns the Component's JSON: a Field takes its
 * `name`, then what it must have, then an optional pipe of Rules, metadata
 * and Conditions. Nothing is checked until `form()`.
 */

/** A built single-value Field node of type `TNode` whose value is `V`. */
type Value<TNode, TName extends string, V, P extends AnyPipe> = TNode &
  Typed<ValueInfo<TName, V, HasEffect<P, 'required'>, HasEffect<P, 'inactive'>>>;

/** The submitted value of one choice. */
export type ValueOfChoice<C> = C extends { readonly value: infer V } ? V : C;

export function text<const N extends string, const P extends Pipe<'text', string> = []>(
  name: N,
  pipe?: P,
): Value<TextField, N, string, P> {
  return apply({ type: 'text', name }, pipe);
}

/** A finite number. */
export function number<const N extends string, const P extends Pipe<'number', number> = []>(
  name: N,
  pipe?: P,
): Value<NumberField, N, number, P> {
  return apply({ type: 'number', name }, pipe);
}

/** `true` or `false`; `false` is a value, not empty. */
export function boolean<const N extends string, const P extends Pipe<'boolean', boolean> = []>(
  name: N,
  pipe?: P,
): Value<BooleanField, N, boolean, P> {
  return apply({ type: 'boolean', name }, pipe);
}

/** A calendar date as a `YYYY-MM-DD` string. */
export function date<const N extends string, const P extends Pipe<'date', string> = []>(
  name: N,
  pipe?: P,
): Value<DateField, N, string, P> {
  return apply({ type: 'date', name }, pipe);
}

/** One value from `choices`: each a string or number, or `{ value, label? }`. */
export function choice<
  const N extends string,
  const C extends readonly Choice[],
  const P extends Pipe<'choice', ValueOfChoice<C[number]>> = [],
>(name: N, choices: C, pipe?: P): Value<ChoiceField, N, ValueOfChoice<C[number]>, P> {
  return apply({ type: 'choice', name, choices }, pipe);
}

/** Any number of distinct values from `choices`. */
export function multiChoice<
  const N extends string,
  const C extends readonly Choice[],
  const P extends Pipe<'multi_choice', readonly ValueOfChoice<C[number]>[]> = [],
>(name: N, choices: C, pipe?: P): Value<MultiChoiceField, N, ValueOfChoice<C[number]>[], P> {
  return apply({ type: 'multi_choice', name, choices }, pipe);
}

/** Nested data: the values of `components` under `name`, always present, as `{}` at least. */
export function object<
  const N extends string,
  const C extends readonly Child[],
  const P extends Pipe<'object'> = [],
>(
  name: N,
  components: C,
  pipe?: P,
): ObjectField & Typed<GroupInfo<N, C, false, HasEffect<P, 'inactive'>>> {
  return apply({ type: 'object', name }, pipe, { components });
}

/** A list of rows, each built from the template `components`; always present, as `[]` at least. */
export function repeater<
  const N extends string,
  const C extends readonly Child[],
  const P extends Pipe<'repeater'> = [],
>(
  name: N,
  components: C,
  pipe?: P,
): RepeaterField & Typed<GroupInfo<N, C, true, HasEffect<P, 'inactive'>>> {
  return apply({ type: 'repeater', name }, pipe, { components });
}

type Layout<TNode, C extends readonly Child[], P extends AnyPipe> = TNode &
  Typed<LayoutInfo<C, HasEffect<P, 'inactive'>>>;

/** A group of Components, optionally labelled. Adds no data path. */
export function section<const C extends readonly Child[], const P extends Pipe<'section'> = []>(
  components: C,
  pipe?: P,
): Layout<SectionLayout, C, P>;
export function section<const C extends readonly Child[], const P extends Pipe<'section'> = []>(
  label: string,
  components: C,
  pipe?: P,
): Layout<SectionLayout, C, P>;
export function section(
  ...args: [Child[], Pipe<'section'>?] | [string, Child[], Pipe<'section'>?]
): SectionLayout {
  if (typeof args[0] === 'string') {
    const [label, components, pipe] = args as [string, Child[], Pipe<'section'>?];
    return apply({ type: 'section', label }, pipe, { components });
  }
  const [components, pipe] = args as [Child[], Pipe<'section'>?];
  return apply({ type: 'section' }, pipe, { components });
}

/** A `section` with no label that lays out `components` in `count` grid columns. */
export function grid<const C extends readonly Child[], const P extends Pipe<'section'> = []>(
  count: number,
  components: C,
  pipe?: P,
): Layout<SectionLayout, C, P> {
  return apply({ type: 'section', columns: count }, pipe, { components });
}

/** A set of Tabs. Only one is shown, but every Tab is validated. */
export function tabs<const C extends readonly TabLayout[], const P extends Pipe<'tabs'> = []>(
  components: C,
  pipe?: P,
): Layout<TabsLayout, C, P> {
  return apply({ type: 'tabs' }, pipe, { components });
}

/** One Tab, directly inside `tabs`. Adds no data path. */
export function tab<const C extends readonly Child[], const P extends Pipe<'tab'> = []>(
  label: string,
  components: C,
  pipe?: P,
): Layout<TabLayout, C, P> {
  return apply({ type: 'tab', label }, pipe, { components });
}

/** Fixed plain text, never read as HTML or Markdown. */
export function content(text: string, pipe?: Pipe<'content'>): ContentNode {
  return apply({ type: 'content', text }, pipe);
}

/**
 * Checks the built Components exactly as a JSON Definition is checked, and
 * returns the Definition as plain, frozen data. `compile` infers its output
 * type from it.
 *
 * `options` lists the custom Field Types and Rules the Components use; pass
 * the same to `compile`.
 *
 * @throws {DefinitionError} with every error as `{message, path}`, such as a
 * Condition that reads a Field that does not exist.
 * @throws {TypeError} for invalid `options`, such as a name registered twice.
 */
export function form<const C extends readonly Child[]>(
  components: C,
  options?: LoadOptions,
): TypedDefinition<ShapeOf<C>> {
  return loadDefinition({ version: DEFINITION_VERSION, components }, registryOf(options));
}
