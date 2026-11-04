import { createContext } from 'react';
import { getErrors, getInput, setErrors } from '@formisch/react';
import type {
  CompiledForm,
  Component,
  ConditionState,
  FormError,
  PathKey,
  RepeaterField,
  ValueField,
} from '@auto-formisch/core';
import type { WidgetResolver } from './resolve';
import type { AutoFormStore } from './useAutoForm';

type Path = readonly PathKey[];

/** What `onSubmit` may return: errors found after validation, such as by the server. */
export type SubmitResult = void | { readonly errors?: readonly FormError[] };

/** The Field a failed submit moves focus to. Each request is a new object. */
export interface FocusTarget {
  readonly path: Path;
}

/** The latest focus request, which the Tabs on its way open. */
export const FocusTargetContext = createContext<FocusTarget | null>(null);

/** The element that takes a Field's focus, by `keyOf` its data path. */
export type FocusElements = Map<string, HTMLElement>;

/** A key that tells `0` from `'0'`, so a path matches exactly. */
export const keyOf = (path: Path): string => JSON.stringify(path);

/** A Field that shows errors: a value Field or a Repeater. */
interface Shown {
  readonly path: Path;
  readonly node: ValueField | RepeaterField;
  /**
   * Presented by the `hidden` Widget, so it has no Field Wrapper and its
   * errors show in the general error region instead.
   */
  readonly hidden: boolean;
  /** Disabled, itself or through an `object` or Repeater around it: Inactive. */
  readonly disabled: boolean;
}

/** Whether a value Field is presented by the `hidden` Widget, after `overrides`. */
export const presentedHidden =
  (widgetOf: WidgetResolver) =>
  (node: ValueField): boolean =>
    isHiddenWidget(widgetOf(node).node);

/** The node, after `overrides`, names the `hidden` Widget. */
export const isHiddenWidget = (node: ValueField): boolean => node.widget === HIDDEN_WIDGET;

/** The Widget that keeps a value with no UI and no Field Wrapper. */
export const HIDDEN_WIDGET = 'hidden';

/**
 * The Fields that show errors, in Definition order, with each Repeater's rows
 * in their current order. Hidden Components are left out, Fields in inactive
 * Tabs are not: a submit opens their Tab. Fields presented by the `hidden`
 * Widget are marked.
 */
export function shownFields(
  components: readonly Component[],
  state: ConditionState,
  input: unknown,
  isHidden: (node: ValueField) => boolean,
) {
  const shown: Shown[] = [];
  const walk = (list: readonly Component[], scope: Path) => {
    for (const node of list) {
      if (!state.isVisible(node, scope)) continue;
      switch (node.type) {
        case 'content':
          break;
        case 'object':
          walk(node.components, [...scope, node.name]);
          break;
        case 'repeater': {
          const path = [...scope, node.name];
          shown.push({ path, node, hidden: false, disabled: state.isDisabled(node, scope) });
          const rows = valueAt(input, path);
          if (Array.isArray(rows))
            rows.forEach((_, index) => walk(node.components, [...path, index]));
          break;
        }
        default:
          // Any other Component with `components` is a Layout, which adds no path.
          if ('components' in node) walk(node.components, scope);
          else {
            shown.push({
              path: [...scope, node.name],
              node,
              hidden: isHidden(node),
              disabled: state.isDisabled(node, scope),
            });
          }
      }
    }
  };
  walk(components, []);
  return shown;
}

const valueAt = (input: unknown, path: Path): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      typeof value === 'object' && value !== null
        ? (value as Record<PathKey, unknown>)[key]
        : undefined,
    input,
  );

/**
 * The shown, active Fields that have a Field Wrapper, for the store's current
 * input: the ones that can show an error of their own (AF-10).
 */
const currentFields = (compiled: CompiledForm, store: AutoFormStore, widgetOf: WidgetResolver) => {
  const input = getInput(store);
  const state = compiled.conditions.evaluate(input);
  const { definition } = compiled;
  // A Wizard's Pages are Layouts: a Field on another Page counts as shown.
  return shownFields(
    definition.pages ?? definition.components,
    state,
    input,
    presentedHidden(widgetOf),
  ).filter((field) => !field.hidden && !field.disabled);
};

/**
 * Puts errors returned by `onSubmit` on the shown Field their path names.
 * Every other error, such as one for a hidden or disabled (Inactive) Field, a
 * Field presented by the `hidden` Widget, a Layout, a row that doesn't exist
 * or no path at all,
 * goes to the form's general error region: Formisch would swallow it, and a
 * Field with no Field Wrapper can't show it.
 */
export function placeErrors(
  compiled: CompiledForm,
  store: AutoFormStore,
  widgetOf: WidgetResolver,
  errors: readonly FormError[],
): void {
  const fields = new Map(
    currentFields(compiled, store, widgetOf).map((field) => [keyOf(field.path), field]),
  );
  const byField = new Map<string, { path: Path; messages: string[] }>();
  const general: string[] = [];
  for (const error of errors) {
    const field = Array.isArray(error.path) ? fields.get(keyOf(error.path)) : undefined;
    if (field === undefined) {
      general.push(error.message);
      continue;
    }
    const key = keyOf(field.path);
    const entry = byField.get(key) ?? { path: field.path, messages: [] };
    entry.messages.push(error.message);
    byField.set(key, entry);
  }
  for (const { path, messages } of byField.values()) {
    // Paths come from a JSON Definition, so they cannot be typed against the schema.
    setErrors(store, { path, errors: messages } as never);
  }
  if (general.length > 0) setErrors(store, { errors: general as [string, ...string[]] });
}

/**
 * The first Field in Definition order that has errors and an element that can
 * take focus, if there is one.
 */
export function firstErrorTarget(
  compiled: CompiledForm,
  store: AutoFormStore,
  widgetOf: WidgetResolver,
  elements: FocusElements,
): FocusTarget | null {
  for (const { path } of currentFields(compiled, store, widgetOf)) {
    if ((getErrors(store, { path } as never) ?? []).length === 0) continue;
    const element = elements.get(keyOf(path));
    if (element !== undefined && element.isConnected && !element.matches(':disabled')) {
      return { path };
    }
  }
  return null;
}

/** The names of the Fields in `components`, looking through Layouts only. */
export function namesIn(components: readonly Component[]): Set<string> {
  const names = new Set<string>();
  const walk = (list: readonly Component[]) => {
    for (const node of list) {
      if ('name' in node) names.add(node.name);
      else if ('components' in node) walk(node.components);
    }
  };
  walk(components);
  return names;
}

/** Whether `path` names a Field below `scope` whose top-level name is in `names`. */
export function leadsInto(path: Path, scope: Path, names: ReadonlySet<string>): boolean {
  if (path.length <= scope.length) return false;
  if (!scope.every((key, index) => path[index] === key)) return false;
  const next = path[scope.length];
  return typeof next === 'string' && names.has(next);
}
