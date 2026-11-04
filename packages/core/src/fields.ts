import { isLayout, type Component, type FieldNode } from './definition';

/**
 * For a Renderer: the Fields of one data scope, in Definition order. Layouts
 * add no path, so they flatten; an `object` or `repeater` is one Field whose
 * children are a scope of their own.
 */
export function fieldsIn(components: readonly Component[]): FieldNode[] {
  return components.flatMap((component) => {
    // `components` is missing only in a Definition the loader is about to reject.
    if (isLayout(component)) return fieldsIn(component.components ?? []);
    return component.type === 'content' ? [] : [component];
  });
}

/** A plain object, as one data scope's value: not `null` and not an array. */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
