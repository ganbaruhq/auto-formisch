// Style (a): Filament-faithful classes. THROWAWAY prototype for AF-5.
import type { Condition, FormDefinition, InferShape, Node } from './shared';

// ---------------- library side ----------------

export abstract class Component {
  abstract toJSON(): Node;
}

export abstract class Field<N extends string, V> extends Component {
  // Base flags are `boolean` so a later `& { required: true }` narrows instead of collapsing to never.
  declare readonly '~types': { name: N; value: V; required: boolean; conditional: boolean };
  protected node: Node;
  protected constructor(type: string, name: N) {
    super();
    this.node = { type, name, rules: [] };
  }
  label(label: string): this {
    this.node.label = label;
    return this;
  }
  // `this` cannot change its own generic arguments, so type-state is carried by
  // intersecting a narrower phantom: Filament's chain survives, at a type-level cost.
  required(): this & { '~types': { required: true } } {
    this.node.required = true;
    return this as never;
  }
  // Filament takes a closure here; a closure cannot be serialized, so the
  // argument must become a data Condition.
  visible(condition: Condition): this & { '~types': { conditional: true } } {
    this.node.visible = condition;
    return this as never;
  }
  toJSON(): Node {
    return JSON.parse(JSON.stringify(this.node)) as Node;
  }
}

export class TextInput<N extends string> extends Field<N, string> {
  static make<const N extends string>(name: N) {
    return new TextInput('text', name);
  }
  email(message?: string): this {
    this.node.rules!.push({ type: 'email', ...(message ? { message } : {}) });
    return this;
  }
  minLength(requirement: number): this {
    this.node.rules!.push({ type: 'min_length', requirement });
    return this;
  }
  // ...maxLength(), regex(), url(), uuid(), password(), tel(): every method ships
  // in the bundle whether or not any form uses it.
}

export class Select<N extends string> extends Field<N, string> {
  static make<const N extends string>(name: N) {
    return new Select('select', name);
  }
  options<const O extends readonly string[]>(options: O): this & { '~types': { value: O[number] } } {
    this.node.options = options;
    return this as never;
  }
}

export class Toggle<N extends string> extends Field<N, boolean> {
  // A toggle always submits true/false, so its key is always present.
  declare readonly '~types': { name: N; value: boolean; required: true; conditional: false };
  static make<const N extends string>(name: N) {
    return new Toggle('toggle', name);
  }
}

export class Repeater<N extends string> extends Field<N, unknown> {
  static make<const N extends string>(name: N) {
    return new Repeater('repeater', name);
  }
  schema<const C extends readonly Component[]>(
    children: C,
  ): this & { '~types': { value: InferShape<C>[]; required: true } } {
    this.node.children = children.map((c) => c.toJSON());
    return this as never;
  }
}

export abstract class Layout<C extends readonly Component[]> extends Component {
  declare readonly '~types': { children: C };
  protected node: Node;
  protected constructor(node: Node) {
    super();
    this.node = node;
  }
  // Each Layout subclass must re-declare schema() to change its own generic.
  toJSON(): Node {
    return JSON.parse(JSON.stringify(this.node)) as Node;
  }
}

export class Section<C extends readonly Component[] = []> extends Layout<C> {
  static make(label: string) {
    return new Section({ type: 'section', label });
  }
  schema<const C2 extends readonly Component[]>(children: C2): Section<C2> {
    return new Section<C2>({ ...this.node, children: children.map((c) => c.toJSON()) });
  }
}

export class Grid<C extends readonly Component[] = []> extends Layout<C> {
  static make(columns: number) {
    return new Grid({ type: 'grid', columns });
  }
  schema<const C2 extends readonly Component[]>(children: C2): Grid<C2> {
    return new Grid<C2>({ ...this.node, children: children.map((c) => c.toJSON()) });
  }
}

export class Form<C extends readonly Component[]> {
  private constructor(private children: C) {}
  static make<const C extends readonly Component[]>(children: C) {
    return new Form(children);
  }
  declare readonly '~output': InferShape<C>;
  toDefinition(): FormDefinition {
    return { version: 1, elements: this.children.map((c) => c.toJSON()) };
  }
}

// Conditions: a tiny serializable helper, mirroring Filament's Get-closure ergonomics.
export const when = (field: string) => ({
  eq: (value: unknown): Condition => ({ field, op: 'eq', value }),
  in: (value: readonly unknown[]): Condition => ({ field, op: 'in', value }),
});

// Custom field type (AF-8 input): subclass, and re-declare a static make()
// per class because statics cannot see the class's own type parameters.
export class ColorPicker<N extends string> extends Field<N, `#${string}`> {
  static make<const N extends string>(name: N) {
    return new ColorPicker('color', name);
  }
  swatches(colors: readonly string[]): this {
    this.node.options = colors;
    return this;
  }
}
