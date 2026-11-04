import type { Component, FieldNode } from './definition';

/**
 * The Fields of one data scope, in Definition order. Layouts add no path, so
 * they flatten; an `object` or `repeater` is one Field whose children are a
 * scope of their own.
 */
export function fieldsIn(components: readonly Component[]): FieldNode[] {
  return components.flatMap((component) => {
    switch (component.type) {
      case 'section':
      case 'tabs':
      case 'tab':
      case 'page':
        // Missing only in a Definition the loader is about to reject.
        return fieldsIn(component.components ?? []);
      case 'content':
        return [];
      default:
        return [component];
    }
  });
}

/** A plain object, as one data scope's value: not `null` and not an array. */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
