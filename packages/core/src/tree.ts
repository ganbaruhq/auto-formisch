import type { Component, FieldNode, ObjectField, RepeaterField } from './definition';
import type { PathKey } from './errors';
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
  /** The data scope of the root Components. */
  readonly root: DataScope;
  /** Every Component, parents before children, in Definition order. */
  readonly components: readonly Component[];
  placement(component: Component): Placement | undefined;
  /** The data scope made by the Components of an `object` or Repeater. */
  scopeOf(field: ObjectField | RepeaterField): DataScope | undefined;
}

/** How many data path segments a scope adds: 1 for a name, 2 for a name and a row index. */
export const segmentCount = (scope: DataScope): number =>
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
  const root = scopeFor(components);
  visit(components, root);

  return {
    root,
    components: all,
    placement: (component) => placements.get(component),
    scopeOf: (field) => scopes.get(field),
  };
}

/** A Condition reference: `../` steps, then one or more names joined by `.`. No index. */
export const REFERENCE_SYNTAX = 'A reference is "../" steps, then names joined by "."';
export const REFERENCE = /^(?:\.\.\/)*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * The data scope at a data path such as `['items', 2, 'address']`: the root,
 * then into `object`s by name and into Repeater rows by name and index.
 */
export function scopeAt(tree: FormTree, path: readonly PathKey[]): DataScope | undefined {
  let scope: DataScope | undefined = tree.root;
  for (let index = 0; scope !== undefined && index < path.length; index++) {
    const field =
      typeof path[index] === 'string' ? scope.fields.get(path[index] as string) : undefined;
    if (field?.type === 'object') scope = tree.scopeOf(field);
    else if (field?.type === 'repeater' && typeof path[index + 1] === 'number') {
      scope = tree.scopeOf(field);
      index++;
    } else scope = undefined;
  }
  return scope;
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
    drop += segmentCount(current);
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
