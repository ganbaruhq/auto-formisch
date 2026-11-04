import {
  hasDataScope,
  isLayout,
  type Component,
  type ContentNode,
  type FieldNode,
  type FormDefinition,
  type FormError,
  type PathKey,
} from '@auto-formisch/core';
import { AutoFormError } from './AutoFormError';
import type { FieldOverride, Overrides, WidgetEntry } from './contracts';
import { HIDDEN_WIDGET } from './submission';

/** A Field or Content node, after `overrides`, and the Widget map entry that presents it. */
export interface ResolvedWidget<N extends FieldNode | ContentNode = FieldNode | ContentNode> {
  readonly node: N;
  readonly entry: WidgetEntry;
}

/** Finds the resolved Widget of a node of the form's Definition. */
export type WidgetResolver = <N extends FieldNode | ContentNode>(node: N) => ResolvedWidget<N>;

/** One Field or Content of the tree, where it sits in the Definition and in the data. */
interface Located {
  readonly node: FieldNode | ContentNode;
  readonly location: readonly PathKey[];
  /** The data path without Repeater indices, as `overrides` names it; none for Content. */
  readonly path?: string;
}

const OVERRIDE_KEYS: readonly string[] = [
  'widget',
  'label',
  'description',
  'placeholder',
] satisfies (keyof FieldOverride)[];

/**
 * Applies `overrides` and resolves the Widget of every Field and Content in
 * the tree, rendered or not, so that a Component shown later can't fail then.
 *
 * @throws {AutoFormError} with every unknown override path or key, unknown
 * Widget name and Widget whose `appliesTo` leaves out the node's type.
 */
export function resolveWidgets(
  definition: FormDefinition,
  widgets: Readonly<Record<string, WidgetEntry>>,
  overrides: Overrides = {},
): WidgetResolver {
  const errors: FormError[] = [];
  const located =
    definition.pages !== undefined
      ? locate(definition.pages, ['pages'], [])
      : locate(definition.components, ['components'], []);
  const paths = new Set(located.flatMap(({ path }) => (path === undefined ? [] : [path])));

  for (const [path, override] of Object.entries(overrides)) {
    const at = ['overrides', path];
    if (!paths.has(path)) {
      errors.push({ message: `No Field at "${path}"`, path: at });
    } else if (typeof override !== 'object' || override === null || Array.isArray(override)) {
      errors.push({ message: 'Expected an object', path: at });
    } else {
      for (const [key, value] of Object.entries(override)) {
        if (!OVERRIDE_KEYS.includes(key)) {
          errors.push({ message: `Unknown key "${key}"`, path: [...at, key] });
        } else if (value !== undefined && typeof value !== 'string') {
          errors.push({ message: 'Expected a string', path: [...at, key] });
        }
      }
    }
  }

  const resolved = new WeakMap<object, ResolvedWidget>();
  for (const { node, location, path } of located) {
    const override =
      (path !== undefined && Object.hasOwn(overrides, path) && overrides[path]) || {};
    const name = override.widget ?? node.widget ?? node.type;
    const at =
      override.widget !== undefined
        ? ['overrides', path!, 'widget']
        : [...location, node.widget === undefined ? 'type' : 'widget'];
    const entry = Object.hasOwn(widgets, name) ? widgets[name] : undefined;
    if (entry === undefined) {
      const of = path === undefined ? 'a Content Component' : `the Field at "${path}"`;
      errors.push({ message: `No Widget "${name}" for ${of}`, path: at });
    } else if (
      (entry.appliesTo !== undefined && !entry.appliesTo.includes(node.type)) ||
      // Its errors go to the general region, which only a value Field's do.
      (name === HIDDEN_WIDGET && !isValueField(node))
    ) {
      const to =
        path === undefined ? 'a Content Component' : `the "${node.type}" Field at "${path}"`;
      errors.push({ message: `Widget "${name}" does not apply to ${to}`, path: at });
    } else {
      resolved.set(node, { node: applied(node, override), entry });
    }
  }

  if (errors.length > 0) throw new AutoFormError(errors);
  return <N extends FieldNode | ContentNode>(node: N) => {
    const widget = resolved.get(node);
    // Every node of the Definition was resolved above.
    if (widget === undefined) throw new Error(`No resolved Widget for a "${node.type}" node`);
    return widget as ResolvedWidget<N>;
  };
}

const isValueField = (node: FieldNode | ContentNode): boolean =>
  !hasDataScope(node) && node.type !== 'content';

/** Every Field and Content in Definition order, including Repeater templates. */
function locate(
  components: readonly Component[],
  at: readonly PathKey[],
  scope: readonly string[],
): Located[] {
  return components.flatMap((node, index): Located[] => {
    const location = [...at, index];
    if (isLayout(node)) return locate(node.components, [...location, 'components'], scope);
    if (node.type === 'content') return [{ node, location }];
    const path = [...scope, node.name];
    const self = { node, location, path: path.join('.') };
    if (!hasDataScope(node)) return [self];
    return [self, ...locate(node.components, [...location, 'components'], path)];
  });
}

/** The node with the override's keys that are set. Validation never reads the copy. */
function applied<N extends FieldNode | ContentNode>(node: N, override: FieldOverride): N {
  const set = Object.entries(override).filter(([, value]) => value !== undefined);
  return set.length === 0 ? node : { ...node, ...Object.fromEntries(set) };
}
