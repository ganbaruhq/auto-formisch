import type { Component, FieldNode, ObjectField, RepeaterField } from './definition';
import { fieldsIn } from './fields';

/**
 * One data scope of a Definition: the root, an `object`'s Components, or the
 * template of a Repeater's rows.
 */
export interface DataScope {
  /** The Fields of this scope by `name`, through Layouts. */
  readonly fields: ReadonlyMap<string, FieldNode>;
  /** The Field whose Components make this scope; none at the root. */
  readonly owner?: ObjectField | RepeaterField;
  readonly parent?: DataScope;
}

/** Where one Component sits. */
export interface Placement {
  /** The Component it sits directly inside: a Layout, `object` or Repeater. */
  readonly parent?: Component;
  /** The data scope its own Conditions read from. */
  readonly scope: DataScope;
}

/** The parents and data scopes of every Component of one Definition. */
export interface FormTree {
  /** Every Component, parents before children, in Definition order. */
  readonly components: readonly Component[];
  placement(component: Component): Placement | undefined;
  /** The data scope made by the Components of an `object` or Repeater. */
  scopeOf(field: ObjectField | RepeaterField): DataScope | undefined;
}

/** The data path segments a scope adds: a name, and an index for a row. */
export const segmentsOf = (scope: DataScope): number =>
  scope.owner === undefined ? 0 : scope.owner.type === 'repeater' ? 2 : 1;

export function treeOf(components: readonly Component[]): FormTree {
  const all: Component[] = [];
  const placements = new Map<Component, Placement>();
  const scopes = new Map<ObjectField | RepeaterField, DataScope>();

  const scopeFor = (
    list: readonly Component[],
    owner?: ObjectField | RepeaterField,
    parent?: DataScope,
  ): DataScope => ({
    fields: new Map(fieldsIn(list).map((field) => [field.name, field])),
    owner,
    parent,
  });

  const visit = (list: readonly Component[], scope: DataScope, parent?: Component) => {
    for (const component of list) {
      all.push(component);
      placements.set(component, { parent, scope });
      // The loader also builds a tree for a Definition it is about to reject,
      // where `components` may be missing.
      const children = ('components' in component && component.components) || [];
      if (component.type === 'object' || component.type === 'repeater') {
        const inner = scopeFor(children, component, scope);
        scopes.set(component, inner);
        visit(children, inner, component);
      } else {
        visit(children, scope, component);
      }
    }
  };
  visit(components, scopeFor(components));

  return {
    components: all,
    placement: (component) => placements.get(component),
    scopeOf: (field) => scopes.get(field),
  };
}

/**
 * A resolved Condition reference: the Field it reads, and how to find its
 * scope's data path from the data path of the scope that holds the Condition.
 */
export interface Reference {
  readonly target: FieldNode;
  /** Data path segments to drop for the `../` steps. */
  readonly drop: number;
  /** The `object` names to go through before the target. */
  readonly via: readonly string[];
}

/** Resolves `reference` from `scope`, or says why it cannot be resolved. */
export function resolve(
  tree: FormTree,
  reference: string,
  scope: DataScope,
): Reference | { readonly error: string } {
  let rest = reference;
  let current = scope;
  let drop = 0;
  while (rest.startsWith('../')) {
    rest = rest.slice(3);
    if (current.parent === undefined) {
      return { error: `"${reference}" goes above the root` };
    }
    drop += segmentsOf(current);
    current = current.parent;
  }
  const names = rest.split('.');
  const via: string[] = [];
  for (const [index, name] of names.entries()) {
    const field = current.fields.get(name);
    const here = names.slice(0, index + 1).join('.');
    if (field === undefined) return { error: `No Field "${here}"` };
    if (index === names.length - 1) return { target: field, drop, via };
    if (field.type === 'repeater') {
      return { error: `"${reference}" goes inside the rows of the Repeater "${here}"` };
    }
    if (field.type !== 'object') return { error: `"${here}" has no Fields` };
    via.push(name);
    current = tree.scopeOf(field)!;
  }
  // `names` is never empty.
  return { error: `No Field "${reference}"` };
}
